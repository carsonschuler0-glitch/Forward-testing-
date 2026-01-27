import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { ForwardTestRunner } from '../forwardTest/runner';
import { ForwardTestAnalysis, ActiveMarket } from '../forwardTest/types';
import { arbitrageEngine } from '../arbitrage/engine';
import { MarketData, ArbitrageOpportunity } from '../arbitrage/types';
import { paperTradingExecutor, PaperTrade, PaperTradingStats } from '../execution/paperTradingExecutor';

/**
 * Web server for Forward Test Dashboard
 */
export class DashboardServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private runner: ForwardTestRunner;
  private port: number;
  private arbitrageOpportunities: ArbitrageOpportunity[] = [];

  constructor(port: number = 3000) {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server);
    this.runner = new ForwardTestRunner();
    this.port = port;

    this.setupRoutes();
    this.setupSocketIO();
  }

  private setupRoutes(): void {
    // Serve static files
    this.app.use(express.static(path.join(__dirname, '../../public')));

    // Health check for Railway
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // API endpoints
    this.app.get('/api/status', (req, res) => {
      res.json({
        status: 'running',
        uptime: process.uptime(),
        markets: this.runner['activeMarkets'].size,
        trades: this.runner['allTrades'].length,
      });
    });

    // Serve dashboard
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../../public/index.html'));
    });
  }

  private setupSocketIO(): void {
    this.io.on('connection', (socket) => {
      console.log('📱 Client connected:', socket.id);

      // Send initial data with full analysis
      const initialAnalysis = this.runner['allTrades'].length > 0
        ? this.runner['analyzer'].generateAnalysis(
            this.runner['allTrades'],
            this.runner['activeMarkets'],
            this.runner['snapshots']
          )
        : null;

      socket.emit('update', {
        timestamp: Date.now(),
        newTrades: 0,
        analysis: initialAnalysis,
        markets: this.runner['activeMarkets'].size,
        totalTrades: this.runner['allTrades'].length,
        arbitrage: this.arbitrageOpportunities,
        paperTrading: {
          balance: paperTradingExecutor.getBalance(),
          pnl: paperTradingExecutor.getPnL(),
          stats: paperTradingExecutor.getStats(),
          recentTrades: paperTradingExecutor.getRecentTrades(10),
        },
      });

      socket.on('disconnect', () => {
        console.log('📱 Client disconnected:', socket.id);
      });
    });
  }

  /**
   * Broadcast update to all connected clients
   */
  private broadcastUpdate(analysis: ForwardTestAnalysis, newTradesCount: number): void {
    this.io.emit('update', {
      timestamp: Date.now(),
      newTrades: newTradesCount,
      analysis,
      markets: this.runner['activeMarkets'].size,
      totalTrades: this.runner['allTrades'].length,
      arbitrage: this.arbitrageOpportunities,
      paperTrading: {
        balance: paperTradingExecutor.getBalance(),
        pnl: paperTradingExecutor.getPnL(),
        stats: paperTradingExecutor.getStats(),
        recentTrades: paperTradingExecutor.getRecentTrades(10),
      },
    });
  }

  /**
   * Start server and forward test runner
   */
  async start(): Promise<void> {
    // Start web server
    this.server.listen(this.port, () => {
      console.log(`\n🌐 Dashboard running at http://localhost:${this.port}`);
      console.log(`📊 Real-time updates via WebSocket\n`);
    });

    // Initialize forward test with more markets
    await this.runner.initialize(500); // Track up to 500 markets

    // Start polling loop
    this.startPollingLoop();
  }

  private async startPollingLoop(): Promise<void> {
    const pollInterval = 60000; // 60 seconds
    let iteration = 0;

    setInterval(async () => {
      iteration++;
      console.log(`\n--- Poll #${iteration} at ${new Date().toLocaleTimeString()} ---`);

      // Refresh markets every 10 polls (10 minutes) to discover new ones
      if (iteration % 10 === 0) {
        await this.runner.refreshMarkets(300);
      }

      const beforeCount = this.runner['allTrades'].length;

      // Poll for new trades
      await this.runner.pollTrades();
      await this.runner.checkResolvedMarkets();

      const afterCount = this.runner['allTrades'].length;
      const newTrades = afterCount - beforeCount;

      // Run arbitrage detection
      await this.detectArbitrage();

      // Generate analysis
      const analysis = this.runner['analyzer'].generateAnalysis(
        this.runner['allTrades'],
        this.runner['activeMarkets'],
        this.runner['snapshots']
      );

      // Broadcast to all clients
      this.broadcastUpdate(analysis, newTrades);

      // Print to console every 10 polls
      if (iteration % 10 === 0) {
        this.runner.printAnalysis();
      }
    }, pollInterval);
  }

  /**
   * Run arbitrage detection on active markets
   */
  private async detectArbitrage(): Promise<void> {
    try {
      const activeMarkets = this.runner['activeMarkets'] as Map<string, ActiveMarket>;

      if (activeMarkets.size === 0) return;

      // Convert to MarketData format
      const markets: MarketData[] = Array.from(activeMarkets.values()).map(this.convertToMarketData);

      // Run detection
      const result = await arbitrageEngine.detect(markets);

      // Get new opportunities for paper trading
      const newOpportunities = arbitrageEngine.getNewOpportunities(result);

      // Get all current opportunities (not just new ones)
      this.arbitrageOpportunities = result.opportunities;

      if (result.totalOpportunities > 0) {
        console.log(`⚡ Arbitrage: ${result.totalOpportunities} opportunities - MO: ${result.byType.multiOutcome}, CM: ${result.byType.crossMarket}, RM: ${result.byType.relatedMarket}`);
      }

      // Execute paper trades for new opportunities
      for (const opportunity of newOpportunities) {
        // Only trade opportunities above minimum profit threshold
        if (opportunity.profitPercent >= 0.5 && opportunity.confidenceScore >= 0.6) {
          await paperTradingExecutor.execute(opportunity);
        }
      }

      // Expire old opportunities
      await arbitrageEngine.expireOldOpportunities();

    } catch (err) {
      console.error('Arbitrage detection error:', err);
    }
  }

  /**
   * Convert ActiveMarket to MarketData format
   */
  private convertToMarketData(market: ActiveMarket): MarketData {
    return {
      id: market.id,
      question: market.question,
      outcomes: market.outcomes,
      currentPrices: market.currentPrices,
      liquidity: market.liquidity,
      volume: market.volume,
      category: market.category,
      createdAt: market.createdAt,
      endDate: market.endDate,
      negRisk: market.negRisk,
      negRiskMarketId: market.negRiskMarketId,
      eventSlug: market.eventSlug,
      conditionId: market.conditionId,
    };
  }
}
