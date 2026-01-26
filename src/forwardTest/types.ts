/**
 * Forward Testing Types
 * Track active markets and analyze trades as they happen
 */

export interface ActiveMarket {
  id: string;
  question: string;
  outcomes: string[];
  liquidity: number;
  volume: number;
  createdAt: number;
  endDate: number | null;
  category: string;
  currentPrices: number[]; // Current outcome prices
  resolvedOutcome?: number; // Set when market resolves
  resolvedAt?: number;
  // NegRisk metadata for multi-outcome arbitrage detection
  negRisk?: boolean;
  negRiskMarketId?: string;
  eventSlug?: string;
  conditionId?: string;
}

export interface LiveTrade {
  id: string;
  marketId: string;
  trader: string;
  outcome: number; // 0 or 1
  size: number;
  price: number;
  timestamp: number;

  // Market context at time of trade
  marketLiquidity: number;
  marketVolume: number;
  marketAge: number; // Days since market creation
  daysUntilClose?: number; // Days until market close (if known)

  // Trade characteristics
  volumeShare: number; // % of total market volume
  priceBeforeTrade?: number; // Market price before this trade
  priceAfter5min?: number; // Price 5 minutes after
  priceAfter15min?: number;
  priceAfter1hr?: number;

  // Clustering metrics
  isPartOfCluster?: boolean; // Multiple large trades in short window
  clusterSize?: number; // Number of trades in the cluster
  clusterTotalVolume?: number;

  // Market position
  isContrarian?: boolean; // Trading against majority (price < 0.5 betting Yes, or price > 0.5 betting No)

  // Later filled when market resolves
  wasCorrect?: boolean;
  wasFavorite?: boolean;
  wasUnderdog?: boolean;
}

export interface TraderReputation {
  address: string;
  totalTrades: number;
  resolvedTrades: number; // Trades in resolved markets
  correctTrades: number;
  accuracy: number;
  totalVolume: number;
  avgTradeSize: number;
  profitLoss: number;
  roi: number;

  // Performance by market type
  lowLiqAccuracy: number;
  highLiqAccuracy: number;

  // Reputation score (0-100)
  reputationScore: number;

  // Last updated
  lastTradeAt: number;

  // Recent trades (for dashboard display)
  recentTrades?: TraderTradeDetail[];
}

export interface TraderTradeDetail {
  id: string;
  marketQuestion: string;
  outcome: string; // "Yes" or "No"
  size: number;
  price: number;
  timestamp: number;
  wasCorrect?: boolean;
  isContrarian?: boolean;
  category: string;
}

export interface TradeCluster {
  marketId: string;
  outcome: number;
  trades: LiveTrade[];
  totalVolume: number;
  timeWindow: number; // Minutes
  startTime: number;
  endTime: number;
  uniqueTraders: number;
  avgTradeSize: number;
}

export interface MarketSnapshot {
  marketId: string;
  timestamp: number;
  prices: number[];
  liquidity: number;
  volume: number;

  // Rolling windows
  tradesLast1hr: number;
  volumeLast1hr: number;
  tradesLast6hr: number;
  volumeLast6hr: number;
  tradesLast24hr: number;
  volumeLast24hr: number;

  // Wallet concentration
  topWalletShare: number; // % volume from #1 wallet
  top3WalletShare: number;
  top10WalletShare: number;

  // Outcome distribution
  volumeOnYes: number;
  volumeOnNo: number;
  outcomeSkew: number; // -1 to 1 (negative = No heavy, positive = Yes heavy)
}

export interface ForwardTestAnalysis {
  // Time period
  startTime: number;
  endTime: number;

  // Markets tracked
  totalMarkets: number;
  activeMarkets: number;
  resolvedMarkets: number;

  // Trades captured
  totalTrades: number;
  resolvedTrades: number; // Trades in markets that have resolved

  // Granular trade size buckets ($1k increments)
  tradeSizeBuckets: {
    [range: string]: {
      totalTrades: number;
      correctTrades: number;
      accuracy: number;
      avgSize: number;
    };
  };

  // Granular liquidity buckets ($500 increments)
  liquidityBuckets: {
    [range: string]: {
      totalMarkets: number;
      totalTrades: number;
      correctTrades: number;
      accuracy: number;
      avgLiquidity: number;
    };
  };

  // Volume share analysis
  volumeShareBuckets: {
    [range: string]: {
      totalTrades: number;
      correctTrades: number;
      accuracy: number;
    };
  };

  // Market age analysis (days since creation)
  marketAgeBuckets: {
    [range: string]: {
      totalTrades: number;
      correctTrades: number;
      accuracy: number;
      avgAge: number;
    };
  };

  // Price impact analysis
  priceImpactAnalysis: {
    [range: string]: { // Trade size ranges
      avgImpact5min: number;
      avgImpact15min: number;
      avgImpact1hr: number;
      tradeCount: number;
    };
  };

  // Clustering insights
  totalClusters: number;
  clustersCorrect: number;
  clusterAccuracy: number;
  avgClusterSize: number;

  // Trader reputation insights
  topTraders: TraderReputation[];

  // Repeat trader analysis
  marketsWithRepeatTraders: number;
  avgTradesPerRepeater: number;
  repeaterAccuracy: number;

  // Wallet concentration insights
  highConcentrationMarkets: number; // >50% from top 3
  concentrationAccuracy: number;

  // Velocity insights
  marketsWithSuddenInflux: number; // Volume spike detected
  influxAccuracy: number;

  // Category analysis
  categoryBreakdown: {
    [category: string]: {
      totalMarkets: number;
      totalTrades: number;
      resolvedTrades: number;
      correctTrades: number;
      accuracy: number;
      totalVolume: number;
      avgTradeSize: number;
    };
  };

  // Contrarian analysis
  contrarianTrades: number;
  contrarianCorrect: number;
  contrarianAccuracy: number;
  consensusTrades: number;
  consensusCorrect: number;
  consensusAccuracy: number;

  // Recommendations
  recommendations: string[];
}
