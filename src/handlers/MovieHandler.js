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
    con