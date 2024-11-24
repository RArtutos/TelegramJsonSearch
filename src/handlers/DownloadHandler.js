class DownloadHandler {
  constructor(bot, dataManager) {
    this.bot = bot;
    this.dataManager = dataManager;
  }

  async handleDownload(chatId, id, quality) {
    const statusMessage = await this.bot.sendMessage(chatId, '🔄 Preparando descarga...');

    try {
      const item = this.dataManager.getItem(id, 'movies');
      if (!item) {
        throw new Error('Contenido no encontrado');
      }

      // Simular progreso de descarga
      let progress = 0;
      const interval = setInterval(async () => {
        progress += 10;
        if (progress <= 100) {
          const message = this.createProgressMessage(progress, item.name);
          await this.bot.editMessageText(message, {
            chat_id: chatId,
            message_id: statusMessage.message_id
          });
        } else {
          clearInterval(interval);
        }
      }, 1000);

      // Simular finalización
      setTimeout(async () => {
        clearInterval(interval);
        await this.bot.editMessageText(
          `✅ Descarga completada: ${item.name}`,
          {
            chat_id: chatId,
            message_id: statusMessage.message_id
          }
        );
      }, 11000);

    } catch (error) {
      await this.bot.editMessageText(
        `❌ Error: ${error.message}`,
        {
          chat_id: chatId,
          message_id: statusMessage.message_id
        }
      );
    }
  }

  createProgressMessage(progress, fileName) {
    const bar = '▓'.repeat(Math.floor(progress/5)) + '░'.repeat(20-Math.floor(progress/5));
    return `📥 Descargando: ${fileName}\n\n${bar} ${progress}%`;
  }
}