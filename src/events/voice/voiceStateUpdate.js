const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { isEnabled } = require('../../utils/isEnabled');
const { ensureVoiceXp } = require('../../utils/voiceXp');

// مخزن مؤقت لحساب وقت الستاف في الرومات الصوتية (Staff Voice Tracker)
const staffVoiceMap = new Map();

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const guild = newState.guild || oldState.guild;
    const settings = db.getGuildSettings(guild.id);
    // تشغيل محرك XP الصوتي (مرة واحدة لكل عملية)
    try { ensureVoiceXp(guild.client); } catch {}

    // 👮 Staff Activity: تتبع وقت الرومات الصوتية للستاف
    const isStaff = member.permissions.has(PermissionFlagsBits.Administrator) ||
                    member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
                    (settings.staff_role && member.roles.cache.has(settings.staff_role)) ||
                    (settings.support_role && member.roles.cache.has(settings.support_role));

    const sessionKey = `${guild.id}_${member.id}`;

    if (isStaff) {
      if (!oldState.channelId && newState.channelId) {
        // دخول روم صوتي
        staffVoiceMap.set(sessionKey, Date.now());
      } else if (oldState.channelId && !newState.channelId) {
        // خروج من روم صوتي
        const joinTime = staffVoiceMap.get(sessionKey);
        if (joinTime) {
          const durationSeconds = Math.floor((Date.now() - joinTime) / 1000);
          if (durationSeconds > 10 && db.addStaffVoiceTime) {
            db.addStaffVoiceTime(guild.id, member.id, durationSeconds);
          }
          staffVoiceMap.delete(sessionKey);
        }
      }
    }

    // ==========================================
    // 1. نظام الرومات الصوتية المؤقتة (Temp Voice)
    // ==========================================
    if (isEnabled(settings.temp_voice_enabled, false) && settings.temp_voice_channel && newState.channelId === settings.temp_voice_channel) {
      try {
        const categoryId = settings.temp_voice_category || newState.channel?.parentId;
        const tpl = String(settings.temp_voice_name_template || '🔊 | {user}').slice(0, 90) || '🔊 | {user}';
        const chName = tpl.replace(/\{user\}|\[user\]/gi, member.user.username).replace(/\{name\}|\[name\]/gi, member.displayName || member.user.username);
        const userLimit = Math.max(0, Math.min(99, parseInt(settings.temp_voice_user_limit) || 0));
        // 🔁 منع تكرار الروم المؤقت: لو العضو عنده روم مؤقت شغّال (فيه أعضاء) بنفس السيرفر ننقله إليه
        // بدل ما نبلش روم جديد كل ضغطة على روم الانتظار (يحرق كوتا القنوات)
        let tempVoiceChannel = null;
        let _tempReused = false;
        const _ownedTemp = db.getTempVoiceByOwner ? db.getTempVoiceByOwner(guild.id, member.id) : null;
        if (_ownedTemp) {
          const _ownedChan = guild.channels.cache.get(_ownedTemp.channel_id);
          if (_ownedChan && _ownedChan.members && _ownedChan.members.size > 0) {
            tempVoiceChannel = _ownedChan;
            _tempReused = true;
          }
        }
        if (!tempVoiceChannel) tempVoiceChannel = await guild.channels.create({
          name: chName,
          type: ChannelType.GuildVoice,
          parent: categoryId || null,
          ...(userLimit > 0 ? { userLimit } : {}),
          permissionOverwrites: [
            {
              id: member.id,
              allow: [
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.MoveMembers,
                PermissionFlagsBits.MuteMembers,
                PermissionFlagsBits.DeafenMembers,
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.Speak
              ]
            }
          ]
        });

        if (db.createTempVoice && !_tempReused) {
          db.createTempVoice(tempVoiceChannel.id, guild.id, member.id);
        }

        // نقل العضو فوراً إلى الروم الصوتي الجديد
        await member.voice.setChannel(tempVoiceChannel).catch(err => {
          console.error('فشل في نقل العضو للروم المؤقت (تأكد من صلاحية Move Members للبوت):', err);
        });
      } catch (err) {
        console.error('فشل في إنشاء الروم الصوتي المؤقت:', err);
      }
    }

    // حذف الروم المؤقت تلقائياً عند خروج الجميع منه
    if (oldState.channelId && oldState.channelId !== settings.temp_voice_channel) {
      const isTemp = db.isTempVoice ? db.isTempVoice(oldState.channelId) : false;
      if (isTemp) {
        const channel = guild.channels.cache.get(oldState.channelId) || await guild.channels.fetch(oldState.channelId).catch(() => null);
        if (channel && channel.members.size === 0) {
          try {
            if (db.deleteTempVoice) db.deleteTempVoice(oldState.channelId);
            await channel.delete().catch(() => {});
          } catch (err) {
            console.error('فشل في حذف الروم المؤقت:', err);
          }
        }
      }
    }

    // ==========================================
    // 2. سجلات الرومات الصوتية (Voice Logs)
    // 🔒 (سد R7-1) كانت تُصبّ مباشرة في روم الإدارة العام بلا أي بوابة — كل حركة صوت بأي عضو
    // كانت تغرق روم الإدارة وتدفن الباند/الكيتش الحقيقي. الآن عبر نظام serverLogger الموحد:
    // بوابة logs_enabled + مفتاح لكل حدث (vc_join/vc_leave/vc_switch) + قناة الصوت المخصصة
    // log_channel_voice — مطفية افتراضياً من لوحة السجلات حتى يفعّلها الإداري
    // ==========================================
    const { sendServerLog } = require('../../utils/serverLogger');

    // دخول روم صوتي
    if (!oldState.channelId && newState.channelId) {
      await sendServerLog(guild, 'vc_join', 'voice', {
        title: '🔊 دخول روم صوتي',
        desc: `قام **${member.user.tag}** (<@${member.id}>) بالدخول إلى الروم الصوتي <#${newState.channelId}>`
      }).catch(() => {});
    }
    // مغادرة روم صوتي
    else if (oldState.channelId && !newState.channelId) {
      await sendServerLog(guild, 'vc_leave', 'voice', {
        title: '🔇 مغادرة روم صوتي',
        desc: `قام **${member.user.tag}** (<@${member.id}>) بمغادرة الروم الصوتي <#${oldState.channelId}>`
      }).catch(() => {});
    }
    // الانتقال بين الرومات الصوتية
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      await sendServerLog(guild, 'vc_switch', 'voice', {
        title: '🔄 انتقال بين الرومات الصوتية',
        desc: `انتقل **${member.user.tag}** (<@${member.id}>) من <#${oldState.channelId}> إلى <#${newState.channelId}>`
      }).catch(() => {});
    }
  }
};
