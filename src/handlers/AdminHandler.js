const si = require('systeminformation');
const { Parser } = require('json2csv');
const { formatBytes } = require('../utils/formatters');

class AdminHandler {
  constructor(bot, movieDataManager, downloadHandler) {
    this.bot = bot;
    this.movieDataManager = movieDataManager;
    this.downloadHandler = downloadHandler;
    this.ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id)) : [];
    this.statusIntervals = new Map();
  }

  isAdmin(userId) {
    return this.ADMIN_IDS.includes(userId);
  }

  async handleListAll(msg, type) {
    if (!this.isAdmin(msg.from.id)) {
      this.bot.sendMessage(msg.chat.id, '⛔ No tienes permisos de administrador.');
      return;
    }

    try {
      let data;
      if (type.toLowerCase() === 'movies') {
        data = this.movieDataManager.getAllMovies();
      } else {
        data = await this.getDetailedSeriesList();
      }

      const fields = type.toLowerCase() === 'movies' 
        ? ['id', 'name', 'size', 'quality', 'dateAdded']
        : ['id', 'name', 'seasons', 'episodes', 'totalSize', 'dateAdded'];

      const json2csvParser = new Parser({ fields });
      const csv = json2csvParser.parse(data);

      const buffer = Buffer.from(csv, 'utf-8');
      await this.bot.sendDocument(msg.chat.id, buffer, {
        filename: `${type}_list.csv`,
        caption: `📊 Lista completa de ${type}`
      }, {
        contentType: 'text/csv'
      });
    } catch (error) {
      console.error(`Error generating ${type} list:`, error);
      this.bot.sendMessage(msg.chat.id, '❌ Error generando la lista.');
    }
  }

  async getDetailedSeriesList() {
    const series = this.movieDataManager.getAllSeries();
    return series.map(serie => {
      const seasons = this.movieDataManager.getSeasons(serie.id);
      let totalEpisodes = 0;
      let totalSize = 0;

      seasons.forEach(season => {
        const episodes = this.movieDataManager.getEpisodes(season.id);
        totalEpisodes += episodes.length;
        episodes.forEach(episode => {
          totalSize += episode.size || 0;
        });
      });

      return {
        id: serie.id,
        name: serie.name,
        seasons: seasons.length,
        episodes: totalEpisodes,
        totalSize,
        dateAdded: serie.dateAdded
      };
    });
  }

  async handleStatus(msg) {
    if (!this.isAdmin(msg.from.id)) {
      this.bot.sendMessage(msg.chat.id, '⛔ No tienes permisos de administrador.');
      return;
    }

    // Limpiar intervalo existente si hay uno
    if (this.statusIntervals.has(msg.chat.id)) {
      clearInterval(this.statusIntervals.get(msg.chat.id));
    }

    // Enviar estado inicial
    const statusMessage = await this.sendStatusUpdate(msg.chat.id);

    // Configurar actualización automática
    const interval = setInterval(async () => {
      try {
        await this.updateStatusMessage(msg.chat.id, statusMessage.message_id);
      } catch (error) {
        console.error('Error updating status:', error);
        clearInterval(interval);
        this.statusIntervals.delete(msg.chat.id);
      }
    }, 5000);

    this.statusIntervals.set(msg.chat.id, interval);
  }

  async sendStatusUpdate(chatId) {
    const downloads = this.downloadHandler.getActiveDownloads();
    const message = await this.createStatusMessage(downloads);
    return await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }

  async updateStatusMessage(chatId, messageId) {
    const downloads = this.downloadHandler.getActiveDownloads();
    const message = await this.createStatusMessage(downloads);
    
    try {
      await this.bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      });
    } catch (error) {
      if (!error.message?.includes('message is not modified')) {
        throw error;
      }
    }
  }

  async createStatusMessage(downloads) {
    const [cpu, mem, currentLoad, fsSize] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.currentLoad(),
      si.fsSize()
    ]);

    let message = '🖥 *Estado del Sistema*\n\n';
    
    // Sistema
    message += '*Sistema:*\n';
    message += `CPU: ${currentLoad.currentLoad.toFixed(1)}%\n`;
    message += `RAM: ${formatBytes(mem.used)} / ${formatBytes(mem.total)}\n`;
    message += `Disco: ${formatBytes(fsSize[0].used)} / ${formatBytes(fsSize[0].size)}\n\n`;

    // Descargas
    message += `📥 *Descargas activas:* ${downloads.length}\n\n`;
    if (downloads.length > 0) {
      downloads.forEach((download, index) => {
        message += `${index + 1}. ${download.name}\n`;
        message += `   ▫️ Progreso: ${download.progress}%\n`;
        message += `   ▫️ Velocidad: ${formatBytes(download.speed)}/s\n`;
        message += `   ▫️ Tamaño: ${formatBytes(download.downloadedSize)} / ${formatBytes(download.totalSize)}\n\n`;
      });
    }

    return message;
  }

  async handleDetailedStatus(msg) {
    if (!this.isAdmin(msg.from.id)) {
      this.bot.sendMessage(msg.chat.id, '⛔ No tienes permisos de administrador.');
      return;
    }

    // Similar a handleStatus pero con actualización automática
    if (this.statusIntervals.has(msg.chat.id)) {
      clearInterval(this.statusIntervals.get(msg.chat.id));
    }

    const statusMessage = await this.sendDetailedStatusUpdate(msg.chat.id);

    const interval = setInterval(async () => {
      try {
        await this.updateDetailedStatusMessage(msg.chat.id, statusMessage.message_id);
      } catch (error) {
        console.error('Error updating detailed status:', error);
        clearInterval(interval);
        this.statusIntervals.delete(msg.chat.id);
      }
    }, 5000);

    this.statusIntervals.set(msg.chat.id, interval);
  }

  async sendDetailedStatusUpdate(chatId) {
    const message = await this.createDetailedStatusMessage();
    return await this.bot.sendMessage(chatId, message, { 
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  }

  async updateDetailedStatusMessage(chatId, messageId) {
    const message = await this.createDetailedStatusMessage();
    
    try {
      await this.bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
    } catch (error) {
      if (!error.message?.includes('message is not modified')) {
        throw error;
      }
    }
  }

  async createDetailedStatusMessage() {
    const [cpu, mem, currentLoad, fsSize] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.currentLoad(),
      si.fsSize()
    ]);

    const downloads = this.downloadHandler.getActiveDownloads();
    const stats = this.movieDataManager.getStats();
    
    let message = '🖥 *Estado Detallado del Sistema*\n\n';
    
    // Sistema
    message += '*Sistema:*\n';
    message += `CPU: ${cpu.manufacturer} ${cpu.brand}\n`;
    message += `Cores: ${cpu.cores} (${cpu.physicalCores} físicos)\n`;
    message += `Uso CPU: ${currentLoad.currentLoad.toFixed(1)}%\n`;
    message += `RAM: ${formatBytes(mem.used)} / ${formatBytes(mem.total)}\n`;
    message += `Disco: ${formatBytes(fsSize[0].used)} / ${formatBytes(fsSize[0].size)}\n\n`;

    // Descargas
    message += '*Descargas Activas:*\n';
    if (downloads.length === 0) {
      message += 'No hay descargas activas\n';
    } else {
      downloads.forEach((download, index) => {
        message += `${index + 1}. ${download.name}\n`;
        message += `   ▫️ Progreso: ${download.progress}%\n`;
        message += `   ▫️ Velocidad: ${formatBytes(download.speed)}/s\n`;
        message += `   ▫️ Tamaño: ${formatBytes(download.downloadedSize)} / ${formatBytes(download.totalSize)}\n`;
        if (download.error) message += `   ▫️ Error: ${download.error}\n`;
        message += '\n';
      });
    }

    // Estadísticas
    message += '*Estadísticas:*\n';
    message += `📽 Total Películas: ${stats.totalMovies}\n`;
    message += `📺 Total Series: ${stats.totalSeries}\n`;
    message += `💾 Espacio Total: ${formatBytes(stats.totalSize)}\n`;

    return message;
  }
}

module.exports = AdminHandler;