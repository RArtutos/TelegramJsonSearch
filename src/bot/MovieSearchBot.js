const TelegramBot = require('node-telegram-bot-api');
const MovieDataManager = require('../data/MovieDataManager');
const SearchHandler = require('../handlers/SearchHandler');
const DownloadHandler = require('../handlers/DownloadHandler');
const CallbackHandler = require('../handlers/CallbackHandler');

class MovieSearchBot {
  constructor() {
    this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
      polling: true,
      baseApiUrl: process.env.LOCAL_API_URL
    });

    this.movieDataManager = new MovieDataManager();
    this.searchHandler = new SearchHandler(this.bot, this.movieDataManager);
    this.downloadHandler = new DownloadHandler(this.bot);
    this.callbackHandler = new CallbackHandler(
      this.bot,
      this.movieDataManager,
      this.searchHandler,
      this.downloadHandler
    );

    this.initializeBot();
  }

  initializeBot() {
    // Comando /start
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      this.bot.sendMessage(chatId, 
        '🎬 *Bienvenido al Buscador de Películas*\n\n' +
        'Usa el comando /search seguido del nombre de la película para buscar.\n' +
        'Ejemplo: `/search matrix`',
        { parse_mode: 'Markdown' }
      );
    });

    // Comando /search
    this.bot.onText(/\/search (.+)/, (msg, match) => {
      this.searchHandler.handleSearch(msg.chat.id, match[1]);
    });

    // Manejador de callbacks
    this.bot.on('callback_query', (query) => {
      this.callbackHandler.handle(query);
    });

    // Manejador de errores
    this.bot.on('polling_error', (error) => {
      console.error('Polling error:', error);
    });
  }
}

module.exports = MovieSearchBot;