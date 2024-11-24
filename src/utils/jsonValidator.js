import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';

const DATA_DIR = '/data';
const REQUIRED_FIELDS = ['id', 'name', 'mimeType'];

export async function validateJsonFiles() {
  try {
    // Validar pelis.json
    const pelisContent = await fs.readFile(
      path.join(DATA_DIR, 'pelis.json'),
      'utf-8'
    );
    const pelis = JSON.parse(pelisContent);
    validateStructure(pelis, 'pelis.json');
    
    // Validar series.json
    const seriesContent = await fs.readFile(
      path.join(DATA_DIR, 'series.json'),
      'utf-8'
    );
    const series = JSON.parse(seriesContent);
    validateStructure(series, 'series.json');
    
    logger.info('Validación de archivos JSON completada exitosamente');
  } catch (error) {
    logger.error('Error validando archivos JSON:', error);
    throw error;
  }
}

function validateStructure(data, filename) {
  if (!Array.isArray(data)) {
    throw new Error(`${filename} debe ser un array`);
  }
  
  data.forEach((item, index) => {
    REQUIRED_FIELDS.forEach(field => {
      if (!item[field]) {
        throw new Error(
          `Campo requerido "${field}" faltante en ítem ${index} de ${filename}`
        );
      }
    });
  });
}