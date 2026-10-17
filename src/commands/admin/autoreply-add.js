const { PermissionFlagsBits } = require('discord.js');
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
    let word = interaction.options.getString('word');
    let reply = interaction.options.getString('reply');

    // إدخال البريفكس (الشيم تعيد args كاملة في getString): كلمة الاستجابة أول فراغ والباقي هو الرد
    if (interaction.isPrefixShim && word && word === reply) {
      const parts = String(word).trim().split(/\s+/);
      if (parts.length >= 2) {
        word = parts[0];
        reply = parts.slice(1).join(' ');
      }
    }

    if (!word || !reply) {
      return interaction.reply({ content: t(lang, 'admin.autoreplyadd.missing'), flags: 64 });
    }

    db.addAutoResponder(interaction.guild.id, word, reply);
    return interaction.reply({ content: t(lang, 'admin.autoreplyadd.added', { word }) });
  }
};
