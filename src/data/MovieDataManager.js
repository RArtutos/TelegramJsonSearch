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
      console.log('Loading data from JSON files...');
      const moviesPath = './data/pelis.json';
      const seriesPath = './data/series.json';

      if (fs.existsSync(moviesPath)) {
        this.movies = JSON.parse(fs.readFileSync(moviesPath, 'utf8')) || [];
      }

      if (fs.existsSync(seriesPath)) {
        this.series = JSON.parse(fs.readFileSync(seriesPath, 'utf8')) || [];
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

    return index.search(query).map(result => result.item);
  }

  getItem(id, type) {
    const collection = type === 'movies' ? this.movies : this.series;
    return collection.find(item => item.id === id);
  }

  getSeasons(seriesId) {
    const series = this.series.find(s => s.id === seriesId);
    return series?.seasons || [];
  }

  getEpisodes(seasonId, seriesId) {
    const series = this.series.find(s => s.id === seriesId);
    if (!series) return [];
    
    const season = series.seasons?.find(s => s.id === seasonId);
    return season?.episodes || [];
  }
}