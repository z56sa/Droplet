const { EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { isEnabled } = require('../../utils/isEnabled');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    const guild = newMember.guild;
    const settings = db.getGuildSettings(guild.id);

    if (!settings) return;
    // ✅ حماية رتب الانضمام الخطرة: سحب الإدارة الممنوحة حديثاً دون وجه حق
    try {
      const { PermissionFlagsBits: _PFB } = require('discord.js');
      const _dangerOn = isEnabled(settings.anti_join_danger_roles, isEnabled(settings.anti_onboarding_danger, false));
      if (_dangerOn && oldMember && newMember) {
        const hadAdmin = oldMember.roles.cache.some(r => r.permissions.has(_PFB.Administrator));
        const gained = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id) && r.permissions.has(_PFB.Administrator));
        if (!hadAdmin && gained.size > 0 && newMember.id !== guild.ownerId) {
          for (const [, r] of gained) await newMember.roles.remove(r).catch(() => {});
          const _logId = settings.antinuke_alert_channel || settings.log_channel;
          const _ch = _logId ? guild.channels.cache.get(_logId) : null;
          if (_ch && _ch.isTextBased()) _ch.send(`⚠️ تم سحب رتبة إدارية مُنحت حديثاً لـ <@${newMember.id}> تلقائياً (حماية رتب الانضمام).`).catch(() => {});
          return;
        }
      }
    } catch {}
    // التحقق من تفعيل ميزة البوست (يكفي boost_msg_enabled؛ مع fallback لـ boost_enabled القديم)
    const boostMsg = (settings.boost_msg_enabled !== undefined && settings.boost_msg_enabled !== null && settings.boost_msg_enabled !== '')
      ? settings.boost_msg_enabled : settings.boost_enabled;
    if (!isEnabled(boostMsg, true)) return;

    // التحقق هل العضو قام بعمل بوست جديد
    const oldBoost = oldMember.premiumSince;
    const newBoost = newMember.premiumSince;

    // إذا أصبح يمتلك بوست بعد أن لم يكن يمتلكه
    if (!oldBoost && newBoost) {
      const user = newMember.user;
      
      // جلب أحدث بيانات للسيرفر لضمان دقة عدد البوستات
      try {
        await guild.fetch().catch(() => {});
      } catch (e) {}

      const totalBoosts = guild.premiumSubscriptionCount || 1;

      // إعطاء رتبة مكافأة البوستر التلقائية إن كانت محددة
      if (settings.booster_reward_role) {
        try {
          const rewardRole = guild.roles.cache.get(settings.booster_reward_role);
          if (rewardRole && !newMember.roles.cache.has(rewardRole.id)) {
            await newMember.roles.add(rewardRole).catch(() => {});
          }
        } catch (e) {}
      }

      // دالة استبدال المتغيرات (دعم كل الصيغ [var] و {var})
      const formatText = (text) => {
        if (!text) return '';
        return text
          .replace(/\[user\]|\{user\}/gi, `<@${user.id}>`)
          .replace(/\[globalName\]|\{globalName\}/gi, user.globalName || user.username)
          .replace(/\[displayName\]|\{displayName\}/gi, newMember.displayName || user.username)
          .replace(/\[userName\]|\{userName\}/gi, user.username)
          .replace(/\[totalBoosts\]|\{totalBoosts\}|\[count\]|\{count\}/gi, totalBoosts.toString())
          .replace(/\[serverName\]|\{serverName\}/gi, guild.name)
          .replace(/\[server\]|\{server\}/gi, guild.name);
      };

      // 1. إرسال الرسالة في روم البوست المحدد
      if (settings.boost_channel) {
        const channel = guild.channels.cache.get(settings.boost_channel);
        if (channel) {
          const rawMessage = settings.boost_message || '🎉 شكراً [user] لدعمك السيرفر بالبوست! أصبح عدد البوستات الآن [totalBoosts]!';
          const formattedMessage = formatText(rawMessage);

          if (isEnabled(settings.boost_embed_enabled, false)) {
            const embed = new EmbedBuilder()
              .setColor('#f47fff') // Nitro Pink
              .setTitle('🚀 دفعة بوست جديدة!')
              .setDescription(formattedMessage)
              .setThumbnail(user.displayAvatarURL({ dynamic: true }))
              .addFields(
                { name: '✨ الداعم', value: `<@${user.id}>`, inline: true },
                { name: '💎 إجمالي البوستات', value: `${totalBoosts}`, inline: true }
              )
              .setTimestamp();

            await channel.send({ content: `<@${user.id}>`, embeds: [embed] }).catch(() => {});
          } else {
            await channel.send({ content: formattedMessage }).catch(() => {});
          }
        }
      }

      // 2. إرسال رسالة شكر في الخاص إذا كانت مفعلة
      if (isEnabled(settings.boost_dm_enabled, false)) {
        try {
          const dmRaw = settings.boost_dm_message || 'شكراً جزيلاً لدعمك سيرفر [serverName] بالبوست! 🚀';
          const dmFormatted = formatText(dmRaw);
          await newMember.send(dmFormatted).catch(() => {});
        } catch (e) {
          // خاص مغلق
        }
      }
    }
  }
};
