const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'slowmode',
  description: 'تحديد سرعة إرسال الرسائل (Slowmode) في الروم',
  aliases: ['سلومود'],
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set message send rate limit in seconds')

    .addIntegerOption(opt =>
      opt.setName('seconds')
        .setDescription('Duration in seconds (0 to disable)')

        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild?.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: t(lang, 'moderation.slowmode.no_perm'), flags: 64 });
    }

    const seconds = interaction.options.getInteger('seconds');
    await interaction.channel.setRateLimitPerUser(seconds);

    if (seconds === 0) {
      await interaction.reply(t(lang, 'moderation.slowmode.disabled'));
    } else {
      await interaction.reply(t(lang, 'moderation.slowmode.set', { seconds }));
    }
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild?.id);
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply(t(lang, 'moderation.slowmode.no_perm'));
    }

    const seconds = parseInt(args[0], 10);
    if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
      return message.reply(t(lang, 'moderation.slowmode.invalid'));
    }

    await message.channel.setRateLimitPerUser(seconds);
    if (seconds === 0) {
      message.reply(t(lang, 'moderation.slowmode.prefix_disabled'));
    } else {
      message.reply(t(lang, 'moderation.slowmode.set', { seconds }));
    }
  }
};
