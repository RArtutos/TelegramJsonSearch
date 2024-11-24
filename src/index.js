const TelegramBot = require('node-telegram-bot-api');
const Fuse = require('fuse.js');
const fs = require('fs');
const axios = require('axios');
const ChunkDownloader = require('./downloader');
require('dotenv').config();

// Inicializar el bot con el servidor API local
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
  baseApiUrl: process.env.LOCAL_API_URL
});

const ITEMS_PER_PAGE = 10;
let movieData = [];
let allMovies = [];
let userStates = new Map();
let progressMessages = new Map();
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB por chunk
const MAX_PARALLEL_DOWNLOADS = 8;

// Cargar datos de películas
try {
  movieData = JSON.parse(fs.readFileSync('./data/pelis.json', 'utf8'));
  allMovies = movieData.reduce((acc, category) => {
    if (category.children && Array.isArray(category.children)) {
      const moviesWithCategory = category.children.map(movie => ({
        ...movie,
        categoryName: category.categoryInfo?.name || 'Sin categoría'
      }));
      return [...acc, ...moviesWithCategory];
    }
    return acc;
  }, []);
} catch (error) {
  console.error('Error loading pelis.json:', error);
  process.exit(1);
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatTime(seconds) {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function createProgressBar(progress) {
  const filledLength = Math.min(Math.max(Math.floor(progress / 5), 0), 20);
  const emptyLength = Math.max(20 - filledLength, 0);
  return '▓'.repeat(filledLength) + '░'.repeat(emptyLength);
}

async function updateProgressMessage(chatId, messageId, downloaded, total, startTime, activeChunks) {
  const now = Date.now();
  const elapsed = (now - startTime) / 1000;
  const speed = downloaded / elapsed;
  const remaining = (total - downloaded) / speed;
  const progress = (downloaded / total) * 100;

  const message = `📥 Descargando video...\n\n` +
    `${createProgressBar(progress)} ${progress.toFixed(1)}%\n\n` +
    `⚡ Velocidad: ${formatBytes(speed)}/s\n` +
    `📦 Tamaño: ${formatBytes(downloaded)} / ${formatBytes(total)}\n` +
    `⏱ Tiempo restante: ${formatTime(remaining)}\n` +
    `⏳ Tiempo transcurrido: ${formatTime(elapsed)}\n` +
    `🔄 Chunks activos: ${activeChunks}/${MAX_PARALLEL_DOWNLOADS}`;

  const lastMessage = progressMessages.get(chatId);
  if (!lastMessage || lastMessage.text !== message) {
    try {
      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId
      });
      progressMessages.set(chatId, { text: message, timestamp: now });
    } catch (error) {
      if (!error.message.includes('message is not modified')) {
        console.error('Error al actualizar mensaje de progreso:', error);
      }
    }
  }
}

async function downloadAndSendVideo(chatId, movieId, itag, movieName) {
  try {
    const downloadUrl = `https://pelis.gbstream.us.kg/api/v1/redirectdownload/${encodeURIComponent(movieName)}?a=0&id=${movieId}&itag=${itag}`;
    
    const statusMessage = await bot.sendMessage(chatId, '🔄 Iniciando descarga paralela...');
    const startTime = Date.now();
    
    const downloader = new ChunkDownloader(downloadUrl, CHUNK_SIZE, MAX_PARALLEL_DOWNLOADS);
    const { stream, totalSize } = await downloader.start();

    let updateInterval = setInterval(async () => {
      const progress = downloader.getProgress();
      await updateProgressMessage(
        chatId,
        statusMessage.message_id,
        progress.downloadedBytes,
        totalSize,
        startTime,
        downloader.activeDownloads
      );
    }, 1000);

    try {
      await bot.sendVideo(chatId, stream, {
        caption: `🎬 ${movieName}`,
        supports_streaming: true,
        duration: 0,
        width: itag === '37' ? 1920 : (itag === '22' ? 1280 : 640),
        height: itag === '37' ? 1080 : (itag === '22' ? 720 : 360)
      }, {
        filename: `${movieName}.mp4`
      });

      clearInterval(updateInterval);
      await bot.editMessageText('✅ Video enviado exitosamente!', {
        chat_id: chatId,
        message_id: statusMessage.message_id
      });

      setTimeout(() => {
        bot.deleteMessage(chatId, statusMessage.message_id).catch(() => {});
      }, 5000);

    } catch (error) {
      clearInterval(updateInterval);
      throw error;
    }

  } catch (error) {
    console.error('Error al enviar el video:', error);
    bot.sendMessage(chatId, '❌ Lo siento, hubo un error al procesar el video. Por favor, intenta de nuevo más tarde.');
  }
}

// Resto del código del bot (búsqueda, botones, etc.) permanece igual...

