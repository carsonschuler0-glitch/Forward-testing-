import { BacktestDataFetcher } from './dataFetcher';
import { BacktestAnalyzer } from './analyzer';
import { BacktestResult, HistoricalTrade } from './types';

export class BacktestRunner {
  private dataFetcher: BacktestDataFetcher;
  private analyzer: BacktestAnalyzer;

  constructor() {
    this.dataFetcher = new BacktestDataFetcher();
    this.analyzer = new BacktestAnalyzer();
  }

  /**
   * Run a complete backtest
   */
  async run(options: {
    minLiquidity?: number;
    maxLiquidity?: number;
    marketLimit?: number;
  } = {}): Promise<BacktestResult> {
    const {
      minLiquidity = 100,
      maxLiquidity = 50000,
      marketLimit = 100,
    } = options;

    console.log('\n🔍 Starting Polymarket Backtest...\n');
    console.log(`Fetching resolved markets with liquidity between $${minLiquidity} and $${maxLiquidity}...`);

    // Step 1: Fetch resolved markets
    const markets = await this.dataFetcher.fetchResolvedMarkets(
      minLiquidity,
      maxLiquidity,
      marketLimit
    );

    if (markets.length === 0) {
      console.log('❌ No markets found matching criteria');
      return this.createEmptyResult();
    }

    console.log(`✅ Found ${markets.length} resolved markets\n`);

    // Step 2: Fetch real trades from Data API
    console.log('Fetching real trade history from Data API...');
    const allTrades: HistoricalTrade[] = [];
    const minTradeSize = 1000; // $1k minimum

    for (let i = 0; i < markets.length; i++) {
      const market = markets[i];
      if (i % 10 === 0) {
        console.log(`  Progress: ${i}/${markets.length} markets...`);
      }

      const trades = await this.dataFetcher.fetchRealTrades(market, minTradeSize);
      allTrades.push(...trades);

      // Small delay to avoid rate limiting
      if (i < markets.length - 1 && i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`✅ Found ${allTrades.length} real trades (>=$${minTradeSize})\n`);

    // Step 3: Analyze trades and mark correct/incorrect
    console.log('Analyzing trade outcomes...');
    const analyzedTrades = this.analyzer.analyzeTrades(markets, allTrades);

    const correctTrades = analyzedTrades.filter(t => t.wasCorrect === true).length;
    const incorrectTrades = analyzedTrades.filter(t => t.wasCorrect === false).length;

    console.log(`  • Correct trades: ${correctTrades}`);
    console.log(`  • Incorrect trades: ${incorrectTrades}`);
    console.log(`  • Overall accuracy: ${((correctTrades / analyzedTrades.length) * 100).toFixed(1)}%\n`);

    // Step 4: Identify patterns
    console.log('Identifying sharp money patterns...\n');
    const result = this.analyzer.identifyPatterns(analyzedTrades, markets);

    return result;
  }

  /**
   * Print a formatted report
   */
  printReport(result: BacktestResult): void {
    console.log('\n' + '='.repeat(70));
    console.log('📊 BACKTEST RESULTS');
    console.log('='.repeat(70) + '\n');

    console.log(`Markets Analyzed: ${result.totalMarkets}`);
    console.log(`Total Trades: ${result.totalTrades}`);
    console.log(`Date Range: ${new Date(result.dateRange.start).toLocaleDateString()} - ${new Date(result.dateRange.end).toLocaleDateString()}\n`);

    console.log('🎯 SHARP MONEY PATTERNS:');
    console.log('-'.repeat(70));
    console.log(`Average Liquidity: $${result.sharpMoneyPatterns.avgLiquidityOfSharpTrades.toFixed(0)}`);
    console.log(`Average Timing: ${result.sharpMoneyPatterns.avgTimingBeforeResolution.toFixed(1)} days before resolution`);
    console.log('Characteristics:');
    result.sharpMoneyPatterns.commonCharacteristics.forEach(c => console.log(`  • ${c}`));

    console.log('\n💸 DUMB MONEY PATTERNS:');
    console.log('-'.repeat(70));
    console.log(`Average Liquidity: $${result.dumbMoneyPatterns.avgLiquidityOfDumbTrades.toFixed(0)}`);
    console.log(`Average Timing: ${result.dumbMoneyPatterns.avgTimingBeforeResolution.toFixed(1)} days before resolution`);
    console.log('Characteristics:');
    result.dumbMoneyPatterns.commonCharacteristics.forEach(c => console.log(`  • ${c}`));

    if (result.topPerformers.length > 0) {
      console.log('\n👑 TOP PERFORMERS:');
      console.log('-'.repeat(70));
      result.topPerformers.slice(0, 10).forEach((trader, i) => {
        console.log(`${i + 1}. ${trader.address.substring(0, 16)}...`);
        console.log(`   Accuracy: ${(trader.accuracy * 100).toFixed(1)}% | ROI: ${trader.roi > 0 ? '+' : ''}${trader.roi.toFixed(1)}% | Trades: ${trader.totalTrades}`);
        console.log(`   Low-Liq Accuracy: ${(trader.lowLiquidityAccuracy * 100).toFixed(1)}% | High-Liq: ${(trader.highLiquidityAccuracy * 100).toFixed(1)}%`);
      });
    }

    console.log('\n💡 RECOMMENDATIONS:');
    console.log('-'.repeat(70));
    result.recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. ${rec}`);
    });

    // Print category breakdown
    if (result.categoryBreakdown) {
      console.log('\n📁 CATEGORY BREAKDOWN:');
      console.log('-'.repeat(70));
      Object.entries(result.categoryBreakdown)
        .sort((a: any, b: any) => b[1].totalMarkets - a[1].totalMarkets)
        .forEach(([category, data]: any) => {
          console.log(`${category}:`);
          console.log(`  Markets: ${data.totalMarkets} | Avg Liquidity: $${data.avgLiquidity.toFixed(0)} | Sharp Accuracy: ${(data.sharpAccuracy * 100).toFixed(1)}%`);
        });
    }

    // Print granular liquidity breakdown
    if (result.liquidityBreakdown) {
      console.log('\n💰 GRANULAR LIQUIDITY BREAKDOWN:');
      console.log('-'.repeat(70));
      Object.entries(result.liquidityBreakdown).forEach(([range, data]: any) => {
        if (data.totalMarkets > 0) {
          console.log(`${range}:`);
          console.log(`  Markets: ${data.totalMarkets} | Trades: ${data.totalTrades} | Sharp Accuracy: ${(data.sharpAccuracy * 100).toFixed(1)}% | Avg Liq: $${data.avgLiquidity.toFixed(0)}`);
        }
      });
    }

    // Print favorite vs underdog breakdown
    if (result.favoriteVsUnderdogBreakdown) {
      console.log('\n🎲 FAVORITE VS UNDERDOG BREAKDOWN:');
      console.log('-'.repeat(70));
      const fav = result.favoriteVsUnderdogBreakdown;
      console.log(`Sharp Money on Favorites: ${fav.sharpOnFavorite.count} trades`);
      console.log(`Sharp Money on Underdogs: ${fav.sharpOnUnderdog.count} trades`);
      console.log(`Dumb Money on Favorites: ${fav.dumbOnFavorite.count} trades`);
      console.log(`Dumb Money on Underdogs: ${fav.dumbOnUnderdog.count} trades`);

      const sharpFavPct = (fav.sharpOnFavorite.count / (fav.sharpOnFavorite.count + fav.sharpOnUnderdog.count) * 100).toFixed(1);
      const dumbFavPct = (fav.dumbOnFavorite.count / (fav.dumbOnFavorite.count + fav.dumbOnUnderdog.count) * 100).toFixed(1);
      console.log(`\nSharp money bets on favorites ${sharpFavPct}% of the time`);
      console.log(`Dumb money bets on favorites ${dumbFavPct}% of the time`);
    }

    // Print trade size analysis
    if (result.tradeSizeAnalysis) {
      console.log('\n💵 TRADE SIZE ANALYSIS (Predictive):');
      console.log('-'.repeat(70));
      Object.entries(result.tradeSizeAnalysis).forEach(([range, data]: any) => {
        if (data.totalTrades > 0) {
          console.log(`${range}:`);
          console.log(`  Trades: ${data.totalTrades} | Correct: ${data.correctTrades} | Accuracy: ${(data.accuracy * 100).toFixed(1)}% | Avg Size: $${data.avgSize.toFixed(0)}`);
        }
      });
    }

    // Print volume share analysis
    if (result.volumeShareAnalysis) {
      console.log('\n📊 VOLUME SHARE ANALYSIS (Predictive):');
      console.log('-'.repeat(70));
      Object.entries(result.volumeShareAnalysis).forEach(([range, data]: any) => {
        if (data.totalTrades > 0) {
          console.log(`${range}:`);
          console.log(`  Trades: ${data.totalTrades} | Correct: ${data.correctTrades} | Accuracy: ${(data.accuracy * 100).toFixed(1)}%`);
        }
      });
    }

    // Print timing analysis
    if (result.timingAnalysis) {
      console.log('\n⏰ TIMING ANALYSIS (Predictive):');
      console.log('-'.repeat(70));
      Object.entries(result.timingAnalysis).forEach(([range, data]: any) => {
        if (data.totalTrades > 0) {
          console.log(`${range}:`);
          console.log(`  Trades: ${data.totalTrades} | Correct: ${data.correctTrades} | Accuracy: ${(data.accuracy * 100).toFixed(1)}% | Avg Days: ${data.avgDaysBeforeResolution.toFixed(1)}`);
        }
      });
    }

    // Print category timing analysis
    if (result.categoryTimingAnalysis) {
      console.log('\n📁⏰ CATEGORY TIMING ANALYSIS (Predictive):');
      console.log('-'.repeat(70));
      Object.entries(result.categoryTimingAnalysis)
        .sort((a: any, b: any) => (b[1].earlyTrades.total + b[1].lateTrades.total) - (a[1].earlyTrades.total + a[1].lateTrades.total))
        .forEach(([category, data]: any) => {
          if (data.earlyTrades.total + data.lateTrades.total > 10) {
            console.log(`${category}:`);
            console.log(`  Early (7+ days): ${data.earlyTrades.total} trades, ${(data.earlyTrades.accuracy * 100).toFixed(1)}% accuracy`);
            console.log(`  Late (<7 days): ${data.lateTrades.total} trades, ${(data.lateTrades.accuracy * 100).toFixed(1)}% accuracy`);
          }
        });
    }

    console.log('\n' + '='.repeat(70) + '\n');
  }

  private createEmptyResult(): BacktestResult {
    return {
      totalMarkets: 0,
      totalTrades: 0,
      dateRange: { start: 0, end: 0 },
      topPerformers: [],
      sharpMoneyPatterns: {
        avgLiquidityOfSharpTrades: 0,
        avgTimingBeforeResolution: 0,
        commonCharacteristics: [],
      },
      dumbMoneyPatterns: {
        avgLiquidityOfDumbTrades: 0,
        avgTimingBeforeResolution: 0,
        commonCharacteristics: [],
      },
      recommendations: [],
    };
  }
}
