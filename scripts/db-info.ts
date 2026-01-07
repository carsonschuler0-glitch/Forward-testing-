/**
 * Print database connection information for TablePlus
 * Run: ts-node scripts/db-info.ts
 */

const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL;

if (!databaseUrl) {
  console.log('❌ No DATABASE_URL found');
  console.log('\nTo connect to Railway database:');
  console.log('1. Install Railway CLI: npm install -g @railway/cli');
  console.log('2. Link project: railway link');
  console.log('3. Get URL: railway variables | grep DATABASE_URL');
  process.exit(1);
}

// Parse the URL
const url = new URL(databaseUrl);

console.log('\n╔═══════════════════════════════════════════╗');
console.log('║     TablePlus Connection Info             ║');
console.log('╚═══════════════════════════════════════════╝\n');

console.log('📋 Connection Details:\n');
console.log(`  Name:     Polymarket Forward Test`);
console.log(`  Host:     ${url.hostname}`);
console.log(`  Port:     ${url.port || 5432}`);
console.log(`  User:     ${url.username}`);
console.log(`  Password: ${url.password}`);
console.log(`  Database: ${url.pathname.slice(1)}`);
console.log(`  SSL:      ✓ REQUIRED (Enable in TablePlus)\n`);

console.log('🔗 Or use Connection URL:\n');
console.log(`  ${databaseUrl}\n`);

console.log('📊 Quick Queries to Try:\n');
console.log('  -- Total trades');
console.log('  SELECT COUNT(*) FROM trades;\n');
console.log('  -- Recent large trades');
console.log('  SELECT size, price, timestamp FROM trades WHERE size >= 10000 ORDER BY timestamp DESC LIMIT 10;\n');
console.log('  -- Top traders');
console.log('  SELECT address, reputation_score, total_trades FROM trader_reputation ORDER BY reputation_score DESC LIMIT 10;\n');
