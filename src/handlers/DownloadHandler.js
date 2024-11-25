const ChunkDownloader = require('../utils/ChunkDownloader');
const { formatBytes, formatTime, createProgressBar } = require('../utils/formatters');
const TelegramChannelManager = require('../services/TelegramChannelManager');
const { PassThrough } = require('stream');
const axios = require('axios');

class DownloadHandler {
  constructor(bot, movieDataManager) {
    this.bot = bot;
    this.movieDataManager = movieDataManager;
    this.channelManager = new TelegramChannelManager(bot);
    this.CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
    this.MAX_PARALLEL_DOWNLOADS = 8;
    this.UPDATE_INTERVAL = 1000;
    this.MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024 - 80 * 1024 * 1024; // 1.92GB
    this.progressMessages = new Map();
    this.activeDownloads = new Map();
    this.userDownloads = new Map();
    this.ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id)) : [];
    this.downloadHandlers = new Map();
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
    let updateInterval;
    let downloader;
    let isCancelled = false;
    let cancelHandler;
    let statusMessage;

    try {
      if (!this.canUserDownload(userId)) {
        await this.bot.sendMessage(chatId, '⚠️ Ya tienes una descarga activa. Espera a que termine.');
        return;
      }

      let contentInfo;
      let contentName;
      let fileId;
      let fileSize;

      try {
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

        if (!contentInfo) {
          await this.bot.sendMessage(chatId, '❌ No se encontró el contenido solicitado.');
          return;
        }
      } catch (error) {
        console.error('Error getting content info:', error);
        await this.bot.sendMessage(chatId, '❌ Error al obtener información del contenido.');
        return;
      }

      // Verificar tamaño antes de iniciar cualquier descarga
      if (fileSize > this.MAX_FILE_SIZE) {
        await this.bot.sendMessage(
          chatId, 
          `⚠️ El archivo es demasiado grande (${formatBytes(fileSize)}). El límite es ${formatBytes(this.MAX_FILE_SIZE)}. Por favor, selecciona una calidad menor.`
        );
        return;
      }

      const videoIdentifier = `${fileId}:${itag}`;
      
      try {
        const existingVideo = await this.channelManager.findExistingVideo(videoIdentifier);
        if (existingVideo) {
          await this.bot.sendMessage(chatId, '🔄 Reenviando video desde la caché...');
          await this.bot.forwardMessage(chatId, existingVideo.channelId, existingVideo.messageId);
          return;
        }
      } catch (error) {
        console.error('Error checking cache:', error);
        // Continuar con la descarga si hay error al verificar caché
      }

      statusMessage = await this.bot.sendMessage(chatId, '🔄 Iniciando descarga...');

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

      // Agregar botón de cancelar
      const cancelKeyboard = {
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Cancelar Descarga', callback_data: `cancel_${contentId}` }
          ]]
        }
      };

      await this.bot.editMessageText('🔄 Iniciando descarga...', {
        chat_id: chatId,
        message_id: statusMessage.message_id,
        ...cancelKeyboard
      });

      // Manejador de cancelación
      cancelHandler = async (query) => {
        if (query.data === `cancel_${contentId}`) {
          isCancelled = true;
          if (downloader) {
            downloader.abort();
          }
          await this.bot.answerCallbackQuery(query.id, { text: 'Descarga cancelada' });
          await this.bot.editMessageText('❌ Descarga cancelada por el usuario', {
            chat_id: chatId,
            message_id: statusMessage.message_id
          });
          clearInterval(updateInterval);
          this.activeDownloads.delete(contentId);
          this.userDownloads.delete(userId);
          this.bot.removeListener('callback_query', cancelHandler);
        }
      };

      this.bot.on('callback_query', cancelHandler);

      try {
        const downloadUrl = `https://pelis.gbstream.us.kg/api/v1/redirectdownload/${encodeURIComponent(fileId)}?a=0&id=${fileId}&itag=${itag}`;
        
        // Verificar tamaño real antes de descargar
        const headResponse = await axios.head(downloadUrl);
        const actualSize = parseInt(headResponse.headers['content-length'], 10);
        
        if (actualSize > this.MAX_FILE_SIZE) {
          await this.bot.editMessageText(
            `⚠️ El archivo es demasiado grande (${formatBytes(actualSize)}). El límite es ${formatBytes(this.MAX_FILE_SIZE)}. Por favor, selecciona una calidad menor.`,
            {
              chat_id: chatId,
              message_id: statusMessage.message_id
            }
          );
          this.activeDownloads.delete(contentId);
          this.userDownloads.delete(userId);
          return;
        }
        
        const state = {
          startTime: Date.now(),
          downloadedBytes: 0,
          totalSize: 0,
          activeChunks: 0,
          phase: 'download',
          status: 'Iniciando descarga',
          speed: 0,
          lastUpdate: Date.now(),
          lastBytes: 0
        };

        downloader = new ChunkDownloader(downloadUrl, this.CHUNK_SIZE, this.MAX_PARALLEL_DOWNLOADS);
        
        downloader.on('progress', (progress) => {
          if (isCancelled) return;

          const now = Date.now();
          const timeDiff = (now - state.lastUpdate) / 1000;
          const bytesDiff = progress.downloadedBytes - state.lastBytes;
          
          state.downloadedBytes = progress.downloadedBytes;
          state.totalSize = progress.totalSize;
          state.activeChunks = progress.activeChunks;
          state.speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
          state.status = 'Descargando chunks';
          state.lastUpdate = now;
          state.lastBytes = progress.downloadedBytes;

          downloadInfo.progress = Math.round((progress.downloadedBytes / progress.totalSize) * 100);
          downloadInfo.speed = state.speed;
          downloadInfo.downloadedSize = progress.downloadedBytes;
          downloadInfo.totalSize = progress.totalSize;
          this.activeDownloads.set(contentId, downloadInfo);
        });

        updateInterval = setInterval(() => {
          if (!isCancelled) {
            this.updateProgressMessage(chatId, statusMessage.message_id, state, contentName, cancelKeyboard);
          }
        }, this.UPDATE_INTERVAL);

        const { stream, totalSize } = await downloader.start();

        if (isCancelled) {
          throw new Error('Descarga cancelada por el usuario');
        }

        if (!stream || totalSize === 0) {
          throw new Error('No se pudo iniciar la descarga. Por favor, intenta con otra calidad.');
        }

        state.phase = 'upload';
        state.startTime = Date.now();
        state.downloadedBytes = 0;
        state.totalSize = totalSize;
        state.status = 'Subiendo a Telegram';
        state.lastUpdate = Date.now();
        state.lastBytes = 0;
        downloadInfo.status = 'uploading';

        const uploadStream = new PassThrough();
        let uploadedBytes = 0;

        stream.pipe(uploadStream);

        uploadStream.on('data', (chunk) => {
          if (isCancelled) return;
          
          const now = Date.now();
          const timeDiff = (now - state.lastUpdate) / 1000;
          uploadedBytes += chunk.length;
          
          state.downloadedBytes = uploadedBytes;
          state.speed = timeDiff > 0 ? (uploadedBytes - state.lastBytes) / timeDiff : 0;
          state.lastUpdate = now;
          state.lastBytes = uploadedBytes;
          
          downloadInfo.downloadedSize = uploadedBytes;
          downloadInfo.speed = state.speed;
          this.activeDownloads.set(contentId, downloadInfo);
        });

        const channelResult = await this.channelManager.uploadToChannel(uploadStream, {
          caption: `🎬 ${contentName} [${videoIdentifier}]`,
          supports_streaming: true,
          duration: 0,
          width: itag === '37' ? 1920 : (itag === '22' ? 1280 : 640),
          height: itag === '37' ? 1080 : (itag === '22' ? 720 : 360)
        });

        if (!channelResult) {
          throw new Error('Error al subir al canal. Por favor, intenta de nuevo.');
        }

        await this.bot.forwardMessage(chatId, channelResult.channelId, channelResult.messageId);

        downloadInfo.status = 'completed';
        this.activeDownloads.set(contentId, downloadInfo);

        clearInterval(updateInterval);
        if (cancelHandler) {
          this.bot.removeListener('callback_query', cancelHandler);
        }
        
        await this.bot.editMessageText('✅ Video enviado exitosamente!', {
          chat_id: chatId,
          message_id: statusMessage.message_id
        });

        setTimeout(() => {
          this.bot.deleteMessage(chatId, statusMessage.message_id).catch(() => {});
          this.activeDownloads.delete(contentId);
          this.userDownloads.delete(userId);
        }, 5000);

      } catch (error) {
        throw error; // Propagar el error al manejador principal
      }

    } catch (error) {
      console.error('Error in download process:', error);
      
      if (updateInterval) {
        clearInterval(updateInterval);
      }
      
      if (downloader) {
        try {
          downloader.abort();
        } catch (abortError) {
          console.error('Error aborting download:', abortError);
        }
      }
      
      if (cancelHandler) {
        this.bot.removeListener('callback_query', cancelHandler);
      }
      
      const downloadInfo = this.activeDownloads.get(contentId);
      if (downloadInfo) {
        downloadInfo.status = 'error';
        downloadInfo.error = error.message;
        this.activeDownloads.set(contentId, downloadInfo);
      }

      const errorMessage = error.message.includes('Error al subir') || 
                          error.message.includes('No se pudo iniciar') ||
                          error.message.includes('Descarga cancelada') ||
                          error.message.includes('demasiado grande') ?
                          error.message :
                          'Error desconocido. Por favor, intenta con otra calidad.';

      // Enviar mensaje de error al usuario
      await this.bot.sendMessage(chatId, `❌ Error: ${errorMessage}`);

      setTimeout(() => {
        this.activeDownloads.delete(contentId);
        this.userDownloads.delete(userId);
      }, 30000);
    }
  }

  async updateProgressMessage(chatId, messageId, state, contentName, keyboard) {
    try {
      const now = Date.now();
      const elapsed = (now - state.startTime) / 1000;
      const speed = state.speed || 0;
      const progress = (state.downloadedBytes / state.totalSize) * 100 || 0;
      const remaining = speed > 0 ? (state.totalSize - state.downloadedBytes) / speed : 0;

      const progressBar = createProgressBar(progress);
      const speedText = formatBytes(speed) + '/s';
      const downloadedText = `${formatBytes(state.downloadedBytes)} / ${formatBytes(state.totalSize)}`;
      const timeText = `⏱ ${formatTime(remaining)} restantes`;
      const elapsedText = `⏳ ${formatTime(elapsed)} transcurridos`;

      let message = `${state.phase === 'download' ? '📥' : '📤'} ${state.status}\n` +
                   `🎬 ${contentName}\n\n` +
                   `${progressBar} ${progress.toFixed(1)}%\n\n` +
                   `⚡ Velocidad: ${speedText}\n` +
                   `📦 Progreso: ${downloadedText}\n` +
                   `${timeText}\n${elapsedText}`;

      if (state.phase === 'download') {
        message += `\n🔄 Chunks activos: ${state.activeChunks}/${this.MAX_PARALLEL_DOWNLOADS}`;
      }

      const lastMessage = this.progressMessages.get(chatId);
      if (!lastMessage || lastMessage.text !== message) {
        await this.bot.editMessageText(message, {
          chat_id: chatId,
          message_id: messageId,
          ...keyboard
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