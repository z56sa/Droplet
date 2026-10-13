// ========================================================
// FILE: src/utils/inviteTracker.js
// متتبع الدعوات المتقدم (Advanced Invite Tracker Cache, Resolver & Rewards)
// ========================================================
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../database');
const logger = require('./logger');

class InviteTracker {
  constructor() {
    // guildId -> { invites: Map(code, { uses, maxUses, inviterId, inviterUser }), vanityUses: number, vanityCode: string }
    this.guildData = new Map();
  }

  async init(client) {
    logger.info('تهيئة كاش متتبع الدعوات المتقدم (Advanced Invite Tracker)...');
    try {
      for (const [, guild] of client.guilds.cache) {
        await this.cacheGuild(guild);
      }
      logger.success(`تم كاش دعوات ${this.guildData.size} سيرفر بنجاح.`);
    } catch (e) {
      logger.error('خطأ أثناء تهيئة كاش الدعوات: ' + e.message);
    }
  }

  hasPermission(guild) {
    if (!guild) return false;
    const me = guild.members?.me;
    if (!me) return true;
    return me.permissions.has(PermissionFlagsBits.ManageGuild) || me.permissions.has(PermissionFlagsBits.Administrator);
  }

  async cacheGuild(guild) {
    if (!guild || !this.hasPermission(guild)) return;
    try {
      const invites = await guild.invites.fetch().catch(() => null);
      const codeMap = new Map();
      if (invites) {
        for (const [code, inv] of invites) {
          codeMap.set(code, {
            uses: inv.uses || 0,
            maxUses: inv.maxUses || 0,
            inviterId: inv.inviter?.id || null,
            inviterUser: inv.inviter || null
          });
        }
      }

      let vanityUses = 0;
      let vanityCode = null;
      if (guild.vanityURLCode) {
        vanityCode = guild.vanityURLCode;
        const vanity = await guild.fetchVanityData().catch(() => null);
        vanityUses = vanity?.uses || 0;
      }

      this.guildData.set(guild.id, {
        invites: codeMap,
        vanityUses,
        vanityCode
      });
    } catch (err) {}
  }

  /**
   * فحص من دعا العضو بدقة ورصد الريد/الوهمي/إعادة الدخول/الـ Vanity
   */
  async findInviter(member) {
    const guild = member.guild;
    const settings = db.getGuildSettings(guild.id) || {};
    const fakeDaysThreshold = settings.invites_fake_days || 3;

    // 0. فحص إن كان الرابط إضافة بوت (OAuth2)
    if (member.user.bot) {
      return {
        inviter: null,
        code: 'OAuth2 Bot Add',
        isBot: true,
        isFake: false,
        isSelf: false,
        isRejoin: false,
        isVanity: false,
        accountAgeDays: (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24)
      };
    }

    if (!this.hasPermission(guild)) {
      return { inviter: null, code: null, isFake: false, isSelf: false, isRejoin: false, isVanity: false };
    }

    try {
      const cached = this.guildData.get(guild.id) || { invites: new Map(), vanityUses: 0, vanityCode: null };
      const cachedMap = cached.invites;
      const currentInvites = await guild.invites.fetch().catch(() => null);

      let usedInvite = null;
      let usedInviterUser = null;
      let usedCode = null;
      let isVanity = false;

      if (currentInvites) {
        const currentCodeMap = new Map();

        // 1. فحص روابط الدعوة التي زاد استخدامها
        for (const [code, inv] of currentInvites) {
          const cachedData = cachedMap.get(code);
          const prevUses = cachedData ? cachedData.uses : 0;
          if (inv.uses > prevUses) {
            usedInvite = inv;
            usedInviterUser = inv.inviter || null;
            usedCode = code;
          }
          currentCodeMap.set(code, {
            uses: inv.uses || 0,
            maxUses: inv.maxUses || 0,
            inviterId: inv.inviter?.id || null,
            inviterUser: inv.inviter || null
          });
        }

        // 2. فحص روابط الاستخدام الواحد (التي يحذفها ديسكورد فور استخدامها)
        if (!usedInvite) {
          for (const [code, cachedData] of cachedMap.entries()) {
            if (!currentCodeMap.has(code)) {
              const maxUses = cachedData.maxUses || 0;
              const prevUses = cachedData.uses || 0;
              if (maxUses === 1 || (maxUses > 0 && prevUses + 1 >= maxUses)) {
                usedCode = code;
                usedInviterUser = cachedData.inviterUser || (cachedData.inviterId ? await member.client.users.fetch(cachedData.inviterId).catch(() => null) : null);
                break;
              }
            }
          }
        }

        // 3. فحص رابط السيرفر المخصص (Vanity URL)
        let currentVanityUses = cached.vanityUses;
        if (!usedInvite && !usedCode && guild.vanityURLCode) {
          const vanity = await guild.fetchVanityData().catch(() => null);
          if (vanity && vanity.uses > cached.vanityUses) {
            usedCode = guild.vanityURLCode;
            isVanity = true;
            currentVanityUses = vanity.uses;
          }
        }

        // تحديث الكاش
        this.guildData.set(guild.id, {
          invites: currentCodeMap,
          vanityUses: currentVanityUses,
          vanityCode: guild.vanityURLCode || null
        });
      }

      // فحص عمر الحساب لتحديد إن كان وهمياً (Fake)
      const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
      const isFake = accountAgeDays < fakeDaysThreshold;

      // فحص دعوة النفس (Self Invite)
      const isSelf = Boolean(usedInviterUser && usedInviterUser.id === member.id);

      // حفظ السجل في قاعدة البيانات مع معالجة إعادة الدخول (Rejoin)
      const recordResult = db.addInviteRecord(
        guild.id,
        usedInviterUser ? usedInviterUser.id : null,
        member.id,
        usedCode,
        isFake ? 1 : 0
      );

      const isRejoin = Boolean(recordResult?.isRejoin);

      // إعطاء رتب المكافآت التلقائية للداعي إن توفرت
      if (usedInviterUser && !isSelf && !isFake) {
        this.syncMemberRewards(guild, usedInviterUser.id).catch(() => {});
        this.sendInviterJoinDM(guild, usedInviterUser, member, recordResult?.isRejoin).catch(() => {});
      }

      // إرسال سجل الدعوة إلى روم السجلات إن كان مفعلاً
      const inviterStats = usedInviterUser ? db.getInvites(guild.id, usedInviterUser.id) : null;
      this.sendInviteLog(guild, {
        member,
        inviter: usedInviterUser,
        code: usedCode,
        isFake,
        isSelf,
        isRejoin,
        isVanity,
        accountAgeDays,
        stats: inviterStats
      }).catch(() => {});

      return {
        inviter: usedInviterUser,
        code: usedCode,
        isFake,
        isSelf,
        isRejoin,
        isVanity,
        accountAgeDays
      };
    } catch (e) {
      logger.error(`خطأ في فحص دعوة العضو ${member.id}: ${e.message}`);
      return { inviter: null, code: null, isFake: false, isSelf: false, isRejoin: false, isVanity: false };
    }
  }

