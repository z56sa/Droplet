const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const antiNuke = require('../../utils/antiNuke');
const db = require('../../database');
const { isEnabled } = require('../../utils/isEnabled');

module.exports = {
  name: 'roleUpdate',
  async execute(oldRole, newRole) {
    if (!newRole.guild) return;
    await antiNuke.checkAction(newRole.guild, 'roleUpdate', AuditLogEvent.RoleUpdate);
    // ✅ منع منح الصلاحيات الخطرة لرتبة @everyone أو أي رتبة أخرى
    try {
      const settings = db.getGuildSettings(newRole.guild.id) || {};
      const isEveryone = newRole.id === newRole.guild.id;
      const dangerousPerms = [
        PermissionFlagsBits.Administrator,
        PermissionFlagsBits.ManageGuild,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.BanMembers,
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.MentionEveryone
      ];

      if (isEveryone) {
        // فحص مباشر لأي صلاحية خطيرة مُنحت لرتبة everyone
        const addedDangerous = dangerousPerms.some(perm => !oldRole.permissions.has(perm) && newRole.permissions.has(perm));
        if (addedDangerous) {
          await newRole.setPermissions(oldRole.permissions).catch(() => {});
          const logId = settings.antinuke_alert_channel || settings.antiraid_log_channel || settings.log_channel;
          const ch = logId ? newRole.guild.channels.cache.get(logId) : null;
          if (ch && ch.isTextBased()) ch.send(`🚨 **محاولة خطيرة:** تم منع منح صلاحيات حساسة وإدارية لرتبة \`@everyone\` وإرجاعها فوراً.`).catch(() => {});
        }
      } else {
        const hadAdmin = oldRole.permissions.has(PermissionFlagsBits.Administrator);
        const hasAdmin = newRole.permissions.has(PermissionFlagsBits.Administrator);
        if (!hadAdmin && hasAdmin && isEnabled(settings.anti_dangerous_perms, false)) {
          await newRole.setPermissions(oldRole.permissions).catch(() => {});
          const logId = settings.antinuke_alert_channel || settings.log_channel;
          const ch = logId ? newRole.guild.channels.cache.get(logId) : null;
          if (ch && ch.isTextBased()) ch.send(`⚠️ تم منع منح صلاحية الإدارة لرتبة **${newRole.name}** (حماية الصلاحيات الخطرة).`).catch(() => {});
        }
      }
    } catch {}
  }
};
