/**
 * NegRisk (Multi-Outcome) Detector
 * Detects arbitrage in markets with 3+ mutually exclusive outcomes
 * where exactly one must resolve to TRUE (sum of YES prices should = $1)
 */

import {
  ArbitrageDetector,
  MarketData,
  NegRiskOpportunity,
  NegRiskCondition,
  NegRiskDirection,
} from '../types';
import { arbConfig } from '../../config';

const POLYMARKET_FEE_PERCENT = 1.0; // ~1% round-trip fees
const MIN_CONDITIONS_FOR_NEGRISK = 3;

export class NegRiskDetector implements ArbitrageDetector {
  type: 'multi_outcome' = 'multi_outcome';

  // Cache for event groupings
  private eventCache: Map<string, NegRiskCondition[]> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 1 minute

  async detect(markets: MarketData[]): Promise<NegRiskOpportunity[]> {
    const opportunities: NegRiskOpportunity[] = [];

    // Group markets by event
    const eventGroups = this.groupMarketsByEvent(markets);

    // Analyze each event group for NegRisk opportunities
    for (const [eventId, conditions] of eventGroups) {
      if (conditions.length < MIN_CONDITIONS_FOR_NEGRISK) {
        continue; // Skip binary markets (handled by MultiOutcomeDetector)
      }

      const opportunity = this.analyzeNegRiskEvent(eventId, conditions);
      if (opportunity) {
        opportunities.push(opportunity);
      }
    }

    return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
  }

  /**
   * Group markets by their parent event using NegRisk metadata
   */
  private groupMarketsByEvent(markets: MarketData[]): Map<string, NegRiskCondition[]> {
    const eventGroups = new Map<string, NegRiskCondition[]>();

    for (const market of markets) {
      // Get the event key from NegRisk metadata
      const eventKey = market.negRiskMarketId || market.eventSlug;

      // Skip if no event grouping info or not a NegRisk market
      if (!eventKey) {
        continue;
      }

      // Skip if explicitly not a NegRisk market
      if (market.negRisk === false) {
        continue;
      }

      if (!eventGroups.has(eventKey)) {
        eventGroups.set(eventKey, []);
      }

      // Use YES price (typically outcome index 1)
      const yesPrice = market.currentPrices[1] || market.currentPrices[0] || 0.5;
      const noPrice = market.currentPrices[0] || (1 - yesPrice);

      eventGroups.get(eventKey)!.push({
        conditionId: market.conditionId || market.id,
        question: market.question,
        yesPrice,
        noPrice,
        liquidity: market.liquidity,
      });
    }

    return eventGroups;
  }

  /**
   * Analyze a NegRisk event for arbitrage opportunities
   */
  private analyzeNegRiskEvent(
    eventId: string,
    conditions: NegRiskCondition[]
  ): NegRiskOpportunity | null {
    // Calculate sum of all YES prices
    const totalYesPriceSum = conditions.reduce((sum, c) => sum + c.yesPrice, 0);

    // Calculate deviation from expected sum of 1.0
    const deviation = Math.abs(1.0 - totalYesPriceSum);

    // Calculate gross profit (before fees)
    const grossProfitPercent = deviation * 100;

    // Account for fees
    const netProfitPercent = grossProfitPercent - POLYMARKET_FEE_PERCENT;

    // Check minimum profit threshold (default 0.5%)
    if (netProfitPercent < arbConfig.minProfitThreshold) {
      return null;
    }

    // Check minimum liquidity across all conditions
    const minLiquidity = Math.min(...conditions.map(c => c.liquidity));
    if (minLiquidity < arbConfig.risk.minLiquidityUsd) {
      return null;
    }

    // Determine direction and strategy
    const direction: NegRiskDirection =
      totalYesPriceSum < 1 ? 'long_rebalancing' : 'short_rebalancing';

    // Calculate confidence
    const confidence = this.calculateConfidence(conditions, deviation, minLiquidity);

    if (confidence < arbConfig.minConfidence) {
      return null;
    }

    // Get representative condition for market1 fields (highest liquidity)
    const primaryCondition = conditions.reduce((best, c) =>
      c.liquidity > best.liquidity ? c : best
    );

    return {
      type: 'multi_outcome',
      subType: 'negrisk',
      eventId,
      eventTitle: this.extractEventTitle(conditions),

      // BaseOpportunity fields
      market1Id: primaryCondition.conditionId,
      market1Question: primaryCondition.question,
      market1Price: primaryCondition.yesPrice,
      market1Outcome: 1, // YES
      market1Liquidity: primaryCondition.liquidity,

      // NegRisk-specific
      conditions,
      totalYesPriceSum,
      direction,
      minConditionLiquidity: minLiquidity,

      // Legacy fields for compatibility
      yesPrice: primaryCondition.yesPrice,
      noPrice: primaryCondition.noPrice,
      priceSum: totalYesPriceSum,

      // Metrics
      spread: deviation,
      profitPercent: netProfitPercent,
      confidenceScore: confidence,
      status: 'active',
      detectedAt: Date.now(),
    };
  }

