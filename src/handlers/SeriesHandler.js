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
      this.bot.sendMessage(chatId, '⚠️ Por favor, proporciona un término de búsqueda más largo.');
      return;
    }

    try {
      const tmdbResults = await this.searchTMDB(searchQuery);
      if (tmdbResults.length === 0) {
        this.bot.sendMessage(chatId, '❌ No se encontraron resultados en TMDB.');
        return;
      }

      const localResults = [];
      for (const tmdbItem of tmdbResults) {
        const localItems = this.findInLocalData(tmdbItem.name);
        if (localItems.length > 0) {
          localResults.push(...localItems.map(item => ({
            ...item,
            tmdbInfo: tmdbItem
          })));
        }
      }

      if (localResults.length === 0) {
        this.bot.sendMessage(chatId, '❌ No se encontraron series disponibles.');
        return;
      }

      this.userStates.set(chatId, {
        results: localResults,
        page: 0,
        totalPages: Math.ceil(localResults.length / this.ITEMS_PER_PAGE)
      });

      this.sendResultsPage(chatId);
    } catch (error) {
      console.error('Error searching series:', error);
      this.bot.sendMessage(chatId, '❌ Error al buscar series. Intenta de nuevo.');
    }
  }

  async searchTMDB(query) {
    const response = await axios.get('https://api.themoviedb.org/3/search/tv', {
      params: {
        api_key: process.env.TMDB_API_KEY,
        query,
        language: 'es-MX'
      }
    });
    return response.data.results;
  }

  findInLocalData(tmdbTitle) {
    const items = [];
    for (const category of this.movieDataManager.seriesData) {
      if (category.children) {
        for (const series of category.children) {
          if (series.title?.toLowerCase() === tmdbTitle.toLowerCase() || 
              series.name?.toLowerCase() === tmdbTitle.toLowerCase()) {
            items.push({
              ...series,
              seasons: this.movieDataManager.getSeasons(series.id)
            });
          }
        }
      }
    }
    return items;
  }

  sendResultsPage(chatId) {
    const state = this.userStates.get(chatId);
    if (!state) return;

    const start = state.page * this.ITEMS_PER_PAGE;
    const end = Math.min(start + this.ITEMS_PER_PAGE, state.results.length);
    const currentResults = state.results.slice(start, end);

    const keyboard = currentResults.map(result => [{
      text: `📺 ${result.name}`,
      callback_data: `series_${result.id}`
    }]);

    const navButtons = [];
    if (state.page > 0) {
      navButtons.push({ text: '⬅️ Anterior', callback_data: 'prev_series' });
    }
    if (state.page < state.totalPages - 1) {
      navButtons.push({ text: 'Siguiente ➡️', callback_data: 'next_series' });
    }
    
    if (navButtons.length > 0) {
      keyboard.push(navButtons);
    }

    const message = `📺 Series (${start + 1}-${end} de ${state.results.length})\n` +
                   `📄 Página ${state.page + 1} de ${state.totalPages}`;

    this.bot.sendMessage(chatId, message, {
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    if (data.startsWith('prev_series') || data.startsWith('next_series')) {
      await this.handlePageNavigation(chatId, messageId, data);
    } else if (data.startsWith('series_')) {
      await this.handleSeriesSelection(chatId, data);
    } else if (data.startsWith('season_')) {
      await this.handleSeasonSelection(chatId, data);
    } else if (data.startsWith('episode_')) {
      await this.handleEpisodeSelection(chatId, data);
    }
  }

  async handlePageNavigation(chatId, messageId, action) {
    const state = this.userStates.get(chatId);
    if (!state) return;

    state.page += action === 'prev_series' ? -1 : 1;
    
    try {
      await this.bot.deleteMessage(chatId, messageId);
      this.sendResultsPage(chatId);
    } catch (error) {
      console.error('Error in series page navigation:', error);
    }
  }

  async handleSeriesSelection(chatId, data) {
    const seriesId = data.split('_')[1];
    const series = this.movieDataManager.findSeriesById(seriesId);
    
    if (series) {
      const seasons = this.movieDataManager.getSeasons(seriesId);
      const keyboard = seasons.map(season => [{
        text: `📺 ${season.name}`,
        callback_data: `season_${season.id}`
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
    const seasonId = data.split('_')[1];
    const season = this.movieDataManager.findSeasonById(seasonId);
    const episodes = this.movieDataManager.getEpisodes(seasonId);
    
    if (episodes.length > 0) {
      const keyboard = episodes.map(episode => [{
        text: `📺 ${episode.name}`,
        callback_data: `episode_${episode.id}`
      }]);

      await this.bot.sendMessage(chatId, `🎬 ${season.name}\nSelecciona un episodio:`, {
        reply_markup: { inline_keyboard: keyboard }
      });
    }
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
}

module.exports = SeriesHandler;