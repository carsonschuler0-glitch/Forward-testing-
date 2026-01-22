import { LiveTrade, ActiveMarket, TraderReputation, TradeCluster, ForwardTestAnalysis, MarketSnapshot } from './types';

/**
 * Analyzes forward test data with extremely granular bucketing
 */
export class ForwardTestAnalyzer {
  private traderStats = new Map<string, TraderReputation>();

  /**
   * Generate granular trade size buckets ($1k increments)
   */
  private generateTradeSizeBuckets(trades: LiveTrade[]) {
    const buckets: any = {};

    // Create buckets: $1k-$2k, $2k-$3k, ... up to $50k, then >$50k
    for (let i = 1; i <= 50; i++) {
      const min = i * 1000;
      const max = (i + 1) * 1000;
      const key = `$${i}k-$${i + 1}k`;

      const tradesInRange = trades.filter(t => t.size >= min && t.size < max);
      const resolvedInRange = tradesInRange.filter(t => t.wasCorrect !== undefined);
      const correctTrades = tradesInRange.filter(t => t.wasCorrect === true);
      const avgSize = tradesInRange.length > 0
        ? tradesInRange.reduce((sum, t) => sum + t.size, 0) / tradesInRange.length
        : 0;

      if (tradesInRange.length > 0) {
        buckets[key] = {
          totalTrades: tradesInRange.length,
          resolvedTrades: resolvedInRange.length,
          correctTrades: correctTrades.length,
          accuracy: resolvedInRange.length > 0 ? correctTrades.length / resolvedInRange.length : 0,
          avgSize,
        };
      }
    }

    // Add >$50k bucket
    const largeTradesInRange = trades.filter(t => t.size >= 50000);
    const largeResolvedInRange = largeTradesInRange.filter(t => t.wasCorrect !== undefined);
    const largeCorrectTrades = largeTradesInRange.filter(t => t.wasCorrect === true);
    const largAvgSize = largeTradesInRange.length > 0
      ? largeTradesInRange.reduce((sum, t) => sum + t.size, 0) / largeTradesInRange.length
      : 0;

    if (largeTradesInRange.length > 0) {
      buckets['>$50k'] = {
        totalTrades: largeTradesInRange.length,
        resolvedTrades: largeResolvedInRange.length,
        correctTrades: largeCorrectTrades.length,
        accuracy: largeResolvedInRange.length > 0 ? largeCorrectTrades.length / largeResolvedInRange.length : 0,
        avgSize: largAvgSize,
      };
    }

    return buckets;
  }

  /**
   * Generate granular liquidity buckets ($500 increments)
   */
  private generateLiquidityBuckets(trades: LiveTrade[], markets: Map<string, ActiveMarket>) {
    const buckets: any = {};

    // Create buckets: $0-$500, $500-$1000, ... up to $100k, then >$100k
    for (let i = 0; i < 200; i++) {
      const min = i * 500;
      const max = (i + 1) * 500;
      const key = `$${(min / 1000).toFixed(1)}k-$${(max / 1000).toFixed(1)}k`;

      const tradesInRange = trades.filter(t => {
        const market = markets.get(t.marketId);
        return market && market.liquidity >= min && market.liquidity < max;
      });

      if (tradesInRange.length === 0) continue;

      const resolvedInRange = tradesInRange.filter(t => t.wasCorrect !== undefined);
      const correctTrades = tradesInRange.filter(t => t.wasCorrect === true);
      const marketsInRange = new Set(tradesInRange.map(t => t.marketId));
      const avgLiq = tradesInRange.length > 0
        ? tradesInRange.reduce((sum, t) => sum + (markets.get(t.marketId)?.liquidity || 0), 0) / tradesInRange.length
        : 0;

      buckets[key] = {
        totalMarkets: marketsInRange.size,
        totalTrades: tradesInRange.length,
        resolvedTrades: resolvedInRange.length,
        correctTrades: correctTrades.length,
        accuracy: resolvedInRange.length > 0 ? correctTrades.length / resolvedInRange.length : 0,
        avgLiquidity: avgLiq,
      };
    }

    // Add >$100k bucket
    const largeTradesInRange = trades.filter(t => {
      const market = markets.get(t.marketId);
      return market && market.liquidity >= 100000;
    });

    if (largeTradesInRange.length > 0) {
      const largeResolvedInRange = largeTradesInRange.filter(t => t.wasCorrect !== undefined);
      const largeCorrectTrades = largeTradesInRange.filter(t => t.wasCorrect === true);
      const largeMarketsInRange = new Set(largeTradesInRange.map(t => t.marketId));
      const largeAvgLiq = largeTradesInRange.reduce((sum, t) => sum + (markets.get(t.marketId)?.liquidity || 0), 0) / largeTradesInRange.length;

      buckets['>$100k'] = {
        totalMarkets: largeMarketsInRange.size,
        totalTrades: largeTradesInRange.length,
        resolvedTrades: largeResolvedInRange.length,
        correctTrades: largeCorrectTrades.length,
        accuracy: largeResolvedInRange.length > 0 ? largeCorrectTrades.length / largeResolvedInRange.length : 0,
        avgLiquidity: largeAvgLiq,
      };
    }

    return buckets;
  }

