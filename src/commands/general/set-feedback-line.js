const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'set-feedback-line',
  description: 'تحديد خط لروم الآراء',
  aliases: ['خط-الاراء'],
  data: new SlashCommandBuilder()
    .setName('set-feedback-line')
    .setDescription('Set a line for the feedback channel')
    .addStringOption(opt => opt.setName('line').setDescription('Line link').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.set-feedback-line.no_perm'), flags: 64 });
    }
    const line = interaction.options.getString('line');
    db.updateGuildSetting(interaction.guild.id, 'feedback_line', line);
    return interaction.reply({ content: t(interaction.guild.id, 'general.set-feedback-line.done') });
  }
};
