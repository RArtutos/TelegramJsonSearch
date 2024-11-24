# Telegram Movie Search Bot

Este bot de Telegram permite buscar películas en un archivo JSON y proporciona enlaces de descarga en diferentes calidades.

## Requisitos

- Docker
- Docker Compose
- Token de Bot de Telegram

## Instrucciones de Instalación

1. Crea un bot en Telegram usando [@BotFather](https://t.me/botfather) y obtén el token.

2. Crea una carpeta llamada `data` y coloca el archivo `pelis.json` dentro:
   ```bash
   mkdir data
   ```

3. Copia el archivo `.env.example` a `.env` y configura tu token:
   ```bash
   TELEGRAM_BOT_TOKEN=tu_token_aquí
   ```

4. Construye y ejecuta el contenedor:
   ```bash
   docker-compose up -d
   ```

## Uso

1. Inicia una conversación con el bot en Telegram.

2. Usa el comando `/search` seguido del nombre de la película:
   ```
   /search alien
   ```

3. El bot mostrará una lista de resultados con botones.

4. Selecciona una película de la lista.

5. Elige la calidad deseada (1080p, 720p, 360p).

6. El bot proporcionará el enlace de descarga.

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