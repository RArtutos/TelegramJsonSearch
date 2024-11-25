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
            if (item.title?.toLowerCase() === tmdbTitle.toLowerCase() || 
                item.name?.toLowerCase() === tmdbTitle.toLowerCase()) {
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
          const seasons = this.getSeasons(serie.id);
          let totalEpisodes = 0;
          let totalSize = 0;

          seasons.forEach(season => {
            const episodes = this.getEpisodes(season.id);
            totalEpisodes += episodes.length;
            episodes.forEach(episode => {
              totalSize += episode.size || 0;
            });
          });

          series.push({
            id: serie.id,
            name: serie.name || serie.title,
            seasons: seasons.length,
            episodes: totalEpisodes,
            totalSize,
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
      (child.name.toLowerCase().includes('season') || 
       child.name.toLowerCase().includes('temporada'))
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
      (child.name.toLowerCase().includes('season') || 
       child.name.toLowerCase().includes('temporada'))
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

  getEpisodeById(episodeId) {
    for (const category of this.seriesData) {
      for (const series of category.children || []) {
        for (const season of series.children || []) {
          if (season.children) {
            const episode = season.children.find(ep => ep.id === episodeId);
            if (episode) return episode;
          }
        }
      }
    }
    return null;
  }

  getSeriesInfoByEpisodeId(episodeId) {
    for (const category of this.seriesData) {
      for (const series of category.children || []) {
        for (const season of series.children || []) {
          if (season.children) {
            const episode = season.children.find(ep => ep.id === episodeId);
            if (episode) {
              return {
                seriesName: series.name || series.title,
                seasonName: season.name,
                episodeName: episode.name
              };
            }
          }
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

  getMovieInfoById(id) {
    const movie = this.getMovieById(id);
    if (!movie) return null;
    
    return {
      id: movie.id,
      name: movie.name || movie.title,
      size: movie.size,
      quality: movie.quality || 'Unknown',
      dateAdded: movie.dateAdded || new Date().toISOString()
    };
  }

  getSeriesDetailedInfo(seriesId) {
    const series = this.findSeriesById(seriesId);
    if (!series) return null;

    const seasons = this.getSeasons(seriesId);
    let totalEpisodes = 0;
    let totalSize = 0;

    const seasonDetails = seasons.map(season => {
      const episodes = this.getEpisodes(season.id);
      const seasonSize = episodes.reduce((acc, ep) => acc + (ep.size || 0), 0);
      totalEpisodes += episodes.length;
      totalSize += seasonSize;

      return {
        id: season.id,
        name: season.name,
        episodeCount: episodes.length,
        size: seasonSize
      };
    });

    return {
      id: series.id,
      name: series.name || series.title,
      seasonCount: seasons.length,
      totalEpisodes,
      totalSize,
      seasons: seasonDetails,
      dateAdded: series.dateAdded || new Date().toISOString()
    };
  }
}

module.exports = MovieDataManager;