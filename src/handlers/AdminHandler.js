const si = require('systeminformation');
const { Parser } = require('json2csv');
const { formatBytes } = require('../utils/formatters');

class AdminHandler {
  constructor(bot, movieDataManager, downloadHandler) {
    this.bot = bot;
    this.movieDataManager = movieDataManager;
    this.downloadHandler = downloadHandler;
    this.ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id)) : [];
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
      const data = type.toLowerCase() === 'movies' ? 
        this.movieDataManager.getAllMovies() : 
        this.movieDataManager.getAllSeries();

      const fields = ['id', 'name', 'size', 'quality', 'dateAdded'];
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

  async handleStatus(msg) {
    if (!this.isAdmin(msg.from.id)) {
      this.bot.sendMessage(msg.chat.id, '⛔ No tienes permisos de administrador.');
      return;
    }

    const downloads = this.downloadHandler.getActiveDownloads();
    const downloadCount = downloads.length;
    
    let message = '📊 *Estado del Sistema*\n\n';
    message += `📥 Descargas activas: ${downloadCount}\n\n`;

    if (downloadCount > 0) {
      message += '*Descargas en curso:*\n';
      downloads.forEach((download, index) => {
        message += `${index + 1}. ${download.name} - ${download.progress}%\n`;
      });
    }

    this.bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
  }

  async handleDetailedStatus(msg) {
    if (!this.isAdmin(msg.from.id)) {
      this.bot.sendMessage(msg.chat.id, '⛔ No tienes permisos de administrador.');
      return;
    }

    try {
      const [cpu, mem, currentLoad, fsSize] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.currentLoad(),
        si.fsSize()
      ]);

      const downloads = this.downloadHandler.getActiveDownloads();
      
      let message = '🖥 *Estado Detallado del Sistema*\n\n';
      
      // Sistema
      message += '*Sistema:*\n';
      message += `CPU: ${cpu.manufacturer} ${cpu.brand}\n`;
      message += `Cores: ${cpu.cores} (${cpu.physicalCores} físicos)\n`;
      message += `Uso CPU: ${currentLoad.currentLoad.toFixed(1)}%\n`;
      message += `RAM: ${formatBytes(mem.used)} / ${formatBytes(mem.total)} (${((mem.used/mem.total)*100).toFixed(1)}%)\n`;
      message += `Disco: ${formatBytes(fsSize[0].used)} / ${formatBytes(fsSize[0].size)} (${fsSize[0].use}%)\n\n`;

      // Descargas
      message += '*Descargas Activas:*\n';
      if (downloads.length === 0) {
        message += 'No hay descargas activas\n';
      } else {
        downloads.forEach((download, index) => {
          message += `${index + 1}. ${download.name}\n`;
          message += `   Progress: ${download.progress}%\n`;
          message += `   Speed: ${formatBytes(download.speed)}/s\n`;
          message += `   Size: ${formatBytes(download.downloadedSize)} / ${formatBytes(download.totalSize)}\n`;
          message += `   Status: ${download.status}\n`;
          if (download.error) message += `   Error: ${download.error}\n`;
          message += '\n';
        });
      }

      // Estadísticas
      const stats = this.movieDataManager.getStats();
      message += '*Estadísticas:*\n';
      message += `Total Películas: ${stats.totalMovies}\n`;
      message += `Total Series: ${stats.totalSeries}\n`;
      message += `Espacio Total: ${formatBytes(stats.totalSize)}\n`;

      this.bot.sendMessage(msg.chat.id, message, { 
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
    } catch (error) {
      console.error('Error getting detailed status:', error);
      this.bot.sendMessage(msg.chat.id, '❌ Error obteniendo el estado detallado.');
    }
  }
}

module.exports = AdminHandler;