/**
 * Semantic Dependency Detector
 * Uses LLM to identify logical relationships between markets
 */

import {
  ArbitrageDetector,
  MarketData,
  SemanticDependencyOpportunity,
  SemanticAnalysisResult,
  SemanticRelationshipType,
  RelationshipType,
} from '../types';
import { llmClient } from '../llm/llmClient';
import { semanticCache } from '../llm/semanticCache';
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  parseAnalysisResponse,
  LLMAnalysisResponse,
} from '../llm/promptTemplates';
import { entityExtractor } from '../matchers/entityExtractor';
import { arbConfig } from '../../config';

const POLYMARKET_FEE_PERCENT = 1.0;

export class SemanticDependencyDetector implements ArbitrageDetector {
  type: 'related_market' = 'related_market';

  // Pre-filter using entity extraction to reduce LLM calls
  private entityCache: Map<string, ReturnType<typeof entityExtractor.extract>> = new Map();

  async detect(markets: MarketData[]): Promise<SemanticDependencyOpportunity[]> {
    // Skip if LLM is not enabled
    if (!arbConfig.llm.enabled || !llmClient.isEnabled()) {
      return [];
    }

    const opportunities: SemanticDependencyOpportunity[] = [];

    // Pre-extract entities for filtering
    for (const market of markets) {
      if (!this.entityCache.has(market.id)) {
        this.entityCache.set(market.id, entityExtractor.extract(market.question));
      }
    }

    // Find candidate pairs using entity overlap
    const candidatePairs = this.findCandidatePairs(markets);

    if (candidatePairs.length > 0) {
      console.log(`SemanticDetector: Analyzing ${candidatePairs.length} candidate pairs`);
    }

    // Analyze each candidate pair
    for (const [market1, market2] of candidatePairs) {
      try {
        const result = await this.analyzeMarketPair(market1, market2);

        if (result) {
          const opportunity = this.createOpportunity(market1, market2, result);
          if (opportunity) {
            opportunities.push(opportunity);
          }
        }
      } catch (err) {
        console.error(`Error analyzing market pair:`, err);
      }
    }

    return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
  }

  /**
   * Pre-filter market pairs using entity extraction
   * Only pairs with shared entities are sent to LLM
   */
  private findCandidatePairs(markets: MarketData[]): [MarketData, MarketData][] {
    const pairs: [MarketData, MarketData][] = [];

    for (let i = 0; i < markets.length; i++) {
      for (let j = i + 1; j < markets.length; j++) {
        const market1 = markets[i];
        const market2 = markets[j];

        // Skip low liquidity markets
        if (
          market1.liquidity < arbConfig.risk.minLiquidityUsd ||
          market2.liquidity < arbConfig.risk.minLiquidityUsd
        ) {
          continue;
        }

        // Check for shared entities
        const entities1 = this.entityCache.get(market1.id)!;
        const entities2 = this.entityCache.get(market2.id)!;

        const sharedNames = entities1.names.filter(n => entities2.names.includes(n));
        const sharedKeywords = entities1.keywords.filter(k => entities2.keywords.includes(k));

        // Must share at least one name and one keyword
        if (sharedNames.length > 0 && sharedKeywords.length > 0) {
          // Skip if already cached with no relationship
          if (this.shouldSkipPair(market1.id, market2.id)) {
            continue;
          }
          pairs.push([market1, market2]);
        }
      }
    }

    // Limit number of pairs to avoid excessive LLM calls
    const maxPairs = 50;
    if (pairs.length > maxPairs) {
      // Prioritize pairs with more shared entities
      pairs.sort((a, b) => {
        const scoreA = this.pairEntityScore(a[0], a[1]);
        const scoreB = this.pairEntityScore(b[0], b[1]);
        return scoreB - scoreA;
      });
      return pairs.slice(0, maxPairs);
    }

    return pairs;
  }

