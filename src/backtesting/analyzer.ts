import { HistoricalMarket, HistoricalTrade, TraderPerformance, BacktestResult } from './types';

export class BacktestAnalyzer {
  /**
   * Analyze all trades and determine which were correct/incorrect
   */
  analyzeTrades(
    markets: HistoricalMarket[],
    trades: HistoricalTrade[]
  ): HistoricalTrade[] {
    const marketOutcomes = new Map<string, number>();

    // Build map of market outcomes
    markets.forEach(market => {
      if (market.resolvedOutcome !== null) {
        marketOutcomes.set(market.id, market.resolvedOutcome);
      }
    });

    // Mark each trade as correct or incorrect
    // If wasCorrect is already set (from synthetic data), keep it
    return trades.map(trade => ({
      ...trade,
      wasCorrect: trade.wasCorrect !== undefined
        ? trade.wasCorrect
        : trade.outcome === marketOutcomes.get(trade.marketId),
    }));
  }

  /**
   * Calculate performance metrics for each trader
   */
  calculateTraderPerformance(
    trades: HistoricalTrade[],
    markets: HistoricalMarket[]
  ): Map<string, TraderPerformance> {
    const traderTrades = new Map<string, HistoricalTrade[]>();

    // Group trades by trader
    trades.forEach(trade => {
      if (!traderTrades.has(trade.trader)) {
        traderTrades.set(trade.trader, []);
      }
      traderTrades.get(trade.trader)!.push(trade);
    });

    const performances = new Map<string, TraderPerformance>();

    // Calculate metrics for each trader
    traderTrades.forEach((traderTradeList, address) => {
      const correctTrades = traderTradeList.filter(t => t.wasCorrect === true);
      const incorrectTrades = traderTradeList.filter(t => t.wasCorrect === false);
      const totalTrades = traderTradeList.length;
      const accuracy = totalTrades > 0 ? correctTrades.length / totalTrades : 0;

      const totalVolume = traderTradeList.reduce((sum, t) => sum + t.size, 0);
      const avgTradeSize = totalVolume / totalTrades;

      // Calculate P&L (simplified)
      const profitLoss = correctTrades.reduce((sum, t) => sum + t.size * (1 - t.price), 0) -
                        incorrectTrades.reduce((sum, t) => sum + t.size * t.price, 0);
      const roi = totalVolume > 0 ? (profitLoss / totalVolume) * 100 : 0;

      // Calculate Sharpe Ratio (simplified - assumes constant returns)
      const returns = traderTradeList.map(t =>
        t.wasCorrect ? (1 - t.price) : -t.price
      );
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const stdDev = Math.sqrt(
        returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
      );
      const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

      // Calculate accuracy in low vs high liquidity markets
      const marketLiquidityMap = new Map(markets.map(m => [m.id, m.liquidity]));
      const lowLiqTrades = traderTradeList.filter(
        t => (marketLiquidityMap.get(t.marketId) || Infinity) < 10000
      );
      const highLiqTrades = traderTradeList.filter(
        t => (marketLiquidityMap.get(t.marketId) || 0) >= 10000
      );

      const lowLiquidityAccuracy = lowLiqTrades.length > 0
        ? lowLiqTrades.filter(t => t.wasCorrect).length / lowLiqTrades.length
        : 0;
      const highLiquidityAccuracy = highLiqTrades.length > 0
        ? highLiqTrades.filter(t => t.wasCorrect).length / highLiqTrades.length
        : 0;

      performances.set(address, {
        address,
        totalTrades,
        correctTrades: correctTrades.length,
        incorrectTrades: incorrectTrades.length,
        accuracy,
        totalVolume,
        avgTradeSize,
        profitLoss,
        roi,
        sharpeRatio,
        lowLiquidityAccuracy,
        highLiquidityAccuracy,
      });
    });

    return performances;
  }

