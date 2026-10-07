const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'remove-user',
  description: 'إزالة عضو من التذكرة الحالية',
  aliases: ['ازالة-عضو'],
  data: new SlashCommandBuilder()
    .setName('remove-user')
    .setDescription('Remove a member from the ticket')

    .addUserOption(opt => opt.setName('user').setDescription('The member').setRequired(true)),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    const ticket = db.getTicket ? db.getTicket(interaction.channel.id) : null;
    if (!ticket) return interaction.reply({ content: t(lang, 'tickets.common.not_in_ticket'), flags: 64 });
    const user = interaction.options.getUser('user');
    await interaction.channel.permissionOverwrites.delete(user.id);
    return interaction.reply({ content: t(lang, 'tickets.removeuser.removed', { user: user.id }) });
  }
};
