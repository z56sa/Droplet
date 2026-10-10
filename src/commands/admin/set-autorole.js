const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'set-autorole',
  description: 'تعيين رتبة تلقائية يتم إعطاؤها للأعضاء الجدد فور دخولهم',
  aliases: ['اوتورول', 'رتبة_تلقائية'],
  data: new SlashCommandBuilder()
    .setName('set-autorole')
    .setDescription('Set the auto-role for new members')

    .addRoleOption(opt =>
      opt.setName('role')
        .setDescription('The role to set (leave empty to cancel)')

        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'admin.common.no_admin'), flags: 64 });
    }

    const role = interaction.options.getRole('role');

    if (!role) {
      db.updateGuildSetting(interaction.guild.id, 'autorole_id', null);
      db.updateGuildSetting(interaction.guild.id, 'auto_role', null);
      return interaction.reply(t(lang, 'admin.setautorole.disabled'));
    }

    db.updateGuildSetting(interaction.guild.id, 'autorole_id', role.id);
    db.updateGuildSetting(interaction.guild.id, 'auto_role', role.id);
    db.updateGuildSetting(interaction.guild.id, 'autoroles_enabled', 1);
    await interaction.reply({ content: t(lang, 'admin.setautorole.set', { name: role.name, id: role.id }) });
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild.id);
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply(t(lang, 'admin.common.no_admin'));
    }

    const role = message.mentions.roles.first() || (args[0] ? message.guild.roles.cache.get(args[0]) : null);
    if (!role) return message.reply(t(lang, 'admin.setautorole.prefix_need_mention'));

    db.updateGuildSetting(message.guild.id, 'autorole_id', role.id);
    db.updateGuildSetting(message.guild.id, 'auto_role', role.id);
    db.updateGuildSetting(message.guild.id, 'autoroles_enabled', 1);
    message.reply(t(lang, 'admin.setautorole.prefix_set', { name: role.name }));
  }
};
