# Quick Start Guide

## 1. Test Forward Test (CLI)

Run 3-minute demo:
```bash
npm run forward-test:demo
```

You'll see:
- ✅ 50 active markets tracked
- 📊 Real trades collected every 30s
- 📈 Analysis with all buckets
- 👑 Top traders by reputation

## 2. Run Web Dashboard (Local)

Start web server:
```bash
npm run web
```

Open: http://localhost:3000

You'll see:
- 🔴 Live indicator (updates every 60s)
- 📊 Real-time charts
- 📋 Trade/liquidity tables
- 👑 Top trader leaderboard

## 3. Deploy to Railway

Push to GitHub:
```bash
git init
git add .
git commit -m "Deploy Polymarket tracker"
git branch -M main
git remote add origin YOUR_REPO_URL
git push -u origin main
```

Deploy:
1. Go to railway.app
2. "New Project" → "Deploy from GitHub"
3. Select your repo
4. Railway auto-deploys
5. Get your URL!

## What You Get

**CLI Mode** (`npm run forward-test`):
- Terminal output
- Detailed analysis every 10 polls
- Perfect for debugging

**Web Mode** (`npm run web`):
- Beautiful dashboard
- Real-time updates
- Charts and visualizations
- Mobile friendly

**Railway Deployment**:
- 24/7 operation
- Public URL
- Auto-restarts
- Free tier available

## Next Steps

1. **Let it run 24-48 hours** to collect data
2. **Watch for patterns**:
   - Which trade sizes have highest accuracy?
   - Which liquidity ranges are most predictive?
   - Which wallets consistently perform well?
3. **Integrate alerts** (future):
   - Copy high-reputation traders
   - Alert on trade clusters
   - Notify on sudden influx

## All Commands

```bash
# Build
npm run build

# Forward test (CLI, continuous)
npm run forward-test

# Forward test demo (CLI, 3 min)
npm run forward-test:demo

# Web dashboard (local)
npm run web

# Backtest (historical, broken - no outcome data)
npm run backtest
```

## Troubleshooting

**No trades showing up?**
- Wait 60 seconds for first poll
- Check internet connection
- Verify Polymarket API is up

**Dashboard not loading?**
- Run `npm run build` first
- Check port 3000 isn't in use
- Open http://localhost:3000 (not https)

**Railway deployment fails?**
- Verify `Procfile` exists
- Check `railway.json` syntax
- Review build logs in Railway

## Support

- Forward Test: See [FORWARD_TEST_README.md](FORWARD_TEST_README.md)
- Web Dashboard: See [WEB_DASHBOARD_README.md](WEB_DASHBOARD_README.md)  
- Deployment: See [DEPLOYMENT.md](DEPLOYMENT.md)
