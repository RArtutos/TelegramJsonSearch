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
          filter: message => message.video !== undefined
        });

        for (const message of messages) {
          if (message.video && message.text) {
            const match = message.text.match(/\[(.*?_\d+)\]/);
            if (match) {
              const videoId = match[1];
              this.videoCache.set(videoId, {
                channelId,
                messageId: message.id
              });
            }
          }
        }
      }
      console.log(`✅ Cache initialized with ${this.videoCache.size} videos`);
    } catch (error) {
      console.error('Error initializing cache:', error);
    }
  }

  async findExistingVideo(videoIdentifier) {
    return this.videoCache.get(videoIdentifier);
  }

  async uploadToChannel(stream, options) {
    if (!this.uploadChannel) {
      throw new Error('No upload channel configured');
    }

    try {
      const result = await this.bot.sendVideo(this.uploadChannel, stream, options);
      
      if (result && result.video) {
        const match = options.caption.match(/\[(.*?)\]/);
        if (match) {
          const videoId = match[1];
          const cacheEntry = {
            channelId: this.uploadChannel,
            messageId: result.message_id
          };
          this.videoCache.set(videoId, cacheEntry);
          return cacheEntry;
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