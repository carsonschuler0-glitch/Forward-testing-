# Polymarket Forward Testing System

## Overview

The forward testing system tracks active Polymarket markets in real-time, capturing trades as they happen and analyzing patterns **before** knowing outcomes. This allows you to identify sharp money signals prospectively rather than retrospectively.

## What It Tracks

### Core Requirements (Your Specifications)

1. **Trade Size Buckets** - $1k increments
   - $1k-$2k, $2k-$3k, $3k-$4k, ... up to $50k, then >$50k
   - Tracks total trades, correct trades, accuracy, and average size per bucket

2. **Market Liquidity Buckets** - $500 increments
   - $0-$500, $500-$1000, $1000-$1500, ... up to $100k, then >$100k
   - Tracks markets, trades, accuracy, and average liquidity per bucket

3. **Volume Share** - Trade size as % of total market volume
   - <1%, 1-2%, 2-5%, 5-10%, 10-20%, 20-30%, >30%
   - Identifies trades that move the market vs noise

4. **Market Age** - Days since market creation when trade occurred
   - <6hr, 6-12hr, 12-24hr, 1-2 days, 2-3 days, 3-7 days, 7-14 days, 14-30 days, >30 days
   - Distinguishes early bets from late entries

5. **Repeat Traders** - Same wallet, multiple trades in same market
   - Tracks markets with repeat activity
   - Calculates accuracy of repeat traders

6. **Sudden Influx Detection** - Volume spikes
   - Detects when volume in last 1hr is 3x the 6hr average
   - Flags markets with coordinated activity

### Additional Metrics Implemented

