const axios = require('axios');
const pLimit = require('p-limit');
const { PassThrough } = require('stream');
const { EventEmitter } = require('events');

class ChunkDownloader extends EventEmitter {
  constructor(url, chunkSize = 10 * 1024 * 1024, maxParallel = 5) {
    super();
    this.url = url;
    this.chunkSize = chunkSize;
    this.maxParallel = maxParallel;
    this.downloadedChunks = new Map();
    this.outputStream = new PassThrough();
    this.limit = pLimit(maxParallel);
    this.totalSize = 0;
    this.downloadedBytes = 0;
    this.activeDownloads = 0;
    this.lastEmittedProgress = 0;
  }

  async start() {
    try {
      console.log('Iniciando descarga con ChunkDownloader');
      const response = await axios.head(this.url);
      this.totalSize = parseInt(response.headers['content-length'], 10);
      console.log(`Tamaño total del archivo: ${this.totalSize} bytes`);

      const chunks = this._calculateChunks();
      console.log(`Número total de chunks: ${chunks.length}`);

      const downloads = chunks.map(chunk => this._downloadChunk(chunk));
      
      // Procesar los chunks en orden
      for (const chunk of chunks) {
        await this._downloadChunk(chunk);
        this._emitProgress();
      }

      console.log('Todos los chunks descargados, ensamblando...');
      this._assembleChunks();

      return {
        stream: this.outputStream,
        totalSize: this.totalSize
      };
    } catch (error) {
      console.error('Error en start():', error);
      throw error;
    }
  }

  _calculateChunks() {
    const chunks = [];
    let start = 0;
    
    while (start < this.totalSize) {
      const end = Math.min(start + this.chunkSize, this.totalSize);
      chunks.push({ start, end: end - 1 });
      start = end;
    }
    
    return chunks;
  }

  async _downloadChunk({ start, end }) {
    const retries = 3;
    let attempt = 0;
    this.activeDownloads++;
    this._emitProgress();

    while (attempt < retries) {
      try {
        console.log(`Descargando chunk ${start}-${end} (Intento ${attempt + 1})`);
        const response = await axios({
          method: 'GET',
          url: this.url,
          headers: { Range: `bytes=${start}-${end}` },
          responseType: 'arraybuffer',
          onDownloadProgress: (progressEvent) => {
            const delta = progressEvent.loaded - (progressEvent.lastLoaded || 0);
            this.downloadedBytes += delta;
            progressEvent.lastLoaded = progressEvent.loaded;
            this._emitProgress();
          }
        });

        this.downloadedChunks.set(start, response.data);
        this.activeDownloads--;
        this._emitProgress();
        console.log(`Chunk ${start}-${end} descargado correctamente`);
        return;
      } catch (error) {
        console.error(`Error en chunk ${start}-${end} (Intento ${attempt + 1}):`, error.message);
        attempt++;
        if (attempt === retries) {
          this.activeDownloads--;
          this._emitProgress();
          throw new Error(`Error descargando chunk ${start}-${end} después de ${retries} intentos`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  _assembleChunks() {
    console.log('Ensamblando chunks...');
    const sortedChunks = Array.from(this.downloadedChunks.entries())
      .sort(([a], [b]) => a - b);

    for (const [, chunk] of sortedChunks) {
      this.outputStream.write(chunk);
    }

    this.outputStream.end();
    console.log('Chunks ensamblados y stream finalizado');
  }

  _emitProgress() {
    // Emitir progreso cada 1% de cambio
    const currentProgress = Math.floor((this.downloadedBytes / this.totalSize) * 100);
    if (currentProgress !== this.lastEmittedProgress) {
      this.emit('progress', {
        downloadedBytes: this.downloadedBytes,
        totalSize: this.totalSize,
        percent: currentProgress,
        activeChunks: this.activeDownloads
      });
      this.lastEmittedProgress = currentProgress;
    }
  }
}

module.exports = ChunkDownloader;