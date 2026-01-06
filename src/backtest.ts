#!/usr/bin/env ts-node
import { BacktestRunner } from './backtesting/runner';

async function main() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   Polymarket Sharp Money Backtest         ║');
  console.log('╚═══════════════════════════════════════════╝');

  const runner = new BacktestRunner();

  // Parse command line arguments
  const args = process.argv.slice(2);
  const options: any = {
    minLiquidity: 100,
    maxLiquidity: 50000,
    marketLimit: 100,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--min-liquidity' && args[i + 1]) {
      options.minLiquidity = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--max-liquidity' && args[i + 1]) {
      options.maxLiquidity = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.marketLimit = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  try {
    const result = await runner.run(options);
    runner.printReport(result);
  } catch (error) {
    console.error('Error running backtest:', error);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
Usage: npm run backtest [options]

Options:
  --min-liquidity <amount>   Minimum market liquidity to analyze (default: 100)
  --max-liquidity <amount>   Maximum market liquidity to analyze (default: 50000)
  --limit <number>           Maximum number of markets to analyze (default: 100)
  --help                     Show this help message

Examples:
  # Analyze low-liquidity markets only
  npm run backtest -- --min-liquidity 100 --max-liquidity 5000

  # Analyze more markets
  npm run backtest -- --limit 200

  # Focus on very low liquidity
  npm run backtest -- --min-liquidity 100 --max-liquidity 1000 --limit 50
  `);
}

main();
