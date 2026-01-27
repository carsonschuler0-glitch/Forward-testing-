/**
 * Risk Manager
 * Manages position limits, daily loss limits, and trade cooldowns
 */

import { RiskLimits, RiskCheckResult, Position, ExecutionMode } from './types';
import { ArbitrageOpportunity } from '../arbitrage/types';
import { arbConfig } from '../config';

export class RiskManager {
  private limits: RiskLimits;
  private positions: Map<string, Position> = new Map();
  private dailyPnL: number = 0;
  private dailyVolume: number = 0;
  private lastTradeTime: number = 0;
  private totalExposure: number = 0;
  private dailyReset: Date;

  constructor(limits?: Partial<RiskLimits>) {
    this.limits = {
      maxPositionSizeUsd: limits?.maxPositionSizeUsd ?? arbConfig.risk.maxPositionSizeUsd,
      maxTotalExposureUsd: limits?.maxTotalExposureUsd ?? arbConfig.risk.maxTotalExposureUsd,
      maxDailyLossUsd: limits?.maxDailyLossUsd ?? arbConfig.risk.maxDailyLossUsd,
      maxSlippagePercent: limits?.maxSlippagePercent ?? 1,
      minLiquidityUsd: limits?.minLiquidityUsd ?? arbConfig.risk.minLiquidityUsd,
      maxGasCostUsd: limits?.maxGasCostUsd ?? 5,
      cooldownMs: limits?.cooldownMs ?? arbConfig.risk.tradeCooldownMs,
    };

    this.dailyReset = this.getNextMidnight();
  }

  /**
   * Check if an opportunity passes all risk checks
   */
  checkPreExecution(
    opportunity: ArbitrageOpportunity,
    orderSizeUsd: number
  ): RiskCheckResult {
    // Check for daily reset
    this.checkDailyReset();

    const checks = [
      this.checkPositionLimit(opportunity, orderSizeUsd),
      this.checkTotalExposure(orderSizeUsd),
      this.checkDailyLoss(),
      this.checkLiquidity(opportunity),
      this.checkCooldown(),
      this.checkMinProfitability(opportunity, orderSizeUsd),
    ];

    const failed = checks.find(c => !c.passed);

    return {
      approved: !failed,
      reason: failed?.reason,
      checks,
    };
  }

  /**
   * Check position size limit for this market
   */
  private checkPositionLimit(
    opportunity: ArbitrageOpportunity,
    orderSizeUsd: number
  ): { name: string; passed: boolean; reason?: string } {
    const existingPosition = this.positions.get(opportunity.market1Id);
    const currentSize = existingPosition?.size || 0;
    const newSize = currentSize + orderSizeUsd;

    const passed = newSize <= this.limits.maxPositionSizeUsd;

    return {
      name: 'position_limit',
      passed,
      reason: passed
        ? undefined
        : `Position would exceed limit: $${newSize.toFixed(2)} > $${this.limits.maxPositionSizeUsd}`,
    };
  }

  /**
   * Check total exposure across all positions
   */
  private checkTotalExposure(orderSizeUsd: number): { name: string; passed: boolean; reason?: string } {
    const newExposure = this.totalExposure + orderSizeUsd;
    const passed = newExposure <= this.limits.maxTotalExposureUsd;

    return {
      name: 'total_exposure',
      passed,
      reason: passed
        ? undefined
        : `Total exposure would exceed limit: $${newExposure.toFixed(2)} > $${this.limits.maxTotalExposureUsd}`,
    };
  }

  /**
   * Check daily loss limit
   */
  private checkDailyLoss(): { name: string; passed: boolean; reason?: string } {
    const passed = this.dailyPnL > -this.limits.maxDailyLossUsd;

    return {
      name: 'daily_loss',
      passed,
      reason: passed
        ? undefined
        : `Daily loss limit reached: $${Math.abs(this.dailyPnL).toFixed(2)}`,
    };
  }

  /**
   * Check market liquidity
   */
  private checkLiquidity(
    opportunity: ArbitrageOpportunity
  ): { name: string; passed: boolean; reason?: string } {
    const minLiquidity = opportunity.type === 'multi_outcome'
      ? opportunity.market1Liquidity
      : Math.min(opportunity.market1Liquidity, (opportunity as any).market2Liquidity || Infinity);

    const passed = minLiquidity >= this.limits.minLiquidityUsd;

    return {
      name: 'liquidity',
      passed,
      reason: passed
        ? undefined
        : `Insufficient liquidity: $${minLiquidity.toFixed(0)} < $${this.limits.minLiquidityUsd}`,
    };
  }