  /**
   * إرسال إشعار في الخاص للداعي عند استخدام دعوته
   */
  async sendInviterJoinDM(guild, inviterUser, joinedMember, isRejoin = false) {
    try {
      const settings = db.getGuildSettings(guild.id) || {};
      const dmNotify = settings.invites_dm_notify === undefined || settings.invites_dm_notify === null ? 1 : Number(settings.invites_dm_notify);
      if (!dmNotify) return;

      const stats = db.getInvites(guild.id, inviterUser.id);
      const dmEmbed = new EmbedBuilder()
        .setColor('#10B981')
        .setTitle('🎉 عضو جديد انضم عبر رابط دعوتك!')
        .setDescription(`مرحباً **${inviterUser.username}**، انضم العضو <@${joinedMember.id}> (\`${joinedMember.user.tag}\`) إلى سيرفر **${guild.name}** باستخدام رابط دعوتك!`)
        .addFields(
          { name: '📊 مجموع دعواتك الآن', value: `\`${stats.total}\` دعوة صالحة`, inline: true },
          { name: '👥 السيرفر', value: `${guild.name}`, inline: true }
        )
        .setThumbnail(guild.iconURL({ dynamic: true }) || undefined)
        .setFooter({ text: 'Droplet Invite Notifications' })
        .setTimestamp();

      if (isRejoin) {
        dmEmbed.addFields({ name: 'ℹ️ ملاحظة', value: 'هذا العضو كان في السيرفر سابقاً وتم تسجيل إعادة انضمامه.', inline: false });
      }

      await inviterUser.send({ embeds: [dmEmbed] }).catch(() => {});
    } catch (e) {}
  }

