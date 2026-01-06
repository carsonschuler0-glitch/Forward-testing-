# Database Setup Guide

## PostgreSQL Integration

The forward testing tracker now stores all data persistently in PostgreSQL, ensuring no data loss on restarts.

## What's Stored

- **Markets**: All tracked markets (active and resolved)
- **Trades**: Every trade $1k+ with full metadata
- **Market Snapshots**: Price/liquidity state at key moments
- **Trader Reputation**: Performance metrics per wallet
- **Trade Clusters**: Detected coordinated trading patterns

## Railway Setup (Recommended)

### 1. Add PostgreSQL to Your Railway Project

```bash
# In Railway dashboard:
1. Click "+ New" in your project
2. Select "Database" → "Add PostgreSQL"
3. Railway automatically sets DATABASE_URL and DATABASE_PRIVATE_URL
4. No manual configuration needed!
```

### 2. Deploy

Your app will automatically:
- Detect the DATABASE_URL environment variable
- Create all tables on first run
- Start persisting data immediately

### 3. Verify Connection

Check your Railway logs for:
```
✅ Database connected successfully
✅ Database schema initialized
📚 Loading historical data from database...
```

## Local Development

### Option 1: Use Railway's PostgreSQL (Recommended)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Link to your Railway project
railway link

# Run locally with Railway's database
railway run npm run web
```

### Option 2: Local PostgreSQL

```bash
# Install PostgreSQL locally
brew install postgresql  # macOS
# or apt-get install postgresql  # Linux

# Start PostgreSQL
brew services start postgresql  # macOS

# Create database
createdb polymarket_forward_test

# Set environment variable
export DATABASE_URL="postgresql://localhost/polymarket_forward_test"

# Run the app
npm run web
```

### Option 3: Docker PostgreSQL

```bash
# Run PostgreSQL in Docker
docker run --name polymarket-db \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=polymarket_forward_test \
  -p 5432:5432 \
  -d postgres:15

# Set environment variable
export DATABASE_URL="postgresql://localhost:5432/polymarket_forward_test?user=postgres&password=password"

# Run the app
npm run web
```

## Running Without Database

The app works without a database (memory-only mode):

```bash
# Just run without DATABASE_URL
npm run web

# You'll see:
# ⚠️  No database configured - running in memory-only mode
```

**Note**: Data will be lost on restart in memory-only mode.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | No (graceful degradation) |
| `DATABASE_PRIVATE_URL` | Railway's private network URL (faster) | No |
| `PORT` | Web server port | No (default: 3000) |

## Database Schema

The schema is automatically created on first run. See [src/database/schema.sql](src/database/schema.sql) for details.

Key tables:
- `markets` - Market metadata and resolution status
- `trades` - All tracked trades with analysis metadata
- `market_snapshots` - Historical price/liquidity data
- `trader_reputation` - Wallet performance scores
- `trade_clusters` - Coordinated trading patterns

## Monitoring

### Check Database Stats

```bash
# In Railway dashboard, open PostgreSQL service
# Click "Metrics" to see:
- Connection count
- Query performance
- Storage usage
```

### Query Data Directly

```bash
# Using Railway CLI
railway connect postgres

# Then run SQL:
SELECT COUNT(*) FROM trades;
SELECT * FROM trader_reputation ORDER BY reputation_score DESC LIMIT 10;
SELECT question, COUNT(*) as trade_count
FROM markets m
JOIN trades t ON m.id = t.market_id
GROUP BY m.id, question
ORDER BY trade_count DESC
LIMIT 5;
```

## Data Persistence Benefits

**Before (Memory-only)**:
- ❌ Data lost on restart
- ❌ No historical analysis
- ❌ Can't track long-term trader performance

**After (PostgreSQL)**:
- ✅ Data persists forever
- ✅ Load historical data on startup
- ✅ Track trader performance over weeks/months
- ✅ Query past trades and patterns
- ✅ Resume tracking after restarts

## Cost

Railway PostgreSQL:
- **Free tier**: 512 MB storage, 1 GB RAM
- **Pro tier**: $5/month for 8 GB storage, 8 GB RAM
- Shared CPU (sufficient for this app)

For this use case, **free tier is adequate** unless you're tracking 100+ markets continuously for months.

## Troubleshooting

### "Connection refused" error

```bash
# Check DATABASE_URL is set
echo $DATABASE_URL

# Verify PostgreSQL is running
# Railway: check service status in dashboard
# Local: brew services list | grep postgresql
```

### "Relation does not exist" error

```bash
# The app auto-creates tables, but if needed:
psql $DATABASE_URL < src/database/schema.sql
```

### Slow queries

```bash
# Check index usage
EXPLAIN ANALYZE SELECT * FROM trades WHERE market_id = 'some-id';

# Indexes are created automatically (see schema.sql)
```

## Migration from Memory-Only

If you've been running without a database and want to keep existing data:

1. Deploy with DATABASE_URL (data will start persisting)
2. Historical in-memory data is NOT migrated (fresh start)
3. New trades are saved from that point forward

There's no automatic migration since memory data disappears on restart anyway.
