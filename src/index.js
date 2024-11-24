require('dotenv').config();
const MovieSearchBot = require('./bot/MovieSearchBot');

const bot = new MovieSearchBot();
console.log('🚀 Bot iniciado exitosamente!');