// Comando de búsqueda
bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const searchQuery = match[1].toLowerCase();
  
  if (searchQuery.length < 2) {
    bot.sendMessage(chatId, 'Por favor, proporciona un término de búsqueda más largo.');
    return;
  }

  const searchResults = fuse.search(searchQuery)
    .filter(result => result.score < 0.6);

  if (searchResults.length === 0) {
    bot.sendMessage(chatId, 'No se encontraron resultados. Intenta con otros términos de búsqueda.');
    return;
  }

  userStates.set(chatId, {
    results: searchResults,
    page: 0,
    totalPages: Math.ceil(searchResults.length / ITEMS_PER_PAGE)
  });

  sendResultsPage(chatId);
});

function sendResultsPage(chatId) {
  const state = userStates.get(chatId);
  const start = state.page * ITEMS_PER_PAGE;
  const end = Math.min(start + ITEMS_PER_PAGE, state.results.length);
  const currentResults = state.results.slice(start, end);

  const keyboard = [];
  currentResults.forEach(result => {
    keyboard.push([{
      text: `🎬 ${result.item.name.substring(0, 50)}${result.item.name.length > 50 ? '...' : ''} [${result.item.categoryName}]`,
      callback_data: `select_${result.item.id}`
    }]);
  });

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

  const message = `🔍 Resultados (${start + 1}-${end} de ${state.results.length}):\n` +
                 `Página ${state.page + 1} de ${state.totalPages}`;

  bot.sendMessage(chatId, message, {
    reply_markup: {
      inline_keyboard: keyboard
    },
    parse_mode: 'HTML'
  });
}

function createDownloadButtons(movie) {
  const qualities = [
    { label: '1080p', itag: '37' },
    { label: '720p', itag: '22' },
    { label: '360p', itag: '18' }
  ];

  return qualities.map(quality => ({
    text: quality.label,
    callback_data: `download_${movie.id}_${quality.itag}`
  }));
}

// Manejador de callbacks
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  if (data === 'prev_page' || data === 'next_page') {
    const state = userStates.get(chatId);
    state.page += data === 'prev_page' ? -1 : 1;
    
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (error) {
      console.error('Error al eliminar mensaje:', error);
    }
    sendResultsPage(chatId);
    return;
  }

  if (data.startsWith('select_')) {
    const movieId = data.split('_')[1];
    const movie = allMovies.find(m => m.id === movieId);
    
    if (movie) {
      const buttons = createDownloadButtons(movie);
      const message = `🎬 <b>${movie.name}</b>\n` +
                     `📁 <i>${movie.categoryName}</i>\n\n` +
                     `Selecciona la calidad de descarga:`;
      
      bot.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: [buttons]
        },
        parse_mode: 'HTML'
      });
    }
    return;
  }

  if (data.startsWith('download_')) {
    const [_, movieId, itag] = data.split('_');
    const movie = allMovies.find(m => m.id === movieId);
    
    if (movie) {
      await downloadAndSendVideo(chatId, movieId, itag, movie.name);
    }
  }
});

// Manejador de errores
bot.on('polling_error', (error) => {
  console.error('Error en el polling:', error);
});

console.log('Bot iniciado exitosamente! 🚀');



const TelegramBot = require('node-telegram-bot-api');
const Fuse = require('fuse.js');
const fs = require('fs');
const axios = require('axios');
const ChunkDownloader = require('./downloader');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
  baseApiUrl: process.env.LOCAL_API_URL
});

const ITEMS_PER_PAGE = 10;
let movieData = [];
let allMovies = [];
let userStates = new Map();
let progressMessages = new Map();
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB por chunk
const MAX_PARALLEL_DOWNLOADS = 8;
const UPDATE_INTERVAL = 1000; // 1 segundo

