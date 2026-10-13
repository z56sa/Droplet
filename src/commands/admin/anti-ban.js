const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'anti-ban',
  description: 'تسطيب نظام الحماية من الباند',
  aliases: ['انتي-باند'],
  data: new SlashCommandBuilder()
    .setName('anti-ban')
    .setDescription('Set up ban protection')

    .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable or disable').setRequired(true))
    .addIntegerOption(opt => opt.setName('limit').setDescription('Maximum limit').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'admin.common.no_admin'), flags: 64 });
    }
    const enabled = interaction.options.getBoolean('enabled');
    const limit = interaction.options.getInteger('limit') || 3;
    db.updateGuildSetting(interaction.guild.id, 'anti_mass_ban', enabled ? 1 : 0);
    if (enabled) {
      db.updateGuildSetting(interaction.guild.id, 'antinuke_enabled', 1);
      db.updateGuildSetting(interaction.guild.id, 'anti_nuke_enabled', 1);
    }
    db.updateGuildSetting(interaction.guild.id, 'antinuke_ban_limit', limit);
    return interaction.reply({ content: enabled ? t(lang, 'admin.antiban.enabled') : t(lang, 'admin.antiban.disabled') });
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild.id);
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply(t(lang, 'admin.common.no_admin'));
    }
    const first = (args[0] || '').toLowerCase();
    const enabled = first === 'on' || first === 'enable' || first === 'تفعيل' || first === '1';
    const limit = parseInt(args[1]) || 3;
    db.updateGuildSetting(message.guild.id, 'anti_mass_ban', enabled ? 1 : 0);
    if (enabled) {
      db.updateGuildSetting(message.guild.id, 'antinuke_enabled', 1);
      db.updateGuildSetting(message.guild.id, 'anti_nuke_enabled', 1);
    }
    db.updateGuildSetting(message.guild.id, 'antinuke_ban_limit', limit);
    return message.reply(enabled ? t(lang, 'admin.antiban.enabled') : t(lang, 'admin.antiban.disabled'));
  }
};
