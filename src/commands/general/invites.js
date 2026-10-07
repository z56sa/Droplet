// ========================================================
// FILE: src/commands/general/invites.js
// أوامر نظام تتبع الدعوات (Invite Tracker, Bonus Invites & Leaderboard)
// ========================================================
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { t } = require('../../utils/lang');

function buildLeaderboardRows(list, langOrGuildId) {
  return list.map((item, index) => {
    const medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : `\`#${index + 1}\``));
    return t(langOrGuildId, 'general.invites.lb_row', {
      medal, user: `<@${item.user_id}>`, total: item.total,
      regular: item.regular, leaves: item.leaves, bonus: item.bonus
    });
  }).join('\n');
}

module.exports = {
  name: 'invites',
  description: 'عرض إحصائيات الدعوات وتتبع الأعضاء أو لوحة المتصدرين',
  aliases: ['دعوات', 'دعواتي', 'invites-lb', 'top-invites'],
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Invite tracker system commands')
    .addSubcommand(sub =>
      sub.setName('show')
        .setDescription('Show your invites or another member\'s invites')
        .addUserOption(opt => opt.setName('user').setDescription('The member to check').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('leaderboard')
        .setDescription('Show the server invite leaderboard')
    )
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add or deduct bonus invites for a member (server management only)')
        .addUserOption(opt => opt.setName('user').setDescription('Target member').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Invite count (use a negative number to deduct)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('reset')
        .setDescription('Reset invite stats for a member or the whole server')
        .addUserOption(opt => opt.setName('user').setDescription('Member to reset (leave empty for the whole server)').setRequired(false))
    ),

  async execute(interaction, client) {
    const gid = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'show') {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const stats = db.getInvites(interaction.guild.id, targetUser.id);
      const inviterRecord = db.getMemberInviter(interaction.guild.id, targetUser.id);
      const inviterText = inviterRecord?.inviter_id ? `<@${inviterRecord.inviter_id}>` : (inviterRecord?.code ? t(gid, 'general.invites.inviter_link', { code: inviterRecord.code }) : t(gid, 'general.invites.inviter_unknown'));

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary || '#9333ea')
        .setTitle(t(gid, 'general.invites.show_title', { user: targetUser.username }))
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .setDescription(t(gid, 'general.invites.show_desc', { total: stats.total }))
        .addFields(
          { name: t(gid, 'general.invites.field_regular'), value: `\`${stats.regular}\``, inline: true },
          { name: t(gid, 'general.invites.field_leaves'), value: `\`${stats.leaves}\``, inline: true },
          { name: t(gid, 'general.invites.field_fake'), value: `\`${stats.fake}\``, inline: true },
          { name: t(gid, 'general.invites.field_bonus'), value: `\`${stats.bonus}\``, inline: true },
          { name: t(gid, 'general.invites.field_net'), value: `**${stats.total}**`, inline: true },
          { name: t(gid, 'general.invites.field_invited_by'), value: inviterText, inline: true }
        )
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });

    } else if (sub === 'leaderboard') {
      const topList = db.getInvitesLeaderboard(interaction.guild.id, 10);
      if (!topList || topList.length === 0) {
        return interaction.reply({ content: t(gid, 'general.invites.lb_empty') });
      }

      const rows = buildLeaderboardRows(topList, gid);

      const embed = new EmbedBuilder()
        .setColor('#eab308')
        .setTitle(t(gid, 'general.invites.lb_title', { guild: interaction.guild.name }))
        .setDescription(rows)
        .setFooter({ text: 'Droplet Invite Tracker' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });

    } else if (sub === 'add') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: t(gid, 'general.invites.add_no_perm'), flags: 64 });
      }

      const targetUser = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');

      const updated = db.addBonusInvites(interaction.guild.id, targetUser.id, amount);
      const actionText = amount >= 0 ? t(gid, 'general.invites.action_add', { amount }) : t(gid, 'general.invites.action_remove', { amount });

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#10b981')
            .setDescription(t(gid, 'general.invites.add_done', { action: actionText, user: `${targetUser}`, total: updated.total }))
        ]
      });

    } else if (sub === 'reset') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: t(gid, 'general.invites.reset_no_perm'), flags: 64 });
      }

      const targetUser = interaction.options.getUser('user');
      if (targetUser) {
        db.resetInvites(interaction.guild.id, targetUser.id);
        return interaction.reply({ content: t(gid, 'general.invites.reset_user_done', { user: `${targetUser}` }) });
      } else {
        db.resetInvites(interaction.guild.id);
        return interaction.reply({ content: t(gid, 'general.invites.reset_all_done') });
      }
    }
  },

  async executePrefix(message, args) {
    const gid = message.guild.id;
    const cmd = args[0]?.toLowerCase();

    if (cmd === 'lb' || cmd === 'top' || message.content.includes('top-invites') || message.content.includes('invites-lb')) {
      const topList = db.getInvitesLeaderboard(message.guild.id, 10);
      if (!topList || topList.length === 0) return message.reply(t(gid, 'general.invites.prefix_lb_empty'));

      const rows = buildLeaderboardRows(topList, gid);

      const embed = new EmbedBuilder()
        .setColor('#eab308')
        .setTitle(t(gid, 'general.invites.prefix_lb_title', { guild: message.guild.name }))
        .setDescription(rows)
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    if (cmd === 'add') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return message.reply(t(gid, 'general.invites.prefix_add_no_perm'));
      const user = message.mentions.users.first();
      const amount = parseInt(args[2], 10);
      if (!user || isNaN(amount)) return message.reply(t(gid, 'general.invites.prefix_add_usage'));

      const updated = db.addBonusInvites(message.guild.id, user.id, amount);
      return message.reply(t(gid, 'general.invites.prefix_add_done', { user: `${user}`, amount, total: updated.total }));
    }

    // Default: Show stats
    const targetUser = message.mentions.users.first() || message.author;
    const stats = db.getInvites(message.guild.id, targetUser.id);
    const inviterRecord = db.getMemberInviter(message.guild.id, targetUser.id);
    const inviterText = inviterRecord?.inviter_id ? `<@${inviterRecord.inviter_id}>` : (inviterRecord?.code ? t(gid, 'general.invites.prefix_inviter_link', { code: inviterRecord.code }) : t(gid, 'general.invites.prefix_inviter_unknown'));

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary || '#9333ea')
      .setTitle(t(gid, 'general.invites.prefix_show_title', { user: targetUser.username }))
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setDescription(t(gid, 'general.invites.prefix_show_desc', { total: stats.total }))
      .addFields(
        { name: t(gid, 'general.invites.prefix_field_regular'), value: `\`${stats.regular}\``, inline: true },
        { name: t(gid, 'general.invites.prefix_field_leaves'), value: `\`${stats.leaves}\``, inline: true },
        { name: t(gid, 'general.invites.prefix_field_fake'), value: `\`${stats.fake}\``, inline: true },
        { name: t(gid, 'general.invites.prefix_field_bonus'), value: `\`${stats.bonus}\``, inline: true },
        { name: t(gid, 'general.invites.prefix_field_net'), value: `**${stats.total}**`, inline: true },
        { name: t(gid, 'general.invites.prefix_field_inviter'), value: inviterText, inline: true }
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
};
