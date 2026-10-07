const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'lock',
  description: 'قفل الروم الحالي لمنع الأعضاء من الكتابة',
  aliases: ['قفل'],
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock the current channel')

    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild?.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: t(lang, 'moderation.lock.no_perm'), flags: 64 });
    }

    const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: t(lang, 'moderation.lock.bot_no_perm'), flags: 64 });
    }

    await interaction.deferReply().catch(() => { });

    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false
      });
      await interaction.editReply({ content: t(lang, 'moderation.lock.done') });
    } catch (err) {
      await interaction.editReply({ content: t(lang, 'moderation.lock.fail') }).catch(() => {});
    }
  },

  async executePrefix(message) {
    const lang = getGuildLang(message.guild?.id);
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply(t(lang, 'moderation.lock.no_perm'));
    }

    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
      SendMessages: false
    });

    await message.channel.send(t(lang, 'moderation.lock.done'));
  }
};
