const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'set-ticket-log',
  description: 'تحديد روم سجلات التذاكر',
  aliases: ['لوق-تذاكر'],
  data: new SlashCommandBuilder()
    .setName('set-ticket-log')
    .setDescription('Set the ticket logs channel')

    .addChannelOption(opt => opt.setName('channel').setDescription('The channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'tickets.common.no_admin'), flags: 64 });
    }
    const ch = interaction.options.getChannel('channel');
    db.updateGuildSetting(interaction.guild.id, 'ticket_log_channel', ch.id);
    return interaction.reply({ content: t(lang, 'tickets.setticketlog.success') });
  }
};
