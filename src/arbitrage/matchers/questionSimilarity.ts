/**
 * Question Similarity Matcher
 * Matches market questions to find same-event and related markets
 *
 * IMPORTANT: This matcher is conservative to avoid false positives.
 * Two markets are only considered the "same event" if they have:
 * 1. The same subject (who/what is doing the action)
 * 2. Very high overall similarity
 *
 * Markets like "Team A wins championship" vs "Team B wins championship"
 * are NOT the same event - they are mutually exclusive alternatives.
 */

import { MarketMatch, MarketData, ExtractedEntities } from '../types';
import { entityExtractor } from './entityExtractor';
import { arbConfig } from '../../config';

// Negation patterns for detecting inverse markets
const NEGATION_PAIRS = [
  ['will', 'will not'],
  ['win', 'lose'],
  ['wins', 'loses'],
  ['yes', 'no'],
  ['above', 'below'],
  ['over', 'under'],
  ['more than', 'less than'],
  ['higher', 'lower'],
  ['before', 'after'],
  ['pass', 'fail'],
  ['passes', 'fails'],
  ['reach', 'not reach'],
  ['elected', 'not elected'],
];

// Patterns that indicate "who wins X" type questions
// These need the SAME subject to be the same event
const COMPETITION_PATTERNS = [
  /will\s+(?:the\s+)?(.+?)\s+win/i,
  /(.+?)\s+(?:to\s+)?win/i,
  /(.+?)\s+wins/i,
  /will\s+(?:the\s+)?(.+?)\s+be\s+elected/i,
  /(.+?)\s+(?:to\s+)?become/i,
  /will\s+(?:the\s+)?(.+?)\s+beat/i,
  /will\s+(?:the\s+)?(.+?)\s+defeat/i,
];

export class QuestionSimilarityMatcher {
  private entityCache: Map<string, ExtractedEntities> = new Map();
  private subjectCache: Map<string, string | null> = new Map();

  /**
   * Find all matching market pairs from a list of markets
   */
  findMatches(markets: MarketData[]): MarketMatch[] {
    const matches: MarketMatch[] = [];

    // Pre-extract entities and subjects for all markets
    for (const market of markets) {
      if (!this.entityCache.has(market.id)) {
        this.entityCache.set(market.id, entityExtractor.extract(market.question));
      }
      if (!this.subjectCache.has(market.id)) {
        this.subjectCache.set(market.id, this.extractSubject(market.question));
      }
    }

    // Compare all pairs
    for (let i = 0; i < markets.length; i++) {
      for (let j = i + 1; j < markets.length; j++) {
        const match = this.compareMarkets(markets[i], markets[j]);
        if (match && match.similarityScore >= arbConfig.matching.minSimilarityScore) {
          matches.push(match);
        }
      }
    }

    // Sort by similarity score
    return matches.sort((a, b) => b.similarityScore - a.similarityScore);
  }

  /**
   * Extract the subject of a question (who/what is doing the action)
   * e.g., "Will the Golden Knights win..." -> "golden knights"
   */
  private extractSubject(question: string): string | null {
    for (const pattern of COMPETITION_PATTERNS) {
      const match = question.match(pattern);
      if (match && match[1]) {
        return match[1].toLowerCase().trim();
      }
    }
    return null;
  }

