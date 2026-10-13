const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');
const { isEnabled } = require('../../utils/isEnabled');

module.exports = {
  name: 'anti-nuke',
  description: 'التحكم الشامل في نظام الحماية من التخريب (Anti-Nuke Master Control)',
  aliases: ['انتي-نوك', 'مكافحة-التخريب', 'antinuke'],
  category: 'admin',
  data: new SlashCommandBuilder()
    .setName('anti-nuke')
    .setDescription('Configure and control the master Anti-Nuke security system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('toggle')
        .setDescription('Enable or disable master Anti-Nuke protection')
        .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable (true) or disable (false)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('punishment')
        .setDescription('Set the automatic penalty for malicious actions')
        .addStringOption(opt =>
          opt.setName('action')
            .setDescription('Penalty type')
            .setRequired(true)
            .addChoices(
              { name: 'Strip Dangerous Roles (سحب الرتب فقط)', value: 'strip_roles' },
              { name: 'Instant Ban (حظر نهائي)', value: 'ban' },
              { name: 'Instant Kick (طرد فوري)', value: 'kick' },
              { name: '24h Timeout (عزل وتسكيت 24 ساعة)', value: 'timeout' },
              { name: 'Jail (سجن المشرف المخالف)', value: 'jail' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('limits')
        .setDescription('Set action limits allowed per minute before punishment')
        .addIntegerOption(opt => opt.setName('bans').setDescription('Max bans allowed per minute').setMinValue(1).setMaxValue(20).setRequired(false))
        .addIntegerOption(opt => opt.setName('kicks').setDescription('Max kicks allowed per minute').setMinValue(1).setMaxValue(20).setRequired(false))
        .addIntegerOption(opt => opt.setName('channels').setDescription('Max channel deletes/creates per minute').setMinValue(1).setMaxValue(20).setRequired(false))
        .addIntegerOption(opt => opt.setName('roles').setDescription('Max role deletes/creates per minute').setMinValue(1).setMaxValue(20).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('View current Anti-Nuke configuration and limits')
    ),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({ content: t(lang, 'admin.common.no_admin'), flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled');
      db.updateGuildSetting(guildId, 'antinuke_enabled', enabled ? 1 : 0);
      db.updateGuildSetting(guildId, 'anti_nuke_enabled', enabled ? 1 : 0);

      return interaction.reply({
        content: enabled
          ? '🛡️ **تم تفعيل درع الحماية من التخريب (Anti-Nuke) بنجاح.** السيرفر محمي الآن من أي محاولات تخريب أو تصفية.'
          : '⚠️ **تم تعطيل درع الحماية من التخريب (Anti-Nuke).**'
      });
    }

    if (sub === 'punishment') {
      const action = interaction.options.getString('action');
      db.updateGuildSetting(guildId, 'antinuke_punishment', action);

      const labels = {
        strip_roles: 'سحب كافة الرتب الإدارية الحساسة',
        ban: 'حظر نهائي فوري (Ban)',
        kick: 'طرد فوري من السيرفر (Kick)',
        timeout: 'عزل وتسكيت لمدة 24 ساعة (Timeout)',
        jail: 'سجن العضو وعزله في روم السجن (Jail)'
      };

      return interaction.reply({
        content: `⚖️ **تم ضبط عقوبة Anti-Nuke التلقائية إلى:** \`${labels[action] || action}\`.`
      });
    }

    if (sub === 'limits') {
      const bans = interaction.options.getInteger('bans');
      const kicks = interaction.options.getInteger('kicks');
      const channels = interaction.options.getInteger('channels');
      const roles = interaction.options.getInteger('roles');

      if (bans) db.updateGuildSetting(guildId, 'antinuke_ban_limit', bans);
      if (kicks) db.updateGuildSetting(guildId, 'antinuke_kick_limit', kicks);
      if (channels) db.updateGuildSetting(guildId, 'antinuke_channel_limit', channels);
      if (roles) db.updateGuildSetting(guildId, 'antinuke_role_limit', roles);

      const updated = db.getGuildSettings(guildId) || {};
      return interaction.reply({
        content: `⚙️ **تم تحديث حدود الإجراءات الإدارية المسموحة خلال دقيقة:**\n• الحظر: \`${updated.antinuke_ban_limit || 3}\`\n• الطرد: \`${updated.antinuke_kick_limit || 3}\`\n• القنوات: \`${updated.antinuke_channel_limit || 3}\`\n• الرتب: \`${updated.antinuke_role_limit || 3}\``
      });
    }

    if (sub === 'status') {
      const s = db.getGuildSettings(guildId) || {};
      const active = isEnabled(s.anti_nuke_enabled, isEnabled(s.antinuke_enabled, false));

      const labels = {
        strip_roles: 'سحب كافة الرتب الإدارية الحساسة',
        ban: 'حظر نهائي فوري (Ban)',
        kick: 'طرد فوري من السيرفر (Kick)',
        timeout: 'عزل وتسكيت لمدة 24 ساعة (Timeout)',
        jail: 'سجن العضو وعزله في روم السجن (Jail)'
      };

      const embed = new EmbedBuilder()
        .setColor(active ? '#2ECC71' : '#E74C3C')
        .setTitle('🛡️ إعدادات نظام مكافحة التخريب (Anti-Nuke Settings)')
        .addFields(
          { name: 'الحالة العامة', value: active ? '🟢 مفعل ونشط' : '🔴 معطل', inline: true },
          { name: 'العقوبة المحددة', value: `\`${labels[s.antinuke_punishment] || s.antinuke_punishment || 'سحب الرتب'}\``, inline: true },
          { name: 'قناة سجلات الطوارئ', value: s.antinuke_alert_channel ? `<#${s.antinuke_alert_channel}>` : 'غير محددة', inline: true },
          {
            name: 'الحدود القصوى للإجراءات في الدقيقة',
            value: `• الحظر الجماعي: \`${s.antinuke_ban_limit || 3}\`\n• الطرد الجماعي: \`${s.antinuke_kick_limit || 3}\`\n• حذف/إنشاء القنوات: \`${s.antinuke_channel_limit || 3}\`\n• حذف/إنشاء الرتب: \`${s.antinuke_role_limit || 3}\``,
            inline: false
          }
        )
        .setFooter({ text: 'Droplet Anti-Nuke Shield' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild.id);
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && message.guild.ownerId !== message.author.id) {
      return message.reply(t(lang, 'admin.common.no_admin'));
    }

    const sub = (args[0] || '').toLowerCase();
    const guildId = message.guild.id;

    if (sub === 'on' || sub === 'enable' || sub === 'تفعيل') {
      db.updateGuildSetting(guildId, 'antinuke_enabled', 1);
      db.updateGuildSetting(guildId, 'anti_nuke_enabled', 1);
      return message.reply('🛡️ **تم تفعيل درع الحماية من التخريب (Anti-Nuke) بنجاح.**');
    }

    if (sub === 'off' || sub === 'disable' || sub === 'تعطيل') {
      db.updateGuildSetting(guildId, 'antinuke_enabled', 0);
      db.updateGuildSetting(guildId, 'anti_nuke_enabled', 0);
      return message.reply('⚠️ **تم تعطيل درع الحماية من التخريب (Anti-Nuke).**');
    }

    if (sub === 'punish' || sub === 'punishment' || sub === 'عقوبة') {
      const choice = (args[1] || '').toLowerCase();
      const valid = ['strip_roles', 'ban', 'kick', 'timeout', 'jail'];
      if (!valid.includes(choice)) {
        return message.reply('❌ يرجى اختيار نوع عقوبة صحيح: `strip_roles`, `ban`, `kick`, `timeout`, `jail`\nمثال: `#anti-nuke punish ban`');
      }
      db.updateGuildSetting(guildId, 'antinuke_punishment', choice);
      return message.reply(`⚖️ تم تحديد العقوبة إلى: \`${choice}\`.`);
    }

    // Default status
    const s = db.getGuildSettings(guildId) || {};
    const active = isEnabled(s.anti_nuke_enabled, isEnabled(s.antinuke_enabled, false));
    return message.reply(
      `🛡️ **حالة Anti-Nuke:** ${active ? '🟢 مفعل' : '🔴 معطل'}\n` +
      `⚖️ **العقوبة:** \`${s.antinuke_punishment || 'strip_roles'}\`\n` +
      `📊 **الحدود:** حظر (${s.antinuke_ban_limit || 3}) | طرد (${s.antinuke_kick_limit || 3}) | قنوات (${s.antinuke_channel_limit || 3}) | رتب (${s.antinuke_role_limit || 3})\n` +
      `💡 الأوامر: \`#anti-nuke on\` | \`#anti-nuke off\` | \`#anti-nuke punish <action>\``
    );
  }
};
