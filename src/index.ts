import { TradeMonitor } from './services/tradeMonitor';
import { WebServer } from './services/webServer';
import { config } from './config';

async function main() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   Polymarket Whale Tracker Bot v1.0      ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  console.log('Configuration:');
  console.log(`  • Poll Interval: ${config.pollIntervalMs / 1000}s`);
  console.log(`  • Min Trade Size: $${config.minTradeSizeUsd}`);
  console.log(`  • Liquidity Threshold: ${config.liquidityThresholdPercent}%`);
  console.log(`  • Top Trader Percentile: Top ${config.topTraderPercentile}%`);
  console.log(`  • Min Trader Volume: $${config.minTraderVolumeUsd}\n`);

  // Initialize web server
  const webServer = new WebServer(3000);
  await webServer.start();

  // Initialize trade monitor with web server
  const monitor = new TradeMonitor(webServer);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nReceived SIGINT, shutting down gracefully...');
    monitor.stop();
    webServer.stop();

    const stats = monitor.getStats();
    console.log('\n📊 Final Statistics:');
    console.log(`  • Markets tracked: ${stats.marketsTracked}`);
    console.log(`  • Traders analyzed: ${stats.tradersTracked}`);
    console.log(`  • Trades processed: ${stats.processedTrades}`);
    console.log(`  • Top trader ROI threshold: ${stats.topPercentileThreshold.toFixed(2)}%`);

    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n\nReceived SIGTERM, shutting down gracefully...');
    monitor.stop();
    webServer.stop();
    process.exit(0);
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    monitor.stop();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  try {
    await monitor.start();
  } catch (error) {
    console.error('Failed to start monitor:', error);
    process.exit(1);
  }
}

main();
