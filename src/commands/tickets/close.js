const db = require('../../database');
const { PermissionFlagsBits } = require('discord.js');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'close',
  description: 'اغلاق التذكرة',
  aliases: ['اغلاق'],

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    const ticket = db.getTicket ? db.getTicket(interaction.channel.id) : null;
    if (!ticket) return interaction.reply({ content: t(lang, 'tickets.common.not_in_ticket'), flags: 64 });

    // 🔒 بوابة: صاحب التذكرة أو طاقم الدعم فقط (نفس قواعد زر الإغلاق)
    const _s = db.getGuildSettings ? (db.getGuildSettings(interaction.guild.id) || {}) : {};
    const _sup = _s.support_role || _s.ticket_role || _s.staff_role;
    const _isStaff = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.member?.permissions?.has(PermissionFlagsBits.ManageChannels) ||
      (_sup && interaction.member?.roles?.cache?.has(_sup));
    const _isOwner = String(ticket.user_id) === String(interaction.user ? interaction.user.id : interaction.member?.user?.id);
    if (!_isStaff && !_isOwner) {
      return interaction.reply({ content: t(lang, 'tickets.common.owner_or_staff'), flags: 64 });
    }

    if (db.closeTicket) db.closeTicket(interaction.channel.id, interaction.user.id, 'تم الإغلاق');
    await interaction.reply({ content: t(lang, 'tickets.close.closed') });
    setTimeout(() => { interaction.channel.delete().catch(() => {}); }, 4000);
  }
};
