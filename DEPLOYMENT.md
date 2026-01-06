# Railway Deployment Guide

## Quick Start

Deploy the Polymarket Sharp Money Tracker to Railway:

```bash
# Test locally first
npm run build
npm run web
# Open http://localhost:3000

# Deploy to Railway (via GitHub)
git init
git add .
git commit -m "Initial commit"
# Push to GitHub, then connect to Railway
```

## Railway Setup

1. Go to [railway.app](https://railway.app)
2. Click "Deploy from GitHub repo"
3. Select your repository
4. Railway auto-detects and deploys
5. Get your URL: `https://your-app.up.railway.app`

## Features

- Real-time trade tracking
- Live web dashboard
- WebSocket updates (60s)
- Charts, tables, metrics
- Mobile responsive
- Auto-restart on failure

## Configuration

Edit `src/web/server.ts`:
- Poll interval: line 78 (default 60000ms)
- Market limit: line 73 (default 100)
- Trade minimum: dataCollector.ts (default $1000)

## Monitoring

Health check: `https://your-app.up.railway.app/health`
API status: `https://your-app.up.railway.app/api/status`
Logs: Railway dashboard or `railway logs`

## Cost

- Free tier: $5/month credit (~500 hours)
- Hobby: $5/month unlimited
- Recommended for production
