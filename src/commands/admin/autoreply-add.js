const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'autoreply-add',
  description: 'لاضافة رد تلقائي',
  aliases: ['اضف-رد'],

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
