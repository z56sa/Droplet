const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'rename',
  description: 'اعادة تسمية التذكرة الحالية',
  aliases: ['تسمية-تذكرة'],
  data: new SlashCommandBuilder()
    .setName('rename')
    .setDescription('Rename the ticket')

    .addStringOption(opt => opt.setName('name').setDescription('The new name').setRequired(true)),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    const ticket = db.getTicket ? db.getTicket(interaction.channel.id) : null;
    if (!ticket) return interaction.reply({ content: t(lang, 'tickets.common.not_in_ticket'), flags: 64 });

    // 🔒 بوابة: طاقم الدعم فقط
    const _s = db.getGuildSettings ? (db.getGuildSettings(interaction.guild.id) || {}) : {};
    const _sup = _s.support_role || _s.ticket_role || _s.staff_role;
    const _isStaff = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.member?.permissions?.has(PermissionFlagsBits.ManageChannels) ||
      (_sup && interaction.member?.roles?.cache?.has(_sup));
    if (!_isStaff) {
      return interaction.reply({ content: t(lang, 'tickets.ticket.staff_only'), flags: 64 });
    }

    // 🔒 (سد L5) سقف اسم القناة 100 حرف — بلاه Discord يرمي خطأ غير معالج
    const name = String(interaction.options.getString('name') || '').trim().slice(0, 100);
    if (!name) {
      return interaction.reply({ content: '⚠️ اكتب اسم صالح للقناة (حتى 100 حرف).', flags: 64 });
    }
    try {
      await interaction.channel.setName(name);
    } catch (e) {
      return interaction.reply({ content: '❌ تعذر تغيير اسم القناة — تأكد أن أذونات البوت كافية.', flags: 64 });
    }
    return interaction.reply({ content: t(lang, 'tickets.rename.renamed', { name }) });
  }
};