  /**
   * معالجة مغادرة العضو وتحديث إحصائيات الداعي وسحب الرتب إن لزم
   */
  async handleMemberLeave(member) {
    try {
      const inviterId = db.removeInviteMember(member.guild.id, member.id);
      if (inviterId) {
        const stats = db.getInvites(member.guild.id, inviterId);
        // سحب رتب المكافآت إن تم تفعيل خيار السحب ونقص العدد
        this.syncMemberRewards(member.guild, inviterId).catch(() => {});
        // إرسال لوق المغادرة
        this.sendLeaveLog(member.guild, { member, inviterId, stats }).catch(() => {});
        return inviterId;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * فحص وتوزيع مكافآت الرتب التلقائية بناءً على عدد الدعوات (وسحبها إذا نقصت)
   */
  async syncMemberRewards(guild, userId) {
    if (!guild || !userId) return;
    try {
      const settings = db.getGuildSettings(guild.id) || {};
      const removeOnLeave = settings.invites_remove_on_leave === undefined || settings.invites_remove_on_leave === null ? 1 : Number(settings.invites_remove_on_leave);

      const rewards = db.getInviteRewards(guild.id) || [];
      if (rewards.length === 0) return;

      const stats = db.getInvites(guild.id, userId);
      const totalInvites = stats.total || 0;

      const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
      if (!member || !guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) return;

      const botHighest = guild.members.me.roles.highest.position;

      for (const reward of rewards) {
        const role = guild.roles.cache.get(reward.role_id) || await guild.roles.fetch(reward.role_id).catch(() => null);
        if (!role || role.position >= botHighest) continue;

        if (totalInvites >= reward.required_invites) {
          if (!member.roles.cache.has(role.id)) {
            await member.roles.add(role, `[Invite Rewards] وصول إلى ${reward.required_invites} دعوة بنجاح`).catch(() => {});
          }
        } else if (removeOnLeave && member.roles.cache.has(role.id)) {
          // سحب الرتبة إذا نقصت الدعوات تحت المطلوب وتفعيل خيار السحب
          await member.roles.remove(role, `[Invite Rewards] نقص الدعوات (${totalInvites}/${reward.required_invites})`).catch(() => {});
        }
      }
    } catch (err) {
      logger.error(`خطأ في مزامنة مكافآت الدعوات لـ ${userId}:`, err);
    }
  }

  /**
   * إرسال تقرير إحصائي مفصل في روم سجلات الدعوات
   */
  async sendInviteLog(guild, { member, inviter, code, isFake, isSelf, isRejoin, isVanity, accountAgeDays, stats }) {
    const settings = db.getGuildSettings(guild.id) || {};
    const logChannelId = settings.invites_log_channel || settings.log_channel;
    if (!logChannelId) return;

    const logCh = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
    if (!logCh || !logCh.isTextBased()) return;

    let statusText = '🟢 عضو جديد (حقيقي)';
    let color = '#10B981';

    if (isSelf) {
      statusText = '⚠️ دعوة شخصية (Self Invite)';
      color = '#F59E0B';
    } else if (isFake) {
      statusText = `🔞 حساب وهمي (عمره ${Math.floor(accountAgeDays)} يوم فقط)`;
      color = '#EF4444';
    } else if (isRejoin) {
      statusText = '🔄 إعادة انضمام (Rejoin)';
      color = '#3B82F6';
    } else if (isVanity) {
      statusText = '🌐 رابط السيرفر المخصص (Vanity URL)';
      color = '#8B5CF6';
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle('📥 متتبع الدعوات | انضمام عضو جديد')
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '👤 العضو المنضم', value: `<@${member.id}> (\`${member.user.tag}\`)`, inline: true },
        { name: '🔗 الداعي', value: inviter ? `<@${inviter.id}> (\`${inviter.tag}\`)` : (code ? `رابط (\`${code}\`)` : 'غير معروف'), inline: true },
        { name: '📋 حالة الدعوة', value: statusText, inline: true }
      );

    if (stats) {
      embed.addFields({
        name: '📊 إحصائيات الداعي الحالية',
        value: `**المجموع:** \`${stats.total}\` | عادية: \`${stats.regular}\` | غادروا: \`${stats.leaves}\` | وهمية: \`${stats.fake}\` | إضافية: \`${stats.bonus}\``,
        inline: false
      });
    }

    embed.setFooter({ text: `معرف العضو: ${member.id} • Droplet Invite Tracker` }).setTimestamp();

    await logCh.send({ embeds: [embed] }).catch(() => {});
  }

  /**
   * إرسال تقرير عند مغادرة عضو مدعو
   */
  async sendLeaveLog(guild, { member, inviterId, stats }) {
    const settings = db.getGuildSettings(guild.id) || {};
    const logChannelId = settings.invites_log_channel || settings.log_channel;
    if (!logChannelId) return;

    const logCh = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
    if (!logCh || !logCh.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor('#EF4444')
      .setTitle('📤 متتبع الدعوات | مغادرة عضو')
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '👤 العضو المغادر', value: `<@${member.id}> (\`${member.user.tag}\`)`, inline: true },
        { name: '🔗 كان مدعواً بواسطة', value: inviterId ? `<@${inviterId}>` : 'غير معروف', inline: true }
      );

    if (stats) {
      embed.addFields({
        name: '📊 إحصائيات الداعي بعد الخصم',
        value: `**المجموع:** \`${stats.total}\` | عادية: \`${stats.regular}\` | غادروا: \`${stats.leaves}\` | وهمية: \`${stats.fake}\` | إضافية: \`${stats.bonus}\``,
        inline: false
      });
    }

    embed.setFooter({ text: `معرف العضو: ${member.id} • Droplet Invite Tracker` }).setTimestamp();

    await logCh.send({ embeds: [embed] }).catch(() => {});
  }

  onInviteCreate(invite) {
    if (!invite?.guild) return;
    const data = this.guildData.get(invite.guild.id);
    if (data?.invites) {
      data.invites.set(invite.code, {
        uses: invite.uses || 0,
        maxUses: invite.maxUses || 0,
        inviterId: invite.inviter?.id || null,
        inviterUser: invite.inviter || null
      });
    }
  }

  onInviteDelete(invite) {
    if (!invite?.guild) return;
    const data = this.guildData.get(invite.guild.id);
    if (data?.invites) {
      data.invites.delete(invite.code);
    }
  }
}

const tracker = new InviteTracker();
module.exports = tracker;
