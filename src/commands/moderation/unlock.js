const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'unlock',
  description: 'فتح الروم الحالي للسماح للأعضاء بالكتابة',
  aliases: ['فتح'],
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock the current channel')

    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild?.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: t(lang, 'moderation.unlock.no_perm'), flags: 64 });
    }

    const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: t(lang, 'moderation.unlock.bot_no_perm'), flags: 64 });
    }

    await interaction.deferReply().catch(() => { });

    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: null
      });
      await interaction.editReply({ content: t(lang, 'moderation.unlock.done') });
    } catch (err) {
      await interaction.editReply({ content: t(lang, 'moderation.unlock.fail') }).catch(() => {});
    }
  },

  async executePrefix(message) {
    const lang = getGuildLang(message.guild?.id);
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply(t(lang, 'moderation.unlock.no_perm'));
    }

    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
      SendMessages: null
    });

    await message.channel.send(t(lang, 'moderation.unlock.done'));
  }
};
