/**
 * Multi-Outcome Spread Detector
 * Detects arbitrage when YES + NO prices don't sum to $1.00
 */

import {
  ArbitrageDetector,
  MarketData,
  MultiOutcomeOpportunity,
} from '../types';
import { arbConfig } from '../../config';

const POLYMARKET_FEE_PERCENT = 1.0; // ~1% round-trip fees

export class MultiOutcomeDetector implements ArbitrageDetector {
  type: 'multi_outcome' = 'multi_outcome';

  async detect(markets: MarketData[]): Promise<MultiOutcomeOpportunity[]> {
    const opportunities: MultiOutcomeOpportunity[] = [];

    for (const market of markets) {
      const opportunity = this.analyzeMarket(market);
      if (opportunity) {
        opportunities.push(opportunity);
      }
    }

    // Sort by profit potential
    return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
  }

  private analyzeMarket(market: MarketData): MultiOutcomeOpportunity | null {
    // Skip markets with insufficient liquidity
    if (market.liquidity < arbConfig.risk.minLiquidityUsd) {
      return null;
    }

    // Get YES and NO prices
    // In Polymarket, typically outcome 0 = No, outcome 1 = Yes
    const yesPrice = market.currentPrices[1] || 0;
    const noPrice = market.currentPrices[0] || 0;

    // Validate prices are in reasonable range
    if (yesPrice <= 0 || yesPrice >= 1 || noPrice <= 0 || noPrice >= 1) {
      return null;
    }

    const priceSum = yesPrice + noPrice;
    const spread = Math.abs(1.0 - priceSum);

    // Calculate profit after fees
    const grossProfitPercent = spread * 100;
    const netProfitPercent = grossProfitPercent - POLYMARKET_FEE_PERCENT;

    // Check minimum threshold (default 0.5%)
    if (netProfitPercent < arbConfig.minProfitThreshold) {
      return null;
    }

    // Determine direction
    const direction = priceSum > 1.0 ? 'overpriced' : 'underpriced';

    // Calculate confidence based on liquidity and spread characteristics
    const confidence = this.calculateConfidence(market, spread);

    // Check minimum confidence
    if (confidence < arbConfig.minConfidence) {
      return null;
    }

    return {
      type: 'multi_outcome',
      market1Id: market.id,
      market1Question: market.question,
      market1Price: yesPrice,
      market1Outcome: 1,
      market1Liquidity: market.liquidity,
      yesPrice,
      noPrice,
      priceSum,
      direction,
      spread,
      profitPercent: netProfitPercent,
      confidenceScore: confidence,
      status: 'active',
      detectedAt: Date.now(),
    };
  }

  /**
   * Calculate confidence score based on market characteristics
   * Returns 0-1 score
   */
  private calculateConfidence(market: MarketData, spread: number): number {
    let confidence = 0.5;

    // Higher liquidity = more confidence the prices are real
    if (market.liquidity >= 100000) {
      confidence += 0.25;
    } else if (market.liquidity >= 50000) {
      confidence += 0.15;
    } else if (market.liquidity >= 20000) {
      confidence += 0.1;
    }

    // Larger spreads are more suspicious (might be stale data)
    if (spread > 0.05) {
      confidence -= 0.3;
    } else if (spread > 0.03) {
      confidence -= 0.15;
    } else if (spread > 0.02) {
      confidence -= 0.05;
    }

    // Higher volume markets are more trustworthy
    if (market.volume >= 100000) {
      confidence += 0.1;
    }

    // Markets close to expiry might have stale prices
    if (market.endDate) {
      const daysUntilClose = (market.endDate - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysUntilClose < 1) {
        confidence -= 0.2;
      } else if (daysUntilClose < 7) {
        confidence -= 0.05;
      }
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Get recommended action for this opportunity
   */
  static getRecommendedAction(opp: MultiOutcomeOpportunity): {
    yesSide: 'BUY' | 'SELL';
    noSide: 'BUY' | 'SELL';
    description: string;
  } {
    if (opp.direction === 'overpriced') {
      // Sum > 1.0: Sell both to lock in profit
      return {
        yesSide: 'SELL',
        noSide: 'SELL',
        description: `Prices sum to ${(opp.priceSum * 100).toFixed(2)}% (>${100}%). SELL both YES and NO to guarantee profit.`,
      };
    } else {
      // Sum < 1.0: Buy both to lock in profit
      return {
        yesSide: 'BUY',
        noSide: 'BUY',
        description: `Prices sum to ${(opp.priceSum * 100).toFixed(2)}% (<${100}%). BUY both YES and NO to guarantee profit.`,
      };
    }
  }
}
