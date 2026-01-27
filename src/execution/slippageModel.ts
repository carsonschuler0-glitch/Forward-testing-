/**
 * Slippage Model
 * Estimates execution slippage based on order size and market liquidity
 */

import { SlippageEstimate } from './types';
import { arbConfig } from '../config';

export class SlippageModel {
  /**
   * Estimate slippage for a given order
   */
  estimate(
    orderSizeUsd: number,
    marketLiquidity: number,
    isBuy: boolean,
    currentPrice: number
  ): SlippageEstimate {
    // Base slippage from config (in basis points)
    const baseSlippageBps = arbConfig.simulation.baseSlippageBps;

    // Liquidity impact: larger orders relative to liquidity have more slippage
    const liquidityRatio = orderSizeUsd / marketLiquidity;
    const liquidityImpactBps = liquidityRatio * arbConfig.simulation.liquidityImpactFactor * 10000;

    // Price impact: orders near 0 or 1 have higher slippage
    const priceImpactBps = this.calculatePriceImpact(currentPrice, isBuy);

    // Total estimated slippage in basis points
    const totalSlippageBps = baseSlippageBps + liquidityImpactBps + priceImpactBps;

    // Calculate estimated execution price
    const slippageMultiplier = totalSlippageBps / 10000;
    const estimatedExecutionPrice = isBuy
      ? currentPrice * (1 + slippageMultiplier)
      : currentPrice * (1 - slippageMultiplier);

    // Confidence in the estimate (lower for larger orders)
    const confidence = Math.max(0.3, 1 - liquidityRatio * 2);

    return {
      estimatedSlippageBps: totalSlippageBps,
      estimatedExecutionPrice: Math.max(0.01, Math.min(0.99, estimatedExecutionPrice)),
      confidence,
      liquidityDepth: marketLiquidity,
    };
  }

  /**
   * Estimate slippage for a two-legged arbitrage trade
   */
  estimateArbitrage(
    orderSizeUsd: number,
    leg1Liquidity: number,
    leg1Price: number,
    leg1IsBuy: boolean,
    leg2Liquidity?: number,
    leg2Price?: number,
    leg2IsBuy?: boolean
  ): {
    leg1Slippage: SlippageEstimate;
    leg2Slippage?: SlippageEstimate;
    totalSlippageBps: number;
    netExpectedProfit: number;
  } {
    const leg1Slippage = this.estimate(orderSizeUsd, leg1Liquidity, leg1IsBuy, leg1Price);

    let leg2Slippage: SlippageEstimate | undefined;
    let totalSlippageBps = leg1Slippage.estimatedSlippageBps;

    if (leg2Liquidity !== undefined && leg2Price !== undefined && leg2IsBuy !== undefined) {
      leg2Slippage = this.estimate(orderSizeUsd, leg2Liquidity, leg2IsBuy, leg2Price);
      totalSlippageBps += leg2Slippage.estimatedSlippageBps;
    }

    // Net expected profit after slippage
    const grossProfit = leg2Price !== undefined
      ? Math.abs(leg1Price - leg2Price) * orderSizeUsd
      : 0;
    const slippageCost = (totalSlippageBps / 10000) * orderSizeUsd;
    const netExpectedProfit = grossProfit - slippageCost;

    return {
      leg1Slippage,
      leg2Slippage,
      totalSlippageBps,
      netExpectedProfit,
    };
  }

  /**
   * Calculate additional price impact based on current price
   * Prices near 0 or 1 have higher slippage
   */
  private calculatePriceImpact(price: number, isBuy: boolean): number {
    // Price impact increases as we approach 0 or 1
    // Using a simple quadratic model

    if (isBuy) {
      // Buying pushes price up, more impact when price is high
      if (price > 0.9) {
        return (price - 0.9) * 100; // Up to 10 bps extra
      }
    } else {
      // Selling pushes price down, more impact when price is low
      if (price < 0.1) {
        return (0.1 - price) * 100; // Up to 10 bps extra
      }
    }

    return 0;
  }

  /**
   * Add random noise to simulate real-world execution
   */
  addNoise(estimate: SlippageEstimate): SlippageEstimate {
    // Add ±20% random noise
    const noise = (Math.random() - 0.5) * 0.4;
    const noisySlippage = estimate.estimatedSlippageBps * (1 + noise);

    const slippageMultiplier = noisySlippage / 10000;
    const originalPrice = estimate.estimatedExecutionPrice / (1 + estimate.estimatedSlippageBps / 10000);

    return {
      ...estimate,
      estimatedSlippageBps: Math.max(0, noisySlippage),
      estimatedExecutionPrice: Math.max(0.01, Math.min(0.99, originalPrice * (1 + slippageMultiplier))),
    };
  }
}

export const slippageModel = new SlippageModel();
