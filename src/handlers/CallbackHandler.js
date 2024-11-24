class CallbackHandler {
  constructor(bot, movieDataManager, searchHandler, downloadHandler) {
    this.bot = bot;
    this.movieDataManager = movieDataManager;
    this.searchHandler = searchHandler;
    this.downloadHandler = downloadHandler;
  }

  async handle(query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    try {
      await this.bot.answerCallbackQuery(query.id);

      if (data === 'prev_page' || data === 'next_page') {
        await this.handlePageNavigation(chatId, messageId, data);
      } else if (data.startsWith('select_')) {
        await this.handleMovieSelection(chatId, data);
      } else if (data.startsWith('download_')) {
        await this.handleDownload(chatId, data);
      }
    } catch (error) {
      console.error('Error handling callback query:', error);
      this.bot.sendMessage(chatId, '❌ Ocurrió un error. Por favor, intenta de nuevo.');
    }
  }

  async handlePageNavigation(chatId, messageId, action) {
    const state = this.searchHandler.getUserState(chatId);
    if (!state) return;

    state.page += action === 'prev_page' ? -1 : 1;
    
    try {
      await this.bot.deleteMessage(chatId, messageId);
      this.searchHandler.sendResultsPage(chatId);
    } catch (error) {
      console.error('Error in page navigation:', error);
    }
  }

  async handleMovieSelection(chatId, data) {
    const movieId = data.split('_')[1];
    const movie = this.movieDataManager.getMovieById(movieId);
    
    if (movie) {
      const qualities = [
        { label: '🎬 1080p HD', itag: '37' },
        { label: '🎥 720p HD', itag: '22' },
        { label: '📱 360p SD', itag: '18' }
      ];

      const buttons = qualities.map(quality => ({
        text: quality.label,
        callback_data: `download_${movie.id}_${quality.itag}`
      }));

      const message = `🎬 *${movie.name}*\n` +
                     `📁 _${movie.categoryName}_\n\n` +
                     `Selecciona la calidad de descarga:`;
      
      await this.bot.sendMessage(chatId, message, {
        reply_markup: { inline_keyboard: [buttons] },
        parse_mode: 'Markdown'
      });
    }
  }

  async handleDownload(chatId, data) {
    const [_, movieId, itag] = data.split('_');
    const movie = this.movieDataManager.getMovieById(movieId);
    
    if (movie) {
      await this.downloadHandler.downloadAndSendVideo(chatId, movieId, itag, movie.name);
    }
  }
}

module.exports = CallbackHandler;