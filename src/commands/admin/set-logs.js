const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'set-logs',
  description: 'تحديد روم سجلات السيرفر الشاملة (Audit Logs)',
  aliases: ['لوق', 'سجلات'],
  data: new SlashCommandBuilder()
    .setName('set-logs')
    .setDescription('Set the comprehensive logs channel')

    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('The logs channel')

        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'admin.common.no_admin'), flags: 64 });
    }

    const channel = interaction.options.getChannel('channel');
    db.updateGuildSetting(interaction.guild.id, 'log_channel', channel.id);

    await interaction.reply({ content: t(lang, 'admin.setlogs.set', { channel: channel.id }) });
  },

  async executePrefix(message) {
    const lang = getGuildLang(message.guild.id);
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply(t(lang, 'admin.common.no_admin'));
    }

    const channel = message.mentions.channels.first();
    if (!channel) return message.reply(t(lang, 'admin.setlogs.prefix_need_mention'));

    db.updateGuildSetting(message.guild.id, 'log_channel', channel.id);
    message.reply(t(lang, 'admin.setlogs.set', { channel: channel.id }));
  }
};
