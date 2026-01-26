/**
 * Cross-Market Arbitrage Detector
 * Detects price discrepancies for the same event across different markets
 */

import {
  ArbitrageDetector,
  MarketData,
  CrossMarketOpportunity,
  MarketMatch,
} from '../types';
import { questionSimilarityMatcher } from '../matchers/questionSimilarity';
import { arbConfig } from '../../config';

const POLYMARKET_FEE_PERCENT = 1.0; // ~1% round-trip fees

export class CrossMarketDetector implements ArbitrageDetector {
  type: 'cross_market' = 'cross_market';

  async detect(markets: MarketData[]): Promise<CrossMarketOpportunity[]> {
    const opportunities: CrossMarketOpportunity[] = [];

    // Find matching market pairs
    const matches = questionSimilarityMatcher.findMatches(markets);

    // Create a map for quick market lookup
    const marketMap = new Map(markets.map(m => [m.id, m]));

    // Analyze each match for arbitrage opportunities
    for (const match of matches) {
      const market1 = marketMap.get(match.market1Id);
      const market2 = marketMap.get(match.market2Id);

      if (!market1 || !market2) continue;

      const opportunity = this.analyzeMatchPair(market1, market2, match);
      if (opportunity) {
        opportunities.push(opportunity);
      }
    }

    // Sort by profit potential
    return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
  }

  private analyzeMatchPair(
    market1: MarketData,
    market2: MarketData,
    match: MarketMatch
  ): CrossMarketOpportunity | null {
    // Skip markets with insufficient liquidity
    if (
      market1.liquidity < arbConfig.risk.minLiquidityUsd ||
      market2.liquidity < arbConfig.risk.minLiquidityUsd
    ) {
      return null;
    }

    // Get YES prices for both markets
    const yesPrice1 = market1.currentPrices[1] || 0;
    const yesPrice2 = market2.currentPrices[1] || 0;
    const noPrice1 = market1.currentPrices[0] || 0;
    const noPrice2 = market2.currentPrices[0] || 0;

    // Validate prices
    if (!this.isValidPrice(yesPrice1) || !this.isValidPrice(yesPrice2)) {
      return null;
    }

    let priceDiff: number;
    let cheapMarket: MarketData;
    let cheapOutcome: number;
    let cheapPrice: number;
    let expensiveMarket: MarketData;
    let expensiveOutcome: number;
    let expensivePrice: number;

    if (match.matchType === 'exact') {
      // Same event: compare YES prices directly
      priceDiff = Math.abs(yesPrice1 - yesPrice2);

      if (yesPrice1 < yesPrice2) {
        cheapMarket = market1;
        cheapOutcome = 1;
        cheapPrice = yesPrice1;
        expensiveMarket = market2;
        expensiveOutcome = 1;
        expensivePrice = yesPrice2;
      } else {
        cheapMarket = market2;
        cheapOutcome = 1;
        cheapPrice = yesPrice2;
        expensiveMarket = market1;
        expensiveOutcome = 1;
        expensivePrice = yesPrice1;
      }
    } else {
      // Inverse markets: market1.YES should equal market2.NO
      // Compare yesPrice1 with noPrice2
      priceDiff = Math.abs(yesPrice1 - noPrice2);

      if (yesPrice1 < noPrice2) {
        // market1.YES is cheaper than market2.NO
        // Buy market1.YES, sell market2.NO (or buy market2.YES)
        cheapMarket = market1;
        cheapOutcome = 1; // YES
        cheapPrice = yesPrice1;
        expensiveMarket = market2;
        expensiveOutcome = 0; // NO
        expensivePrice = noPrice2;
      } else {
        // market2.NO is cheaper than market1.YES
        cheapMarket = market2;
        cheapOutcome = 0; // NO
        cheapPrice = noPrice2;
        expensiveMarket = market1;
        expensiveOutcome = 1; // YES
        expensivePrice = yesPrice1;
      }
    }

    // Calculate profit after fees
    const grossProfitPercent = (priceDiff / cheapPrice) * 100;
    const netProfitPercent = grossProfitPercent - POLYMARKET_FEE_PERCENT;

    // Check minimum threshold
    if (netProfitPercent < arbConfig.minProfitThreshold) {
      return null;
    }

    // Calculate confidence
    const confidence = this.calculateConfidence(market1, market2, match, priceDiff);

    // Check minimum confidence
    if (confidence < arbConfig.minConfidence) {
      return null;
    }

    return {
      type: 'cross_market',
      market1Id: cheapMarket.id,
      market1Question: cheapMarket.question,
      market1Price: cheapPrice,
      market1Outcome: cheapOutcome,
      market1Liquidity: cheapMarket.liquidity,
      market2Id: expensiveMarket.id,
      market2Question: expensiveMarket.question,
      market2Price: expensivePrice,
      market2Outcome: expensiveOutcome,
      market2Liquidity: expensiveMarket.liquidity,
      matchType: match.matchType as 'exact' | 'inverse',
      similarityScore: match.similarityScore,
      spread: priceDiff,
      profitPercent: netProfitPercent,
      confidenceScore: confidence,
      status: 'active',
      detectedAt: Date.now(),
    };
  }

  private isValidPrice(price: number): boolean {
    return price > 0.01 && price < 0.99;
  }

  private calculateConfidence(
    market1: MarketData,
    market2: MarketData,
    match: MarketMatch,
    priceDiff: number
  ): number {
    let confidence = match.similarityScore * 0.5; // Start with similarity as base

    // Both markets having good liquidity increases confidence
    const minLiquidity = Math.min(market1.liquidity, market2.liquidity);
    if (minLiquidity >= 50000) {
      confidence += 0.2;
    } else if (minLiquidity >= 20000) {
      confidence += 0.1;
    }

    // Larger price differences on high-similarity matches are suspicious
    if (priceDiff > 0.15 && match.similarityScore > 0.8) {
      confidence -= 0.2; // Might be different events that look similar
    }

    // Shared entities increase confidence
    if (match.sharedEntities.length >= 3) {
      confidence += 0.15;
    } else if (match.sharedEntities.length >= 2) {
      confidence += 0.1;
    }

    // Same category increases confidence
    if (market1.category === market2.category) {
      confidence += 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Get recommended action for this opportunity
   */
  static getRecommendedAction(opp: CrossMarketOpportunity): {
    action1: { side: 'BUY' | 'SELL'; market: string };
    action2: { side: 'BUY' | 'SELL'; market: string };
    description: string;
  } {
    // Buy the cheap one, sell the expensive one
    return {
      action1: {
        side: 'BUY',
        market: opp.market1Id,
      },
      action2: {
        side: 'SELL',
        market: opp.market2Id,
      },
      description: `Buy ${opp.matchType === 'exact' ? 'YES' : opp.market1Outcome === 1 ? 'YES' : 'NO'} on market 1 @ ${(opp.market1Price * 100).toFixed(1)}%, Sell ${opp.matchType === 'exact' ? 'YES' : opp.market2Outcome === 1 ? 'YES' : 'NO'} on market 2 @ ${(opp.market2Price * 100).toFixed(1)}%`,
    };
  }
}
