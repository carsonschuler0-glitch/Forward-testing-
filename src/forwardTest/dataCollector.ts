import axios from 'axios';
import { ActiveMarket, LiveTrade, MarketSnapshot } from './types';

/**
 * Collects real-time trade data from active markets
 */
export class ForwardTestDataCollector {
  private gammaApi = 'https://gamma-api.polymarket.com';
  private dataApi = 'https://data-api.polymarket.com';

  // Track last seen trade timestamp per market to avoid duplicates
  private lastTradeTimestamp = new Map<string, number>();

  // Store market snapshots for price impact analysis
  private marketSnapshots = new Map<string, MarketSnapshot[]>();

  /**
   * Fetch currently active markets
   */
  async fetchActiveMarkets(limit: number = 100): Promise<ActiveMarket[]> {
    try {
      const response = await axios.get(`${this.gammaApi}/markets`, {
        params: {
          limit,
          closed: false, // Only active markets
          active: true,
        },
      });

      if (!response.data || !Array.isArray(response.data)) {
        return [];
      }

      const markets: ActiveMarket[] = [];

      for (const market of response.data) {
        const liquidity = parseFloat(market.liquidity || '0');
        const volume = parseFloat(market.volume || '0');

        // Parse current prices
        let currentPrices = [0.5, 0.5];
        if (market.outcomePrices) {
          try {
            const prices = JSON.parse(market.outcomePrices);
            currentPrices = prices.map((p: string) => parseFloat(p));
          } catch (e) {
            // Use defaults
          }
        }

        // Extract category
        const category = market.tags?.[0] || market.category || this.categorizeMarket(market.question || '');

        markets.push({
          id: market.condition_id || market.id,
          question: market.question || 'Unknown Market',
          outcomes: market.outcomes ? JSON.parse(market.outcomes) : ['No', 'Yes'],
          liquidity,
          volume,
          createdAt: market.created_at ? new Date(market.created_at).getTime() : Date.now(),
          endDate: market.end_date_iso ? new Date(market.end_date_iso).getTime() : null,
          category,
          currentPrices,
        });
      }

      return markets;
    } catch (error: any) {
      console.error('Error fetching active markets:', error.message);
      return [];
    }
  }

  /**
   * Fetch new trades for a market since last check
   */
  async fetchNewTrades(
    market: ActiveMarket,
    minTradeSize: number = 1000
  ): Promise<LiveTrade[]> {
    try {
      const response = await axios.get(`${this.dataApi}/trades`, {
        params: {
          condition_id: market.id,
          limit: 100,
        },
      });

      if (!response.data || !Array.isArray(response.data)) {
        return [];
      }

      const lastSeen = this.lastTradeTimestamp.get(market.id) || 0;
      const trades: LiveTrade[] = [];
      let latestTimestamp = lastSeen;

      for (const apiTrade of response.data) {
        const timestamp = apiTrade.timestamp * 1000;

        // Only process new trades
        if (timestamp <= lastSeen) {
          continue;
        }

        // Track latest timestamp
        if (timestamp > latestTimestamp) {
          latestTimestamp = timestamp;
        }

        // Only include trades >= minimum size
        if (apiTrade.size < minTradeSize) {
          continue;
        }

        // Calculate market age at time of trade
        const marketAge = (timestamp - market.createdAt) / (1000 * 60 * 60 * 24);

        // Calculate days until close (if known)
        const daysUntilClose = market.endDate
          ? (market.endDate - timestamp) / (1000 * 60 * 60 * 24)
          : undefined;

        // Calculate volume share
        const volumeShare = market.volume > 0 ? apiTrade.size / market.volume : 0;

        // Get price before trade from latest snapshot
        const priceBeforeTrade = this.getPriceFromSnapshot(market.id, timestamp, apiTrade.outcomeIndex);

        // Determine if trade is contrarian (going against market consensus)
        // If betting Yes (outcome 1) when price < 0.5, or betting No (outcome 0) when price > 0.5
        const marketPrice = market.currentPrices[apiTrade.outcomeIndex] || 0.5;
        const isContrarian = (apiTrade.outcomeIndex === 1 && marketPrice < 0.5) ||
                            (apiTrade.outcomeIndex === 0 && marketPrice > 0.5);

        trades.push({
          id: apiTrade.transactionHash || `${market.id}-${timestamp}`,
          marketId: market.id,
          trader: apiTrade.proxyWallet,
          outcome: apiTrade.outcomeIndex,
          size: apiTrade.size,
          price: apiTrade.price,
          timestamp,
          marketLiquidity: market.liquidity,
          marketVolume: market.volume,
          marketAge,
          daysUntilClose,
          volumeShare,
          priceBeforeTrade,
          isContrarian,
        });
      }

      // Update last seen timestamp
      if (latestTimestamp > lastSeen) {
        this.lastTradeTimestamp.set(market.id, latestTimestamp);
      }

      return trades;
    } catch (error: any) {
      console.error(`Error fetching trades for market ${market.id}:`, error.message);
      return [];
    }
  }

