import { DatabaseClient } from '../src/database/client';
import * as dotenv from 'dotenv';

dotenv.config();

async function checkResolvedMarkets() {
  const db = DatabaseClient.getInstance();

  if (!db.isConfigured()) {
    console.log('❌ No DATABASE_URL configured');
    process.exit(1);
  }

  try {
    await db.initialize();

    // Get resolved markets count
    const countResult = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) as resolved_markets,
        COUNT(*) FILTER (WHERE resolved_at IS NULL) as unresolved_markets,
        COUNT(*) as total_markets
      FROM markets
    `);

    const counts = countResult.rows[0];
    console.log('\n📊 MARKET RESOLUTION STATUS:');
    console.log(`  Total Markets: ${counts.total_markets}`);
    console.log(`  Resolved: ${counts.resolved_markets}`);
    console.log(`  Unresolved: ${counts.unresolved_markets}`);

    // Get resolved trades count
    const tradesResult = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE was_correct IS NOT NULL) as resolved_trades,
        COUNT(*) FILTER (WHERE was_correct IS NULL) as unresolved_trades,
        COUNT(*) FILTER (WHERE was_correct = true) as correct_trades,
        COUNT(*) FILTER (WHERE was_correct = false) as incorrect_trades,
        COUNT(*) as total_trades
      FROM trades
    `);

    const trades = tradesResult.rows[0];
    console.log('\n📈 TRADE RESOLUTION STATUS:');
    console.log(`  Total Trades: ${trades.total_trades}`);
    console.log(`  Resolved: ${trades.resolved_trades}`);
    console.log(`  Unresolved: ${trades.unresolved_trades}`);
    console.log(`  Correct: ${trades.correct_trades}`);
    console.log(`  Incorrect: ${trades.incorrect_trades}`);

    if (trades.resolved_trades > 0) {
      const accuracy = (parseFloat(trades.correct_trades) / parseFloat(trades.resolved_trades) * 100).toFixed(1);
      console.log(`  Accuracy: ${accuracy}%`);
    }

    // Get some recent resolved markets
    const recentResolved = await db.query(`
      SELECT
        question,
        category,
        resolved_outcome,
        resolved_at,
        volume
      FROM markets
      WHERE resolved_at IS NOT NULL
      ORDER BY resolved_at DESC
      LIMIT 10
    `);

    if (recentResolved.rows.length > 0) {
      console.log('\n🏁 RECENTLY RESOLVED MARKETS:');
      recentResolved.rows.forEach((market: any, i: number) => {
        const outcome = market.resolved_outcome === 1 ? 'YES' : 'NO';
        const date = new Date(market.resolved_at).toLocaleDateString();
        console.log(`  ${i + 1}. [${outcome}] ${market.question.substring(0, 60)}...`);
        console.log(`     Category: ${market.category} | Resolved: ${date} | Volume: $${parseFloat(market.volume).toFixed(0)}`);
      });
    } else {
      console.log('\n⏳ No resolved markets yet');
    }

    await db.close();
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkResolvedMarkets();
