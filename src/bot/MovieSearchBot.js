const TelegramBot = require('node-telegram-bot-api');
const MovieDataManager = require('../data/MovieDataManager');
const MovieHandler = require('../handlers/MovieHandler');
const SeriesHandler = require('../handlers/SeriesHandler');
const DownloadHandler = require('../handlers/DownloadHandler');
const { formatBytes, formatTime } = require('../utils/formatters');

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
    // Comandos básicos
    this.bot.onText(/\/start/, this.handleStart.bind(this));
    this.bot.onText(/\/movie (.+)/, this.handleMovieSearch.bind(this));
    this.bot.onText(/\/series (.+)/, this.handleSeriesSearch.bind(this));
    this.bot.onText(/\/status/, this.handleStatus.bind(this));
    this.bot.onText(/\/statusC/, this.handleDetailedStatus.bind(this));
    this.bot.onText(/\/back/, this.handleBack.bind(this));
    this.bot.onText(/\/help/, this.handleHelp.bind(this));

    // Manejo de callbacks
    this.bot.on('callback_query', this.handleCallback.bind(this));
    
    // Manejo de errores
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
      '`/back` - Volver al menú anterior\n' +
      '`/help` - Ver ayuda\n\n' +
      'Ejemplo: `/movie matrix` o `/series breaking bad`',
      { parse_mode: 'Markdown' }
    );
  }

  async handleMovieSearch(msg, match) {
    const chatId = msg.chat.id;
    await this.movieHandler.handleSearch(chatId, match[1]);
  }

  async handleSeriesSearch(msg, match) {
    const chatId = msg.chat.id;
    await this.seriesHandler.handleSearch(chatId, match[1]);
  }

  async handleStatus(msg) {
    const chatId = msg.chat.id;
    const status = this.movieDataManager.getSystemStatus();
    
    const message = 
      '📊 *Estado del Sistema*\n\n' +
      `📽 Películas: ${status.totalMovies}\n` +
      `📺 Series: ${status.totalSeries}\n` +
      `⬇️ Descargas activas: ${status.activeDownloads}\n` +
      `⏱ Tiempo activo: ${formatTime(status.uptime)}`;

    await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }

  async handleDetailedStatus(msg) {
    const chatId = msg.chat.id;
    
    if (!this.adminUsers.includes(chatId.toString())) {
      await this.bot.sendMessage(chatId, '⚠️ Este comando es solo para administradores.');
      return;
    }

    const status = this.movieDataManager.getSystemStatus();
    const activeDownloads = this.movieDataManager.getActiveDownloads();
    
    let message = 
      '🔍 *Estado Detallado del Sistema*\n\n' +
      `📽 Total Películas: ${status.totalMovies}\n` +
      `📺 Total Series: ${status.totalSeries}\n` +
      `⏱ Tiempo activo: ${formatTime(status.uptime)}\n\n` +
      '💾 *Uso de Memoria*\n' +
      `- RSS: ${formatBytes(status.memoryUsage.rss)}\n` +
      `- Heap: ${formatBytes(status.memoryUsage.heapUsed)} / ${formatBytes(status.memoryUsage.heapTotal)}\n\n`;

    if (activeDownloads.length > 0) {
      message += '⬇️ *Descargas Activas*\n';
      activeDownloads.forEach((download, index) => {
        message += `${index + 1}. Usuario: ${download.userId}\n` +
                  `   - Archivo: ${download.fileName}\n` +
                  `   - Progreso: ${download.progress}%\n` +
                  `   - Velocidad: ${download.speed}\n\n`;
      });
    } else {
      message += '⬇️ No hay descargas activas\n';
    }

    await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }

  async handleBack(msg) {
    const chatId = msg.chat.id;
    const userState = this.movieHandler.getUserState(chatId) || 
                     this.seriesHandler.getUserState(chatId);

    if (userState?.navigationStack?.length > 0) {
      await this.handleNavigation(chatId, 'back');
    } else {
      await this.handleStart(msg);
    }
  }

  async handleHelp(msg) {
    const chatId = msg.chat.id;
    await this.bot.sendMessage(chatId,
      '📖 *Ayuda del Bot*\n\n' +
      '*Comandos Básicos:*\n' +
      '`/movie nombre` - Buscar películas\n' +
      '`/series nombre` - Buscar series\n' +
      '`/status` - Ver estado básico\n' +
      '`/statusC` - Ver estado detallado (admin)\n' +
      '`/back` - Volver al menú anterior\n' +
      '`/help` - Mostrar esta ayuda\n\n' +
      '*Navegación:*\n' +
      '- Usa los botones para navegar\n' +
      '- `/back` para volver atrás\n' +
      '- Selecciona calidad al descargar\n\n' +
      '*Búsqueda:*\n' +
      '- Usa palabras clave relevantes\n' +
      '- Mínimo 2 caracteres\n' +
      '- No necesitas ser exacto\n\n' +
      '*Calidades Disponibles:*\n' +
      '- 1080p HD\n' +
      '- 720p HD\n' +
      '- 360p SD',
      { parse_mode: 'Markdown' }
    );
  }

  async handleCallback(query) {
    try {
      await this.bot.answerCallbackQuery(query.id);
      
      if (query.data.startsWith('movie_') || 
          query.data.startsWith('prev_movie') || 
          query.data.startsWith('next_movie')) {
        await this.movieHandler.handleCallback(query);
      } else if (query.data.startsWith('series_') || 
                 query.data.startsWith('season_') || 
                 query.data.startsWith('episode_') || 
                 query.data.startsWith('prev_series') || 
                 query.data.startsWith('next_series')) {
        await this.seriesHandler.handleCallback(query);
      } else if (query.data.startsWith('download_')) {
        await this.downloadHandler.handleCallback(query);
      } else if (query.data === 'back') {
        await this.handleNavigation(query.message.chat.id, 'back');
      }
    } catch (error) {
      console.error('Error handling callback:', error);
      this.bot.sendMessage(query.message.chat.id, 
        '❌ Ocurrió un error. Por favor, intenta de nuevo.');
    }
  }

  async handleNavigation(chatId, action) {
    const movieState = this.movieHandler.getUserState(chatId);
    const seriesState = this.seriesHandler.getUserState(chatId);
    
    if (movieState?.navigationStack?.length > 0) {
      await this.movieHandler.handleNavigation(chatId, action);
    } else if (seriesState?.navigationStack?.length > 0) {
      await this.seriesHandler.handleNavigation(chatId, action);
    }
  }
}

module.exports = MovieSearchBot;