  /**
   * Identify patterns in sharp money vs dumb money
   */
  identifyPatterns(
    trades: HistoricalTrade[],
    markets: HistoricalMarket[]
  ): BacktestResult {
    const marketMap = new Map(markets.map(m => [m.id, m]));

    // Calculate category breakdown
    const categoryBreakdown = this.analyzeCategoryBreakdown(trades, markets);

    // Calculate granular liquidity breakdown
    const liquidityBreakdown = this.analyzeLiquidityBreakdown(trades, markets);

    // Calculate favorite vs underdog breakdown
    const favoriteVsUnderdogBreakdown = this.analyzeFavoriteVsUnderdog(trades);

    // Separate sharp (correct) and dumb (incorrect) trades
    const sharpTrades = trades.filter(t => t.wasCorrect === true);
    const dumbTrades = trades.filter(t => t.wasCorrect === false);

    // Analyze sharp money patterns
    const sharpLiquidities = sharpTrades
      .map(t => marketMap.get(t.marketId)?.liquidity || 0)
      .filter(l => l > 0);
    const avgLiquidityOfSharpTrades = sharpLiquidities.length > 0
      ? sharpLiquidities.reduce((a, b) => a + b, 0) / sharpLiquidities.length
      : 0;

    const sharpTimings = sharpTrades
      .map(t => {
        const market = marketMap.get(t.marketId);
        return market?.resolvedAt ? market.resolvedAt - t.timestamp : 0;
      })
      .filter(t => t > 0);
    const avgTimingSharp = sharpTimings.length > 0
      ? sharpTimings.reduce((a, b) => a + b, 0) / sharpTimings.length
      : 0;

    // Analyze dumb money patterns
    const dumbLiquidities = dumbTrades
      .map(t => marketMap.get(t.marketId)?.liquidity || 0)
      .filter(l => l > 0);
    const avgLiquidityOfDumbTrades = dumbLiquidities.length > 0
      ? dumbLiquidities.reduce((a, b) => a + b, 0) / dumbLiquidities.length
      : 0;

    const dumbTimings = dumbTrades
      .map(t => {
        const market = marketMap.get(t.marketId);
        return market?.resolvedAt ? market.resolvedAt - t.timestamp : 0;
      })
      .filter(t => t > 0);
    const avgTimingDumb = dumbTimings.length > 0
      ? dumbTimings.reduce((a, b) => a + b, 0) / dumbTimings.length
      : 0;

    // Calculate trader performances
    const performances = this.calculateTraderPerformance(trades, markets);
    const topPerformers = Array.from(performances.values())
      .filter(p => p.totalTrades >= 5) // Min 5 trades
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 20);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      avgLiquidityOfSharpTrades,
      avgLiquidityOfDumbTrades,
      avgTimingSharp,
      avgTimingDumb,
      topPerformers
    );

    // NEW PROSPECTIVE ANALYSES
    const tradeSizeAnalysis = this.analyzeTradeSizes(trades);
    const volumeShareAnalysis = this.analyzeVolumeShare(trades, marketMap);
    const timingAnalysis = this.analyzeTraceTiming(trades, marketMap);
    const categoryTimingAnalysis = this.analyzeCategoryTiming(trades, marketMap);

    return {
      totalMarkets: markets.length,
      totalTrades: trades.length,
      dateRange: {
        start: Math.min(...markets.map(m => m.createdAt)),
        end: Math.max(...markets.map(m => m.resolvedAt || m.createdAt)),
      },
      topPerformers,
      sharpMoneyPatterns: {
        avgLiquidityOfSharpTrades,
        avgTimingBeforeResolution: avgTimingSharp / (1000 * 60 * 60 * 24), // Convert to days
        commonCharacteristics: this.identifySharpCharacteristics(sharpTrades, marketMap),
      },
      dumbMoneyPatterns: {
        avgLiquidityOfDumbTrades,
        avgTimingBeforeResolution: avgTimingDumb / (1000 * 60 * 60 * 24),
        commonCharacteristics: this.identifyDumbCharacteristics(dumbTrades, marketMap),
      },
      recommendations,
      categoryBreakdown,
      liquidityBreakdown,
      favoriteVsUnderdogBreakdown,
      tradeSizeAnalysis,
      volumeShareAnalysis,
      timingAnalysis,
      categoryTimingAnalysis,
    };
  }

  private analyzeTradeSizes(trades: HistoricalTrade[]) {
    const ranges = [
      { name: '$1k-$2k', min: 1000, max: 2000 },
      { name: '$2k-$5k', min: 2000, max: 5000 },
      { name: '$5k-$10k', min: 5000, max: 10000 },
      { name: '$10k-$25k', min: 10000, max: 25000 },
      { name: '$25k-$50k', min: 25000, max: 50000 },
      { name: '>$50k', min: 50000, max: Infinity },
    ];

    const breakdown: any = {};

    ranges.forEach(range => {
      const tradesInRange = trades.filter(t => t.size >= range.min && t.size < range.max);
      const correctTrades = tradesInRange.filter(t => t.wasCorrect);
      const avgSize = tradesInRange.length > 0
        ? tradesInRange.reduce((sum, t) => sum + t.size, 0) / tradesInRange.length
        : 0;

      breakdown[range.name] = {
        totalTrades: tradesInRange.length,
        correctTrades: correctTrades.length,
        accuracy: tradesInRange.length > 0 ? correctTrades.length / tradesInRange.length : 0,
        avgSize,
      };
    });

    return breakdown;
  }

  private analyzeVolumeShare(trades: HistoricalTrade[], marketMap: Map<string, HistoricalMarket>) {
    const ranges = [
      { name: '<5% of volume', min: 0, max: 0.05 },
      { name: '5-10% of volume', min: 0.05, max: 0.10 },
      { name: '10-20% of volume', min: 0.10, max: 0.20 },
      { name: '20-30% of volume', min: 0.20, max: 0.30 },
      { name: '>30% of volume', min: 0.30, max: Infinity },
    ];

    const breakdown: any = {};

    ranges.forEach(range => {
      const tradesInRange = trades.filter(t => {
        const market = marketMap.get(t.marketId);
        if (!market || market.volume === 0) return false;
        const share = t.size / market.volume;
        return share >= range.min && share < range.max;
      });

      const correctTrades = tradesInRange.filter(t => t.wasCorrect);

      breakdown[range.name] = {
        totalTrades: tradesInRange.length,
        correctTrades: correctTrades.length,
        accuracy: tradesInRange.length > 0 ? correctTrades.length / tradesInRange.length : 0,
      };
    });

    return breakdown;
  }

  private analyzeTraceTiming(trades: HistoricalTrade[], marketMap: Map<string, HistoricalMarket>) {
    const ranges = [
      { name: '<1 day', min: 0, max: 1 },
      { name: '1-3 days', min: 1, max: 3 },
      { name: '3-7 days', min: 3, max: 7 },
      { name: '7-14 days', min: 7, max: 14 },
      { name: '14-30 days', min: 14, max: 30 },
      { name: '>30 days', min: 30, max: Infinity },
    ];

    const breakdown: any = {};

    ranges.forEach(range => {
      const tradesInRange = trades.filter(t => {
        const market = marketMap.get(t.marketId);
        if (!market || !market.resolvedAt) return false;
        const daysBeforeResolution = (market.resolvedAt - t.timestamp) / (1000 * 60 * 60 * 24);
        return daysBeforeResolution >= range.min && daysBeforeResolution < range.max;
      });

      const correctTrades = tradesInRange.filter(t => t.wasCorrect);
      const avgDays = tradesInRange.length > 0
        ? tradesInRange.reduce((sum, t) => {
            const market = marketMap.get(t.marketId);
            return sum + ((market!.resolvedAt! - t.timestamp) / (1000 * 60 * 60 * 24));
          }, 0) / tradesInRange.length
        : 0;

      breakdown[range.name] = {
        totalTrades: tradesInRange.length,
        correctTrades: correctTrades.length,
        accuracy: tradesInRange.length > 0 ? correctTrades.length / tradesInRange.length : 0,
        avgDaysBeforeResolution: avgDays,
      };
    });

    return breakdown;
  }

  private analyzeCategoryTiming(trades: HistoricalTrade[], marketMap: Map<string, HistoricalMarket>) {
    const breakdown: any = {};

    trades.forEach(t => {
      const market = marketMap.get(t.marketId);
      if (!market || !market.resolvedAt) return;

      const category = market.category || 'Other';
      const daysBeforeResolution = (market.resolvedAt - t.timestamp) / (1000 * 60 * 60 * 24);
      const isEarly = daysBeforeResolution >= 7; // 7+ days = early

      if (!breakdown[category]) {
        breakdown[category] = {
          earlyTrades: { total: 0, correct: 0, accuracy: 0 },
          lateTrades: { total: 0, correct: 0, accuracy: 0 },
        };
      }

      if (isEarly) {
        breakdown[category].earlyTrades.total++;
        if (t.wasCorrect) breakdown[category].earlyTrades.correct++;
      } else {
        breakdown[category].lateTrades.total++;
        if (t.wasCorrect) breakdown[category].lateTrades.correct++;
      }
    });

    // Calculate accuracies
    Object.keys(breakdown).forEach(category => {
      const data = breakdown[category];
      data.earlyTrades.accuracy = data.earlyTrades.total > 0
        ? data.earlyTrades.correct / data.earlyTrades.total
        : 0;
      data.lateTrades.accuracy = data.lateTrades.total > 0
        ? data.lateTrades.correct / data.lateTrades.total
        : 0;
    });

    return breakdown;
  }

  private analyzeCategoryBreakdown(trades: HistoricalTrade[], markets: HistoricalMarket[]) {
    const breakdown: any = {};
    const marketMap = new Map(markets.map(m => [m.id, m]));

    markets.forEach(market => {
      const category = market.category || 'Other';
      if (!breakdown[category]) {
        breakdown[category] = { totalMarkets: 0, sharpTrades: 0, dumbTrades: 0, sharpCorrect: 0, dumbCorrect: 0, totalLiquidity: 0 };
      }
      breakdown[category].totalMarkets++;
      breakdown[category].totalLiquidity += market.liquidity;
    });

    trades.forEach(trade => {
      const market = marketMap.get(trade.marketId);
      if (!market) return;
      const category = market.category || 'Other';

      if (trade.wasCorrect) {
        breakdown[category].sharpTrades++;
        breakdown[category].sharpCorrect++;
      } else {
        breakdown[category].dumbTrades++;
      }
    });

    // Calculate final metrics
    Object.keys(breakdown).forEach(category => {
      const data = breakdown[category];
      breakdown[category] = {
        totalMarkets: data.totalMarkets,
        sharpAccuracy: data.sharpTrades > 0 ? data.sharpCorrect / data.sharpTrades : 0,
        dumbAccuracy: data.dumbTrades > 0 ? 0 : 0, // Dumb money is incorrect by definition
        avgLiquidity: data.totalMarkets > 0 ? data.totalLiquidity / data.totalMarkets : 0,
      };
    });

    return breakdown;
  }

  private analyzeLiquidityBreakdown(trades: HistoricalTrade[], markets: HistoricalMarket[]) {
    const ranges = [
      { name: 'Micro (<$1k)', min: 0, max: 1000 },
      { name: 'Small ($1k-$5k)', min: 1000, max: 5000 },
      { name: 'Medium ($5k-$10k)', min: 5000, max: 10000 },
      { name: 'Large ($10k-$50k)', min: 10000, max: 50000 },
      { name: 'XLarge ($50k-$100k)', min: 50000, max: 100000 },
      { name: 'Mega (>$100k)', min: 100000, max: Infinity },
    ];

    const breakdown: any = {};
    const marketMap = new Map(markets.map(m => [m.id, m]));

    ranges.forEach(range => {
      const marketsInRange = markets.filter(m => m.liquidity >= range.min && m.liquidity < range.max);
      const tradesInRange = trades.filter(t => {
        const market = marketMap.get(t.marketId);
        return market && market.liquidity >= range.min && market.liquidity < range.max;
      });

      const sharpTrades = tradesInRange.filter(t => t.wasCorrect);
      const avgLiq = marketsInRange.length > 0
        ? marketsInRange.reduce((sum, m) => sum + m.liquidity, 0) / marketsInRange.length
        : 0;

      breakdown[range.name] = {
        totalMarkets: marketsInRange.length,
        totalTrades: tradesInRange.length,
        sharpAccuracy: sharpTrades.length > 0 ? sharpTrades.length / tradesInRange.length : 0,
        avgLiquidity: avgLiq,
      };
    });

    return breakdown;
  }

  private analyzeFavoriteVsUnderdog(trades: HistoricalTrade[]) {
    const sharpOnFavorite = trades.filter(t => t.wasCorrect && t.wasFavorite);
    const sharpOnUnderdog = trades.filter(t => t.wasCorrect && t.wasUnderdog);
    const dumbOnFavorite = trades.filter(t => !t.wasCorrect && t.wasFavorite);
    const dumbOnUnderdog = trades.filter(t => !t.wasCorrect && t.wasUnderdog);

    return {
      sharpOnFavorite: {
        count: sharpOnFavorite.length,
        accuracy: sharpOnFavorite.length > 0 ? 1.0 : 0, // Sharp is always correct
      },
      sharpOnUnderdog: {
        count: sharpOnUnderdog.length,
        accuracy: sharpOnUnderdog.length > 0 ? 1.0 : 0,
      },
      dumbOnFavorite: {
        count: dumbOnFavorite.length,
        accuracy: 0, // Dumb is always incorrect
      },
      dumbOnUnderdog: {
        count: dumbOnUnderdog.length,
        accuracy: 0,
      },
    };
  }

  private identifySharpCharacteristics(
    trades: HistoricalTrade[],
    marketMap: Map<string, HistoricalMarket>
  ): string[] {
    const characteristics: string[] = [];

    const lowLiqTrades = trades.filter(
      t => (marketMap.get(t.marketId)?.liquidity || Infinity) < 10000
    );
    if (lowLiqTrades.length / trades.length > 0.6) {
      characteristics.push('Prefer low-liquidity markets (< $10k)');
    }

    const avgSize = trades.reduce((sum, t) => sum + t.size, 0) / trades.length;
    if (avgSize > 500) {
      characteristics.push(`Large average trade size: $${avgSize.toFixed(0)}`);
    }

    return characteristics;
  }

  private identifyDumbCharacteristics(
    trades: HistoricalTrade[],
    marketMap: Map<string, HistoricalMarket>
  ): string[] {
    const characteristics: string[] = [];

    const highLiqTrades = trades.filter(
      t => (marketMap.get(t.marketId)?.liquidity || 0) >= 10000
    );
    if (highLiqTrades.length / trades.length > 0.5) {
      characteristics.push('More active in high-liquidity markets');
    }

    return characteristics;
  }

  private generateRecommendations(
    sharpLiq: number,
    dumbLiq: number,
    sharpTiming: number,
    dumbTiming: number,
    topPerformers: TraderPerformance[]
  ): string[] {
    const recommendations: string[] = [];

    if (sharpLiq < dumbLiq) {
      recommendations.push(
        `Focus on low-liquidity markets: Sharp money trades at avg liquidity of $${sharpLiq.toFixed(0)} vs dumb money at $${dumbLiq.toFixed(0)}`
      );
    }

    const sharpTimingDays = sharpTiming / (1000 * 60 * 60 * 24);
    const dumbTimingDays = dumbTiming / (1000 * 60 * 60 * 24);
    if (sharpTimingDays > dumbTimingDays * 1.5) {
      recommendations.push(
        `Sharp money enters earlier: avg ${sharpTimingDays.toFixed(1)} days before resolution vs ${dumbTimingDays.toFixed(1)} days for dumb money`
      );
    }

    if (topPerformers.length > 0) {
      const avgAccuracy = topPerformers.reduce((sum, p) => sum + p.accuracy, 0) / topPerformers.length;
      recommendations.push(
        `Top ${topPerformers.length} traders achieve ${(avgAccuracy * 100).toFixed(1)}% accuracy`
      );
    }

    if (topPerformers.some(p => p.lowLiquidityAccuracy > p.highLiquidityAccuracy + 0.1)) {
      recommendations.push(
        'Sharp traders perform significantly better in low-liquidity markets - prioritize these'
      );
    }

    return recommendations;
  }
}