  /**
   * Check if pair should be skipped (already cached with no relationship)
   */
  private shouldSkipPair(market1Id: string, market2Id: string): boolean {
    const cached = semanticCache.get(market1Id, market2Id);
    if (cached && cached.relationshipType === 'none') {
      return true;
    }
    return false;
  }

  /**
   * Calculate entity overlap score for pair prioritization
   */
  private pairEntityScore(m1: MarketData, m2: MarketData): number {
    const e1 = this.entityCache.get(m1.id)!;
    const e2 = this.entityCache.get(m2.id)!;

    const sharedNames = e1.names.filter(n => e2.names.includes(n)).length;
    const sharedKeywords = e1.keywords.filter(k => e2.keywords.includes(k)).length;

    return sharedNames * 2 + sharedKeywords;
  }

  /**
   * Analyze a market pair using LLM
   */
  private async analyzeMarketPair(
    market1: MarketData,
    market2: MarketData
  ): Promise<SemanticAnalysisResult | null> {
    // Check cache first
    const cached = semanticCache.get(market1.id, market2.id);
    if (cached) {
      llmClient.incrementCacheHit();
      return cached;
    }

    llmClient.incrementCacheMiss();

    try {
      const userPrompt = buildUserPrompt(
        market1.question,
        market1.currentPrices[1] || 0.5,
        market2.question,
        market2.currentPrices[1] || 0.5
      );

      const response = await llmClient.chat([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ]);

      const parsed = parseAnalysisResponse(response);

      if (!parsed || parsed.relationship_type === 'none') {
        // Cache negative results too
        const negativeResult: SemanticAnalysisResult = {
          market1Id: market1.id,
          market2Id: market2.id,
          relationshipType: 'none',
          confidence: 0,
          reasoning: 'No relationship detected',
          constraint: null,
        };
        semanticCache.set(negativeResult);
        return null;
      }

      const result = this.transformLLMResponse(market1, market2, parsed);
      semanticCache.set(result);

      return result;
    } catch (err) {
      console.error('LLM analysis error:', err);
      return null;
    }
  }

  /**
   * Transform LLM response to internal format
   */
  private transformLLMResponse(
    market1: MarketData,
    market2: MarketData,
    response: LLMAnalysisResponse
  ): SemanticAnalysisResult {
    const relationshipType = this.mapRelationshipType(response.relationship_type);

    return {
      market1Id: market1.id,
      market2Id: market2.id,
      relationshipType,
      confidence: response.confidence,
      reasoning: response.reasoning,
      constraint: response.constraint
        ? {
            type: (response.constraint.type as any) || 'probability_bound',
            expression: response.constraint.expression || '',
            expectedRelation: this.mapExpectedRelation(response.constraint.market1_should_be),
          }
        : null,
      arbitrageDirection: response.arbitrage_direction
        ? {
            buyMarket: response.arbitrage_direction.buy === 'market1' ? market1.id : market2.id,
            sellMarket: response.arbitrage_direction.sell === 'market1' ? market1.id : market2.id,
          }
        : undefined,
    };
  }

  /**
   * Map string to SemanticRelationshipType
   */
  private mapRelationshipType(type: string): SemanticRelationshipType {
    const mapping: Record<string, SemanticRelationshipType> = {
      subset: 'subset',
      superset: 'superset',
      mutual_exclusion: 'mutual_exclusion',
      logical_bound: 'logical_bound',
      nested_target: 'nested_target',
      temporal: 'temporal',
      none: 'none',
    };
    return mapping[type.toLowerCase()] || 'none';
  }

  /**
   * Map constraint relation
   */
  private mapExpectedRelation(
    relation: 'higher' | 'lower' | 'equal' | null
  ): 'gte' | 'lte' | 'eq' | 'exclusive' {
    switch (relation) {
      case 'higher':
        return 'gte';
      case 'lower':
        return 'lte';
      case 'equal':
        return 'eq';
      default:
        return 'gte';
    }
  }

