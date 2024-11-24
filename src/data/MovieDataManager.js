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
        const rawMovies = JSON.parse(fs.readFileSync(moviesPath, 'utf8'));
        this.movies = this.processMovies(rawMovies);
      }

      if (fs.existsSync(seriesPath)) {
        const rawSeries = JSON.parse(fs.readFileSync(seriesPath, 'utf8'));
        this.series = this.processSeries(rawSeries);
      }

      this.initializeSearchIndices();
      console.log(`Loaded ${this.movies.length} movies and ${this.series.length} series`);
    } catch (error) {
      console.error('Error loading data:', error);
      this.movies = [];
      this.series = [];
    }
  }

  processMovies(data) {
    const movies = [];
    const processFolder = (folder) => {
      if (folder.children) {
        folder.children.forEach(item => {
          if (item.type === 'file') {
            movies.push({
              id: item.id,
              name: item.title || this.cleanName(item.name),
              overview: item.overview,
              posterPath: item.posterPath,
              backdropPath: item.backdropPath,
              releaseDate: item.releaseDate,
              genres: item.genres,
              voteAverage: item.voteAverage,
              mimeType: item.mimeType
            });
          } else if (item.type === 'directory') {
            processFolder(item);
          }
        });
      }
    };

    processFolder(data);
    return movies;
  }

  processSeries(data) {
    const series = [];
    const processFolder = (folder) => {
      if (folder.type === 'directory' && folder.title) {
        const seriesData = {
          id: folder.id,
          name: folder.title,
          overview: folder.overview,
          posterPath: folder.posterPath,
          backdropPath: folder.backdropPath,
          releaseDate: folder.releaseDate,
          genres: folder.genres,
          voteAverage: folder.voteAverage,
          seasons: []
        };

        // Procesar las carpetas hijas como temporadas
        if (folder.children) {
          folder.children.forEach(child => {
            if (child.type === 'directory') {
              const seasonData = {
                id: child.id,
                name: child.name,
                parentId: seriesData.id,
                episodes: []
              };

              // Procesar los archivos como episodios
              if (child.children) {
                child.children.forEach(episode => {
                  if (episode.type === 'file') {
                    seasonData.episodes.push({
                      id: episode.id,
                      name: this.cleanName(episode.name),
                      mimeType: episode.mimeType,
                      parentId: seasonData.id
                    });
                  }
                });
              }

              if (seasonData.episodes.length > 0) {
                seriesData.seasons.push(seasonData);
              }
            }
          });
        }

        if (seriesData.seasons.length > 0) {
          series.push(seriesData);
        }
      } else if (folder.children) {
        folder.children.forEach(item => processFolder(item));
      }
    };

    processFolder(data);
    return series;
  }

  cleanName(name) {
    return name
      .replace(/\.[^/.]+$/, '')
      .replace(/\b(480|720|1080)p\b/g, '')
      .replace(/\bWEB-DL\b/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/S\d{2}E\d{2}/i, '') // Elimina marcadores de episodio
      .trim();
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

  getEpisodes(seasonId) {
    for (const series of this.series) {
      for (const season of series.seasons) {
        if (season.id === seasonId) {
          return season.episodes;
        }
      }
    }
    return [];
  }

  getSeriesFromSeasonId(seasonId) {
    return this.series.find(series => 
      series.seasons.some(season => season.id === seasonId)
    );
  }
}

module.exports = MovieDataManager;