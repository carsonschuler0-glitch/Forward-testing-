/**
 * Related Market Arbitrage Detector
 * Detects logical inconsistencies between related markets
 * e.g., P(win primary) should be >= P(win general election)
 */

import {
  ArbitrageDetector,
  MarketData,
  RelatedMarketOpportunity,
  RelationshipType,
} from '../types';
import { entityExtractor } from '../matchers/entityExtractor';
import { arbConfig } from '../../config';

const POLYMARKET_FEE_PERCENT = 1.0;

// Patterns for detecting related markets
interface RelationshipPattern {
  pattern1: RegExp;
  pattern2: RegExp;
  type: RelationshipType;
  constraint: string;
  // market1 with pattern1 should have >= probability than market2 with pattern2
  market1ShouldBeHigher: boolean;
}

const RELATIONSHIP_PATTERNS: RelationshipPattern[] = [
  // Electoral: Primary vs General
  {
    pattern1: /win.*(primary|nomination)/i,
    pattern2: /win.*(general|election|president)/i,
    type: 'superset',
    constraint: 'P(win primary) >= P(win general)',
    market1ShouldBeHigher: true,
  },
  // Electoral: Nomination vs Presidency
  {
    pattern1: /(nominee|nomination)/i,
    pattern2: /president/i,
    type: 'superset',
    constraint: 'P(nomination) >= P(presidency)',
    market1ShouldBeHigher: true,
  },
  // Sports: Make playoffs vs Win championship
  {
    pattern1: /make.*(playoffs|postseason)/i,
    pattern2: /win.*(championship|title|super bowl|world series)/i,
    type: 'superset',
    constraint: 'P(make playoffs) >= P(win championship)',
    market1ShouldBeHigher: true,
  },
  // Sports: Win division vs Win conference
  {
    pattern1: /win.*(division)/i,
    pattern2: /win.*(conference)/i,
    type: 'superset',
    constraint: 'P(win division) >= P(win conference)',
    market1ShouldBeHigher: true,
  },
  // Price targets: Lower price vs Higher price
  {
    pattern1: /(?:reach|hit|above)\s*\$?\d+(?:,\d{3})*(?:k|m|b)?/i,
    pattern2: /(?:reach|hit|above)\s*\$?\d+(?:,\d{3})*(?:k|m|b)?/i,
    type: 'superset',
    constraint: 'P(reach lower target) >= P(reach higher target)',
    market1ShouldBeHigher: true, // Will be determined dynamically
  },
];

export class RelatedMarketDetector implements ArbitrageDetector {
  type: 'related_market' = 'related_market';

  async detect(markets: MarketData[]): Promise<RelatedMarketOpportunity[]> {
    const opportunities: RelatedMarketOpportunity[] = [];

    // Group markets by category for more efficient comparison
    const categoryGroups = this.groupByCategory(markets);

    // Check each category group for related markets
    for (const [category, categoryMarkets] of categoryGroups) {
      const categoryOpps = this.findRelatedInCategory(categoryMarkets);
      opportunities.push(...categoryOpps);
    }

    // Also check across similar categories
    const crossCategoryOpps = this.findCrossCategoryRelated(categoryGroups);
    opportunities.push(...crossCategoryOpps);

    // Sort by profit potential
    return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
  }

  private groupByCategory(markets: MarketData[]): Map<string, MarketData[]> {
    const groups = new Map<string, MarketData[]>();

    for (const market of markets) {
      const category = market.category || 'other';
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(market);
    }

    return groups;
  }

  private findRelatedInCategory(markets: MarketData[]): RelatedMarketOpportunity[] {
    const opportunities: RelatedMarketOpportunity[] = [];

    for (let i = 0; i < markets.length; i++) {
      for (let j = i + 1; j < markets.length; j++) {
        const opportunity = this.analyzeRelationship(markets[i], markets[j]);
        if (opportunity) {
          opportunities.push(opportunity);
        }
      }
    }

    return opportunities;
  }

  private findCrossCategoryRelated(
    categoryGroups: Map<string, MarketData[]>
  ): RelatedMarketOpportunity[] {
    const opportunities: RelatedMarketOpportunity[] = [];

    // Politics categories that might have related markets
    const politicsCategories = ['politics', 'elections', 'us politics'];
    const sportsCategories = ['sports', 'nfl', 'nba', 'mlb', 'soccer'];

    // Compare politics markets across subcategories
    const politicsMarkets: MarketData[] = [];
    for (const cat of politicsCategories) {
      politicsMarkets.push(...(categoryGroups.get(cat) || []));
    }

    for (let i = 0; i < politicsMarkets.length; i++) {
      for (let j = i + 1; j < politicsMarkets.length; j++) {
        const opp = this.analyzeRelationship(politicsMarkets[i], politicsMarkets[j]);
        if (opp) opportunities.push(opp);
      }
    }

    return opportunities;
  }

