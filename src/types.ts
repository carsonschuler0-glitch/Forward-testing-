export interface Trade {
  id: string;
  market: string;
  marketSlug: string;
  trader: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  timestamp: number;
  outcomeIndex: number;
  outcomeName?: string;
}

export interface Market {
  id: string;
  slug: string;
  question: string;
  outcomes: string[];
  liquidity: number;
  volume: number;
  active: boolean;
  endDate?: number;
}

export interface TraderStats {
  address: string;
  totalVolume: number;
  totalTrades: number;
  profitLoss: number;
  roi: number;
  lastTradeTimestamp: number;
  winRate: number;
  averageTradeSize: number;
}

export interface AlertData {
  trade: Trade;
  market: Market;
  traderStats: TraderStats;
  liquidityImpact: number;
  reason: string;
}

export interface Config {
  telegramBotToken: string;
  telegramChatId: string;
  polymarketApiUrl: string;
  polymarketGammaApi: string;
  pollIntervalMs: number;
  minTradeSizeUsd: number;
  liquidityThresholdPercent: number;
  topTraderPercentile: number;
  minTraderVolumeUsd: number;
}