  /**
   * Analyze volume share buckets
   */
  private analyzeVolumeShare(trades: LiveTrade[]) {
    const ranges = [
      { name: '<1% of volume', min: 0, max: 0.01 },
      { name: '1-2% of volume', min: 0.01, max: 0.02 },
      { name: '2-5% of volume', min: 0.02, max: 0.05 },
      { name: '5-10% of volume', min: 0.05, max: 0.10 },
      { name: '10-20% of volume', min: 0.10, max: 0.20 },
      { name: '20-30% of volume', min: 0.20, max: 0.30 },
      { name: '>30% of volume', min: 0.30, max: Infinity },
    ];

    const buckets: any = {};

    ranges.forEach(range => {
      const tradesInRange = trades.filter(t => t.volumeShare >= range.min && t.volumeShare < range.max);
      const correctTrades = tradesInRange.filter(t => t.wasCorrect === true);

      if (tradesInRange.length > 0) {
        buckets[range.name] = {
          totalTrades: tradesInRange.length,
          correctTrades: correctTrades.length,
          accuracy: correctTrades.length / tradesInRange.length,
        };
      }
    });

    return buckets;
  }

  /**
   * Analyze market age at time of trade
   */
  private analyzeMarketAge(trades: LiveTrade[]) {
    const ranges = [
      { name: '<6 hours', min: 0, max: 0.25 },
      { name: '6-12 hours', min: 0.25, max: 0.5 },
      { name: '12-24 hours', min: 0.5, max: 1 },
      { name: '1-2 days', min: 1, max: 2 },
      { name: '2-3 days', min: 2, max: 3 },
      { name: '3-7 days', min: 3, max: 7 },
      { name: '7-14 days', min: 7, max: 14 },
      { name: '14-30 days', min: 14, max: 30 },
      { name: '>30 days', min: 30, max: Infinity },
    ];

    const buckets: any = {};

    ranges.forEach(range => {
      const tradesInRange = trades.filter(t => t.marketAge >= range.min && t.marketAge < range.max);
      const correctTrades = tradesInRange.filter(t => t.wasCorrect === true);
      const avgAge = tradesInRange.length > 0
        ? tradesInRange.reduce((sum, t) => sum + t.marketAge, 0) / tradesInRange.length
        : 0;

      if (tradesInRange.length > 0) {
        buckets[range.name] = {
          totalTrades: tradesInRange.length,
          correctTrades: correctTrades.length,
          accuracy: correctTrades.length / tradesInRange.length,
          avgAge,
        };
      }
    });

    return buckets;
  }

