const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'set-protect-logs',
  description: 'تعيين روم لسجلات الحماية والنوك',
  aliases: ['روم-سجلات-الحماية'],
  data: new SlashCommandBuilder()
    .setName('set-protect-logs')
    .setDescription('Set a channel for protection logs')

    .addChannelOption(opt => opt.setName('channel').setDescription('The logs channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'admin.common.no_admin'), flags: 64 });
    }
    const ch = interaction.options.getChannel('channel');
    db.updateGuildSetting(interaction.guild.id, 'antinuke_log_channel', ch.id);
    return interaction.reply({ content: t(lang, 'admin.setprotectlogs.success') });
  }
};
