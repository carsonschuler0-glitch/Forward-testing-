/**
 * Simulation Executor
 * Paper trading execution for forward testing arbitrage strategies
 */

import {
  Executor,
  ExecutionMode,
  ExecutionRequest,
  ExecutionResult,
  ExecutionLeg,
  SimulationState,
  Position,
} from './types';
import { ArbitrageOpportunity, MultiOutcomeOpportunity } from '../arbitrage/types';
import { slippageModel } from './slippageModel';
import { riskManager, RiskManager } from './riskManager';
import { arbConfig } from '../config';
import { arbitrageRepo } from '../database/arbitrageRepository';

export class SimulationExecutor implements Executor {
  mode: ExecutionMode = 'simulation';

  private state: SimulationState;
  private localRiskManager: RiskManager;

  constructor() {
    this.state = {
      balance: arbConfig.simulation.startingBalance,
      startingBalance: arbConfig.simulation.startingBalance,
      positions: new Map(),
      totalPnl: 0,
      dailyPnl: 0,
      tradesExecuted: 0,
      tradesSuccessful: 0,
      lastTradeAt: null,
    };

    this.localRiskManager = new RiskManager();
  }

  /**
   * Execute an arbitrage opportunity in simulation mode
   */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const { opportunity, sizeUsd } = request;
    const startTime = Date.now();

    // Pre-execution risk check
    const riskCheck = this.localRiskManager.checkPreExecution(opportunity, sizeUsd);
    if (!riskCheck.approved) {
      return this.createFailedResult(opportunity, sizeUsd, riskCheck.reason || 'Risk check failed', startTime);
    }

    // Check balance
    if (this.state.balance < sizeUsd) {
      return this.createFailedResult(opportunity, sizeUsd, 'Insufficient balance', startTime);
    }

    // Execute based on opportunity type
    let result: ExecutionResult;

    if (opportunity.type === 'multi_outcome') {
      result = await this.executeMultiOutcome(opportunity as MultiOutcomeOpportunity, sizeUsd, startTime);
    } else {
      result = await this.executeTwoLegged(opportunity, sizeUsd, startTime);
    }

    // Update state
    if (result.status === 'complete') {
      this.state.tradesSuccessful++;
      this.state.totalPnl += result.realizedProfitUsd || 0;
      this.state.dailyPnl += result.realizedProfitUsd || 0;
      this.state.balance += result.realizedProfitUsd || 0;

      // Update risk manager
      this.localRiskManager.updateAfterExecution(
        opportunity.market1Id,
        result.leg1.side,
        result.leg1.filledSize,
        result.leg1.executedPrice || result.leg1.expectedPrice,
        result.realizedProfitUsd || 0
      );
    }

    this.state.tradesExecuted++;
    this.state.lastTradeAt = Date.now();

    // Save to database
    try {
      result.id = await arbitrageRepo.saveExecution(result);
    } catch (err) {
      console.error('Failed to save execution:', err);
    }