  /**
   * Analyze price impact by trade size
   */
  private analyzePriceImpact(trades: LiveTrade[]) {
    const ranges = [
      { name: '$1k-$5k', min: 1000, max: 5000 },
      { name: '$5k-$10k', min: 5000, max: 10000 },
      { name: '$10k-$25k', min: 10000, max: 25000 },
      { name: '$25k-$50k', min: 25000, max: 50000 },
      { name: '>$50k', min: 50000, max: Infinity },
    ];

    const analysis: any = {};

    ranges.forEach(range => {
      const tradesInRange = trades.filter(t =>
        t.size >= range.min &&
        t.size < range.max &&
        t.priceBeforeTrade !== undefined
      );

      if (tradesInRange.length === 0) return;

      const impacts5min = tradesInRange
        .filter(t => t.priceAfter5min !== undefined && t.priceBeforeTrade !== undefined)
        .map(t => Math.abs(t.priceAfter5min! - t.priceBeforeTrade!));

      const impacts15min = tradesInRange
        .filter(t => t.priceAfter15min !== undefined && t.priceBeforeTrade !== undefined)
        .map(t => Math.abs(t.priceAfter15min! - t.priceBeforeTrade!));

      const impacts1hr = tradesInRange
        .filter(t => t.priceAfter1hr !== undefined && t.priceBeforeTrade !== undefined)
        .map(t => Math.abs(t.priceAfter1hr! - t.priceBeforeTrade!));

      analysis[range.name] = {
        avgImpact5min: impacts5min.length > 0 ? impacts5min.reduce((s, i) => s + i, 0) / impacts5min.length : 0,
        avgImpact15min: impacts15min.length > 0 ? impacts15min.reduce((s, i) => s + i, 0) / impacts15min.length : 0,
        avgImpact1hr: impacts1hr.length > 0 ? impacts1hr.reduce((s, i) => s + i, 0) / impacts1hr.length : 0,
        tradeCount: tradesInRange.length,
      };
    });

    return analysis;
  }

  /**
   * Detect trade clusters (multiple large trades in short window)
   */
  detectClusters(trades: LiveTrade[], timeWindowMinutes: number = 60): TradeCluster[] {
    const clusters: TradeCluster[] = [];
    const processed = new Set<string>();

    // Sort trades by timestamp
    const sortedTrades = [...trades].sort((a, b) => a.timestamp - b.timestamp);

    for (const trade of sortedTrades) {
      if (processed.has(trade.id)) continue;

      // Find all trades in the same market, same outcome, within time window
      const windowEnd = trade.timestamp + timeWindowMinutes * 60 * 1000;
      const clusterTrades = sortedTrades.filter(t =>
        t.marketId === trade.marketId &&
        t.outcome === trade.outcome &&
        t.timestamp >= trade.timestamp &&
        t.timestamp <= windowEnd &&
        t.size >= 5000 // Only cluster large trades
      );

      // Only create cluster if 3+ trades
      if (clusterTrades.length >= 3) {
        const uniqueTraders = new Set(clusterTrades.map(t => t.trader)).size;
        const totalVolume = clusterTrades.reduce((sum, t) => sum + t.size, 0);
        const avgTradeSize = totalVolume / clusterTrades.length;

        clusters.push({
          marketId: trade.marketId,
          outcome: trade.outcome,
          trades: clusterTrades,
          totalVolume,
          timeWindow: timeWindowMinutes,
          startTime: trade.timestamp,
          endTime: clusterTrades[clusterTrades.length - 1].timestamp,
          uniqueTraders,
          avgTradeSize,
        });

        // Mark all trades in cluster as processed
        clusterTrades.forEach(t => {
          processed.add(t.id);
          t.isPartOfCluster = true;
          t.clusterSize = clusterTrades.length;
          t.clusterTotalVolume = totalVolume;
        });
      }
    }

    return clusters;
  }

