/**
 * Arbitrage Bot Types
 * Types for arbitrage detection, tracking, and execution
 */

export type ArbitrageType = 'multi_outcome' | 'cross_market' | 'related_market';
export type OpportunityStatus = 'active' | 'executed' | 'expired' | 'invalid';
export type RelationshipType = 'same_event' | 'inverse' | 'subset' | 'superset' | 'mutex';
export type NegRiskDirection = 'long_rebalancing' | 'short_rebalancing';
export type SemanticRelationshipType =
  | 'subset'
  | 'superset'
  | 'mutual_exclusion'
  | 'logical_bound'
  | 'nested_target'
  | 'temporal'
  | 'none';

/**
 * Base interface for all arbitrage opportunities
 */
export interface BaseOpportunity {
  id?: number;
  type: ArbitrageType;
  market1Id: string;
  market1Question: string;
  market1Price: number;
  market1Outcome: number;
  market1Liquidity: number;
  spread: number;
  profitPercent: number;
  confidenceScore: number;
  status: OpportunityStatus;
  detectedAt: number;
  expiresAt?: number;
}

/**
 * Multi-outcome spread opportunity (YES + NO != $1.00)
 */
export interface MultiOutcomeOpportunity extends BaseOpportunity {
  type: 'multi_outcome';
  yesPrice: number;
  noPrice: number;
  priceSum: number;
  direction: 'overpriced' | 'underpriced';
}

/**
 * Cross-market opportunity (same event, different prices)
 */
export interface CrossMarketOpportunity extends BaseOpportunity {
  type: 'cross_market';
  market2Id: string;
  market2Question: string;
  market2Price: number;
  market2Outcome: number;
  market2Liquidity: number;
  matchType: 'exact' | 'inverse';
  similarityScore: number;
}

/**
 * Related market opportunity (logical inconsistency)
 */
export interface RelatedMarketOpportunity extends BaseOpportunity {
  type: 'related_market';
  market2Id: string;
  market2Question: string;
  market2Price: number;
  market2Outcome: number;
  market2Liquidity: number;
  relationshipType: RelationshipType;
  expectedConstraint: string;
  violation: number;
}

/**
 * NegRisk condition within a multi-outcome event
 */
export interface NegRiskCondition {
  conditionId: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  liquidity: number;
  tokenId?: string;
}

/**
 * NegRisk (multi-outcome) opportunity
 * Markets with 3+ mutually exclusive outcomes where sum of YES prices should = $1
 */
export interface NegRiskOpportunity extends BaseOpportunity {
  type: 'multi_outcome';
  subType: 'negrisk';
  eventId: string;
  eventTitle: string;
  conditions: NegRiskCondition[];
  totalYesPriceSum: number;
  direction: NegRiskDirection;
  minConditionLiquidity: number;
  yesPrice: number;
  noPrice: number;
  priceSum: number;
}

/**
 * Semantic dependency opportunity (LLM-detected logical relationships)
 */
export interface SemanticDependencyOpportunity extends BaseOpportunity {
  type: 'related_market';
  subType: 'semantic';
  market2Id: string;
  market2Question: string;
  market2Price: number;
  market2Outcome: number;
  market2Liquidity: number;
  semanticRelationship: SemanticRelationshipType;
  constraintExpression: string;
  constraintViolation: number;
  llmReasoning: string;
  llmConfidence: number;
  relationshipType: RelationshipType;
  expectedConstraint: string;
  violation: number;
}

/**
 * LLM analysis result for semantic relationships
 */
export interface SemanticAnalysisResult {
  market1Id: string;
  market2Id: string;
  relationshipType: SemanticRelationshipType;
  confidence: number;
  reasoning: string;
  constraint: {
    type: 'probability_bound' | 'sum_bound' | 'exclusive';
    expression: string;
    expectedRelation: 'gte' | 'lte' | 'eq' | 'exclusive';
  } | null;
  arbitrageDirection?: {
    buyMarket: string;
    sellMarket: string;
  };
  cachedAt?: number;
}

export type ArbitrageOpportunity =
  | MultiOutcomeOpportunity
  | CrossMarketOpportunity
  | RelatedMarketOpportunity
  | NegRiskOpportunity
  | SemanticDependencyOpportunity;

/**
 * Market relationship for cross/related market detection
 */
export interface MarketRelationship {
  id?: number;
  market1Id: string;
  market2Id: string;
  relationshipType: RelationshipType;
  similarityScore: number;
  confidence: number;
  detectedAt: number;
  isValid: boolean;
  notes?: string;
}

/**
 * Market match result from similarity matching
 */
export interface MarketMatch {
  market1Id: string;
  market1Question: string;
  market2Id: string;
  market2Question: string;
  similarityScore: number;
  matchType: 'exact' | 'inverse' | 'related';
  sharedEntities: string[];
}

/**
 * Detection result from a single detector run
 */
export interface DetectionResult {
  detectorType: ArbitrageType;
  opportunities: ArbitrageOpportunity[];
  marketsScanned: number;
  detectionTimeMs: number;
  errors?: string[];
}

/**
 * Combined detection results from all detectors
 */
export interface AggregatedDetectionResult {
  timestamp: number;
  totalOpportunities: number;
  byType: {
    multiOutcome: number;
    crossMarket: number;
    relatedMarket: number;
  };
  opportunities: ArbitrageOpportunity[];
  detectionTimeMs: number;
}

/**
 * Price snapshot for arbitrage tracking
 */
export interface ArbitragePriceSnapshot {
  marketId: string;
  timestamp: number;
  yesPrice: number;
  noPrice: number;
  yesBid?: number;
  yesAsk?: number;
  noBid?: number;
  noAsk?: number;
  spread: number;
  liquidity: number;
}

/**
 * Opportunity tracking state
 */
export interface TrackedOpportunity {
  opportunity: ArbitrageOpportunity;
  firstSeenAt: number;
  lastSeenAt: number;
  seenCount: number;
  priceHistory: { timestamp: number; spread: number }[];
  executed: boolean;
  executionId?: number;
}

/**
 * Detector interface
 */
export interface ArbitrageDetector {
  type: ArbitrageType;
  detect(markets: MarketData[]): Promise<ArbitrageOpportunity[]>;
}

/**
 * Market data for detection
 */
export interface MarketData {
  id: string;
  question: string;
  outcomes: string[];
  currentPrices: number[];
  liquidity: number;
  volume: number;
  category: string;
  createdAt: number;
  endDate: number | null;
  // NegRisk metadata (optional)
  negRisk?: boolean;
  negRiskMarketId?: string;
  eventSlug?: string;
  conditionId?: string;
}

/**
 * Entity extracted from market questions
 */
export interface ExtractedEntities {
  names: string[];
  dates: string[];
  numbers: string[];
  keywords: string[];
}

/**
 * LLM request tracking for rate limiting
 */
export interface LLMRequestStats {
  requestsThisMinute: number;
  lastResetTime: number;
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
}
