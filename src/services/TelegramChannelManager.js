const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');

class TelegramChannelManager {
  constructor(bot) {
    this.bot = bot;
    this.channels = process.env.TELEGRAM_CHANNELS ? process.env.TELEGRAM_CHANNELS.split(',') : [];
    this.uploadChannel = this.channels[0];
    this.videoCache = new Map();
    this.client = null;
    this.initializeTelethon();
  }

  async initializeTelethon() {
    try {
      const stringSession = new StringSession(process.env.TELETHON_SESSION);
      this.client = new TelegramClient(
        stringSession,
        parseInt(process.env.TELEGRAM_API_ID),
        process.env.TELEGRAM_API_HASH,
        { connectionRetries: 5 }
      );

      await this.client.connect();
      await this.initializeCache();
    } catch (error) {
      console.error('Error initializing Telethon:', error);
    }
  }

async initializeCache() {
    try {
        for (const channelId of this.channels) {
            console.log(`Fetching messages from channel ${channelId}...`);
            const entity = await this.client.getEntity(channelId);
            const messages = await this.client.getMessages(entity, {
                limit: 100,
                filterPredicate: (message) => message.media?.video !== undefined
            });

            for (const message of messages) {
                if (message.media?.video && message.text) {
                    // Extraer baseId y itag si están disponibles
                    const match = message.text.match(/\[([^\[]+)\]$/);
                        if (match) {
                        const fullString = match[1];  // Todo lo que está dentro de los corchetes
                        const parts = fullString.split(':');  // Separar por el carácter ":"

                        const baseId = parts[0];  // El primer elemento es el baseId
                        const itag = parts.length > 1 ? parts[1] : null;  // El segundo elemento es el itag, si está presente


                        console.log(`Guardando video en caché: baseId=${baseId}, itag=${itag}`);

                        // Guardar todas las calidades disponibles para este video
                        const existingEntry = this.videoCache.get(baseId) || [];
                        existingEntry.push({
                            channelId,
                            messageId: message.id,
                            itag,
                            text: message.text
                        });
                        this.videoCache.set(baseId, existingEntry);
                    }
                }
            }
        }
        console.log(`✅ Cache initialized with ${this.videoCache.size} videos`);
        // Mostrar contenido de la caché al final
        console.log("Contenido de la caché:", JSON.stringify([...this.videoCache.entries()], null, 2));
    } catch (error) {
        console.error('Error initializing cache:', error);
    }
}


  async findExistingVideo(videoIdentifier) {
    const [baseId, itag] = videoIdentifier.split(':');
    console.log("Buscando video en caché:", videoIdentifier);
    console.log("Base ID:", baseId, "Itag:", itag || "N/A");

    const cachedEntries = this.videoCache.get(baseId);
    console.log("Entradas en caché para el ID base:", cachedEntries);

    if (cachedEntries) {
        // Si tienes ambos, busca por baseId y itag
        if (itag) {
            console.log("Buscando coincidencia con itag:", itag);
            const matchingEntry = cachedEntries.find(entry => entry.itag === itag);
            
            if (matchingEntry) {
                console.log("Video encontrado:", matchingEntry);
                return {
                    channelId: matchingEntry.channelId,
                    messageId: matchingEntry.messageId
                };
            } else {
                console.log("No se encontró video con el itag:", itag);
            }
        } else {
            // Si solo tienes el baseId, busca solo por baseId
            console.log("Buscando coincidencia solo con baseId:", baseId);
            const matchingEntry = cachedEntries[0];  // Puedes personalizar esta lógica si hay múltiples entradas

            if (matchingEntry) {
                console.log("Video encontrado:", matchingEntry);
                return {
                    channelId: matchingEntry.channelId,
                    messageId: matchingEntry.messageId
                };
            } else {
                console.log("No se encontró video con el baseId:", baseId);
            }
        }
    } else {
        console.log("No hay entradas en caché para este baseId:", baseId);
    }
    
    return null;
}


  async uploadToChannel(stream, options) {
    if (!this.uploadChannel) {
      throw new Error('No upload channel configured');
    }

    try {
      const result = await this.bot.sendVideo(this.uploadChannel, stream, options);
      
      if (result && result.video) {
        const match = options.caption.match(/\[(.*?)]/);
        if (match) {
          const [baseId, itag] = match[1].split(':');
          const existingEntry = this.videoCache.get(baseId) || [];
          existingEntry.push({
            channelId: this.uploadChannel,
            messageId: result.message_id,
            text: options.caption
          });
          this.videoCache.set(baseId, existingEntry);
          return {
            channelId: this.uploadChannel,
            messageId: result.message_id
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error uploading to channel:', error);
      throw error;
    }
  }

  async verifyChannelPermissions(channelId) {
    try {
      const entity = await this.client.getEntity(channelId);
      const permissions = await this.client.getPermissions(entity);
      return permissions.has('post_messages') && permissions.has('delete_messages');
    } catch (error) {
      console.error(`Error verifying permissions for channel ${channelId}:`, error);
      return false;
    }
  }
}

module.exports = TelegramChannelManager;