  /**
   * Capture market snapshot for price tracking
   */
  async captureMarketSnapshot(market: ActiveMarket, trades: LiveTrade[]): Promise<MarketSnapshot> {
    const now = Date.now();

    // Get all trades in various time windows
    const allTradesLast24hr = trades.filter(t => now - t.timestamp <= 24 * 60 * 60 * 1000);
    const tradesLast1hr = allTradesLast24hr.filter(t => now - t.timestamp <= 60 * 60 * 1000);
    const tradesLast6hr = allTradesLast24hr.filter(t => now - t.timestamp <= 6 * 60 * 60 * 1000);

    // Calculate wallet concentration
    const walletVolumes = new Map<string, number>();
    allTradesLast24hr.forEach(t => {
      const current = walletVolumes.get(t.trader) || 0;
      walletVolumes.set(t.trader, current + t.size);
    });

    const sortedWallets = Array.from(walletVolumes.entries())
      .sort((a, b) => b[1] - a[1]);

    const totalVolume24hr = allTradesLast24hr.reduce((sum, t) => sum + t.size, 0);
    const topWalletShare = totalVolume24hr > 0 && sortedWallets.length > 0
      ? sortedWallets[0][1] / totalVolume24hr
      : 0;
    const top3WalletShare = totalVolume24hr > 0
      ? sortedWallets.slice(0, 3).reduce((sum, [_, vol]) => sum + vol, 0) / totalVolume24hr
      : 0;
    const top10WalletShare = totalVolume24hr > 0
      ? sortedWallets.slice(0, 10).reduce((sum, [_, vol]) => sum + vol, 0) / totalVolume24hr
      : 0;

    // Calculate outcome distribution
    const volumeOnYes = allTradesLast24hr.filter(t => t.outcome === 1).reduce((sum, t) => sum + t.size, 0);
    const volumeOnNo = allTradesLast24hr.filter(t => t.outcome === 0).reduce((sum, t) => sum + t.size, 0);
    const outcomeSkew = totalVolume24hr > 0
      ? (volumeOnYes - volumeOnNo) / totalVolume24hr
      : 0;

    const snapshot: MarketSnapshot = {
      marketId: market.id,
      timestamp: now,
      prices: [...market.currentPrices],
      liquidity: market.liquidity,
      volume: market.volume,
      tradesLast1hr: tradesLast1hr.length,
      volumeLast1hr: tradesLast1hr.reduce((sum, t) => sum + t.size, 0),
      tradesLast6hr: tradesLast6hr.length,
      volumeLast6hr: tradesLast6hr.reduce((sum, t) => sum + t.size, 0),
      tradesLast24hr: allTradesLast24hr.length,
      volumeLast24hr: totalVolume24hr,
      topWalletShare,
      top3WalletShare,
      top10WalletShare,
      volumeOnYes,
      volumeOnNo,
      outcomeSkew,
    };

    // Store snapshot
    const snapshots = this.marketSnapshots.get(market.id) || [];
    snapshots.push(snapshot);

    // Keep only last 24 hours of snapshots
    const cutoff = now - 24 * 60 * 60 * 1000;
    const filtered = snapshots.filter(s => s.timestamp > cutoff);
    this.marketSnapshots.set(market.id, filtered);

    return snapshot;
  }

