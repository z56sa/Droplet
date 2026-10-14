const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'set-language',
  description: 'تغيير لغة البوت في السيرفر (العربية / English)',
  aliases: ['setlanguage', 'setlang', 'language', 'lang', 'اللغة', 'لغة'],
  category: 'admin',
  data: new SlashCommandBuilder()
    .setName('set-language')
    .setDescription('Change the bot language for this server (العربية / English)')
    .addStringOption(opt =>
      opt.setName('language')
        .setDescription('اختر لغة البوت / Choose the bot language')
        .setRequired(true)
        .addChoices(
          { name: '🇸🇦 العربية (Arabic)', value: 'AR' },
          { name: '🇺🇸 English', value: 'EN' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    await interaction.deferReply({ flags: 64 });

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply({ content: t(lang, 'admin.common.no_admin') });
    }

    const chosenLang = interaction.options.getString('language').toUpperCase();

    try {
      if (typeof db.setGuildSetting === 'function') {
        db.setGuildSetting(interaction.guild.id, 'bot_language', chosenLang);
      } else if (typeof db.updateGuildSettings === 'function') {
        db.updateGuildSettings(interaction.guild.id, { bot_language: chosenLang });
      } else {
        db.updateGuildSetting(interaction.guild.id, 'bot_language', chosenLang);
      }

      const isAr = chosenLang === 'AR';
      const replyMsg = isAr
        ? '🇸🇦 تم تغيير لغة البوت بنجاح إلى: **العربية**\nستظهر جميع رسائل البوت ولوحاته باللغة العربية الآن.'
        : '🇺🇸 Bot language has been successfully changed to: **English**\nAll bot responses and panels in this server will now be in English.';

      await interaction.editReply({ content: replyMsg });
    } catch (err) {
      console.error('خطأ في حفظ لغة البوت:', err);
      await interaction.editReply({ content: t(lang, 'admin.setprefix.db_error') });
    }
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild.id);
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply(t(lang, 'admin.common.no_admin'));
    }

    const input = (args[0] || '').toLowerCase();
    let chosenLang = null;

    if (['ar', 'arabic', 'عربي', 'العربية'].includes(input)) {
      chosenLang = 'AR';
    } else if (['en', 'english', 'انجليزي', 'الانجليزية'].includes(input)) {
      chosenLang = 'EN';
    }

    if (!chosenLang) {
      const usage = lang === 'AR'
        ? '❌ يرجى اختيار لغة صالحة:\n`#set-language ar` — للغة العربية 🇸🇦\n`#set-language en` — للغة الإنجليزية 🇺🇸'
        : '❌ Please specify a valid language:\n`#set-language ar` — Arabic 🇸🇦\n`#set-language en` — English 🇺🇸';
      return message.reply(usage);
    }

    try {
      if (typeof db.setGuildSetting === 'function') {
        db.setGuildSetting(message.guild.id, 'bot_language', chosenLang);
      } else if (typeof db.updateGuildSettings === 'function') {
        db.updateGuildSettings(message.guild.id, { bot_language: chosenLang });
      } else {
        db.updateGuildSetting(message.guild.id, 'bot_language', chosenLang);
      }

      const isAr = chosenLang === 'AR';
      const replyMsg = isAr
        ? '🇸🇦 تم تغيير لغة البوت بنجاح إلى: **العربية**\nستظهر جميع رسائل البوت باللغة العربية.'
        : '🇺🇸 Bot language has been successfully changed to: **English**\nAll bot responses in this server will now be in English.';

      message.reply(replyMsg);
    } catch (err) {
      console.error('خطأ في حفظ لغة البوت:', err);
      message.reply(t(lang, 'admin.setprefix.prefix_save_error'));
    }
  }
};
