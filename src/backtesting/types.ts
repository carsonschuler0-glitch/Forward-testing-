export interface HistoricalMarket {
  id: string;
  question: string;
  outcomes: string[];
  liquidity: number;
  volume: number;
  resolvedOutcome: number | null; // Which outcome won (0 or 1)
  resolvedAt: number | null;
  createdAt: number;
  category?: string; // Market category/tag
  initialPrice?: number; // Initial price to determine favorite
}

export interface HistoricalTrade {
  id: string;
  marketId: string;
  trader: string;
  outcome: number; // 0 = No, 1 = Yes
  size: number;
  price: number;
  timestamp: number;
  wasCorrect?: boolean; // Did this side win?
  wasFavorite?: boolean; // Was this the favored side at time of trade?
  wasUnderdog?: boolean; // Was this the underdog side?
}

export interface TraderPerformance {
  address: string;
  totalTrades: number;
  correctTrades: number;
  incorrectTrades: number;
  accuracy: number;
  totalVolume: number;
  avgTradeSize: number;
  profitLoss: number;
  roi: number;
  sharpeRatio: number;
  lowLiquidityAccuracy: number; // Accuracy in low-liq markets
  highLiquidityAccuracy: number;
}

export interface BacktestResult {
  totalMarkets: number;
  totalTrades: number;
  dateRange: { start: number; end: number };
  topPerformers: TraderPerformance[];
  sharpMoneyPatterns: {
    avgLiquidityOfSharpTrades: number;
    avgTimingBeforeResolution: number;
    commonCharacteristics: string[];
  };
  dumbMoneyPatterns: {
    avgLiquidityOfDumbTrades: number;
    avgTimingBeforeResolution: number;
    commonCharacteristics: string[];
  };
  recommendations: string[];
  categoryBreakdown?: {
    [category: string]: {
      totalMarkets: number;
      sharpAccuracy: number;
      dumbAccuracy: number;
      avgLiquidity: number;
    };
  };
  liquidityBreakdown?: {
    [range: string]: {
      totalMarkets: number;
      totalTrades: number;
      sharpAccuracy: number;
      avgLiquidity: number;
    };
  };
  favoriteVsUnderdogBreakdown?: {
    sharpOnFavorite: { count: number; accuracy: number };
    sharpOnUnderdog: { count: number; accuracy: number };
    dumbOnFavorite: { count: number; accuracy: number };
    dumbOnUnderdog: { count: number; accuracy: number };
  };
  tradeSizeAnalysis?: {
    [range: string]: {
      totalTrades: number;
      correctTrades: number;
      accuracy: number;
      avgSize: number;
    };
  };
  volumeShareAnalysis?: {
    [range: string]: {
      totalTrades: number;
      correctTrades: number;
      accuracy: number;
    };
  };
  timingAnalysis?: {
    [range: string]: {
      totalTrades: number;
      correctTrades: number;
      accuracy: number;
      avgDaysBeforeResolution: number;
    };
  };
  categoryTimingAnalysis?: {
    [category: string]: {
      earlyTrades: { total: number; correct: number; accuracy: number };
      lateTrades: { total: number; correct: number; accuracy: number };
    };
  };
}
