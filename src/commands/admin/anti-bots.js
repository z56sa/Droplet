const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'anti-bots',
  description: 'تسطيب نظام الحماية من البوتات',
  aliases: ['انتي-بوت'],
  category: 'admin',

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'admin.common.no_admin'), flags: 64 });
    }
    const enabled = interaction.options.getBoolean('enabled');
    db.updateGuildSetting(interaction.guild.id, 'anti_bot', enabled ? 1 : 0);
    db.updateGuildSetting(interaction.guild.id, 'anti_bot_add', enabled ? 1 : 0);
    return interaction.reply({ content: enabled ? t(lang, 'admin.antibots.enabled') : t(lang, 'admin.antibots.disabled') });
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild.id);
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply(t(lang, 'admin.common.no_admin'));
    }
    const first = (args[0] || '').toLowerCase();
    const enabled = first === 'on' || first === 'enable' || first === 'تفعيل' || first === '1';
    db.updateGuildSetting(message.guild.id, 'anti_bot', enabled ? 1 : 0);
    db.updateGuildSetting(message.guild.id, 'anti_bot_add', enabled ? 1 : 0);
    return message.reply(enabled ? t(lang, 'admin.antibots.enabled') : t(lang, 'admin.antibots.disabled'));
  }
};