// Cargar datos de películas
try {
  movieData = JSON.parse(fs.readFileSync('./data/pelis.json', 'utf8'));
  allMovies = movieData.reduce((acc, category) => {
    if (category.children && Array.isArray(category.children)) {
      const moviesWithCategory = category.children.map(movie => ({
        ...movie,
        categoryName: category.categoryInfo?.name || 'Sin categoría'
      }));
      return [...acc, ...moviesWithCategory];
    }
    return acc;
  }, []);
} catch (error) {
  console.error('Error loading pelis.json:', error);
  process.exit(1);
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return 'Calculando...';
  if (seconds < 0) return 'Finalizando...';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function createProgressBar(progress) {
  const normalizedProgress = Math.min(Math.max(progress, 0), 100);
  const filledLength = Math.floor(normalizedProgress / 5);
  const emptyLength = 20 - filledLength;
  return '▓'.repeat(filledLength) + '░'.repeat(emptyLength);
}

async function updateProgressMessage(chatId, messageId, state) {
  const now = Date.now();
  const elapsed = (now - state.startTime) / 1000;
  let message = '';

  if (state.phase === 'download') {
    const speed = state.downloadedBytes / elapsed;
    const remaining = (state.totalSize - state.downloadedBytes) / speed;
    const progress = (state.downloadedBytes / state.totalSize) * 100;

    message = `📥 Descargando video...\n\n` +
      `${createProgressBar(progress)} ${progress.toFixed(1)}%\n\n` +
      `⚡ Velocidad: ${formatBytes(speed)}/s\n` +
      `📦 Descargado: ${formatBytes(state.downloadedBytes)} / ${formatBytes(state.totalSize)}\n` +
      `⏱ Tiempo restante: ${formatTime(remaining)}\n` +
      `⏳ Tiempo transcurrido: ${formatTime(elapsed)}\n` +
      `🔄 Chunks activos: ${state.activeChunks}/${MAX_PARALLEL_DOWNLOADS}`;
  } else if (state.phase === 'upload') {
    const uploadProgress = (state.uploadedBytes / state.totalSize) * 100;
    const uploadSpeed = state.uploadedBytes / elapsed;
    const uploadRemaining = (state.totalSize - state.uploadedBytes) / uploadSpeed;

    message = `📤 Subiendo a Telegram...\n\n` +
      `${createProgressBar(uploadProgress)} ${uploadProgress.toFixed(1)}%\n\n` +
      `⚡ Velocidad: ${formatBytes(uploadSpeed)}/s\n` +
      `📦 Subido: ${formatBytes(state.uploadedBytes)} / ${formatBytes(state.totalSize)}\n` +
      `⏱ Tiempo restante: ${formatTime(uploadRemaining)}\n` +
      `⏳ Tiempo transcurrido: ${formatTime(elapsed)}`;
  }

  const lastMessage = progressMessages.get(chatId);
  if (!lastMessage || lastMessage.text !== message) {
    try {
      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML'
      });
      progressMessages.set(chatId, { text: message, timestamp: now });
    } catch (error) {
      if (!error.message?.includes('message is not modified')) {
        console.error('Error al actualizar mensaje de progreso:', error);
      }
    }
  }
}

async function downloadAndSendVideo(chatId, movieId, itag, movieName) {
  const statusMessage = await bot.sendMessage(chatId, '🔄 Iniciando descarga paralela...');
  const startTime = Date.now();
  let updateInterval;
  
  try {
    console.log(`Iniciando descarga de: ${movieName} (ID: ${movieId}, itag: ${itag})`);
    const downloadUrl = `https://pelis.gbstream.us.kg/api/v1/redirectdownload/${encodeURIComponent(movieName)}?a=0&id=${movieId}&itag=${itag}`;
    
    const state = {
      phase: 'download',
      startTime,
      downloadedBytes: 0,
      uploadedBytes: 0,
      totalSize: 0,
      activeChunks: 0
    };

    const downloader = new ChunkDownloader(downloadUrl, CHUNK_SIZE, MAX_PARALLEL_DOWNLOADS);
    
    downloader.on('progress', (progress) => {
      state.downloadedBytes = progress.downloadedBytes;
      state.totalSize = progress.totalSize;
      state.activeChunks = progress.activeChunks;
    });

    updateInterval = setInterval(() => {
      updateProgressMessage(chatId, statusMessage.message_id, state);
    }, UPDATE_INTERVAL);

    const { stream, totalSize } = await downloader.start();
    console.log(`Descarga completada. Tamaño total: ${formatBytes(totalSize)}`);

    // Cambiar a fase de subida
    state.phase = 'upload';
    state.uploadedBytes = 0;
    state.totalSize = totalSize;
    state.startTime = Date.now(); // Reiniciar el tiempo para la subida

    console.log('Iniciando subida a Telegram...');
    await bot.sendVideo(chatId, stream, {
      caption: `🎬 ${movieName}`,
      supports_streaming: true,
      duration: 0,
      width: itag === '37' ? 1920 : (itag === '22' ? 1280 : 640),
      height: itag === '37' ? 1080 : (itag === '22' ? 720 : 360),
      progress: (current, total) => {
        state.uploadedBytes = current;
        state.totalSize = total;
      }
    }, {
      filename: `${movieName}.mp4`,
      contentType: 'video/mp4'
    });

    console.log('Video subido exitosamente');
    clearInterval(updateInterval);
    
    await bot.editMessageText('✅ Video enviado exitosamente!', {
      chat_id: chatId,
      message_id: statusMessage.message_id
    });

    setTimeout(() => {
      bot.deleteMessage(chatId, statusMessage.message_id).catch(() => {});
    }, 5000);

  } catch (error) {
    console.error('Error en el proceso:', error);
    clearInterval(updateInterval);
    
    await bot.editMessageText('❌ Error: ' + (error.message || 'Error desconocido'), {
      chat_id: chatId,
      message_id: statusMessage.message_id
    });
  }
}

// El resto del código (búsqueda, botones, etc.) permanece igual...

bot.on('polling_error', (error) => {
  console.error('Error en el polling:', error);
});

console.log('Bot iniciado exitosamente! 🚀');