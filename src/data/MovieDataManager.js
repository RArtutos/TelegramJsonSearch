const fs = require('fs');
const axios = require('axios');

class MovieDataManager {
  constructor() {
    this.movieData = [];
    this.seriesData = [];
    this.loadData();
  }

  loadData() {
    try {
      this.movieData = JSON.parse(fs.readFileSync('./data/pelis.json', 'utf8'));
      this.seriesData = JSON.parse(fs.readFileSync('./data/series.json', 'utf8'));
      console.log('Data loaded successfully');
    } catch (error) {
      console.error('Error loading data:', error);
      process.exit(1);
    }
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

  findInLocalData(tmdbTitle, type = 'movie') {
    const data = type === 'movie' ? this.movieData : this.seriesData;
    const items = [];
    
    for (const category of data) {
      if (category.children) {
        for (const item of category.children) {
          if (type === 'movie') {
            if (item.title?.toLowerCase() === tmdbTitle.toLowerCase()) {
              items.push(item);
            }
          } else {
            if (item.title?.toLowerCase() === tmdbTitle.toLowerCase() || 
                item.name?.toLowerCase() === tmdbTitle.toLowerCase()) {
              items.push({
                ...item,
                seasons: this.getSeasons(item.id)
              });
            }
          }
        }
      }
    }
    
    return items;
  }

  getAllMovies() {
    const movies = [];
    for (const category of this.movieData) {
      if (category.children) {
        for (const movie of category.children) {
          movies.push({
            id: movie.id,
            name: movie.name || movie.title,
            size: movie.size,
            quality: movie.quality || 'Unknown',
            dateAdded: movie.dateAdded || new Date().toISOString()
          });
        }
      }
    }
    return movies;
  }

  getAllSeries() {
    const series = [];
    for (const category of this.seriesData) {
      if (category.children) {
        for (const serie of category.children) {
          series.push({
            id: serie.id,
            name: serie.name || serie.title,
            size: serie.size,
            seasons: this.getSeasonCount(serie.id),
            dateAdded: serie.dateAdded || new Date().toISOString()
          });
        }
      }
    }
    return series;
  }

  getSeasonCount(seriesId) {
    const series = this.findSeriesById(seriesId);
    if (!series || !series.children) return 0;
    return series.children.filter(child => 
      child.type === 'directory' && 
      child.name.toLowerCase().includes('season')
    ).length;
  }

  getStats() {
    let totalSize = 0;
    let totalMovies = 0;
    let totalSeries = 0;

    // Calculate movies stats
    for (const category of this.movieData) {
      if (category.children) {
        totalMovies += category.children.length;
        for (const movie of category.children) {
          totalSize += movie.size || 0;
        }
      }
    }

    // Calculate series stats
    for (const category of this.seriesData) {
      if (category.children) {
        totalSeries += category.children.length;
        for (const series of category.children) {
          if (series.children) {
            for (const season of series.children) {
              if (season.children) {
                for (const episode of season.children) {
                  totalSize += episode.size || 0;
                }
              }
            }
          }
        }
      }
    }

    return {
      totalMovies,
      totalSeries,
      totalSize
    };
  }

  getSeasons(seriesId) {
    const series = this.findSeriesById(seriesId);
    if (!series || !series.children) return [];
    return series.children.filter(child => 
      child.type === 'directory' && 
      child.name.toLowerCase().includes('season')
    );
  }

  getEpisodes(seasonId) {
    for (const category of this.seriesData) {
      for (const series of category.children || []) {
        for (const season of series.children || []) {
          if (season.id === seasonId && season.children) {
            return season.children.filter(child => 
              child.type === 'file' && 
              child.mimeType?.includes('video')
            );
          }
        }
      }
    }
    return [];
  }

  findSeriesById(id) {
    for (const category of this.seriesData) {
      if (category.children) {
        const series = category.children.find(s => s.id === id);
        if (series) return series;
      }
    }
    return null;
  }

  findSeasonById(id) {
    for (const category of this.seriesData) {
      for (const series of category.children || []) {
        for (const season of series.children || []) {
          if (season.id === id) return season;
        }
      }
    }
    return null;
  }

  getMovieById(id) {
    for (const category of this.movieData) {
      if (category.children) {
        const movie = category.children.find(m => m.id === id);
        if (movie) return movie;
      }
    }
    return null;
  }
}

module.exports = MovieDataManager;