  /**
   * Update price impact for trades after time has passed
   */
  async updatePriceImpact(trades: LiveTrade[], market: ActiveMarket): Promise<void> {
    const now = Date.now();
    const snapshots = this.marketSnapshots.get(market.id) || [];

    for (const trade of trades) {
      // Skip if already has all price impacts
      if (trade.priceAfter1hr !== undefined) {
        continue;
      }

      // Find snapshots at 5min, 15min, 1hr after trade
      const t5min = trade.timestamp + 5 * 60 * 1000;
      const t15min = trade.timestamp + 15 * 60 * 1000;
      const t1hr = trade.timestamp + 60 * 60 * 1000;

      if (now >= t5min && trade.priceAfter5min === undefined) {
        trade.priceAfter5min = this.getPriceFromSnapshot(market.id, t5min, trade.outcome);
      }

      if (now >= t15min && trade.priceAfter15min === undefined) {
        trade.priceAfter15min = this.getPriceFromSnapshot(market.id, t15min, trade.outcome);
      }

      if (now >= t1hr && trade.priceAfter1hr === undefined) {
        trade.priceAfter1hr = this.getPriceFromSnapshot(market.id, t1hr, trade.outcome);
      }
    }
  }

  /**
   * Get price from closest snapshot
   */
  private getPriceFromSnapshot(marketId: string, timestamp: number, outcomeIndex: number): number | undefined {
    const snapshots = this.marketSnapshots.get(marketId) || [];
    if (snapshots.length === 0) return undefined;

    // Find closest snapshot
    let closest = snapshots[0];
    let minDiff = Math.abs(snapshots[0].timestamp - timestamp);

    for (const snapshot of snapshots) {
      const diff = Math.abs(snapshot.timestamp - timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = snapshot;
      }
    }

    return closest.prices[outcomeIndex];
  }

  /**
   * Get latest snapshot for a market
   */
  getLatestSnapshot(marketId: string): MarketSnapshot | undefined {
    const snapshots = this.marketSnapshots.get(marketId) || [];
    return snapshots[snapshots.length - 1];
  }

  /**
   * Categorize market based on question
   */
  private categorizeMarket(question: string): string {
    const q = question.toLowerCase();
    if (q.includes('trump') || q.includes('biden') || q.includes('election') || q.includes('president')) return 'Politics';
    if (q.includes('crypto') || q.includes('bitcoin') || q.includes('eth') || q.includes('nft')) return 'Crypto';
    if (q.includes('sport') || q.includes('nfl') || q.includes('nba') || q.includes('soccer')) return 'Sports';
    if (q.includes('stock') || q.includes('market') || q.includes('recession') || q.includes('gdp')) return 'Finance';
    if (q.includes('ai') || q.includes('tech') || q.includes('spacex') || q.includes('tesla')) return 'Technology';
    if (q.includes('war') || q.includes('ukraine') || q.includes('israel') || q.includes('china')) return 'Geopolitics';
    return 'Other';
  }

  /**
   * Check if a market has resolved and get its outcome
   * Returns { resolved: true, outcome: 0 or 1 } or { resolved: false }
   */
  async checkMarketResolution(marketId: string): Promise<{ resolved: boolean; outcome?: number }> {
    try {
      const response = await axios.get(`${this.gammaApi}/markets/${marketId}`);

      if (!response.data) {
        return { resolved: false };
      }

      const market = response.data;

      // Check various resolution indicators
      // Polymarket uses different fields depending on the API version
      if (market.resolved === true || market.closed === true) {
        // Try to get the winning outcome
        let outcome: number | undefined;

        // Check resolutionSource or winner fields
        if (market.outcome !== undefined && market.outcome !== null) {
          outcome = parseInt(market.outcome);
        } else if (market.winner !== undefined && market.winner !== null) {
          outcome = parseInt(market.winner);
        } else if (market.outcomePrices) {
          // If one price is 1.0 (or very close), that's the winner
          try {
            const prices = JSON.parse(market.outcomePrices);
            const numPrices = prices.map((p: string) => parseFloat(p));
            if (numPrices[0] >= 0.99) outcome = 0;
            else if (numPrices[1] >= 0.99) outcome = 1;
          } catch (e) {
            // Ignore parse errors
          }
        }

        if (outcome !== undefined) {
          return { resolved: true, outcome };
        }
      }

      return { resolved: false };
    } catch (error: any) {
      // Market might not exist anymore or API error
      console.error(`Error checking resolution for ${marketId}:`, error.message);
      return { resolved: false };
    }
  }
}
