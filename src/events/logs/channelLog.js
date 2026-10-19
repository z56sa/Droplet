const { sendServerLog } = require('../../utils/serverLogger');
const { AuditLogEvent } = require('discord.js');
const { getAuditActor } = require('../../utils/auditActor');

module.exports = [
  {
    name: 'channelCreate',
    async execute(channel) {
      if (!channel.guild) return;
      const typeNames = { 0: 'نصية', 2: 'صوتية', 4: 'فئة', 5: 'إعلانات', 13: 'منصة Stage', 15: 'منتدى' };
      const actor = await getAuditActor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
      await sendServerLog(channel.guild, 'channel_create', 'channels', {
        title: '➕ إنشاء قناة',
        desc: `تم إنشاء قناة جديدة`,
        actor,
        fields: [
          { name: '📌 القناة', value: `<#${channel.id}> (${channel.name})`, inline: true },
          { name: '📂 النوع', value: typeNames[channel.type] || 'أخرى', inline: true },
          { name: '🆔 الأيدي', value: channel.id, inline: true }
        ]
      });
    }
  },
  {
    name: 'channelDelete',
    async execute(channel) {
      if (!channel.guild) return;
      const actor = await getAuditActor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
      await sendServerLog(channel.guild, 'channel_delete', 'channels', {
        title: '🗑️ حذف قناة',
        desc: `تم حذف قناة`,
        actor,
        fields: [
          { name: '📌 اسم القناة', value: channel.name, inline: true },
          { name: '🆔 الأيدي', value: channel.id, inline: true }
        ]
      });
    }
  },
  {
    name: 'channelUpdate',
    async execute(oldChannel, newChannel) {
      if (!newChannel.guild) return;
      const changes = [];
      if (oldChannel.name !== newChannel.name) changes.push(`الاسم: \`${oldChannel.name}\` → \`${newChannel.name}\``);
      if (oldChannel.topic !== newChannel.topic) changes.push(`الموضوع: ${oldChannel.topic || 'لا يوجد'} → ${newChannel.topic || 'لا يوجد'}`);
      if (oldChannel.nsfw !== newChannel.nsfw) changes.push(`NSFW: ${oldChannel.nsfw ? 'نعم' : 'لا'} → ${newChannel.nsfw ? 'نعم' : 'لا'}`);
      if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) changes.push(`بطيء المحادثة: ${oldChannel.rateLimitPerUser}ث → ${newChannel.rateLimitPerUser}ث`);
      if (!changes.length) return;
      const actor = await getAuditActor(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
      await sendServerLog(newChannel.guild, 'channel_update', 'channels', {
        title: '✏️ تعديل قناة',
        desc: `تم تعديل قناة **${newChannel.name}**`,
        actor,
        fields: [
          { name: '📌 القناة', value: `<#${newChannel.id}>`, inline: true },
          { name: '📝 التغييرات', value: changes.join('\n'), inline: false }
        ]
      });
      // ✅ صلاحيات الروم: مقارنة منفصلة بسجل مستقل
      try {
        const oldPerms = JSON.stringify([...(oldChannel.permissionOverwrites?.cache?.values() || [])].map(o => [o.id, o.allow.bitfield.toString(), o.deny.bitfield.toString()]).sort());
        const newPerms = JSON.stringify([...(newChannel.permissionOverwrites?.cache?.values() || [])].map(o => [o.id, o.allow.bitfield.toString(), o.deny.bitfield.toString()]).sort());
        if (oldPerms !== newPerms) {
          const permsActor = await getAuditActor(newChannel.guild, AuditLogEvent.ChannelOverwriteUpdate, newChannel.id);
          await sendServerLog(newChannel.guild, 'channel_perms_update', 'channels', {
            title: '🔒 صلاحيات الروم',
            desc: `تم تعديل صلاحيات قناة **${newChannel.name}**`,
            actor: permsActor,
            fields: [{ name: '📌 القناة', value: `<#${newChannel.id}>`, inline: true }]
          });
        }
      } catch {}
    }
  },
  {
    name: 'threadCreate',
    async execute(thread) {
      if (!thread.guild) return;
      const actor = await getAuditActor(thread.guild, AuditLogEvent.ChannelCreate, thread.id);
      await sendServerLog(thread.guild, 'thread_create', 'channels', {
        title: '💬 إنشاء ثريد',
        desc: `تم إنشاء ثريد جديد`,
        actor,
        fields: [
          { name: '💬 الثريد', value: `<#${thread.id}> (${thread.name})`, inline: true },
          { name: '📌 القناة الأصلية', value: thread.parentId ? `<#${thread.parentId}>` : 'غير معروف', inline: true }
        ]
      });
    }
  },
  {
    name: 'threadDelete',
    async execute(thread) {
      if (!thread.guild) return;
      const actor = await getAuditActor(thread.guild, AuditLogEvent.ChannelDelete, thread.id);
      await sendServerLog(thread.guild, 'thread_delete', 'channels', {
        title: '🗑️ حذف ثريد',
        desc: `تم حذف ثريد`,
        actor,
        fields: [
          { name: '💬 اسم الثريد', value: thread.name, inline: true },
          { name: '📌 القناة الأصلية', value: thread.parentId ? `<#${thread.parentId}>` : 'غير معروف', inline: true }
        ]
      });
    }
  },
  {
    name: 'threadUpdate',
    async execute(oldThread, newThread) {
      if (!newThread.guild) return;
      const changes = [];
      if (oldThread.name !== newThread.name) changes.push(`الاسم: \`${oldThread.name}\` → \`${newThread.name}\``);
      if (oldThread.archived !== newThread.archived) changes.push(newThread.archived ? 'تمت أرشفة الثريد' : 'تم إلغاء أرشفة الثريد');
      if (oldThread.locked !== newThread.locked) changes.push(newThread.locked ? 'تم قفل الثريد' : 'تم فتح الثريد');
      if (oldThread.rateLimitPerUser !== newThread.rateLimitPerUser) changes.push(`بطيء المحادثة: ${oldThread.rateLimitPerUser}ث → ${newThread.rateLimitPerUser}ث`);
      if (!changes.length) return;
      const actor = await getAuditActor(newThread.guild, AuditLogEvent.ChannelUpdate, newThread.id);
      await sendServerLog(newThread.guild, 'thread_update', 'channels', {
        title: '✏️ تعديل ثريد',
        desc: `تم تعديل ثريد **${newThread.name}**`,
        actor,
        fields: [
          { name: '💬 الثريد', value: `<#${newThread.id}>`, inline: true },
          { name: '📝 التغييرات', value: changes.join('\n'), inline: false }
        ]
      });
    }
  }
];
