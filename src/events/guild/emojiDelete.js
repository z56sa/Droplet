const { AuditLogEvent } = require('discord.js');
const antiNuke = require('../../utils/antiNuke');

module.exports = {
  name: 'emojiDelete',
  async execute(emoji) {
    if (!emoji.guild) return;
    await antiNuke.checkAction(emoji.guild, 'emojiDelete', AuditLogEvent.EmojiDelete);
  }
};
