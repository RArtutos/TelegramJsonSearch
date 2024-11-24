const TelegramBot = require('node-telegram-bot-api');
const MovieDataManager = require('../data/MovieDataManager');
const SearchHandler = require('../handlers/SearchHandler');
const DownloadHandler = require('../handlers/DownloadHandler');

class MovieSearchBot {
  constructor() {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
      polling: true
    });

    this.dataManager = new MovieDataManager();
    this.searchHandler = new SearchHandler(this.bot, this.dataManager);
    this.downloadHandler = new DownloadHandler(this.bot, this.dataManager);

    this.initializeCommands();
  }

  initializeCommands() {
    this.bot.onText(/^\/start$/, this.handleStart.bind(this));
    this.bot.onText(/^\/movie\s+(.+)$/, this.handleMovieSearch.bind(this));
    this.bot.onText(/^\/series\s+(.+)$/, this.handleSeriesSearch.bind(this));
    this.bot.onText(/^\/help$/, this.handleHelp.bind(this));
    this.bot.on('callback_query', this.handleCallback.bind(this));
  }

  async handleStart(msg) {
    const chatId = msg.chat.id;
    const message = 
      '🎬 *Bienvenido al Buscador de Películas y Series*\n\n' +
      'Comandos disponibles:\n' +
      '`/movie nombre` - Buscar películas\n' +
      '`/series nombre` - Buscar series\n' +
      '`/help` - Ver ayuda';

    await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }

  async handleMovieSearch(msg, match) {
    const chatId = msg.chat.id;
    const query = match[1];
    await this.searchHandler.handleSearch(chatId, query, 'movie');
  }

  async handleSeriesSearch(msg, match) {
    const chatId = msg.chat.id;
    const query = match[1];
    await this.searchHandler.handleSearch(chatId, query, 'series');
  }

  async handleHelp(msg) {
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

    await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }

  async handleCallback(query) {
    try {
      const data = query.data;
      const chatId = query.message.chat.id;

      await this.bot.answerCallbackQuery(query.id);

      if (data.startsWith('download_')) {
        const [_, id, quality] = data.split('_');
        await this.downloadHandler.handleDownload(chatId, id, quality);
      } else {
        await this.searchHandler.handleCallback(query);
      }
    } catch (error) {
      console.error('Callback error:', error);
    }
  }
}

module.exports = MovieSearchBot;