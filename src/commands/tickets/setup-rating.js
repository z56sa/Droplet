const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'setup-rating',
  description: 'تفعيل نظام التقييم في التذاكر',
  aliases: ['تقييم-تذاكر'],
  data: new SlashCommandBuilder()
    .setName('setup-rating')
    .setDescription('Enable the ticket rating system')

    .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable or disable').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'tickets.common.no_admin'), flags: 64 });
    }
    const enabled = interaction.options.getBoolean('enabled');
    db.updateGuildSetting(interaction.guild.id, 'ticket_rating_enabled', enabled ? 1 : 0);
    return interaction.reply({ content: enabled ? t(lang, 'tickets.setuprating.enabled') : t(lang, 'tickets.setuprating.disabled') });
  }
};
