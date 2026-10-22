const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'nickname',
  description: 'تغيير لقب شخص بالسيرفر او ازالته',
  aliases: ['لقب'],
  data: new SlashCommandBuilder()
    .setName('nickname')
    .setDescription('Change a member nickname')

    .addUserOption(opt => opt.setName('user').setDescription('The member').setRequired(true))
    .addStringOption(opt => opt.setName('nick').setDescription('New nickname (empty to remove)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild?.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
      return interaction.reply({ content: t(lang, 'moderation.nickname.no_perm'), flags: 64 });
    }
    const user = interaction.options.getUser('user');
    const nick = interaction.options.getString('nick') || null;
    // 🔒 (سد L5) سقف Discord 32 حرف — حتى لا يرمي خطأ غير معالج
    const safeNick = nick ? String(nick).slice(0, 32) : null;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: t(lang, 'moderation.nickname.not_found'), flags: 64 });
    // 🔒 تدرج الرتب — لا تغيير لقب المالك أو من رتبته أعلى/مساوية للمنفذ (إلا المالك)
    if (member.id === interaction.guild.ownerId)
      return interaction.reply({ content: t(lang, 'moderation.nickname.higher'), flags: 64 });
    if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId)
      return interaction.reply({ content: t(lang, 'moderation.nickname.higher'), flags: 64 });
    await member.setNickname(safeNick);
    return interaction.reply({ content: t(lang, nick ? 'moderation.nickname.changed' : 'moderation.nickname.cleared') });
  }
};
