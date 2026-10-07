const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'dm-mode',
  description: 'تفعيل او تعطيل ارسال نتائج التقديم بالخاص',
  aliases: ['وضع-الخاص'],
  data: new SlashCommandBuilder()
    .setName('dm-mode')
    .setDescription('Application DM notifications')

    .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable or disable').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    const enabled = interaction.options.getBoolean('enabled');
    db.updateGuildSetting(interaction.guild.id, 'suggestions_dm_notify', enabled ? 1 : 0);
    return interaction.reply({ content: enabled ? t(lang, 'admin.dmmode.enabled') : t(lang, 'admin.dmmode.disabled') });
  }
};
