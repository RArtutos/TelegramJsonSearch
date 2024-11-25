const ChunkDownloader = require('../utils/ChunkDownloader');
const { formatBytes, formatTime, createProgressBar } = require('../utils/formatters');

class DownloadHandler {
  constructor(bot, movieDataManager) {
    this.bot = bot;
    this.movieDataManager = movieDataManager;
    this.CHUNK_SIZE = 10 * 1024 * 1024;
    this.MAX_PARALLEL_DOWNLOADS = 8;
    this.UPDATE_INTERVAL = 1000;
    this.MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024 - 80 * 1024 * 1024; // 1.92GB en bytes
    this.progressMessages = new Map();
    this.activeDownloads = new Map();
    this.userDownloads = new Map();
    this.ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id)) : [];
  }

  isAdmin(userId) {
    return this.ADMIN_IDS.includes(userId);
  }

  getActiveDownloads() {
    return Array.from(this.activeDownloads.values());
  }

  canUserDownload(userId) {
    if (this.isAdmin(userId)) return true;
    return !this.userDownloads.has(userId);
  }

  async downloadAndSendVideo(chatId, contentId, itag, type = 'movie', userId) {
    // Verificar si el usuario puede descargar
    if (!this.canUserDownload(userId)) {
      await this.bot.sendMessage(chatId, '⚠️ Ya tienes una descarga activa. Espera a que termine.');
      return;
    }

    // Obtener información del contenido
    let contentInfo;
    let contentName;
    let fileId;
    let fileSize;

    if (type === 'movie') {
      contentInfo = this.movieDataManager.getMovieById(contentId);
      contentName = contentInfo?.name || contentInfo?.title;
      fileId = contentId;
      fileSize = contentInfo?.size || 0;
    } else {
      contentInfo = this.movieDataManager.getEpisodeById(contentId);
      const seriesInfo = this.movieDataManager.getSeriesInfoByEpisodeId(contentId);
      contentName = `${seriesInfo.seriesName} - ${seriesInfo.seasonName} - ${contentInfo?.name}`;
      fileId = contentId;
      fileSize = contentInfo?.size || 0;
    }

    // Verificar tamaño del archivo
    if (fileSize > this.MAX_FILE_SIZE) {
      await this.bot.sendMessage(
        chatId, 
        `⚠️ El archivo es demasiado grande (${formatBytes(fileSize)}). El límite es 1.92GB.`
      );
      return;
    }

    const statusMessage = await this.bot.sendMessage(chatId, '🔄 Iniciando descarga...');
    let updateInterval;

    const downloadInfo = {
      id: contentId,
      name: contentName,
      progress: 0,
      speed: 0,
      downloadedSize: 0,
      totalSize: 0,
      status: 'downloading',
      startTime: Date.now(),
      userId
    };

    this.activeDownloads.set(contentId, downloadInfo);
    this.userDownloads.set(userId, contentId);

    try {
      const downloadUrl = `https://pelis.gbstream.us.kg/api/v1/redirectdownload/${encodeURIComponent(fileId)}?a=0&id=${fileId}&itag=${itag}`;
      
      const state = {
        startTime: Date.now(),
        downloadedBytes: 0,
        totalSize: 0,
        activeChunks: 0,
        phase: 'download'
      };

      const downloader = new ChunkDownloader(downloadUrl, this.CHUNK_SIZE, this.MAX_PARALLEL_DOWNLOADS);
      
      downloader.on('progress', (progress) => {
        state.downloadedBytes = progress.downloadedBytes;
        state.totalSize = progress.totalSize;
        state.activeChunks = progress.activeChunks;

        const elapsed = (Date.now() - state.startTime) / 1000;
        downloadInfo.progress = Math.round((progress.downloadedBytes / progress.totalSize) * 100);
        downloadInfo.speed = progress.downloadedBytes / elapsed;
        downloadInfo.downloadedSize = progress.downloadedBytes;
        downloadInfo.totalSize = progress.totalSize;
        this.activeDownloads.set(contentId, downloadInfo);
      });

      updateInterval = setInterval(() => {
        this.updateProgressMessage(chatId, statusMessage.message_id, state, contentName);
      }, this.UPDATE_INTERVAL);

      const { stream, totalSize } = await downloader.start();

      state.phase = 'upload';
      state.startTime = Date.now();
      state.downloadedBytes = 0;
      state.totalSize = totalSize;
      downloadInfo.status = 'uploading';

      const { PassThrough } = require('stream');
      const uploadStream = new PassThrough();
      let uploadedBytes = 0;

      stream.pipe(uploadStream);

      uploadStream.on('data', (chunk) => {
        uploadedBytes += chunk.length;
        state.downloadedBytes = uploadedBytes;
        downloadInfo.downloadedSize = uploadedBytes;
        this.activeDownloads.set(contentId, downloadInfo);
      });

      await this.bot.sendVideo(chatId, uploadStream, {
        caption: `🎬 ${contentName}`,
        supports_streaming: true,
        duration: 0,
        width: itag === '37' ? 1920 : (itag === '22' ? 1280 : 640),
        height: itag === '37' ? 1080 : (itag === '22' ? 720 : 360)
      });

      downloadInfo.status = 'completed';
      this.activeDownloads.set(contentId, downloadInfo);

      clearInterval(updateInterval);
      await this.bot.editMessageText('✅ Video enviado exitosamente!', {
        chat_id: chatId,
        message_id: statusMessage.message_id
      });

      // Limpiar después de completar
      setTimeout(() => {
        this.bot.deleteMessage(chatId, statusMessage.message_id).catch(() => {});
        this.activeDownloads.delete(contentId);
        this.userDownloads.delete(userId);
      }, 5000);

    } catch (error) {
      clearInterval(updateInterval);
      console.error('Error in download process:', error);
      downloadInfo.status = 'error';
      downloadInfo.error = error.message;
      this.activeDownloads.set(contentId, downloadInfo);

      await this.bot.editMessageText(`❌ Error: ${error.message || 'Error desconocido'}`, {
        chat_id: chatId,
        message_id: statusMessage.message_id
      });

      // Limpiar después de error
      setTimeout(() => {
        this.activeDownloads.delete(contentId);
        this.userDownloads.delete(userId);
      }, 30000);
    }
  }

  async updateProgressMessage(chatId, messageId, state, contentName) {
    try {
      const now = Date.now();
      const elapsed = (now - state.startTime) / 1000;
      const speed = state.downloadedBytes / elapsed;
      const progress = (state.downloadedBytes / state.totalSize) * 100 || 0;
      const remaining = (state.totalSize - state.downloadedBytes) / speed;

      const progressBar = createProgressBar(progress);
      const speedText = formatBytes(speed) + '/s';
      const downloadedText = `${formatBytes(state.downloadedBytes)} / ${formatBytes(state.totalSize)}`;
      const timeText = `⏱ ${formatTime(remaining)} restantes`;
      const elapsedText = `⏳ ${formatTime(elapsed)} transcurridos`;

      let message = `${state.phase === 'download' ? '📥 Descargando' : '📤 Subiendo'}\n` +
                   `🎬 ${contentName}\n\n` +
                   `${progressBar} ${progress.toFixed(1)}%\n\n` +
                   `⚡ Velocidad: ${speedText}\n` +
                   `📦 Progreso: ${downloadedText}\n` +
                   `${timeText}\n${elapsedText}`;

      if (state.phase === 'download') {
        message += `\n🔄 Chunks: ${state.activeChunks}/${this.MAX_PARALLEL_DOWNLOADS}`;
      }

      const lastMessage = this.progressMessages.get(chatId);
      if (!lastMessage || lastMessage.text !== message) {
        await this.bot.editMessageText(message, {
          chat_id: chatId,
          message_id: messageId
        });
        this.progressMessages.set(chatId, { text: message, timestamp: now });
      }
    } catch (error) {
      if (!error.message?.includes('message is not modified')) {
        console.error('Error updating progress message:', error);
      }
    }
  }
}

module.exports = DownloadHandler;