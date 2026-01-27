/**
 * Arbitrage Runner
 * Main entry point for the Polymarket arbitrage bot
 */

import { arbConfig, loadArbitrageConfig } from './config';
import { db } from './database/client';
import { arbitrageRepo } from './database/arbitrageRepository';
import { arbitrageEngine } from './arbitrage/engine';
import { MarketData, ArbitrageOpportunity } from './arbitrage/types';
import { simulationExecutor } from './execution/simulationExecutor';
import { ForwardTestDataCollector } from './forwardTest/dataCollector';
import { ActiveMarket } from './forwardTest/types';
import TelegramBot from 'node-telegram-bot-api';

class ArbitrageRunner {
  private dataCollector: ForwardTestDataCollector;
  private telegramBot: TelegramBot | null = null;
  private isRunning: boolean = false;
  private detectionInterval: NodeJS.Timeout | null = null;
  private stats = {
    cyclesRun: 0,
    opportunitiesFound: 0,
    executionsAttempted: 0,
    executionsSuccessful: 0,
    startTime: Date.now(),
  };

  constructor() {
    this.dataCollector = new ForwardTestDataCollector();

    // Initialize Telegram if configured
    if (arbConfig.telegram.enabled && arbConfig.telegram.botToken) {
      try {
        this.telegramBot = new TelegramBot(arbConfig.telegram.botToken, { polling: false });
        console.log('Telegram notifications enabled');
      } catch (err) {
        console.warn('Failed to initialize Telegram:', err);
      }
    }
  }

  /**
   * Start the arbitrage bot
   */
  async start(): Promise<void> {
    console.log('\n=== Polymarket Arbitrage Bot ===');
    console.log(`Mode: ${arbConfig.executionMode.toUpperCase()}`);
    console.log(`Min Profit Threshold: ${arbConfig.minProfitThreshold}%`);
    console.log(`Detection Interval: ${arbConfig.detectionIntervalMs}ms`);
    console.log(`Enabled Types: ${Object.entries(arbConfig.enabledTypes).filter(([_, v]) => v).map(([k]) => k).join(', ')}`);
    console.log('');

    // Initialize database
    try {
      await db.initialize();
      console.log('Database initialized');
    } catch (err) {
      console.warn('Database initialization failed, continuing in memory-only mode');
    }

    // Send startup notification
    await this.sendTelegramMessage(`🤖 *Arbitrage Bot Started*\nMode: ${arbConfig.executionMode}\nThreshold: ${arbConfig.minProfitThreshold}%`);

    this.isRunning = true;

    // Start detection loop
    await this.runDetectionCycle();
    this.detectionInterval = setInterval(
      () => this.runDetectionCycle(),
      arbConfig.detectionIntervalMs
    );

    // Handle shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());

    console.log('\nBot is running. Press Ctrl+C to stop.\n');
  }

  /**
   * Stop the bot
   */
  async stop(): Promise<void> {
    console.log('\nStopping arbitrage bot...');
    this.isRunning = false;

    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
    }

    // Print summary
    this.printSummary();

    // Send shutdown notification
    await this.sendTelegramMessage(`🛑 *Arbitrage Bot Stopped*\nCycles: ${this.stats.cyclesRun}\nOpportunities: ${this.stats.opportunitiesFound}`);

