const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const antiNuke = require('../../utils/antiNuke');
const db = require('../../database');
const { isEnabled } = require('../../utils/isEnabled');

module.exports = {
  name: 'roleUpdate',
  async execute(oldRole, newRole) {
    if (!newRole.guild) return;
    await antiNuke.checkAction(newRole.guild, 'roleUpdate', AuditLogEvent.RoleUpdate);
    // ✅ منع منح الإدارة عبر التعديل إذا فُعّلت الحماية
    try {
      const settings = db.getGuildSettings(newRole.guild.id) || {};
      const hadAdmin = oldRole.permissions.has(PermissionFlagsBits.Administrator);
      const hasAdmin = newRole.permissions.has(PermissionFlagsBits.Administrator);
      if (!hadAdmin && hasAdmin && isEnabled(settings.anti_dangerous_perms, false)) {
        await newRole.setPermissions(oldRole.permissions).catch(() => {});
        const logId = settings.antinuke_alert_channel || settings.log_channel;
        const ch = logId ? newRole.guild.channels.cache.get(logId) : null;
        if (ch && ch.isTextBased()) ch.send(`⚠️ تم منع منح صلاحية الإدارة لرتبة **${newRole.name}** (حماية الصلاحيات الخطرة).`).catch(() => {});
      }
    } catch {}
  }
};
