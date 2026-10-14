/**
 * Message Cache Manager for Droplet
 * Tracks recent messages in-memory so that when a message is deleted,
 * its author, content, attachments, and channel are always known even if partial.
 */

const MAX_CACHE_SIZE = 10000;
const messageStore = new Map();

/**
 * Cache message details
 * @param {import('discord.js').Message} message
 */
function cacheMessage(message) {
  if (!message || !message.id) return;
  // If author is missing or is a bot, skip caching bot messages to save memory
  if (message.author?.bot) return;

  const data = {
    id: message.id,
    guildId: message.guildId || message.guild?.id || null,
    channelId: message.channelId || message.channel?.id || null,
    content: message.content || '',
    createdTimestamp: message.createdTimestamp || Date.now(),
    author: message.author ? {
      id: message.author.id,
      tag: message.author.tag || `${message.author.username}`,
      username: message.author.username,
      avatarURL: typeof message.author.displayAvatarURL === 'function'
        ? message.author.displayAvatarURL({ dynamic: true, size: 256 })
        : null
    } : null,
    attachments: message.attachments?.map(a => ({
      name: a.name,
      url: a.url,
      proxyURL: a.proxyURL,
      contentType: a.contentType
    })) || []
  };

  if (messageStore.size >= MAX_CACHE_SIZE) {
    const oldestKey = messageStore.keys().next().value;
    messageStore.delete(oldestKey);
  }

  messageStore.set(message.id, data);
}

/**
 * Retrieve cached message details
 * @param {string} messageId
 * @returns {object|null}
 */
function getCachedMessage(messageId) {
  if (!messageId) return null;
  return messageStore.get(messageId) || null;
}

/**
 * Remove cached message if needed
 * @param {string} messageId
 */
function deleteCachedMessage(messageId) {
  if (!messageId) return;
  messageStore.delete(messageId);
}

module.exports = {
  cacheMessage,
  getCachedMessage,
  deleteCachedMessage,
  messageStore
};
