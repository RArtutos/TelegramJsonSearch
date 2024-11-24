# Bot de Telegram para Gestión de Películas y Series

Bot de Telegram que permite gestionar la descarga de películas y episodios de series desde archivos JSON y enviarlos a través de Telegram.

## Características

- Búsqueda de películas y series
- Descarga de archivos en diferentes calidades (1080p, 720p, 360p)
- Envío automático a Telegram
- Soporte para archivos grandes (hasta 2000 MB)
- Bot API Server local para mejor rendimiento
- Monitoreo de progreso de descargas
- Sistema de cola para gestionar múltiples descargas
- Registro detallado de eventos y errores

## Requisitos

- Docker y Docker Compose
- Token de Bot de Telegram
- API ID y Hash de Telegram
- Archivos JSON con la estructura de películas y series en el directorio `/data`

## Configuración del Bot API Server Local

1. Obtener API ID y Hash:
   - Visita https://my.telegram.org/apps
   - Crea una nueva aplicación
   - Guarda el API ID y API Hash

2. Configura las variables de entorno:
   ```bash
   cp .env.example .env
   ```
   
   Edita `.env` y configura:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token
   TELEGRAM_API_URL=http://localhost:8081
   USE_LOCAL_API=true
   TELEGRAM_API_ID=your_api_id
   TELEGRAM_API_HASH=your_api_hash
   ```

## Instalación

1. Clonar el repositorio
2. Configurar variables de entorno como se indicó arriba
3. Crear directorios necesarios:
   ```bash
   mkdir data downloads
   ```
4. Agregar archivos JSON en el directorio `data`
5. Iniciar los servicios:
   ```bash
   docker-compose up -d
   ```

## Comandos del Bot

- `/movie nombre` - Busca películas por nombre
- `/series nombre` - Busca series por nombre
- `/status` - Muestra todas las descargas activas
- `/status ID` - Muestra el estado de una descarga específica

## Logs

Los logs se almacenan en el directorio `logs/`:
- `error.log`: Errores y advertencias
- `combined.log`: Todos los eventos

## Mantenimiento

Para reiniciar los servicios:
```bash
docker-compose restart
```

Para ver los logs:
```bash
docker-compose logs -f
```

## Estructura del Proyecto

```
.
├── src/
│   ├── commands/        # Comandos del bot
│   ├── services/        # Servicios (descargas, búsqueda)
│   └── utils/          # Utilidades (logger, validación)
├── data/               # Archivos JSON (no incluidos)
├── downloads/          # Directorio temporal de descargas
├── logs/              # Logs generados
├── telegram-bot-api-data/ # Datos del Bot API Server
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Ventajas del Bot API Server Local

- Soporte para archivos de hasta 2000 MB
- Mayor velocidad en transferencias
- Sin límites de tamaño en descargas
- Mejor manejo de recursos
- Mayor control sobre la infraestructura