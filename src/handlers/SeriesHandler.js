const axios = require('axios');

class SeriesHandler {
  constructor(bot, movieDataManager, downloadHandler) {
    this.bot = bot;
    this.movieDataManager = movieDataManager;
    this.downloadHandler = downloadHandler;
    this.ITEMS_PER_PAGE = 5;
    this.userStates = new Map();
  }

  async handleSearch(chatId, searchQuery, userId) {
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
        currentMessageId: null,
        breadcrumb: [],
        selectedSeries: null,
        selectedSeason: null,
        userId
      });

      const message = await this.sendResultsPage(chatId);
      const state = this.userStates.get(chatId);
      state.currentMessageId = message.message_id;
      this.userStates.set(chatId, state);
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

    const keyboard = [];
    let message = '';

    if (state.breadcrumb.length > 0) {
      keyboard.push([{
        text: '⬅️ Volver',
        callback_data: 'back_series'
      }]);
    }

    switch (state.currentView) {
      case 'series': {
        const start = state.page * this.ITEMS_PER_PAGE;
        const end = Math.min(start + this.ITEMS_PER_PAGE, state.results.length);
        const currentResults = state.results.slice(start, end);

        currentResults.forEach(result => {
          keyboard.push([{
            text: `📺 ${result.name || result.title}`,
            callback_data: `series:${result.id}`
          }]);
        });

        if (state.totalPages > 1) {
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

        message = `📺 Series (${start + 1}-${end} de ${state.results.length})\n` +
                 `📄 Página ${state.page + 1} de ${state.totalPages}`;
        break;
      }

      case 'seasons': {
        const seasons = this.movieDataManager.getSeasons(state.selectedSeries);
        seasons.forEach(season => {
          keyboard.push([{
            text: `📺 ${season.name}`,
            callback_data: `season:${season.id}`
          }]);
        });
        message = state.breadcrumb.join(' > ');
        break;
      }

      case 'episodes': {
        const episodes = this.movieDataManager.getEpisodes(state.selectedSeason);
        episodes.forEach(episode => {
          keyboard.push([{
            text: `🎬 ${episode.name}`,
            callback_data: `episode:${episode.id}`
          }]);
        });
        message = state.breadcrumb.join(' > ');
        break;
      }
    }

    const messageOptions = {
      reply_markup: { inline_keyboard: keyboard },
      parse_mode: 'Markdown'
    };

    if (state.currentMessageId) {
      try {
        await this.bot.editMessageText(message, {
          chat_id: chatId,
          message_id: state.currentMessageId,
          ...messageOptions
        });
        return { message_id: state.currentMessageId };
      } catch (error) {
        if (!error.message?.includes('message is not modified')) {
          console.error('Error editing message:', error);
        }
      }
    }

    return await this.bot.sendMessage(chatId, message, messageOptions);
  }

  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const data = query.data;
    const state = this.userStates.get(chatId);

    if (!state) return;

    if (data === 'back_series') {
      if (state.currentView === 'episodes') {
        state.currentView = 'seasons';
        state.selectedSeason = null;
        state.breadcrumb.pop();
      } else if (state.currentView === 'seasons') {
        state.currentView = 'series';
        state.selectedSeries = null;
        state.breadcrumb = [];
      }
      await this.sendResultsPage(chatId);
    } else if (data.startsWith('prev_series') || data.startsWith('next_series')) {
      state.page += data === 'prev_series' ? -1 : 1;
      await this.sendResultsPage(chatId);
    } else if (data.startsWith('series:')) {
      const seriesId = data.substring(7); // Remove 'series:'
      const series = this.movieDataManager.findSeriesById(seriesId);
      
      if (series) {
        state.currentView = 'seasons';
        state.selectedSeries = seriesId;
        state.breadcrumb = [`📺 ${series.name || series.title}`];
        await this.sendResultsPage(chatId);
      }
    } else if (data.startsWith('season:')) {
      const seasonId = data.substring(7); // Remove 'season:'
      const season = this.movieDataManager.findSeasonById(seasonId);
      
      if (season) {
        state.currentView = 'episodes';
        state.selectedSeason = seasonId;
        state.breadcrumb.push(season.name);
        await this.sendResultsPage(chatId);
      }
    } else if (data.startsWith('episode:')) {
      const episodeId = data.substring(8); // Remove 'episode:'
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
            callback_data: `download:${episode.id}:${quality.itag}:series`
          })),
          [{ text: '⬅️ Volver', callback_data: 'back_series' }]
        ];

        const message = `🎬 *${episode.name}*\n` +
                       `${episode.overview ? `📝 ${episode.overview}\n\n` : ''}` +
                       `Selecciona la calidad:`;

        await this.bot.editMessageText(message, {
          chat_id: chatId,
          message_id: state.currentMessageId,
          reply_markup: { inline_keyboard: keyboard },
          parse_mode: 'Markdown'
        });
      }
    }
  }
}

module.exports = SeriesHandler;