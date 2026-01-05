# Deployment Guide

This guide will help you deploy your Polymarket Whale Tracker bot to the cloud for 24/7 operation.

## ☁️ Railway Deployment (Recommended)

Railway offers the easiest deployment with a generous free tier ($5/month credit).

### Step 1: Prepare Your Code

1. **Initialize Git repository** (if not already done):
```bash
git init
git add .
git commit -m "Initial commit"
```

2. **Push to GitHub**:
```bash
# Create a new repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/polymarket-bot.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy to Railway

1. **Sign up for Railway**:
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub (it's free)

2. **Create New Project**:
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `polymarket-bot` repository
   - Railway will automatically detect it's a Node.js project

3. **Add Environment Variables**:
   - In your Railway project, go to "Variables" tab
   - Add these variables one by one:
   ```
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   TELEGRAM_CHAT_ID=your_telegram_chat_id
   POLYMARKET_API_URL=https://clob.polymarket.com
   POLYMARKET_GAMMA_API=https://gamma-api.polymarket.com
   POLL_INTERVAL_MS=10000
   MIN_TRADE_SIZE_USD=100
   LIQUIDITY_THRESHOLD_PERCENT=10
   TOP_TRADER_PERCENTILE=5
   MIN_TRADER_VOLUME_USD=1000
   ```

4. **Deploy**:
   - Railway will automatically build and deploy your bot
   - Watch the deployment logs in real-time
   - You'll get a public URL for the web dashboard (e.g., `your-bot.up.railway.app`)

5. **Monitor Your Bot**:
   - Check the "Logs" tab to see your bot running
   - Access the web dashboard at your Railway URL
   - Get Telegram alerts on your phone

### Railway Features:

✅ **Auto-restart** on crashes
✅ **Auto-deploy** on git push
✅ **Free tier**: $5/month credit (enough for this bot)
✅ **Logs & monitoring** built-in
✅ **Custom domain** support

### Updating Your Bot:

Simply push changes to GitHub:
```bash
git add .
git commit -m "Update bot"
git push
```
Railway automatically redeploys!

---

## 🚀 Alternative: Heroku

Heroku is another easy option with a free tier.

### Quick Deploy:

1. **Install Heroku CLI**:
```bash
brew install heroku/brew/heroku
```

2. **Login and Create App**:
```bash
heroku login
heroku create polymarket-whale-tracker
```

3. **Set Environment Variables**:
```bash
heroku config:set TELEGRAM_BOT_TOKEN=your_token
heroku config:set TELEGRAM_CHAT_ID=your_chat_id
heroku config:set POLYMARKET_API_URL=https://clob.polymarket.com
heroku config:set POLYMARKET_GAMMA_API=https://gamma-api.polymarket.com
# ... add all other variables
```

4. **Deploy**:
```bash
git push heroku main
```

5. **View Logs**:
```bash
heroku logs --tail
```

---

## 💧 Alternative: DigitalOcean ($5/month)

For more control and guaranteed uptime.

### Setup:

1. Create a $5/month Droplet (Ubuntu)
2. SSH into your server
3. Install Node.js 18+
4. Clone your repository
5. Install PM2: `npm install -g pm2`
6. Run: `pm2 start dist/index.js --name polymarket-bot`
7. Setup PM2 startup: `pm2 startup` and `pm2 save`

---

## 🔧 Troubleshooting

### Bot Not Starting on Railway:
- Check "Logs" tab for errors
- Verify all environment variables are set
- Ensure Telegram bot token is correct

### Web Dashboard Not Accessible:
- Railway automatically assigns a public URL
- Check the "Settings" tab for your deployment URL
- The web interface runs on port 3000 internally

### Out of Railway Credits:
- Free tier gives $5/month
- This bot uses ~$2-3/month
- Upgrade to Hobby plan ($5/month) if needed

### Telegram Alerts Not Working:
- Verify `TELEGRAM_BOT_TOKEN` is correct
- Verify `TELEGRAM_CHAT_ID` is correct (numeric)
- Check logs for "Telegram connection established"

---

## 📊 Monitoring Your Deployment

### Railway Dashboard:
- **Metrics**: CPU, memory, network usage
- **Logs**: Real-time application logs
- **Deployments**: History of all deployments

### Web Dashboard:
Access at your Railway URL to see:
- Bot status and uptime
- Live trade feed
- Whale alerts
- Market overview
- Top traders

### Telegram:
- Startup notification when bot deploys
- Error notifications if issues occur
- Whale alerts when conditions met

---

## 💰 Cost Estimates

**Railway (Recommended)**:
- Free tier: $5/month credit
- Actual usage: ~$2-3/month
- **Total: Free** (within credit)

**Heroku**:
- Eco Dyno: $5/month
- **Total: $5/month**

**DigitalOcean**:
- Basic Droplet: $5/month
- **Total: $5/month**

---

## 🔐 Security Best Practices

1. **Never commit .env file** (already in .gitignore)
2. **Use environment variables** for all secrets
3. **Rotate Telegram bot token** periodically
4. **Monitor deployment logs** for suspicious activity
5. **Keep dependencies updated**: `npm audit fix`

---

## 🎯 Next Steps

After deployment:
1. ✅ Verify bot is running in Railway logs
2. ✅ Check Telegram for startup message
3. ✅ Open web dashboard to confirm it's accessible
4. ✅ Wait for first whale alert!

Your bot is now running 24/7 in the cloud! 🚀
