import { ForwardTestDataCollector } from './dataCollector';
import { ForwardTestAnalyzer } from './analyzer';
import { ActiveMarket, LiveTrade, MarketSnapshot } from './types';
import { db } from '../database/client';
import { repository } from '../database/repository';

/**
 * Forward test runner - tracks active markets in real-time
 */
export class ForwardTestRunner {
  private collector: ForwardTestDataCollector;
  private analyzer: ForwardTestAnalyzer;

  private activeMarkets = new Map<string, ActiveMarket>();
  private allTrades: LiveTrade[] = [];
  private snapshots = new Map<string, MarketSnapshot>();

  constructor() {
    this.collector = new ForwardTestDataCollector();
    this.analyzer = new ForwardTestAnalyzer();
  }

  /**
   * Initialize database connection
   */
  async initializeDatabase(): Promise<void> {
    if (db.isConfigured()) {
      console.log('🗄️  Initializing database...');
      await db.initialize();
      console.log('✅ Database ready');
    } else {
      console.log('⚠️  No database configured - running in memory-only mode');
    }
  }

  /**
   * Load historical data from database
   */
  async loadHistoricalData(): Promise<void> {
    if (!db.isConfigured()) return;

    console.log('📚 Loading historical data from database...');

    // Load markets
    const markets = await repository.getAllMarkets();
    markets.forEach(m => this.activeMarkets.set(m.id, m));
    console.log(`  ✓ Loaded ${markets.length} markets`);

    // Load trades
    this.allTrades = await repository.getAllTrades();
    console.log(`  ✓ Loaded ${this.allTrades.length} trades`);

    // Load snapshots (most recent per market)
    for (const marketId of this.activeMarkets.keys()) {
      const snapshots = await repository.getSnapshotsByMarket(marketId);
      if (snapshots.length > 0) {
        this.snapshots.set(marketId, snapshots[snapshots.length - 1]);
      }
    }
    console.log(`  ✓ Loaded ${this.snapshots.size} market snapshots`);

    console.log('✅ Historical data loaded\n');
  }

  /**
   * Initialize - fetch active markets to track
   */
  async initialize(marketLimit: number = 50): Promise<void> {
    console.log('\n🚀 Initializing Forward Test...\n');

    // Initialize database
    await this.initializeDatabase();

    // Load historical data if available
    await this.loadHistoricalData();

    // Fetch new active markets
    console.log(`Fetching ${marketLimit} active markets to track...`);
    const markets = await this.collector.fetchActiveMarkets(marketLimit);

    // Add new markets to tracking
    for (const market of markets) {
      if (!this.activeMarkets.has(market.id)) {
        this.activeMarkets.set(market.id, market);
        await repository.saveMarket(market);
      }
    }

    console.log(`✅ Tracking ${this.activeMarkets.size} active markets\n`);

    // Take initial snapshots for new markets
    for (const market of markets) {
      if (!this.snapshots.has(market.id)) {
        const snapshot = await this.collector.captureMarketSnapshot(market, []);
        this.snapshots.set(market.id, snapshot);
        await repository.saveSnapshot(snapshot);
      }
    }
  }

