# Web Dashboard

## Overview

Real-time web dashboard for tracking Polymarket sharp money patterns.

## Running Locally

```bash
npm run build
npm run web
```

Open: http://localhost:3000

## Features

### Live Updates
- WebSocket connection updates every 60 seconds
- Pulsing indicator shows new trades

### Status Bar
- Active Markets
- Total Trades
- Resolved Trades  
- New Trades (last poll)

### Visualizations

**Trade Size Distribution**
- Bar chart: Top 10 buckets
- Dual axis: Trade count + Accuracy%
- $1k increments

**Liquidity Distribution**  
- Bar chart: Top 10 buckets
- Dual axis: Trade count + Accuracy%
- $500 increments

**Trade Clustering**
- Total clusters detected
- Cluster accuracy
- Average cluster size

**Wallet Concentration**
- High concentration markets (>50% from top 3)
- Concentration accuracy
- Repeat trader markets

### Tables

**Top Trade Size Buckets**
- Top 15 by trade count
- Shows: Range, Trades, Avg Size, Resolved, Accuracy
- Visual accuracy bars

**Top Liquidity Buckets**
- Top 15 by trade count
- Shows: Range, Markets, Trades, Avg Liquidity, Accuracy
- Visual accuracy bars

**Top Traders**
- Top 10 by reputation score (0-100)
- Shows: Address, Score, Accuracy, ROI, Volume
- Low-liq vs high-liq performance
- Resolved trade count

## Technology Stack

- **Backend**: Express.js + Socket.IO
- **Frontend**: Vanilla JS + Chart.js
- **Real-time**: WebSocket updates
- **Styling**: CSS (dark theme)
- **Charts**: Chart.js 4.4.0

## Files

- `src/web/server.ts` - Express + Socket.IO server
- `src/webServer.ts` - Entry point
- `public/index.html` - Dashboard UI
- `public/js/dashboard.js` - Client logic

## Customization

### Change Theme

Edit `public/index.html` CSS:
- Background: `#0a0e27` (line 17)
- Primary: `#667eea` (line 24)
- Cards: `#161b2e` (line 77)

### Add More Charts

1. Add canvas in HTML
2. Create chart in `dashboard.js`
3. Update in `updateDashboard()` function

### Adjust Layout

Grid is responsive:
- Desktop: 2 columns (400px min)
- Mobile: 1 column
- Full-width cards: `.full-width` class

## API Endpoints

- `GET /` - Dashboard page
- `GET /health` - Health check
- `GET /api/status` - System status
- `WS /` - WebSocket for updates

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Performance

- Initial load: ~500KB
- Update payload: ~50KB
- Memory: ~50MB browser
- CPU: Minimal (chart redraws only)

## Mobile

Fully responsive:
- Status bar stacks vertically
- Charts scale to screen
- Tables scroll horizontally
- Touch-friendly

## Development

Watch for changes:
```bash
# Terminal 1: Build watch
npm run watch

# Terminal 2: Run server
npm run web
```

Refresh browser to see updates.
