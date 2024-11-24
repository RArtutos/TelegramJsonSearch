const fs = require('fs');
const Fuse = require('fuse.js');
const axios = require('axios');

class MovieDataManager {
  constructor() {
    this.movieData = [];
    this.seriesData = [];
    this.searchIndex = {
      movies: null,
      series: null
    };
    this.activeDownloads = new Map();
    this.startTime = Date.now();
    this.loadData();
  }

  loadData() {
    try {
      console.log('Loading data from JSON files...');
      
      // Load movies
      if (fs.existsSync('./data/pelis.json')) {
        const rawMovieData = JSON.parse(fs.readFileSync('./data/pelis.json', 'utf8'));
        this.movieData = this._processMovies(rawMovieData.movies || []);
      } else {
        console.warn('pelis.json not found, initializing empty movie list');
        this.movieData = [];
      }
      
      // Load series
      if (fs.existsSync('./data/series.json')) {
        const rawSeriesData = JSON.parse(fs.readFileSync('./data/series.json', 'utf8'));
        this.seriesData = this._processSeries(rawSeriesData.series || []);
      } else {
        console.warn('series.json not found, initializing empty series list');
        this.seriesData = [];
      }
      
      this._createSearchIndices();
      console.log(`Loaded ${this.movieData.length} movies and ${this.seriesData.length} series`);
    } catch (error) {
      console.error('Critical error loading data:', error);
      process.exit(1);
    }
  }

  _processMovies(movies) {
    return movies.map(movie => ({
      id: movie.id,
      title: movie.title || '',
      name: movie.name || '',
      path: movie.path || '',
      type: 'movie'
    }));
  }

  _processSeries(series) {
    return series.map(show => ({
      id: show.id,
      title: show.title || '',
      name: show.name || '',
      type: 'series',
      seasons: this._processSeasons(show.children || [])
    }));
  }

  _processSeasons(seasons) {
    return seasons.map(season => ({
      id: season.id,
      name: season.name || '',
      episodes: this._processEpisodes(season.children || [])
    }));
  }

  _processEpisodes(episodes) {
    return episodes.filter(episode => episode.type === 'file')
      .map(episode => ({
        id: episode.id,
        name: episode.name || '',
        path: episode.path || '',
        type: 'episode'
      }));
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

  async searchContent(query, type = 'movie') {
    console.log(`Searching ${type}: "${query}"`);
    
    try {
      // TMDB Search
      const tmdbResults = await this._searchTMDB(query, type);
      
      // Local Search
      const localResults = this._searchLocal(query, type);
      
      // Combine and deduplicate results
      const combinedResults = this._combineResults(tmdbResults, localResults, type);
      
      console.log(`Found ${combinedResults.length} results`);
      return combinedResults;
    } catch (error) {
      console.error('Search error:', error);
      return [];
    }
  }

  async _searchTMDB(query, type) {
    try {
      const endpoint = type === 'movie' ? 'movie' : 'tv';
      const response = await axios.get(`https://api.themoviedb.org/3/search/${endpoint}`, {
        params: {
          api_key: process.env.TMDB_API_KEY,
          query,
          language: 'es-MX'
        }
      });
      return response.data.results.map(item => ({
        tmdbId: item.id,
        title: item.title || item.name,
        overview: item.overview,
        poster_path: item.poster_path,
        type: type
      }));
    } catch (error) {
      console.error('TMDB search error:', error);
      return [];
    }
  }

  _searchLocal(query, type) {
    const searchData = type === 'movie' ? this.movieData : this.seriesData;
    const results = [];
    
    // Direct search
    const lowercaseQuery = query.toLowerCase();
    searchData.forEach(item => {
      const title = (item.title || '').toLowerCase();
      const name = (item.name || '').toLowerCase();
      
      if (title.includes(lowercaseQuery) || name.includes(lowercaseQuery)) {
        results.push({
          ...item,
          score: title === lowercaseQuery || name === lowercaseQuery ? 0 : 0.1
        });
      }
    });

    // Fuzzy search if no direct matches
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

    return results;
  }

  _combineResults(tmdbResults, localResults, type) {
    const combined = new Map();
    
    // Add local results
    localResults.forEach(item => {
      const key = (item.title || item.name).toLowerCase();
      if (!combined.has(key)) {
        combined.set(key, {
          ...item,
          hasLocal: true,
          hasTMDB: false
        });
      }
    });
    
    // Add TMDB results
    tmdbResults.forEach(item => {
      const key = item.title.toLowerCase();
      if (combined.has(key)) {
        // Merge with existing local result
        const existing = combined.get(key);
        combined.set(key, {
          ...existing,
          hasTMDB: true,
          tmdbInfo: item
        });
      } else {
        // Add new TMDB-only result
        combined.set(key, {
          ...item,
          hasLocal: false,
          hasTMDB: true
        });
      }
    });
    
    // Convert to array and sort
    return Array.from(combined.values())
      .sort((a, b) => {
        // Prioritize items that exist both locally and in TMDB
        if (a.hasLocal && a.hasTMDB && (!b.hasLocal || !b.hasTMDB)) return -1;
        if (b.hasLocal && b.hasTMDB && (!a.hasLocal || !a.hasTMDB)) return 1;
        // Then prioritize local items
        if (a.hasLocal && !b.hasLocal) return -1;
        if (b.hasLocal && !a.hasLocal) return 1;
        // Finally sort by score if available
        return (a.score || 0) - (b.score || 0);
      });
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
      uptime: (Date.now() - this.startTime) / 1000
    };
  }
}

module.exports = MovieDataManager;