import axios, { AxiosInstance } from 'axios';
import { Market, Trade } from '../types';

export class PolymarketClient {
  private clobClient: AxiosInstance;
  private gammaClient: AxiosInstance;
  private lastTradeId: string | null = null;

  constructor(clobApiUrl: string, gammaApiUrl: string) {
    this.clobClient = axios.create({
      baseURL: clobApiUrl,
      timeout: 10000,
    });

    this.gammaClient = axios.create({
      baseURL: gammaApiUrl,
      timeout: 10000,
    });
  }

  async getMarkets(limit: number = 100): Promise<Market[]> {
    try {
      const response = await this.gammaClient.get('/markets', {
        params: {
          limit,
          active: true,
        },
      });

      return response.data.map((market: any) => ({
        id: market.id,
        slug: market.slug,
        question: market.question,
        outcomes: market.outcomes || [],
        liquidity: parseFloat(market.liquidity || '0'),
        volume: parseFloat(market.volume || '0'),
        active: market.active,
        endDate: market.end_date_iso ? new Date(market.end_date_iso).getTime() : undefined,
      }));
    } catch (error) {
      console.error('Error fetching markets:', error);
      return [];
    }
  }

  async getMarketById(marketId: string): Promise<Market | null> {
    try {
      const response = await this.gammaClient.get(`/markets/${marketId}`);
      const market = response.data;

      return {
        id: market.id,
        slug: market.slug,
        question: market.question,
        outcomes: market.outcomes || [],
        liquidity: parseFloat(market.liquidity || '0'),
        volume: parseFloat(market.volume || '0'),
        active: market.active,
        endDate: market.end_date_iso ? new Date(market.end_date_iso).getTime() : undefined,
      };
    } catch (error) {
      console.error(`Error fetching market ${marketId}:`, error);
      return null;
    }
  }

  async getRecentTrades(limit: number = 100): Promise<Trade[]> {
    try {
      // Fetch recent trades from the CLOB API
      const response = await this.clobClient.get('/trades', {
        params: {
          limit,
        },
      });

      const trades: Trade[] = response.data.map((trade: any) => ({
        id: trade.id,
        market: trade.asset_id || trade.market,
        marketSlug: trade.market_slug || '',
        trader: trade.taker_address || trade.maker_address,
        side: trade.side?.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
        size: parseFloat(trade.size || '0'),
        price: parseFloat(trade.price || '0'),
        timestamp: trade.timestamp ? new Date(trade.timestamp).getTime() : Date.now(),
        outcomeIndex: trade.outcome || 0,
        outcomeName: trade.outcome_name,
      }));

      // Filter out trades we've already seen
      let newTrades = trades;
      if (this.lastTradeId) {
        const lastIndex = trades.findIndex(t => t.id === this.lastTradeId);
        if (lastIndex > 0) {
          newTrades = trades.slice(0, lastIndex);
        }
      }

      // Update last seen trade ID
      if (trades.length > 0) {
        this.lastTradeId = trades[0].id;
      }

      return newTrades;
    } catch (error) {
      console.error('Error fetching trades:', error);
      return [];
    }
  }

  async getTraderHistory(address: string, limit: number = 100): Promise<Trade[]> {
    try {
      const response = await this.clobClient.get('/trades', {
        params: {
          maker: address,
          limit,
        },
      });

      return response.data.map((trade: any) => ({
        id: trade.id,
        market: trade.asset_id || trade.market,
        marketSlug: trade.market_slug || '',
        trader: address,
        side: trade.side?.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
        size: parseFloat(trade.size || '0'),
        price: parseFloat(trade.price || '0'),
        timestamp: trade.timestamp ? new Date(trade.timestamp).getTime() : Date.now(),
        outcomeIndex: trade.outcome || 0,
        outcomeName: trade.outcome_name,
      }));
    } catch (error) {
      console.error(`Error fetching trader history for ${address}:`, error);
      return [];
    }
  }

  calculateLiquidityImpact(tradeSize: number, marketLiquidity: number): number {
    if (marketLiquidity === 0) return 100;
    return (tradeSize / marketLiquidity) * 100;
  }
}
