class SearchHandler {
  constructor(bot, movieDataManager) {
    this.bot = bot;
    this.movieDataManager = movieDataManager;
    this.ITEMS_PER_PAGE = 5;
    this.userStates = new Map();
  }

  async handleSearch(chatId, searchQuery, type = 'movie') {
    if (searchQuery.length < 2) {
      this.bot.sendMessage(chatId, '⚠️ Por favor, proporciona un término de búsqueda más largo.');
      return;
    }

    const tmdbResults = await this.movieDataManager.searchTMDB(searchQuery, type);
    if (tmdbResults.length === 0) {
      this.bot.sendMessage(chatId, '❌ No se encontraron resultados en TMDB.');
      return;
    }

    const localResults = [];
    for (const tmdbItem of tmdbResults) {
      const localItems = this.movieDataManager.findInLocalData(
        tmdbItem.title || tmdbItem.name, 
        type
      );
      if (localItems.length > 0) {
        localResults.push(...localItems.map(item => ({
          ...item,
          tmdbInfo: tmdbItem
        })));
      }
    }

    if (localResults.length === 0) {
      this.bot.sendMessage(chatId, '❌ No se encontraron resultados disponibles.');
      return;
    }

    this.userStates.set(chatId, {
      results: localResults,
      page: 0,
      totalPages: Math.ceil(localResults.length / this.ITEMS_PER_PAGE),
      type
    });

    this.sendResultsPage(chatId);
  }

  sendResultsPage(chatId) {
    const state = this.userStates.get(chatId);
    if (!state) return;

    const start = state.page * this.ITEMS_PER_PAGE;
    const end = Math.min(start + this.ITEMS_PER_PAGE, state.results.length);
    const currentResults = state.results.slice(start, end);

    const keyboard = currentResults.map(result => [{
      text: `${state.type === 'movie' ? '🎬' : '📺'} ${result.name || result.title}`,
      callback_data: state.type === 'movie' ? 
        `select_movie_${result.id}` : 
        `select_series_${result.id}`
    }]);

    const navButtons = [];
    if (state.page > 0) {
      navButtons.push({ text: '⬅️ Anterior', callback_data: 'prev_page' });
    }
    if (state.page < state.totalPages - 1) {
      navButtons.push({ text: 'Siguiente ➡️', callback_data: 'next_page' });
    }
    
    if (navButtons.length > 0) {
      keyboard.push(navButtons);
    }

    const message = `${state.type === 'movie' ? '🎬 Películas' : '📺 Series'} (${start + 1}-${end} de ${state.results.length})\n` +
                   `📄 Página ${state.page + 1} de ${state.totalPages}`;

    this.bot.sendMessage(chatId, message, {
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  getUserState(chatId) {
    return this.userStates.get(chatId);
  }

  updateUserState(chatId, newState) {
    this.userStates.set(chatId, newState);
  }
}

module.exports = SearchHandler;