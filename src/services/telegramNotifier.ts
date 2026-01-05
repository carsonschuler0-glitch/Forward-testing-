import TelegramBot from 'node-telegram-bot-api';
import { AlertData } from '../types';

export class TelegramNotifier {
  private bot: TelegramBot;
  private chatId: string;

  constructor(botToken: string, chatId: string) {
    this.bot = new TelegramBot(botToken, { polling: false });
    this.chatId = chatId;
  }

  async sendAlert(alert: AlertData): Promise<void> {
    try {
      const message = this.formatAlert(alert);
      await this.bot.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
      console.log(`✅ Alert sent for trade ${alert.trade.id}`);
    } catch (error) {
      console.error('Error sending Telegram alert:', error);
    }
  }

  async sendStartupMessage(): Promise<void> {
    try {
      const message = `
🤖 <b>Polymarket Trading Bot Started</b>

The bot is now monitoring for:
• High-profit traders (top 5% by ROI)
• Large trades (>10% of market liquidity)
• Low liquidity market opportunities

You'll receive alerts when these conditions align.
      `.trim();

      await this.bot.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('Error sending startup message:', error);
    }
  }

  async sendErrorNotification(error: string): Promise<void> {
    try {
      const message = `⚠️ <b>Bot Error</b>\n\n${error}`;
      await this.bot.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('Error sending error notification:', err);
    }
  }

  private formatAlert(alert: AlertData): string {
    const { trade, market, traderStats, liquidityImpact } = alert;

    const tradeValue = (trade.price * trade.size).toFixed(2);
    const liquidityFormatted = market.liquidity.toFixed(0);
    const roiFormatted = traderStats.roi > 0 ? `+${traderStats.roi.toFixed(2)}%` : `${traderStats.roi.toFixed(2)}%`;
    const plFormatted = traderStats.profitLoss > 0
      ? `+$${traderStats.profitLoss.toFixed(2)}`
      : `-$${Math.abs(traderStats.profitLoss).toFixed(2)}`;

    const outcomeText = trade.outcomeName || `Outcome ${trade.outcomeIndex}`;
    const sideEmoji = trade.side === 'BUY' ? '🟢' : '🔴';

    return `
🚨 <b>WHALE ALERT</b> 🚨

${sideEmoji} <b>${trade.side}</b> ${outcomeText}

<b>Market:</b> ${market.question}

<b>Trade Details:</b>
• Size: ${trade.size.toFixed(2)} shares
• Price: $${trade.price.toFixed(4)}
• Value: $${tradeValue}
• Liquidity Impact: <b>${liquidityImpact.toFixed(2)}%</b>

<b>Market Info:</b>
• Total Liquidity: $${liquidityFormatted}
• Total Volume: $${market.volume.toFixed(0)}

<b>Trader Performance:</b>
• ROI: ${roiFormatted}
• P&L: ${plFormatted}
• Total Volume: $${traderStats.totalVolume.toFixed(0)}
• Total Trades: ${traderStats.totalTrades}
• Win Rate: ${traderStats.winRate.toFixed(1)}%

<b>Trader:</b> <code>${trade.trader}</code>

<b>Market Link:</b> https://polymarket.com/event/${market.slug}

<i>${alert.reason}</i>
    `.trim();
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.bot.sendMessage(this.chatId, '🧪 Testing connection...');
      return true;
    } catch (error) {
      console.error('Telegram connection test failed:', error);
      return false;
    }
  }
}
