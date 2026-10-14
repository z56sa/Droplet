const { AuditLogEvent, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const config = require('../config.json');
const logger = require('./logger');
const { isEnabled } = require('./isEnabled');

// ذاكرة مؤقتة في الرام للسرعة (يُدعم الآن بـ SQLite للاستمرارية بعد الإعادة)
const processedAuditLogIds = new Set();

// ✅ ربط المفاتيح التفصيلية للداشبورد بأنواع الإجراءات
const ACTION_TOGGLE_MAP = {
  channelDelete:  ['anti_channel_delete'],
  channelCreate:  ['anti_channel_create'],
  channelUpdate:  ['anti_channel_update', 'anti_channel_permissions', 'anti_channel_move'],
  roleDelete:     ['anti_role_delete'],
  roleCreate:     ['anti_role_create'],
  roleUpdate:     ['anti_role_update'],
  webhookCreate:  ['anti_webhook_create'],
  webhookDelete:  ['anti_webhook_create', 'anti_webhook_update'],
  webhookUpdate:  ['anti_webhook_update'],
  guildUpdate:    ['anti_server_name_change', 'anti_server_icon_change'],
  banAdd:         ['anti_mass_ban'],
  memberKick:     ['anti_mass_kick'],
  botAdd:         ['anti_bot_add', 'anti_bot'],
  massUnban:      ['anti_mass_unban'],
  massTimeout:    ['anti_mass_timeout'],
  emojiDelete:    ['anti_emoji_delete'],
  inviteSpam:     ['anti_invite_spam'],
};

// حدود افتراضية لكل نوع إجراء
const DEFAULT_LIMITS = {
  channelDelete:  3,
  channelCreate:  3,
  channelUpdate:  3,
  roleDelete:     3,
  roleCreate:     3,
  roleUpdate:     3,
  webhookCreate:  3,
  webhookDelete:  3,
  webhookUpdate:  3,
  guildUpdate:    2,
  banAdd:         3,
  memberKick:     3,
  botAdd:         1,
  massUnban:      5,
  massTimeout:    3,
  emojiDelete:    5,
  inviteSpam:     5,
};

const ACTION_LABELS = {
  channelDelete: 'حذف متكرر للروم والقنوات',
  channelCreate: 'إنشاء قنوات مكثف بشكل مريب (Spam Channels)',
  channelUpdate: 'تعديل متكرر للقنوات والصلاحيات',
  roleDelete:    'حذف متكرر للرتب',
  roleCreate:    'إنشاء رتب مكثف بشكل مريب (Spam Roles)',
  roleUpdate:    'تعديل متكرر للرتب والصلاحيات',
  webhookCreate: 'تلاعب متكرر بالويب هوك',
  webhookDelete: 'تلاعب متكرر بالويب هوك',
  webhookUpdate: 'تلاعب متكرر بالويب هوك',
  guildUpdate:   'تغيير متكرر لاسم/أيقونة السيرفر',
  banAdd:        'حظر جماعي للأعضاء (Mass Ban)',
  memberKick:    'طرد متكرر للأعضاء (Mass Kick)',
  botAdd:        'إضافة بوتات غير مصرح بها (Unauthorized Bot Add)',
  massUnban:     'رفع حظر جماعي مشبوه (Mass Unban)',
  massTimeout:   'تسكيت جماعي للأعضاء (Mass Timeout)',
  emojiDelete:   'حذف جماعي للإيموجي (Mass Emoji Delete)',
  inviteSpam:    'إنشاء روابط دعوة بشكل مكثف (Invite Spam)',
};

function isActionTypeEnabled(settings, actionType) {
  const keys = ACTION_TOGGLE_MAP[actionType];
  if (!keys) return true;

  const hasExplicitTrue = keys.some(k =>
    settings[k] !== undefined && settings[k] !== null && settings[k] !== '' && isEnabled(settings[k], false)
  );
  if (hasExplicitTrue) return true;

  const hasExplicitFalse = keys.every(k =>
    settings[k] !== undefined && settings[k] !== null && settings[k] !== '' && !isEnabled(settings[k], true)
  );
  if (hasExplicitFalse && keys.some(k => settings[k] !== undefined && settings[k] !== null && settings[k] !== '')) {
    return false;
  }
  return true;
}

// تنظيف دوري لقاعدة البيانات (كل 5 دقائق)
setInterval(() => {
  try { db.pruneNukeActions(); } catch {}
}, 5 * 60 * 1000);

const antiNuke = {
  /**
   * فحص وتنفيذ إجراء الحماية عند تجاوز الحد المسموح
   * @param {Guild} guild
   * @param {string} actionType - نوع الإجراء
   * @param {AuditLogEvent|null} logType - نوع سجل التدقيق (null = بدون fetch مسبق)
   * @param {string|null} executorId - معرف المنفذ (إذا كان معروفاً مسبقاً)
   */
  async checkAction(guild, actionType, logType, executorId = null) {
    if (!guild) return;
    const settings = db.getGuildSettings(guild.id) || {};
    const _master = (settings.anti_nuke_enabled !== undefined && settings.anti_nuke_enabled !== null && settings.anti_nuke_enabled !== '')
      ? settings.anti_nuke_enabled : settings.antinuke_enabled;
    if (!isEnabled(_master, false)) return;
    if (!isActionTypeEnabled(settings, actionType)) return;

    try {
      let executor = null;

      if (executorId) {
        // المنفذ مُعرَف مسبقاً (من guildAuditLogEntryCreate مثلاً)
        executor = { id: executorId, tag: executorId };
      } else if (logType !== null) {
        // جلب آخر 5 سجلات بدلاً من 1 لمنع الفقدان عند التسارع
        const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: logType }).catch(() => null);
        if (!fetchedLogs) return;

        // نبحث عن أحدث سجل لم يُعالج بعد (أقل من 15 ثانية)
        const now = Date.now();
        for (const [, entry] of fetchedLogs.entries) {
          if (now - entry.createdTimestamp > 15000) continue;
          if (processedAuditLogIds.has(entry.id)) continue;
          processedAuditLogIds.add(entry.id);
          setTimeout(() => processedAuditLogIds.delete(entry.id), 60000);
          executor = entry.executor;
          break;
        }
        if (!executor) return;
      } else {
        return;
      }

      if (!executor || executor.id === guild.client.user.id || executor.id === guild.ownerId) return;

      // فحص القائمة البيضاء
      if (db.isUserWhitelisted && db.isUserWhitelisted(guild.id, executor.id, 'whitelist')) return;
      if (settings.antinuke_whitelist_role) {
        const member = await guild.members.fetch(executor.id).catch(() => null);
        if (member && member.roles.cache.has(settings.antinuke_whitelist_role)) return;
      }

      // ✅ الحفظ في SQLite (مستمر عبر restarts)
      db.saveNukeAction(guild.id, executor.id, actionType);

      // قراءة الإجراءات الأخيرة (آخر 60 ثانية) من SQLite + RAM
      const sinceMs = Date.now() - 60000;
      const recentActions = db.getNukeActions(guild.id, executor.id, actionType, sinceMs);
      const count = recentActions.length;

      // تحديد الحد حسب الإعدادات أو الافتراضي
      let limit = DEFAULT_LIMITS[actionType] ?? 3;
      if (actionType === 'channelDelete' || actionType === 'channelCreate' || actionType === 'channelUpdate') {
        limit = settings.antinuke_channel_limit || limit;
      } else if (actionType === 'roleDelete' || actionType === 'roleCreate' || actionType === 'roleUpdate') {
        limit = settings.antinuke_role_limit || limit;
      } else if (actionType === 'banAdd') {
        limit = settings.antinuke_ban_limit || limit;
      } else if (actionType === 'memberKick') {
        limit = settings.antinuke_kick_limit || limit;
      } else if (actionType === 'botAdd') {
        limit = settings.antinuke_bot_limit || limit;
      }

      const actionLabel = ACTION_LABELS[actionType] || 'إجراء إداري مشبوه';

      if (count >= limit) {
        // جلب العضو لتطبيق العقوبة
        let execMember = null;
        try {
          execMember = await guild.members.fetch(executor.id);
        } catch {}
        if (!execMember || !execMember.manageable) return;

        const punishment = settings.antinuke_punishment || 'strip_roles';
        let punishmentLabel = 'سحب كافة الصلاحيات والرتب الإدارية';

        // 1. سحب الرتب الخطيرة
        const dangerousRoles = execMember.roles.cache.filter(r =>
          r.permissions.has(PermissionFlagsBits.Administrator) ||
          r.permissions.has(PermissionFlagsBits.ManageGuild) ||
          r.permissions.has(PermissionFlagsBits.ManageChannels) ||
          r.permissions.has(PermissionFlagsBits.ManageRoles) ||
          r.permissions.has(PermissionFlagsBits.BanMembers) ||
          r.permissions.has(PermissionFlagsBits.KickMembers)
        );
        const dangerousRoleIds = Array.from(dangerousRoles.keys());
        if (dangerousRoleIds.length > 0) {
          await execMember.roles.remove(dangerousRoleIds, `[Anti-Nuke] سحب رتب بسبب ${actionLabel}`).catch(() => {});
        }

        // 2. تطبيق العقوبة
        if (punishment === 'ban') {
          await execMember.ban({ reason: `[Anti-Nuke] ${actionLabel}` }).catch(() => {});
          punishmentLabel = 'حظر نهائي (Ban) + سحب الرتب';
        } else if (punishment === 'kick') {
          await execMember.kick(`[Anti-Nuke] ${actionLabel}`).catch(() => {});
          punishmentLabel = 'طرد فوري (Kick) + سحب الرتب';
        } else if (punishment === 'timeout') {
          await execMember.timeout(24 * 60 * 60 * 1000, `[Anti-Nuke] ${actionLabel}`).catch(() => {});
          punishmentLabel = 'تسكيت 24 ساعة (Timeout) + سحب الرتب';
        } else if (punishment === 'jail') {
          if (settings.jail_role) {
            await execMember.roles.add(settings.jail_role, `[Anti-Nuke] ${actionLabel}`).catch(() => {});
            punishmentLabel = 'سجن (Jail) + سحب الرتب';
          } else {
            await execMember.timeout(24 * 60 * 60 * 1000, `[Anti-Nuke] ${actionLabel}`).catch(() => {});
            punishmentLabel = 'تسكيت (Timeout) + سحب الرتب';
          }
        }

        logger.warn(`[ANTI-NUKE] عقوبة (${punishmentLabel}) على ${executor.tag ?? executor.id} في ${guild.name} بسبب ${actionLabel}`);

        if (db.logSecurityEvent) {
          db.logSecurityEvent(guild.id, 'security', 'auto_punish', executor.id, null, actionLabel, punishmentLabel);
        }

        // 3. تنبيه قناة الطوارئ
        const alertChannelId = settings.antinuke_alert_channel || settings.antiraid_log_channel || settings.log_channel;
        if (alertChannelId) {
          const alertChannel = guild.channels.cache.get(alertChannelId);
          if (alertChannel) {
            const alertEmbed = new EmbedBuilder()
              .setColor('#FF0033')
              .setTitle('🚨 إحباط محاولة تخريب أمني (Anti-Nuke Action)')
              .setDescription('🛡️ تم رصد محاولة تخريب وتم إحباطها بواسطة نظام الحماية الذكي.')
              .addFields(
                { name: '👤 المشرف الفاعل', value: `<@${executor.id}> (\`${executor.tag ?? executor.id}\`)`, inline: true },
                { name: '⚠️ نوع المخالفة', value: `\`${actionLabel}\``, inline: true },
                { name: '📊 التكرار المسجل', value: `\`${count}/${limit}\` خلال 60 ثانية`, inline: true },
                { name: '⚖️ العقوبة المطبقة', value: `**${punishmentLabel}**`, inline: false }
              )
              .setThumbnail(execMember.displayAvatarURL?.({ dynamic: true }) || null)
              .setFooter({ text: 'نظام الحماية المتقدم • Anti-Nuke Shield' })
              .setTimestamp();
            await alertChannel.send({ embeds: [alertEmbed] }).catch(() => {});
          }
        }

        // 4. إشعار الأونر على الخاص
        const owner = await guild.fetchOwner().catch(() => null);
        if (owner) {
          owner.send(`🚨 **تحذير أمني عاجل في سيرفرك: ${guild.name}**\nقام <@${executor.id}> (\`${executor.tag ?? executor.id}\`) بـ **${actionLabel}** وتجاوز الحد المسموح.\n🛡️ **العقوبة المنفذة:** ${punishmentLabel}`).catch(() => {});
        }

        // تصفير سجل هذا المستخدم لهذا الإجراء في DB بعد العقوبة
        try { db.db.prepare('DELETE FROM nuke_action_tracking WHERE guild_id = ? AND user_id = ? AND action_type = ?').run(guild.id, executor.id, actionType); } catch {}
      }
    } catch (err) {
      logger.error('خطأ في معالجة Anti-Nuke:', err);
    }
  }
};

module.exports = antiNuke;
