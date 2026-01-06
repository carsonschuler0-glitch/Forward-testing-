import { DashboardServer } from './web/server';

/**
 * Web Dashboard Entry Point
 * Runs forward test with real-time web dashboard
 */

async function main() {
  const port = parseInt(process.env.PORT || '3000', 10);

  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   Polymarket Dashboard Server             ║');
  console.log('╚═══════════════════════════════════════════╝');

  const server = new DashboardServer(port);

  try {
    await server.start();
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
