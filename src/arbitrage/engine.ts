/**
 * Arbitrage Engine
 * Main orchestrator for arbitrage detection
 */

import {
  ArbitrageOpportunity,
  AggregatedDetectionResult,
  MarketData,
  TrackedOpportunity,
} from './types';
import {
  MultiOutcomeDetector,
  NegRiskDetector,
  CrossMarketDetector,
  RelatedMarketDetector,
  SemanticDependencyDetector,
} from './detectors';
import { arbConfig } from '../config';
import { arbitrageRepo } from '../database/arbitrageRepository';

export class ArbitrageEngine {
  private multiOutcomeDetector: MultiOutcomeDetector;
  private negRiskDetector: NegRiskDetector;
  private crossMarketDetector: CrossMarketDetector;
  private relatedMarketDetector: RelatedMarketDetector;
  private semanticDependencyDetector: SemanticDependencyDetector;

  // Track opportunities to avoid duplicate alerts
  private trackedOpportunities: Map<string, TrackedOpportunity> = new Map();

  // Opportunity expiry time (5 minutes)
  private readonly OPPORTUNITY_EXPIRY_MS = 5 * 60 * 1000;

  constructor() {
    this.multiOutcomeDetector = new MultiOutcomeDetector();
    this.negRiskDetector = new NegRiskDetector();
    this.crossMarketDetector = new CrossMarketDetector();
    this.relatedMarketDetector = new RelatedMarketDetector();
    this.semanticDependencyDetector = new SemanticDependencyDetector();
  }

