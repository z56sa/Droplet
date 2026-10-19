const { sendServerLog } = require('../../utils/serverLogger');
const { AuditLogEvent } = require('discord.js');
const { getAuditActor } = require('../../utils/auditActor');

module.exports = [
  {
    name: 'roleCreate',
    async execute(role) {
      const actor = await getAuditActor(role.guild, AuditLogEvent.RoleCreate, role.id);
      await sendServerLog(role.guild, 'role_create', 'roles', {
        title: '➕ إنشاء رتبة',
        desc: `تم إنشاء رتبة جديدة`,
        actor,
        fields: [
          { name: '🎖️ الرتبة', value: `<@&${role.id}> (${role.name})`, inline: true },
          { name: '🎨 اللون', value: role.hexColor, inline: true },
          { name: '🆔 الأيدي', value: role.id, inline: true }
        ]
      });
    }
  },
  {
    name: 'roleDelete',
    async execute(role) {
      const actor = await getAuditActor(role.guild, AuditLogEvent.RoleDelete, role.id);
      await sendServerLog(role.guild, 'role_delete', 'roles', {
        title: '🗑️ حذف رتبة',
        desc: `تم حذف رتبة`,
        actor,
        fields: [
          { name: '🎖️ اسم الرتبة', value: role.name, inline: true },
          { name: '🎨 اللون', value: role.hexColor, inline: true },
          { name: '🆔 الأيدي', value: role.id, inline: true }
        ]
      });
    }
  },
  {
    name: 'roleUpdate',
    async execute(oldRole, newRole) {
      const changes = [];
      if (oldRole.name !== newRole.name) changes.push(`الاسم: \`${oldRole.name}\` → \`${newRole.name}\``);
      if (oldRole.hexColor !== newRole.hexColor) changes.push(`اللون: \`${oldRole.hexColor}\` → \`${newRole.hexColor}\``);
      if (oldRole.hoist !== newRole.hoist) changes.push(`الظهور المنفصل: ${oldRole.hoist ? 'نعم' : 'لا'} → ${newRole.hoist ? 'نعم' : 'لا'}`);
      if (oldRole.mentionable !== newRole.mentionable) changes.push(`القابلية للذكر: ${oldRole.mentionable ? 'نعم' : 'لا'} → ${newRole.mentionable ? 'نعم' : 'لا'}`);
      if (!changes.length) return;
      const actor = await getAuditActor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
      await sendServerLog(newRole.guild, 'role_update', 'roles', {
        title: '✏️ تعديل رتبة',
        desc: `تم تعديل رتبة **${newRole.name}**`,
        actor,
        fields: [
          { name: '🎖️ الرتبة', value: `<@&${newRole.id}>`, inline: true },
          { name: '📝 التغييرات', value: changes.join('\n'), inline: false }
        ]
      });
    }
  }
];
