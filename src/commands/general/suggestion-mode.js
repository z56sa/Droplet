const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'suggestion-mode',
  description: 'تحديد نمط الاقتراحات',
  aliases: ['نمط-الاقتراحات'],
  

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.suggestion-mode.no_perm'), flags: 64 });
    }
    const mode = interaction.options.getString('mode');
    db.updateGuildSetting(interaction.guild.id, 'suggestion_mode', mode);
    return interaction.reply({ content: t(interaction.guild.id, 'general.suggestion-mode.done', { mode }) });
  }
};
