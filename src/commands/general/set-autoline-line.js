const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'set-autoline-line',
  description: 'تحديد خط للروم',
  aliases: ['تحديد-الخط'],
  

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.set-autoline-line.no_perm'), flags: 64 });
    }
    const line = interaction.options.getString('line');
    db.updateGuildSetting(interaction.guild.id, 'autoline_line', line);
    return interaction.reply({ content: t(interaction.guild.id, 'general.set-autoline-line.done') });
  }
};
