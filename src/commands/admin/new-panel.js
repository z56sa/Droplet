const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'new-panel',
  description: 'انشاء بانل جديد',
  aliases: ['بانل-جديد'],
  data: new SlashCommandBuilder()
    .setName('new-panel')
    .setDescription('Create a new role panel')

    .addStringOption(opt => opt.setName('title').setDescription('The title').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('The description').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    const title = interaction.options.getString('title');
    const desc = interaction.options.getString('description');
    const embed = new EmbedBuilder().setColor('#5865F2').setTitle(title).setDescription(desc);
    const msg = await interaction.channel.send({ embeds: [embed] });
    return interaction.reply({ content: t(lang, 'admin.newpanel.created', { id: msg.id }) });
  }
};
