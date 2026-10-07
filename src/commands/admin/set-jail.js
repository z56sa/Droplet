const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'set-jail',
  description: 'إعداد وتحديد رتبة وروم السجن (Jail Setup)',
  aliases: ['ضبط_السجن', 'اعداد_السجن'],
  data: new SlashCommandBuilder()
    .setName('set-jail')
    .setDescription('Configure the jail role and channel')

    .addRoleOption(opt => opt.setName('role').setDescription('Custom jail role (Jailed Role)').setRequired(false))
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Custom jail channel for talking to jailed members')

        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'admin.setjail.admin_only'), flags: 64 });
    }

    const role = interaction.options.getRole('role');
    const channel = interaction.options.getChannel('channel');

    if (!role && !channel) {
      return interaction.reply({ content: t(lang, 'admin.setjail.need_selection'), flags: 64 });
    }

    if (role) db.updateGuildSetting(interaction.guild.id, 'jail_role', role.id);
    if (channel) db.updateGuildSetting(interaction.guild.id, 'jail_channel', channel.id);

    const settings = db.getGuildSettings(interaction.guild.id);

    const embed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle(t(lang, 'admin.setjail.title'))
      .setDescription(t(lang, 'admin.setjail.desc'))
      .addFields(
        { name: t(lang, 'admin.setjail.field_role'), value: settings.jail_role ? `<@&${settings.jail_role}>` : t(lang, 'admin.setjail.unset'), inline: true },
        { name: t(lang, 'admin.setjail.field_channel'), value: settings.jail_channel ? `<#${settings.jail_channel}>` : t(lang, 'admin.setjail.unset'), inline: true }
      )
      .setFooter({ text: t(lang, 'admin.setjail.footer') })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};
