import { ForwardTestRunner } from './forwardTest/runner';

/**
 * Forward Test Entry Point
 *
 * Tracks active Polymarket markets in real-time and analyzes trade patterns
 */

async function main() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   Polymarket Forward Test                 ║');
  console.log('║   Real-time Sharp Money Analysis          ║');
  console.log('╚═══════════════════════════════════════════╝');

  const runner = new ForwardTestRunner();

  // Configuration
  const pollIntervalSeconds = 60; // Poll every 60 seconds
  const durationHours = undefined; // Run indefinitely (or set to number of hours)

  try {
    await runner.run(pollIntervalSeconds, durationHours);
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
