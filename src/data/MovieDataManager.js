const fs = require('fs');
const Fuse = require('fuse.js');

class MovieDataManager {
  constructor() {
    this.movieData = [];
    this.allMovies = [];
    this.fuse = null;
    this.loadMovieData();
    this.setupFuseSearch();
  }

  loadMovieData() {
    try {
      this.movieData = JSON.parse(fs.readFileSync('./data/pelis.json', 'utf8'));
      this.allMovies = this.movieData.reduce((acc, category) => {
        if (category.children && Array.isArray(category.children)) {
          const moviesWithCategory = category.children.map(movie => ({
            ...movie,
            categoryName: category.categoryInfo?.name || 'Sin categoría'
          }));
          return [...acc, ...moviesWithCategory];
        }
        return acc;
      }, []);
      console.log(`Loaded ${this.allMovies.length} movies successfully`);
    } catch (error) {
      console.error('Error loading pelis.json:', error);
      process.exit(1);
    }
  }

  setupFuseSearch() {
    const options = {
      keys: ['name', 'categoryName'],
      threshold: 0.4,
      distance: 100
    };
    this.fuse = new Fuse(this.allMovies, options);
  }

  searchMovies(query) {
    return this.fuse.search(query);
  }

  getMovieById(id) {
    return this.allMovies.find(m => m.id === id);
  }
}

module.exports = MovieDataManager;