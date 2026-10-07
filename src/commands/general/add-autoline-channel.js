const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'add-autoline-channel',
  description: 'اضافة روم خط تلقائي',
  aliases: ['اضافة-خط'],
  data: new SlashCommandBuilder()
    .setName('add-autoline-channel')
    .setDescription('Add an autoline channel')
    .addChannelOption(opt => opt.setName('channel').setDescription('The channel').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.add-autoline-channel.no_perm'), flags: 64 });
    }
    const channel = interaction.options.getChannel('channel');
    const settings = db.getGuildSettings(interaction.guild.id);
    let channels = [];
    try { channels = JSON.parse(settings.autoline_channels || '[]'); } catch(e) {}
    if (channels.includes(channel.id)) return interaction.reply({ content: t(interaction.guild.id, 'general.add-autoline-channel.already'), flags: 64 });
    channels.push(channel.id);
    db.updateGuildSetting(interaction.guild.id, 'autoline_channels', JSON.stringify(channels));
    return interaction.reply({ content: t(interaction.guild.id, 'general.add-autoline-channel.done') });
  }
};