    process.exit(0);
  }

  /**
   * Run a single detection cycle
   */
  private async runDetectionCycle(): Promise<void> {
    if (!this.isRunning) return;

    try {
      this.stats.cyclesRun++;

      // Fetch active markets
      const activeMarkets = await this.dataCollector.fetchActiveMarkets(200);

      if (activeMarkets.length === 0) {
        console.log(`[${new Date().toISOString()}] No markets fetched, skipping cycle`);
        return;
      }

      // Convert to MarketData format
      const markets: MarketData[] = activeMarkets.map(this.convertMarket);

      // Run detection
      const result = await arbitrageEngine.detect(markets);

      // Get new opportunities (not seen before)
      const newOpportunities = arbitrageEngine.getNewOpportunities(result);

      if (result.totalOpportunities > 0) {
        console.log(
          `[${new Date().toISOString()}] Found ${result.totalOpportunities} opportunities ` +
          `(${newOpportunities.length} new) - ` +
          `MO: ${result.byType.multiOutcome}, CM: ${result.byType.crossMarket}, RM: ${result.byType.relatedMarket}`
        );
      }

      // Save opportunities to database first (to get IDs)
      for (const opp of newOpportunities) {
        try {
          const id = await arbitrageRepo.saveOpportunity(opp);
          opp.id = id;
        } catch (err) {
          // Continue even if DB save fails
        }
      }

      // Process new opportunities
      for (const opp of newOpportunities) {
        this.stats.opportunitiesFound++;

        // Log opportunity
        this.logOpportunity(opp);

        // Send alert
        await this.sendArbitrageAlert(opp);

        // Execute if in auto mode (for simulation testing)
        if (arbConfig.executionMode === 'simulation') {
          await this.executeOpportunity(opp);
        }
      }

      // Expire old opportunities
      await arbitrageEngine.expireOldOpportunities();

      // Log simulation status periodically
      if (this.stats.cyclesRun % 10 === 0) {
        this.logSimulationStatus();
      }

    } catch (err) {
      console.error('Detection cycle error:', err);
    }
  }

  /**
   * Execute an opportunity
   */
  private async executeOpportunity(opp: ArbitrageOpportunity): Promise<void> {
    try {
      this.stats.executionsAttempted++;

      // Determine position size (use smaller of available balance or max position size)
      const state = simulationExecutor.getState();
      const sizeUsd = Math.min(
        state.balance * 0.1, // 10% of balance
        arbConfig.risk.maxPositionSizeUsd,
        100 // Start small for testing
      );

      if (sizeUsd < 10) {
        console.log(`  -> Skipping: insufficient balance`);
        return;
      }

      const result = await simulationExecutor.execute({
        opportunity: opp,
        sizeUsd,
      });

      if (result.status === 'complete') {
        this.stats.executionsSuccessful++;
        console.log(
          `  -> EXECUTED (sim): $${sizeUsd.toFixed(2)} -> ` +
          `P&L: $${result.realizedProfitUsd?.toFixed(4)} (${result.profitPercent?.toFixed(2)}%)`
        );
      } else {
        console.log(`  -> FAILED: ${result.failureReason}`);
      }

    } catch (err) {
      console.error('Execution error:', err);
    }
  }

  /**
   * Log an opportunity to console
   */
  private logOpportunity(opp: ArbitrageOpportunity): void {
    const typeLabel = {
      multi_outcome: 'MULTI-OUTCOME',
      cross_market: 'CROSS-MARKET',
      related_market: 'RELATED-MARKET',
    }[opp.type];

    console.log(`\n📊 ${typeLabel} OPPORTUNITY`);
    console.log(`   Profit: ${opp.profitPercent.toFixed(2)}% | Confidence: ${(opp.confidenceScore * 100).toFixed(0)}%`);
    console.log(`   Market 1: ${opp.market1Question.substring(0, 60)}...`);
    console.log(`   Price: ${(opp.market1Price * 100).toFixed(1)}% | Liquidity: $${opp.market1Liquidity.toFixed(0)}`);

    if (opp.type !== 'multi_outcome') {
      const opp2 = opp as any;
      console.log(`   Market 2: ${opp2.market2Question.substring(0, 60)}...`);
      console.log(`   Price: ${(opp2.market2Price * 100).toFixed(1)}% | Liquidity: $${opp2.market2Liquidity.toFixed(0)}`);
    }
  }

  /**
   * Log simulation status
   */
  private logSimulationStatus(): void {
    if (arbConfig.executionMode !== 'simulation') return;

    const summary = simulationExecutor.getSummary();
    console.log(
      `\n📈 Simulation Status: Balance $${summary.currentBalance.toFixed(2)} | ` +
      `P&L $${summary.totalPnl.toFixed(2)} (${summary.totalPnlPercent.toFixed(2)}%) | ` +
      `Trades: ${summary.tradesSuccessful}/${summary.tradesExecuted} (${summary.winRate.toFixed(0)}% win rate)`
    );
  }

  /**
   * Send Telegram alert for an opportunity
   */
  private async sendArbitrageAlert(opp: ArbitrageOpportunity): Promise<void> {
    if (!this.telegramBot || !arbConfig.telegram.chatId) return;

    const typeEmoji = {
      multi_outcome: '🔄',
      cross_market: '↔️',
      related_market: '🔗',
    }[opp.type];

    const typeLabel = {
      multi_outcome: 'Multi-Outcome Spread',
      cross_market: 'Cross-Market',
      related_market: 'Related Market',
    }[opp.type];

    let message = `${typeEmoji} *${typeLabel} Opportunity*\n\n`;
    message += `💰 Profit: *${opp.profitPercent.toFixed(2)}%*\n`;
    message += `📊 Confidence: ${(opp.confidenceScore * 100).toFixed(0)}%\n\n`;
    message += `📈 *Market 1:*\n`;
    message += `${opp.market1Question.substring(0, 80)}\n`;
    message += `Price: ${(opp.market1Price * 100).toFixed(1)}% | Liq: $${(opp.market1Liquidity / 1000).toFixed(1)}k\n`;

    if (opp.type !== 'multi_outcome') {
      const opp2 = opp as any;
      message += `\n📉 *Market 2:*\n`;
      message += `${opp2.market2Question.substring(0, 80)}\n`;
      message += `Price: ${(opp2.market2Price * 100).toFixed(1)}% | Liq: $${(opp2.market2Liquidity / 1000).toFixed(1)}k\n`;
    }

    if (opp.type === 'multi_outcome') {
      const mo = opp as any;
      message += `\n📋 Sum: ${(mo.priceSum * 100).toFixed(1)}% (${mo.direction})`;
    }

    await this.sendTelegramMessage(message);
  }

  /**
   * Send a Telegram message
   */
  private async sendTelegramMessage(message: string): Promise<void> {
    if (!this.telegramBot || !arbConfig.telegram.chatId) return;

    try {
      await this.telegramBot.sendMessage(arbConfig.telegram.chatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });
    } catch (err) {
      console.error('Telegram send error:', err);
    }
  }

  /**
   * Convert ActiveMarket to MarketData format
   */
  private convertMarket(market: ActiveMarket): MarketData {
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
    };
  }

  /**
   * Print final summary
   */
  private printSummary(): void {
    const runtime = (Date.now() - this.stats.startTime) / 1000 / 60; // minutes

    console.log('\n=== Session Summary ===');
    console.log(`Runtime: ${runtime.toFixed(1)} minutes`);
    console.log(`Detection Cycles: ${this.stats.cyclesRun}`);
    console.log(`Opportunities Found: ${this.stats.opportunitiesFound}`);
    console.log(`Executions: ${this.stats.executionsSuccessful}/${this.stats.executionsAttempted}`);

    if (arbConfig.executionMode === 'simulation') {
      const summary = simulationExecutor.getSummary();
      console.log('\n--- Simulation Results ---');
      console.log(`Starting Balance: $${summary.startingBalance.toFixed(2)}`);
      console.log(`Final Balance: $${summary.currentBalance.toFixed(2)}`);
      console.log(`Total P&L: $${summary.totalPnl.toFixed(2)} (${summary.totalPnlPercent.toFixed(2)}%)`);
      console.log(`Win Rate: ${summary.winRate.toFixed(1)}%`);
    }

    console.log('');
  }
}

// Main entry point
async function main(): Promise<void> {
  const runner = new ArbitrageRunner();
  await runner.start();
}

main().catch(console.error);
