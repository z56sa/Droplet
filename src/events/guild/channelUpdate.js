const { AuditLogEvent } = require('discord.js');
const antiNuke = require('../../utils/antiNuke');

module.exports = {
  name: 'channelUpdate',
  async execute(oldChannel, newChannel) {
    if (!newChannel.guild) return;
    await antiNuke.checkAction(newChannel.guild, 'channelUpdate', AuditLogEvent.ChannelUpdate);
  }
};
