const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'user',
  description: 'عرض معلومات ومعرف العضو في السيرفر',
  aliases: ['userinfo', 'معلومات', 'عضو'],
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('عرض معلومات العضو')
    .addUserOption(opt =>
      opt.setName('target')
        .setDescription('العضو المراد عرض معلوماته (اختياري)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply().catch(() => { });

    const targetUser = interaction.options.getUser('target') || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) {
      return interaction.editReply({ content: t(interaction.guild.id, 'general.user.not_found') });
    }

    const roles = member.roles.cache
      .filter(r => r.id !== interaction.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => r)
      .join(', ') || t(interaction.guild.id, 'general.user.no_roles');

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary || '#5865F2')
      .setTitle(t(interaction.guild.id, 'general.user.title', { tag: targetUser.tag }))
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 1024 }))
      .addFields(
        { name: t(interaction.guild.id, 'general.user.field_id'), value: `\`${targetUser.id}\``, inline: true },
        { name: t(interaction.guild.id, 'general.user.field_bot'), value: targetUser.bot ? t(interaction.guild.id, 'general.user.yes') : t(interaction.guild.id, 'general.user.no'), inline: true },
        { name: t(interaction.guild.id, 'general.user.field_created'), value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true },
        { name: t(interaction.guild.id, 'general.user.field_joined'), value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : t(interaction.guild.id, 'general.server.unknown'), inline: true },
        { name: t(interaction.guild.id, 'general.user.field_roles'), value: roles.length > 1024 ? t(interaction.guild.id, 'general.user.too_many_roles') : roles, inline: false }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },

  async executePrefix(message, args) {
    const targetUser = message.mentions.users.first() ||
      (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null) ||
      message.author;

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply(t(message.guild.id, 'general.user.not_found_short'));

    const roles = member.roles.cache
      .filter(r => r.id !== message.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => r)
      .join(', ') || t(message.guild.id, 'general.user.no_roles');

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary || '#5865F2')
      .setTitle(t(message.guild.id, 'general.user.title', { tag: targetUser.tag }))
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 1024 }))
      .addFields(
        { name: t(message.guild.id, 'general.user.field_id'), value: `\`${targetUser.id}\``, inline: true },
        { name: t(message.guild.id, 'general.user.field_bot'), value: targetUser.bot ? t(message.guild.id, 'general.user.yes') : t(message.guild.id, 'general.user.no'), inline: true },
        { name: t(message.guild.id, 'general.user.field_created'), value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true },
        { name: t(message.guild.id, 'general.user.field_joined'), value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : t(message.guild.id, 'general.server.unknown'), inline: true },
        { name: t(message.guild.id, 'general.user.field_roles'), value: roles.length > 1024 ? t(message.guild.id, 'general.user.too_many_roles') : roles, inline: false }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
};