  /**
   * Calculate confidence score based on event characteristics
   */
  private calculateConfidence(
    conditions: NegRiskCondition[],
    deviation: number,
    minLiquidity: number
  ): number {
    let confidence = 0.5;

    // More conditions = more confidence (harder to manipulate)
    if (conditions.length >= 10) {
      confidence += 0.15;
    } else if (conditions.length >= 5) {
      confidence += 0.1;
    } else if (conditions.length >= 3) {
      confidence += 0.05;
    }

    // Higher minimum liquidity = more confidence
    if (minLiquidity >= 50000) {
      confidence += 0.2;
    } else if (minLiquidity >= 20000) {
      confidence += 0.1;
    } else if (minLiquidity >= 10000) {
      confidence += 0.05;
    }

    // Extreme deviations are suspicious (might be stale data)
    if (deviation > 0.1) {
      confidence -= 0.3; // >10% deviation is very suspicious
    } else if (deviation > 0.05) {
      confidence -= 0.15;
    } else if (deviation > 0.03) {
      confidence -= 0.05;
    }

    // All conditions should have reasonable prices
    const hasUnreasonablePrice = conditions.some(
      c => c.yesPrice < 0.01 || c.yesPrice > 0.99
    );
    if (hasUnreasonablePrice) {
      confidence -= 0.2;
    }

    // Check for conditions with very low liquidity (risky)
    const lowLiqConditions = conditions.filter(c => c.liquidity < 5000).length;
    if (lowLiqConditions > conditions.length / 2) {
      confidence -= 0.15;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Extract event title from condition questions
   */
  private extractEventTitle(conditions: NegRiskCondition[]): string {
    if (conditions.length === 0) return 'Unknown Event';

    // Try to extract common prefix from questions
    const questions = conditions.map(c => c.question);
    const firstWords = questions[0].split(' ');

    let commonPrefix = '';
    for (let i = 0; i < firstWords.length; i++) {
      const prefix = firstWords.slice(0, i + 1).join(' ');
      if (questions.every(q => q.startsWith(prefix))) {
        commonPrefix = prefix;
      } else {
        break;
      }
    }

    return commonPrefix || conditions[0].question.substring(0, 50);
  }

  /**
   * Get recommended action for NegRisk opportunity
   */
  static getRecommendedAction(opp: NegRiskOpportunity): {
    strategy: string;
    actions: { conditionId: string; side: 'BUY' | 'SELL'; outcome: 'YES' | 'NO' }[];
    description: string;
  } {
    const outcome = opp.direction === 'long_rebalancing' ? 'YES' : 'NO';
    const actions = opp.conditions.map(c => ({
      conditionId: c.conditionId,
      side: 'BUY' as const,
      outcome: outcome as 'YES' | 'NO',
    }));

    const description = opp.direction === 'long_rebalancing'
      ? `Sum of YES prices = ${(opp.totalYesPriceSum * 100).toFixed(2)}% (<100%). ` +
        `BUY all ${opp.conditions.length} YES tokens. Guaranteed profit = ${((1 - opp.totalYesPriceSum) * 100).toFixed(2)}%`
      : `Sum of YES prices = ${(opp.totalYesPriceSum * 100).toFixed(2)}% (>100%). ` +
        `BUY all ${opp.conditions.length} NO tokens. Guaranteed profit = ${((opp.totalYesPriceSum - 1) * 100).toFixed(2)}%`;

    return {
      strategy: opp.direction === 'long_rebalancing' ? 'buy_all_yes' : 'buy_all_no',
      actions,
      description,
    };
  }
}
