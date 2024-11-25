const TelegramBot = require('node-telegram-bot-api');
const MovieDataManager = require('../data/MovieDataManager');
const MovieHandler = require('../handlers/MovieHandler');
const SeriesHandler = require('../handlers/SeriesHandler');
const DownloadHandler = require('../handlers/DownloadHandler');
const AdminHandler = require('../handlers/AdminHandler');

class MovieSearchBot {
  constructor() {
    this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
      polling: true,
      baseApiUrl: process.env.LOCAL_API_URL,
      apiRoot: process.env.LOCAL_API_URL
    });

    this.movieDataManager = new MovieDataManager();
    this.downloadHandler = new DownloadHandler(this.bot, this.movieDataManager);
    this.movieHandler = new MovieHandler(this.bot, this.movieDataManager, this.downloadHandler);
    this.seriesHandler = new SeriesHandler(this.bot, this.movieDataManager, this.downloadHandler);
    this.adminHandler = new AdminHandler(this.bot, this.movieDataManager, this.downloadHandler);

    this.initializeBot();
  }

  initializeBot() {
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      this.bot.sendMessage(chatId, 
        '🎬 *Bienvenido al Buscador de Películas y Series*\n\n' +
        'Usa los siguientes comandos:\n' +
        '`/movie nombre` - Buscar películas\n' +
        '`/series nombre` - Buscar series\n\n' +
        'Ejemplo: `/movie matrix` o `/series breaking bad`',
        { parse_mode: 'Markdown' }
      );
    });

    this.bot.onText(/\/movie (.+)/, (msg, match) => {
      this.movieHandler.handleSearch(msg.chat.id, match[1]);
    });

    this.bot.onText(/\/series (.+)/, (msg, match) => {
      this.seriesHandler.handleSearch(msg.chat.id, match[1]);
    });

    this.bot.onText(/\/listAll (.+)/, (msg, match) => {
      this.adminHandler.handleListAll(msg, match[1]);
    });

    this.bot.onText(/\/status/, (msg) => {
      this.adminHandler.handleStatus(msg);
    });

    this.bot.onText(/\/statusC/, (msg) => {
      this.adminHandler.handleDetailedStatus(msg);
    });

    this.bot.on('callback_query', async (query) => {
      try {
        await this.bot.answerCallbackQuery(query.id);
        
        if (query.data.startsWith('movie_') || query.data.startsWith('prev_movie') || 
            query.data.startsWith('next_movie') || query.data.startsWith('back_movie')) {
          await this.movieHandler.handleCallback(query);
        } else if (query.data.startsWith('series_') || query.data.startsWith('season_') || 
                   query.data.startsWith('episode_') || query.data.startsWith('prev_series') || 
                   query.data.startsWith('next_series') || query.data.startsWith('back_series')) {
          await this.seriesHandler.handleCallback(query);
        } else if (query.data.startsWith('download_')) {
          const [_, id, itag, type] = query.data.split('_');
          await this.downloadHandler.downloadAndSendVideo(query.message.chat.id, id, itag, type || 'movie');
        }
      } catch (error) {
        console.error('Error handling callback:', error);
        this.bot.sendMessage(query.message.chat.id, '❌ Ocurrió un error. Por favor, intenta de nuevo.');
      }
    });

    this.bot.on('polling_error', (error) => {
      console.error('Polling error:', error);
    });
  }
}

module.exports = MovieSearchBot;