const { AuditLogEvent } = require('discord.js');
const antiNuke = require('../../utils/antiNuke');

module.exports = {
  name: 'webhooksUpdate',
  async execute(channel) {
    if (!channel.guild) return;
    await antiNuke.checkAction(channel.guild, 'webhookUpdate', AuditLogEvent.WebhookUpdate);
  }
};
