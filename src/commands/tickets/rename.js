const { SlashCommandBuilder } = require('discord.js');
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
    const name = interaction.options.getString('name');
    await interaction.channel.setName(name);
    return interaction.reply({ content: t(lang, 'tickets.rename.renamed', { name }) });
  }
};
