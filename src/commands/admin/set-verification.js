const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'set-verification',
  description: 'إعداد ونشر نظام وبانر التحقق التفاعلي من الأعضاء (Verification System)',
  aliases: ['تحقق', 'توثيق', 'verification', 'verify-setup'],
  data: new SlashCommandBuilder()
    .setName('set-verification')
    .setDescription('Set up the interactive verification system')

    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('The verification channel for the banner')

        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addRoleOption(opt =>
      opt.setName('role')
        .setDescription('The role granted automatically after verification')

        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('The required verification type')

        .addChoices(
          { name: '🔘 Instant one-click button', value: 'button' },
          { name: '🔢 Math captcha against bots', value: 'captcha' },
          { name: '🔤 Random text code', value: 'code' }
        )
        .setRequired(false)
    )
    .addRoleOption(opt =>
      opt.setName('unverified_role')
        .setDescription('Unverified role to hide channels (removed after verification, optional)')

        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('Welcome message inside the verification banner')

        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'admin.setverification.admin_only'), flags: 64 });
    }

    const channel = interaction.options.getChannel('channel');
    const verifiedRole = interaction.options.getRole('role');
    const unverifiedRole = interaction.options.getRole('unverified_role');
    const type = interaction.options.getString('type') || 'button';
    const customMessage = interaction.options.getString('message') || t(lang, 'admin.setverification.default_message');

    // حفظ الإعدادات في قاعدة البيانات
    db.updateGuildSetting(interaction.guild.id, 'verification_enabled', 1);
    db.updateGuildSetting(interaction.guild.id, 'verification_channel', channel.id);
    db.updateGuildSetting(interaction.guild.id, 'verification_role', verifiedRole.id);
    if (unverifiedRole) {
      db.updateGuildSetting(interaction.guild.id, 'unverified_role', unverifiedRole.id);
    }
    db.updateGuildSetting(interaction.guild.id, 'verification_type', type);
    db.updateGuildSetting(interaction.guild.id, 'verification_message', customMessage);

    // بناء بانر التحقق الفخم
    const embed = new EmbedBuilder()
      .setColor('#2ed573')
      .setTitle(t(lang, 'admin.setverification.embed_title', { guild: interaction.guild.name }))
      .setDescription(customMessage)
      .addFields(
        { name: t(lang, 'admin.setverification.field_role'), value: `<@&${verifiedRole.id}>`, inline: true },
        { name: t(lang, 'admin.setverification.field_type'), value: type === 'captcha' ? t(lang, 'admin.setverification.type_captcha') : t(lang, 'admin.setverification.type_button'), inline: true }
      )
      .setImage('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=960&q=80')
      .setFooter({ text: t(lang, 'admin.setverification.footer') })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_start_verification')
        .setLabel(t(lang, 'admin.setverification.button_label'))
        .setStyle(ButtonStyle.Success)
    );

    try {
      await channel.send({ embeds: [embed], components: [row] });
      await interaction.reply({
        content: t(lang, 'admin.setverification.success', {
          channel: channel.id,
          role: verifiedRole.name,
          type: type === 'captcha' ? t(lang, 'admin.setverification.type_captcha_long') : t(lang, 'admin.setverification.type_button_long')
        }),
        flags: 64
      });
    } catch (err) {
      console.error('فشل إرسال رسالة التحقق:', err);
      await interaction.reply({
        content: t(lang, 'admin.setverification.send_error', { channel: channel.id }),
        flags: 64
      });
    }
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild.id);
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply(t(lang, 'admin.setverification.admin_only'));
    }

    const channel = message.mentions.channels.first() || message.channel;
    const role = message.mentions.roles.first();

    if (!role) {
      return message.reply(t(lang, 'admin.setverification.prefix_need_role'));
    }

    db.updateGuildSetting(message.guild.id, 'verification_enabled', 1);
    db.updateGuildSetting(message.guild.id, 'verification_channel', channel.id);
    db.updateGuildSetting(message.guild.id, 'verification_role', role.id);
    db.updateGuildSetting(message.guild.id, 'verification_type', 'button');

    const embed = new EmbedBuilder()
      .setColor('#2ed573')
      .setTitle(t(lang, 'admin.setverification.embed_title', { guild: message.guild.name }))
      .setDescription(t(lang, 'admin.setverification.prefix_default_desc'))
      .addFields(
        { name: t(lang, 'admin.setverification.field_role'), value: `<@&${role.id}>`, inline: true },
        { name: t(lang, 'admin.setverification.field_status'), value: t(lang, 'admin.setverification.status_active'), inline: true }
      )
      .setImage('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=960&q=80')
      .setFooter({ text: t(lang, 'admin.setverification.footer') })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_start_verification')
        .setLabel(t(lang, 'admin.setverification.button_label'))
        .setStyle(ButtonStyle.Success)
    );

    await channel.send({ embeds: [embed], components: [row] });
    await message.reply(t(lang, 'admin.setverification.prefix_success', { channel: channel.id, role: role.name }));
  }
};