  private analyzeRelationship(
    market1: MarketData,
    market2: MarketData
  ): RelatedMarketOpportunity | null {
    // Skip markets with insufficient liquidity
    if (
      market1.liquidity < arbConfig.risk.minLiquidityUsd ||
      market2.liquidity < arbConfig.risk.minLiquidityUsd
    ) {
      return null;
    }

    // Check if markets share common entities (same subject)
    const entities1 = entityExtractor.extract(market1.question);
    const entities2 = entityExtractor.extract(market2.question);

    const sharedNames = entities1.names.filter(n => entities2.names.includes(n));
    if (sharedNames.length === 0) {
      return null; // Must be about the same subject
    }

    // Try each relationship pattern
    for (const pattern of RELATIONSHIP_PATTERNS) {
      const result = this.checkPattern(market1, market2, pattern);
      if (result) {
        return result;
      }

      // Also try reverse
      const reverseResult = this.checkPattern(market2, market1, pattern);
      if (reverseResult) {
        return reverseResult;
      }
    }

    return null;
  }

  private checkPattern(
    market1: MarketData,
    market2: MarketData,
    pattern: RelationshipPattern
  ): RelatedMarketOpportunity | null {
    const matches1 = pattern.pattern1.test(market1.question);
    const matches2 = pattern.pattern2.test(market2.question);

    if (!matches1 || !matches2) {
      return null;
    }

    const price1 = market1.currentPrices[1] || 0; // YES price
    const price2 = market2.currentPrices[1] || 0;

    // For price target patterns, determine which is lower/higher
    let shouldBeHigher = pattern.market1ShouldBeHigher;
    if (pattern.constraint.includes('target')) {
      const num1 = this.extractNumber(market1.question);
      const num2 = this.extractNumber(market2.question);
      if (num1 !== null && num2 !== null) {
        shouldBeHigher = num1 < num2; // Lower target should have higher probability
      }
    }

    // Check for violation
    let violation = 0;
    if (shouldBeHigher) {
      // market1 should have higher or equal probability
      if (price1 < price2) {
        violation = price2 - price1;
      }
    } else {
      // market1 should have lower or equal probability
      if (price1 > price2) {
        violation = price1 - price2;
      }
    }

    // Minimum violation threshold (higher than other types due to uncertainty)
    const minViolation = 0.015; // 1.5%
    if (violation < minViolation) {
      return null;
    }

    // Calculate profit after fees
    const grossProfitPercent = violation * 100;
    const netProfitPercent = grossProfitPercent - POLYMARKET_FEE_PERCENT;

    if (netProfitPercent < arbConfig.minProfitThreshold) {
      return null;
    }

    // Calculate confidence (lower than other types due to relationship uncertainty)
    const confidence = this.calculateConfidence(market1, market2, violation);

    if (confidence < arbConfig.minConfidence) {
      return null;
    }

    // Determine which market to bet on
    const [cheapMarket, cheapPrice, expensiveMarket, expensivePrice] = shouldBeHigher
      ? [market1, price1, market2, price2]
      : [market2, price2, market1, price1];

    return {
      type: 'related_market',
      market1Id: cheapMarket.id,
      market1Question: cheapMarket.question,
      market1Price: cheapPrice,
      market1Outcome: 1,
      market1Liquidity: cheapMarket.liquidity,
      market2Id: expensiveMarket.id,
      market2Question: expensiveMarket.question,
      market2Price: expensivePrice,
      market2Outcome: 1,
      market2Liquidity: expensiveMarket.liquidity,
      relationshipType: pattern.type,
      expectedConstraint: pattern.constraint,
      violation,
      spread: violation,
      profitPercent: netProfitPercent,
      confidenceScore: confidence,
      status: 'active',
      detectedAt: Date.now(),
    };
  }

  private extractNumber(text: string): number | null {
    const match = text.match(/\$?([\d,]+(?:\.\d+)?)(k|m|b)?/i);
    if (!match) return null;

    let num = parseFloat(match[1].replace(/,/g, ''));
    const suffix = match[2]?.toLowerCase();

    if (suffix === 'k') num *= 1000;
    else if (suffix === 'm') num *= 1000000;
    else if (suffix === 'b') num *= 1000000000;

    return num;
  }

  private calculateConfidence(
    market1: MarketData,
    market2: MarketData,
    violation: number
  ): number {
    // Start with lower base confidence for relationship-based arbitrage
    let confidence = 0.4;

    // Higher liquidity = more confidence
    const minLiquidity = Math.min(market1.liquidity, market2.liquidity);
    if (minLiquidity >= 50000) {
      confidence += 0.2;
    } else if (minLiquidity >= 20000) {
      confidence += 0.1;
    }

    // Larger violations are more confident (clear mispricing)
    if (violation > 0.1) {
      confidence += 0.15;
    } else if (violation > 0.05) {
      confidence += 0.1;
    }

    // Same category = more confidence in relationship
    if (market1.category === market2.category) {
      confidence += 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Get recommended action for this opportunity
   */
  static getRecommendedAction(opp: RelatedMarketOpportunity): {
    action1: { side: 'BUY' | 'SELL'; market: string };
    action2: { side: 'BUY' | 'SELL'; market: string };
    description: string;
  } {
    return {
      action1: {
        side: 'BUY',
        market: opp.market1Id,
      },
      action2: {
        side: 'SELL',
        market: opp.market2Id,
      },
      description: `Constraint violation: ${opp.expectedConstraint}. Buy underpriced market, sell overpriced market.`,
    };
  }
}
