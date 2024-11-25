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
        totalPages: Math.ceil(localResults.length / this.ITEMS_PER_PAGE),
        currentView: 'series',
        messageId: null,
        breadcrumb: [],
        selectedSeries: null,
        selectedSeason: null
      });

      await this.sendResultsPage(chatId);
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

  async sendResultsPage(chatId) {
    const state = this.userStates.get(chatId);
    if (!state) return;

    const start = state.page * this.ITEMS_PER_PAGE;
    const end = Math.min(start + this.ITEMS_PER_PAGE, state.results.length);
    const currentResults = state.results.slice(start, end);

    const keyboard = [];
    
    // Breadcrumb navigation
    if (state.breadcrumb.length > 0) {
      keyboard.push([{
        text: '⬅️ Atrás',
        callback_data: 'back_series'
      }]);
    }

    // Current view items
    switch (state.currentView) {
      case 'series':
        currentResults.forEach(result => {
          keyboard.push([{
            text: `📺 ${result.name || result.title}`,
            callback_data: `series_${result.id}`
          }]);
        });
        break;
      case 'seasons':
        const seasons = this.movieDataManager.getSeasons(state.selectedSeries);
        seasons.forEach(season => {
          keyboard.push([{
            text: `📺 ${season.name}`,
            callback_data: `season_${season.id}`
          }]);
        });
        break;
      case 'episodes':
        const episodes = this.movieDataManager.getEpisodes(state.selectedSeason);
        episodes.forEach(episode => {
          keyboard.push([{
            text: `🎬 ${episode.name}`,
            callback_data: `episode_${episode.id}`
          }]);
        });
        break;
    }

    // Pagination buttons
    if (state.currentView === 'series' && state.totalPages > 1) {
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
    }

    const message = this.createNavigationMessage(state);

    const messageOptions = {
      reply_markup: { inline_keyboard: keyboard },
      parse_mode: 'Markdown'
    };

    if (state.messageId) {
      try {
        await this.bot.editMessageText(message, {
          chat_id: chatId,
          message_id: state.messageId,
          ...messageOptions
        });
      } catch (error) {
        if (!error.message?.includes('message is not modified')) {
          console.error('Error editing message:', error);
        }
      }
    } else {
      const sentMessage = await this.bot.sendMessage(chatId, message, messageOptions);
      state.messageId = sentMessage.message_id;
      this.userStates.set(chatId, state);
    }
  }

  createNavigationMessage(state) {
    let message = '';
    
    // Add breadcrumb
    if (state.breadcrumb.length > 0) {
      message += `🔍 ${state.breadcrumb.join(' > ')}\n\n`;
    }

    // Add current view title
    switch (state.currentView) {
      case 'series':
        const start = state.page * this.ITEMS_PER_PAGE + 1;
        const end = Math.min((state.page + 1) * this.ITEMS_PER_PAGE, state.results.length);
        message += `📺 *Series* (${start}-${end} de ${state.results.length})`;
        break;
      case 'seasons':
        message += '🗂 *Temporadas*';
        break;
      case 'episodes':
        message += '📺 *Episodios*';
        break;
    }

    return message;
  }

  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const data = query.data;
    const state = this.userStates.get(chatId);

    if (!state) return;

    try {
      await this.bot.answerCallbackQuery(query.id);

      if (data === 'back_series') {
        await this.handleBack(chatId);
      } else if (data.startsWith('prev_series') || data.startsWith('next_series')) {
        await this.handlePageNavigation(chatId, data);
      } else if (data.startsWith('series_')) {
        await this.handleSeriesSelection(chatId, data);
      } else if (data.startsWith('season_')) {
        await this.handleSeasonSelection(chatId, data);
      } else if (data.startsWith('episode_')) {
        await this.handleEpisodeSelection(chatId, data);
      }
    } catch (error) {
      console.error('Error handling callback:', error);
      this.bot.sendMessage(chatId, '❌ Ocurrió un error. Por favor, intenta de nuevo.');
    }
  }

  async handleBack(chatId) {
    const state = this.userStates.get(chatId);
    if (!state || state.breadcrumb.length === 0) return;

    state.breadcrumb.pop();
    
    if (state.currentView === 'episodes') {
      state.currentView = 'seasons';
      state.selectedSeason = null;
    } else if (state.currentView === 'seasons') {
      state.currentView = 'series';
      state.selectedSeries = null;
    }

    await this.sendResultsPage(chatId);
  }

  async handlePageNavigation(chatId, action) {
    const state = this.userStates.get(chatId);
    if (!state) return;

    state.page += action === 'prev_series' ? -1 : 1;
    await this.sendResultsPage(chatId);
  }

  async handleSeriesSelection(chatId, data) {
    const state = this.userStates.get(chatId);
    if (!state) return;

    const seriesId = data.split('_')[1];
    const series = this.movieDataManager.findSeriesById(seriesId);
    
    if (series) {
      state.currentView = 'seasons';
      state.selectedSeries = seriesId;
      state.breadcrumb = [`${series.name || series.title}`];
      await this.sendResultsPage(chatId);
    }
  }

  async handleSeasonSelection(chatId, data) {
    const state = this.userStates.get(chatId);
    if (!state) return;

    const seasonId = data.split('_')[1];
    const season = this.movieDataManager.findSeasonById(seasonId);
    
    if (season) {
      state.currentView = 'episodes';
      state.selectedSeason = seasonId;
      state.breadcrumb.push(season.name);
      await this.sendResultsPage(chatId);
    }
  }

  async handleEpisodeSelection(chatId, data) {
    const state = this.userStates.get(chatId);
    if (!state) return;

    const episodeId = data.split('_')[1];
    const episode = this.movieDataManager.getEpisodeById(episodeId);
    
    if (episode) {
      const qualities = [
        { label: '🎬 1080p HD', itag: '37' },
        { label: '🎥 720p HD', itag: '22' },
        { label: '📱 360p SD', itag: '18' }
      ];

      const keyboard = [
        qualities.map(quality => ({
          text: quality.label,
          callback_data: `download_${episodeId}_${quality.itag}_series`
        })),
        [{ text: '⬅️ Atrás', callback_data: 'back_series' }]
      ];

      const message = `🎬 *${episode.name}*\n\n` +
                     `Selecciona la calidad:`;

      await this.bot.editMessageText(message, {
        chat_id: chatId,
        message_id: state.messageId,
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'Markdown'
      });
    }
  }
}

module.exports = SeriesHandler;