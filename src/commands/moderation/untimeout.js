const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'untimeout',
  description: 'فك العزل / رفع الإسكات عن عضو في السيرفر (Untimeout)',
  aliases: ['فك_عزل', 'فك_التايم_اوت', 'un-timeout', 'unto'],
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Lift isolation from a member')

    .addUserOption(opt => opt.setName('target').setDescription('The member to unisolate').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Unisolation reason').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild?.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return interaction.reply({ content: t(lang, 'moderation.untimeout.no_perm'), flags: 64 });

    const targetUser = interaction.options.getUser('target');
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return interaction.reply({ content: t(lang, 'moderation.untimeout.not_found'), flags: 64 });
    if (!member.isCommunicationDisabled()) return interaction.reply({ content: t(lang, 'moderation.untimeout.not_isolated'), flags: 64 });

    const reason = interaction.options.getString('reason') || t(lang, 'moderation.untimeout.default_reason');
    await interaction.deferReply().catch(() => {});

    await member.timeout(null, t(lang, 'moderation.untimeout.audit_by', { reason, tag: interaction.user.tag }));

    if (db.recordStaffAction) {
      db.recordStaffAction(interaction.guild.id, interaction.user.id, 'untimeout', targetUser.id, reason, null);
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors?.success || '#2ecc71')
      .setTitle(t(lang, 'moderation.untimeout.title'))
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: t(lang, 'moderation.untimeout.field_member'), value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
        { name: t(lang, 'moderation.untimeout.field_mod'), value: interaction.user.tag, inline: true },
        { name: t(lang, 'moderation.untimeout.field_reason'), value: reason }
      ).setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    this.sendToLog(interaction.guild, embed);
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild?.id);
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply(t(lang, 'moderation.untimeout.prefix_no_perm'));
    const targetUser = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!targetUser) return message.reply(t(lang, 'moderation.untimeout.prefix_usage'));
    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply(t(lang, 'moderation.untimeout.not_found'));
    if (!member.isCommunicationDisabled()) return message.reply(t(lang, 'moderation.untimeout.not_isolated'));

    const reason = args.slice(1).join(' ') || t(lang, 'moderation.untimeout.default_reason');
    await member.timeout(null, t(lang, 'moderation.untimeout.audit_by', { reason, tag: message.author.tag }));

    if (db.recordStaffAction) {
      db.recordStaffAction(message.guild.id, message.author.id, 'untimeout', targetUser.id, reason, null);
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors?.success || '#2ecc71')
      .setTitle(t(lang, 'moderation.untimeout.title'))
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: t(lang, 'moderation.untimeout.field_member'), value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
        { name: t(lang, 'moderation.untimeout.field_mod'), value: message.author.tag, inline: true },
        { name: t(lang, 'moderation.untimeout.field_reason'), value: reason }
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
