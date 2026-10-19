const { sendServerLog } = require('../../utils/serverLogger');
const { AuditLogEvent } = require('discord.js');
const { getAuditActor } = require('../../utils/auditActor');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    const guild = newMember.guild;
    const user = newMember.user;

    // تغيير الاسم المستعار (Nickname) — الفاعل: هو نفسه أو مشرف عبر سجل التدقيق
    if (oldMember.nickname !== newMember.nickname) {
      const auditActor = await getAuditActor(guild, AuditLogEvent.MemberUpdate, user.id);
      const actor = (auditActor && auditActor.id !== user.id) ? auditActor : { id: user.id, tag: user.tag, reason: null };
      await sendServerLog(guild, 'member_nick_change', 'members', {
        title: '✏️ تغيير الاسم المستعار',
        desc: `**${user.tag}** قام بتغيير اسمه المستعار`,
        actor,
        fields: [
          { name: '👤 العضو', value: `<@${user.id}> (${user.tag})`, inline: true },
          { name: '📝 الاسم القديم', value: oldMember.nickname || 'لا يوجد', inline: true },
          { name: '📝 الاسم الجديد', value: newMember.nickname || 'لا يوجد', inline: true },
          { name: '🆔 الأيدي', value: user.id, inline: true }
        ],
        thumbnail: user.displayAvatarURL({ dynamic: true })
      });
    }

    // إضافة رتبة لعضو
    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id) && r.id !== guild.id);
    const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id) && r.id !== guild.id);

    if (addedRoles.size > 0) {
      const actor = await getAuditActor(guild, AuditLogEvent.MemberRoleUpdate, user.id);
      await sendServerLog(guild, 'role_give_member', 'roles', {
        title: '🎁 إضافة رتبة لعضو',
        desc: `تم إعطاء رتبة لـ **${user.tag}**`,
        actor,
        fields: [
          { name: '👤 العضو', value: `<@${user.id}>`, inline: true },
          { name: '🎖️ الرتبة المضافة', value: addedRoles.map(r => `<@&${r.id}>`).join(', '), inline: true },
          { name: '🆔 الأيدي', value: user.id, inline: true }
        ],
        thumbnail: user.displayAvatarURL({ dynamic: true })
      });
    }

    if (removedRoles.size > 0) {
      const actor = await getAuditActor(guild, AuditLogEvent.MemberRoleUpdate, user.id);
      await sendServerLog(guild, 'role_remove_member', 'roles', {
        title: '❌ إزالة رتبة من عضو',
        desc: `تم إزالة رتبة من **${user.tag}**`,
        actor,
        fields: [
          { name: '👤 العضو', value: `<@${user.id}>`, inline: true },
          { name: '🎖️ الرتبة المزالة', value: removedRoles.map(r => `<@&${r.id}>`).join(', '), inline: true },
          { name: '🆔 الأيدي', value: user.id, inline: true }
        ],
        thumbnail: user.displayAvatarURL({ dynamic: true })
      });
    }

    // بوست السيرفر
    if (!oldMember.premiumSince && newMember.premiumSince) {
      try { await guild.fetch().catch(() => {}); } catch(e) {}
      await sendServerLog(guild, 'member_boost_add', 'members', {
        title: '💎 بوست جديد!',
        desc: `**${user.tag}** قام ببوست السيرفر! 🎉`,
        fields: [
          { name: '👤 العضو', value: `<@${user.id}>`, inline: true },
          { name: '💎 إجمالي البوستات', value: `${guild.premiumSubscriptionCount || 0}`, inline: true }
        ],
        thumbnail: user.displayAvatarURL({ dynamic: true })
      });
    }

    if (oldMember.premiumSince && !newMember.premiumSince) {
      try { await guild.fetch().catch(() => {}); } catch(e) {}
      await sendServerLog(guild, 'member_boost_remove', 'members', {
        title: '🗑️ إزالة البوست',
        desc: `**${user.tag}** أزال البوست من السيرفر`,
        fields: [
          { name: '👤 العضو', value: `<@${user.id}>`, inline: true },
          { name: '💎 إجمالي البوستات', value: `${guild.premiumSubscriptionCount || 0}`, inline: true }
        ],
        thumbnail: user.displayAvatarURL({ dynamic: true })
      });
    }

    // العزل (Timeout)
    if (!oldMember.communicationDisabledUntil && newMember.communicationDisabledUntil) {
      let executor = null;
      let reason = null;
      try {
        const auditLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 1 });
        const entry = auditLogs.entries.first();
        if (entry && entry.target?.id === user.id) { executor = entry.executor; reason = entry.reason; }
      } catch (e) {}

      await sendServerLog(guild, 'member_timeout', 'members', {
        title: '⏳ عزل عضو (تايم أوت)',
        desc: `تم عزل **${user.tag}** مؤقتاً`,
        fields: [
          { name: '👤 العضو', value: `<@${user.id}>`, inline: true },
          { name: '⏰ ينتهي في', value: `<t:${Math.floor(newMember.communicationDisabledUntil.getTime() / 1000)}:R>`, inline: true },
          { name: '👮 المنفذ', value: executor ? `<@${executor.id}>` : 'غير معروف', inline: true },
          { name: '📝 السبب', value: reason || 'لا يوجد سبب', inline: false }
        ],
        thumbnail: user.displayAvatarURL({ dynamic: true })
      });
    }

    if (oldMember.communicationDisabledUntil && !newMember.communicationDisabledUntil) {
      await sendServerLog(guild, 'member_untimeout', 'members', {
        title: '➕ إزالة العزل',
        desc: `تم إزالة العزل عن **${user.tag}**`,
        fields: [
          { name: '👤 العضو', value: `<@${user.id}>`, inline: true },
          { name: '🆔 الأيدي', value: user.id, inline: true }
        ],
        thumbnail: user.displayAvatarURL({ dynamic: true })
      });
    }
  }
};
