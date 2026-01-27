/**
 * Paper Trading Executor
 * Simulates real arbitrage execution with:
 * - Kelly criterion position sizing
 * - CLOB execution realities (non-atomic risk, slippage, partial fills)
 * - Telegram notifications
 * - Detailed trade tracking by opportunity type
 */

import TelegramBot from 'node-telegram-bot-api';
import {
  ExecutionMode,
  ExecutionResult,
  ExecutionLeg,
  SimulationState,
  Position,
} from './types';
import { ArbitrageOpportunity, NegRiskOpportunity } from '../arbitrage/types';
import { slippageModel } from './slippageModel';
import { arbConfig } from '../config';

export interface PaperTrade {
  id: number;
  timestamp: number;
  opportunityType: string;
  subType?: string;
  market1Question: string;
  market2Question?: string;
  positionSize: number;
  kellyFraction: number;
  expectedProfit: number;
  realizedProfit: number;
  profitPercent: number;
  leg1Status: 'filled' | 'partial' | 'failed';
  leg2Status?: 'filled' | 'partial' | 'failed';
  slippageBps: number;
  executionTimeMs: number;
  balanceAfter: number;
  success: boolean;
  failureReason?: string;
}

export interface PaperTradingStats {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  totalVolume: number;
  grossProfit: number;
  totalFees: number;
  netProfit: number;
  winRate: number;
  avgProfitPerTrade: number;
  maxDrawdown: number;
  sharpeRatio: number;
  byType: {
    [key: string]: {
      trades: number;
      profit: number;
      winRate: number;
    };
  };
}

export class PaperTradingExecutor {
  mode: ExecutionMode = 'simulation';

  private bankroll: number;
  private startingBankroll: number;
  private trades: PaperTrade[] = [];
  private telegramBot: TelegramBot | null = null;
  private tradeIdCounter = 0;
  private peakBalance: number;
  private maxDrawdown: number = 0;

  // CLOB simulation parameters
  private readonly LEG_FAILURE_PROBABILITY = 0.05; // 5% chance one leg fails
  private readonly PARTIAL_FILL_PROBABILITY = 0.15; // 15% chance of partial fill
  private readonly EXECUTION_DELAY_MS = 500; // Simulated execution delay

  constructor(startingBankroll: number = 100) {
    this.bankroll = startingBankroll;
    this.startingBankroll = startingBankroll;
    this.peakBalance = startingBankroll;

    // Initialize Telegram if configured
    if (arbConfig.telegram.enabled && arbConfig.telegram.botToken) {
      try {
        this.telegramBot = new TelegramBot(arbConfig.telegram.botToken, { polling: false });
        console.log('Paper Trading: Telegram notifications enabled');
      } catch (err) {
        console.warn('Paper Trading: Failed to initialize Telegram:', err);
      }
    }
  }

  /**
   * Calculate Kelly criterion bet size
   * Kelly = (bp - q) / b
   * where b = odds, p = win probability, q = lose probability
   */
  calculateKellyFraction(
    confidenceScore: number,
    expectedProfitPercent: number
  ): number {
    // Estimate win probability from confidence score
    const winProbability = Math.min(0.95, Math.max(0.5, confidenceScore));
    const loseProbability = 1 - winProbability;

    // Calculate expected odds (profit if win / loss if lose)
    // In arbitrage, loss is typically the position size minus fees
    const profitIfWin = expectedProfitPercent / 100;
    const lossIfLose = 0.02; // Assume 2% loss on failed arb (slippage + fees)
    const odds = profitIfWin / lossIfLose;

    // Kelly formula
    const kelly = (odds * winProbability - loseProbability) / odds;

    // Apply fractional Kelly (half Kelly is common for safety)
    const fractionalKelly = kelly * 0.5;

    // Clamp between 1% and 25% of bankroll
    return Math.min(0.25, Math.max(0.01, fractionalKelly));
  }

  /**
   * Calculate position size using Kelly criterion
   */
  calculatePositionSize(opportunity: ArbitrageOpportunity): number {
    const kellyFraction = this.calculateKellyFraction(
      opportunity.confidenceScore,
      opportunity.profitPercent
    );

    // Position size = bankroll * kelly fraction
    let positionSize = this.bankroll * kellyFraction;

    // Apply minimum and maximum bounds
    positionSize = Math.min(positionSize, arbConfig.risk.maxPositionSizeUsd);
    positionSize = Math.min(positionSize, this.bankroll * 0.25); // Never risk more than 25%
    positionSize = Math.max(positionSize, 5); // Minimum $5 trade

    // Don't trade if bankroll too low
    if (this.bankroll < 10) {
      return 0;
    }

    return positionSize;
  }

