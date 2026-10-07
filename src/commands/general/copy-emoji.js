const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'copy-emoji',
  description: 'نسخ ايموجي من سيرفر اخر واضافته لسيرفرك',
  aliases: ['سرقة-ايموجي'],
  data: new SlashCommandBuilder()
    .setName('copy-emoji')
    .setDescription('Copy an emoji and add it to the server')
    .addStringOption(opt => opt.setName('emoji').setDescription('The emoji').setRequired(true))
    .addStringOption(opt => opt.setName('name').setDescription('New name (optional)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.copy-emoji.no_perm'), flags: 64 });
    }
    const raw = interaction.options.getString('emoji');
    const name = interaction.options.getString('name');
    const match = raw.match(/<(a?):(\w+):(\d+)>/);
    if (!match) return interaction.reply({ content: t(interaction.guild.id, 'general.copy-emoji.invalid'), flags: 64 });
    const url = 'https://cdn.discordapp.com/emojis/' + match[3] + (match[1] ? '.gif' : '.png');
    const created = await interaction.guild.emojis.create({ attachment: url, name: name || match[2] });
    return interaction.reply({ content: t(interaction.guild.id, 'general.copy-emoji.done', { emoji: created.toString() }) });
  }
};
