const axios = require('axios');

class MovieHandler {
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
        const localItems = this.findInLocalData(tmdbItem.title);
        if (localItems.length > 0) {
          localResults.push(...localItems.map(item => ({
            ...item,
            tmdbInfo: tmdbItem
          })));
        }
      }

      if (localResults.length === 0) {
        this.bot.sendMessage(chatId, '❌ No se encontraron películas disponibles.');
        return;
      }

      this.userStates.set(chatId, {
        results: localResults,
        page: 0,
        totalPages: Math.ceil(localResults.length / this.ITEMS_PER_PAGE)
      });

      this.sendResultsPage(chatId);
    } catch (error) {
      console.error('Error searching movies:', error);
      this.bot.sendMessage(chatId, '❌ Error al buscar películas. Intenta de nuevo.');
    }
  }

  async searchTMDB(query) {
    const response = await axios.get('https://api.themoviedb.org/3/search/movie', {
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
    for (const category of this.movieDataManager.movieData) {
      if (category.children) {
        for (const movie of category.children) {
          if (movie.title?.toLowerCase() === tmdbTitle.toLowerCase()) {
            items.push(movie);
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
      text: `🎬 ${result.name || result.title}`,
      callback_data: `movie_${result.id}`
    }]);

    const navButtons = [];
    if (state.page > 0) {
      navButtons.push({ text: '⬅️ Anterior', callback_data: 'prev_movie' });
    }
    if (state.page < state.totalPages - 1) {
      navButtons.push({ text: 'Siguiente ➡️', callback_data: 'next_movie' });
    }
    
    if (navButtons.length > 0) {
      keyboard.push(navButtons);
    }

    const message = `🎬 Películas (${start + 1}-${end} de ${state.results.length})\n` +
                   `📄 Página ${state.page + 1} de ${state.totalPages}`;

    this.bot.sendMessage(chatId, message, {
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    if (data.startsWith('prev_movie') || data.startsWith('next_movie')) {
      await this.handlePageNavigation(chatId, messageId, data);
    } else if (data.startsWith('movie_')) {
      await this.handleMovieSelection(chatId, data);
    }
  }

  async handlePageNavigation(chatId, messageId, action) {
    const state = this.userStates.get(chatId);
    if (!state) return;

    state.page += action === 'prev_movie' ? -1 : 1;
    
    try {
      await this.bot.deleteMessage(chatId, messageId);
      this.sendResultsPage(chatId);
    } catch (error) {
      console.error('Error in movie page navigation:', error);
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
                     `${movie.overview ? `📝 ${movie.overview}\n\n` : ''}` +
                     `Selecciona la calidad de descarga:`;
      
      await this.bot.sendMessage(chatId, message, {
        reply_markup: { inline_keyboard: [buttons] },
        parse_mode: 'Markdown'
      });
    }
  }
}

module.exports = MovieHandler;