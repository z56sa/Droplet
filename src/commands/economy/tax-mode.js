const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'tax-mode',
  description: 'تحديد نمط الضريبة',
  aliases: ['نمط-الضريبة'],
  data: new SlashCommandBuilder()
    .setName('tax-mode')
    .setDescription('تحديد نمط الضريبة')
    .addStringOption(opt =>
      opt.setName('mode')
        .setDescription('النمط')
        .setRequired(true)
        .addChoices(
          { name: 'Detailed', value: 'all' },
          { name: 'Compact number only', value: 'compact' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(interaction.guild.id, 'common.no_manage_perm'), flags: 64 });
    }
    const mode = interaction.options.getString('mode');
    db.updateGuildSetting(interaction.guild.id, 'tax_mode', mode);
    return interaction.reply({ content: t(interaction.guild.id, 'economy.taxmode.set', { mode }) });
  }
};