7. **Price Movement Impact** (Requested #1)
   - Tracks price change at 5min, 15min, and 1hr after large trades
   - Identifies which trade sizes actually move markets vs get absorbed

8. **Trade Clustering** (Requested #2)
   - Detects 3+ large trades (>$5k) on same outcome within 60 minutes
   - Tracks cluster size, total volume, unique traders
   - Calculates cluster accuracy when markets resolve

9. **Trader Historical Performance** (Requested #3)
   - Builds reputation score (0-100) for each wallet
   - Tracks accuracy, ROI, volume, low-liq vs high-liq performance
   - Updates in real-time as more trades happen

10. **Market Age at Trade Time** (Requested #5)
    - Already covered in #4 above

11. **Trade Velocity** (Requested #7)
    - Rolling windows: last 1hr, 6hr, 24hr
    - Tracks trade count and volume in each window
    - Detects acceleration in trading activity

12. **Wallet Concentration** (Requested #8)
    - % of 24hr volume from top wallet, top 3, top 10
    - Identifies markets dominated by few large players
    - Tracks accuracy in high-concentration markets (>50% from top 3)

## How to Run

### Demo (3 minutes)
```bash
npm run forward-test:demo
```

Runs for 3 minutes, polling every 30 seconds. Perfect for testing.

### Production (Continuous)
```bash
npm run forward-test
```

Runs indefinitely, polling every 60 seconds. Tracks markets 24/7.

### Configuration

Edit [src/forwardTest.ts](src/forwardTest.ts) or [src/forwardTestDemo.ts](src/forwardTestDemo.ts):

```typescript
const pollIntervalSeconds = 60; // How often to check for new trades
const durationHours = undefined; // undefined = run forever, or set hours
```

## Output

The system prints analysis every 10 polls (or every hour):

### Trade Size Distribution
Shows granular $1k buckets with:
- Total trades in bucket
- Average size
- Number of resolved trades
- Accuracy (when markets resolve)

### Liquidity Distribution
Shows $500 buckets with:
- Markets in range
- Trades in range
- Average liquidity
- Accuracy

### Volume Share Analysis
Shows what % of market volume each trade represents:
- Helps identify "whale" trades vs regular trades

### Market Age Analysis
Shows when trades occurred relative to market creation:
- Early bets vs late entries
- Accuracy by timing

### Price Impact Analysis
Shows how much large trades moved the market:
- 5min, 15min, 1hr price changes
- Broken down by trade size

### Trade Clustering
Detects coordinated large trades:
- Cluster count
- Average cluster size
- Cluster accuracy

### Repeat Trader Analysis
Identifies wallets making multiple trades in same market:
- Markets with repeaters
- Average trades per repeater
- Repeater accuracy

### Wallet Concentration
Shows market dominance:
- High concentration markets (>50% from top 3)
- Concentration accuracy

### Top Traders
Ranked by reputation score (0-100):
- Accuracy, ROI, volume
- Low-liq vs high-liq performance
- Total and resolved trade counts

## Data Flow

```
Active Markets
      ↓
   Poll Trades (every 60s)
      ↓
Capture Trade Data:
  - Size
  - Market liquidity
  - Volume share
  - Market age
  - Trader address
      ↓
   Take Snapshot:
  - Current prices
  - Wallet concentration
  - Volume velocity
  - Outcome distribution
      ↓
Update Price Impact:
  - 5min after trade
  - 15min after trade
  - 1hr after trade
      ↓
  Detect Patterns:
  - Clusters
  - Repeat traders
  - Sudden influx
      ↓
 Update Reputation:
  - Per-wallet stats
  - Accuracy tracking
  - ROI calculation
      ↓
 Generate Analysis:
  - All buckets
  - All metrics
  - Recommendations
```

## Files

- [src/forwardTest/types.ts](src/forwardTest/types.ts) - Type definitions
- [src/forwardTest/dataCollector.ts](src/forwardTest/dataCollector.ts) - Real-time data collection
- [src/forwardTest/analyzer.ts](src/forwardTest/analyzer.ts) - Pattern analysis with granular bucketing
- [src/forwardTest/runner.ts](src/forwardTest/runner.ts) - Main orchestration
- [src/forwardTest.ts](src/forwardTest.ts) - Production entry point
- [src/forwardTestDemo.ts](src/forwardTestDemo.ts) - Demo entry point

## Key Differences from Backtesting

| Backtesting | Forward Testing |
|------------|----------------|
| Historical data | Real-time data |
| Outcomes known | Outcomes unknown (until resolution) |
| Can't validate patterns | Validates patterns as they happen |
| API doesn't store outcomes | Tracks outcomes as markets resolve |
| Synthetic data issues | Real trade data |

## Next Steps

1. **Let it run for 24-48 hours** to collect sufficient data
2. **Check resolved markets** - Update the resolution checking logic in [runner.ts](src/forwardTest/runner.ts#L94)
3. **Identify patterns** - Look at which buckets have highest accuracy
4. **Build alerts** - Integrate with your existing Telegram bot to alert on:
   - High-reputation traders making trades
   - Trade clusters forming
   - Sudden influx in markets
   - Large volume share trades

## Example Insights You'll Get

After 24-48 hours of data collection, you can answer:

- "Do $5k-$10k trades in <$2k liquidity markets outperform?"
- "Are trades within the first 6 hours more accurate?"
- "Do clusters of 3+ large trades predict outcomes?"
- "Which wallets have >70% accuracy and should we copy?"
- "Do trades representing >20% of market volume signal sharp money?"
- "Are high-concentration markets (dominated by top 3 wallets) more predictable?"

## Limitations

- **No historical outcomes**: Polymarket API doesn't store which outcome won for old markets
- **Price impact requires time**: Need to wait 5min/15min/1hr to measure impact
- **Accuracy requires resolution**: Can only calculate accuracy once markets resolve
- **Initial cold start**: First 24-48 hours builds the dataset

## Monitoring

While running, watch for:
- Trade collection rate (should see consistent "📊 Collected X new trades")
- Large trades (>$10k) flagged separately
- Market resolution updates
- Error messages (API rate limits, connection issues)
