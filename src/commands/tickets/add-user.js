const db = require('../../database');
const { PermissionFlagsBits } = require('discord.js');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'add-user',
  description: 'Add a user to the current ticket channel',
  aliases: ['اضافة-عضو'],

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    const ticket = db.getTicket ? db.getTicket(interaction.channel.id) : null;
    if (!ticket) return interaction.reply({ content: t(lang, 'tickets.common.not_in_ticket'), flags: 64 });

    // 🔒 بوابة: طاقم الدعم فقط (نفس قواعد زر إضافة عضو)
    const _s = db.getGuildSettings ? (db.getGuildSettings(interaction.guild.id) || {}) : {};
    const _sup = _s.support_role || _s.ticket_role || _s.staff_role;
    const _isStaff = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.member?.permissions?.has(PermissionFlagsBits.ManageChannels) ||
      (_sup && interaction.member?.roles?.cache?.has(_sup));
    if (!_isStaff) {
      return interaction.reply({ content: t(lang, 'tickets.ticket.staff_only'), flags: 64 });
    }

    const user = interaction.options.getUser('user');
    if (!user) return interaction.reply({ content: t(lang, 'tickets.ticket.prefix_need_member_mention'), flags: 64 });
    await interaction.channel.permissionOverwrites.create(user.id, { ViewChannel: true, SendMessages: true });
    return interaction.reply({ content: t(lang, 'tickets.adduser.added', { user: user.id }) });
  }
};
