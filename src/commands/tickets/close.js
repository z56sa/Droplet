const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'close',
  description: 'اغلاق التذكرة',
  aliases: ['اغلاق'],
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close the current ticket')
,

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    const ticket = db.getTicket ? db.getTicket(interaction.channel.id) : null;
    if (!ticket) return interaction.reply({ content: t(lang, 'tickets.common.not_in_ticket'), flags: 64 });
    if (db.closeTicket) db.closeTicket(interaction.channel.id, interaction.user.id, 'تم الإغلاق');
    await interaction.reply({ content: t(lang, 'tickets.close.closed') });
    setTimeout(() => { interaction.channel.delete().catch(() => {}); }, 4000);
  }
};
