const ChunkDownloader = require('../utils/ChunkDownloader');
const { formatBytes, formatTime, createProgressBar } = require('../utils/formatters');

class DownloadHandler {
  constructor(bot) {
    this.bot = bot;
    this.CHUNK_SIZE = 10 * 1024 * 1024;
    this.MAX_PARALLEL_DOWNLOADS = 8;
    this.UPDATE_INTERVAL = 1000;
    this.progressMessages = new Map();
  }

  async downloadAndSendVideo(chatId, id, itag) {
    const statusMessage = await this.bot.sendMessage(chatId, '🔄 Iniciando descarga...');
    let updateInterval;

    try {
      const downloadUrl = `https://pelis.gbstream.us.kg/api/v1/redirectdownload/${id}?a=0&id=${id}&itag=${itag}`;
      
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
      });

      updateInterval = setInterval(() => {
        this.updateProgressMessage(chatId, statusMessage.message_id, state);
      }, this.UPDATE_INTERVAL);

      const { stream, totalSize } = await downloader.start();

      state.phase = 'upload';
      state.startTime = Date.now();
      state.downloadedBytes = 0;
      state.totalSize = totalSize;

      const { PassThrough } = require('stream');
      const uploadStream = new PassThrough();
      let uploadedBytes = 0;

      stream.pipe(uploadStream);

      uploadStream.on('data', (chunk) => {
        uploadedBytes += chunk.length;
        state.downloadedBytes = uploadedBytes;
      });

      await this.bot.sendVideo(chatId, uploadStream, {
        caption: `🎬 ${id}`,
        supports_streaming: true,
        duration: 0,
        width: itag === '37' ? 1920 : (itag === '22' ? 1280 : 640),
        height: itag === '37' ? 1080 : (itag === '22' ? 720 : 360)
      });

      clearInterval(updateInterval);
      await this.bot.editMessageText('✅ Video enviado exitosamente!', {
        chat_id: chatId,
        message_id: statusMessage.message_id
      });

      setTimeout(() => {
        this.bot.deleteMessage(chatId, statusMessage.message_id).catch(() => {});
      }, 5000);

    } catch (error) {
      clearInterval(updateInterval);
      console.error('Error in download process:', error);
      await this.bot.editMessageText(`❌ Error: ${error.message || 'Error desconocido'}`, {
        chat_id: chatId,
        message_id: statusMessage.message_id
      });
    }
  }

  async updateProgressMessage(chatId, messageId, state) {
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

      let message = `${state.phase === 'download' ? '📥 Descargando' : '📤 Subiendo'}...\n\n` +
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