const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'set-suggestions-line',
  description: 'تحديد خط لروم الاقتراحات',
  aliases: ['خط-الاقتراحات'],
  data: new SlashCommandBuilder()
    .setName('set-suggestions-line')
    .setDescription('Set a line for the suggestions channel')
    .addStringOption(opt => opt.setName('line').setDescription('Line link').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.set-suggestions-line.no_perm'), flags: 64 });
    }
    const line = interaction.options.getString('line');
    db.updateGuildSetting(interaction.guild.id, 'suggestions_line', line);
    return interaction.reply({ content: t(interaction.guild.id, 'general.set-suggestions-line.done') });
  }
};
