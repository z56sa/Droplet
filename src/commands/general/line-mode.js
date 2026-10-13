const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'line-mode',
  description: 'تحديد نمط الخط',
  aliases: ['نمط-الخط'],
  

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.line-mode.no_perm'), flags: 64 });
    }
    const mode = interaction.options.getString('mode');
    db.updateGuildSetting(interaction.guild.id, 'autoline_mode', mode);
    return interaction.reply({ content: t(interaction.guild.id, 'general.line-mode.done', { mode }) });
  }
};
