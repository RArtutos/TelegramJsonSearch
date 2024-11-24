const TelegramBot = require('node-telegram-bot-api');
const MovieDataManager = require('../data/MovieDataManager');
const MovieHandler = require('../handlers/MovieHandler');
const SeriesHandler = require('../handlers/SeriesHandler');
const DownloadHandler = require('../handlers/DownloadHandler');
const { formatBytes, formatTime } = require('../utils/formatters');
const fs = require('fs');

class MovieSearchBot {
  constructor() {
    // Inicializar el bot con el token y configuración
    this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
      polling: true,
      baseApiUrl: process.env.LOCAL_API_URL,
      apiRoot: process.env.LOCAL_API_URL
    });

    // Inicializar manejadores
    this.movieDataManager = new MovieDataManager();
    this.movieHandler = new MovieHandler(this.bot, this.movieDataManager);
    this.seriesHandler = new SeriesHandler(this.bot, this.movieDataManager);
    this.downloadHandler = new DownloadHandler(this.bot);
    this.adminUsers = process.env.ADMIN_USERS?.split(',') || [];

    console.log('Bot inicializado correctamente');
    this.initializeBot();
  }

  initializeBot() {
    // Comandos básicos con regex mejorados
    this.bot.onText(/^\/start$/, this.handleStart.bind(this));
    this.bot.onText(/^\/movie(?:\s+(.+))?$/, this.handleMovieSearch.bind(this));
    this.bot.onText(/^\/series(?:\s+(.+))?$/, this.handleSeriesSearch.bind(this));
    this.bot.onText(/^\/status$/, this.handleStatus.bind(this));
    this.bot.onText(/^\/statusC$/, this.handleDetailedStatus.bind(this));
    this.bot.onText(/^\/back$/, this.handleBack.bind(this));
    this.bot.onText(/^\/help$/, this.handleHelp.bind(this));
    this.bot.onText(/^\/listAll\s+(movies|series)$/, this.handleListAll.bind(this));

    // Manejo de callbacks
    this.bot.on('callback_query', this.handleCallback.bind(this));
    
    // Manejo de errores
    this.bot.on('polling_error', (error) => {
      console.error('Error de polling:', error);
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
    const searchQuery = match[1]?.trim();

    if (!searchQuery) {
      await this.bot.sendMessage(chatId, '⚠️ Por favor, proporciona un término de búsqueda.\nEjemplo: `/movie matrix`', {
        parse_mode: 'Markdown'
      });
      return;
    }

    console.log(`Búsqueda de película iniciada: "${searchQuery}"`);
    await this.movieHandler.handleSearch(chatId, searchQuery);
  }

  async handleSeriesSearch(msg, match) {
    const chatId = msg.chat.id;
    const searchQuery = match[1]?.trim();

    if (!searchQuery) {
      await this.bot.sendMessage(chatId, '⚠️ Por favor, proporciona un término de búsqueda.\nEjemplo: `/series friends`', {
        parse_mode: 'Markdown'
      });
      return;
    }

    console.log(`Búsqueda de serie iniciada: "${searchQuery}"`);
    await this.seriesHandler.handleSearch(chatId, searchQuery);
  }

  async handleListAll(msg, match) {
    const chatId = msg.chat.id;
    
    // Verificar si es administrador
    if (!this.adminUsers.includes(chatId.toString())) {
      await this.bot.sendMessage(chatId, '⚠️ Este comando es solo para administradores.');
      return;
    }

    const type = match[1]; // 'movies' o 'series'
    const data = type === 'movies' ? this.movieDataManager.movieData : this.movieDataManager.seriesData;
    
    if (data.length === 0) {
      await this.bot.sendMessage(chatId, `❌ No hay ${type === 'movies' ? 'películas' : 'series'} disponibles.`);
      return;
    }

    // Crear contenido del archivo
    let content = `Lista completa de ${type === 'movies' ? 'películas' : 'series'}\n`;
    content += `Total: ${data.length}\n`;
    content += '=====================================\n\n';

    data.forEach((item, index) => {
      content += `${index + 1}. ${item.title || item.name}\n`;
      content += `   ID: ${item.id}\n`;
      if (item.path) content += `   Ruta: ${item.path}\n`;
      if (type === 'series' && item.seasons) {
        content += `   Temporadas: ${item.seasons.length}\n`;
        item.seasons.forEach(season => {
          content += `      - ${season.name}: ${season.episodes.length} episodios\n`;
        });
      }
      content += '\n';
    });

    // Crear archivo temporal
    const fileName = `lista_${type}_${Date.now()}.txt`;
    const filePath = `./${fileName}`;
    
    try {
      fs.writeFileSync(filePath, content, 'utf8');
      
      // Enviar archivo
      await this.bot.sendDocument(chatId, filePath, {
        caption: `📋 Lista completa de ${type === 'movies' ? 'películas' : 'series'}`
      });

      // Eliminar archivo temporal
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error('Error al crear/enviar archivo:', error);
      await this.bot.sendMessage(chatId, '❌ Error al generar la lista.');
    }
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
    const isAdmin = this.adminUsers.includes(chatId.toString());
    
    let helpMessage = '📖 *Ayuda del Bot*\n\n' +
      '*Comandos Básicos:*\n' +
      '`/movie nombre` - Buscar películas\n' +
      '`/series nombre` - Buscar series\n' +
      '`/status` - Ver estado básico\n' +
      '`/back` - Volver al menú anterior\n' +
      '`/help` - Mostrar esta ayuda\n\n';

    if (isAdmin) {
      helpMessage += '*Comandos de Administrador:*\n' +
        '`/statusC` - Ver estado detallado\n' +
        '`/listAll movies` - Listar todas las películas\n' +
        '`/listAll series` - Listar todas las series\n\n';
    }

    helpMessage += '*Navegación:*\n' +
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
      '- 360p SD';

    await this.bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
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
      console.error('Error en callback:', error);
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