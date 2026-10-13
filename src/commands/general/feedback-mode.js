const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'feedback-mode',
  description: 'تحديد نمط الآراء',
  aliases: ['نمط-الاراء'],
  

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.feedback-mode.no_perm'), flags: 64 });
    }
    const mode = interaction.options.getString('mode');
    db.updateGuildSetting(interaction.guild.id, 'feedback_mode', mode);
    return interaction.reply({ content: t(interaction.guild.id, 'general.feedback-mode.done', { mode }) });
  }
};