  /**
   * Map semantic relationship to legacy relationship type
   */
  private mapToLegacyRelationship(semantic: SemanticRelationshipType): RelationshipType {
    switch (semantic) {
      case 'subset':
        return 'subset';
      case 'superset':
        return 'superset';
      case 'mutual_exclusion':
        return 'mutex';
      default:
        return 'subset';
    }
  }

  /**
   * Create opportunity from analysis result
   */
  private createOpportunity(
    market1: MarketData,
    market2: MarketData,
    analysis: SemanticAnalysisResult
  ): SemanticDependencyOpportunity | null {
    // Check confidence threshold
    if (analysis.confidence < arbConfig.llm.minConfidenceThreshold) {
      return null;
    }

    // Check if there's a constraint violation
    if (!analysis.constraint || !analysis.arbitrageDirection) {
      return null;
    }

    const price1 = market1.currentPrices[1] || 0.5;
    const price2 = market2.currentPrices[1] || 0.5;

    // Calculate violation
    let violation = 0;
    switch (analysis.constraint.expectedRelation) {
      case 'gte':
        violation = price2 > price1 ? price2 - price1 : 0;
        break;
      case 'lte':
        violation = price1 > price2 ? price1 - price2 : 0;
        break;
      case 'eq':
        violation = Math.abs(price1 - price2);
        break;
      case 'exclusive':
        violation = Math.max(0, price1 + price2 - 1);
        break;
    }

    // Minimum violation threshold (1.5%)
    if (violation < 0.015) {
      return null;
    }

    // Calculate profit
    const grossProfitPercent = violation * 100;
    const netProfitPercent = grossProfitPercent - POLYMARKET_FEE_PERCENT;

    if (netProfitPercent < arbConfig.minProfitThreshold) {
      return null;
    }

    // Determine which market to buy/sell based on analysis
    const buyMarketId = analysis.arbitrageDirection.buyMarket;

    const [buyMarket, sellMarket] =
      buyMarketId === market1.id ? [market1, market2] : [market2, market1];

    // Calculate combined confidence
    const liquidityConfidence = Math.min(buyMarket.liquidity, sellMarket.liquidity) >= 20000 ? 0.1 : 0;
    const combinedConfidence = Math.min(1, analysis.confidence * 0.8 + liquidityConfidence + 0.1);

    if (combinedConfidence < arbConfig.minConfidence) {
      return null;
    }

    return {
      type: 'related_market',
      subType: 'semantic',

      market1Id: buyMarket.id,
      market1Question: buyMarket.question,
      market1Price: buyMarket.currentPrices[1] || 0.5,
      market1Outcome: 1,
      market1Liquidity: buyMarket.liquidity,

      market2Id: sellMarket.id,
      market2Question: sellMarket.question,
      market2Price: sellMarket.currentPrices[1] || 0.5,
      market2Outcome: 1,
      market2Liquidity: sellMarket.liquidity,

      semanticRelationship: analysis.relationshipType,
      constraintExpression: analysis.constraint.expression,
      constraintViolation: violation,
      llmReasoning: analysis.reasoning,
      llmConfidence: analysis.confidence,

      relationshipType: this.mapToLegacyRelationship(analysis.relationshipType),
      expectedConstraint: analysis.constraint.expression,
      violation,

      spread: violation,
      profitPercent: netProfitPercent,
      confidenceScore: combinedConfidence,
      status: 'active',
      detectedAt: Date.now(),
    };
  }

  /**
   * Get recommended action for semantic opportunity
   */
  static getRecommendedAction(opp: SemanticDependencyOpportunity): {
    action1: { side: 'BUY' | 'SELL'; market: string };
    action2: { side: 'BUY' | 'SELL'; market: string };
    description: string;
  } {
    return {
      action1: { side: 'BUY', market: opp.market1Id },
      action2: { side: 'SELL', market: opp.market2Id },
      description:
        `Semantic constraint violation: ${opp.constraintExpression}. ` +
        `LLM Reasoning: ${opp.llmReasoning.substring(0, 200)}...`,
    };
  }
}
