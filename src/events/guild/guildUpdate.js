const { AuditLogEvent } = require('discord.js');
const db = require('../../database');
const { isEnabled } = require('../../utils/isEnabled');
const antiNuke = require('../../utils/antiNuke');

module.exports = {
  name: 'guildUpdate',
  async execute(oldGuild, newGuild) {
    try {
      const settings = db.getGuildSettings(newGuild.id) || {};
      const nameChanged = oldGuild.name !== newGuild.name;
      const iconChanged = oldGuild.icon !== newGuild.icon;
      if (!nameChanged && !iconChanged) return;

      const watchName = nameChanged && isEnabled(settings.anti_server_name_change, true);
      const watchIcon = iconChanged && isEnabled(settings.anti_server_icon_change, true);
      if (!watchName && !watchIcon) return;

      // سجل في محرك الحماية (للرصد والعقوبة عند التكرار)
      await antiNuke.checkAction(newGuild, 'guildUpdate', AuditLogEvent.GuildUpdate).catch(() => {});

      // استرجاع فوري: الاسم/الأيقونة القديمة
      try {
        if (watchName && nameChanged) await newGuild.setName(oldGuild.name).catch(() => {});
        if (watchIcon && iconChanged) {
          // لا يمكن استرجاع الأيقونة القديمة مباشرة بدون ملفها؛ ننبه في اللوق فقط
          const logId = settings.antinuke_alert_channel || settings.log_channel;
          const ch = logId ? newGuild.channels.cache.get(logId) : null;
          if (ch && ch.isTextBased()) {
            ch.send('⚠️ تم رصد تغيير أيقونة السيرفر وتم تسجيله في الحماية.').catch(() => {});
          }
        }
      } catch {}
    } catch (e) {}
  }
};
