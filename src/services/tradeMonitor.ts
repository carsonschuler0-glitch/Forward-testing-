import { PolymarketClient } from './polymarketClient';
import { TraderAnalyzer } from './traderAnalyzer';
import { TelegramNotifier } from './telegramNotifier';
import { WebServer } from './webServer';
import { Trade, Market, TraderStats, AlertData } from '../types';
import { config } from '../config';

export class TradeMonitor {
  private polymarketClient: PolymarketClient;
  private traderAnalyzer: TraderAnalyzer;
  private telegramNotifier: TelegramNotifier;
  private webServer: WebServer;
  private marketCache: Map<string, Market> = new Map();
  private isRunning: boolean = false;
  private processedTradeIds: Set<string> = new Set();
  private statsUpdateInterval: NodeJS.Timeout | null = null;

  constructor(webServer: WebServer) {
    this.polymarketClient = new PolymarketClient(
      config.polymarketApiUrl,
      config.polymarketGammaApi
    );
    this.traderAnalyzer = new TraderAnalyzer(config.topTraderPercentile);
    this.telegramNotifier = new TelegramNotifier(
      config.telegramBotToken,
      config.telegramChatId
    );
    this.webServer = webServer;
  }

  async start(): Promise<void> {
    console.log('🚀 Starting Polymarket Trade Monitor...\n');

    this.webServer.emitBotStatus('starting', 'Initializing bot...');

    // Test Telegram connection
    const telegramOk = await this.telegramNotifier.testConnection();
    if (!telegramOk) {
      this.webServer.emitBotStatus('error', 'Failed to connect to Telegram');
      throw new Error('Failed to connect to Telegram. Check your bot token and chat ID.');
    }

    console.log('✅ Telegram connection established');

    // Load initial market data
    await this.loadMarkets();
    console.log(`✅ Loaded ${this.marketCache.size} active markets`);

    // Send initial data to web clients
    this.webServer.emitMarkets(Array.from(this.marketCache.values()));

    // Send startup notification
    await this.telegramNotifier.sendStartupMessage();

    // Start monitoring loop
    this.isRunning = true;
    this.webServer.emitBotStatus('running', 'Monitoring Polymarket trades');
    console.log(`\n👀 Monitoring trades every ${config.pollIntervalMs / 1000}s...\n`);

    // Update stats periodically
    this.statsUpdateInterval = setInterval(() => {
      this.updateWebStats();
    }, 5000);

    this.monitorLoop();
  }

