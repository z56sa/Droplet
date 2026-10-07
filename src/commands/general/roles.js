const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'roles',
  description: 'رؤية جميع رتب السيرفر',
  aliases: ['رتب'],
  data: new SlashCommandBuilder()
    .setName('roles')
    .setDescription('عرض رتب السيرفر'),

  async execute(interaction) {
    const roles = interaction.guild.roles.cache
      .filter(r => r.id !== interaction.guild.id)
      .map(r => '<@&' + r.id + '>')
      .slice(0, 40);
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(t(interaction.guild.id, 'general.roles.title'))
      .setDescription(roles.join('\n') || t(interaction.guild.id, 'general.roles.empty'));
    return interaction.reply({ embeds: [embed] });
  }
};
