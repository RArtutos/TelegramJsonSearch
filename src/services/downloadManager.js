import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import PQueue from 'p-queue';
import { logger } from '../utils/logger.js';
import { sendFileToTelegram } from './telegramService.js';

const DOWNLOAD_CONCURRENT_LIMIT = 2;
const queue = new PQueue({ concurrency: DOWNLOAD_CONCURRENT_LIMIT });
const downloads = new Map();
let downloadIdCounter = 1;

// Directorio para descargas persistente
const DOWNLOADS_DIR = '/app/downloads';

export function initializeDownloadManager() {
  // Crear directorio de descargas si no existe
  fs.mkdir(DOWNLOADS_DIR, { recursive: true })
    .catch(err => logger.error('Error creando directorio de descargas:', err));

  return {
    startDownload,
    getDownloadStatus,
    getAllDownloads,
    cancelDownload
  };
}

export async function startDownload({ type, id, quality, chatId }) {
  const downloadId = downloadIdCounter++;
  
  const downloadInfo = {
    id: downloadId,
    type,
    fileId: id,
    quality,
    progress: 0,
    status: 'pending',
    chatId,
    downloadedSize: 0,
    totalSize: 0
  };
  
  downloads.set(downloadId, downloadInfo);
  
  queue.add(() => processDownload(downloadInfo));
  
  return downloadId;
}

async function processDownload(downloadInfo) {
  try {
    const { fileId, quality, chatId } = downloadInfo;
    const qualityMap = {
      '1080': '37',
      '720': '22',
      '360': '18'
    };
    
    const itag = qualityMap[quality];
    const url = `https://pelis.gbstream.us.kg/api/v1/redirectdownload/${fileId}.mp4?a=0&id=${fileId}&itag=${itag}`;
    
    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream'
    });
    
    downloadInfo.totalSize = parseInt(response.headers['content-length'], 10);
    downloads.set(downloadInfo.id, downloadInfo);
    
    const fileName = `download-${downloadInfo.id}.mp4`;
    const filePath = path.join(DOWNLOADS_DIR, fileName);
    const writer = fs.createWriteStream(filePath);
    
    response.data.on('data', (chunk) => {
      downloadInfo.downloadedSize += chunk.length;
      const progress = Math.round((downloadInfo.downloadedSize / downloadInfo.totalSize) * 100);
      updateDownloadProgress(downloadInfo.id, progress);
    });
    
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
      response.data.pipe(writer);
    });
    
    // Enviar a Telegram
    await sendFileToTelegram(chatId, filePath);
    
    // Limpiar
    await fs.unlink(filePath);
    downloads.delete(downloadInfo.id);
    
  } catch (error) {
    logger.error(`Error en descarga ${downloadInfo.id}:`, error);
    downloadInfo.status = 'error';
    downloads.set(downloadInfo.id, downloadInfo);
  }
}

function updateDownloadProgress(downloadId, progress) {
  const download = downloads.get(downloadId);
  if (download) {
    download.progress = progress;
    downloads.set(downloadId, download);
  }
}

export function getDownloadStatus(downloadId) {
  return downloads.get(parseInt(downloadId));
}

export function getAllDownloads() {
  return Array.from(downloads.values());
}

export function cancelDownload(downloadId) {
  const download = downloads.get(downloadId);
  if (download) {
    download.status = 'cancelled';
    downloads.set(downloadId, download);
    return true;
  }
  return false;
}