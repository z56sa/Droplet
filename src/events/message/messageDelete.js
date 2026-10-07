const { EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'messageDelete',
  async execute(message) {
    if (!message.guild) return;
    if (message.partial) {
      try {
        await message.fetch();
      } catch (e) {
        // الرسالة تم حذفها قبل أن يتمكن البوت من جلبها
      }
    }
    if (message.author?.bot) return;

    const settings = db.getGuildSettings(message.guild.id);

    // --- كشف الغوست بينج (Anti-Ghost-Ping) ---
    if (settings.anti_ghost_ping) {
      // تحقق أن الرسالة تحتوي على ذكر (mention) وليست من المشرفين
      const hasMentions = message.mentions?.users?.size > 0 || message.mentions?.roles?.size > 0;
      const isAdmin = message.member?.permissions?.has(0x8n); // Administrator
      if (hasMentions && !isAdmin) {
        const mentionedUsers = [...(message.mentions?.users?.values() || [])];
        const mentionedRoles = [...(message.mentions?.roles?.values() || [])];
        const logCh = settings.log_channel ? message.guild.channels.cache.get(settings.log_channel) : null;
        const alertCh = logCh || message.channel;

        const ghostEmbed = new EmbedBuilder()
          .setColor('#FF4500')
          .setTitle('👻 Ghost Ping مكتشف!')
          .setDescription(`تم حذف رسالة تحتوي على ذكر في <#${message.channel.id}>`)
          .addFields(
            { name: '👤 المرسل', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
            { name: '💬 الروم', value: `<#${message.channel.id}>`, inline: true },
            { name: '🏓 تم ذكر', value: [
              ...mentionedUsers.map(u => `<@${u.id}>`),
              ...mentionedRoles.map(r => `<@&${r.id}>`)
            ].join(', ') || 'غير معروف', inline: false },
            { name: '📄 محتوى الرسالة', value: message.content ? (message.content.length > 800 ? message.content.substring(0, 800) + '...' : message.content) : '*غير متوفر*', inline: false }
          )
          .setTimestamp()
          .setFooter({ text: 'Droplet Security • Anti-Ghost-Ping' });

        alertCh.send({ embeds: [ghostEmbed] }).catch(() => {});
        return; // لا ترسل لوق الحذف العادي إذا كان Ghost Ping
      }
    }

    // --- لوق الرسائل المحذوفة العادية ---
    if (!settings.log_channel) return;
    const logChannel = message.guild.channels.cache.get(settings.log_channel);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
      .setColor(config.colors.danger)
      .setTitle('🗑️ رسالة محذوفة')
      .addFields(
        { name: '👤 الكاتب', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
        { name: '💬 الروم', value: `<#${message.channel.id}>`, inline: true },
        { name: '📄 المحتوى', value: message.content ? (message.content.length > 1000 ? message.content.substring(0, 1000) + '...' : message.content) : '*محتوى غير متوفر أو ملف ميديا*' }
      )
      .setTimestamp();

    logChannel.send({ embeds: [embed] }).catch(() => {});
  }
};
