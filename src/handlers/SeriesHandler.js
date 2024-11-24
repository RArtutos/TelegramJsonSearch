const axios = require('axios');

class SeriesHandler {
  constructor(bot, movieDataManager) {
    this.bot = bot;
    this.movieDataManager = movieDataManager;
    this.ITEMS_PER_PAGE = 5;
    this.userStates = new Map();
  }

  async handleSearch(chatId, searchQuery) {
    if (searchQuery.length < 2) {
      await this.bot.sendMessage(chatId, '⚠️ Por favor, proporciona un término de búsqueda más largo.');
      return;
    }

    try {
      const results = await this.movieDataManager.searchContent(searchQuery, 'series');
      
      if (results.length === 0) {
        await this.bot.sendMessage(chatId, '❌ No se encontraron series.');
        return;
      }

      this.userStates.set(chatId, {
        results,
        page: 0,
        totalPages: Math.ceil(results.length / this.ITEMS_PER_PAGE),
        navigationStack: []
      });

      await this.sendResultsPage(chatId);
    } catch (error) {
      console.error('Error searching series:', error);
      await this.bot.sendMessage(chatId, '❌ Error al buscar series. Intenta de nuevo.');
    }
  }

  async sendResultsPage(chatId) {
    const state = this.userStates.get(chatId);
    if (!state) return;

    const start = state.page * this.ITEMS_PER_PAGE;
    const end = Math.min(start + this.ITEMS_PER_PAGE, state.results.length);
    const currentResults = state.results.slice(start, end);

    const keyboard = currentResults.map(result => {
      const icon = result.hasLocal ? '📺' : '🔍';
      const title = result.title || result.name;
      const status = result.hasLocal ? ' (Disponible)' : ' (Info)';
      return [{
        text: `${icon} ${title}${status}`,
        callback_data: `series_${result.id || result.tmdbId}`
      }];
    });

    if (state.page > 0 || state.page < state.totalPages - 1) {
      const navButtons = [];
      if (state.page > 0) {
        navButtons.push({ text: '⬅️ Anterior', callback_data: 'prev_series' });
      }
      if (state.page < state.totalPages - 1) {
        navButtons.push({ text: 'Siguiente ➡️', callback_data: 'next_series' });
      }
      keyboard.push(navButtons);
    }

    const message = `📺 Series (${start + 1}-${end} de ${state.results.length})\n` +
                   `📄 Página ${state.page + 1} de ${state.totalPages}`;

    try {
      await this.bot.sendMessage(chatId, message, {
        reply_markup: { inline_keyboard: keyboard }
      });
    } catch (error) {
      console.error('Error sending results page:', error);
    }
  }

  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    try {
      if (data === 'prev_series' || data === 'next_series') {
        await this.handlePageNavigation(chatId, messageId, data);
      } else if (data.startsWith('series_')) {
        await this.handleSeriesSelection(chatId, data);
      } else if (data.startsWith('season_')) {
        await this.handleSeasonSelection(chatId, data);
      } else if (data.startsWith('episode_')) {
        await this.handleEpisodeSelection(chatId, data);
      }
    } catch (error) {
      console.error('Error handling series callback:', error);
      await this.bot.sendMessage(chatId, '❌ Error al procesar la selección.');
    }
  }

  async handlePageNavigation(chatId, messageId, action) {
    const state = this.userStates.get(chatId);
    if (!state) return;

    state.page += action === 'prev_series' ? -1 : 1;
    
    try {
      await this.bot.deleteMessage(chatId, messageId);
      await this.sendResultsPage(chatId);
    } catch (error) {
      console.error('Error in series page navigation:', error);
    }
  }

  async handleSeriesSelection(chatId, data) {
    const seriesId = data.split('_')[1];
    const state = this.userStates.get(chatId);
    const series = state?.results.find(s => (s.id || s.tmdbId) === seriesId);
    
    if (!series) {
      await this.bot.sendMessage(chatId, '❌ Serie no encontrada.');
      return;
    }

    if (series.hasLocal) {
      const seasons = this.movieDataManager.getSeasons(series.id);
      if (seasons.length === 0) {
        await this.bot.sendMessage(chatId, '❌ No hay temporadas disponibles.');
        return;
      }

      const keyboard = seasons.map(season => [{
        text: `📺 ${season.name}`,
        callback_data: `season_${season.id}`
      }]);

      const message = `📺 *${series.title || series.name}*\n` +
                     `${series.tmdbInfo?.overview ? `📝 ${series.tmdbInfo.overview}\n\n` : ''}` +
                     `Selecciona una temporada:`;

      await this.bot.sendMessage(chatId, message, {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'Markdown'
      });
    } else {
      const message = `📺 *${series.title}*\n` +
                     `${series.overview ? `📝 ${series.overview}\n\n` : ''}` +
                     `⚠️ Esta serie no está disponible actualmente.`;
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown'
      });
    }
  }

  async handleSeasonSelection(chatId, data) {
    const seasonId = data.split('_')[1];
    const episodes = this.movieDataManager.getEpisodes(seasonId);
    
    if (episodes.length === 0) {
      await this.bot.sendMessage(chatId, '❌ No hay episodios disponibles.');
      return;
    }

    const keyboard = episodes.map(episode => [{
      text: `📺 ${episode.name}`,
      callback_data: `episode_${episode.id}`
    }]);

    await this.bot.sendMessage(chatId, 'Selecciona un episodio:', {
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  async handleEpisodeSelection(chatId, data) {
    const episodeId = data.split('_')[1];
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

  getUserState(chatId) {
    return this.userStates.get(chatId);
  }

  updateUserState(chatId, newState) {
    this.userStates.set(chatId, newState);
  }
}

module.exports = SeriesHandler;