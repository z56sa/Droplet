const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'remove-autoline-channel',
  description: 'ازالة روم خط تلقائي',
  aliases: ['ازالة-خط'],
  data: new SlashCommandBuilder()
    .setName('remove-autoline-channel')
    .setDescription('Remove an autoline channel')
    .addChannelOption(opt => opt.setName('channel').setDescription('The channel').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.remove-autoline-channel.no_perm'), flags: 64 });
    }
    const channel = interaction.options.getChannel('channel');
    const settings = db.getGuildSettings(interaction.guild.id);
    let channels = [];
    try { channels = JSON.parse(settings.autoline_channels || '[]'); } catch(e) {}
    channels = channels.filter(id => id !== channel.id);
    db.updateGuildSetting(interaction.guild.id, 'autoline_channels', JSON.stringify(channels));
    return interaction.reply({ content: t(interaction.guild.id, 'general.remove-autoline-channel.done') });
  }
};