  /**
   * Calculate trader reputation scores
   */
  updateTraderReputations(trades: LiveTrade[]): void {
    // Group trades by trader
    const traderTrades = new Map<string, LiveTrade[]>();
    trades.forEach(t => {
      const existing = traderTrades.get(t.trader) || [];
      existing.push(t);
      traderTrades.set(t.trader, existing);
    });

    // Calculate stats for each trader
    traderTrades.forEach((trades, address) => {
      const resolvedTrades = trades.filter(t => t.wasCorrect !== undefined);
      const correctTrades = trades.filter(t => t.wasCorrect === true);
      const totalVolume = trades.reduce((sum, t) => sum + t.size, 0);
      const avgTradeSize = totalVolume / trades.length;

      // Calculate profit/loss (simplified: correct = +price, incorrect = -price)
      let profitLoss = 0;
      resolvedTrades.forEach(t => {
        if (t.wasCorrect) {
          profitLoss += t.size * (1 - t.price); // Profit from winning bet
        } else {
          profitLoss -= t.size * t.price; // Loss from losing bet
        }
      });

      const roi = totalVolume > 0 ? (profitLoss / totalVolume) * 100 : 0;
      const accuracy = resolvedTrades.length > 0 ? correctTrades.length / resolvedTrades.length : 0;

      // Low/high liq performance
      const lowLiqTrades = resolvedTrades.filter(t => t.marketLiquidity < 10000);
      const lowLiqCorrect = lowLiqTrades.filter(t => t.wasCorrect === true);
      const lowLiqAccuracy = lowLiqTrades.length > 0 ? lowLiqCorrect.length / lowLiqTrades.length : 0;

      const highLiqTrades = resolvedTrades.filter(t => t.marketLiquidity >= 10000);
      const highLiqCorrect = highLiqTrades.filter(t => t.wasCorrect === true);
      const highLiqAccuracy = highLiqTrades.length > 0 ? highLiqCorrect.length / highLiqTrades.length : 0;

      // Calculate reputation score (0-100)
      // Weighted: 50% accuracy, 30% ROI, 20% volume
      const accuracyScore = accuracy * 50;
      const roiScore = Math.max(0, Math.min(30, (roi + 50) * 0.3)); // Normalize ROI to 0-30
      const volumeScore = Math.min(20, (totalVolume / 100000) * 20); // $100k = max score
      const reputationScore = accuracyScore + roiScore + volumeScore;

      const lastTradeAt = Math.max(...trades.map(t => t.timestamp));

      this.traderStats.set(address, {
        address,
        totalTrades: trades.length,
        resolvedTrades: resolvedTrades.length,
        correctTrades: correctTrades.length,
        accuracy,
        totalVolume,
        avgTradeSize,
        profitLoss,
        roi,
        lowLiqAccuracy,
        highLiqAccuracy,
        reputationScore,
        lastTradeAt,
      });
    });
  }

  /**
   * Analyze repeat traders (same wallet, multiple trades in same market)
   */
  private analyzeRepeatTraders(trades: LiveTrade[]) {
    const marketTraders = new Map<string, Map<string, LiveTrade[]>>();

    // Group by market, then by trader
    trades.forEach(t => {
      if (!marketTraders.has(t.marketId)) {
        marketTraders.set(t.marketId, new Map());
      }
      const traders = marketTraders.get(t.marketId)!;
      const traderTrades = traders.get(t.trader) || [];
      traderTrades.push(t);
      traders.set(t.trader, traderTrades);
    });

    // Count markets with repeat traders
    let marketsWithRepeat = 0;
    let totalRepeatTrades = 0;
    let correctRepeatTrades = 0;

    marketTraders.forEach(traders => {
      const repeaters = Array.from(traders.values()).filter(trades => trades.length > 1);
      if (repeaters.length > 0) {
        marketsWithRepeat++;
        repeaters.forEach(trades => {
          totalRepeatTrades += trades.length;
          correctRepeatTrades += trades.filter(t => t.wasCorrect === true).length;
        });
      }
    });

    const avgTradesPerRepeater = totalRepeatTrades > 0
      ? totalRepeatTrades / marketsWithRepeat
      : 0;

    const repeaterAccuracy = totalRepeatTrades > 0
      ? correctRepeatTrades / totalRepeatTrades
      : 0;

    return {
      marketsWithRepeatTraders: marketsWithRepeat,
      avgTradesPerRepeater,
      repeaterAccuracy,
    };
  }

