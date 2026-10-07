const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'ping',
  description: 'عرض سرعة استجابة البوت (Ping)',
  aliases: ['p', 'بنج'],
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('عرض سرعة استجابة البوت (Ping)'),

  async execute(interaction, client) {
    const sent = await interaction.reply({ content: t(interaction.guild.id, 'general.ping.measuring'), withResponse: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(client.ws.ping);

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(t(interaction.guild.id, 'general.ping.title'))
      .addFields(
        { name: t(interaction.guild.id, 'general.ping.field_latency'), value: `\`${latency}ms\``, inline: true },
        { name: t(interaction.guild.id, 'general.ping.field_api'), value: `\`${apiLatency}ms\``, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ content: null, embeds: [embed] });
  },

  async executePrefix(message, args, client) {
    const sent = await message.reply(t(message.guild.id, 'general.ping.measuring'));
    const latency = sent.createdTimestamp - message.createdTimestamp;
    const apiLatency = Math.round(client.ws.ping);

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(t(message.guild.id, 'general.ping.title'))
      .addFields(
        { name: t(message.guild.id, 'general.ping.field_latency'), value: `\`${latency}ms\``, inline: true },
        { name: t(message.guild.id, 'general.ping.field_api'), value: `\`${apiLatency}ms\``, inline: true }
      )
      .setTimestamp();

    await sent.edit({ content: null, embeds: [embed] });
  }
};
