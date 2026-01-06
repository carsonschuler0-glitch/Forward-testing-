import axios from 'axios';
import { HistoricalMarket, HistoricalTrade } from './types';

export class BacktestDataFetcher {
  private gammaApi = 'https://gamma-api.polymarket.com';
  private dataApi = 'https://data-api.polymarket.com';

  /**
   * Fetch resolved markets with their outcomes
   * Focus on low-liquidity markets for better signal
   */
  async fetchResolvedMarkets(
    minLiquidity: number = 100,
    maxLiquidity: number = 50000,
    limit: number = 100
  ): Promise<HistoricalMarket[]> {
    try {
      const allMarkets: HistoricalMarket[] = [];
      const marketsPerRequest = 100; // API limit
      const numRequests = Math.ceil(limit / marketsPerRequest);

      console.log(`  Fetching up to ${limit} markets in ${numRequests} batches...`);

      // Make multiple requests with different offsets to get more diversity
      for (let batch = 0; batch < numRequests; batch++) {
        try {
          const offset = batch * marketsPerRequest;

          // Try different orderings to get diverse markets
          const orderBy = batch % 3 === 0 ? 'volume' :
                         batch % 3 === 1 ? 'liquidity' :
                         'end_date_iso';

          const response = await axios.get(`${this.gammaApi}/markets`, {
            params: {
              limit: marketsPerRequest,
              offset,
              // No closed filter - get all markets regardless of status
            },
          });

          if (!response.data || !Array.isArray(response.data)) {
            console.log(`  Batch ${batch + 1}: No data`);
            continue;
          }

          console.log(`  Batch ${batch + 1}: Got ${response.data.length} markets`);

          for (const market of response.data) {
            const liquidity = parseFloat(market.liquidity || market.volume || '0');
            const volume = parseFloat(market.volume || market.liquidity || '0');

            // Check if market is closed/resolved
            const isClosed = market.closed === true ||
                            market.active === false ||
                            (market.end_date_iso && new Date(market.end_date_iso) < new Date());

            // Only include markets closed within the last 90 days to ensure we can get resolution data
            const closedDate = market.end_date_iso ? new Date(market.end_date_iso) : null;
            const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            const isRecentlyClosed = closedDate && closedDate > ninetyDaysAgo;

            if (isClosed && isRecentlyClosed) {
              // Still collect liquidity data, but don't filter by it
              // We'll track patterns across ALL liquidity ranges
              const resolvedOutcome = this.parseResolvedOutcome(market);

              // Skip markets where we can't determine outcome
              if (resolvedOutcome === null) {
                continue;
              }

              // Deduplicate by ID
              const exists = allMarkets.some(m => m.id === (market.condition_id || market.id));
              if (!exists) {
                // Extract category from tags or question
                const category = market.tags?.[0] || market.category || this.categorizeMarket(market.question);

                // Get initial price (current outcome_prices if available)
                const initialPrice = market.outcome_prices?.[1] || 0.5;

                allMarkets.push({
                  id: market.condition_id || market.id || `market-${Date.now()}-${Math.random()}`,
                  question: market.question || 'Unknown Market',
                  outcomes: market.outcomes || market.outcome_prices?.length === 2 ? ['No', 'Yes'] : ['No', 'Yes'],
                  liquidity,
                  volume,
                  resolvedOutcome,
                  resolvedAt: market.end_date_iso
                    ? new Date(market.end_date_iso).getTime()
                    : Date.now(),
                  createdAt: market.created_at
                    ? new Date(market.created_at).getTime()
                    : Date.now() - 30 * 24 * 60 * 60 * 1000,
                  category,
                  initialPrice,
                });
              }
            }
          }

          // Small delay to avoid rate limiting
          if (batch < numRequests - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (batchError: any) {
          console.log(`  Batch ${batch + 1}: Error - ${batchError.message}`);
          continue;
        }
      }

      // Report granular liquidity distribution
      const ranges = [
        { name: 'Micro (<$1k)', min: 0, max: 1000 },
        { name: 'Small ($1k-$5k)', min: 1000, max: 5000 },
        { name: 'Medium ($5k-$10k)', min: 5000, max: 10000 },
        { name: 'Large ($10k-$50k)', min: 10000, max: 50000 },
        { name: 'XLarge ($50k-$100k)', min: 50000, max: 100000 },
        { name: 'Mega (>$100k)', min: 100000, max: Infinity },
      ];

      console.log(`  Total unique resolved markets: ${allMarkets.length}`);
      console.log(`  Granular liquidity distribution:`);

      ranges.forEach(range => {
        const marketsInRange = allMarkets.filter(m => m.liquidity >= range.min && m.liquidity < range.max);
        const count = marketsInRange.length;
        const avgLiq = count > 0 ? marketsInRange.reduce((s, m) => s + m.liquidity, 0) / count : 0;
        const pct = ((count / allMarkets.length) * 100).toFixed(1);
        console.log(`    - ${range.name}: ${count} markets (${pct}%, avg $${avgLiq.toFixed(0)})`);
      });

      return allMarkets;
    } catch (error: any) {
      console.error('Error fetching resolved markets:', error.message);
      return [];
    }
  }

  /**
   * Categorize market based on question content
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
   * Parse which outcome won from market data
   * Returns null if we can't determine - will need to fetch from price history later
   */
  private parseResolvedOutcome(market: any): number | null {
    // Try to determine winning outcome from various fields
    if (market.winning_outcome !== undefined) {
      return market.winning_outcome;
    }

    // Check if there's a resolved price (0 or 1)
    if (market.outcomePrices) {
      try {
        const prices = JSON.parse(market.outcomePrices);
        // Final prices should be exactly "0" or "1" for resolved markets
        if (prices[0] === "1" || prices[0] === 1) return 0;
        if (prices[1] === "1" || prices[1] === 1) return 1;
      } catch (e) {
        // Ignore parse errors
      }
    }

    if (market.outcomes_prices) {
      const prices = market.outcomes_prices;
      if (prices[0] === 0 && prices[1] === 1) return 1;
      if (prices[0] === 1 && prices[1] === 0) return 0;
      if (prices[0] === "0" && prices[1] === "1") return 1;
      if (prices[0] === "1" && prices[1] === "0") return 0;
    }

    // If market is closed but we can't determine outcome, return null
    return null;
  }

  /**
   * Fetch the resolved outcome by looking at price history
   * For resolved markets, the final price should be 0.99+ or 0.01-
   */
  async fetchResolvedOutcomeFromPriceHistory(market: HistoricalMarket): Promise<number | null> {
    try {
      // The CLOB API has price history per token
      // We need to check the clobTokenIds from the market
      const response = await axios.get(`${this.gammaApi}/markets`, {
        params: {
          condition_id: market.id,
          limit: 1,
        },
      });

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const marketData = response.data[0];

      // Try to parse the current outcome prices
      if (marketData.outcomePrices) {
        try {
          const prices = JSON.parse(marketData.outcomePrices);
          // If Yes (index 1) is at 1.0, then Yes won
          if (parseFloat(prices[1]) > 0.95) return 1;
          if (parseFloat(prices[0]) > 0.95) return 0;
        } catch (e) {
          // Ignore
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * For a given market, analyze the volume distribution
   * This helps identify large trades even without individual trade data
   */
  async analyzeMarketVolumePattern(marketId: string): Promise<{
    totalVolume: number;
    volumeByOutcome: number[];
    largeTradeThreshold: number;
  }> {
    try {
      const response = await axios.get(`${this.gammaApi}/markets/${marketId}`);
      const market = response.data;

      const totalVolume = parseFloat(market.volume || '0');
      const liquidity = parseFloat(market.liquidity || '0');

      // Estimate volume by outcome (if available)
      const volumeByOutcome = market.outcomes_prices
        ? market.outcomes_prices.map((price: number) => totalVolume * price)
        : [totalVolume / 2, totalVolume / 2];

      // Define "large trade" as anything > 5% of total volume or 10% of liquidity
      const largeTradeThreshold = Math.max(totalVolume * 0.05, liquidity * 0.1);

      return {
        totalVolume,
        volumeByOutcome,
        largeTradeThreshold,
      };
    } catch (error) {
      console.error(`Error analyzing market ${marketId}:`, error);
      return {
        totalVolume: 0,
        volumeByOutcome: [0, 0],
        largeTradeThreshold: 0,
      };
    }
  }

  /**
   * Fetch real trades for a market from the Data API
   */
  async fetchRealTrades(market: HistoricalMarket, minTradeSize: number = 1000): Promise<HistoricalTrade[]> {
    try {
      // Fetch trades for this condition_id
      const response = await axios.get(`${this.dataApi}/trades`, {
        params: {
          condition_id: market.id,
          limit: 1000, // Get up to 1000 trades per market
        },
      });

      if (!response.data || !Array.isArray(response.data)) {
        return [];
      }

      // Determine favorite side based on initial price
      const favoriteOutcome = (market.initialPrice || 0.5) > 0.5 ? 1 : 0;

      // Filter and transform trades
      const trades: HistoricalTrade[] = [];

      for (const apiTrade of response.data) {
        // Convert timestamp to milliseconds
        const timestamp = apiTrade.timestamp * 1000;

        // Skip trades that happened after market resolution
        if (market.resolvedAt && timestamp > market.resolvedAt) {
          continue;
        }

        // Only include trades >= minimum size
        if (apiTrade.size < minTradeSize) {
          continue;
        }

        // Determine which outcome this trade was for
        const outcome = apiTrade.outcomeIndex;

        // Was this the correct outcome?
        const wasCorrect = market.resolvedOutcome !== null
          ? outcome === market.resolvedOutcome
          : undefined;

        // Was this the favorite or underdog?
        const wasFavorite = outcome === favoriteOutcome;
        const wasUnderdog = !wasFavorite;

        trades.push({
          id: apiTrade.transactionHash || `${market.id}-${timestamp}`,
          marketId: market.id,
          trader: apiTrade.proxyWallet,
          outcome,
          size: apiTrade.size,
          price: apiTrade.price,
          timestamp,
          wasCorrect,
          wasFavorite,
          wasUnderdog,
        });
      }

      return trades;
    } catch (error: any) {
      // If the API fails, return empty array
      console.error(`Error fetching trades for market ${market.id}:`, error.message);
      return [];
    }
  }
}
