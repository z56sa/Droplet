const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'unhide',
  description: 'إظهار الروم الحالي وإلغاء إخفائه عن الأعضاء',
  aliases: ['انهايد', 'الغاء-الاخفاء', 'show', 'اظهار', 'شو'],
  data: new SlashCommandBuilder()
    .setName('unhide')
    .setDescription('Unhide the current channel for members')

    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild?.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: t(lang, 'moderation.unhide.no_perm'), flags: 64 });
    }

    const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: t(lang, 'moderation.unhide.bot_no_perm'), flags: 64 });
    }

    await interaction.deferReply().catch(() => { });

    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        ViewChannel: null
      });
      await interaction.editReply(t(lang, 'moderation.unhide.done'));
    } catch (err) {
      await interaction.editReply({ content: t(lang, 'moderation.unhide.fail') }).catch(() => {});
    }
  },

  async executePrefix(message) {
    const lang = getGuildLang(message.guild?.id);
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply(t(lang, 'moderation.unhide.no_perm'));
    }

    const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply(t(lang, 'moderation.unhide.bot_no_perm'));
    }

    try {
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
        ViewChannel: null
      });
      await message.channel.send(t(lang, 'moderation.unhide.done'));
    } catch (err) {
      await message.reply(t(lang, 'moderation.unhide.fail'));
    }
  }
};
