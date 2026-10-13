const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'set-suggestions-line',
  description: 'تحديد خط لروم الاقتراحات',
  aliases: ['خط-الاقتراحات'],
  

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.set-suggestions-line.no_perm'), flags: 64 });
    }
    const line = interaction.options.getString('line');
    db.updateGuildSetting(interaction.guild.id, 'suggestions_line', line);
    return interaction.reply({ content: t(interaction.guild.id, 'general.set-suggestions-line.done') });
  }
};
