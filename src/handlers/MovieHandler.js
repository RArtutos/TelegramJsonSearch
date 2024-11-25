const axios = require('axios');

class MovieHandler {
  constructor(bot, movieDataManager, downloadHandler) {
    this.bot = bot;
    this.movieDataManager = movieDataManager;
    this.downloadHandler = downloadHandler;
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
        totalPages: Math.ceil(localResults.length / this.ITEMS_PER_PAGE),
        currentMessageId: null,
        breadcrumb: []
      });

      const message = await this.sendResultsPage(chatId);
      const state = this.userStates.get(chatId);
      state.currentMessageId = message.message_id;
      this.userStates.set(chatId, state);
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

  async sendResultsPage(chatId) {
    const state = this.userStates.get(chatId);
    if (!state) return;

    const start = state.page * this.ITEMS_PER_PAGE;
    const end = Math.min(start + this.ITEMS_PER_PAGE, state.results.length);
    const currentResults = state.results.slice(start, end);

    const keyboard = [];

    // Botón de volver si estamos en una película
    if (state.breadcrumb.length > 0) {
      keyboard.push([{ text: '⬅️ Volver a la lista', callback_data: 'back_movie' }]);
    }

    // Lista de películas o detalles de película
    if (state.breadcrumb.length === 0) {
      currentResults.forEach(result => {
        keyboard.push([{
          text: `🎬 ${result.name || result.title}`,
          callback_data: `movie_${result.id}`
        }]);
      });

      // Botones de navegación
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
    }

    let message;
    if (state.breadcrumb.length === 0) {
      message = `🎬 Películas (${start + 1}-${end} de ${state.results.length})\n` +
                `📄 Página ${state.page + 1} de ${state.totalPages}`;
    } else {
      message = state.breadcrumb.join(' > ');
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

    if (data === 'back_movie') {
      state.breadcrumb = [];
      await this.sendResultsPage(chatId);
    } else if (data.startsWith('prev_movie') || data.startsWith('next_movie')) {
      state.page += data === 'prev_movie' ? -1 : 1;
      await this.sendResultsPage(chatId);
    } else if (data.startsWith('movie_')) {
      const movieId = data.split('_')[1];
      const movie = this.movieDataManager.getMovieById(movieId);
      
      if (movie) {
        state.breadcrumb = [`🎬 ${movie.name || movie.title}`];
        
        const qualities = [
          { label: '🎬 1080p HD', itag: '37' },
          { label: '🎥 720p HD', itag: '22' },
          { label: '📱 360p SD', itag: '18' }
        ];

        const keyboard = [
          qualities.map(quality => ({
            text: quality.label,
            callback_data: `download_${movie.id}_${quality.itag}_movie`
          })),
          [{ text: '⬅️ Volver a la lista', callback_data: 'back_movie' }]
        ];

        const message = `🎬 *${movie.name}*\n` +
                       `${movie.overview ? `📝 ${movie.overview}\n\n` : ''}` +
                       `Selecciona la calidad de descarga:`;
        
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

module.exports = MovieHandler;