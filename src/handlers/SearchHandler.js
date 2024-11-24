class SearchHandler {
  constructor(bot, movieDataManager) {
    this.bot = bot;
    this.movieDataManager = movieDataManager;
    this.ITEMS_PER_PAGE = 10;
    this.userStates = new Map();
  }

  handleSearch(chatId, searchQuery) {
    if (searchQuery.length < 2) {
      this.bot.sendMessage(chatId, '⚠️ Por favor, proporciona un término de búsqueda más largo.');
      return;
    }

    const searchResults = this.movieDataManager.searchMovies(searchQuery.toLowerCase());
    if (searchResults.length === 0) {
      this.bot.sendMessage(chatId, '❌ No se encontraron resultados. Intenta con otros términos de búsqueda.');
      return;
    }

    this.userStates.set(chatId, {
      results: searchResults,
      page: 0,
      totalPages: Math.ceil(searchResults.length / this.ITEMS_PER_PAGE)
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
      text: `🎬 ${result.item.name.substring(0, 50)}${result.item.name.length > 50 ? '...' : ''} [${result.item.categoryName}]`,
      callback_data: `select_${result.item.id}`
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

    const message = `🔍 Resultados (${start + 1}-${end} de ${state.results.length})\n` +
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