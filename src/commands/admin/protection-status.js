const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'protection-status',
  description: 'عرض حالة جميع أنظمة الحماية في السيرفر',
  aliases: ['حالة-الحماية'],
  data: new SlashCommandBuilder()
    .setName('protection-status')
    .setDescription('Show the status of all protection systems')

    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'admin.common.no_admin'), flags: 64 });
    }
    const s = db.getGuildSettings(interaction.guild.id);
    const on = t(lang, 'admin.protectionstatus.on');
    const off = t(lang, 'admin.protectionstatus.off');
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(t(lang, 'admin.protectionstatus.title'))
      .addFields(
        { name: 'Anti-Ban', value: s.antinuke_enabled ? on : off, inline: true },
        { name: 'Anti-Bots', value: s.anti_bot ? on : off, inline: true },
        { name: 'Anti-Delete-Roles', value: s.antinuke_enabled ? on : off, inline: true },
        { name: 'Anti-Delete-Rooms', value: s.antinuke_enabled ? on : off, inline: true },
        { name: 'Anti-Link', value: s.anti_link ? on : off, inline: true },
        { name: 'Anti-Spam', value: s.anti_spam ? on : off, inline: true }
      );
    return interaction.reply({ embeds: [embed] });
  }
};
