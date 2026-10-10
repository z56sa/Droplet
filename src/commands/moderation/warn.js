const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ms = require('ms');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'warn',
  description: 'إدارة تحذيرات الأعضاء وعرض سجل المخالفات مع عقوبات تلقائية',
  aliases: ['تحذير', 'warnings', 'تحذيرات', 'delwarn', 'حذف_تحذير'],
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Manage member warnings')

    .addSubcommand(sub => sub.setName('add').setDescription('Add a warning to a member')
      .addUserOption(opt => opt.setName('target').setDescription('The member').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Warning reason').setRequired(true)))
    .addSubcommand(sub => sub.setName('list').setDescription('Show a member warning history')
      .addUserOption(opt => opt.setName('target').setDescription('The member').setRequired(true)))
    .addSubcommand(sub => sub.setName('remove').setDescription('Delete a warning by ID number')
      .addUserOption(opt => opt.setName('target').setDescription('The member').setRequired(true))
      .addIntegerOption(opt => opt.setName('warn_id').setDescription('Warning number').setRequired(true).setMinValue(1)))
    .addSubcommand(sub => sub.setName('clear').setDescription('Clear all warnings of a member')
      .addUserOption(opt => opt.setName('target').setDescription('The member').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild?.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return interaction.reply({ content: t(lang, 'moderation.warn.no_perm'), flags: 64 });

    const sub = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('target');

    if (sub === 'add') {
      await interaction.deferReply().catch(() => {});
      const reason = interaction.options.getString('reason');
      const count = db.addWarning(interaction.guild.id, targetUser.id, interaction.user.id, reason);

      if (db.recordStaffAction) {
        db.recordStaffAction(interaction.guild.id, interaction.user.id, 'warn', targetUser.id, reason, `تحذير رقم ${count}`);
      }

      // DM للعضو
      const dmEmbed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle(t(lang, 'moderation.warn.dm_title', { guild: interaction.guild.name }))
        .addFields(
          { name: t(lang, 'moderation.warn.field_reason'), value: reason },
          { name: t(lang, 'moderation.warn.field_total'), value: `${count}` },
          { name: t(lang, 'moderation.warn.field_mod'), value: interaction.user.tag }
        )
        .setTimestamp();
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (member) await member.send({ embeds: [dmEmbed] }).catch(() => {});

      // عقوبات متدرجة تلقائياً (Advanced Escalation Sanctions)
      let autoPunishment = '';
      if (member) {
        const baseUrl = process.env.DASHBOARD_URL || config.dashboardUrl || 'https://zeno-dashboard.onrender.com';
        const appealUrl = `${baseUrl}/appeal`;

        if (count >= 6) {
          await member.send({
            content: t(lang, 'moderation.warn.auto_ban_dm', { guild: interaction.guild.name, count, appealUrl })
          }).catch(() => {});
          await interaction.guild.bans.create(targetUser.id, { reason: t(lang, 'moderation.warn.auto_ban_audit', { count }) }).catch(() => {});
          autoPunishment = t(lang, 'moderation.warn.auto_ban', { appealUrl });
        } else if (count >= 4) {
          await member.send({
            content: t(lang, 'moderation.warn.auto_kick_dm', { guild: interaction.guild.name, count })
          }).catch(() => {});
          await member.kick(t(lang, 'moderation.warn.auto_kick_audit', { count })).catch(() => {});
          autoPunishment = t(lang, 'moderation.warn.auto_kick');
        } else if (count >= 3) {
          await member.timeout(30 * 60 * 1000, t(lang, 'moderation.warn.auto_mute_audit_3')).catch(() => {});
          autoPunishment = t(lang, 'moderation.warn.auto_mute_30');
        } else if (count >= 2) {
          await member.timeout(5 * 60 * 1000, t(lang, 'moderation.warn.auto_mute_audit_2')).catch(() => {});
          autoPunishment = t(lang, 'moderation.warn.auto_mute_5');
        }
      }

      const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle(t(lang, 'moderation.warn.title_add'))
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: t(lang, 'moderation.warn.field_member'), value: `${targetUser.tag}`, inline: true },
          { name: t(lang, 'moderation.warn.field_mod'), value: interaction.user.tag, inline: true },
          { name: t(lang, 'moderation.warn.field_count'), value: `\`${count}\``, inline: true },
          { name: t(lang, 'moderation.warn.field_reason'), value: reason }
        )
        .setTimestamp();

      if (autoPunishment) embed.addFields({ name: t(lang, 'moderation.warn.field_auto'), value: autoPunishment });

      await interaction.editReply({ embeds: [embed] });
      this.sendToLog(interaction.guild, embed);

    } else if (sub === 'list') {
      const warns = db.getWarnings(interaction.guild.id, targetUser.id);
      if (!warns.length)
        return interaction.reply({ content: t(lang, 'moderation.warn.list_empty', { tag: targetUser.tag }), flags: 64 });

      const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle(t(lang, 'moderation.warn.list_title', { tag: targetUser.tag }))
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setDescription(
          warns.map((w, i) =>
            t(lang, 'moderation.warn.list_row', {
              i: i + 1, id: w.id, mod: w.moderator_id,
              ts: Math.floor((w.created_at || Date.now()) / 1000),
              reason: w.reason || t(lang, 'moderation.warn.list_no_reason')
            })
          ).join('\n\n')
        )
        .setFooter({ text: t(lang, 'moderation.warn.list_footer', { count: warns.length }) })
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });

    } else if (sub === 'remove') {
      const warnId = interaction.options.getInteger('warn_id');
      const warns = db.getWarnings(interaction.guild.id, targetUser.id);
      if (!warns[warnId - 1]) return interaction.reply({ content: t(lang, 'moderation.warn.remove_not_found', { id: warnId }), flags: 64 });
      db.db.prepare('DELETE FROM warnings WHERE id = ?').run(warns[warnId - 1].id);
      await interaction.reply({ content: t(lang, 'moderation.warn.removed', { id: warnId, tag: targetUser.tag }) });

    } else if (sub === 'clear') {
      db.clearWarnings(interaction.guild.id, targetUser.id);
      await interaction.reply({ content: t(lang, 'moderation.warn.cleared', { tag: targetUser.tag }) });
    }
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild?.id);
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply(t(lang, 'moderation.warn.no_perm'));

    const invoked = (message.content.trim().slice(1).split(/\s+/)[0] || '').toLowerCase();

    // 1. أمر عرض التحذيرات المباشر #warnings @user
    if (invoked === 'warnings' || invoked === 'تحذيرات') {
      const target = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null) || message.author;
      const warns = db.getWarnings(message.guild.id, target.id);
      if (!warns.length) return message.reply(t(lang, 'moderation.warn.prefix_warnings_empty', { tag: target.tag }));
      const embed = new EmbedBuilder().setColor('#f39c12').setTitle(t(lang, 'moderation.warn.prefix_warnings_title', { tag: target.tag }))
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .setDescription(warns.map((w, i) => t(lang, 'moderation.warn.prefix_warnings_row', {
          i: i + 1, id: w.id, mod: w.moderator_id, reason: w.reason || t(lang, 'moderation.warn.list_no_reason')
        })).join('\n\n'))
        .setFooter({ text: t(lang, 'moderation.warn.prefix_warnings_footer', { count: warns.length }) });
      return message.reply({ embeds: [embed] });
    }

    // 2. أمر حذف تحذير مباشر #delwarn @user [رقم_التحذير]
    if (invoked === 'delwarn' || invoked === 'حذف_تحذير') {
      const target = message.mentions.users.first();
      const num = parseInt(args[1]);
      if (!target || isNaN(num)) return message.reply(t(lang, 'moderation.warn.prefix_delwarn_usage'));
      const warns = db.getWarnings(message.guild.id, target.id);
      if (!warns[num - 1]) return message.reply(t(lang, 'moderation.warn.prefix_delwarn_not_found', { num }));
      db.db.prepare('DELETE FROM warnings WHERE id = ?').run(warns[num - 1].id);
      return message.reply(t(lang, 'moderation.warn.prefix_delwarn_removed', { num, tag: target.tag }));
    }

    const action = args[0]?.toLowerCase();
    const target = message.mentions.users.first();
    if (!target) return message.reply(t(lang, 'moderation.warn.prefix_usage'));

    if (action === 'clear') {
      db.clearWarnings(message.guild.id, target.id);
      return message.reply(t(lang, 'moderation.warn.prefix_cleared', { tag: target.tag }));
    }
    if (action === 'list') {
      const warns = db.getWarnings(message.guild.id, target.id);
      if (!warns.length) return message.reply(t(lang, 'moderation.warn.prefix_warnings_empty', { tag: target.tag }));
      const embed = new EmbedBuilder().setColor('#f39c12').setTitle(t(lang, 'moderation.warn.prefix_list_title', { tag: target.tag }))
        .setDescription(warns.map((w, i) => t(lang, 'moderation.warn.prefix_list_row', { i: i + 1, mod: w.moderator_id, reason: w.reason })).join('\n'));
      return message.reply({ embeds: [embed] });
    }

    const reason = args.slice(1).join(' ') || t(lang, 'moderation.warn.prefix_default_reason');
    const count = db.addWarning(message.guild.id, target.id, message.author.id, reason);
    const member = await message.guild.members.fetch(target.id).catch(() => null);
    if (member) await member.send(t(lang, 'moderation.warn.prefix_dm', { guild: message.guild.name, reason })).catch(() => {});
    const embed = new EmbedBuilder().setColor('#f39c12').setTitle(t(lang, 'moderation.warn.title_add'))
      .addFields(
        { name: t(lang, 'moderation.warn.field_member'), value: target.tag, inline: true },
        { name: t(lang, 'moderation.warn.field_count'), value: `${count}`, inline: true },
        { name: t(lang, 'moderation.warn.field_reason'), value: reason }
      ).setTimestamp();
    await message.reply({ embeds: [embed] });
    this.sendToLog(message.guild, embed);
  },

  sendToLog(guild, embed) {
    const settings = db.getGuildSettings(guild.id);
    if (settings?.log_channel) {
      const ch = guild.channels.cache.get(settings.log_channel);
      if (ch) ch.send({ embeds: [embed] }).catch(() => {});
    }
  }
};
