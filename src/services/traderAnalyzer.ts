import { TraderStats } from '../types';

export class TraderAnalyzer {
  private traderStatsCache: Map<string, TraderStats> = new Map();
  private allTraderRois: number[] = [];
  private topPercentileThreshold: number = 0;

  constructor(private topTraderPercentile: number) {}

  updateTraderStats(address: string, stats: TraderStats): void {
    this.traderStatsCache.set(address, stats);
    this.updateRoiPercentiles();
  }

  getTraderStats(address: string): TraderStats | undefined {
    return this.traderStatsCache.get(address);
  }

  isHighProfitTrader(address: string): boolean {
    const stats = this.traderStatsCache.get(address);
    if (!stats) return false;

    // Must have meaningful trading history
    if (stats.totalVolume < 1000) return false;
    if (stats.totalTrades < 5) return false;

    // Check if ROI is in top percentile
    return stats.roi >= this.topPercentileThreshold;
  }

  getTopPercentileThreshold(): number {
    return this.topPercentileThreshold;
  }

  getAllTrackedTraders(): Map<string, TraderStats> {
    return new Map(this.traderStatsCache);
  }

  private updateRoiPercentiles(): void {
    // Collect all ROIs from traders with sufficient volume
    this.allTraderRois = Array.from(this.traderStatsCache.values())
      .filter(stats => stats.totalVolume >= 1000 && stats.totalTrades >= 5)
      .map(stats => stats.roi)
      .sort((a, b) => a - b);

    if (this.allTraderRois.length === 0) {
      this.topPercentileThreshold = 0;
      return;
    }

    // Calculate threshold for top N percentile
    const percentileIndex = Math.floor(
      this.allTraderRois.length * (1 - this.topTraderPercentile / 100)
    );
    this.topPercentileThreshold = this.allTraderRois[percentileIndex] || 0;
  }

  calculateStats(trades: Array<{ price: number; size: number; side: 'BUY' | 'SELL'; timestamp: number }>): {
    totalVolume: number;
    profitLoss: number;
    roi: number;
  } {
    let totalVolume = 0;
    let totalCost = 0;
    let totalRevenue = 0;
    let position = 0;

    for (const trade of trades) {
      const tradeValue = trade.price * trade.size;
      totalVolume += Math.abs(trade.size);

      if (trade.side === 'BUY') {
        totalCost += tradeValue;
        position += trade.size;
      } else {
        totalRevenue += tradeValue;
        position -= trade.size;
      }
    }

    // Simplified P&L calculation
    const profitLoss = totalRevenue - totalCost;
    const roi = totalCost > 0 ? (profitLoss / totalCost) * 100 : 0;

    return {
      totalVolume,
      profitLoss,
      roi,
    };
  }

  getTraderRank(address: string): { rank: number; total: number; percentile: number } | null {
    const stats = this.traderStatsCache.get(address);
    if (!stats) return null;

    const eligibleTraders = Array.from(this.traderStatsCache.values())
      .filter(s => s.totalVolume >= 1000 && s.totalTrades >= 5);

    if (eligibleTraders.length === 0) {
      return { rank: 1, total: 1, percentile: 100 };
    }

    const sorted = eligibleTraders.sort((a, b) => b.roi - a.roi);
    const rank = sorted.findIndex(s => s.address === address) + 1;
    const percentile = ((eligibleTraders.length - rank + 1) / eligibleTraders.length) * 100;

    return {
      rank,
      total: eligibleTraders.length,
      percentile: Math.round(percentile * 100) / 100,
    };
  }
}
