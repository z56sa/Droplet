const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'set-prefix',
  description: 'تغيير برفكس الأوامر النصية في السيرفر',
  aliases: ['setprefix', 'برفكس'],
  data: new SlashCommandBuilder()
    .setName('set-prefix')
    .setDescription('Change the server command prefix')

    .addStringOption(opt =>
      opt.setName('prefix')
        .setDescription('The new symbol (e.g. !, #, $, .)')

        .setMaxLength(3)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    // 1. الاستجابة الفورية لمنع انتهاء المهلة (3 ثواني)
    await interaction.deferReply({ flags: 64 });

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply({ content: t(lang, 'admin.common.no_admin') });
    }

    const newPrefix = interaction.options.getString('prefix');

    try {
      // 2. استخدام الدالة الصحيحة المتوافقة مع قاعدة البيانات لديك
      if (typeof db.setGuildSetting === 'function') {
        db.setGuildSetting(interaction.guild.id, 'prefix', newPrefix);
      } else if (typeof db.setGuildPrefix === 'function') {
        db.setGuildPrefix(interaction.guild.id, newPrefix);
      } else {
        db.updateGuildSetting(interaction.guild.id, 'prefix', newPrefix);
      }

      await interaction.editReply({ content: t(lang, 'admin.setprefix.success', { prefix: newPrefix }) });
    } catch (err) {
      console.error('خطأ في حفظ البرفكس:', err);
      await interaction.editReply({ content: t(lang, 'admin.setprefix.db_error') });
    }
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild.id);
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply(t(lang, 'admin.common.no_admin'));
    }

    const newPrefix = args[0];
    if (!newPrefix || newPrefix.length > 3) {
      return message.reply(t(lang, 'admin.setprefix.prefix_invalid'));
    }

    try {
      if (typeof db.setGuildSetting === 'function') {
        db.setGuildSetting(message.guild.id, 'prefix', newPrefix);
      } else if (typeof db.setGuildPrefix === 'function') {
        db.setGuildPrefix(message.guild.id, newPrefix);
      } else {
        db.updateGuildSetting(message.guild.id, 'prefix', newPrefix);
      }

      message.reply(t(lang, 'admin.setprefix.prefix_saved', { prefix: newPrefix }));
    } catch (err) {
      console.error('خطأ في حفظ البرفكس:', err);
      message.reply(t(lang, 'admin.setprefix.prefix_save_error'));
    }
  }
};
