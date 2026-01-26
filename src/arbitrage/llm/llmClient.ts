/**
 * LLM Client
 * OpenAI-compatible API client supporting DeepSeek, OpenAI, and Ollama
 */

import axios, { AxiosInstance } from 'axios';
import { arbConfig } from '../../config';
import { LLMRequestStats } from '../types';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices: {
    message: {
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class LLMClient {
  private client: AxiosInstance;
  private stats: LLMRequestStats = {
    requestsThisMinute: 0,
    lastResetTime: Date.now(),
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  constructor() {
    const config = arbConfig.llm;

    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
      },
      timeout: 30000,
    });
  }

  /**
   * Send a chat completion request
   */
  async chat(messages: ChatMessage[]): Promise<string> {
    await this.waitForRateLimit();

    const config = arbConfig.llm;

    try {
      const response = await this.client.post<ChatCompletionResponse>(
        '/chat/completions',
        {
          model: config.model,
          messages,
          max_tokens: config.maxTokens,
          temperature: config.temperature,
        }
      );

      this.stats.totalRequests++;
      this.stats.requestsThisMinute++;

      return response.data.choices[0]?.message?.content || '';
    } catch (error: any) {
      console.error('LLM API error:', error.message);
      throw error;
    }
  }

  /**
   * Rate limiting - wait if we've hit the limit
   */
  private async waitForRateLimit(): Promise<void> {
    const config = arbConfig.llm;
    const now = Date.now();

    // Reset counter every minute
    if (now - this.stats.lastResetTime >= 60000) {
      this.stats.requestsThisMinute = 0;
      this.stats.lastResetTime = now;
    }

    // Wait if at limit
    if (this.stats.requestsThisMinute >= config.rateLimitPerMinute) {
      const waitTime = 60000 - (now - this.stats.lastResetTime);
      console.log(`LLM rate limit reached, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.stats.requestsThisMinute = 0;
      this.stats.lastResetTime = Date.now();
    }
  }

  /**
   * Get request statistics
   */
  getStats(): LLMRequestStats {
    return { ...this.stats };
  }

  /**
   * Increment cache hit counter
   */
  incrementCacheHit(): void {
    this.stats.cacheHits++;
  }

  /**
   * Increment cache miss counter
   */
  incrementCacheMiss(): void {
    this.stats.cacheMisses++;
  }

  /**
   * Check if LLM is enabled and configured
   */
  isEnabled(): boolean {
    return arbConfig.llm.enabled && !!arbConfig.llm.apiKey;
  }
}

// Export singleton instance
export const llmClient = new LLMClient();
