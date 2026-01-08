import { db } from './client';
import { ActiveMarket, LiveTrade, MarketSnapshot, TraderReputation } from '../forwardTest/types';

/**
 * Database Repository
 * Handles all database operations for forward testing
 * Simplified to store core data and map to application types
 */
export class ForwardTestRepository {

  // ============ MARKETS ============

  async saveMarket(market: ActiveMarket): Promise<void> {
    if (!db.isConfigured()) return;

    await db.query(
      `INSERT INTO markets (id, condition_id, question, category, end_date, outcome_prices, volume, liquidity, created_at, resolved_at, resolved_outcome)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         category = EXCLUDED.category,
         volume = EXCLUDED.volume,
         liquidity = EXCLUDED.liquidity,
         outcome_prices = EXCLUDED.outcome_prices,
         resolved_at = EXCLUDED.resolved_at,
         resolved_outcome = EXCLUDED.resolved_outcome`,
      [
        market.id,
        market.id, // Using id as condition_id for simplicity
        market.question,
        market.category,
        market.endDate ? new Date(market.endDate * 1000) : null,
        JSON.stringify(market.currentPrices),
        market.volume,
        market.liquidity,
        new Date(market.createdAt * 1000),
        market.resolvedAt ? new Date(market.resolvedAt * 1000) : null,
        market.resolvedOutcome !== undefined ? market.resolvedOutcome : null
      ]
    );
  }

  async getAllMarkets(): Promise<ActiveMarket[]> {
    if (!db.isConfigured()) return [];

    const result = await db.query('SELECT * FROM markets ORDER BY created_at DESC');

    return result.rows.map((row: any) => ({
      id: row.id,
      question: row.question,
      outcomes: ['Yes', 'No'], // Default for binary markets
      liquidity: parseFloat(row.liquidity),
      volume: parseFloat(row.volume),
      createdAt: Math.floor(new Date(row.created_at).getTime() / 1000),
      endDate: row.end_date ? Math.floor(new Date(row.end_date).getTime() / 1000) : null,
      category: row.category || 'Other',
      currentPrices: row.outcome_prices || [0.5, 0.5],
      resolvedOutcome: row.resolved_outcome,
      resolvedAt: row.resolved_at ? Math.floor(new Date(row.resolved_at).getTime() / 1000) : undefined
    }));
  }

  async updateMarketResolution(marketId: string, outcome: number): Promise<void> {
    if (!db.isConfigured()) return;

    await db.query(
      `UPDATE markets SET resolved_outcome = $1, resolved_at = NOW() WHERE id = $2`,
      [outcome, marketId]
    );

    // Also update all trades for this market
    await db.query(
      `UPDATE trades SET was_correct = (outcome = $1) WHERE market_id = $2 AND was_correct IS NULL`,
      [outcome, marketId]
    );
  }

  // ============ TRADES ============

  async saveTrade(trade: LiveTrade): Promise<void> {
    if (!db.isConfigured()) return;

    await db.query(
      `INSERT INTO trades (
        id, market_id, trader, outcome, size, price, timestamp,
        market_liquidity, market_volume, market_age, days_until_close,
        volume_share, price_before_trade, price_after_5min, price_after_15min,
        price_after_1hr, is_part_of_cluster, cluster_size, is_contrarian,
        was_correct, was_favorite, was_underdog
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
       ON CONFLICT (id) DO UPDATE SET
         price_after_5min = EXCLUDED.price_after_5min,
         price_after_15min = EXCLUDED.price_after_15min,
         price_after_1hr = EXCLUDED.price_after_1hr,
         is_part_of_cluster = EXCLUDED.is_part_of_cluster,
         cluster_size = EXCLUDED.cluster_size,
         was_correct = EXCLUDED.was_correct`,
      [
        trade.id,
        trade.marketId,
        trade.trader,
        trade.outcome,
        trade.size,
        trade.price,
        new Date(trade.timestamp * 1000),
        trade.marketLiquidity,
        trade.marketVolume,
        trade.marketAge,
        trade.daysUntilClose,
        trade.volumeShare,
        trade.priceBeforeTrade,
        trade.priceAfter5min,
        trade.priceAfter15min,
        trade.priceAfter1hr,
        trade.isPartOfCluster || false,
        trade.clusterSize,
        trade.isContrarian || false,
        trade.wasCorrect,
        trade.wasFavorite,
        trade.wasUnderdog
      ]
    );
  }

