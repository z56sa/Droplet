const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'feedback-mode',
  description: 'تحديد نمط الآراء',
  aliases: ['نمط-الاراء'],
  data: new SlashCommandBuilder()
    .setName('feedback-mode')
    .setDescription('Set the feedback style')
    .addStringOption(opt =>
      opt.setName('mode')
        .setDescription('The style')
        .setRequired(true)
        .addChoices(
          { name: 'Embed', value: 'embed' },
          { name: 'Plain', value: 'normal' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.feedback-mode.no_perm'), flags: 64 });
    }
    const mode = interaction.options.getString('mode');
    db.updateGuildSetting(interaction.guild.id, 'feedback_mode', mode);
    return interaction.reply({ content: t(interaction.guild.id, 'general.feedback-mode.done', { mode }) });
  }
};
