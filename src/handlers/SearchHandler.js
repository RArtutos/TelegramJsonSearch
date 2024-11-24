class SearchHandler {
  constructor(bot, dataManager) {
    this.bot = bot;
    this.dataManager = dataManager;
    this.ITEMS_PER_PAGE = 5;
    this.userStates = new Map();
  }

  async handleSearch(chatId, query, type) {
    if (query.length < 2) {
      await this.bot.sendMessage(chatId, '⚠️ Por favor, usa al menos 2 caracteres para buscar.');
      return;
    }

    const results = this.dataManager.search(query, type);
    if (results.length === 0) {
      await this.bot.sendMessage(chatId, `❌ No se encontraron ${type === 'movie' ? 'películas' : 'series'}.`);
      return;
    }

    this.userStates.set(chatId, {
      results,
      page: 0,
      type,
      totalPages: Math.ceil(results.length / this.ITEMS_PER_PAGE)
    });

    await this.sendResultsPage(chatId);
  }

  async sendResultsPage(chatId) {
    const state = this.userStates.get(chatId);
    if (!state) return;

    const start = state.page * this.ITEMS_PER_PAGE;
    const end = Math.min(start + this.ITEMS_PER_PAGE, state.results.length);
    const items = state.results.slice(start, end);

    const keyboard = items.map(item => [{
      text: `${state.type === 'movie' ? '🎬' : '📺'} ${item.name}`,
      callback_data: `${state.type}_${item.id}`
    }]);

    if (state.totalPages > 1) {
      const navButtons = [];
      if (state.page > 0) {
        navButtons.push({ text: '⬅️ Anterior', callback_data: 'prev' });
      }
      if (state.page < state.totalPages - 1) {
        navButtons.push({ text: 'Siguiente ➡️', callback_data: 'next' });
      }
      if (navButtons.length > 0) {
        keyboard.push(navButtons);
      }
    }

    const message = `${state.type === 'movie' ? '🎬 Películas' : '📺 Series'} ` +
                   `(${start + 1}-${end} de ${state.results.length})`;

    await this.bot.sendMessage(chatId, message, {
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'prev' || data === 'next') {
      const state = this.userStates.get(chatId);
      if (state) {
        state.page += data === 'prev' ? -1 : 1;
        await this.bot.deleteMessage(chatId, query.message.message_id);
        await this.sendResultsPage(chatId);
      }
      return;
    }

    const [type, id] = data.split('_');
    const item = this.dataManager.getItem(id, type);
    
    if (!item) {
      await this.bot.sendMessage(chatId, '❌ Contenido no encontrado.');
      return;
    }

    if (type === 'movie') {
      await this.showQualityOptions(chatId, item);
    } else {
      await this.showSeasons(chatId, item);
    }
  }

  async showQualityOptions(chatId, movie) {
    const qualities = [
      { label: '🎬 1080p HD', quality: '1080' },
      { label: '🎥 720p HD', quality: '720' },
      { label: '📱 360p SD', quality: '360' }
    ];

    const keyboard = qualities.map(q => ({
      text: q.label,
      callback_data: `download_${movie.id}_${q.quality}`
    }));

    await this.bot.sendMessage(chatId,
      `🎬 *${movie.name}*\n\nSelecciona la calidad:`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [keyboard] }
      }
    );
  }

  async showSeasons(chatId, series) {
    const seasons = this.dataManager.getSeasons(series.id);
    if (!seasons.length) {
      await this.bot.sendMessage(chatId, '❌ No hay temporadas disponibles.');
      return;
    }

    const keyboard = seasons.map(season => [{
      text: `📺 ${season.name}`,
      callback_data: `season_${season.id}`
    }]);

    await this.bot.sendMessage(chatId,
      `📺 *${series.name}*\n\nSelecciona una temporada:`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      }
    );
  }
}

module.exports = SearchHandler;