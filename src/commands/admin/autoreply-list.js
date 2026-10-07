const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'autoreply-list',
  description: 'لرؤية جميع الردود التلقائية',
  aliases: ['قائمة-الردود'],
  data: new SlashCommandBuilder()
    .setName('autoreply-list')
    .setDescription('View all auto-replies')

    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(lang, 'common.no_manage_perm'), flags: 64 });
    }
    const list = db.getAutoResponders(interaction.guild.id);
    if (!list || list.length === 0) return interaction.reply({ content: t(lang, 'admin.autoreplylist.empty'), flags: 64 });
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(t(lang, 'admin.autoreplylist.title', { count: list.length }))
      .setDescription(list.map(r => '#' + r.id + ' [' + r.trigger_word + '] -> ' + r.reply_text).join('\n'));
    return interaction.reply({ embeds: [embed] });
  }
};
