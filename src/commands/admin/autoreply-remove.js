const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'autoreply-remove',
  description: 'لازالة رد تلقائي',
  aliases: ['حذف-رد'],

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(lang, 'common.no_manage_perm'), flags: 64 });
    }
    const id = interaction.options.getInteger('id');
    db.deleteAutoResponder(id, interaction.guild.id);
    return interaction.reply({ content: t(lang, 'admin.autoreplyremove.removed', { id }) });
  }
};
