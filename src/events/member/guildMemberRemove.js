const { AuditLogEvent, EmbedBuilder } = require('discord.js');
const antiNuke = require('../../utils/antiNuke');
const db = require('../../database');
const config = require('../../config.json');
const { isEnabled } = require('../../utils/isEnabled');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    if (!member.guild) return;
    const guild = member.guild;
    const settings = db.getGuildSettings(guild.id);

    // 1. فحص الحماية ومكافحة الطرد العشوائي (Anti-Nuke Kick Detection)
    try {
      await antiNuke.checkAction(guild, 'memberKick', AuditLogEvent.MemberKick);
    } catch (e) {}

    // 1.5 تحديث متتبع الدعوات وتسجيل المغادرة (Invite Tracker)
    let inviterId = null;
    try {
      const inviteTracker = require('../../utils/inviteTracker');
      inviterId = inviteTracker.handleMemberLeave(member);
    } catch (e) {}

    // 2. نظام رسائل المغادرة (Leave / Goodbye Message)
    if (isEnabled(settings.leave_enabled, false) && settings.leave_channel) {
      try {
        const leaveChannel = guild.channels.cache.get(settings.leave_channel) || await guild.channels.fetch(settings.leave_channel).catch(() => null);
        if (leaveChannel && leaveChannel.isTextBased()) {
          let msg = settings.leave_message || 'وداعاً يا [userName]، نتمنى رؤيتك مجدداً 👋 (أصبح عدد الأعضاء [memberCount])';
          msg = msg
            .replace(/\[user\]/gi, `${member.user.tag}`)
            .replace(/\{user\}/gi, `${member.user.tag}`)
            .replace(/\[userName\]/gi, member.user.username)
            .replace(/\{userName\}/gi, member.user.username)
            .replace(/\[server\]/gi, guild.name)
            .replace(/\{server\}/gi, guild.name)
            .replace(/\[memberCount\]/gi, guild.memberCount.toString())
            .replace(/\{memberCount\}/gi, guild.memberCount.toString());

          const leaveEmbed = new EmbedBuilder()
            .setColor(settings.leave_embed_color || '#ef4444')
            .setDescription(msg)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setFooter({ text: `عدد الأعضاء الحالي: ${guild.memberCount}` })
            .setTimestamp();

          await leaveChannel.send({ embeds: [leaveEmbed] }).catch(() => {});
        }
      } catch (leaveErr) {
        console.error('خطأ في إرسال رسالة المغادرة:', leaveErr.message);
      }
    }

    // 3. سجل مغادرة الأعضاء (Leave Log)
    if (settings.log_channel) {
      try {
        const logChannel = guild.channels.cache.get(settings.log_channel) || await guild.channels.fetch(settings.log_channel).catch(() => null);
        if (logChannel && logChannel.isTextBased()) {
          const inviterText = inviterId ? `<@${inviterId}>` : 'غير معروف';
          const leaveLogEmbed = new EmbedBuilder()
            .setColor('#ef4444')
            .setTitle('📤 عضو غادر السيرفر')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields(
              { name: '👤 العضو', value: `${member.user.tag} (${member.id})`, inline: true },
              { name: '🆔 الأيدي', value: `${member.id}`, inline: true },
              { name: '🔗 الداعي (Inviter)', value: inviterText, inline: true },
              { name: '👥 الأعضاء المتبقين', value: `${guild.memberCount}`, inline: true }
            )
            .setTimestamp();

          await logChannel.send({ embeds: [leaveLogEmbed] }).catch(() => {});
        }
      } catch (logErr) {
        console.error('خطأ في إرسال لوق المغادرة:', logErr.message);
      }
    }
  }
};
