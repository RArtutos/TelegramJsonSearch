require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const MovieDataManager = require('./data/MovieDataManager');
const SearchHandler = require('./handlers/SearchHandler');
const DownloadHandler = require('./handlers/DownloadHandler');

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('❌ Error: TELEGRAM_BOT_TOKEN no está configurado en .env');
  process.exit(1);
}

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const dataManager = new MovieDataManager();
const searchHandler = new SearchHandler(bot, dataManager);
const downloadHandler = new DownloadHandler(bot, dataManager);

bot.onText(/^\/start$/, async (msg) => {
  const chatId = msg.chat.id;
  const message = 
    '🎬 *Bienvenido al Buscador de Películas y Series*\n\n' +
    'Comandos disponibles:\n' +
    '`/movie nombre` - Buscar películas\n' +
    '`/series nombre` - Buscar series\n' +
    '`/help` - Ver ayuda';

  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

bot.onText(/^\/movie\s+(.+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];
  await searchHandler.handleSearch(chatId, query, 'movies');
});

bot.onText(/^\/series\s+(.+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];
  await searchHandler.handleSearch(chatId, query, 'series');
});

bot.onText(/^\/help$/, async (msg) => {
  const chatId = msg.chat.id;
  const message = 
    '📖 *Comandos Disponibles*\n\n' +
    '`/movie nombre` - Buscar películas\n' +
    '`/series nombre` - Buscar series\n' +
    '`/help` - Mostrar esta ayuda\n\n' +
    '*Calidades Disponibles:*\n' +
    '• 1080p HD\n' +
    '• 720p HD\n' +
    '• 360p SD';

  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

bot.on('callback_query', async (query) => {
  try {
    await bot.answerCallbackQuery(query.id);
    const data = query.data;
    const chatId = query.message.chat.id;

    if (data.startsWith('download_')) {
      const [_, id, quality] = data.split('_');
      await downloadHandler.handleDownload(chatId, id, quality);
    } else {
      await searchHandler.handleCallback(query);
    }
  } catch (error) {
    console.error('Error en callback:', error);
  }
});

console.log('🚀 Bot iniciado exitosamente!');