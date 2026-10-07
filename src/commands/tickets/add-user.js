const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'add-user',
  description: 'Add a user to the current ticket channel',
  aliases: ['اضافة-عضو'],
  data: new SlashCommandBuilder()
    .setName('add-user')
    .setDescription('Add a member to the ticket')

    .addUserOption(opt => opt.setName('user').setDescription('The member').setRequired(true)),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    const ticket = db.getTicket ? db.getTicket(interaction.channel.id) : null;
    if (!ticket) return interaction.reply({ content: t(lang, 'tickets.common.not_in_ticket'), flags: 64 });
    const user = interaction.options.getUser('user');
    await interaction.channel.permissionOverwrites.create(user.id, { ViewChannel: true, SendMessages: true });
    return interaction.reply({ content: t(lang, 'tickets.adduser.added', { user: user.id }) });
  }
};
