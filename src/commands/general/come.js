const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'come',
  description: 'ارسال رسالة في الخاص لشخص للقدوم للروم الحالي',
  aliases: ['تعال'],
  data: new SlashCommandBuilder()
    .setName('come')
    .setDescription('طلب قدوم عضو للروم الحالي')
    .addUserOption(opt => opt.setName('user').setDescription('العضو').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    await user.send({ content: t(interaction.guild.id, 'general.come.dm', { channel: interaction.channel.id, guild: interaction.guild.name }) }).catch(() => {});
    return interaction.reply({ content: t(interaction.guild.id, 'general.come.sent') });
  }
};
