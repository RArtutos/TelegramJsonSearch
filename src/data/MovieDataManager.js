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
        this.movieData = this._processMovies(rawMovieData);
      } else {
        console.warn('pelis.json not found, initializing empty movie list');
        this.movieData = [];
      }
      
      // Load series
      if (fs.existsSync('./data/series.json')) {
        const rawSeriesData = JSON.parse(fs.readFileSync('./data/series.json', 'utf8'));
        this.seriesData = this._processSeries(rawSeriesData);
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

  _processMovies(data) {
    const movies = [];
    data.forEach(category => {
      if (category.children && Array.isArray(category.children)) {
        category.children.forEach(movie => {
          if (movie.type === 'file' || movie.mimeType?.includes('video')) {
            movies.push({
              id: movie.id,
              title: movie.title || '',
              name: movie.name || '',
              overview: movie.overview || '',
              posterPath: movie.posterPath || '',
              backdropPath: movie.backdropPath || '',
              releaseDate: movie.releaseDate || '',
              genres: movie.genres || [],
              voteAverage: movie.voteAverage || 0,
              popularity: movie.popularity || 0,
              type: 'movie',
              categoryId: category.id,
              apiId: movie.apiId || null
            });
          }
        });
      }
    });
    return movies;
  }

  _processSeries(data) {
    const series = [];
    data.forEach(category => {
      if (category.children && Array.isArray(category.children)) {
        category.children.forEach(show => {
          if (show.type === 'directory' && show.children) {
            const seriesObj = {
              id: show.id,
              title: show.title || '',
              name: show.name || '',
              overview: show.overview || '',
              posterPath: show.posterPath || '',
              backdropPath: show.backdropPath || '',
              releaseDate: show.releaseDate || '',
              genres: show.genres || [],
              voteAverage: show.voteAverage || 0,
              popularity: show.popularity || 0,
              type: 'series',
              categoryId: category.id,
              apiId: show.apiId || null,
              seasons: this._processSeasons(show.children, show.id)
            };
            series.push(seriesObj);
          }
        });
      }
    });
    return series;
  }

  _processSeasons(seasons, seriesId) {
    return seasons.map(season => ({
      id: season.id,
      name: season.name,
      seriesId: seriesId,
      episodes: this._processEpisodes(season.children || [], season.id)
    }));
  }

  _processEpisodes(episodes, seasonId) {
    return episodes
      .filter(episode => episode.type === 'file')
      .map(episode => ({
        id: episode.id,
        name: episode.name,
        seasonId: seasonId,
        mimeType: episode.mimeType
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
      
      // Local Search with TMDB results
      const tmdbLocalResults = await this._searchLocalByTMDB(tmdbResults, type);
      
      // Direct Local Search with query
      const directLocalResults = this._searchLocalByQuery(query, type);
      
      // Combine and deduplicate results
      const combinedResults = this._combineResults(tmdbResults, tmdbLocalResults, directLocalResults);
      
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
        type: type,
        release_date: item.release_date || item.first_air_date
      }));
    } catch (error) {
      console.error('TMDB search error:', error);
      return [];
    }
  }

  _searchLocalByTMDB(tmdbResults, type) {
    const localResults = [];
    const searchData = type === 'movie' ? this.movieData : this.seriesData;
    
    tmdbResults.forEach(tmdbItem => {
      const matches = searchData.filter(item => {
        const titleMatch = item.title?.toLowerCase() === tmdbItem.title?.toLowerCase();
        const nameMatch = item.name?.toLowerCase() === tmdbItem.title?.toLowerCase();
        const apiIdMatch = item.apiId === tmdbItem.tmdbId;
        return titleMatch || nameMatch || apiIdMatch;
      });
      
      matches.forEach(match => {
        localResults.push({
          ...match,
          tmdbInfo: tmdbItem,
          matchType: 'tmdb'
        });
      });
    });
    
    return localResults;
  }

  _searchLocalByQuery(query, type) {
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
          matchType: 'direct',
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
          matchType: 'fuzzy',
          score: result.score
        }));
      
      results.push(...fuzzyResults);
    }

    return results;
  }

  _combineResults(tmdbResults, tmdbLocalResults, directLocalResults) {
    const combined = new Map();
    
    // Add TMDB-matched local results first (highest priority)
    tmdbLocalResults.forEach(item => {
      const key = `${item.title || item.name}-${item.id}`.toLowerCase();
      if (!combined.has(key)) {
        combined.set(key, {
          ...item,
          hasLocal: true,
          hasTMDB: true,
          priority: 1
        });
      }
    });
    
    // Add direct local results
    directLocalResults.forEach(item => {
      const key = `${item.title || item.name}-${item.id}`.toLowerCase();
      if (!combined.has(key)) {
        combined.set(key, {
          ...item,
          hasLocal: true,
          hasTMDB: false,
          priority: 2
        });
      }
    });
    
    // Add remaining TMDB results
    tmdbResults.forEach(item => {
      const key = `${item.title}-${item.tmdbId}`.toLowerCase();
      if (!combined.has(key)) {
        combined.set(key, {
          ...item,
          hasLocal: false,
          hasTMDB: true,
          priority: 3
        });
      }
    });
    
    // Convert to array and sort
    return Array.from(combined.values())
      .sort((a, b) => {
        // Sort by priority first
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        // Then by score if available
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