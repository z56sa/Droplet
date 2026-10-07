const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'add-ticket-button',
  description: 'تثبيت التذكرة',
  aliases: ['زر-تذكرة'],
  data: new SlashCommandBuilder()
    .setName('add-ticket-button')
    .setDescription('Send the ticket button')

    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_open').setLabel(t(lang, 'tickets.addticketbutton.button_label')).setStyle(ButtonStyle.Primary)
    );
    await interaction.channel.send({ content: t(lang, 'tickets.addticketbutton.panel_prompt'), components: [row] });
    return interaction.reply({ content: t(lang, 'tickets.addticketbutton.sent'), flags: 64 });
  }
};
