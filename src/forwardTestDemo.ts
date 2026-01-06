import { ForwardTestRunner } from './forwardTest/runner';

/**
 * Forward Test Demo - runs for 3 minutes
 */

async function main() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   Polymarket Forward Test DEMO            ║');
  console.log('║   Real-time Sharp Money Analysis          ║');
  console.log('╚═══════════════════════════════════════════╝');

  const runner = new ForwardTestRunner();

  // Demo configuration
  const pollIntervalSeconds = 30; // Poll every 30 seconds
  const durationMinutes = 3; // Run for 3 minutes

  console.log(`\n📋 Demo will run for ${durationMinutes} minutes, polling every ${pollIntervalSeconds} seconds\n`);

  try {
    await runner.run(pollIntervalSeconds, durationMinutes / 60);
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
