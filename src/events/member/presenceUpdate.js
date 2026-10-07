const { EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'presenceUpdate',
  async execute(oldPresence, newPresence, client) {
    try {
      if (!newPresence || !newPresence.guild || !newPresence.userId) return;
      const guild = newPresence.guild;
      const userId = newPresence.userId;

      // فحص هل العضو مسجل في شفت نشط حالياً
      const activeShift = db.getActiveStaffShift(guild.id, userId);
      if (!activeShift) return;

      const settings = db.getGuildSettings(guild.id);
      // التحقق من تفعيل ميزة الخروج التلقائي
      if (settings.staff_auto_logout === 0) return;

      const newStatus = newPresence.status; // 'online', 'idle', 'dnd', 'offline'

      // إذا أصبح خامل (Idle / AFK) أو غير متصل تماماً أو مخفي (Offline / Invisible)
      if (newStatus === 'idle' || newStatus === 'offline' || newStatus === 'invisible') {
        const isAfk = newStatus === 'idle';
        const exitReason = isAfk ? 'auto_afk' : 'auto_offline';
        const result = db.endStaffShift(guild.id, userId, exitReason);
        if (result && result.success) {
          const durationHours = Math.floor(result.duration / 3600);
          const durationMins = Math.floor((result.duration % 3600) / 60);
          const durationSecs = result.duration % 60;
          const durationStr = `${durationHours > 0 ? `${durationHours} ساعة و ` : ''}${durationMins} دقيقة و ${durationSecs} ثانية`;

          const logChannelId = settings.staff_log_channel || settings.log_channel;
          const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : null;

          if (logChannel && logChannel.isTextBased()) {
            const autoLogoutEmbed = new EmbedBuilder()
              .setColor(isAfk ? '#f59e0b' : '#ef4444')
              .setTitle(isAfk ? '🌙 تسجيل خروج تلقائي (Auto Logout - خامل / AFK)' : '⚠️ تسجيل خروج تلقائي (Auto Logout - غير متصل)')
              .setDescription(`تم تسجيل خروج <@${userId}> تلقائياً بسبب (${isAfk ? 'الخمول وعدم التفاعل / AFK' : 'الخروج من ديسكورد'}) لضمان دقة ساعات العمل.`)
              .addFields(
                { name: '👤 الإداري', value: `<@${userId}>`, inline: true },
                { name: '⏱️ مدة التواجد الفعلي', value: `\`${durationStr}\``, inline: true },
                { name: '⭐ النقاط المحتسبة', value: `+${result.pointsEarned} نقطة`, inline: true },
                { name: '📌 السبب', value: isAfk ? 'خامل / وضع الـ AFK (Idle)' : 'خروج من الديسكورد (Offline / Invisible)', inline: false }
              )
              .setFooter({ text: 'نظام مراقبة نشاط الإدارة الذكي • Droplet' })
              .setTimestamp();

            await logChannel.send({ embeds: [autoLogoutEmbed] }).catch(() => {});
          }
        }
      }
    } catch (err) {
      // ignore transient presence errors
    }
  }
};