  /**
   * Poll for new trades (run this on interval)
   */
  async pollTrades(): Promise<void> {
    const newTrades: LiveTrade[] = [];

    for (const market of this.activeMarkets.values()) {
      const trades = await this.collector.fetchNewTrades(market, 1000); // $1k minimum
      newTrades.push(...trades);

      // Save new trades to database
      for (const trade of trades) {
        await repository.saveTrade(trade);
      }

      // Update market snapshot
      if (trades.length > 0 || Math.random() < 0.1) { // Snapshot 10% of the time even with no trades
        const snapshot = await this.collector.captureMarketSnapshot(market, this.allTrades.filter(t => t.marketId === market.id));
        this.snapshots.set(market.id, snapshot);
        await repository.saveSnapshot(snapshot);
      }

      // Update price impact for existing trades
      const marketTrades = this.allTrades.filter(t => t.marketId === market.id);
      await this.collector.updatePriceImpact(marketTrades, market);

      // Save updated trades with price impact
      for (const trade of marketTrades) {
        if (trade.priceAfter5min || trade.priceAfter15min || trade.priceAfter1hr) {
          await repository.saveTrade(trade);
        }
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.allTrades.push(...newTrades);

    if (newTrades.length > 0) {
      console.log(`📊 Collected ${newTrades.length} new trades (Total: ${this.allTrades.length})`);

      // Log notable trades
      const largeTrades = newTrades.filter(t => t.size >= 10000);
      if (largeTrades.length > 0) {
        console.log(`  💰 ${largeTrades.length} large trades (>$10k)`);
        largeTrades.slice(0, 3).forEach(t => {
          const market = this.activeMarkets.get(t.marketId);
          console.log(`    - $${t.size.toFixed(0)} on "${market?.question.substring(0, 50)}..." by ${t.trader.substring(0, 12)}...`);
        });
      }
    }
  }

  /**
   * Check for resolved markets and update trade outcomes
   */
  async checkResolvedMarkets(): Promise<void> {
    const resolvedCount = 0;

    for (const market of this.activeMarkets.values()) {
      // Re-fetch market to check if it's resolved
      // TODO: Implement resolution checking logic
      // For now, markets remain active
    }

    if (resolvedCount > 0) {
      console.log(`✅ ${resolvedCount} markets resolved`);
    }
  }

  /**
   * Generate and print analysis
   */
  async printAnalysis(): Promise<void> {
    if (this.allTrades.length === 0) {
      console.log('No trades collected yet...');
      return;
    }

    const analysis = this.analyzer.generateAnalysis(
      this.allTrades,
      this.activeMarkets,
      this.snapshots
    );

    // Save trader reputations to database
    if (db.isConfigured()) {
      for (const trader of analysis.topTraders) {
        await repository.saveTraderReputation(trader);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 FORWARD TEST ANALYSIS');
    console.log('='.repeat(80) + '\n');

    console.log(`Time Period: ${new Date(analysis.startTime).toLocaleString()} - ${new Date(analysis.endTime).toLocaleString()}`);
    console.log(`Markets Tracked: ${analysis.totalMarkets} (Active: ${analysis.activeMarkets}, Resolved: ${analysis.resolvedMarkets})`);
    console.log(`Total Trades: ${analysis.totalTrades} | Resolved: ${analysis.resolvedTrades}\n`);

    // Trade size buckets (show top 10 most active)
    console.log('💵 TRADE SIZE DISTRIBUTION (Top 10):');
    console.log('-'.repeat(80));
    Object.entries(analysis.tradeSizeBuckets)
      .sort((a: any, b: any) => b[1].totalTrades - a[1].totalTrades)
      .slice(0, 10)
      .forEach(([range, data]: any) => {
        const resolvedInRange = this.allTrades.filter(t =>
          data.avgSize && t.size >= data.avgSize - 500 && t.size < data.avgSize + 500 &&
          t.wasCorrect !== undefined
        ).length;
        console.log(`  ${range}: ${data.totalTrades} trades | Avg: $${data.avgSize.toFixed(0)} | Resolved: ${resolvedInRange} | Accuracy: ${(data.accuracy * 100).toFixed(1)}%`);
      });

    // Liquidity buckets (show non-zero only, top 10)
    console.log('\n💰 LIQUIDITY DISTRIBUTION (Top 10):');
    console.log('-'.repeat(80));
    Object.entries(analysis.liquidityBuckets)
      .sort((a: any, b: any) => b[1].totalTrades - a[1].totalTrades)
      .slice(0, 10)
      .forEach(([range, data]: any) => {
        console.log(`  ${range}: ${data.totalMarkets} markets | ${data.totalTrades} trades | Avg Liq: $${data.avgLiquidity.toFixed(0)} | Accuracy: ${(data.accuracy * 100).toFixed(1)}%`);
      });

    // Volume share
    if (Object.keys(analysis.volumeShareBuckets).length > 0) {
      console.log('\n📊 VOLUME SHARE ANALYSIS:');
      console.log('-'.repeat(80));
      Object.entries(analysis.volumeShareBuckets).forEach(([range, data]: any) => {
        console.log(`  ${range}: ${data.totalTrades} trades | Accuracy: ${(data.accuracy * 100).toFixed(1)}%`);
      });
    }

    // Market age
    if (Object.keys(analysis.marketAgeBuckets).length > 0) {
      console.log('\n⏰ MARKET AGE AT TRADE TIME:');
      console.log('-'.repeat(80));
      Object.entries(analysis.marketAgeBuckets).forEach(([range, data]: any) => {
        console.log(`  ${range}: ${data.totalTrades} trades | Avg Age: ${data.avgAge.toFixed(1)} days | Accuracy: ${(data.accuracy * 100).toFixed(1)}%`);
      });
    }

    // Price impact
    if (Object.keys(analysis.priceImpactAnalysis).length > 0) {
      console.log('\n📈 PRICE IMPACT ANALYSIS:');
      console.log('-'.repeat(80));
      Object.entries(analysis.priceImpactAnalysis).forEach(([range, data]: any) => {
        console.log(`  ${range}:`);
        console.log(`    5min: ${(data.avgImpact5min * 100).toFixed(2)}% | 15min: ${(data.avgImpact15min * 100).toFixed(2)}% | 1hr: ${(data.avgImpact1hr * 100).toFixed(2)}% | Trades: ${data.tradeCount}`);
      });
    }

    // Clustering
    console.log(`\n🎯 TRADE CLUSTERING:`);
    console.log('-'.repeat(80));
    console.log(`Total Clusters: ${analysis.totalClusters} | Correct: ${analysis.clustersCorrect} | Accuracy: ${(analysis.clusterAccuracy * 100).toFixed(1)}%`);
    console.log(`Avg Cluster Size: ${analysis.avgClusterSize.toFixed(1)} trades`);

    // Repeat traders
    console.log(`\n🔄 REPEAT TRADER ANALYSIS:`);
    console.log('-'.repeat(80));
    console.log(`Markets with Repeat Traders: ${analysis.marketsWithRepeatTraders}`);
    console.log(`Avg Trades per Repeater: ${analysis.avgTradesPerRepeater.toFixed(1)}`);
    console.log(`Repeater Accuracy: ${(analysis.repeaterAccuracy * 100).toFixed(1)}%`);

    // Wallet concentration
    console.log(`\n👥 WALLET CONCENTRATION:`);
    console.log('-'.repeat(80));
    console.log(`High Concentration Markets (>50% from top 3): ${analysis.highConcentrationMarkets}`);
    console.log(`Concentration Accuracy: ${(analysis.concentrationAccuracy * 100).toFixed(1)}%`);

    // Velocity
    console.log(`\n⚡ TRADE VELOCITY:`);
    console.log('-'.repeat(80));
    console.log(`Markets with Sudden Influx: ${analysis.marketsWithSuddenInflux}`);

    // Top traders
    if (analysis.topTraders.length > 0) {
      console.log(`\n👑 TOP TRADERS BY REPUTATION:`);
      console.log('-'.repeat(80));
      analysis.topTraders.slice(0, 10).forEach((trader, i) => {
        console.log(`${i + 1}. ${trader.address.substring(0, 16)}...`);
        console.log(`   Score: ${trader.reputationScore.toFixed(0)}/100 | Accuracy: ${(trader.accuracy * 100).toFixed(1)}% | ROI: ${trader.roi > 0 ? '+' : ''}${trader.roi.toFixed(1)}%`);
        console.log(`   Trades: ${trader.totalTrades} (${trader.resolvedTrades} resolved) | Volume: $${trader.totalVolume.toFixed(0)}`);
        console.log(`   Low-Liq: ${(trader.lowLiqAccuracy * 100).toFixed(1)}% | High-Liq: ${(trader.highLiqAccuracy * 100).toFixed(1)}%`);
      });
    }

    // Recommendations
    if (analysis.recommendations.length > 0) {
      console.log(`\n💡 RECOMMENDATIONS:`);
      console.log('-'.repeat(80));
      analysis.recommendations.forEach((rec, i) => {
        console.log(`${i + 1}. ${rec}`);
      });
    }

    console.log('\n' + '='.repeat(80) + '\n');
  }

  /**
   * Run continuous forward test
   */
  async run(pollIntervalSeconds: number = 60, durationHours?: number): Promise<void> {
    await this.initialize();

    const endTime = durationHours
      ? Date.now() + durationHours * 60 * 60 * 1000
      : Infinity;

    console.log(`\n⏱️  Polling every ${pollIntervalSeconds} seconds${durationHours ? ` for ${durationHours} hours` : ' indefinitely'}...\n`);

    let iteration = 0;

    while (Date.now() < endTime) {
      iteration++;
      console.log(`\n--- Poll #${iteration} at ${new Date().toLocaleTimeString()} ---`);

      await this.pollTrades();
      await this.checkResolvedMarkets();

      // Print analysis every 10 polls or every hour
      if (iteration % 10 === 0 || (iteration * pollIntervalSeconds) % 3600 === 0) {
        this.printAnalysis();
      }

      // Wait for next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalSeconds * 1000));
    }

    console.log('\n✅ Forward test completed!\n');
    this.printAnalysis();
  }
}
