const TelegramBot = require('node-telegram-bot-api');
const Fuse = require('fuse.js');
const fs = require('fs');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const ITEMS_PER_PAGE = 10;
let movieData = [];
let allMovies = [];
let userStates = new Map();

// Cargar datos de películas y aplanar la estructura
try {
  movieData = JSON.parse(fs.readFileSync('./data/pelis.json', 'utf8'));
  // Extraer todas las películas de todas las categorías
  allMovies = movieData.reduce((acc, category) => {
    if (category.children && Array.isArray(category.children)) {
      // Añadir información de la categoría a cada película
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

// Palabras comunes a ignorar
const commonWords = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'y', 'o', 'de', 'del', 'al', 'en', 'para', 'por', 'con',
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at'
]);

// Función para normalizar texto
function normalizeText(text) {
  if (typeof text !== 'string') return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/gi, ' ')
    .toLowerCase()
    .trim();
}

// Configuración mejorada de Fuse.js
const fuseOptions = {
  keys: ['name', 'title'],
  includeScore: true,
  threshold: 0.4,
  distance: 200,
  ignoreLocation: true,
  useExtendedSearch: true,
  findAllMatches: true,
  shouldSort: true,
  minMatchCharLength: 2,
  getFn: (obj, path) => {
    const value = obj[path];
    return normalizeText(value);
  }
};

const fuse = new Fuse(allMovies, fuseOptions);

// Función para procesar la consulta de búsqueda
function processSearchQuery(query) {
  const normalizedQuery = normalizeText(query);
  const words = normalizedQuery.split(/\s+/);
  
  if (words.length > 2) {
    return words
      .filter(word => !commonWords.has(word) && word.length > 1)
      .join(' ');
  }
  
  return normalizedQuery;
}

// Función para crear botones de descarga
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

// Manejador del comando /search
bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const searchQuery = processSearchQuery(match[1]);
  
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

// Función para enviar página de resultados
function sendResultsPage(chatId) {
  const state = userStates.get(chatId);
  const start = state.page * ITEMS_PER_PAGE;
  const end = Math.min(start + ITEMS_PER_PAGE, state.results.length);
  const currentResults = state.results.slice(start, end);

  const keyboard = [];
  
  currentResults.forEach(result => {
    const score = process.env.NODE_ENV === 'development' ? ` (${(1 - result.score).toFixed(2)})` : '';
    keyboard.push([{
      text: `🎬 ${result.item.name.substring(0, 50)}${result.item.name.length > 50 ? '...' : ''} [${result.item.categoryName}]${score}`,
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
      const downloadUrl = `https://pelis.gbstream.us.kg/api/v1/redirectdownload/${encodeURIComponent(movie.name)}?a=0&id=${movieId}&itag=${itag}`;
      bot.sendMessage(chatId, `🎬 <b>Link de descarga:</b>\n${downloadUrl}`, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });
    }
  }
});

// Manejador de errores global
bot.on('polling_error', (error) => {
  console.error('Error en el polling:', error);
});

console.log('Bot iniciado exitosamente! 🚀');