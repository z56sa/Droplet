const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'set-suggestions-room',
  description: 'تحديد روم يتم فيه تحويل الرسائل لاقتراحات',
  aliases: ['تحديد-روم-الاقتراحات'],
  

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.set-suggestions-room.no_perm'), flags: 64 });
    }
    const channel = interaction.options.getChannel('channel');
    db.updateGuildSetting(interaction.guild.id, 'suggestions_channel', channel.id);
    db.updateGuildSetting(interaction.guild.id, 'suggestions_enabled', 1);
    return interaction.reply({ content: t(interaction.guild.id, 'general.set-suggestions-room.done') });
  }
};
