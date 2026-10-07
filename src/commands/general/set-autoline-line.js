const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'set-autoline-line',
  description: 'تحديد خط للروم',
  aliases: ['تحديد-الخط'],
  data: new SlashCommandBuilder()
    .setName('set-autoline-line')
    .setDescription('Set a line for the channel')
    .addStringOption(opt => opt.setName('line').setDescription('Line link').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.set-autoline-line.no_perm'), flags: 64 });
    }
    const line = interaction.options.getString('line');
    db.updateGuildSetting(interaction.guild.id, 'autoline_line', line);
    return interaction.reply({ content: t(interaction.guild.id, 'general.set-autoline-line.done') });
  }
};
