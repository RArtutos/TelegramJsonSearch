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
      console.log(`🔍 Buscando en TMDB: "${query}" (tipo: ${type})`);
      const response = await axios.get(`https://api.themoviedb.org/3/search/${type}`, {
        params: {
          api_key: process.env.TMDB_API_KEY,
          query,
          language: 'es-MX'
        }
      });
      console.log(`✅ TMDB encontró ${response.data.results.length} resultados`);
      return response.data.results;
    } catch (error) {
      console.error('❌ Error en TMDB API:', error);
      return [];
    }
  }

  findInLocalData(tmdbTitle, type = 'movie') {
    console.log(`🔍 Buscando localmente: "${tmdbTitle}" (tipo: ${type})`);
    const data = type === 'movie' ? this.movieData : this.seriesData;
    const items = [];
    
    for (const category of data) {
      if (category.children) {
        for (const item of category.children) {
          if (type === 'movie') {
            if (item.title?.toLowerCase() === tmdbTitle.toLowerCase() || 
                item.name?.toLowerCase() === tmdbTitle.toLowerCase()) {
              console.log(`✅ Encontrada película: ${item.name || item.title}`);
              items.push(item);
            }
          } else {
            if (item.title?.toLowerCase() === tmdbTitle.toLowerCase() || 
                item.name?.toLowerCase() === tmdbTitle.toLowerCase()) {
              console.log(`✅ Encontrada serie: ${item.name || item.title}`);
              const seasons = this.getSeasons(item.id);
              console.log(`📺 La serie tiene ${seasons.length} temporadas`);
              items.push({
                ...item,
                seasons
              });
            }
          }
        }
      }
    }
    
    console.log(`✅ Total de resultados locales encontrados: ${items.length}`);
    return items;
  }

  getSeasons(seriesId) {
    console.log(`🔍 Buscando temporadas para serie ID: ${seriesId}`);
    const series = this.findSeriesById(seriesId);
    if (!series) {
      console.log('❌ No se encontró la serie');
      return [];
    }
    if (!series.children) {
      console.log('❌ La serie no tiene children definido');
      return [];
    }
    
    const seasons = series.children.filter(child => 
      child.type === 'directory' && 
      (child.name.toLowerCase().includes('season') || 
       child.name.toLowerCase().includes('temporada'))
    );

    console.log(`✅ Temporadas encontradas: ${seasons.length}`);
    seasons.forEach(season => {
      console.log(`📺 Temporada: ${season.name} (ID: ${season.id})`);
    });
    
    return seasons;
  }

  getEpisodes(seasonId) {
    console.log(`🔍 Buscando episodios para temporada ID: ${seasonId}`);
    for (const category of this.seriesData) {
      for (const series of category.children || []) {
        for (const season of series.children || []) {
          if (season.id === seasonId) {
            console.log(`✅ Temporada encontrada: ${season.name}`);
            if (!season.children) {
              console.log('❌ La temporada no tiene children definido');
              return [];
            }
            const episodes = season.children.filter(child => 
              child.type === 'file' && 
              child.mimeType?.includes('video')
            );
            console.log(`✅ Episodios encontrados: ${episodes.length}`);
            episodes.forEach(episode => {
              console.log(`🎬 Episodio: ${episode.name} (ID: ${episode.id})`);
            });
            return episodes;
          }
        }
      }
    }
    console.log('❌ No se encontró la temporada');
    return [];
  }

  findSeriesById(id) {
    console.log(`🔍 Buscando serie por ID: ${id}`);
    for (const category of this.seriesData) {
      if (category.children) {
        const series = category.children.find(s => s.id === id);
        if (series) {
          console.log(`✅ Serie encontrada: ${series.name || series.title}`);
          return series;
        }
      }
    }
    console.log('❌ No se encontró la serie');
    return null;
  }

  findSeasonById(id) {
    console.log(`🔍 Buscando temporada por ID: ${id}`);
    for (const category of this.seriesData) {
      for (const series of category.children || []) {
        for (const season of series.children || []) {
          // Comparación exacta del ID completo
          if (season.id && season.id === id) {
            console.log(`✅ Temporada encontrada: ${season.name}`);
            return season;
          }
        }
      }
    }
    console.log('❌ No se encontró la temporada');
    return null;
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