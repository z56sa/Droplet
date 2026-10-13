const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'anti-delete-rooms',
  description: 'تسطيب نظام الحماية من حذف الرومات',
  aliases: ['انتي-حذف-رومات'],
  category: 'admin',

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'admin.common.no_admin'), flags: 64 });
    }
    const enabled = interaction.options.getBoolean('enabled');
    const limit = interaction.options.getInteger('limit') || 3;
    db.updateGuildSetting(interaction.guild.id, 'anti_channel_delete', enabled ? 1 : 0);
    if (enabled) {
      db.updateGuildSetting(interaction.guild.id, 'antinuke_enabled', 1);
      db.updateGuildSetting(interaction.guild.id, 'anti_nuke_enabled', 1);
    }
    db.updateGuildSetting(interaction.guild.id, 'antinuke_channel_limit', limit);
    return interaction.reply({ content: enabled ? t(lang, 'admin.antideleterooms.enabled') : t(lang, 'admin.antideleterooms.disabled') });
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild.id);
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply(t(lang, 'admin.common.no_admin'));
    }
    const first = (args[0] || '').toLowerCase();
    const enabled = first === 'on' || first === 'enable' || first === 'تفعيل' || first === '1';
    const limit = parseInt(args[1]) || 3;
    db.updateGuildSetting(message.guild.id, 'anti_channel_delete', enabled ? 1 : 0);
    if (enabled) {
      db.updateGuildSetting(message.guild.id, 'antinuke_enabled', 1);
      db.updateGuildSetting(message.guild.id, 'anti_nuke_enabled', 1);
    }
    db.updateGuildSetting(message.guild.id, 'antinuke_channel_limit', limit);
    return message.reply(enabled ? t(lang, 'admin.antideleterooms.enabled') : t(lang, 'admin.antideleterooms.disabled'));
  }
};
