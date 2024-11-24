const TelegramBot = require('node-telegram-bot-api');
const MovieDataManager = require('../data/MovieDataManager');
const MovieHandler = require('../handlers/MovieHandler');
const SeriesHandler = require('../handlers/SeriesHandler');
const DownloadHandler = require('../handlers/DownloadHandler');

class MovieSearchBot {
  constructor() {
    this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
      polling: true,
      baseApiUrl: process.env.LOCAL_API_URL,
      apiRoot: process.env.LOCAL_API_URL
    });

    this.movieDataManager = new MovieDataManager();
    this.movieHandler = new MovieHandler(this.bot, this.movieDataManager);
    this.seriesHandler = new SeriesHandler(this.bot, this.movieDataManager);
    this.downloadHandler = new DownloadHandler(this.bot, this.movieDataManager);
    this.adminUsers = process.env.ADMIN_USERS?.split(',') || [];

    this.initializeBot();
  }

  initializeBot() {
    this.bot.onText(/^\/start$/, this.handleStart.bind(this));
    this.bot.onText(/^\/movie(?:\s+(.+))?$/, this.handleMovieSearch.bind(this));
    this.bot.onText(/^\/series(?:\s+(.+))?$/, this.handleSeriesSearch.bind(this));
    this.bot.onText(/^\/status$/, this.handleStatus.bind(this));
    this.bot.onText(/^\/help$/, this.handleHelp.bind(this));
    this.bot.onText(/^\/back$/, this.handleBack.bind(this));

    this.bot.on('callback_query', this.handleCallback.bind(this));
    this.bot.on('polling_error', (error) => {
      console.error('Polling error:', error);
    });
  }

  async handleStart(msg) {
    const chatId = msg.chat.id;
    await this.bot.sendMessage(chatId, 
      '🎬 *Bienvenido al Buscador de Películas y Series*\n\n' +
      'Comandos disponibles:\n' +
      '`/movie nombre` - Buscar películas\n' +
      '`/series nombre` - Buscar series\n' +
      '`/status` - Ver estado del sistema\n' +
      '`/help` - Ver ayuda\n' +
      '`/back` - Volver al menú anterior\n\n' +
      'Ejemplo: `/movie matrix` o `/series friends`',
      { parse_mode: 'Markdown' }
    );
  }

  async handleMovieSearch(msg, match) {
    const chatId = msg.chat.id;
    const searchQuery = match[1]?.trim();

    if (!searchQuery) {
      await this.bot.sendMessage(chatId, 
        '⚠️ Por favor, proporciona un término de búsqueda.\nEjemplo: `/movie matrix`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    await this.movieHandler.handleSearch(chatId, searchQuery);
  }

  async handleSeriesSearch(msg, match) {
    const chatId = msg.chat.id;
    const searchQuery = match[1]?.trim();

    if (!searchQuery) {
      await this.bot.sendMessage(chatId, 
        '⚠️ Por favor, proporciona un término de búsqueda.\nEjemplo: `/series friends`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    await this.seriesHandler.handleSearch(chatId, searchQuery);
  }

  async handleStatus(msg) {
    const chatId = msg.chat.id;
    const status = this.movieDataManager.getSystemStatus();
    
    const message = 
      '📊 *Estado del Sistema*\n\n' +
      `📽 Películas: ${status.totalMovies}\n` +
      `📺 Series: ${status.totalSeries}\n` +
      `⬇️ Descargas activas: ${status.activeDownloads}\n` +
      `⏱ Tiempo activo: ${Math.floor(status.uptime / 60)} minutos`;

    await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }

  async handleHelp(msg) {
    const chatId = msg.chat.id;
    const isAdmin = this.adminUsers.includes(chatId.toString());
    
    let helpMessage = '📖 *Ayuda del Bot*\n\n' +
      '*Comandos Básicos:*\n' +
      '`/movie nombre` - Buscar películas\n' +
      '`/series nombre` - Buscar series\n' +
      '`/status` - Ver estado básico\n' +
      '`/help` - Mostrar esta ayuda\n' +
      '`/back` - Volver al menú anterior\n\n' +
      '*Búsqueda:*\n' +
      '- Usa palabras clave relevantes\n' +
      '- Mínimo 2 caracteres\n' +
      '- No necesitas ser exacto\n\n' +
      '*Calidades Disponibles:*\n' +
      '- 1080p HD\n' +
      '- 720p HD\n' +
      '- 360p SD';

    await this.bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
  }

  async handleBack(msg) {
    const chatId = msg.chat.id;
    const movieState = this.movieHandler.getUserState(chatId);
    const seriesState = this.seriesHandler.getUserState(chatId);

    if (movieState?.navigationStack?.length > 0) {
      await this.movieHandler.handleNavigation(chatId, 'back');
    } else if (seriesState?.navigationStack?.length > 0) {
      await this.seriesHandler.handleNavigation(chatId, 'back');
    } else {
      await this.handleStart(msg);
    }
  }

  async handleCallback(query) {
    try {
      const data = query.data;
      
      await this.bot.answerCallbackQuery(query.id);

      if (data.startsWith('movie_') || data.startsWith('prev_movie') || data.startsWith('next_movie')) {
        await this.movieHandler.handleCallback(query);
      } else if (data.startsWith('series_') || data.startsWith('season_') || 
                 data.startsWith('episode_') || data.startsWith('prev_series') || 
                 data.startsWith('next_series')) {
        await this.seriesHandler.handleCallback(query);
      } else if (data.startsWith('download_')) {
        const [_, id, itag] = data.split('_');
        await this.downloadHandler.downloadAndSendVideo(query.message.chat.id, id, itag);
      }
    } catch (error) {
      console.error('Error en callback:', error);
      try {
        await this.bot.sendMessage(query.message.chat.id, 
          '❌ Error al procesar la solicitud. Por favor, intenta de nuevo.');
      } catch (sendError) {
        console.error('Error sending error message:', sendError);
      }
    }
  }
}

module.exports = MovieSearchBot;