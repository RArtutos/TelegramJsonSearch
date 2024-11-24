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
  }

  async start() {
    try {
      const response = await axios.head(this.url);
      this.totalSize = parseInt(response.headers['content-length'], 10);
      
      if (!this.totalSize) {
        throw new Error('No se pudo determinar el tamaño del archivo');
      }

      const chunks = this._calculateChunks();
      const downloadPromises = chunks.map(chunk => this._downloadChunk(chunk));
      await Promise.all(downloadPromises);
      
      this._assembleChunks();
      
      return {
        stream: this.outputStream,
        totalSize: this.totalSize
      };
    } catch (error) {
      this.outputStream.destroy(error);
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

  async _downloadChunk(chunk) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        this.activeDownloads++;
        this._emitProgress();

        const response = await axios({
          method: 'GET',
          url: this.url,
          headers: { Range: `bytes=${chunk.start}-${chunk.end}` },
          responseType: 'arraybuffer',
          onDownloadProgress: (progressEvent) => {
            const increment = progressEvent.loaded - (progressEvent.lastLoaded || 0);
            this.downloadedBytes += increment;
            progressEvent.lastLoaded = progressEvent.loaded;
            this._emitProgress();
          }
        });

        this.downloadedChunks.set(chunk.start, response.data);
        this.activeDownloads--;
        this._emitProgress();
        return;
      } catch (error) {
        attempt++;
        this.activeDownloads--;
        
        if (attempt === maxRetries) {
          throw new Error(`Error al descargar chunk ${chunk.start}-${chunk.end}: ${error.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  _assembleChunks() {
    const sortedChunks = Array.from(this.downloadedChunks.entries())
      .sort(([a], [b]) => a - b);

    for (const [, chunk] of sortedChunks) {
      this.outputStream.write(chunk);
    }

    this.outputStream.end();
  }

  _emitProgress() {
    this.emit('progress', {
      downloadedBytes: this.downloadedBytes,
      totalSize: this.totalSize,
      activeChunks: this.activeDownloads
    });
  }
}

module.exports = ChunkDownloader;