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
    if (!interaction.guild) {
      return interaction.reply({ content: 'Guild only.', flags: 64 }).catch(() => {});
    }
    if (!interaction.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.come.no_perm') || '❌ تحتاج صلاحية نقل الأعضاء.', flags: 64 });
    }
    const voiceChannel = interaction.member.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.come.need_voice') || '❌ يجب أن تكون في روم صوتي أولاً.', flags: 64 });
    }
    const user = interaction.options.getUser('user');
    try {
      await user.send({ content: t(interaction.guild.id, 'general.come.dm', { channel: voiceChannel.id, guild: interaction.guild.name }) });
      return interaction.reply({ content: t(interaction.guild.id, 'general.come.sent') });
    } catch {
      return interaction.reply({ content: t(interaction.guild.id, 'general.come.dm_fail') || '⚠️ تعذر إرسال الخاص (مغلق).', flags: 64 });
    }
  }
};