  async getAllTrades(): Promise<LiveTrade[]> {
    if (!db.isConfigured()) return [];

    const result = await db.query(
      'SELECT * FROM trades ORDER BY timestamp DESC'
    );

    return result.rows.map((row: any) => this.rowToTrade(row));
  }

  async getResolvedTrades(): Promise<LiveTrade[]> {
    if (!db.isConfigured()) return [];

    const result = await db.query(
      'SELECT * FROM trades WHERE was_correct IS NOT NULL ORDER BY timestamp DESC'
    );

    return result.rows.map((row: any) => this.rowToTrade(row));
  }

  private rowToTrade(row: any): LiveTrade {
    return {
      id: row.id,
      marketId: row.market_id,
      trader: row.trader,
      outcome: row.outcome,
      size: parseFloat(row.size),
      price: parseFloat(row.price),
      timestamp: Math.floor(new Date(row.timestamp).getTime() / 1000),
      marketLiquidity: parseFloat(row.market_liquidity),
      marketVolume: parseFloat(row.market_volume),
      marketAge: row.market_age,
      daysUntilClose: row.days_until_close,
      volumeShare: parseFloat(row.volume_share),
      priceBeforeTrade: row.price_before_trade ? parseFloat(row.price_before_trade) : undefined,
      priceAfter5min: row.price_after_5min ? parseFloat(row.price_after_5min) : undefined,
      priceAfter15min: row.price_after_15min ? parseFloat(row.price_after_15min) : undefined,
      priceAfter1hr: row.price_after_1hr ? parseFloat(row.price_after_1hr) : undefined,
      isPartOfCluster: row.is_part_of_cluster,
      clusterSize: row.cluster_size,
      isContrarian: row.is_contrarian,
      wasCorrect: row.was_correct,
      wasFavorite: row.was_favorite,
      wasUnderdog: row.was_underdog
    };
  }

  // ============ SNAPSHOTS ============

