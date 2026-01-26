/**
 * Semantic Analysis Cache
 * LRU cache for LLM analysis results to avoid repeated API calls
 */

import { SemanticAnalysisResult } from '../types';
import { arbConfig } from '../../config';

interface CacheEntry {
  result: SemanticAnalysisResult;
  cachedAt: number;
  accessCount: number;
  lastAccess: number;
}

export class SemanticCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private ttlMs: number;

  constructor() {
    this.maxSize = arbConfig.llm.maxCacheSize;
    this.ttlMs = arbConfig.llm.cacheTtlMs;
  }

  /**
   * Generate cache key from market pair
   * Keys are normalized so order doesn't matter
   */
  private generateKey(market1Id: string, market2Id: string): string {
    const [first, second] = [market1Id, market2Id].sort();
    return `${first}:${second}`;
  }

  /**
   * Get cached analysis result
   */
  get(market1Id: string, market2Id: string): SemanticAnalysisResult | null {
    const key = this.generateKey(market1Id, market2Id);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check expiry
    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // Update access stats for LRU
    entry.accessCount++;
    entry.lastAccess = Date.now();

    return entry.result;
  }

  /**
   * Store analysis result in cache
   */
  set(result: SemanticAnalysisResult): void {
    const key = this.generateKey(result.market1Id, result.market2Id);

    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      result: { ...result, cachedAt: Date.now() },
      cachedAt: Date.now(),
      accessCount: 1,
      lastAccess: Date.now(),
    });
  }

  /**
   * Check if a market pair is cached
   */
  has(market1Id: string, market2Id: string): boolean {
    const key = this.generateKey(market1Id, market2Id);
    const entry = this.cache.get(key);

    if (!entry) return false;

    // Check expiry
    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Evict least recently used entries
   */
  private evictLRU(): void {
    const entries = Array.from(this.cache.entries());

    // Sort by last access time (oldest first)
    entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    // Evict oldest 10%
    const toEvict = Math.max(1, Math.floor(entries.length * 0.1));
    for (let i = 0; i < toEvict; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * Clear expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.cachedAt > this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }
}

// Export singleton instance
export const semanticCache = new SemanticCache();
