const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'hide',
  description: 'إخفاء الروم الحالي عن الأعضاء العاديين',
  aliases: ['اخفاء', 'هايد'],
  data: new SlashCommandBuilder()
    .setName('hide')
    .setDescription('Hide the current channel from members')

    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild?.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: t(lang, 'moderation.hide.no_perm'), flags: 64 });
    }

    await interaction.deferReply().catch(() => { });

    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      ViewChannel: false
    });

    await interaction.editReply(t(lang, 'moderation.hide.done'));
  },

  async executePrefix(message) {
    const lang = getGuildLang(message.guild?.id);
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply(t(lang, 'moderation.hide.no_perm'));
    }

    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
      ViewChannel: false
    });

    await message.channel.send(t(lang, 'moderation.hide.done'));
  }
};
