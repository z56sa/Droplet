const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');
const { isEnabled } = require('../../utils/isEnabled');

module.exports = {
  name: 'protection-status',
  description: 'عرض الحالة الشاملة والتفصيلية لجميع أنظمة الحماية في السيرفر',
  aliases: ['حالة-الحماية', 'حماية', 'درع'],
  category: 'admin',
  data: new SlashCommandBuilder()
    .setName('protection-status')
    .setDescription('Show the comprehensive status of all server protection modules')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'admin.common.no_admin'), flags: 64 });
    }

    const embed = buildStatusEmbed(interaction.guild, lang);
    return interaction.reply({ embeds: [embed] });
  },

  async executePrefix(message) {
    const lang = getGuildLang(message.guild.id);
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply(t(lang, 'admin.common.no_admin'));
    }

    const embed = buildStatusEmbed(message.guild, lang);
    return message.reply({ embeds: [embed] });
  }
};

function buildStatusEmbed(guild, lang) {
  const s = db.getGuildSettings(guild.id) || {};
  const isAr = lang !== 'en';

  const on = '🟢 ' + (isAr ? 'مفعل' : 'Enabled');
  const off = '🔴 ' + (isAr ? 'معطل' : 'Disabled');

  const masterNuke = isEnabled(s.anti_nuke_enabled, isEnabled(s.antinuke_enabled, false));

  const checkFeature = (key, fallbackToMaster = true) => {
    if (s[key] !== undefined && s[key] !== null && s[key] !== '') {
      return isEnabled(s[key], false) ? on : off;
    }
    return (fallbackToMaster && masterNuke) ? on : off;
  };

  const antiBan = checkFeature('anti_mass_ban');
  const antiKick = checkFeature('anti_mass_kick');
  const antiChanDel = checkFeature('anti_channel_delete');
  const antiChanCre = checkFeature('anti_channel_create');
  const antiRoleDel = checkFeature('anti_role_delete');
  const antiRoleCre = checkFeature('anti_role_create');
  const antiWebhooks = checkFeature('anti_webhook_create');
  const antiServer = checkFeature('anti_server_name_change');

  const antiBot = isEnabled(s.anti_bot, isEnabled(s.anti_bot_add, false)) ? on : off;
  const antiRaid = isEnabled(s.antiraid_enabled, isEnabled(s.anti_raid, isEnabled(s.anti_raid_fast, false))) ? on : off;
  const antiAlt = s.anti_alt_days && s.anti_alt_days > 0 ? `🟢 ${s.anti_alt_days} ${isAr ? 'أيام' : 'days'}` : off;

  const antiLink = isEnabled(s.anti_link, isEnabled(s.anti_links, false)) ? on : off;
  const antiInvites = isEnabled(s.anti_invites, isEnabled(s.anti_invite_links, false)) ? on : off;
  const antiSpam = isEnabled(s.anti_spam, false) ? on : off;
  const antiScam = isEnabled(s.anti_scam, false) ? on : off;
  const antiBadwords = isEnabled(s.bad_words_enabled, false) ? on : off;
  const antiMentions = isEnabled(s.anti_mass_mention, false) ? on : off;

  // العقوبة
  let punishmentText = isAr ? 'سحب الرتب الإدارية' : 'Strip Dangerous Roles';
  const p = s.antinuke_punishment || 'strip_roles';
  if (p === 'ban') punishmentText = isAr ? 'حظر فوري نهائي (Ban)' : 'Instant Ban';
  else if (p === 'kick') punishmentText = isAr ? 'طرد فوري (Kick)' : 'Instant Kick';
  else if (p === 'timeout') punishmentText = isAr ? 'عزل وتسكيت 24 ساعة (Timeout)' : '24h Timeout';
  else if (p === 'jail') punishmentText = isAr ? 'سجن العضو (Jail)' : 'Jail Quarantine';

  // القائمة البيضاء
  const wlRows = db.getProtectionWhitelist ? (db.getProtectionWhitelist(guild.id, 'whitelist') || []) : [];
  const wlRole = s.antinuke_whitelist_role ? `<@&${s.antinuke_whitelist_role}>` : (isAr ? 'غير محددة' : 'Not set');

  // قناة التنبيهات
  const alertCh = s.antinuke_alert_channel || s.antiraid_log_channel || s.log_channel;
  const alertChText = alertCh ? `<#${alertCh}>` : (isAr ? 'غير محددة' : 'Not set');

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(isAr ? '🛡️ لوحة معلومات نظام الحماية والأمان' : '🛡️ Security Protection Shield Overview')
    .setDescription(
      isAr
        ? `الحالة العامة لدرع الحماية (Master Anti-Nuke): **${masterNuke ? '🟢 نشط ومفعل' : '🔴 متوقف'}**\nيعمل النظام برصد فوري ومنع أي محاولات تخريب أو اختراق للسيرفر.`
        : `Master Anti-Nuke Shield: **${masterNuke ? '🟢 Active & Guarding' : '🔴 Inactive'}**\nContinuous real-time threat detection and mitigation.`
    )
    .addFields(
      {
        name: isAr ? '💥 مكافحة التخريب الشامل (Anti-Nuke)' : '💥 Anti-Nuke Defense',
        value: [
          `• ${isAr ? 'الحظر الجماعي' : 'Mass Ban'}: ${antiBan} \`(${s.antinuke_ban_limit || 3}/min)\``,
          `• ${isAr ? 'الطرد الجماعي' : 'Mass Kick'}: ${antiKick} \`(${s.antinuke_kick_limit || 3}/min)\``,
          `• ${isAr ? 'حذف الرومات' : 'Channel Delete'}: ${antiChanDel} \`(${s.antinuke_channel_limit || 3}/min)\``,
          `• ${isAr ? 'إنشاء الرومات' : 'Channel Create'}: ${antiChanCre}`,
          `• ${isAr ? 'حذف الرتب' : 'Role Delete'}: ${antiRoleDel} \`(${s.antinuke_role_limit || 3}/min)\``,
          `• ${isAr ? 'إنشاء الرتب' : 'Role Create'}: ${antiRoleCre}`,
          `• ${isAr ? 'التلاعب بالويب هوك' : 'Webhooks'}: ${antiWebhooks}`,
          `• ${isAr ? 'تعديل السيرفر' : 'Server Edit'}: ${antiServer}`
        ].join('\n'),
        inline: false
      },
      {
        name: isAr ? '🤖 حماية الانضمام والدخول (Raid & Bots)' : '🤖 Join & Raid Protection',
        value: [
          `• ${isAr ? 'منع البوتات غير المصرحة' : 'Anti-Bot'}: ${antiBot}`,
          `• ${isAr ? 'كشف الهجمات السريعة (Anti-Raid)' : 'Anti-Raid'}: ${antiRaid} \`(${s.raid_threshold || 5}/10s)\``,
          `• ${isAr ? 'كشف الحسابات الوهمية (Anti-Alt)' : 'Anti-Alt'}: ${antiAlt}`
        ].join('\n'),
        inline: false
      },
      {
        name: isAr ? '💬 الرقابة التلقائية للدردشة (Chat Auto-Mod)' : '💬 Chat Auto-Mod',
        value: [
          `• ${isAr ? 'منع الروابط' : 'Anti-Link'}: ${antiLink}`,
          `• ${isAr ? 'منع دعوات الديسكورد' : 'Anti-Invites'}: ${antiInvites}`,
          `• ${isAr ? 'منع السبام والتكرار' : 'Anti-Spam'}: ${antiSpam}`,
          `• ${isAr ? 'مكافحة روابط الاحتيال (Scam)' : 'Anti-Scam'}: ${antiScam}`,
          `• ${isAr ? 'فلتر الكلمات المحظورة' : 'Bad Words'}: ${antiBadwords}`,
          `• ${isAr ? 'منع المنشن المكثف' : 'Mass Mentions'}: ${antiMentions}`
        ].join('\n'),
        inline: false
      },
      {
        name: isAr ? '⚙️ تفاصيل التكوين والقائمة البيضاء' : '⚙️ Configuration & Whitelist',
        value: [
          `• ${isAr ? 'العقوبة عند المخالفة' : 'Punishment'}: **${punishmentText}**`,
          `• ${isAr ? 'رتبة الاستثناء' : 'Whitelist Role'}: ${wlRole}`,
          `• ${isAr ? 'الأعضاء المستثنون' : 'Whitelisted Members'}: **${wlRows.length}** ${isAr ? 'أعضاء' : 'members'}`,
          `• ${isAr ? 'قناة التنبيهات وسجلات الطوارئ' : 'Alert Channel'}: ${alertChText}`
        ].join('\n'),
        inline: false
      }
    )
    .setFooter({ text: 'Droplet Security Shield • نظام حماية متطور' })
    .setTimestamp();

  return embed;
}
