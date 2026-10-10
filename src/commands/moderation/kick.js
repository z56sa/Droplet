const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'kick',
  description: 'طرد عضو من السيرفر مع إشعار',
  aliases: ['طرد'],
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')

    .addUserOption(opt => opt.setName('target').setDescription('The member to kick').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Kick reason').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild?.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers))
      return interaction.reply({ content: t(lang, 'moderation.kick.no_perm'), flags: 64 });

    await interaction.deferReply({ flags: 64 }).catch(() => {});

    const targetUser = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') || t(lang, 'moderation.kick.default_reason');
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) return interaction.editReply({ content: t(lang, 'moderation.kick.not_found') });
    if (!member.kickable) return interaction.editReply({ content: t(lang, 'moderation.kick.not_kickable') });
    if (member.id === interaction.user.id) return interaction.editReply({ content: t(lang, 'moderation.kick.self') });

    // DM قبل الطرد
    const dmEmbed = new EmbedBuilder()
      .setColor(config.colors?.warning || '#f39c12')
      .setTitle(t(lang, 'moderation.kick.dm_title', { guild: interaction.guild.name }))
      .addFields(
        { name: t(lang, 'moderation.kick.field_reason'), value: reason, inline: false },
        { name: t(lang, 'moderation.kick.field_by'), value: interaction.user.tag, inline: true }
      )
      .setFooter({ text: t(lang, 'moderation.kick.dm_footer') })
      .setTimestamp();

    await member.send({ embeds: [dmEmbed] }).catch(() => {});
    try {
      await member.kick(t(lang, 'moderation.kick.audit_by', { reason, tag: interaction.user.tag }));
    } catch {
      return interaction.editReply({ content: t(lang, 'moderation.kick.not_kickable') }).catch(() => {});
    }

    if (db.recordStaffAction) {
      db.recordStaffAction(interaction.guild.id, interaction.user.id, 'kick', targetUser.id, reason);
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors?.warning || '#f39c12')
      .setTitle(t(lang, 'moderation.kick.title'))
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: t(lang, 'moderation.kick.field_member'), value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
        { name: t(lang, 'moderation.kick.field_mod'), value: interaction.user.tag, inline: true },
        { name: t(lang, 'moderation.kick.field_reason'), value: reason, inline: false }
      )
      .setTimestamp();

    await interaction.deleteReply().catch(() => {});
    await interaction.channel.send({ embeds: [embed] }).catch(async () => {
      await interaction.editReply({ embeds: [embed] }).catch(() => {});
    });
    this.sendToLog(interaction.guild, embed);
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild?.id);
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers))
      return message.reply(t(lang, 'moderation.kick.no_perm'));

    const targetUser = message.mentions.users.first() ||
      (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!targetUser) return message.reply(t(lang, 'moderation.kick.prefix_target'));

    const reason = args.slice(1).join(' ') || t(lang, 'moderation.kick.default_reason');
    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member || !member.kickable) return message.reply(t(lang, 'moderation.kick.not_kickable'));

    await member.send(t(lang, 'moderation.kick.prefix_dm', { guild: message.guild.name, reason })).catch(() => {});
    try {
      await member.kick(t(lang, 'moderation.kick.audit_by', { reason, tag: message.author.tag }));
    } catch {
      return message.reply(t(lang, 'moderation.kick.not_kickable'));
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors?.warning || '#f39c12')
      .setTitle(t(lang, 'moderation.kick.title'))
      .addFields(
        { name: t(lang, 'moderation.kick.field_member'), value: targetUser.tag, inline: true },
        { name: t(lang, 'moderation.kick.field_by'), value: message.author.tag, inline: true },
        { name: t(lang, 'moderation.kick.field_reason'), value: reason, inline: false }
      )
      .setTimestamp();

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
