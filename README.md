# Telegram Movie & TV Shows Search Bot

Este bot de Telegram permite buscar películas y series en archivos JSON locales, utilizando TMDB para mejorar los resultados de búsqueda.

## Requisitos

- Docker
- Docker Compose
- Token de Bot de Telegram
- API Key de TMDB
- Telegram API ID y Hash

## Instrucciones de Instalación

1. Crea un bot en Telegram usando [@BotFather](https://t.me/botfather) y obtén el token.

2. Obtén una API Key de [TMDB](https://www.themoviedb.org/settings/api)

3. Obtén tus credenciales de Telegram:
   - Ve a https://my.telegram.org/apps
   - Inicia sesión y crea una aplicación
   - Guarda el `api_id` y `api_hash`

4. Crea una carpeta llamada `data` y coloca los archivos JSON:
   ```bash
   mkdir data
   # Coloca pelis.json y series.json en la carpeta data
   ```

5. Copia el archivo `.env.example` a `.env` y configura tus tokens:
   ```bash
   TELEGRAM_BOT_TOKEN=tu_token_aquí
   TMDB_API_KEY=tu_api_key_aquí
   TELEGRAM_API_ID=tu_api_id_aquí
   TELEGRAM_API_HASH=tu_api_hash_aquí
   LOCAL_API_URL=http://telegram-api:8081
   ADMIN_IDS=id1,id2,id3
   ```

6. Construye y ejecuta el contenedor:
   ```bash
   docker-compose up -d
   ```

## Uso

1. Inicia una conversación con el bot en Telegram.

2. Usa los comandos disponibles:
   ```
   /movie matrix    - Buscar películas
   /series friends  - Buscar series
   ```

3. El bot mostrará una lista de resultados con botones.

4. Para películas:
   - Selecciona una película
   - Elige la calidad deseada (1080p, 720p, 360p)

5. Para series:
   - Selecciona una serie
   - Elige la temporada
   - Selecciona el episodio
   - Elige la calidad deseada

## Comandos de Administrador

Los usuarios configurados como administradores tienen acceso a comandos especiales:

- `/status` - Muestra el estado actual del sistema y descargas
- `/statusC` - Muestra estado detallado del sistema
- `/listAll movies` - Lista todas las películas en formato CSV
- `/listAll series` - Lista todas las series en formato CSV
- `/restartC` - Recarga la caché del canal
- `/restart` - Reinicia completamente el bot

## Características

- Búsqueda integrada con TMDB
- Soporte para archivos grandes (hasta 1.92GB)
- Streaming de video en Telegram
- Múltiples calidades de video
- Soporte para películas y series
- Sistema de caché para videos
- Verificación de tamaño antes de descarga
- Capacidad de cancelar descargas
- Barra de progreso detallada

## Mantenimiento

- Para ver los logs:
  ```bash
  docker-compose logs -f
  ```

- Para reiniciar el bot:
  ```bash
  docker-compose restart
  ```

- Para detener el bot:
  ```bash
  docker-compose down
  ```