# Polymarket Sharp Money Tracker

Real-time tracking and analysis of Polymarket trades to identify sharp money patterns.

## Features

✅ **Forward Testing** - Track active markets before outcomes known  
✅ **Real Trade Data** - Direct from Polymarket Data API  
✅ **Granular Analysis** - $1k trade size buckets, $500 liquidity buckets  
✅ **Pattern Detection** - Clusters, repeat traders, wallet concentration  
✅ **Reputation Scores** - 0-100 rating for each wallet  
✅ **Web Dashboard** - Real-time updates with charts  
✅ **Railway Ready** - One-click cloud deployment  

## Quick Start

### 1. Test Locally (3 minutes)
```bash
npm install
npm run forward-test:demo
```

### 2. Run Web Dashboard
```bash
npm run web
# Open http://localhost:3000
```

### 3. Deploy to Railway
```bash
# Push to GitHub, then:
# 1. Go to railway.app
# 2. Deploy from GitHub
# 3. Get your live URL!
```

## What It Tracks

### Your Specifications
- ✅ Trade size buckets (every $1k: $1k-$2k, $2k-$3k, ...)
- ✅ Liquidity buckets (every $500: $0-$500, $500-$1k, ...)
- ✅ Volume share (trade size as % of market volume)
- ✅ Market age (time since creation when trade occurred)
- ✅ Repeat traders (same wallet, multiple trades per market)
- ✅ Sudden influx (volume spikes detected)

### Additional Features
- ✅ Price movement impact (5min, 15min, 1hr after trade)
- ✅ Trade clustering (3+ large trades in 60min)
- ✅ Trader historical performance & reputation
- ✅ Trade velocity (rolling 1hr/6hr/24hr windows)
- ✅ Wallet concentration (top 1/3/10 dominance)

## Documentation

- [QUICK_START.md](QUICK_START.md) - Get running in 5 minutes
- [FORWARD_TEST_README.md](FORWARD_TEST_README.md) - Forward testing details
- [WEB_DASHBOARD_README.md](WEB_DASHBOARD_README.md) - Dashboard features
- [DEPLOYMENT.md](DEPLOYMENT.md) - Railway deployment guide

## Project Structure

```
src/
├── forwardTest/
│   ├── types.ts          # Type definitions
│   ├── dataCollector.ts  # Real-time data from API
│   ├── analyzer.ts       # Pattern analysis
│   └── runner.ts         # Main orchestration
├── web/
│   └── server.ts         # Express + Socket.IO server
├── forwardTest.ts        # CLI entry point
└── webServer.ts          # Web entry point

public/
├── index.html            # Dashboard UI
└── js/
    └── dashboard.js      # Client logic

Deployment:
├── railway.json          # Railway config
├── Procfile              # Process definition
└── package.json          # npm scripts
```

## Commands

```bash
# Development
npm run build              # Build TypeScript
npm run watch              # Watch for changes

# Forward Testing (CLI)
npm run forward-test       # Run continuously
npm run forward-test:demo  # Run for 3 minutes

# Web Dashboard
npm run web                # Start web server (port 3000)

# Deployment
npm start                  # Production (runs web server)
```

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js 18+
- **Backend**: Express.js, Socket.IO
- **Frontend**: Vanilla JS, Chart.js
- **APIs**: Polymarket Gamma API, Data API
- **Deployment**: Railway (with auto-deploy)

## Why Forward Testing?

Backtesting failed because:
- ❌ Polymarket API doesn't store historical outcomes
- ❌ Old markets show `outcomePrices: ["0", "0"]`
- ❌ Can't calculate accuracy retrospectively

Forward testing succeeds because:
- ✅ Real trades from Data API
- ✅ Track patterns before outcomes known
- ✅ Validate accuracy as markets resolve
- ✅ No synthetic data bias

## Sample Output

### CLI (Terminal)
```
📊 Collected 248 new trades (Total: 248)
💰 5 large trades (>$10k)

💵 TRADE SIZE DISTRIBUTION:
  $1k-$2k: 99 trades | Avg: $1024 | Accuracy: TBD
  $2k-$3k: 50 trades | Avg: $2278 | Accuracy: TBD

👑 TOP TRADERS:
  1. 0x889c5a2d... Score: 85/100 | Accuracy: 67.2%
```

### Web Dashboard
- Live charts updating every 60s
- Trade size & liquidity distributions
- Top trader leaderboard
- Clustering & concentration metrics
- Mobile responsive

## Next Steps

1. **Run for 24-48 hours** to collect dataset
2. **Wait for markets to resolve** for accuracy data
3. **Identify patterns**:
   - Which trade sizes perform best?
   - Which liquidity ranges are sharpest?
   - Which wallets to copy?
4. **Build alerts** (future):
   - High-reputation trader notifications
   - Cluster formation alerts
   - Sudden influx warnings

## License

MIT

## Support

- Open an issue on GitHub
- Check documentation in `/docs` folder
- Review forward test logs

---

**Made for identifying sharp money on Polymarket** 🎯
