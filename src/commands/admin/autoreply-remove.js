const { PermissionFlagsBits } = require('discord.js');
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
    if (id === null || id === undefined || Number.isNaN(Number(id))) {
      return interaction.reply({ content: t(lang, 'admin.autoreplyremove.not_found', { id: '❓' }), flags: 64 });
    }

    // ✅ الترتيب الصحيح: (guildId, idOrTrigger) — لا يوجد إخراج قبل الحذف
    try {
      const result = db.deleteAutoResponder(interaction.guild.id, Number(id));
      const changes = Number(result && result.changes) || 0;
      if (changes > 0) {
        return interaction.reply({ content: t(lang, 'admin.autoreplyremove.removed', { id }) });
      }
      return interaction.reply({ content: t(lang, 'admin.autoreplyremove.not_found', { id }), flags: 64 });
    } catch (e) {
      console.error('[autoreply-remove] failed:', e);
      return interaction.reply({ content: t(lang, 'admin.autoreplyremove.not_found', { id }), flags: 64 });
    }
  }
};
