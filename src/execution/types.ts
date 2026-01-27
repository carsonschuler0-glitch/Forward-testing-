/**
 * Execution Types
 * Types for simulation and live execution of arbitrage trades
 */

import { ArbitrageOpportunity } from '../arbitrage/types';

export type ExecutionMode = 'simulation' | 'live';
export type ExecutionStatus = 'pending' | 'partial' | 'complete' | 'failed' | 'cancelled';
export type LegStatus = 'pending' | 'filled' | 'partial' | 'failed';
export type OrderSide = 'BUY' | 'SELL';

/**
 * Configuration for simulation executor
 */
export interface SimulationConfig {
  startingBalance: number;
  baseSlippageBps: number;
  liquidityImpactFactor: number;
  executionDelayMs: number;
  partialFillProbability: number;
  failureProbability: number;
}

/**
 * Configuration for live executor
 */
export interface LiveExecutorConfig {
  privateKey: string;
  chainId: number;
  maxSlippageBps: number;
  maxRetries: number;
  orderExpirySeconds: number;
}

/**
 * Risk management limits
 */
export interface RiskLimits {
  maxPositionSizeUsd: number;
  maxTotalExposureUsd: number;
  maxDailyLossUsd: number;
  maxSlippagePercent: number;
  minLiquidityUsd: number;
  maxGasCostUsd: number;
  cooldownMs: number;
}

/**
 * Single leg of an arbitrage execution
 */
export interface ExecutionLeg {
  marketId: string;
  outcome: number;
  side: OrderSide;
  requestedSize: number;
  filledSize: number;
  expectedPrice: number;
  executedPrice: number | null;
  slippage: number | null;
  txHash?: string;
  executedAt: number | null;
  status: LegStatus;
  error?: string;
}

/**
 * Full execution result
 */
export interface ExecutionResult {
  id?: number;
  opportunityId: number;
  executionMode: ExecutionMode;
  leg1: ExecutionLeg;
  leg2: ExecutionLeg | null;
  totalSizeUsd: number;
  totalFees: number;
  gasCostUsd: number;
  expectedProfitUsd: number;
  realizedProfitUsd: number | null;
  profitPercent: number | null;
  status: ExecutionStatus;
  failureReason?: string;
  initiatedAt: number;
  completedAt: number | null;
}

/**
 * Position in a market
 */
export interface Position {
  marketId: string;
  outcome: number;
  size: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  openedAt: number;
}

/**
 * Risk check result
 */
export interface RiskCheckResult {
  approved: boolean;
  reason?: string;
  checks: {
    name: string;
    passed: boolean;
    reason?: string;
  }[];
}

/**
 * Daily P&L summary
 */
export interface DailyPnL {
  date: string;
  executionMode: ExecutionMode;
  opportunitiesDetected: number;
  executionsAttempted: number;
  executionsSuccessful: number;
  totalVolumeUsd: number;
  grossProfitUsd: number;
  totalFeesUsd: number;
  totalGasUsd: number;
  netProfitUsd: number;
  multiOutcomeProfit: number;
  crossMarketProfit: number;
  relatedMarketProfit: number;
  maxDrawdownUsd: number;
  sharpeRatio?: number;
}

/**
 * Simulation state
 */
export interface SimulationState {
  balance: number;
  startingBalance: number;
  positions: Map<string, Position>;
  totalPnl: number;
  dailyPnl: number;
  tradesExecuted: number;
  tradesSuccessful: number;
  lastTradeAt: number | null;
}

/**
 * Execution request
 */
export interface ExecutionRequest {
  opportunity: ArbitrageOpportunity;
  sizeUsd: number;
  maxSlippageBps?: number;
}

/**
 * Order parameters for CLOB
 */
export interface OrderParams {
  side: OrderSide;
  price: number;
  size: number;
  expiration?: number;
}

/**
 * Slippage estimate
 */
export interface SlippageEstimate {
  estimatedSlippageBps: number;
  estimatedExecutionPrice: number;
  confidence: number;
  liquidityDepth: number;
}

/**
 * Executor interface
 */
export interface Executor {
  mode: ExecutionMode;
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
  getState(): SimulationState | null;
  getPositions(): Position[];
}
