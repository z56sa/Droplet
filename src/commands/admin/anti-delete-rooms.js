const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'anti-delete-rooms',
  description: 'تسطيب نظام الحماية من حذف الرومات',
  aliases: ['انتي-حذف-رومات'],
  data: new SlashCommandBuilder()
    .setName('anti-delete-rooms')
    .setDescription('Set up channel-delete protection')

    .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable or disable').setRequired(true))
    .addIntegerOption(opt => opt.setName('limit').setDescription('Maximum per minute').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'admin.common.no_admin'), flags: 64 });
    }
    const enabled = interaction.options.getBoolean('enabled');
    const limit = interaction.options.getInteger('limit') || 3;
    db.updateGuildSetting(interaction.guild.id, 'antinuke_enabled', enabled ? 1 : 0);
    db.updateGuildSetting(interaction.guild.id, 'antinuke_channel_limit', limit);
    return interaction.reply({ content: enabled ? t(lang, 'admin.antideleterooms.enabled') : t(lang, 'admin.antideleterooms.disabled') });
  }
};
