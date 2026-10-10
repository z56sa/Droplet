const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ms = require('ms');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'timeout',
  description: 'عزل / إسكات عضو مؤقتاً في السيرفر (Timeout)',
  aliases: ['عزل', 'تايم_اوت', 'تايماوت', 'to'],
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Temporarily isolate a member (Timeout)')

    .addUserOption(opt => opt.setName('target').setDescription('The member to isolate').setRequired(true))
    .addStringOption(opt => opt.setName('duration').setDescription('Isolation duration (e.g. 10m, 1h, 1d) — max 28 days').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Isolation reason').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild?.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return interaction.reply({ content: t(lang, 'moderation.timeout.no_perm'), flags: 64 });

    const targetUser = interaction.options.getUser('target');
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return interaction.reply({ content: t(lang, 'moderation.timeout.not_found'), flags: 64 });
    if (!member.moderatable) return interaction.reply({ content: t(lang, 'moderation.timeout.not_moderatable'), flags: 64 });

    if (member.id === interaction.user.id) return interaction.reply({ content: t(lang, 'moderation.timeout.self'), flags: 64 });
    if (member.id === interaction.guild.ownerId) return interaction.reply({ content: t(lang, 'moderation.timeout.owner'), flags: 64 });
    if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({ content: t(lang, 'moderation.timeout.higher'), flags: 64 });
    }

    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || t(lang, 'moderation.timeout.default_reason');
    const durationMs = ms(durationStr);
    if (!durationMs || durationMs < 5000 || durationMs > 28 * 24 * 60 * 60 * 1000)
      return interaction.reply({ content: t(lang, 'moderation.timeout.bad_duration'), flags: 64 });

    await interaction.deferReply().catch(() => {});

    const dmEmbed = new EmbedBuilder()
      .setColor('#f39c12')
      .setTitle(t(lang, 'moderation.timeout.dm_title', { guild: interaction.guild.name }))
      .addFields(
        { name: t(lang, 'moderation.timeout.field_reason'), value: reason },
        { name: t(lang, 'moderation.timeout.field_duration'), value: durationStr },
        { name: t(lang, 'moderation.timeout.field_by'), value: interaction.user.tag }
      ).setTimestamp();
    await member.send({ embeds: [dmEmbed] }).catch(() => {});

    try {
      await member.timeout(durationMs, t(lang, 'moderation.timeout.audit_by', { reason, tag: interaction.user.tag }));
    } catch {
      return interaction.editReply({ content: t(lang, 'moderation.timeout.higher') }).catch(() => {});
    }

    if (db.recordStaffAction) {
      db.recordStaffAction(interaction.guild.id, interaction.user.id, 'timeout', targetUser.id, reason, durationStr);
    }

    const embed = new EmbedBuilder()
      .setColor('#f39c12')
      .setTitle(t(lang, 'moderation.timeout.title'))
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: t(lang, 'moderation.timeout.field_member'), value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
        { name: t(lang, 'moderation.timeout.field_duration'), value: durationStr, inline: true },
        { name: t(lang, 'moderation.timeout.field_mod'), value: interaction.user.tag, inline: true },
        { name: t(lang, 'moderation.timeout.field_reason'), value: reason }
      ).setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    this.sendToLog(interaction.guild, embed);
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild?.id);
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply(t(lang, 'moderation.timeout.prefix_no_perm'));
    const targetUser = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!targetUser) return message.reply(t(lang, 'moderation.timeout.prefix_usage'));
    const durationStr = args[1];
    if (!durationStr) return message.reply(t(lang, 'moderation.timeout.prefix_no_duration'));
    const durationMs = ms(durationStr);
    if (!durationMs || durationMs < 5000 || durationMs > 28 * 24 * 60 * 60 * 1000)
      return message.reply(t(lang, 'moderation.timeout.prefix_bad_duration'));
    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member || !member.moderatable) return message.reply(t(lang, 'moderation.timeout.prefix_not_moderatable'));
    if (member.id === message.author.id) return message.reply(t(lang, 'moderation.timeout.self'));
    if (member.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
      return message.reply(t(lang, 'moderation.timeout.higher'));
    }

    const reason = args.slice(2).join(' ') || t(lang, 'moderation.timeout.default_reason');
    try {
      await member.timeout(durationMs, t(lang, 'moderation.timeout.audit_by', { reason, tag: message.author.tag }));
    } catch {
      return message.reply(t(lang, 'moderation.timeout.higher'));
    }

    if (db.recordStaffAction) {
      db.recordStaffAction(message.guild.id, message.author.id, 'timeout', targetUser.id, reason, durationStr);
    }

    const embed = new EmbedBuilder().setColor('#f39c12').setTitle(t(lang, 'moderation.timeout.title'))
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: t(lang, 'moderation.timeout.field_member'), value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
        { name: t(lang, 'moderation.timeout.field_duration'), value: durationStr, inline: true },
        { name: t(lang, 'moderation.timeout.field_mod'), value: message.author.tag, inline: true },
        { name: t(lang, 'moderation.timeout.field_reason'), value: reason }
      ).setTimestamp();
    await message.reply({ embeds: [embed] });
    this.sendToLog(message.guild, embed);
  },

  sendToLog(guild, embed) {
    const settings = db.getGuildSettings(guild.id);
    if (settings?.log_channel) {
      const ch = guild.channels.cache.get(settings.log_channel);
      if (ch) ch.send({ embeds: [embed] }).catch(() => {});
    }
  }
};
