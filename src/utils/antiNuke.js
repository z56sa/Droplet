const { AuditLogEvent, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const config = require('../config.json');
const logger = require('./logger');
const { isEnabled } = require('./isEnabled');

// تخزين محاولات الإجراءات الإدارية لكل مشرف: guildId -> { modId -> { channels: [], roles: [], bans: [], kicks: [] } }
const actionTracking = new Map();

// ✅ ربط المفاتيح التفصيلية للداشبورد بأنواع الإجراءات (الافتراضي: مفعل للحفاظ على السلوك الحالي)
const ACTION_TOGGLE_MAP = {
  channelDelete: ['anti_channel_delete'],
  channelCreate: ['anti_channel_create'],
  channelUpdate: ['anti_channel_update', 'anti_channel_permissions', 'anti_channel_move'],
  roleDelete: ['anti_role_delete'],
  roleCreate: ['anti_role_create'],
  roleUpdate: ['anti_role_update'],
  webhookCreate: ['anti_webhook_create'],
  webhookDelete: ['anti_webhook_create', 'anti_webhook_update'],
  webhookUpdate: ['anti_webhook_update'],
  guildUpdate: ['anti_server_name_change', 'anti_server_icon_change'],
  banAdd: ['anti_mass_ban'],
  memberKick: ['anti_mass_kick'],
};

function isActionTypeEnabled(settings, actionType) {
  const keys = ACTION_TOGGLE_MAP[actionType];
  if (!keys) return true;
  // يُفعّل النوع إذا كان أي مفتاح مرتبط به مفعلاً (الغائب = مفعل افتراضياً)
  return keys.some(k => isEnabled(settings[k], true));
}

const antiNuke = {
  /**
   * فحص وتنفيذ إجراء الحماية عند تجاوز الحد المسموح
   */
  async checkAction(guild, actionType, logType) {
    const settings = db.getGuildSettings(guild.id) || {};
    const _master = (settings.anti_nuke_enabled !== undefined && settings.anti_nuke_enabled !== null && settings.anti_nuke_enabled !== '')
      ? settings.anti_nuke_enabled : settings.antinuke_enabled;
    if (!isEnabled(_master, true)) return;
    // ✅ المفتاح التفصيلي: إذا عطّل الإدارة هذا النوع، لا تراقبه
    if (!isActionTypeEnabled(settings, actionType)) return;

    try {
      const fetchedLogs = await guild.fetchAuditLogs({
        limit: 1,
        type: logType
      }).catch(() => null);

      if (!fetchedLogs) return;
      const logEntry = fetchedLogs.entries.first();
      if (!logEntry) return;

      const executor = logEntry.executor;
      if (!executor || executor.id === guild.client.user.id || executor.id === guild.ownerId) return;

      // فحص القائمة البيضاء (Whitelist & Anti Mod)
      if (db.isUserWhitelisted && db.isUserWhitelisted(guild.id, executor.id, 'whitelist')) {
        return; // مستثنى من الحماية
      }
      if (settings.antinuke_whitelist_role) {
        const member = await guild.members.fetch(executor.id).catch(() => null);
        if (member && member.roles.cache.has(settings.antinuke_whitelist_role)) {
          return; // مستثنى من الحماية
        }
      }

      const now = Date.now();
      const oneMinuteAgo = now - 60000;

      if (!actionTracking.has(guild.id)) {
        actionTracking.set(guild.id, new Map());
      }
      const guildActions = actionTracking.get(guild.id);

      if (!guildActions.has(executor.id)) {
        guildActions.set(executor.id, {
          channelDelete: [],
          channelCreate: [],
          channelUpdate: [],
          roleDelete: [],
          roleCreate: [],
          roleUpdate: [],
          webhookCreate: [],
          webhookDelete: [],
          webhookUpdate: [],
          guildUpdate: [],
          banAdd: [],
          memberKick: []
        });
      }
      const userRecord = guildActions.get(executor.id);

      // تنظيف السجلات القديمة التي مضى عليها أكثر من دقيقة
      userRecord[actionType] = (userRecord[actionType] || []).filter(t => t > oneMinuteAgo);
      userRecord[actionType].push(now);

      let limit = 3;
      let actionLabel = 'إجراء إداري مشبوه';

      if (actionType === 'channelDelete') {
        limit = settings.antinuke_channel_limit || 3;
        actionLabel = 'حذف متكرر للرومات والقنوات';
      } else if (actionType === 'channelCreate') {
        limit = settings.antinuke_channel_limit || 3;
        actionLabel = 'إنشاء قنوات مكثف بشكل مريب (Spam Channels)';
      } else if (actionType === 'channelUpdate') {
        limit = settings.antinuke_channel_limit || 3;
        actionLabel = 'تعديل متكرر للقنوات والصلاحيات';
      } else if (actionType === 'roleDelete') {
        limit = settings.antinuke_role_limit || 3;
        actionLabel = 'حذف متكرر للرتب';
      } else if (actionType === 'roleCreate') {
        limit = settings.antinuke_role_limit || 3;
        actionLabel = 'إنشاء رتب مكثف بشكل مريب (Spam Roles)';
      } else if (actionType === 'roleUpdate') {
        limit = settings.antinuke_role_limit || 3;
        actionLabel = 'تعديل متكرر للرتب والصلاحيات';
      } else if (actionType === 'webhookCreate' || actionType === 'webhookDelete' || actionType === 'webhookUpdate') {
        limit = 3;
        actionLabel = 'تلاعب متكرر بالويب هوك';
      } else if (actionType === 'guildUpdate') {
        limit = 2;
        actionLabel = 'تغيير متكرر لاسم/أيقونة السيرفر';
      } else if (actionType === 'banAdd') {
        limit = settings.antinuke_ban_limit || 3;
        actionLabel = 'حظر جماعي للأعضاء (Mass Ban)';
      } else if (actionType === 'memberKick') {
        limit = settings.antinuke_kick_limit || 3;
        actionLabel = 'طرد متكرر للأعضاء (Mass Kick)';
      }

      if (userRecord[actionType].length >= limit) {
        const member = await guild.members.fetch(executor.id).catch(() => null);
        if (!member || !member.manageable) return;

        const punishment = settings.antinuke_punishment || 'strip_roles';
        let punishmentLabel = 'سحب كافة الصلاحيات والرتب الإدارية';

        // 1. سحب الرتب الخطيرة دائماً
        const dangerousRoles = member.roles.cache.filter(r =>
          r.permissions.has(PermissionFlagsBits.Administrator) ||
          r.permissions.has(PermissionFlagsBits.ManageGuild) ||
          r.permissions.has(PermissionFlagsBits.ManageChannels) ||
          r.permissions.has(PermissionFlagsBits.ManageRoles) ||
          r.permissions.has(PermissionFlagsBits.BanMembers) ||
          r.permissions.has(PermissionFlagsBits.KickMembers)
        );

        for (const [_, role] of dangerousRoles) {
          await member.roles.remove(role).catch(() => {});
        }

        // 2. تطبيق العقوبة الإضافية المختارة
        if (punishment === 'ban') {
          await member.ban({ reason: `[Anti-Nuke] تجاوز الحد الأقصى لـ ${actionLabel}` }).catch(() => {});
          punishmentLabel = 'حظر نهائي من السيرفر (Ban) + سحب الرتب';
        } else if (punishment === 'kick') {
          await member.kick(`[Anti-Nuke] تجاوز الحد الأقصى لـ ${actionLabel}`).catch(() => {});
          punishmentLabel = 'طرد فوري من السيرفر (Kick) + سحب الرتب';
        } else if (punishment === 'timeout') {
          await member.timeout(24 * 60 * 60 * 1000, `[Anti-Nuke] تجاوز الحد الأقصى لـ ${actionLabel}`).catch(() => {});
          punishmentLabel = 'عزل وتسكيت لمدة 24 ساعة (Timeout) + سحب الرتب';
        }

        logger.warn(`[ANTI-NUKE] تم تطبيق عقوبة (${punishmentLabel}) على المشرف ${executor.tag} في سيرفر ${guild.name} بسبب ${actionLabel}!`);

        // تسجيل في سجلات الأمان (Security Logs)
        if (db.logSecurityEvent) {
          db.logSecurityEvent(guild.id, 'security', 'auto_punish', executor.id, null, actionLabel, punishmentLabel);
        }

        // 3. إرسال تنبيه في قناة الطوارئ أو اللوق
        const alertChannelId = settings.antinuke_alert_channel || settings.antiraid_log_channel || settings.log_channel;
        if (alertChannelId) {
          const alertChannel = guild.channels.cache.get(alertChannelId);
          if (alertChannel) {
            const alertEmbed = new EmbedBuilder()
              .setColor('#FF0033')
              .setTitle('🚨 إحباط محاولة تخريب أمني (Anti-Nuke Action)')
              .setDescription(`🛡️ تم رصد محاولة تخريب وتم إحباطها بنجاح بواسطة نظام الحماية الذكي.`)
              .addFields(
                { name: '👤 المشرف الفاعل', value: `<@${executor.id}> (\`${executor.tag}\`)`, inline: true },
                { name: '⚠️ نوع المخالفة', value: `\`${actionLabel}\``, inline: true },
                { name: '📊 التكرار المسجل', value: `\`${userRecord[actionType].length}/${limit}\` خلال 60 ثانية`, inline: true },
                { name: '⚖️ الإجراء والعقوبة المطبقة', value: `**${punishmentLabel}**`, inline: false }
              )
              .setThumbnail(executor.displayAvatarURL({ dynamic: true }))
              .setFooter({ text: 'نظام الحماية المتقدم • Anti-Nuke Shield' })
              .setTimestamp();

            await alertChannel.send({ embeds: [alertEmbed] }).catch(() => {});
          }
        }

        // 4. إشعار مباشر للأونر على الخاص
        const owner = await guild.fetchOwner().catch(() => null);
        if (owner) {
          owner.send(`🚨 **تحذير أمني عاجل في سيرفرك: ${guild.name}**\nقام المشرف <@${executor.id}> (\`${executor.tag}\`) بـ **${actionLabel}** وتجاوز الحد المسموح.\n🛡️ **العقوبة المنفذة فوراً:** ${punishmentLabel}`).catch(() => {});
        }

        // تصفير السجل بعد العقوبة
        userRecord[actionType] = [];
      }
    } catch (err) {
      logger.error('خطأ في معالجة Anti-Nuke:', err);
    }
  }
};

module.exports = antiNuke;
