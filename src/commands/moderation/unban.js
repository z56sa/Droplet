const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'unban',
  description: 'إلغاء حظر عضو من السيرفر',
  aliases: ['انبان'],
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a member from the server')

    .addStringOption(opt => opt.setName('userid').setDescription('Banned member ID').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild?.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({ content: t(lang, 'moderation.unban.no_perm'), flags: 64 });
    }

    const userId = interaction.options.getString('userid');
    try {
      await interaction.guild.bans.remove(userId, t(lang, 'moderation.unban.audit_by', { tag: interaction.user.tag }));

      const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle(t(lang, 'moderation.unban.title'))
        .setDescription(t(lang, 'moderation.unban.desc', { id: userId }))
        .setFooter({ text: t(lang, 'moderation.unban.footer', { tag: interaction.user.tag }) })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch {
      await interaction.reply({ content: t(lang, 'moderation.unban.fail'), flags: 64 });
    }
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild?.id);
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply(t(lang, 'moderation.unban.prefix_no_perm'));
    }

    const userId = args[0];
    if (!userId) return message.reply(t(lang, 'moderation.unban.prefix_usage'));

    try {
      await message.guild.bans.remove(userId, t(lang, 'moderation.unban.audit_by', { tag: message.author.tag }));
      const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle(t(lang, 'moderation.unban.title'))
        .setDescription(t(lang, 'moderation.unban.desc', { id: userId }))
        .setFooter({ text: t(lang, 'moderation.unban.footer', { tag: message.author.tag }) })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch {
      message.reply(t(lang, 'moderation.unban.prefix_fail'));
    }
  }
};