  /**
   * Run all enabled detectors and aggregate results
   */
  async detect(markets: MarketData[]): Promise<AggregatedDetectionResult> {
    const startTime = Date.now();
    const allOpportunities: ArbitrageOpportunity[] = [];

    // Run enabled detectors in parallel
    const detectionPromises: Promise<ArbitrageOpportunity[]>[] = [];

    if (arbConfig.enabledTypes.multiOutcome) {
      detectionPromises.push(
        this.multiOutcomeDetector.detect(markets).catch(err => {
          console.error('Multi-outcome detector error:', err);
          return [];
        })
      );
    }

    // NegRisk detector (multi-outcome markets with 3+ conditions)
    if (arbConfig.enabledTypes.negRisk) {
      detectionPromises.push(
        this.negRiskDetector.detect(markets).catch(err => {
          console.error('NegRisk detector error:', err);
          return [];
        })
      );
    }

    if (arbConfig.enabledTypes.crossMarket) {
      detectionPromises.push(
        this.crossMarketDetector.detect(markets).catch(err => {
          console.error('Cross-market detector error:', err);
          return [];
        })
      );
    }

    if (arbConfig.enabledTypes.relatedMarket) {
      detectionPromises.push(
        this.relatedMarketDetector.detect(markets).catch(err => {
          console.error('Related-market detector error:', err);
          return [];
        })
      );
    }

    // Semantic dependency detector (LLM-powered)
    if (arbConfig.enabledTypes.semanticDependency) {
      detectionPromises.push(
        this.semanticDependencyDetector.detect(markets).catch(err => {
          console.error('Semantic dependency detector error:', err);
          return [];
        })
      );
    }

    const results = await Promise.all(detectionPromises);

    // Flatten results
    for (const opportunities of results) {
      allOpportunities.push(...opportunities);
    }

    // Filter and dedupe
    const filteredOpportunities = this.filterAndDedupe(allOpportunities);

    // Update tracking
    this.updateTracking(filteredOpportunities);

    // Count by type
    const byType = {
      multiOutcome: filteredOpportunities.filter(o => o.type === 'multi_outcome').length,
      crossMarket: filteredOpportunities.filter(o => o.type === 'cross_market').length,
      relatedMarket: filteredOpportunities.filter(o => o.type === 'related_market').length,
    };

    return {
      timestamp: Date.now(),
      totalOpportunities: filteredOpportunities.length,
      byType,
      opportunities: filteredOpportunities,
      detectionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Get new opportunities (not seen before or significantly changed)
   */
  getNewOpportunities(result: AggregatedDetectionResult): ArbitrageOpportunity[] {
    const newOpps: ArbitrageOpportunity[] = [];

    for (const opp of result.opportunities) {
      const key = this.getOpportunityKey(opp);
      const tracked = this.trackedOpportunities.get(key);

      if (!tracked) {
        // New opportunity
        newOpps.push(opp);
      } else if (tracked.seenCount === 1) {
        // First time seeing it confirmed (seen twice now)
        newOpps.push(opp);
      } else if (Math.abs(opp.profitPercent - tracked.opportunity.profitPercent) > 0.5) {
        // Significant change in profit
        newOpps.push(opp);
      }
    }

    return newOpps;
  }

  /**
   * Save opportunities to database
   */
  async saveOpportunities(opportunities: ArbitrageOpportunity[]): Promise<void> {
    for (const opp of opportunities) {
      try {
        await arbitrageRepo.saveOpportunity(opp);
      } catch (err) {
        console.error('Failed to save opportunity:', err);
      }
    }
  }

  /**
   * Expire old opportunities
   */
  async expireOldOpportunities(): Promise<void> {
    const now = Date.now();
    const expired: string[] = [];

    for (const [key, tracked] of this.trackedOpportunities) {
      if (now - tracked.lastSeenAt > this.OPPORTUNITY_EXPIRY_MS) {
        expired.push(key);
      }
    }

    for (const key of expired) {
      const tracked = this.trackedOpportunities.get(key);
      if (tracked?.opportunity.id) {
        try {
          await arbitrageRepo.updateOpportunityStatus(tracked.opportunity.id, 'expired');
        } catch (err) {
          console.error('Failed to expire opportunity:', err);
        }
      }
      this.trackedOpportunities.delete(key);
    }

    if (expired.length > 0) {
      console.log(`Expired ${expired.length} opportunities`);
    }
  }

  /**
   * Get currently tracked opportunities
   */
  getTrackedOpportunities(): TrackedOpportunity[] {
    return Array.from(this.trackedOpportunities.values());
  }

  /**
   * Get stats summary
   */
  getStats(): {
    tracked: number;
    byType: { multiOutcome: number; crossMarket: number; relatedMarket: number };
    avgProfitPercent: number;
  } {
    const tracked = Array.from(this.trackedOpportunities.values());

    const byType = {
      multiOutcome: tracked.filter(t => t.opportunity.type === 'multi_outcome').length,
      crossMarket: tracked.filter(t => t.opportunity.type === 'cross_market').length,
      relatedMarket: tracked.filter(t => t.opportunity.type === 'related_market').length,
    };

    const avgProfitPercent = tracked.length > 0
      ? tracked.reduce((sum, t) => sum + t.opportunity.profitPercent, 0) / tracked.length
      : 0;

    return {
      tracked: tracked.length,
      byType,
      avgProfitPercent,
    };
  }

  private filterAndDedupe(opportunities: ArbitrageOpportunity[]): ArbitrageOpportunity[] {
    const seen = new Set<string>();
    const filtered: ArbitrageOpportunity[] = [];

    // Sort by profit first
    const sorted = opportunities.sort((a, b) => b.profitPercent - a.profitPercent);

    for (const opp of sorted) {
      const key = this.getOpportunityKey(opp);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      filtered.push(opp);
    }

    return filtered;
  }

  private updateTracking(opportunities: ArbitrageOpportunity[]): void {
    const now = Date.now();
    const seenKeys = new Set<string>();

    for (const opp of opportunities) {
      const key = this.getOpportunityKey(opp);
      seenKeys.add(key);

      const existing = this.trackedOpportunities.get(key);

      if (existing) {
        existing.lastSeenAt = now;
        existing.seenCount++;
        existing.opportunity = opp;
        existing.priceHistory.push({ timestamp: now, spread: opp.spread });

        // Keep only last 10 price points
        if (existing.priceHistory.length > 10) {
          existing.priceHistory.shift();
        }
      } else {
        this.trackedOpportunities.set(key, {
          opportunity: opp,
          firstSeenAt: now,
          lastSeenAt: now,
          seenCount: 1,
          priceHistory: [{ timestamp: now, spread: opp.spread }],
          executed: false,
        });
      }
    }
  }

  private getOpportunityKey(opp: ArbitrageOpportunity): string {
    if (opp.type === 'multi_outcome') {
      return `mo_${opp.market1Id}`;
    } else {
      const m2Id = (opp as any).market2Id || '';
      return `${opp.type}_${opp.market1Id}_${m2Id}`;
    }
  }
}

export const arbitrageEngine = new ArbitrageEngine();
