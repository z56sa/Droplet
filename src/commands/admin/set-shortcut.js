const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'set-shortcut',
  description: 'وضع اختصار لامر معين',
  aliases: ['اختصار-امر'],
  data: new SlashCommandBuilder()
    .setName('set-shortcut')
    .setDescription('Set a shortcut for a command')

    .addStringOption(opt => opt.setName('command').setDescription('The command').setRequired(true))
    .addStringOption(opt => opt.setName('alias').setDescription('The shortcut').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'admin.common.no_admin'), flags: 64 });
    }
    const cmd = interaction.options.getString('command').toLowerCase();
    const alias = interaction.options.getString('alias').toLowerCase();
    const s = db.getGuildSettings(interaction.guild.id);
    let configs = {};
    try { configs = JSON.parse(s.command_configs || '{}'); } catch(e) {}
    if (!configs[cmd]) configs[cmd] = {};
    configs[cmd].alias = alias;
    db.updateGuildSetting(interaction.guild.id, 'command_configs', JSON.stringify(configs));
    return interaction.reply({ content: t(lang, 'admin.setshortcut.success') });
  }
};
