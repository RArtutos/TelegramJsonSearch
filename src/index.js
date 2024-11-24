import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { setupCommands } from './commands/index.js';
import { logger } from './utils/logger.js';
import { validateJsonFiles } from './utils/jsonValidator.js';
import { initializeDownloadManager } from './services/downloadManager.js';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  logger.error('Token de Telegram no encontrado en variables de entorno');
  process.exit(1);
}

// Validar archivos JSON al inicio
try {
  await validateJsonFiles();
} catch (error) {
  logger.error('Error validando archivos JSON:', error);
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const downloadManager = initializeDownloadManager();

// Configurar comandos del bot
setupCommands(bot, downloadManager);

logger.info('Bot iniciado correctamente');

process.on('SIGINT', () => {
  bot.stopPolling();
  process.exit(0);
});