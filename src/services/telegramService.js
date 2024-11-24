import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import { logger } from '../utils/logger.js';

const options = {
  polling: true
};

if (process.env.USE_LOCAL_API === 'true') {
  options.baseApiUrl = process.env.TELEGRAM_API_URL;
  logger.info('Usando Bot API Server local');
}

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, options);

export async function sendFileToTelegram(chatId, filePath) {
  try {
    if (process.env.USE_LOCAL_API === 'true') {
      // Con API local podemos usar directamente el path del archivo
      await bot.sendDocument(chatId, filePath, {
        caption: 'Archivo descargado exitosamente'
      });
    } else {
      // Fallback para API remota
      const fileStream = fs.createReadStream(filePath);
      await bot.sendDocument(chatId, fileStream, {
        caption: 'Archivo descargado exitosamente'
      });
    }
  } catch (error) {
    logger.error('Error enviando archivo a Telegram:', error);
    throw error;
  }
}