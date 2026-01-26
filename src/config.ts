import * as dotenv from 'dotenv';
import { Config } from './types';
import { ExecutionMode } from './execution/types';

dotenv.config();

export function loadConfig(): Config {
  const requiredEnvVars = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  return {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN!,
    telegramChatId: process.env.TELEGRAM_CHAT_ID!,
    polymarketApiUrl: process.env.POLYMARKET_API_URL || 'https://clob.polymarket.com',
    polymarketGammaApi: process.env.POLYMARKET_GAMMA_API || 'https://gamma-api.polymarket.com',
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '10000'),
    minTradeSizeUsd: parseFloat(process.env.MIN_TRADE_SIZE_USD || '100'),
    liquidityThresholdPercent: parseFloat(process.env.LIQUIDITY_THRESHOLD_PERCENT || '10'),
    topTraderPercentile: parseFloat(process.env.TOP_TRADER_PERCENTILE || '5'),
    minTraderVolumeUsd: parseFloat(process.env.MIN_TRADER_VOLUME_USD || '1000'),
  };
}

export const config = loadConfig();

/**
 * Arbitrage Bot Configuration
 */
export interface ArbitrageConfig {
  executionMode: ExecutionMode;
  minProfitThreshold: number;
  minConfidence: number;
  detectionIntervalMs: number;

  simulation: {
    startingBalance: number;
    baseSlippageBps: number;
    liquidityImpactFactor: number;
  };

  live: {
    privateKey?: string;
    chainId: number;
    maxSlippageBps: number;
  };

  risk: {
    maxPositionSizeUsd: number;
    maxTotalExposureUsd: number;
    maxDailyLossUsd: number;
    minLiquidityUsd: number;
    tradeCooldownMs: number;
  };

  matching: {
    minSimilarityScore: number;
  };

  enabledTypes: {
    multiOutcome: boolean;
    negRisk: boolean;
    crossMarket: boolean;
    relatedMarket: boolean;
    semanticDependency: boolean;
  };

  llm: {
    provider: 'openai' | 'deepseek' | 'ollama';
    apiKey?: string;
    baseUrl: string;
    model: string;
    maxTokens: number;
    temperature: number;
    rateLimitPerMinute: number;
    cacheTtlMs: number;
    maxCacheSize: number;
    enabled: boolean;
    minConfidenceThreshold: number;
  };

  telegram: {
    enabled: boolean;
    botToken: string;
    chatId: string;
  };
}

export function loadArbitrageConfig(): ArbitrageConfig {
  return {
    executionMode: (process.env.ARB_EXECUTION_MODE as ExecutionMode) || 'simulation',
    minProfitThreshold: parseFloat(process.env.ARB_MIN_PROFIT_THRESHOLD || '0.5'),
    minConfidence: parseFloat(process.env.ARB_MIN_CONFIDENCE || '0.7'),
    detectionIntervalMs: parseInt(process.env.ARB_DETECTION_INTERVAL_MS || '10000'),

    simulation: {
      startingBalance: parseFloat(process.env.ARB_SIM_STARTING_BALANCE || '10000'),
      baseSlippageBps: parseInt(process.env.ARB_SIM_BASE_SLIPPAGE_BPS || '10'),
      liquidityImpactFactor: parseFloat(process.env.ARB_SIM_LIQUIDITY_IMPACT || '0.5'),
    },

    live: {
      privateKey: process.env.ARB_PRIVATE_KEY,
      chainId: parseInt(process.env.ARB_CHAIN_ID || '137'),
      maxSlippageBps: parseInt(process.env.ARB_MAX_SLIPPAGE_BPS || '50'),
    },

    risk: {
      maxPositionSizeUsd: parseFloat(process.env.ARB_MAX_POSITION_SIZE_USD || '1000'),
      maxTotalExposureUsd: parseFloat(process.env.ARB_MAX_TOTAL_EXPOSURE_USD || '5000'),
      maxDailyLossUsd: parseFloat(process.env.ARB_MAX_DAILY_LOSS_USD || '500'),
      minLiquidityUsd: parseFloat(process.env.ARB_MIN_LIQUIDITY_USD || '5000'),
      tradeCooldownMs: parseInt(process.env.ARB_TRADE_COOLDOWN_MS || '5000'),
    },

    matching: {
      minSimilarityScore: parseFloat(process.env.ARB_MIN_SIMILARITY_SCORE || '0.7'),
    },

    enabledTypes: {
      multiOutcome: process.env.ARB_ENABLE_MULTI_OUTCOME !== 'false',
      negRisk: process.env.ARB_ENABLE_NEGRISK !== 'false',
      crossMarket: process.env.ARB_ENABLE_CROSS_MARKET !== 'false',
      relatedMarket: process.env.ARB_ENABLE_RELATED_MARKET !== 'false',
      semanticDependency: process.env.ARB_ENABLE_SEMANTIC_DEPENDENCY === 'true',
    },

    llm: {
      provider: (process.env.LLM_PROVIDER as 'openai' | 'deepseek' | 'ollama') || 'deepseek',
      apiKey: process.env.LLM_API_KEY,
      baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1',
      model: process.env.LLM_MODEL || 'deepseek-chat',
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '1024'),
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.1'),
      rateLimitPerMinute: parseInt(process.env.LLM_RATE_LIMIT || '30'),
      cacheTtlMs: parseInt(process.env.LLM_CACHE_TTL_MS || '3600000'), // 1 hour
      maxCacheSize: parseInt(process.env.LLM_CACHE_SIZE || '10000'),
      enabled: process.env.LLM_ENABLED === 'true',
      minConfidenceThreshold: parseFloat(process.env.LLM_MIN_CONFIDENCE || '0.75'),
    },

    telegram: {
      enabled: process.env.ARB_TELEGRAM_ENABLED !== 'false',
      botToken: process.env.TELEGRAM_BOT_TOKEN || '',
      chatId: process.env.TELEGRAM_CHAT_ID || '',
    },
  };
}

export const arbConfig = loadArbitrageConfig();
