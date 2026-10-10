const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const antiNuke = require('../../utils/antiNuke');
const db = require('../../database');
const { isEnabled } = require('../../utils/isEnabled');

module.exports = {
  name: 'roleCreate',
  async execute(role) {
    if (!role.guild) return;
    await antiNuke.checkAction(role.guild, 'roleCreate', AuditLogEvent.RoleCreate);
    // ✅ رتب خطيرة/مربوطة: تجريد صلاحية الإدارة إذا فُعّلت الحماية
    try {
      const settings = db.getGuildSettings(role.guild.id) || {};
      const hasAdmin = role.permissions.has(PermissionFlagsBits.Administrator);
      const isLinked = !!(role.tags && (role.tags.botId || role.tags.integrationId || role.tags.premiumSubscriberRole || role.tags.availableForPurchase || role.tags.guildConnections));
      if (hasAdmin && isEnabled(settings.anti_dangerous_perms, false)) {
        await role.setPermissions(role.permissions.remove(PermissionFlagsBits.Administrator)).catch(() => {});
        const logId = settings.antinuke_alert_channel || settings.log_channel;
        const ch = logId ? role.guild.channels.cache.get(logId) : null;
        if (ch && ch.isTextBased()) ch.send(`⚠️ تم تجريد صلاحية الإدارة من رتبة **${role.name}** تلقائياً (حماية الصلاحيات الخطرة).`).catch(() => {});
      } else if (isLinked && hasAdmin && isEnabled(settings.anti_linked_roles, false)) {
        await role.setPermissions(role.permissions.remove(PermissionFlagsBits.Administrator)).catch(() => {});
      }
    } catch {}
  }
};
