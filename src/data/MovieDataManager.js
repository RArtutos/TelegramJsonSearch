const fs = require('fs');
const Fuse = require('fuse.js');

class MovieDataManager {
  constructor() {
    this.movies = [];
    this.series = [];
    this.searchIndices = {
      movies: null,
      series: null
    };
    this.loadData();
  }

  loadData() {
    try {
      const moviesPath = './data/pelis.json';
      const seriesPath = './data/series.json';

      if (fs.existsSync(moviesPath)) {
        const movieData = JSON.parse(fs.readFileSync(moviesPath, 'utf8'));
        this.movies = movieData.movies || [];
      }

      if (fs.existsSync(seriesPath)) {
        const seriesData = JSON.parse(fs.readFileSync(seriesPath, 'utf8'));
        this.series = seriesData.series || [];
      }

      this.initializeSearchIndices();
      console.log(`Loaded ${this.movies.length} movies and ${this.series.length} series`);
    } catch (error) {
      console.error('Error loading data:', error);
      this.movies = [];
      this.series = [];
    }
  }

  initializeSearchIndices() {
    const options = {
      keys: ['name'],
      threshold: 0.4
    };

    this.searchIndices.movies = new Fuse(this.movies, options);
    this.searchIndices.series = new Fuse(this.series, options);
  }

  search(query, type) {
    const index = this.searchIndices[type];
    if (!index) return [];

    return index.search(query).map(result => ({
      ...result.item,
      score: result.score
    }));
  }

  getItem(id, type) {
    if (type === 'movie') {
      return this.movies.find(m => m.id === id);
    }
    return this.series.find(s => s.id === id);
  }

  getSeasons(seriesId) {
    const series = this.series.find(s => s.id === seriesId);
    return series?.children || [];
  }

  getEpisodes(seasonId) {
    for (const series of this.series) {
      for (const season of (series.children || [])) {
        if (season.id === seasonId) {
          return season.children || [];
        }
      }
    }
    return [];
  }
}

module.exports = MovieDataManager;