import * as dotenv from 'dotenv';
import { Config } from './types';

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
