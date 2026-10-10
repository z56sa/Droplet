const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'say',
  description: 'ارسال رسالة عن طريق البوت',
  aliases: ['قول'],
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('ارسال رسالة عن طريق البوت')
    .addStringOption(opt => opt.setName('message').setDescription('الرسالة').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: t('ar', 'general.say.no_perm'), flags: 64 });
    }
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.say.no_perm'), flags: 64 });
    }
    const msg = interaction.options.getString('message');
    const channel = interaction.channel;
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.say.no_perm'), flags: 64 });
    }
    const me = interaction.guild.members.me;
    if (!me?.permissionsIn(channel).has(PermissionFlagsBits.SendMessages)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.say.no_perm'), flags: 64 });
    }
    await interaction.reply({ content: t(interaction.guild.id, 'general.say.sent'), flags: 64 });
    return channel.send({ content: msg, allowedMentions: { parse: [] } }).catch(() => {});
  }
};
