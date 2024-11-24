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
      await this.bot.sendMessage(chatId, '⚠️ Por favor, proporciona un término de búsqueda más largo.');
      return;
    }

    try {
      const results = await this.movieDataManager.searchContent(searchQuery, 'movie');
      
      if (results.length === 0) {
        await this.bot.sendMessage(chatId, '❌ No se encontraron películas.');
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
      console.error('Error searching movies:', error);
      await this.bot.sendMessage(chatId, '❌ Error al buscar películas. Intenta de nuevo.');
    }
  }

  async sendResultsPage(chatId) {
    const state = this.userStates.get(chatId);
    if (!state) return;

    const start = state.page * this.ITEMS_PER_PAGE;
    const end = Math.min(start + this.ITEMS_PER_PAGE, state.results.length);
    const currentResults = state.results.slice(start, end);

    const keyboard = currentResults.map(result => {
      const icon = result.hasLocal ? '🎬' : '🔍';
      const title = result.title || result.name;
      const status = result.hasLocal ? ' (Disponible)' : ' (Info)';
      return [{
        text: `${icon} ${title}${status}`,
        callback_data: `movie_${result.id || result.tmdbId}`
      }];
    });

    if (state.page > 0 || state.page < state.totalPages - 1) {
      const navButtons = [];
      if (state.page > 0) {
        navButtons.push({ text: '⬅️ Anterior', callback_data: 'prev_movie' });
      }
      if (state.page < state.totalPages - 1) {
        navButtons.push({ text: 'Siguiente ➡️', callback_data: 'next_movie' });
      }
      keyboard.push(navButtons);
    }

    const message = `🎬 Películas (${start + 1}-${end} de ${state.results.length})\n` +
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
      if (data === 'prev_movie' || data === 'next_movie') {
        await this.handlePageNavigation(chatId, messageId, data);
      } else if (data.startsWith('movie_')) {
        await this.handleMovieSelection(chatId, data);
      }
    } catch (error) {
      console.error('Error handling movie callback:', error);
      await this.bot.sendMessage(chatId, '❌ Error al procesar la selección.');
    }
  }

  async handlePageNavigation(chatId, messageId, action) {
    const state = this.userStates.get(chatId);
    if (!state) return;

    state.page += action === 'prev_movie' ? -1 : 1;
    
    try {
      await this.bot.deleteMessage(chatId, messageId);
      await this.sendResultsPage(chatId);
    } catch (error) {
      console.error('Error in movie page navigation:', error);
    }
  }

  async handleMovieSelection(chatId, data) {
    const movieId = data.split('_')[1];
    const state = this.userStates.get(chatId);
    const movie = state?.results.find(m => (m.id || m.tmdbId) === movieId);
    
    if (!movie) {
      await this.bot.sendMessage(chatId, '❌ Película no encontrada.');
      return;
    }

    if (movie.hasLocal) {
      const qualities = [
        { label: '🎬 1080p HD', itag: '37' },
        { label: '🎥 720p HD', itag: '22' },
        { label: '📱 360p SD', itag: '18' }
      ];

      const buttons = qualities.map(quality => ({
        text: quality.label,
        callback_data: `download_${movie.id}_${quality.itag}`
      }));

      const message = `🎬 *${movie.title || movie.name}*\n` +
                     `${movie.tmdbInfo?.overview ? `📝 ${movie.tmdbInfo.overview}\n\n` : ''}` +
                     `Selecciona la calidad de descarga:`;
      
      await this.bot.sendMessage(chatId, message, {
        reply_markup: { inline_keyboard: [buttons] },
        parse_mode: 'Markdown'
      });
    } else {
      const message = `🎬 *${movie.title}*\n` +
                     `${movie.overview ? `📝 ${movie.overview}\n\n` : ''}` +
                     `⚠️ Esta película no está disponible actualmente.`;
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown'
      });
    }
  }

  getUserState(chatId) {
    return this.userStates.get(chatId);
  }

  updateUserState(chatId, newState) {
    this.userStates.set(chatId, newState);
  }
}

module.exports = MovieHandler;