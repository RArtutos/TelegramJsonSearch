import { searchMovies, searchSeries } from '../services/searchService.js';
import { startDownload } from '../services/downloadManager.js';
import { logger } from '../utils/logger.js';

export function setupCommands(bot, downloadManager) {
  // Comando de búsqueda de películas
  bot.onText(/\/movie (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const searchTerm = match[1];
    
    try {
      const results = await searchMovies(searchTerm);
      if (results.length === 0) {
        bot.sendMessage(chatId, 'No se encontraron películas con ese nombre.');
        return;
      }
      
      // Mostrar resultados paginados
      const movieList = results
        .slice(0, 10)
        .map((movie, i) => `${i + 1}. ${movie.name}`)
        .join('\n');
        
      bot.sendMessage(chatId, `Resultados encontrados:\n${movieList}`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '720p', callback_data: `dl_movie_720_${results[0].id}` },
              { text: '1080p', callback_data: `dl_movie_1080_${results[0].id}` }
            ]
          ]
        }
      });
    } catch (error) {
      logger.error('Error en búsqueda de películas:', error);
      bot.sendMessage(chatId, 'Error al buscar películas. Intente nuevamente.');
    }
  });

  // Comando de búsqueda de series
  bot.onText(/\/series (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const searchTerm = match[1];
    
    try {
      const results = await searchSeries(searchTerm);
      if (results.length === 0) {
        bot.sendMessage(chatId, 'No se encontraron series con ese nombre.');
        return;
      }
      
      const seriesList = results
        .slice(0, 10)
        .map((serie, i) => `${i + 1}. ${serie.name}`)
        .join('\n');
        
      bot.sendMessage(chatId, `Series encontradas:\n${seriesList}`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Seleccionar Temporada', callback_data: `select_season_${results[0].id}` }]
          ]
        }
      });
    } catch (error) {
      logger.error('Error en búsqueda de series:', error);
      bot.sendMessage(chatId, 'Error al buscar series. Intente nuevamente.');
    }
  });

  // Comando de estado
  bot.onText(/\/status(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const downloadId = match[1];
    
    if (downloadId) {
      const status = downloadManager.getDownloadStatus(downloadId);
      if (!status) {
        bot.sendMessage(chatId, 'Descarga no encontrada.');
        return;
      }
      
      bot.sendMessage(chatId, 
        `Estado de descarga #${downloadId}:\n` +
        `Progreso: ${status.progress}%\n` +
        `Descargado: ${status.downloadedSize}/${status.totalSize}\n` +
        `Estado: ${status.status}`
      );
    } else {
      const activeDownloads = downloadManager.getAllDownloads();
      if (activeDownloads.length === 0) {
        bot.sendMessage(chatId, 'No hay descargas activas.');
        return;
      }
      
      const statusList = activeDownloads
        .map(dl => `#${dl.id}: ${dl.name} - ${dl.progress}%`)
        .join('\n');
        
      bot.sendMessage(chatId, `Descargas activas:\n${statusList}`);
    }
  });

  // Manejador de callbacks para botones inline
  bot.on('callback_query', async (callbackQuery) => {
    const action = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    
    if (action.startsWith('dl_movie_')) {
      const [, , quality, id] = action.split('_');
      try {
        const downloadId = await startDownload({
          type: 'movie',
          id,
          quality,
          chatId
        });
        
        bot.sendMessage(
          chatId,
          `Iniciando descarga #${downloadId}. Use /status ${downloadId} para ver el progreso.`
        );
      } catch (error) {
        logger.error('Error al iniciar descarga:', error);
        bot.sendMessage(chatId, 'Error al iniciar la descarga. Intente nuevamente.');
      }
    }
  });
}