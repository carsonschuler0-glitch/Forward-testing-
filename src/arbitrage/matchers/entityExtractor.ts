/**
 * Entity Extractor
 * Extracts names, dates, numbers, and keywords from market questions
 */

import { ExtractedEntities } from '../types';

// Common stop words to filter out
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'this', 'that', 'these',
  'those', 'it', 'its', 'they', 'their', 'there', 'here', 'what', 'which',
  'who', 'whom', 'when', 'where', 'why', 'how', 'if', 'then', 'else',
  'than', 'so', 'no', 'not', 'only', 'own', 'same', 'too', 'very',
]);

// Keywords related to prediction markets
const MARKET_KEYWORDS = new Set([
  'win', 'wins', 'won', 'lose', 'loses', 'lost', 'defeat', 'beats', 'beat',
  'elected', 'election', 'vote', 'votes', 'voting', 'nominee', 'nomination',
  'primary', 'general', 'president', 'presidential', 'governor', 'senate',
  'congress', 'house', 'democratic', 'republican', 'democrat', 'gop',
  'championship', 'champion', 'playoffs', 'finals', 'super', 'bowl',
  'world', 'series', 'cup', 'title', 'mvp', 'award', 'winner',
  'above', 'below', 'over', 'under', 'more', 'less', 'higher', 'lower',
  'reach', 'reaches', 'hit', 'hits', 'exceed', 'exceeds', 'pass', 'passes',
  'before', 'after', 'by', 'until', 'during',
  'yes', 'no', 'true', 'false',
  'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'price',
]);

export class EntityExtractor {
  /**
   * Extract all entities from a market question
   */
  extract(question: string): ExtractedEntities {
    return {
      names: this.extractNames(question),
      dates: this.extractDates(question),
      numbers: this.extractNumbers(question),
      keywords: this.extractKeywords(question),
    };
  }

  /**
   * Extract proper names (capitalized words/phrases)
   */
  private extractNames(text: string): string[] {
    const names: string[] = [];

    // Match capitalized words that might be names
    // Handles multi-word names like "Donald Trump" or "Super Bowl"
    const namePattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
    const matches = text.match(namePattern) || [];

    for (const match of matches) {
      const normalized = match.toLowerCase();
      // Filter out common words that happen to be capitalized at sentence start
      if (!STOP_WORDS.has(normalized) && !MARKET_KEYWORDS.has(normalized)) {
        names.push(normalized);
      }
    }

    // Also extract all-caps abbreviations (NFL, NBA, GOP, etc.)
    const abbrPattern = /\b[A-Z]{2,5}\b/g;
    const abbrMatches = text.match(abbrPattern) || [];
    for (const match of abbrMatches) {
      names.push(match.toLowerCase());
    }

    return [...new Set(names)]; // Dedupe
  }

  /**
   * Extract dates and time references
   */
  private extractDates(text: string): string[] {
    const dates: string[] = [];

    // Full dates: January 1, 2024 or Jan 1 2024 or 1/1/2024
    const fullDatePattern = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b/gi;
    const fullMatches = text.match(fullDatePattern) || [];
    dates.push(...fullMatches.map(d => d.toLowerCase()));

    // Years: 2024, 2025, etc.
    const yearPattern = /\b20\d{2}\b/g;
    const yearMatches = text.match(yearPattern) || [];
    dates.push(...yearMatches);

    // Numeric dates: 1/1/2024, 2024-01-01
    const numericDatePattern = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g;
    const numericMatches = text.match(numericDatePattern) || [];
    dates.push(...numericMatches);

    // Quarters: Q1, Q2, Q3, Q4
    const quarterPattern = /\bQ[1-4]\s*\d{4}\b/gi;
    const quarterMatches = text.match(quarterPattern) || [];
    dates.push(...quarterMatches.map(q => q.toLowerCase()));

    // End of [month/year]
    const endOfPattern = /\bend\s+of\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{4})\b/gi;
    const endOfMatches = text.match(endOfPattern) || [];
    dates.push(...endOfMatches.map(d => d.toLowerCase()));

    return [...new Set(dates)];
  }

  /**
   * Extract numbers and percentages
   */
  private extractNumbers(text: string): string[] {
    const numbers: string[] = [];

    // Numbers with optional decimals and units
    // e.g., 100, 100.5, $100, 100%, 100k, 100M
    const numberPattern = /\$?\d+(?:,\d{3})*(?:\.\d+)?(?:%|k|m|b|K|M|B)?\b/gi;
    const matches = text.match(numberPattern) || [];

    for (const match of matches) {
      // Normalize: remove $ and commas, lowercase units
      const normalized = match.replace(/[$,]/g, '').toLowerCase();
      numbers.push(normalized);
    }

    return [...new Set(numbers)];
  }

  /**
   * Extract market-relevant keywords
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);

    const keywords: string[] = [];

    for (const word of words) {
      if (MARKET_KEYWORDS.has(word)) {
        keywords.push(word);
      }
    }

    return [...new Set(keywords)];
  }

  /**
   * Normalize a question for comparison
   */
  normalizeQuestion(question: string): string {
    return question
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

export const entityExtractor = new EntityExtractor();