  async saveSnapshot(snapshot: MarketSnapshot): Promise<void> {
    if (!db.isConfigured()) return;

    await db.query(
      `INSERT INTO market_snapshots (market_id, trade_id, timestamp, outcome_prices, volume, liquidity)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        snapshot.marketId,
        null, // We don't track tradeId in the current type
        new Date(snapshot.timestamp * 1000),
        JSON.stringify(snapshot.prices),
        snapshot.volume,
        snapshot.liquidity
      ]
    );
  }

  async getSnapshotsByMarket(marketId: string): Promise<MarketSnapshot[]> {
    if (!db.isConfigured()) return [];

    const result = await db.query(
      'SELECT * FROM market_snapshots WHERE market_id = $1 ORDER BY timestamp ASC',
      [marketId]
    );

    return result.rows.map((row: any) => ({
      marketId: row.market_id,
      timestamp: Math.floor(new Date(row.timestamp).getTime() / 1000),
      prices: row.outcome_prices || [0.5, 0.5],
      liquidity: parseFloat(row.liquidity),
      volume: parseFloat(row.volume),
      tradesLast1hr: 0,
      volumeLast1hr: 0,
      tradesLast6hr: 0,
      volumeLast6hr: 0,
      tradesLast24hr: 0,
      volumeLast24hr: 0,
      topWalletShare: 0,
      top3WalletShare: 0,
      top10WalletShare: 0,
      volumeOnYes: 0,
      volumeOnNo: 0,
      outcomeSkew: 0
    }));
  }

  // ============ TRADER REPUTATION ============

  async saveTraderReputation(trader: TraderReputation): Promise<void> {
    if (!db.isConfigured()) return;

    // Calculate derived stats
    const lowLiqTrades = 0; // Would need additional tracking
    const lowLiqCorrect = 0;
    const highLiqTrades = 0;
    const highLiqCorrect = 0;

    await db.query(
      `INSERT INTO trader_reputation (
        address, total_trades, resolved_trades, correct_trades, total_volume,
        total_profit, accuracy, roi, reputation_score, low_liq_trades,
        low_liq_correct, high_liq_trades, high_liq_correct, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
       ON CONFLICT (address) DO UPDATE SET
         total_trades = EXCLUDED.total_trades,
         resolved_trades = EXCLUDED.resolved_trades,
         correct_trades = EXCLUDED.correct_trades,
         total_volume = EXCLUDED.total_volume,
         total_profit = EXCLUDED.total_profit,
         accuracy = EXCLUDED.accuracy,
         roi = EXCLUDED.roi,
         reputation_score = EXCLUDED.reputation_score,
         low_liq_trades = EXCLUDED.low_liq_trades,
         low_liq_correct = EXCLUDED.low_liq_correct,
         high_liq_trades = EXCLUDED.high_liq_trades,
         high_liq_correct = EXCLUDED.high_liq_correct,
         updated_at = NOW()`,
      [
        trader.address,
        trader.totalTrades,
        trader.resolvedTrades,
        trader.correctTrades,
        trader.totalVolume,
        trader.profitLoss,
        trader.accuracy,
        trader.roi,
        trader.reputationScore,
        lowLiqTrades,
        lowLiqCorrect,
        highLiqTrades,
        highLiqCorrect
      ]
    );
  }

  async getAllTraderReputations(): Promise<TraderReputation[]> {
    if (!db.isConfigured()) return [];

    const result = await db.query(
      'SELECT * FROM trader_reputation ORDER BY reputation_score DESC'
    );

    return result.rows.map((row: any) => ({
      address: row.address,
      totalTrades: row.total_trades,
      resolvedTrades: row.resolved_trades,
      correctTrades: row.correct_trades,
      totalVolume: parseFloat(row.total_volume),
      avgTradeSize: row.total_trades > 0 ? parseFloat(row.total_volume) / row.total_trades : 0,
      profitLoss: parseFloat(row.total_profit || 0),
      accuracy: parseFloat(row.accuracy),
      roi: parseFloat(row.roi),
      reputationScore: parseFloat(row.reputation_score),
      lowLiqAccuracy: row.low_liq_trades > 0 ? row.low_liq_correct / row.low_liq_trades : 0,
      highLiqAccuracy: row.high_liq_trades > 0 ? row.high_liq_correct / row.high_liq_trades : 0,
      lastTradeAt: row.updated_at ? Math.floor(new Date(row.updated_at).getTime() / 1000) : 0
    }));
  }

  // ============ ANALYTICS ============

  async getTradeStats(): Promise<{
    totalTrades: number;
    resolvedTrades: number;
    totalVolume: number;
    avgTradeSize: number;
  }> {
    if (!db.isConfigured()) {
      return { totalTrades: 0, resolvedTrades: 0, totalVolume: 0, avgTradeSize: 0 };
    }

    const result = await db.query(
      `SELECT
        COUNT(*) as total_trades,
        COUNT(*) FILTER (WHERE was_correct IS NOT NULL) as resolved_trades,
        COALESCE(SUM(size), 0) as total_volume,
        COALESCE(AVG(size), 0) as avg_trade_size
       FROM trades`
    );

    const row = result.rows[0];
    return {
      totalTrades: parseInt(row.total_trades),
      resolvedTrades: parseInt(row.resolved_trades),
      totalVolume: parseFloat(row.total_volume),
      avgTradeSize: parseFloat(row.avg_trade_size)
    };
  }
}

export const repository = new ForwardTestRepository();
