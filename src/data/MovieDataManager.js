const fs = require('fs');
const axios = require('axios');
const Fuse = require('fuse.js');

class MovieDataManager {
  constructor() {
    this.movieData = [];
    this.seriesData = [];
    this.searchIndex = {
      movies: null,
      series: null
    };
    this.activeDownloads = new Map();
    this.loadData();
  }

  loadData() {
    try {
      const rawMovieData = JSON.parse(fs.readFileSync('./data/pelis.json', 'utf8'));
      const rawSeriesData = JSON.parse(fs.readFileSync('./data/series.json', 'utf8'));
      
      // Aplanar y normalizar datos de películas
      this.movieData = this._flattenAndNormalizeData(rawMovieData, 'movie');
      this.seriesData = this._flattenAndNormalizeData(rawSeriesData, 'series');
      
      // Crear índices de búsqueda
      this._createSearchIndices();
      
      console.log(`Data loaded successfully: ${this.movieData.length} movies, ${this.seriesData.length} series`);
    } catch (error) {
      console.error('Error loading data:', error);
      process.exit(1);
    }
  }

  _flattenAndNormalizeData(data, type) {
    const flattened = [];
    
    const processItem = (item, parentInfo = {}) => {
      const normalizedItem = {
        id: item.id,
        type: item.type || type,
        name: item.name || item.title,
        title: item.title || item.name,
        path: item.path || '',
        mimeType: item.mimeType || '',
        parent: parentInfo,
        ...item
      };

      if (item.type === 'file' && item.mimeType?.includes('video')) {
        flattened.push(normalizedItem);
      }

      if (item.children) {
        item.children.forEach(child => 
          processItem(child, {
            id: normalizedItem.id,
            name: normalizedItem.name,
            type: normalizedItem.type
          })
        );
      }
    };

    data.forEach(item => processItem(item));
    return flattened;
  }

  _createSearchIndices() {
    const fuseOptions = {
      keys: ['name', 'title'],
      threshold: 0.3,
      includeScore: true
    };

    this.searchIndex.movies = new Fuse(this.movieData, fuseOptions);
    this.searchIndex.series = new Fuse(this.seriesData, fuseOptions);
  }

  async searchContent(query, type = 'movie') {
    // Primero buscar en TMDB
    const tmdbResults = await this.searchTMDB(query, type);
    
    // Luego buscar en datos locales
    const localResults = this.searchIndex[type === 'movie' ? 'movies' : 'series']
      .search(query)
      .filter(result => result.score < 0.3) // Solo resultados con buena coincidencia
      .map(result => result.item);

    // Combinar y deduplicar resultados
    return this._mergeResults(tmdbResults, localResults, type);
  }

  async searchTMDB(query, type = 'movie') {
    try {
      const response = await axios.get(`https://api.themoviedb.org/3/search/${type}`, {
        params: {
          api_key: process.env.TMDB_API_KEY,
          query,
          language: 'es-MX'
        }
      });
      return response.data.results;
    } catch (error) {
      console.error('TMDB API error:', error);
      return [];
    }
  }

  _mergeResults(tmdbResults, localResults, type) {
    const merged = new Map();

    // Agregar resultados locales
    localResults.forEach(item => {
      merged.set(item.id, {
        ...item,
        source: 'local'
      });
    });

    // Agregar y combinar con resultados de TMDB
    tmdbResults.forEach(tmdbItem => {
      const localMatch = localResults.find(local => 
        local.title?.toLowerCase() === tmdbItem.title?.toLowerCase() ||
        local.name?.toLowerCase() === tmdbItem.name?.toLowerCase()
      );

      if (localMatch) {
        merged.set(localMatch.id, {
          ...localMatch,
          tmdbInfo: tmdbItem,
          source: 'both'
        });
      }
    });

    return Array.from(merged.values());
  }

  getSeasons(seriesId) {
    return this.seriesData
      .filter(item => 
        item.parent?.id === seriesId && 
        item.type === 'directory' &&
        item.name.toLowerCase().includes('season')
      )
      .sort((a, b) => {
        const numA = parseInt(a.name.match(/\d+/)?.[0] || 0);
        const numB = parseInt(b.name.match(/\d+/)?.[0] || 0);
        return numA - numB;
      });
  }

  getEpisodes(seasonId) {
    return this.seriesData
      .filter(item => 
        item.parent?.id === seasonId && 
        item.type === 'file' &&
        item.mimeType?.includes('video')
      )
      .sort((a, b) => {
        const numA = parseInt(a.name.match(/\d+/)?.[0] || 0);
        const numB = parseInt(b.name.match(/\d+/)?.[0] || 0);
        return numA - numB;
      });
  }

  getItemById(id, type = 'any') {
    if (type === 'movie' || type === 'any') {
      const movie = this.movieData.find(m => m.id === id);
      if (movie) return movie;
    }
    
    if (type === 'series' || type === 'any') {
      const series = this.seriesData.find(s => s.id === id);
      if (series) return series;
    }
    
    return null;
  }

  // Métodos para gestión de descargas activas
  addActiveDownload(userId, downloadInfo) {
    this.activeDownloads.set(userId, downloadInfo);
  }

  removeActiveDownload(userId) {
    this.activeDownloads.delete(userId);
  }

  getActiveDownloads() {
    return Array.from(this.activeDownloads.entries()).map(([userId, info]) => ({
      userId,
      ...info
    }));
  }

  getSystemStatus() {
    return {
      totalMovies: this.movieData.length,
      totalSeries: this.seriesData.length,
      activeDownloads: this.activeDownloads.size,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
  }
}

module.exports = MovieDataManager;