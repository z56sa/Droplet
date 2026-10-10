const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { isEnabled } = require('../../utils/isEnabled');

module.exports = {
  name: 'guildAuditLogEntryCreate',
  async execute(auditLogEntry, guild) {
    try {
      if (!guild) return;
      if (auditLogEntry.action !== AuditLogEvent.MemberPruneUpdate) return;
      const settings = db.getGuildSettings(guild.id) || {};
      if (!isEnabled(settings.anti_prune, false)) return;
      const count = auditLogEntry.extra?.removed || 0;
      if (count < 5) return; // تجاهل التقليم الصغير
      const executorId = auditLogEntry.executorId;
      if (!executorId || executorId === guild.ownerId) return;
      if (db.isUserWhitelisted && db.isUserWhitelisted(guild.id, executorId, 'whitelist')) return;
      const member = await guild.members.fetch(executorId).catch(() => null);
      if (!member || !member.manageable) return;
      const dangerous = member.roles.cache.filter(r =>
        r.permissions.has(PermissionFlagsBits.Administrator) ||
        r.permissions.has(PermissionFlagsBits.ManageGuild) ||
        r.permissions.has(PermissionFlagsBits.BanMembers) ||
        r.permissions.has(PermissionFlagsBits.KickMembers)
      );
      for (const [, r] of dangerous) await member.roles.remove(r).catch(() => {});
      const logId = settings.antinuke_alert_channel || settings.antiraid_log_channel || settings.log_channel;
      const ch = logId ? guild.channels.cache.get(logId) : null;
      if (ch && ch.isTextBased()) {
        ch.send(`🚨 **تقليم جماعي مشبوه (Prune):** <@${executorId}> أزال **${count}** عضواً — تم سحب الرتب الإدارية تلقائياً.`).catch(() => {});
      }
    } catch {}
  }
};