  /**
   * Execute a paper trade for an arbitrage opportunity
   */
  async execute(opportunity: ArbitrageOpportunity): Promise<PaperTrade | null> {
    const startTime = Date.now();

    // Calculate position size using Kelly criterion
    const kellyFraction = this.calculateKellyFraction(
      opportunity.confidenceScore,
      opportunity.profitPercent
    );
    const positionSize = this.calculatePositionSize(opportunity);

    if (positionSize <= 0) {
      console.log('Paper Trading: Insufficient bankroll for trade');
      return null;
    }

    // Deduct position from bankroll immediately (capital at risk)
    this.bankroll -= positionSize;

    // Simulate execution delay
    await this.sleep(this.EXECUTION_DELAY_MS + Math.random() * 200);

    // Simulate CLOB execution
    const executionResult = this.simulateCLOBExecution(opportunity, positionSize);

    // Calculate realized profit/loss
    let realizedProfit = 0;
    let success = true;
    let failureReason: string | undefined;

    if (executionResult.leg1Failed) {
      // Leg 1 failed - no capital at risk, return position size
      this.bankroll += positionSize;
      realizedProfit = -positionSize * 0.001; // Small fee for failed order
      success = false;
      failureReason = 'Leg 1 execution failed';
    } else if (executionResult.leg2Failed) {
      // Non-atomic risk: Leg 1 succeeded but Leg 2 failed
      // We're stuck with a position, simulate unwinding at a loss
      const unwindLoss = positionSize * 0.02; // 2% loss to unwind
      realizedProfit = -unwindLoss;
      this.bankroll += positionSize - unwindLoss;
      success = false;
      failureReason = 'Leg 2 failed - position unwound at loss';
    } else {
      // Both legs succeeded
      const slippageCost = (executionResult.totalSlippageBps / 10000) * positionSize;
      const fees = positionSize * 0.01; // 1% total fees
      const grossProfit = (opportunity.profitPercent / 100) * positionSize;

      // Apply partial fill reduction if applicable
      const fillRate = executionResult.fillRate;
      realizedProfit = (grossProfit * fillRate) - slippageCost - fees;

      // Return capital plus profit
      this.bankroll += positionSize + realizedProfit;
      success = realizedProfit > 0;

      if (!success) {
        failureReason = 'Slippage exceeded profit margin';
      }
    }

    // Update peak balance and max drawdown
    if (this.bankroll > this.peakBalance) {
      this.peakBalance = this.bankroll;
    }
    const currentDrawdown = (this.peakBalance - this.bankroll) / this.peakBalance;
    if (currentDrawdown > this.maxDrawdown) {
      this.maxDrawdown = currentDrawdown;
    }

    // Determine opportunity type string
    const isNegRisk = (opportunity as any).subType === 'negrisk';
    const oppType = isNegRisk ? 'negrisk' : opportunity.type;
    const subType = (opportunity as any).subType;

    // Create trade record
    const trade: PaperTrade = {
      id: ++this.tradeIdCounter,
      timestamp: Date.now(),
      opportunityType: oppType,
      subType,
      market1Question: opportunity.market1Question,
      market2Question: (opportunity as any).market2Question,
      positionSize,
      kellyFraction,
      expectedProfit: (opportunity.profitPercent / 100) * positionSize,
      realizedProfit,
      profitPercent: (realizedProfit / positionSize) * 100,
      leg1Status: executionResult.leg1Failed ? 'failed' : (executionResult.fillRate < 1 ? 'partial' : 'filled'),
      leg2Status: opportunity.type !== 'multi_outcome'
        ? (executionResult.leg2Failed ? 'failed' : (executionResult.fillRate < 1 ? 'partial' : 'filled'))
        : undefined,
      slippageBps: executionResult.totalSlippageBps,
      executionTimeMs: Date.now() - startTime,
      balanceAfter: this.bankroll,
      success,
      failureReason,
    };

    this.trades.push(trade);

    // Send Telegram notification
    await this.sendTradeNotification(trade, opportunity);

    // Log to console
    this.logTrade(trade);

    return trade;
  }

