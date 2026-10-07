const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'set-feedback-room',
  description: 'تحديد روم يتم فيه تحويل الرسائل لأراء',
  aliases: ['تحديد-روم-الاراء'],
  data: new SlashCommandBuilder()
    .setName('set-feedback-room')
    .setDescription('Set the feedback room')
    .addChannelOption(opt => opt.setName('channel').setDescription('The channel').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.set-feedback-room.no_perm'), flags: 64 });
    }
    const channel = interaction.options.getChannel('channel');
    db.updateGuildSetting(interaction.guild.id, 'feedback_channel', channel.id);
    return interaction.reply({ content: t(interaction.guild.id, 'general.set-feedback-room.done') });
  }
};