  /**
   * Compare two markets and determine their relationship
   */
  compareMarkets(market1: MarketData, market2: MarketData): MarketMatch | null {
    const entities1 = this.entityCache.get(market1.id) || entityExtractor.extract(market1.question);
    const entities2 = this.entityCache.get(market2.id) || entityExtractor.extract(market2.question);

    // CRITICAL: Check if these are competing alternatives (different subjects)
    const subject1 = this.subjectCache.get(market1.id) ?? this.extractSubject(market1.question);
    const subject2 = this.subjectCache.get(market2.id) ?? this.extractSubject(market2.question);

    // If both have subjects and they're different, these are NOT the same event
    // e.g., "Knights win" vs "Panthers win" - different subjects = mutually exclusive
    if (subject1 && subject2 && subject1 !== subject2) {
      // Check if subjects share any significant words (allow for minor variations)
      const subjectWords1 = new Set(subject1.split(/\s+/).filter(w => w.length > 2));
      const subjectWords2 = new Set(subject2.split(/\s+/).filter(w => w.length > 2));
      const subjectOverlap = this.jaccardSimilarity(subjectWords1, subjectWords2);

      // If subjects are clearly different (< 50% word overlap), reject
      if (subjectOverlap < 0.5) {
        return null;
      }
    }

    // Calculate entity overlap
    const nameOverlap = this.jaccardSimilarity(
      new Set(entities1.names),
      new Set(entities2.names)
    );

    const dateOverlap = this.jaccardSimilarity(
      new Set(entities1.dates),
      new Set(entities2.dates)
    );

    const numberOverlap = this.jaccardSimilarity(
      new Set(entities1.numbers),
      new Set(entities2.numbers)
    );

    const keywordOverlap = this.jaccardSimilarity(
      new Set(entities1.keywords),
      new Set(entities2.keywords)
    );

    // Calculate word-level similarity
    const words1 = new Set(entityExtractor.normalizeQuestion(market1.question).split(' '));
    const words2 = new Set(entityExtractor.normalizeQuestion(market2.question).split(' '));
    const wordOverlap = this.jaccardSimilarity(words1, words2);

    // STRICTER scoring: Names must match significantly for same-event
    // If names don't overlap at all, these are likely different events
    if (nameOverlap < 0.3) {
      return null;
    }

    // Weighted similarity score - increased weight on name matching
    const similarityScore =
      nameOverlap * 0.45 +      // Increased from 0.35
      dateOverlap * 0.15 +     // Decreased from 0.2
      numberOverlap * 0.1 +
      keywordOverlap * 0.1 +   // Decreased from 0.15
      wordOverlap * 0.2;

    // Higher threshold for minimum similarity
    if (similarityScore < 0.5) {
      return null;
    }

    // Determine match type
    const isInverse = this.detectInverseRelationship(market1.question, market2.question);

    // Find shared entities for context
    const sharedNames = entities1.names.filter(n => entities2.names.includes(n));
    const sharedDates = entities1.dates.filter(d => entities2.dates.includes(d));
    const sharedEntities = [...sharedNames, ...sharedDates];

    // STRICT: Must share at least one significant name entity
    if (sharedNames.length === 0) {
      return null;
    }

    return {
      market1Id: market1.id,
      market1Question: market1.question,
      market2Id: market2.id,
      market2Question: market2.question,
      similarityScore,
      matchType: isInverse ? 'inverse' : 'exact',
      sharedEntities,
    };
  }

  /**
   * Detect if two questions are inverses of each other
   * (e.g., "Will X win?" vs "Will X lose?")
   */
  private detectInverseRelationship(q1: string, q2: string): boolean {
    const lower1 = q1.toLowerCase();
    const lower2 = q2.toLowerCase();

    for (const [pos, neg] of NEGATION_PAIRS) {
      // Check if one has positive and other has negative
      const has1Pos = lower1.includes(pos) && !lower1.includes(neg);
      const has1Neg = lower1.includes(neg);
      const has2Pos = lower2.includes(pos) && !lower2.includes(neg);
      const has2Neg = lower2.includes(neg);

      if ((has1Pos && has2Neg) || (has1Neg && has2Pos)) {
        return true;
      }
    }

    // Check for "not" negation
    const notPattern1 = /\bnot\s+\w+/gi;
    const notPattern2 = /\bnot\s+\w+/gi;
    const nots1 = lower1.match(notPattern1) || [];
    const nots2 = lower2.match(notPattern2) || [];

    // If one has "not X" and other doesn't have "not" before same word
    for (const notPhrase of nots1) {
      const word = notPhrase.replace('not ', '');
      if (lower2.includes(word) && !nots2.some(n => n.includes(word))) {
        return true;
      }
    }
    for (const notPhrase of nots2) {
      const word = notPhrase.replace('not ', '');
      if (lower1.includes(word) && !nots1.some(n => n.includes(word))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate Jaccard similarity between two sets
   */
  private jaccardSimilarity<T>(set1: Set<T>, set2: Set<T>): number {
    if (set1.size === 0 && set2.size === 0) {
      return 0;
    }

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Clear the entity cache
   */
  clearCache(): void {
    this.entityCache.clear();
  }
}

export const questionSimilarityMatcher = new QuestionSimilarityMatcher();