  /**
   * Simulate CLOB execution with realistic scenarios
   */
  private simulateCLOBExecution(
    opportunity: ArbitrageOpportunity,
    positionSize: number
  ): {
    leg1Failed: boolean;
    leg2Failed: boolean;
    fillRate: number;
    totalSlippageBps: number;
  } {
    // Check for leg failures (non-atomic risk)
    const leg1Failed = Math.random() < this.LEG_FAILURE_PROBABILITY;
    const leg2Failed = !leg1Failed && Math.random() < this.LEG_FAILURE_PROBABILITY;

    // Check for partial fills
    let fillRate = 1.0;
    if (!leg1Failed && !leg2Failed && Math.random() < this.PARTIAL_FILL_PROBABILITY) {
      fillRate = 0.5 + Math.random() * 0.5; // 50-100% fill
    }

    // Calculate slippage
    const leg1Slippage = slippageModel.estimate(
      positionSize,
      opportunity.market1Liquidity,
      true,
      opportunity.market1Price
    );

    let leg2Slippage = { estimatedSlippageBps: 0 };
    if ((opportunity as any).market2Liquidity) {
      leg2Slippage = slippageModel.estimate(
        positionSize,
        (opportunity as any).market2Liquidity,
        false,
        (opportunity as any).market2Price
      );
    }

    // Add noise to slippage
    const leg1SlippageWithNoise = slippageModel.addNoise(leg1Slippage);
    const totalSlippageBps = leg1SlippageWithNoise.estimatedSlippageBps + leg2Slippage.estimatedSlippageBps;

    return {
      leg1Failed,
      leg2Failed,
      fillRate,
      totalSlippageBps,
    };
  }

