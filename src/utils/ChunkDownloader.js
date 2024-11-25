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
    this.aborted = false;
    this.lastSpeedUpdate = Date.now();
    this.speedSamples = [];
    this.SPEED_SAMPLE_SIZE = 5;
  }

  abort() {
    this.aborted = true;
    this.downloadedChunks.clear();
    this.activeDownloads = 0;
    this.downloadedBytes = 0;
    if (!this.outputStream.destroyed) {
      this.outputStream.end();
    }
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
      
      try {
        await Promise.all(downloadPromises);
        if (!this.aborted) {
          this._assembleChunks();
        }
      } catch (error) {
        if (!this.aborted) {
          throw error;
        }
      }
      
      return {
        stream: this.outputStream,
        totalSize: this.totalSize
      };
    } catch (error) {
      if (!this.outputStream.destroyed) {
        this.outputStream.destroy(error);
      }
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

  _updateSpeed(bytesIncrement) {
    const now = Date.now();
    const timeDiff = (now - this.lastSpeedUpdate) / 1000; // en segundos
    if (timeDiff > 0) {
      const speed = bytesIncrement / timeDiff;
      this.speedSamples.push(speed);
      
      // Mantener solo las últimas N muestras
      if (this.speedSamples.length > this.SPEED_SAMPLE_SIZE) {
        this.speedSamples.shift();
      }
      
      this.lastSpeedUpdate = now;
    }
  }

  _getCurrentSpeed() {
    if (this.speedSamples.length === 0) return 0;
    // Calcular la media de las últimas muestras
    const sum = this.speedSamples.reduce((a, b) => a + b, 0);
    return sum / this.speedSamples.length;
  }

  async _downloadChunk(chunk) {
    if (this.aborted) return;

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries && !this.aborted) {
      try {
        this.activeDownloads++;
        this._emitProgress();

        let lastProgress = 0;
        const response = await axios({
          method: 'GET',
          url: this.url,
          headers: { Range: `bytes=${chunk.start}-${chunk.end}` },
          responseType: 'arraybuffer',
          onDownloadProgress: (progressEvent) => {
            if (this.aborted) return;
            const increment = progressEvent.loaded - lastProgress;
            this.downloadedBytes += increment;
            this._updateSpeed(increment);
            lastProgress = progressEvent.loaded;
            this._emitProgress();
          }
        });

        if (!this.aborted) {
          this.downloadedChunks.set(chunk.start, response.data);
        }
        this.activeDownloads--;
        this._emitProgress();
        return;
      } catch (error) {
        attempt++;
        this.activeDownloads--;
        
        if (attempt === maxRetries && !this.aborted) {
          throw new Error(`Error al descargar chunk ${chunk.start}-${chunk.end}: ${error.message}`);
        }
        
        if (!this.aborted) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
  }

  _assembleChunks() {
    if (this.aborted) return;

    const sortedChunks = Array.from(this.downloadedChunks.entries())
      .sort(([a], [b]) => a - b);

    for (const [, chunk] of sortedChunks) {
      if (this.aborted) break;
      this.outputStream.write(chunk);
    }

    if (!this.aborted) {
      this.outputStream.end();
    }
  }

  _emitProgress() {
    if (!this.aborted) {
      this.emit('progress', {
        downloadedBytes: this.downloadedBytes,
        totalSize: this.totalSize,
        activeChunks: this.activeDownloads,
        speed: this._getCurrentSpeed()
      });
    }
  }
}

module.exports = ChunkDownloader;