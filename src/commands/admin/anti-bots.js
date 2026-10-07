const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'anti-bots',
  description: 'تسطيب نظام الحماية من البوتات',
  aliases: ['انتي-بوت'],
  data: new SlashCommandBuilder()
    .setName('anti-bots')
    .setDescription('Set up bot protection')

    .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable or disable').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'admin.common.no_admin'), flags: 64 });
    }
    const enabled = interaction.options.getBoolean('enabled');
    db.updateGuildSetting(interaction.guild.id, 'anti_bot', enabled ? 1 : 0);
    return interaction.reply({ content: enabled ? t(lang, 'admin.antibots.enabled') : t(lang, 'admin.antibots.disabled') });
  }
};
