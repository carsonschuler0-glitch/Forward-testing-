/**
 * Arbitrage Repository
 * Database operations for arbitrage opportunities, executions, and P&L
 */

import { db } from './client';
import {
  ArbitrageOpportunity,
  MarketRelationship,
  OpportunityStatus,
} from '../arbitrage/types';
import { ExecutionResult, DailyPnL, ExecutionMode } from '../execution/types';

export class ArbitrageRepository {
  /**
   * Save a detected arbitrage opportunity
   */
  async saveOpportunity(opp: ArbitrageOpportunity): Promise<number> {
    const result = await db.query(
      `INSERT INTO arbitrage_opportunities (
        opportunity_type, market1_id, market1_outcome, market1_price, market1_liquidity,
        market2_id, market2_outcome, market2_price, market2_liquidity,
        spread, profit_percent, confidence_score, status, detected_at, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, to_timestamp($14 / 1000.0), $15)
      RETURNING id`,
      [
        opp.type,
        opp.market1Id,
        opp.market1Outcome,
        opp.market1Price,
        opp.market1Liquidity,
        opp.type !== 'multi_outcome' ? (opp as any).market2Id : null,
        opp.type !== 'multi_outcome' ? (opp as any).market2Outcome : null,
        opp.type !== 'multi_outcome' ? (opp as any).market2Price : null,
        opp.type !== 'multi_outcome' ? (opp as any).market2Liquidity : null,
        opp.spread,
        opp.profitPercent,
        opp.confidenceScore,
        opp.status,
        opp.detectedAt,
        JSON.stringify(opp),
      ]
    );
    return result.rows[0]?.id;
  }

  /**
   * Update opportunity status
   */
  async updateOpportunityStatus(
    id: number,
    status: OpportunityStatus
  ): Promise<void> {
    await db.query(
      `UPDATE arbitrage_opportunities
       SET status = $1, closed_at = CASE WHEN $1 IN ('executed', 'expired', 'invalid') THEN NOW() ELSE closed_at END
       WHERE id = $2`,
      [status, id]
    );
  }

  /**
   * Get active opportunities
   */
  async getActiveOpportunities(): Promise<ArbitrageOpportunity[]> {
    const result = await db.query(
      `SELECT metadata FROM arbitrage_opportunities
       WHERE status = 'active'
       ORDER BY profit_percent DESC`
    );
    return result.rows.map((row) => row.metadata);
  }

  /**
   * Get opportunities by type
   */
  async getOpportunitiesByType(
    type: string,
    limit: number = 100
  ): Promise<ArbitrageOpportunity[]> {
    const result = await db.query(
      `SELECT metadata FROM arbitrage_opportunities
       WHERE opportunity_type = $1
       ORDER BY detected_at DESC
       LIMIT $2`,
      [type, limit]
    );
    return result.rows.map((row) => row.metadata);
  }

  /**
   * Save market relationship
   */
  async saveRelationship(rel: MarketRelationship): Promise<number> {
    const result = await db.query(
      `INSERT INTO market_relationships (
        market1_id, market2_id, relationship_type, similarity_score, confidence, is_valid, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (market1_id, market2_id, relationship_type)
      DO UPDATE SET similarity_score = $4, confidence = $5, is_valid = $6
      RETURNING id`,
      [
        rel.market1Id,
        rel.market2Id,
        rel.relationshipType,
        rel.similarityScore,
        rel.confidence,
        rel.isValid,
        rel.notes || null,
      ]
    );
    return result.rows[0]?.id;
  }

