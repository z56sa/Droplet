const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'role',
  description: 'إدارة أدوار الأعضاء مع دعم الأدوار المؤقتة',
  aliases: ['دور'],
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Manage member roles')

    .addSubcommand(sub => sub.setName('add').setDescription('Add a role to a member')
      .addUserOption(opt => opt.setName('target').setDescription('The member').setRequired(true))
      .addRoleOption(opt => opt.setName('role').setDescription('The role').setRequired(true)))
    .addSubcommand(sub => sub.setName('remove').setDescription('Remove a role from a member')
      .addUserOption(opt => opt.setName('target').setDescription('The member').setRequired(true))
      .addRoleOption(opt => opt.setName('role').setDescription('The role').setRequired(true)))
    .addSubcommand(sub => sub.setName('temp').setDescription('Add a temporary role')
      .addUserOption(opt => opt.setName('target').setDescription('The member').setRequired(true))
      .addRoleOption(opt => opt.setName('role').setDescription('The role').setRequired(true))
      .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 1h, 1d, 7d)').setRequired(true)))
    .addSubcommand(sub => sub.setName('info').setDescription('Show role info')
      .addRoleOption(opt => opt.setName('role').setDescription('The role').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild?.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return interaction.reply({ content: t(lang, 'moderation.role.no_perm'), flags: 64 });

    await interaction.deferReply().catch(() => {});
    const sub = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('target');
    const role = interaction.options.getRole('role');

    if (sub === 'add' || sub === 'remove') {
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) return interaction.editReply({ content: t(lang, 'moderation.role.not_found') });
      if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles))
        return interaction.editReply({ content: t(lang, 'moderation.role.higher') });
      if (role.position >= interaction.guild.members.me.roles.highest.position)
        return interaction.editReply({ content: t(lang, 'moderation.role.higher') });

      if (sub === 'add') {
        try { await member.roles.add(role); }
        catch { return interaction.editReply({ content: t(lang, 'moderation.role.higher') }); }
        const embed = new EmbedBuilder().setColor(config.colors?.success || '#2ecc71')
          .setTitle(t(lang, 'moderation.role.title_add'))
          .addFields(
            { name: t(lang, 'moderation.role.field_member'), value: `${targetUser.tag}`, inline: true },
            { name: t(lang, 'moderation.role.field_role'), value: `<@&${role.id}>`, inline: true },
            { name: t(lang, 'moderation.role.field_by'), value: interaction.user.tag, inline: true }
          ).setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      } else {
        try { await member.roles.remove(role); }
        catch { return interaction.editReply({ content: t(lang, 'moderation.role.higher') }); }
        const embed = new EmbedBuilder().setColor(config.colors?.danger || '#e74c3c')
          .setTitle(t(lang, 'moderation.role.title_remove'))
          .addFields(
            { name: t(lang, 'moderation.role.field_member'), value: `${targetUser.tag}`, inline: true },
            { name: t(lang, 'moderation.role.field_role'), value: `<@&${role.id}>`, inline: true },
            { name: t(lang, 'moderation.role.field_by'), value: interaction.user.tag, inline: true }
          ).setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      }

    } else if (sub === 'temp') {
      const ms = require('ms');
      const durationStr = interaction.options.getString('duration');
      const durationMs = ms(durationStr);
      if (!durationMs) return interaction.editReply({ content: t(lang, 'moderation.role.bad_duration') });

      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) return interaction.editReply({ content: t(lang, 'moderation.role.not_found') });

      try { await member.roles.add(role); }
      catch { return interaction.editReply({ content: t(lang, 'moderation.role.higher') }); }
      const embed = new EmbedBuilder().setColor('#9b59b6')
        .setTitle(t(lang, 'moderation.role.title_temp'))
        .addFields(
          { name: t(lang, 'moderation.role.field_member'), value: `${targetUser.tag}`, inline: true },
          { name: t(lang, 'moderation.role.field_role'), value: `<@&${role.id}>`, inline: true },
          { name: t(lang, 'moderation.role.field_duration'), value: durationStr, inline: true },
          { name: t(lang, 'moderation.role.field_by'), value: interaction.user.tag, inline: true }
        ).setTimestamp();
      await interaction.editReply({ embeds: [embed] });

      // إزالة الدور بعد المدة
      const guildId = interaction.guild.id;
      const roleId = role.id;
      const tag = targetUser.tag;
      setTimeout(async () => {
        await member.roles.remove(role).catch(() => {});
        const logEmbed = new EmbedBuilder().setColor('#e74c3c')
          .setTitle(t(guildId, 'moderation.role.title_expired'))
          .setDescription(t(guildId, 'moderation.role.desc_expired', { role: roleId, tag }))
          .setTimestamp();
        const s = db.getGuildSettings(interaction.guild.id);
        if (s?.log_channel) {
          const ch = interaction.guild.channels.cache.get(s.log_channel);
          if (ch) ch.send({ embeds: [logEmbed] }).catch(() => {});
        }
      }, durationMs);

    } else if (sub === 'info') {
      const embed = new EmbedBuilder().setColor(role.color || 0x5865F2)
        .setTitle(t(lang, 'moderation.role.info_title', { name: role.name }))
        .addFields(
          { name: t(lang, 'moderation.role.field_id'), value: `\`${role.id}\``, inline: true },
          { name: t(lang, 'moderation.role.field_color'), value: role.hexColor, inline: true },
          { name: t(lang, 'moderation.role.field_position'), value: `${role.position}`, inline: true },
          { name: t(lang, 'moderation.role.field_members'), value: `${role.members.size}`, inline: true },
          { name: t(lang, 'moderation.role.field_mentionable'), value: role.mentionable ? t(lang, 'moderation.role.yes') : t(lang, 'moderation.role.no'), inline: true },
          { name: t(lang, 'moderation.role.field_hoist'), value: role.hoist ? t(lang, 'moderation.role.yes') : t(lang, 'moderation.role.no'), inline: true }
        ).setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    }
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild?.id);
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply(t(lang, 'moderation.role.prefix_no_perm'));
    const action = args[0]?.toLowerCase();
    const target = message.mentions.members.first();
    const role = message.mentions.roles.first();
    if (!target || !role) return message.reply(t(lang, 'moderation.role.prefix_usage'));
    if (action === 'add') {
      try { await target.roles.add(role); }
      catch { return message.reply(t(lang, 'moderation.role.higher')); }
      message.reply(t(lang, 'moderation.role.prefix_added', { role: role.id, tag: target.user.tag }));
    } else if (action === 'remove') {
      try { await target.roles.remove(role); }
      catch { return message.reply(t(lang, 'moderation.role.higher')); }
      message.reply(t(lang, 'moderation.role.prefix_removed', { role: role.id, tag: target.user.tag }));
    } else {
      message.reply(t(lang, 'moderation.role.prefix_usage_full'));
    }
  }
};
