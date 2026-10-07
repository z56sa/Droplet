const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'set-tax-line',
  description: 'تحديد خط لروم الضريبة',
  aliases: ['خط-الضريبة'],
  data: new SlashCommandBuilder()
    .setName('set-tax-line')
    .setDescription('تحديد خط لروم الضريبة')
    .addStringOption(opt => opt.setName('line').setDescription('رابط الخط').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(interaction.guild.id, 'common.no_manage_perm'), flags: 64 });
    }
    const line = interaction.options.getString('line');
    db.updateGuildSetting(interaction.guild.id, 'tax_line', line);
    return interaction.reply({ content: t(interaction.guild.id, 'economy.taxline.set') });
  }
};