    return result;
  }

  /**
   * Execute multi-outcome arbitrage (YES + NO spread)
   */
  private async executeMultiOutcome(
    opportunity: MultiOutcomeOpportunity,
    sizeUsd: number,
    startTime: number
  ): Promise<ExecutionResult> {
    // For multi-outcome, we buy or sell both YES and NO
    const side = opportunity.direction === 'underpriced' ? 'BUY' : 'SELL';

    // Split size between YES and NO
    const legSize = sizeUsd / 2;

    // Simulate YES leg
    const yesSlippage = slippageModel.estimate(
      legSize,
      opportunity.market1Liquidity,
      side === 'BUY',
      opportunity.yesPrice
    );
    const yesExecutedPrice = slippageModel.addNoise(yesSlippage).estimatedExecutionPrice;

    // Simulate NO leg
    const noSlippage = slippageModel.estimate(
      legSize,
      opportunity.market1Liquidity,
      side === 'BUY',
      opportunity.noPrice
    );
    const noExecutedPrice = slippageModel.addNoise(noSlippage).estimatedExecutionPrice;

    // Calculate P&L
    // If underpriced (sum < 1): we buy both, payout is $1, cost is yesPrice + noPrice
    // If overpriced (sum > 1): we sell both, receive yesPrice + noPrice, payout is $1
    const executedSum = yesExecutedPrice + noExecutedPrice;
    let realizedProfitUsd: number;

    if (opportunity.direction === 'underpriced') {
      // Cost to buy: executedSum, Payout: 1.0
      realizedProfitUsd = (1.0 - executedSum) * legSize;
    } else {
      // Receive: executedSum, Pay out: 1.0
      realizedProfitUsd = (executedSum - 1.0) * legSize;
    }

    // Subtract fees
    const fees = sizeUsd * 0.01; // 1% fees
    realizedProfitUsd -= fees;

    const leg1: ExecutionLeg = {
      marketId: opportunity.market1Id,
      outcome: 1, // YES
      side,
      requestedSize: legSize,
      filledSize: legSize,
      expectedPrice: opportunity.yesPrice,
      executedPrice: yesExecutedPrice,
      slippage: yesSlippage.estimatedSlippageBps / 10000,
      executedAt: Date.now(),
      status: 'filled',
    };

    const leg2: ExecutionLeg = {
      marketId: opportunity.market1Id,
      outcome: 0, // NO
      side,
      requestedSize: legSize,
      filledSize: legSize,
      expectedPrice: opportunity.noPrice,
      executedPrice: noExecutedPrice,
      slippage: noSlippage.estimatedSlippageBps / 10000,
      executedAt: Date.now(),
      status: 'filled',
    };

    return {
      opportunityId: opportunity.id || 0,
      executionMode: 'simulation',
      leg1,
      leg2,
      totalSizeUsd: sizeUsd,
      totalFees: fees,
      gasCostUsd: 0,
      expectedProfitUsd: opportunity.profitPercent * sizeUsd / 100,
      realizedProfitUsd,
      profitPercent: (realizedProfitUsd / sizeUsd) * 100,
      status: 'complete',
      initiatedAt: startTime,
      completedAt: Date.now(),
    };
  }

  /**
   * Execute two-legged arbitrage (cross-market or related)
   */
  private async executeTwoLegged(
    opportunity: ArbitrageOpportunity,
    sizeUsd: number,
    startTime: number
  ): Promise<ExecutionResult> {
    const opp = opportunity as any; // Cross or Related type

    // Leg 1: Buy the underpriced market
    const leg1Slippage = slippageModel.estimate(
      sizeUsd,
      opportunity.market1Liquidity,
      true, // BUY
      opportunity.market1Price
    );
    const leg1ExecutedPrice = slippageModel.addNoise(leg1Slippage).estimatedExecutionPrice;

    // Leg 2: Sell the overpriced market
    const leg2Slippage = slippageModel.estimate(
      sizeUsd,
      opp.market2Liquidity,
      false, // SELL
      opp.market2Price
    );
    const leg2ExecutedPrice = slippageModel.addNoise(leg2Slippage).estimatedExecutionPrice;

    // Calculate P&L
    // Buy at leg1ExecutedPrice, sell at leg2ExecutedPrice
    const priceDiff = leg2ExecutedPrice - leg1ExecutedPrice;
    let realizedProfitUsd = priceDiff * sizeUsd;

    // Subtract fees
    const fees = sizeUsd * 0.01 * 2; // 1% fees on each leg
    realizedProfitUsd -= fees;

    const leg1: ExecutionLeg = {
      marketId: opportunity.market1Id,
      outcome: opportunity.market1Outcome,
      side: 'BUY',
      requestedSize: sizeUsd,
      filledSize: sizeUsd,
      expectedPrice: opportunity.market1Price,
      executedPrice: leg1ExecutedPrice,
      slippage: leg1Slippage.estimatedSlippageBps / 10000,
      executedAt: Date.now(),
      status: 'filled',
    };

    const leg2: ExecutionLeg = {
      marketId: opp.market2Id,
      outcome: opp.market2Outcome,
      side: 'SELL',
      requestedSize: sizeUsd,
      filledSize: sizeUsd,
      expectedPrice: opp.market2Price,
      executedPrice: leg2ExecutedPrice,
      slippage: leg2Slippage.estimatedSlippageBps / 10000,
      executedAt: Date.now(),
      status: 'filled',
    };

    return {
      opportunityId: opportunity.id || 0,
      executionMode: 'simulation',
      leg1,
      leg2,
      totalSizeUsd: sizeUsd * 2, // Both legs
      totalFees: fees,
      gasCostUsd: 0,
      expectedProfitUsd: opportunity.profitPercent * sizeUsd / 100,
      realizedProfitUsd,
      profitPercent: (realizedProfitUsd / sizeUsd) * 100,
      status: 'complete',
      initiatedAt: startTime,
      completedAt: Date.now(),
    };
  }

  /**
   * Create a failed execution result
   */
  private createFailedResult(
    opportunity: ArbitrageOpportunity,
    sizeUsd: number,
    reason: string,
    startTime: number
  ): ExecutionResult {
    return {
      opportunityId: opportunity.id || 0,
      executionMode: 'simulation',
      leg1: {
        marketId: opportunity.market1Id,
        outcome: opportunity.market1Outcome,
        side: 'BUY',
        requestedSize: sizeUsd,
        filledSize: 0,
        expectedPrice: opportunity.market1Price,
        executedPrice: null,
        slippage: null,
        executedAt: null,
        status: 'failed',
        error: reason,
      },
      leg2: null,
      totalSizeUsd: 0,
      totalFees: 0,
      gasCostUsd: 0,
      expectedProfitUsd: opportunity.profitPercent * sizeUsd / 100,
      realizedProfitUsd: null,
      profitPercent: null,
      status: 'failed',
      failureReason: reason,
      initiatedAt: startTime,
      completedAt: Date.now(),
    };
  }

  /**
   * Get current simulation state
   */
  getState(): SimulationState {
    return { ...this.state };
  }

  /**
   * Get all positions
   */
  getPositions(): Position[] {
    return this.localRiskManager.getPositions();
  }

  /**
   * Reset simulation
   */
  reset(): void {
    this.state = {
      balance: arbConfig.simulation.startingBalance,
      startingBalance: arbConfig.simulation.startingBalance,
      positions: new Map(),
      totalPnl: 0,
      dailyPnl: 0,
      tradesExecuted: 0,
      tradesSuccessful: 0,
      lastTradeAt: null,
    };
    this.localRiskManager = new RiskManager();
  }

  /**
   * Get performance summary
   */
  getSummary(): {
    startingBalance: number;
    currentBalance: number;
    totalPnl: number;
    totalPnlPercent: number;
    tradesExecuted: number;
    tradesSuccessful: number;
    winRate: number;
  } {
    const winRate = this.state.tradesExecuted > 0
      ? (this.state.tradesSuccessful / this.state.tradesExecuted) * 100
      : 0;

    return {
      startingBalance: this.state.startingBalance,
      currentBalance: this.state.balance,
      totalPnl: this.state.totalPnl,
      totalPnlPercent: (this.state.totalPnl / this.state.startingBalance) * 100,
      tradesExecuted: this.state.tradesExecuted,
      tradesSuccessful: this.state.tradesSuccessful,
      winRate,
    };
  }
}

export const simulationExecutor = new SimulationExecutor();
