const fs = require('fs');
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
      console.log('Iniciando carga de datos...');
      
      // Verificar y cargar películas
      if (!fs.existsSync('./data/pelis.json')) {
        throw new Error('Archivo pelis.json no encontrado en ./data/');
      }
      const rawMovieData = JSON.parse(fs.readFileSync('./data/pelis.json', 'utf8'));
      
      // Verificar y cargar series
      if (!fs.existsSync('./data/series.json')) {
        throw new Error('Archivo series.json no encontrado en ./data/');
      }
      const rawSeriesData = JSON.parse(fs.readFileSync('./data/series.json', 'utf8'));
      
      // Procesar datos
      this.processData(rawMovieData, rawSeriesData);
      
      console.log(`Datos cargados: ${this.movieData.length} películas, ${this.seriesData.length} series`);
    } catch (error) {
      console.error('Error crítico al cargar datos:', error);
      process.exit(1);
    }
  }

  processData(movieData, seriesData) {
    // Procesar películas
    const processMovies = (items, parentPath = '') => {
      items.forEach(item => {
        if (item.type === 'file' && item.mimeType?.includes('video')) {
          this.movieData.push({
            id: item.id,
            title: item.title || '',
            name: item.name || '',
            path: parentPath + '/' + (item.path || ''),
            type: 'movie'
          });
        } else if (item.children && Array.isArray(item.children)) {
          const newPath = parentPath + '/' + (item.path || '');
          processMovies(item.children, newPath);
        }
      });
    };

    // Procesar series
    const processSeries = (items, parentPath = '') => {
      items.forEach(item => {
        if (item.type === 'directory') {
          const series = {
            id: item.id,
            title: item.title || '',
            name: item.name || '',
            path: parentPath + '/' + (item.path || ''),
            type: 'series',
            seasons: []
          };

          if (item.children && Array.isArray(item.children)) {
            item.children.forEach(season => {
              if (season.type === 'directory') {
                const seasonObj = {
                  id: season.id,
                  name: season.name || '',
                  episodes: []
                };

                if (season.children && Array.isArray(season.children)) {
                  season.children.forEach(episode => {
                    if (episode.type === 'file' && episode.mimeType?.includes('video')) {
                      seasonObj.episodes.push({
                        id: episode.id,
                        name: episode.name || '',
                        path: parentPath + '/' + season.path + '/' + (episode.path || ''),
                        type: 'episode'
                      });
                    }
                  });
                }

                if (seasonObj.episodes.length > 0) {
                  series.seasons.push(seasonObj);
                }
              }
            });
          }

          if (series.seasons.length > 0) {
            this.seriesData.push(series);
          }
        }
      });
    };

    // Procesar los datos
    if (Array.isArray(movieData)) {
      processMovies(movieData);
    } else if (movieData.movies && Array.isArray(movieData.movies)) {
      processMovies(movieData.movies);
    }

    if (Array.isArray(seriesData)) {
      processSeries(seriesData);
    } else if (seriesData.series && Array.isArray(seriesData.series)) {
      processSeries(seriesData.series);
    }

    // Crear índices de búsqueda
    this._createSearchIndices();
  }

  _createSearchIndices() {
    const fuseOptions = {
      keys: ['title', 'name'],
      threshold: 0.4,
      includeScore: true,
      useExtendedSearch: true
    };

    this.searchIndex.movies = new Fuse(this.movieData, fuseOptions);
    this.searchIndex.series = new Fuse(this.seriesData, fuseOptions);
  }

  searchContent(query, type = 'movie') {
    console.log(`Buscando ${type}: "${query}"`);
    
    const searchData = type === 'movie' ? this.movieData : this.seriesData;
    const results = [];
    
    // Búsqueda directa (coincidencia exacta o contiene)
    searchData.forEach(item => {
      const title = (item.title || '').toLowerCase();
      const name = (item.name || '').toLowerCase();
      const searchTerm = query.toLowerCase();
      
      if (title.includes(searchTerm) || name.includes(searchTerm)) {
        results.push({
          ...item,
          score: title === searchTerm || name === searchTerm ? 0 : 0.1
        });
      }
    });

    // Si no hay resultados exactos, usar búsqueda fuzzy
    if (results.length === 0) {
      const fuzzyResults = this.searchIndex[type === 'movie' ? 'movies' : 'series']
        .search(query)
        .filter(result => result.score < 0.4)
        .map(result => ({
          ...result.item,
          score: result.score
        }));
      
      results.push(...fuzzyResults);
    }

    // Ordenar por relevancia
    results.sort((a, b) => a.score - b.score);

    console.log(`Resultados encontrados: ${results.length}`);
    return results;
  }

  getSeasons(seriesId) {
    const series = this.seriesData.find(s => s.id === seriesId);
    return series?.seasons || [];
  }

  getEpisodes(seasonId) {
    for (const series of this.seriesData) {
      for (const season of series.seasons) {
        if (season.id === seasonId) {
          return season.episodes;
        }
      }
    }
    return [];
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