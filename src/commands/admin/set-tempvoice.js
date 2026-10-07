const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'set-tempvoice',
  description: 'تعيين روم إنشاء الرومات الصوتية المؤقتة (Join to Create)',
  aliases: ['رومات_مؤقتة'],
  data: new SlashCommandBuilder()
    .setName('set-tempvoice')
    .setDescription('Set the temporary voice channel room')

    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('The main voice channel (Join to Create)')

        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'admin.common.no_admin'), flags: 64 });
    }

    const channel = interaction.options.getChannel('channel');
    db.updateGuildSetting(interaction.guild.id, 'temp_voice_channel', channel.id);

    await interaction.reply({
      content: t(lang, 'admin.settempvoice.success', { channel: channel.id })
    });
  },

  async executePrefix(message) {
    const lang = getGuildLang(message.guild.id);
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply(t(lang, 'admin.common.no_admin'));
    }

    const channel = message.mentions.channels.first();
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      return message.reply(t(lang, 'admin.settempvoice.prefix_need_mention'));
    }

    db.updateGuildSetting(message.guild.id, 'temp_voice_channel', channel.id);
    message.reply(t(lang, 'admin.settempvoice.prefix_set', { channel: channel.id }));
  }
};
