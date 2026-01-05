# Polymarket Whale Tracker Bot

A TypeScript bot that monitors Polymarket for high-profit traders making large trades, especially in low-liquidity markets. Get real-time Telegram alerts and monitor activity through a beautiful web dashboard.

## 🎯 What It Does

This bot tracks:
- **High-profit traders**: Top 5% by ROI with proven track records
- **Large trades**: Trades that impact >10% of a market's liquidity
- **Low-liquidity opportunities**: Markets where big trades have the most impact

When all conditions align, you get instant Telegram notifications with detailed trader stats and market context.

## 🌐 Web Dashboard

The bot includes a real-time web dashboard that shows:
- **Bot Status**: Monitor uptime and connection status
- **Live Statistics**: Markets tracked, traders analyzed, trades processed
- **Whale Alerts**: See all significant trades as they happen
- **Recent Trades**: View all trades being monitored
- **Market Overview**: Browse all markets being tracked
- **Top Traders**: Leaderboard of high-performing traders by ROI

Access the dashboard at `http://localhost:3000` when the bot is running.

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 18+ and npm
- A Telegram bot token (get from [@BotFather](https://t.me/botfather))
- Your Telegram chat ID

### 2. Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### 3. Configure Telegram

1. Create a Telegram bot:
   - Message [@BotFather](https://t.me/botfather) on Telegram
   - Send `/newbot` and follow the prompts
   - Save the bot token you receive

2. Get your chat ID:
   - Message [@userinfobot](https://t.me/userinfobot) on Telegram
   - It will reply with your chat ID

3. Update `.env` file:
```bash
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

### 4. Run the Bot

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm run build
npm start
```

The bot will start and show:
- Telegram connection confirmation
- Number of markets loaded
- Web dashboard URL: `http://localhost:3000`

Open your browser to `http://localhost:3000` to access the dashboard!

## ⚙️ Configuration

Edit `.env` to customize bot behavior:

```bash
# How often to check for new trades (milliseconds)
POLL_INTERVAL_MS=10000

# Minimum trade size to consider (USD)
MIN_TRADE_SIZE_USD=100

# Minimum liquidity impact to trigger alert (%)
LIQUIDITY_THRESHOLD_PERCENT=10

# Top X% of traders by ROI to track
TOP_TRADER_PERCENTILE=5

# Minimum trading volume to qualify as "high-profit trader" (USD)
MIN_TRADER_VOLUME_USD=1000
```

## 📊 How It Works

### Trader Analysis
The bot continuously analyzes trader performance:
- **ROI Calculation**: Tracks return on investment across all trades
- **Volume Filtering**: Ignores traders with insufficient trading history
- **Percentile Ranking**: Identifies top performers in real-time

### Trade Detection
For each new trade, the bot:
1. Checks if trade size meets minimum threshold
2. Calculates liquidity impact (trade size / market liquidity)
3. Verifies trader is in top percentile by ROI
4. Sends alert if all conditions are met

### Alert Format
You'll receive rich Telegram notifications including:
- Trade details (size, price, direction)
- Market context (liquidity, volume, question)
- Trader stats (ROI, P&L, win rate, total volume)
- Direct link to the market on Polymarket

## 🔍 Example Alert

```
🚨 WHALE ALERT 🚨

🟢 BUY Yes

Market: Will Bitcoin reach $100k by end of 2024?

Trade Details:
• Size: 5000.00 shares
• Price: $0.7250
• Value: $3625.00
• Liquidity Impact: 15.42%

Market Info:
• Total Liquidity: $23,500
• Total Volume: $187,432

Trader Performance:
• ROI: +127.35%
• P&L: +$12,450.50
• Total Volume: $45,230
• Total Trades: 87
• Win Rate: 68.5%

Trader: 0x1234567890abcdef...

Market Link: https://polymarket.com/event/bitcoin-100k-2024
```

## 📁 Project Structure

```
src/
├── index.ts                      # Main entry point
├── config.ts                     # Configuration loader
├── types.ts                      # TypeScript interfaces
└── services/
    ├── tradeMonitor.ts          # Main monitoring orchestrator
    ├── polymarketClient.ts      # Polymarket API client
    ├── traderAnalyzer.ts        # Trader performance analysis
    └── telegramNotifier.ts      # Telegram alert system
```

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run in development mode with auto-reload
npm run dev

# Build TypeScript
npm run build

# Watch for changes
npm run watch
```

## ☁️ Cloud Deployment (24/7 Operation)

Want the bot to run 24/7 even when your computer is off? Deploy to the cloud!

### Railway (Recommended - Free Tier)

1. **Push to GitHub**:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/polymarket-bot.git
git push -u origin main
```

2. **Deploy to Railway**:
   - Sign up at [railway.app](https://railway.app) (free)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Add environment variables in the "Variables" tab
   - Railway automatically builds and deploys!

3. **Access Your Bot**:
   - Web dashboard: `your-app.up.railway.app`
   - Telegram alerts on your phone
   - View logs in Railway dashboard

**See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions and alternatives (Heroku, DigitalOcean).**

## 🔒 Security Notes

- Never commit your `.env` file (it's gitignored)
- Keep your Telegram bot token private
- The bot only reads public Polymarket data
- No private keys or wallet access required

## 📈 Performance Tips

1. **Adjust poll interval**: Lower values catch trades faster but use more API calls
2. **Tune thresholds**: Stricter criteria = fewer but higher-quality alerts
3. **Monitor trader count**: The bot builds trader history over time for better accuracy

## 🐛 Troubleshooting

### "Failed to connect to Telegram"
- Verify your bot token is correct
- Ensure your chat ID is correct (numeric, not username)
- Check that you've started a conversation with your bot

### "No alerts being sent"
- Thresholds might be too strict - try lowering `LIQUIDITY_THRESHOLD_PERCENT`
- Bot needs time to build trader history - be patient on first run
- Check console output for trade processing activity

### "Error fetching trades"
- Polymarket API might be down - check https://polymarket.com
- Network connectivity issues
- Rate limiting (increase `POLL_INTERVAL_MS`)

## 🚧 Future Enhancements

Potential improvements:
- Database persistence for trader history
- Web dashboard for monitoring
- Multiple notification channels (Discord, email)
- Machine learning for trader prediction
- Historical backtesting capabilities
- Custom alert templates

## 📄 License

MIT

## ⚠️ Disclaimer

This bot is for informational purposes only. Trading cryptocurrencies and prediction markets carries risk. The bot's alerts do not constitute financial advice. Always do your own research before making trading decisions.

