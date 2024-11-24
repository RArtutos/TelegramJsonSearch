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
      
      if (fs.existsSync('./data/pelis.json')) {
        const rawMovieData = JSON.parse(fs.readFileSync('./data/pelis.json', 'utf8'));
        this.movieData = this._processMovies(rawMovieData.movies || []);
      } else {
        console.warn('pelis.json not found, initializing empty movie list');
        this.movieData = [];
      }
      
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
      name: movie.name || movie.title,
      type: 'movie',
      mimeType: movie.mimeType,
      hasLocal: true
    }));
  }

  _processSeries(series) {
    return series.map(show => {
      const processedShow = {
        id: show.id,
        name: show.name || show.title,
        type: 'series',
        hasLocal: true,
        seasons: []
      };

      if (show.children && Array.isArray(show.children)) {
        processedShow.seasons = this._processSeasons(show.children, show.id);
      }

      return processedShow;
    });
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
      .filter(episode => episode.type === 'file' && episode.mimeType?.includes('video'))
      .map(episode => ({
        id: episode.id,
        name: episode.name,
        seasonId: seasonId,
        mimeType: episode.mimeType
      }));
  }

  _createSearchIndices() {
    const fuseOptions = {
      keys: ['name'],
      threshold: 0.4,
      includeScore: true
    };

    this.searchIndex.movies = new Fuse(this.movieData, fuseOptions);
    this.searchIndex.series = new Fuse(this.seriesData, fuseOptions);
  }

  async searchContent(query, type = 'movie') {
    console.log(`Searching ${type}: "${query}"`);
    
    const searchResults = type === 'movie' ? 
      this.searchIndex.movies.search(query) :
      this.searchIndex.series.search(query);

    return searchResults
      .filter(result => result.score < 0.4)
      .map(result => ({
        ...result.item,
        score: result.score
      }));
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

      // Buscar en episodios
      for (const series of this.seriesData) {
        for (const season of series.seasons) {
          const episode = season.episodes.find(e => e.id === id);
          if (episode) return episode;
        }
      }
    }
    
    return null;
  }

  getSystemStatus() {
    return {
      totalMovies: this.movieData.length,
      totalSeries: this.seriesData.length,
      activeDownloads: this.activeDownloads.size,
      uptime: (Date.now() - this.startTime) / 1000
    };
  }
}

module.exports = MovieDataManager;