  stop(): void {
    this.isRunning = false;
    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
    }
    console.log('🛑 Stopping trade monitor...');
  }

  private updateWebStats(): void {
    const stats = this.getStats();
    this.webServer.emitStats(stats);
    this.webServer.emitTraders(this.traderAnalyzer.getAllTrackedTraders());
  }

  private async monitorLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.checkForNewTrades();
        await this.sleep(config.pollIntervalMs);
      } catch (error) {
        console.error('Error in monitor loop:', error);
        await this.telegramNotifier.sendErrorNotification(
          `Monitor loop error: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        await this.sleep(config.pollIntervalMs * 2); // Back off on error
      }
    }
  }

  private async checkForNewTrades(): Promise<void> {
    const trades = await this.polymarketClient.getRecentTrades(50);

    for (const trade of trades) {
      // Skip if already processed
      if (this.processedTradeIds.has(trade.id)) {
        continue;
      }

      this.processedTradeIds.add(trade.id);

      // Clean up old trade IDs (keep last 1000)
      if (this.processedTradeIds.size > 1000) {
        const toDelete = Array.from(this.processedTradeIds).slice(0, 100);
        toDelete.forEach(id => this.processedTradeIds.delete(id));
      }

      // Send trade to web interface
      this.webServer.emitTrade(trade);

      await this.processTrade(trade);
    }

    // Periodically refresh market data
    if (Math.random() < 0.1) { // 10% chance each poll
      await this.loadMarkets();
    }
  }

  private async processTrade(trade: Trade): Promise<void> {
    // Get market data
    let market = this.marketCache.get(trade.market);
    if (!market) {
      const fetchedMarket = await this.polymarketClient.getMarketById(trade.market);
      if (!fetchedMarket) return;
      market = fetchedMarket;
      this.marketCache.set(trade.market, market);
    }

    // Calculate trade value
    const tradeValue = trade.price * trade.size;

    // Skip small trades
    if (tradeValue < config.minTradeSizeUsd) {
      return;
    }

    // Calculate liquidity impact
    const liquidityImpact = this.polymarketClient.calculateLiquidityImpact(
      tradeValue,
      market.liquidity
    );

    // Skip if impact is below threshold
    if (liquidityImpact < config.liquidityThresholdPercent) {
      return;
    }

    // Without API auth, we can't track individual traders
    // So we'll alert on high-volume markets with low liquidity
    // Create synthetic trader stats
    const traderStats: TraderStats = {
      address: trade.trader,
      totalVolume: tradeValue,
      totalTrades: 1,
      profitLoss: 0,
      roi: 0,
      lastTradeTimestamp: trade.timestamp,
      winRate: 50,
      averageTradeSize: tradeValue,
    };

    // Generate alert for high-volume, low-liquidity markets
    const reason = `Significant market activity detected: ${tradeValue.toFixed(2)} volume (${liquidityImpact.toFixed(1)}% of liquidity) in ${market.liquidity < 10000 ? 'low' : 'medium'} liquidity market.`;

    const alert: AlertData = {
      trade,
      market,
      traderStats,
      liquidityImpact,
      reason,
    };

    // Send alert to Telegram
    await this.telegramNotifier.sendAlert(alert);

    // Send alert to web interface
    this.webServer.emitAlert(alert);

    console.log(`🚨 ALERT: ${trade.trader.substring(0, 8)}... traded $${tradeValue.toFixed(2)} (${liquidityImpact.toFixed(1)}% impact) in "${market.question}"`);
  }

  private async fetchAndCacheTraderStats(address: string): Promise<TraderStats> {
    const trades = await this.polymarketClient.getTraderHistory(address, 100);

    if (trades.length === 0) {
      const emptyStats: TraderStats = {
        address,
        totalVolume: 0,
        totalTrades: 0,
        profitLoss: 0,
        roi: 0,
        lastTradeTimestamp: Date.now(),
        winRate: 0,
        averageTradeSize: 0,
      };
      this.traderAnalyzer.updateTraderStats(address, emptyStats);
      return emptyStats;
    }

    const { totalVolume, profitLoss, roi } = this.traderAnalyzer.calculateStats(trades);

    const stats: TraderStats = {
      address,
      totalVolume,
      totalTrades: trades.length,
      profitLoss,
      roi,
      lastTradeTimestamp: trades[0]?.timestamp || Date.now(),
      winRate: this.calculateWinRate(trades),
      averageTradeSize: totalVolume / trades.length,
    };

    this.traderAnalyzer.updateTraderStats(address, stats);
    return stats;
  }

  private calculateWinRate(trades: Trade[]): number {
    // Simplified win rate calculation
    // In reality, you'd need to track position outcomes
    const profitableTrades = trades.filter(t => t.price > 0.5).length;
    return trades.length > 0 ? (profitableTrades / trades.length) * 100 : 0;
  }

  private async loadMarkets(): Promise<void> {
    const markets = await this.polymarketClient.getMarkets(200);
    for (const market of markets) {
      this.marketCache.set(market.id, market);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats(): {
    marketsTracked: number;
    tradersTracked: number;
    processedTrades: number;
    topPercentileThreshold: number;
  } {
    return {
      marketsTracked: this.marketCache.size,
      tradersTracked: this.traderAnalyzer.getAllTrackedTraders().size,
      processedTrades: this.processedTradeIds.size,
      topPercentileThreshold: this.traderAnalyzer.getTopPercentileThreshold(),
    };
  }
}