  /**
   * Check trade cooldown
   */
  private checkCooldown(): { name: string; passed: boolean; reason?: string } {
    const timeSinceLastTrade = Date.now() - this.lastTradeTime;
    const passed = timeSinceLastTrade >= this.limits.cooldownMs;

    return {
      name: 'cooldown',
      passed,
      reason: passed
        ? undefined
        : `Cooldown active: ${((this.limits.cooldownMs - timeSinceLastTrade) / 1000).toFixed(1)}s remaining`,
    };
  }

  /**
   * Check minimum profitability after slippage
   */
  private checkMinProfitability(
    opportunity: ArbitrageOpportunity,
    orderSizeUsd: number
  ): { name: string; passed: boolean; reason?: string } {
    // Rough slippage estimate
    const estimatedSlippage = (orderSizeUsd / opportunity.market1Liquidity) * 0.5 * 100; // %
    const netProfit = opportunity.profitPercent - estimatedSlippage;
    const passed = netProfit > 0.1; // At least 0.1% profit after slippage

    return {
      name: 'profitability',
      passed,
      reason: passed
        ? undefined
        : `Expected profit after slippage too low: ${netProfit.toFixed(2)}%`,
    };
  }

  /**
   * Update state after execution
   */
  updateAfterExecution(
    marketId: string,
    side: 'BUY' | 'SELL',
    sizeUsd: number,
    price: number,
    pnl: number
  ): void {
    this.dailyPnL += pnl;
    this.dailyVolume += sizeUsd;
    this.lastTradeTime = Date.now();

    // Update positions
    const existing = this.positions.get(marketId);
    if (existing) {
      if (side === 'BUY') {
        existing.size += sizeUsd;
      } else {
        existing.size -= sizeUsd;
      }
      existing.currentPrice = price;
      existing.unrealizedPnl = (price - existing.avgEntryPrice) * existing.size;

      if (existing.size <= 0) {
        this.positions.delete(marketId);
      }
    } else if (side === 'BUY') {
      this.positions.set(marketId, {
        marketId,
        outcome: 1,
        size: sizeUsd,
        avgEntryPrice: price,
        currentPrice: price,
        unrealizedPnl: 0,
        openedAt: Date.now(),
      });
    }

    // Recalculate total exposure
    this.totalExposure = Array.from(this.positions.values())
      .reduce((sum, p) => sum + Math.abs(p.size), 0);
  }

  /**
   * Get current risk state
   */
  getState(): {
    dailyPnL: number;
    dailyVolume: number;
    totalExposure: number;
    positionCount: number;
    lastTradeTime: number;
    limitsReached: string[];
  } {
    const limitsReached: string[] = [];

    if (this.dailyPnL <= -this.limits.maxDailyLossUsd) {
      limitsReached.push('daily_loss');
    }
    if (this.totalExposure >= this.limits.maxTotalExposureUsd) {
      limitsReached.push('total_exposure');
    }

    return {
      dailyPnL: this.dailyPnL,
      dailyVolume: this.dailyVolume,
      totalExposure: this.totalExposure,
      positionCount: this.positions.size,
      lastTradeTime: this.lastTradeTime,
      limitsReached,
    };
  }

  /**
   * Get all positions
   */
  getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Reset daily counters
   */
  resetDaily(): void {
    this.dailyPnL = 0;
    this.dailyVolume = 0;
    this.dailyReset = this.getNextMidnight();
    console.log('Daily risk counters reset');
  }

  /**
   * Check if daily reset is needed
   */
  private checkDailyReset(): void {
    if (new Date() >= this.dailyReset) {
      this.resetDaily();
    }
  }

  /**
   * Get next midnight UTC
   */
  private getNextMidnight(): Date {
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    return tomorrow;
  }

  /**
   * Emergency stop - close all positions and halt trading
   */
  emergencyStop(): void {
    console.log('EMERGENCY STOP ACTIVATED');
    // Set limits to prevent any new trades
    this.limits.maxTotalExposureUsd = 0;
    this.limits.maxDailyLossUsd = 0;
  }
}

export const riskManager = new RiskManager();
