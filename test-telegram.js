require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

console.log('Testing Telegram connection...');
console.log('Token:', token ? token.substring(0, 10) + '...' : 'NOT SET');
console.log('Chat ID:', chatId || 'NOT SET');

if (!token || !chatId) {
  console.error('❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env file');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: false });

bot.sendMessage(chatId, '✅ Connection successful! Your Polymarket bot is ready.')
  .then(() => {
    console.log('✅ Message sent successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to send message:', error.message);
    if (error.response && error.response.body) {
      console.error('Response:', JSON.stringify(error.response.body, null, 2));
    }
    process.exit(1);
  });