  /**
   * Send Telegram notification for a trade
   */
  private async sendTradeNotification(trade: PaperTrade, opportunity: ArbitrageOpportunity): Promise<void> {
    if (!this.telegramBot || !arbConfig.telegram.chatId) return;

    const profitEmoji = trade.success ? '✅' : '❌';
    const typeEmoji = {
      negrisk: '🔄',
      multi_outcome: '📊',
      cross_market: '↔️',
      related_market: '🔗',
    }[trade.opportunityType] || '📈';

    let message = `${typeEmoji} *Paper Trade #${trade.id}*\n\n`;
    message += `Type: *${trade.opportunityType.toUpperCase()}*\n`;
    message += `Position: $${trade.positionSize.toFixed(2)} (${(trade.kellyFraction * 100).toFixed(1)}% Kelly)\n\n`;

    if (trade.opportunityType === 'negrisk') {
      const negRisk = opportunity as NegRiskOpportunity;
      message += `Event: ${negRisk.eventTitle || 'Unknown'}\n`;
      message += `Direction: ${negRisk.direction}\n`;
      message += `Conditions: ${negRisk.conditions?.length || 0}\n`;
    } else {
      message += `Market: ${trade.market1Question.substring(0, 50)}...\n`;
      if (trade.market2Question) {
        message += `vs: ${trade.market2Question.substring(0, 50)}...\n`;
      }
    }

    message += `\n${profitEmoji} *Result:* ${trade.success ? 'SUCCESS' : 'FAILED'}\n`;
    message += `Expected: +$${trade.expectedProfit.toFixed(4)}\n`;
    message += `Realized: ${trade.realizedProfit >= 0 ? '+' : ''}$${trade.realizedProfit.toFixed(4)} (${trade.profitPercent.toFixed(2)}%)\n`;
    message += `Slippage: ${trade.slippageBps.toFixed(1)} bps\n`;

    if (trade.failureReason) {
      message += `Reason: ${trade.failureReason}\n`;
    }

    message += `\n💰 *Balance:* $${trade.balanceAfter.toFixed(2)}`;
    message += ` (${((trade.balanceAfter / this.startingBankroll - 1) * 100).toFixed(2)}%)`;

    try {
      await this.telegramBot.sendMessage(arbConfig.telegram.chatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });
    } catch (err) {
      console.error('Paper Trading: Failed to send Telegram notification:', err);
    }
  }

  /**
   * Log trade to console
   */
  private logTrade(trade: PaperTrade): void {
    const statusIcon = trade.success ? '✅' : '❌';
    console.log(
      `\n${statusIcon} Paper Trade #${trade.id} | ${trade.opportunityType.toUpperCase()} | ` +
      `$${trade.positionSize.toFixed(2)} (${(trade.kellyFraction * 100).toFixed(1)}% Kelly) | ` +
      `P&L: ${trade.realizedProfit >= 0 ? '+' : ''}$${trade.realizedProfit.toFixed(4)} | ` +
      `Balance: $${trade.balanceAfter.toFixed(2)}`
    );
    if (trade.failureReason) {
      console.log(`   Reason: ${trade.failureReason}`);
    }
  }

  /**
   * Get current stats
   */
  getStats(): PaperTradingStats {
    const successfulTrades = this.trades.filter(t => t.success);
    const failedTrades = this.trades.filter(t => !t.success);

    const totalVolume = this.trades.reduce((sum, t) => sum + t.positionSize, 0);
    const grossProfit = this.trades.reduce((sum, t) => sum + Math.max(0, t.realizedProfit), 0);
    const totalFees = this.trades.reduce((sum, t) => sum + t.positionSize * 0.01, 0);
    const netProfit = this.trades.reduce((sum, t) => sum + t.realizedProfit, 0);

    // Calculate stats by type
    const byType: { [key: string]: { trades: number; profit: number; winRate: number } } = {};
    for (const trade of this.trades) {
      const type = trade.opportunityType;
      if (!byType[type]) {
        byType[type] = { trades: 0, profit: 0, winRate: 0 };
      }
      byType[type].trades++;
      byType[type].profit += trade.realizedProfit;
    }

    // Calculate win rate per type
    for (const type of Object.keys(byType)) {
      const typeTrades = this.trades.filter(t => t.opportunityType === type);
      const typeWins = typeTrades.filter(t => t.success).length;
      byType[type].winRate = typeTrades.length > 0 ? (typeWins / typeTrades.length) * 100 : 0;
    }

    // Calculate Sharpe ratio (simplified)
    const returns = this.trades.map(t => t.profitPercent / 100);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdReturn = returns.length > 1
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1))
      : 0;
    const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0; // Annualized

    return {
      totalTrades: this.trades.length,
      successfulTrades: successfulTrades.length,
      failedTrades: failedTrades.length,
      totalVolume,
      grossProfit,
      totalFees,
      netProfit,
      winRate: this.trades.length > 0 ? (successfulTrades.length / this.trades.length) * 100 : 0,
      avgProfitPerTrade: this.trades.length > 0 ? netProfit / this.trades.length : 0,
      maxDrawdown: this.maxDrawdown * 100,
      sharpeRatio,
      byType,
    };
  }

  /**
   * Get all trades
   */
  getTrades(): PaperTrade[] {
    return [...this.trades];
  }

  /**
   * Get recent trades
   */
  getRecentTrades(count: number = 10): PaperTrade[] {
    return this.trades.slice(-count);
  }

  /**
   * Get current balance
   */
  getBalance(): number {
    return this.bankroll;
  }

  /**
   * Get starting balance
   */
  getStartingBalance(): number {
    return this.startingBankroll;
  }

  /**
   * Get P&L
   */
  getPnL(): { absolute: number; percent: number } {
    const absolute = this.bankroll - this.startingBankroll;
    const percent = (absolute / this.startingBankroll) * 100;
    return { absolute, percent };
  }

  /**
   * Reset the paper trading account
   */
  reset(startingBankroll: number = 100): void {
    this.bankroll = startingBankroll;
    this.startingBankroll = startingBankroll;
    this.peakBalance = startingBankroll;
    this.maxDrawdown = 0;
    this.trades = [];
    this.tradeIdCounter = 0;
    console.log(`Paper Trading: Reset with $${startingBankroll} bankroll`);
  }

  /**
   * Helper to sleep for a given duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Send summary notification
   */
  async sendSummaryNotification(): Promise<void> {
    if (!this.telegramBot || !arbConfig.telegram.chatId) return;

    const stats = this.getStats();
    const pnl = this.getPnL();

    let message = `📊 *Paper Trading Summary*\n\n`;
    message += `💰 Balance: $${this.bankroll.toFixed(2)}\n`;
    message += `📈 P&L: ${pnl.absolute >= 0 ? '+' : ''}$${pnl.absolute.toFixed(2)} (${pnl.percent.toFixed(2)}%)\n\n`;
    message += `🎯 Trades: ${stats.totalTrades} (${stats.successfulTrades} wins, ${stats.failedTrades} losses)\n`;
    message += `📊 Win Rate: ${stats.winRate.toFixed(1)}%\n`;
    message += `📉 Max Drawdown: ${stats.maxDrawdown.toFixed(2)}%\n`;
    message += `📈 Sharpe Ratio: ${stats.sharpeRatio.toFixed(2)}\n\n`;

    message += `*By Type:*\n`;
    for (const [type, data] of Object.entries(stats.byType)) {
      message += `• ${type}: ${data.trades} trades, ${data.profit >= 0 ? '+' : ''}$${data.profit.toFixed(2)}, ${data.winRate.toFixed(0)}% win\n`;
    }

    try {
      await this.telegramBot.sendMessage(arbConfig.telegram.chatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });
    } catch (err) {
      console.error('Paper Trading: Failed to send summary notification:', err);
    }
  }
}

export const paperTradingExecutor = new PaperTradingExecutor(100);