  /**
   * Analyze wallet concentration
   */
  private analyzeWalletConcentration(trades: LiveTrade[], snapshots: Map<string, MarketSnapshot>) {
    let highConcentrationCount = 0;
    let highConcCorrectTrades = 0;
    let highConcTotalTrades = 0;

    const marketTrades = new Map<string, LiveTrade[]>();
    trades.forEach(t => {
      const existing = marketTrades.get(t.marketId) || [];
      existing.push(t);
      marketTrades.set(t.marketId, existing);
    });

    marketTrades.forEach((trades, marketId) => {
      const snapshot = snapshots.get(marketId);
      if (!snapshot) return;

      // High concentration = top 3 wallets have >50% of volume
      if (snapshot.top3WalletShare > 0.5) {
        highConcentrationCount++;
        highConcTotalTrades += trades.length;
        highConcCorrectTrades += trades.filter(t => t.wasCorrect === true).length;
      }
    });

    const concentrationAccuracy = highConcTotalTrades > 0
      ? highConcCorrectTrades / highConcTotalTrades
      : 0;

    return {
      highConcentrationMarkets: highConcentrationCount,
      concentrationAccuracy,
    };
  }

  /**
   * Detect sudden influx (velocity spike)
   */
  private detectSuddenInflux(snapshots: Map<string, MarketSnapshot>): number {
    let influxCount = 0;

    snapshots.forEach(snapshot => {
      // Sudden influx = 3x more volume in last 1hr vs last 6hr average
      const avgVol6hr = snapshot.volumeLast6hr / 6;
      if (snapshot.volumeLast1hr > avgVol6hr * 3 && snapshot.volumeLast1hr > 10000) {
        influxCount++;
      }
    });

    return influxCount;
  }

  /**
   * Analyze contrarian vs consensus trades
   */
  private analyzeContrarianTrades(trades: LiveTrade[]) {
    const contrarianTrades = trades.filter(t => t.isContrarian);
    const consensusTrades = trades.filter(t => !t.isContrarian);

    const contrarianResolved = contrarianTrades.filter(t => t.wasCorrect !== undefined);
    const consensusResolved = consensusTrades.filter(t => t.wasCorrect !== undefined);

    const contrarianCorrect = contrarianResolved.filter(t => t.wasCorrect === true).length;
    const consensusCorrect = consensusResolved.filter(t => t.wasCorrect === true).length;

    return {
      contrarianTrades: contrarianTrades.length,
      contrarianCorrect,
      contrarianAccuracy: contrarianResolved.length > 0 ? contrarianCorrect / contrarianResolved.length : 0,
      consensusTrades: consensusTrades.length,
      consensusCorrect,
      consensusAccuracy: consensusResolved.length > 0 ? consensusCorrect / consensusResolved.length : 0
    };
  }

  /**
   * Analyze trades by market category
   */
  private analyzeCategoryBreakdown(trades: LiveTrade[], markets: Map<string, ActiveMarket>) {
    const categoryStats: {
      [category: string]: {
        totalMarkets: number;
        totalTrades: number;
        resolvedTrades: number;
        correctTrades: number;
        accuracy: number;
        totalVolume: number;
        avgTradeSize: number;
      };
    } = {};

    // Group markets by category
    const categoryMarkets = new Map<string, Set<string>>();
    markets.forEach((market, id) => {
      if (!categoryMarkets.has(market.category)) {
        categoryMarkets.set(market.category, new Set());
      }
      categoryMarkets.get(market.category)!.add(id);
    });

    // Analyze trades per category
    categoryMarkets.forEach((marketIds, category) => {
      const categoryTrades = trades.filter(t => marketIds.has(t.marketId));
      const resolvedTrades = categoryTrades.filter(t => t.wasCorrect !== undefined);
      const correctTrades = resolvedTrades.filter(t => t.wasCorrect === true);
      const totalVolume = categoryTrades.reduce((sum, t) => sum + t.size, 0);

      categoryStats[category] = {
        totalMarkets: marketIds.size,
        totalTrades: categoryTrades.length,
        resolvedTrades: resolvedTrades.length,
        correctTrades: correctTrades.length,
        accuracy: resolvedTrades.length > 0 ? correctTrades.length / resolvedTrades.length : 0,
        totalVolume,
        avgTradeSize: categoryTrades.length > 0 ? totalVolume / categoryTrades.length : 0
      };
    });

    return categoryStats;
  }

