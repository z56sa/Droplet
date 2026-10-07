const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'delete',
  description: 'حذف التذكرة بشكل نهائي',
  aliases: ['حذف-تذكرة'],
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete the ticket immediately')
,

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    const ticket = db.getTicket ? db.getTicket(interaction.channel.id) : null;
    if (!ticket) return interaction.reply({ content: t(lang, 'tickets.common.not_in_ticket'), flags: 64 });
    await interaction.reply({ content: t(lang, 'tickets.delete.deleting') });
    setTimeout(() => { interaction.channel.delete().catch(() => {}); }, 2000);
  }
};
