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
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.say.no_perm'), flags: 64 });
    }
    const msg = interaction.options.getString('message');
    await interaction.reply({ content: t(interaction.guild.id, 'general.say.sent'), flags: 64 });
    return interaction.channel.send({ content: msg });
  }
};
