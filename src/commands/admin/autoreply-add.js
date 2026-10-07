const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'autoreply-add',
  description: 'لاضافة رد تلقائي',
  aliases: ['اضف-رد'],
  data: new SlashCommandBuilder()
    .setName('autoreply-add')
    .setDescription('Add an auto-reply')

    .addStringOption(opt => opt.setName('word').setDescription('The trigger word').setRequired(true))
    .addStringOption(opt => opt.setName('reply').setDescription('The bot reply').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(lang, 'common.no_manage_perm'), flags: 64 });
    }
    const word = interaction.options.getString('word');
    const reply = interaction.options.getString('reply');
    db.addAutoResponder(interaction.guild.id, word, reply);
    return interaction.reply({ content: t(lang, 'admin.autoreplyadd.added', { word }) });
  }
};
