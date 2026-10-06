const { EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage) {
    if (!oldMessage.guild) return;
    if (oldMessage.partial) {
      try { await oldMessage.fetch(); } catch (e) {}
    }
    if (newMessage.partial) {
      try { await newMessage.fetch(); } catch (e) {}
    }
    if (oldMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const settings = db.getGuildSettings(oldMessage.guild.id);
    if (!settings.log_channel) return;

    const logChannel = oldMessage.guild.channels.cache.get(settings.log_channel);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
      .setColor(config.colors.warning)
      .setTitle('✏️ تعديل رسالة')
      .addFields(
        { name: '👤 الكاتب', value: `<@${oldMessage.author.id}>`, inline: true },
        { name: '💬 الروم', value: `<#${oldMessage.channel.id}>`, inline: true },
        { name: '📌 قبل التعديل', value: oldMessage.content ? (oldMessage.content.length > 500 ? oldMessage.content.substring(0, 500) + '...' : oldMessage.content) : '*فارغ*' },
        { name: '📝 بعد التعديل', value: newMessage.content ? (newMessage.content.length > 500 ? newMessage.content.substring(0, 500) + '...' : newMessage.content) : '*فارغ*' }
      )
      .setTimestamp();

    logChannel.send({ embeds: [embed] }).catch(() => {});
  }
};
