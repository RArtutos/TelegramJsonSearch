const MovieSearchBot = require('./bot/MovieSearchBot');
require('dotenv').config();

// Iniciar el bot
const movieBot = new MovieSearchBot();
console.log('🚀 Bot iniciado exitosamente!');