  /**
   * Get relationships for a market
   */
  async getRelationshipsForMarket(marketId: string): Promise<MarketRelationship[]> {
    const result = await db.query(
      `SELECT * FROM market_relationships
       WHERE (market1_id = $1 OR market2_id = $1) AND is_valid = true`,
      [marketId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      market1Id: row.market1_id,
      market2Id: row.market2_id,
      relationshipType: row.relationship_type,
      similarityScore: parseFloat(row.similarity_score),
      confidence: parseFloat(row.confidence),
      detectedAt: new Date(row.detected_at).getTime(),
      isValid: row.is_valid,
      notes: row.notes,
    }));
  }

  /**
   * Save execution result
   */
  async saveExecution(exec: ExecutionResult): Promise<number> {
    const result = await db.query(
      `INSERT INTO arbitrage_executions (
        opportunity_id, execution_mode,
        leg1_market_id, leg1_outcome, leg1_side, leg1_size, leg1_expected_price,
        leg1_executed_price, leg1_slippage, leg1_tx_hash, leg1_executed_at, leg1_status,
        leg2_market_id, leg2_outcome, leg2_side, leg2_size, leg2_expected_price,
        leg2_executed_price, leg2_slippage, leg2_tx_hash, leg2_executed_at, leg2_status,
        total_size_usd, total_fees, gas_cost_usd,
        expected_profit_usd, realized_profit_usd, profit_percent,
        status, failure_reason, initiated_at, completed_at
      ) VALUES (
        $1, $2,
        $3, $4, $5, $6, $7, $8, $9, $10, to_timestamp($11 / 1000.0), $12,
        $13, $14, $15, $16, $17, $18, $19, $20, to_timestamp($21 / 1000.0), $22,
        $23, $24, $25,
        $26, $27, $28,
        $29, $30, to_timestamp($31 / 1000.0), to_timestamp($32 / 1000.0)
      )
      RETURNING id`,
      [
        exec.opportunityId,
        exec.executionMode,
        exec.leg1.marketId,
        exec.leg1.outcome,
        exec.leg1.side,
        exec.leg1.requestedSize,
        exec.leg1.expectedPrice,
        exec.leg1.executedPrice,
        exec.leg1.slippage,
        exec.leg1.txHash || null,
        exec.leg1.executedAt,
        exec.leg1.status,
        exec.leg2?.marketId || null,
        exec.leg2?.outcome || null,
        exec.leg2?.side || null,
        exec.leg2?.requestedSize || null,
        exec.leg2?.expectedPrice || null,
        exec.leg2?.executedPrice || null,
        exec.leg2?.slippage || null,
        exec.leg2?.txHash || null,
        exec.leg2?.executedAt || null,
        exec.leg2?.status || null,
        exec.totalSizeUsd,
        exec.totalFees,
        exec.gasCostUsd,
        exec.expectedProfitUsd,
        exec.realizedProfitUsd,
        exec.profitPercent,
        exec.status,
        exec.failureReason || null,
        exec.initiatedAt,
        exec.completedAt,
      ]
    );
    return result.rows[0]?.id;
  }

  /**
   * Update execution status
   */
  async updateExecutionStatus(
    id: number,
    status: string,
    realizedProfitUsd?: number,
    failureReason?: string
  ): Promise<void> {
    await db.query(
      `UPDATE arbitrage_executions
       SET status = $1,
           realized_profit_usd = COALESCE($2, realized_profit_usd),
           failure_reason = COALESCE($3, failure_reason),
           completed_at = CASE WHEN $1 IN ('complete', 'failed', 'cancelled') THEN NOW() ELSE completed_at END
       WHERE id = $4`,
      [status, realizedProfitUsd, failureReason, id]
    );
  }

  /**
   * Get executions for an opportunity
   */
  async getExecutionsForOpportunity(oppId: number): Promise<ExecutionResult[]> {
    const result = await db.query(
      `SELECT * FROM arbitrage_executions WHERE opportunity_id = $1 ORDER BY initiated_at DESC`,
      [oppId]
    );
    return result.rows.map(this.mapExecutionRow);
  }

  /**
   * Get recent executions
   */
  async getRecentExecutions(
    mode: ExecutionMode,
    limit: number = 50
  ): Promise<ExecutionResult[]> {
    const result = await db.query(
      `SELECT * FROM arbitrage_executions
       WHERE execution_mode = $1
       ORDER BY initiated_at DESC
       LIMIT $2`,
      [mode, limit]
    );
    return result.rows.map(this.mapExecutionRow);
  }

  /**
   * Update or insert daily P&L
   */
  async upsertDailyPnL(pnl: DailyPnL): Promise<void> {
    await db.query(
      `INSERT INTO arbitrage_pnl_daily (
        date, execution_mode,
        opportunities_detected, executions_attempted, executions_successful,
        total_volume_usd, gross_profit_usd, total_fees_usd, total_gas_usd, net_profit_usd,
        multi_outcome_profit, cross_market_profit, related_market_profit, max_drawdown_usd
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (date, execution_mode) DO UPDATE SET
        opportunities_detected = $3,
        executions_attempted = $4,
        executions_successful = $5,
        total_volume_usd = $6,
        gross_profit_usd = $7,
        total_fees_usd = $8,
        total_gas_usd = $9,
        net_profit_usd = $10,
        multi_outcome_profit = $11,
        cross_market_profit = $12,
        related_market_profit = $13,
        max_drawdown_usd = $14`,
      [
        pnl.date,
        pnl.executionMode,
        pnl.opportunitiesDetected,
        pnl.executionsAttempted,
        pnl.executionsSuccessful,
        pnl.totalVolumeUsd,
        pnl.grossProfitUsd,
        pnl.totalFeesUsd,
        pnl.totalGasUsd,
        pnl.netProfitUsd,
        pnl.multiOutcomeProfit,
        pnl.crossMarketProfit,
        pnl.relatedMarketProfit,
        pnl.maxDrawdownUsd,
      ]
    );
  }

  /**
   * Get daily P&L for a date range
   */
  async getDailyPnL(
    mode: ExecutionMode,
    startDate: string,
    endDate: string
  ): Promise<DailyPnL[]> {
    const result = await db.query(
      `SELECT * FROM arbitrage_pnl_daily
       WHERE execution_mode = $1 AND date >= $2 AND date <= $3
       ORDER BY date DESC`,
      [mode, startDate, endDate]
    );
    return result.rows.map((row) => ({
      date: row.date,
      executionMode: row.execution_mode,
      opportunitiesDetected: row.opportunities_detected,
      executionsAttempted: row.executions_attempted,
      executionsSuccessful: row.executions_successful,
      totalVolumeUsd: parseFloat(row.total_volume_usd),
      grossProfitUsd: parseFloat(row.gross_profit_usd),
      totalFeesUsd: parseFloat(row.total_fees_usd),
      totalGasUsd: parseFloat(row.total_gas_usd),
      netProfitUsd: parseFloat(row.net_profit_usd),
      multiOutcomeProfit: parseFloat(row.multi_outcome_profit),
      crossMarketProfit: parseFloat(row.cross_market_profit),
      relatedMarketProfit: parseFloat(row.related_market_profit),
      maxDrawdownUsd: parseFloat(row.max_drawdown_usd),
    }));
  }

  /**
   * Get summary stats
   */
  async getSummaryStats(mode: ExecutionMode): Promise<{
    totalOpportunities: number;
    totalExecutions: number;
    successfulExecutions: number;
    totalProfitUsd: number;
    avgProfitPercent: number;
  }> {
    const oppResult = await db.query(
      `SELECT COUNT(*) as count FROM arbitrage_opportunities`
    );
    const execResult = await db.query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as successful,
        COALESCE(SUM(realized_profit_usd), 0) as total_profit,
        COALESCE(AVG(profit_percent), 0) as avg_profit
       FROM arbitrage_executions
       WHERE execution_mode = $1`,
      [mode]
    );

    return {
      totalOpportunities: parseInt(oppResult.rows[0]?.count || '0'),
      totalExecutions: parseInt(execResult.rows[0]?.total || '0'),
      successfulExecutions: parseInt(execResult.rows[0]?.successful || '0'),
      totalProfitUsd: parseFloat(execResult.rows[0]?.total_profit || '0'),
      avgProfitPercent: parseFloat(execResult.rows[0]?.avg_profit || '0'),
    };
  }

  /**
   * Clean up old data
   */
  async cleanupOldData(daysToKeep: number = 30): Promise<void> {
    await db.query(
      `DELETE FROM arbitrage_opportunities
       WHERE status IN ('expired', 'invalid')
       AND detected_at < NOW() - INTERVAL '${daysToKeep} days'`
    );
  }

  private mapExecutionRow(row: any): ExecutionResult {
    return {
      id: row.id,
      opportunityId: row.opportunity_id,
      executionMode: row.execution_mode,
      leg1: {
        marketId: row.leg1_market_id,
        outcome: row.leg1_outcome,
        side: row.leg1_side,
        requestedSize: parseFloat(row.leg1_size),
        filledSize: parseFloat(row.leg1_size),
        expectedPrice: parseFloat(row.leg1_expected_price),
        executedPrice: row.leg1_executed_price
          ? parseFloat(row.leg1_executed_price)
          : null,
        slippage: row.leg1_slippage ? parseFloat(row.leg1_slippage) : null,
        txHash: row.leg1_tx_hash,
        executedAt: row.leg1_executed_at
          ? new Date(row.leg1_executed_at).getTime()
          : null,
        status: row.leg1_status,
      },
      leg2: row.leg2_market_id
        ? {
            marketId: row.leg2_market_id,
            outcome: row.leg2_outcome,
            side: row.leg2_side,
            requestedSize: parseFloat(row.leg2_size),
            filledSize: parseFloat(row.leg2_size),
            expectedPrice: parseFloat(row.leg2_expected_price),
            executedPrice: row.leg2_executed_price
              ? parseFloat(row.leg2_executed_price)
              : null,
            slippage: row.leg2_slippage ? parseFloat(row.leg2_slippage) : null,
            txHash: row.leg2_tx_hash,
            executedAt: row.leg2_executed_at
              ? new Date(row.leg2_executed_at).getTime()
              : null,
            status: row.leg2_status,
          }
        : null,
      totalSizeUsd: parseFloat(row.total_size_usd),
      totalFees: parseFloat(row.total_fees),
      gasCostUsd: parseFloat(row.gas_cost_usd),
      expectedProfitUsd: parseFloat(row.expected_profit_usd),
      realizedProfitUsd: row.realized_profit_usd
        ? parseFloat(row.realized_profit_usd)
        : null,
      profitPercent: row.profit_percent
        ? parseFloat(row.profit_percent)
        : null,
      status: row.status,
      failureReason: row.failure_reason,
      initiatedAt: new Date(row.initiated_at).getTime(),
      completedAt: row.completed_at
        ? new Date(row.completed_at).getTime()
        : null,
    };
  }
}

export const arbitrageRepo = new ArbitrageRepository();
