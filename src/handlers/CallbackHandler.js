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
      } else if (data.startsWith('select_movie_')) {
        await this.handleMovieSelection(chatId, data);
      } else if (data.startsWith('select_series_')) {
        await this.handleSeriesSelection(chatId, data);
      } else if (data.startsWith('select_season_')) {
        await this.handleSeasonSelection(chatId, data);
      } else if (data.startsWith('select_episode_')) {
        await this.handleEpisodeSelection(chatId, data);
      } else if (data.startsWith('download_')) {
        await this.handleDownload(chatId, data);
      }
    } catch (error) {
      console.error('Error handling callback:', error);
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
    const movieId = data.split('_')[2];
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
                     `${movie.overview ? `📝 ${movie.overview}\n\n` : ''}` +
                     `Selecciona la calidad de descarga:`;
      
      await this.bot.sendMessage(chatId, message, {
        reply_markup: { inline_keyboard: [buttons] },
        parse_mode: 'Markdown'
      });
    }
  }

  async handleSeriesSelection(chatId, data) {
    const seriesId = data.split('_')[2];
    const seasons = this.movieDataManager.getSeasons(seriesId);
    const series = this.movieDataManager.findSeriesById(seriesId);
    
    if (seasons.length > 0) {
      const keyboard = seasons.map(season => [{
        text: `📺 ${season.name}`,
        callback_data: `select_season_${season.id}`
      }]);

      const message = `📺 *${series.name}*\n` +
                     `${series.overview ? `📝 ${series.overview}\n\n` : ''}` +
                     `Selecciona una temporada:`;

      await this.bot.sendMessage(chatId, message, {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'Markdown'
      });
    }
  }

  async handleSeasonSelection(chatId, data) {
    const seasonId = data.split('_')[2];
    const episodes = this.movieDataManager.getEpisodes(seasonId);
    const season = this.movieDataManager.findSeasonById(seasonId);
    
    if (episodes.length > 0) {
      const keyboard = episodes.map(episode => [{
        text: `📺 ${episode.name}`,
        callback_data: `select_episode_${episode.id}`
      }]);

      await this.bot.sendMessage(chatId, `🎬 ${season.name}\nSelecciona un episodio:`, {
        reply_markup: { inline_keyboard: keyboard }
      });
    }
  }

  async handleEpisodeSelection(chatId, data) {
    const episodeId = data.split('_')[2];
    const qualities = [
      { label: '🎬 1080p HD', itag: '37' },
      { label: '🎥 720p HD', itag: '22' },
      { label: '📱 360p SD', itag: '18' }
    ];

    const buttons = qualities.map(quality => ({
      text: quality.label,
      callback_data: `download_${episodeId}_${quality.itag}`
    }));

    await this.bot.sendMessage(chatId, '📊 Selecciona la calidad:', {
      reply_markup: { inline_keyboard: [buttons] }
    });
  }

  async handleDownload(chatId, data) {
    const [_, id, itag] = data.split('_');
    await this.downloadHandler.downloadAndSendVideo(chatId, id, itag);
  }
}

module.exports = CallbackHandler;