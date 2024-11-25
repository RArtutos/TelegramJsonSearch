const axios = require('axios');

class MovieHandler {
  // ... (previous methods remain the same until sendResultsPage)

  async sendResultsPage(chatId) {
    const state = this.userStates.get(chatId);
    if (!state) return;

    const start = state.page * this.ITEMS_PER_PAGE;
    const end = Math.min(start + this.ITEMS_PER_PAGE, state.results.length);
    const currentResults = state.results.slice(start, end);

    const keyboard = [];

    if (state.breadcrumb.length > 0) {
      keyboard.push([{ text: '⬅️ Volver a la lista', callback_data: 'back_movie' }]);
    }

    if (state.breadcrumb.length === 0) {
      currentResults.forEach(result => {
        keyboard.push([{
          text: `🎬 ${result.name || result.title}`,
          callback_data: `movie:${result.id}`
        }]);
      });

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
    } else if (data.startsWith('movie:')) {
      const movieId = data.substring(6); // Remove 'movie:'
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
            callback_data: `download:${movie.id}:${quality.itag}:movie`
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