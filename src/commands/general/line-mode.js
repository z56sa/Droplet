const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'line-mode',
  description: 'تحديد نمط الخط',
  aliases: ['نمط-الخط'],
  data: new SlashCommandBuilder()
    .setName('line-mode')
    .setDescription('Set the line style')
    .addStringOption(opt =>
      opt.setName('mode')
        .setDescription('The style')
        .setRequired(true)
        .addChoices(
          { name: 'Plain message', value: 'line' },
          { name: 'Embed', value: 'embed' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.line-mode.no_perm'), flags: 64 });
    }
    const mode = interaction.options.getString('mode');
    db.updateGuildSetting(interaction.guild.id, 'autoline_mode', mode);
    return interaction.reply({ content: t(interaction.guild.id, 'general.line-mode.done', { mode }) });
  }
};
