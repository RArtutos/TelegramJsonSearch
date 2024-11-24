import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

const DATA_DIR = '/data';

export async function searchMovies(searchTerm) {
  try {
    const content = await fs.readFile(
      path.join(DATA_DIR, 'pelis.json'),
      'utf-8'
    );
    const movies = JSON.parse(content);
    
    return movies.filter(movie => 
      movie.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  } catch (error) {
    logger.error('Error buscando películas:', error);
    throw error;
  }
}

export async function searchSeries(searchTerm) {
  try {
    const content = await fs.readFile(
      path.join(DATA_DIR, 'series.json'),
      'utf-8'
    );
    const series = JSON.parse(content);
    
    return series.filter(serie => 
      serie.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  } catch (error) {
    logger.error('Error buscando series:', error);
    throw error;
  }
}