  /**
   * Generate full analysis
   */
  generateAnalysis(
    trades: LiveTrade[],
    markets: Map<string, ActiveMarket>,
    snapshots: Map<string, MarketSnapshot>
  ): ForwardTestAnalysis {
    // Update trader reputations
    this.updateTraderReputations(trades);

    // Detect clusters
    const clusters = this.detectClusters(trades);
    const clustersCorrect = clusters.filter(c =>
      c.trades.filter(t => t.wasCorrect === true).length > c.trades.length / 2
    ).length;

    // Analyze various dimensions
    const tradeSizeBuckets = this.generateTradeSizeBuckets(trades);
    const liquidityBuckets = this.generateLiquidityBuckets(trades, markets);
    const volumeShareBuckets = this.analyzeVolumeShare(trades);
    const marketAgeBuckets = this.analyzeMarketAge(trades);
    const priceImpactAnalysis = this.analyzePriceImpact(trades);
    const categoryBreakdown = this.analyzeCategoryBreakdown(trades, markets);
    const contrarianAnalysis = this.analyzeContrarianTrades(trades);

    const repeatAnalysis = this.analyzeRepeatTraders(trades);
    const concentrationAnalysis = this.analyzeWalletConcentration(trades, snapshots);
    const influxCount = this.detectSuddenInflux(snapshots);

    // Get top traders
    const topTraders = Array.from(this.traderStats.values())
      .sort((a, b) => b.reputationScore - a.reputationScore)
      .slice(0, 20);

    // Calculate counts
    const resolvedTrades = trades.filter(t => t.wasCorrect !== undefined);
    const resolvedMarkets = new Set(resolvedTrades.map(t => t.marketId)).size;

    return {
      startTime: Math.min(...trades.map(t => t.timestamp)),
      endTime: Math.max(...trades.map(t => t.timestamp)),
      totalMarkets: markets.size,
      activeMarkets: markets.size - resolvedMarkets,
      resolvedMarkets,
      totalTrades: trades.length,
      resolvedTrades: resolvedTrades.length,
      tradeSizeBuckets,
      liquidityBuckets,
      volumeShareBuckets,
      marketAgeBuckets,
      priceImpactAnalysis,
      categoryBreakdown,
      ...contrarianAnalysis,
      totalClusters: clusters.length,
      clustersCorrect,
      clusterAccuracy: clusters.length > 0 ? clustersCorrect / clusters.length : 0,
      avgClusterSize: clusters.length > 0
        ? clusters.reduce((sum, c) => sum + c.trades.length, 0) / clusters.length
        : 0,
      topTraders,
      ...repeatAnalysis,
      ...concentrationAnalysis,
      marketsWithSuddenInflux: influxCount,
      influxAccuracy: 0, // TODO: calculate when markets resolve
      recommendations: this.generateRecommendations(topTraders, clusters),
    };
  }

  private generateRecommendations(traders: TraderReputation[], clusters: TradeCluster[]): string[] {
    const recs: string[] = [];

    if (traders.length > 0 && traders[0].reputationScore > 70) {
      recs.push(`Top trader ${traders[0].address.substring(0, 12)}... has ${traders[0].reputationScore.toFixed(0)} reputation score with ${(traders[0].accuracy * 100).toFixed(1)}% accuracy`);
    }

    if (clusters.length > 0) {
      recs.push(`Detected ${clusters.length} trade clusters - track these for sharp money signals`);
    }

    return recs;
  }

  getTraderReputation(address: string): TraderReputation | undefined {
    return this.traderStats.get(address);
  }
}
