// ========================================================
// FILE: src/commands/general/invites.js
// أوامر نظام تتبع الدعوات المتقدم (Advanced Invite Tracker & Rewards)
// ========================================================
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { t } = require('../../utils/lang');
const inviteTracker = require('../../utils/inviteTracker');

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
  description: 'عرض إحصائيات الدعوات وتتبع الأعضاء ولوحة المتصدرين ومكافآت الرتب',
  aliases: ['دعوات', 'دعواتي', 'invites-lb', 'top-invites'],
  category: 'general',
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Advanced Invite Tracker commands')
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
      sub.setName('rewards')
        .setDescription('Show all invite role rewards configured in the server')
    )
    .addSubcommand(sub =>
      sub.setName('sync')
        .setDescription('Sync and apply unlocked invite role rewards')
        .addUserOption(opt => opt.setName('user').setDescription('Target member (leave empty for yourself)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('reward-add')
        .setDescription('Add an automatic role reward for reaching an invite count (Admins only)')
        .addRoleOption(opt => opt.setName('role').setDescription('Reward role to give').setRequired(true))
        .addIntegerOption(opt => opt.setName('invites').setDescription('Required invites count').setMinValue(1).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('reward-remove')
        .setDescription('Remove an invite role reward (Admins only)')
        .addRoleOption(opt => opt.setName('role').setDescription('Role to remove from rewards').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add or deduct bonus invites for a member (Admins only)')
        .addUserOption(opt => opt.setName('user').setDescription('Target member').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Invite count (use negative to deduct)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('reset')
        .setDescription('Reset invite stats for a member or the whole server (Admins only)')
        .addUserOption(opt => opt.setName('user').setDescription('Member to reset (leave empty for the whole server)').setRequired(false))
    ),

  async execute(interaction, client) {
    const gid = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'show') {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const stats = db.getInvites(gid, targetUser.id);
      const inviterRecord = db.getMemberInviter(gid, targetUser.id);
      const inviterText = inviterRecord?.inviter_id
        ? `<@${inviterRecord.inviter_id}>`
        : (inviterRecord?.code ? t(gid, 'general.invites.inviter_link', { code: inviterRecord.code }) : t(gid, 'general.invites.inviter_unknown'));

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary || '#9333ea')
        .setTitle(`📊 إحصائيات دعوات: ${targetUser.username}`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .setDescription(`الصافي الإجمالي للدعوات المحتسبة: **${stats.total}** دعوة 🌟`)
        .addFields(
          { name: '🟢 عادية (Regular)', value: `\`${stats.regular}\``, inline: true },
          { name: '🔴 غادروا (Leaves)', value: `\`${stats.leaves}\``, inline: true },
          { name: '⚠️ وهمية (Fake)', value: `\`${stats.fake}\``, inline: true },
          { name: '🎁 إضافية (Bonus)', value: `\`${stats.bonus}\``, inline: true },
          { name: '🌟 صافي النقاط', value: `**${stats.total}**`, inline: true },
          { name: '🔗 تمت دعوته بواسطة', value: inviterText, inline: true }
        )
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });

    } else if (sub === 'leaderboard') {
      const topList = db.getInvitesLeaderboard(gid, 10);
      if (!topList || topList.length === 0) {
        return interaction.reply({ content: t(gid, 'general.invites.lb_empty') });
      }

      const rows = buildLeaderboardRows(topList, gid);

      const embed = new EmbedBuilder()
        .setColor('#eab308')
        .setTitle(t(gid, 'general.invites.lb_title', { guild: interaction.guild.name }))
        .setDescription(rows)
        .setFooter({ text: 'Droplet Advanced Invite Tracker' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });

    } else if (sub === 'rewards') {
      const rewards = db.getInviteRewards(gid);
      if (!rewards || rewards.length === 0) {
        return interaction.reply({
          content: 'ℹ️ لم يتم تعيين أي مكافآت رتب للدعوات في هذا السيرفر بعد.\nيمكن للمشرفين إضافتها عبر: `/invites reward-add`'
        });
      }

      const listStr = rewards
        .map(r => `• الوصول إلى **${r.required_invites}** دعوة ➔ <@&${r.role_id}>`)
        .join('\n');

      const embed = new EmbedBuilder()
        .setColor('#9333ea')
        .setTitle(`🎁 مكافآت رتب الدعوات في ${interaction.guild.name}`)
        .setDescription(listStr)
        .setFooter({ text: 'Droplet Invite Rewards • تُمنح الرتب تلقائياً عند تحقيق الهدف' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });

    } else if (sub === 'sync') {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      await inviteTracker.syncMemberRewards(interaction.guild, targetUser.id);
      return interaction.reply({
        content: `✅ تمت مزامنة وفحص رتب الدعوات المستحقة لـ <@${targetUser.id}> بنجاح!`
      });

    } else if (sub === 'reward-add') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: t(gid, 'general.invites.add_no_perm'), flags: 64 });
      }

      const role = interaction.options.getRole('role');
      const requiredInvites = interaction.options.getInteger('invites');

      db.addInviteReward(gid, role.id, requiredInvites);
      return interaction.reply({
        content: `✅ تم تعيين مكافأة دعوات جديدة بنجاح: سيحصل العضو على رتبة **${role.name}** (<@&${role.id}>) عند وصوله إلى **${requiredInvites}** دعوة!`
      });

    } else if (sub === 'reward-remove') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: t(gid, 'general.invites.add_no_perm'), flags: 64 });
      }

      const role = interaction.options.getRole('role');
      db.deleteInviteReward(gid, role.id);
      return interaction.reply({
        content: `🗑️ تم حذف رتبة المكافأة **${role.name}** من نظام مكافآت الدعوات.`
      });

    } else if (sub === 'add') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: t(gid, 'general.invites.add_no_perm'), flags: 64 });
      }

      const targetUser = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');

      const updated = db.addBonusInvites(gid, targetUser.id, amount);
      const actionText = amount >= 0 ? `إضافة **+${amount}** دعوة` : `خصم **${amount}** دعوة`;

      // مزامنة الرتب إن زادت الدعوات
      inviteTracker.syncMemberRewards(interaction.guild, targetUser.id).catch(() => {});

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#10b981')
            .setDescription(`✅ تم ${actionText} لـ <@${targetUser.id}> بنجاح!\nأصبح صافي دعواته الآن: **${updated.total}** دعوة.`)
        ]
      });

    } else if (sub === 'reset') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: t(gid, 'general.invites.reset_no_perm'), flags: 64 });
      }

      const targetUser = interaction.options.getUser('user');
      if (targetUser) {
        db.resetInvites(gid, targetUser.id);
        return interaction.reply({ content: `✅ تم تصفير سجل ودعوات العضو <@${targetUser.id}> بالكامل.` });
      } else {
        db.resetInvites(gid);
        return interaction.reply({ content: '⚠️ تم تصفير إحصائيات وسجلات دعوات السيرفر بالكامل بنجاح!' });
      }
    }
  },

  async executePrefix(message, args) {
    const gid = message.guild.id;
    const cmd = args[0]?.toLowerCase();

    if (cmd === 'lb' || cmd === 'top' || message.content.includes('top-invites') || message.content.includes('invites-lb')) {
      const topList = db.getInvitesLeaderboard(gid, 10);
      if (!topList || topList.length === 0) return message.reply(t(gid, 'general.invites.prefix_lb_empty'));

      const rows = buildLeaderboardRows(topList, gid);

      const embed = new EmbedBuilder()
        .setColor('#eab308')
        .setTitle(t(gid, 'general.invites.prefix_lb_title', { guild: message.guild.name }))
        .setDescription(rows)
        .setFooter({ text: 'Droplet Advanced Invite Tracker' })
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    if (cmd === 'rewards') {
      const rewards = db.getInviteRewards(gid);
      if (!rewards || rewards.length === 0) return message.reply('ℹ️ لا توجد رتب مكافآت دعوات مضافة بعد في هذا السيرفر.');
      const listStr = rewards.map(r => `• الوصول إلى **${r.required_invites}** دعوة ➔ <@&${r.role_id}>`).join('\n');
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#9333ea')
            .setTitle(`🎁 مكافآت رتب الدعوات`)
            .setDescription(listStr)
        ]
      });
    }

    if (cmd === 'reward-add') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return message.reply('❌ ليس لديك صلاحية إدارة السيرفر.');
      const role = message.mentions.roles.first() || (args[1] ? message.guild.roles.cache.get(args[1]) : null);
      const req = parseInt(args[2]);
      if (!role || isNaN(req)) return message.reply('❌ الاستخدام: `#invites reward-add @role <عدد_الدعوات>`');
      db.addInviteReward(gid, role.id, req);
      return message.reply(`✅ تم تعيين مكافأة: سيحصل العضو على **${role.name}** عند الوصول إلى **${req}** دعوة!`);
    }

    if (cmd === 'reward-remove') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return message.reply('❌ ليس لديك صلاحية إدارة السيرفر.');
      const role = message.mentions.roles.first() || (args[1] ? message.guild.roles.cache.get(args[1]) : null);
      if (!role) return message.reply('❌ الاستخدام: `#invites reward-remove @role`');
      db.deleteInviteReward(gid, role.id);
      return message.reply(`🗑️ تم حذف رتبة المكافأة **${role.name}**.`);
    }

    if (cmd === 'sync') {
      const targetUser = message.mentions.users.first() || message.author;
      await inviteTracker.syncMemberRewards(message.guild, targetUser.id);
      return message.reply(`✅ تمت مزامنة رتب الدعوات لـ <@${targetUser.id}>.`);
    }

    if (cmd === 'add') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return message.reply(t(gid, 'general.invites.prefix_add_no_perm'));
      const user = message.mentions.users.first();
      const amount = parseInt(args[2], 10);
      if (!user || isNaN(amount)) return message.reply(t(gid, 'general.invites.prefix_add_usage'));

      const updated = db.addBonusInvites(gid, user.id, amount);
      inviteTracker.syncMemberRewards(message.guild, user.id).catch(() => {});
      return message.reply(t(gid, 'general.invites.prefix_add_done', { user: `${user}`, amount, total: updated.total }));
    }

    // Default: Show stats
    const targetUser = message.mentions.users.first() || message.author;
    const stats = db.getInvites(gid, targetUser.id);
    const inviterRecord = db.getMemberInviter(gid, targetUser.id);
    const inviterText = inviterRecord?.inviter_id
      ? `<@${inviterRecord.inviter_id}>`
      : (inviterRecord?.code ? t(gid, 'general.invites.prefix_inviter_link', { code: inviterRecord.code }) : t(gid, 'general.invites.prefix_inviter_unknown'));

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary || '#9333ea')
      .setTitle(`📊 إحصائيات دعوات: ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setDescription(`الصافي الإجمالي للدعوات: **${stats.total}** دعوة 🌟`)
      .addFields(
        { name: '🟢 عادية', value: `\`${stats.regular}\``, inline: true },
        { name: '🔴 غادروا', value: `\`${stats.leaves}\``, inline: true },
        { name: '⚠️ وهمية', value: `\`${stats.fake}\``, inline: true },
        { name: '🎁 إضافية', value: `\`${stats.bonus}\``, inline: true },
        { name: '🌟 صافي النقاط', value: `**${stats.total}**`, inline: true },
        { name: '🔗 دُعي بواسطة', value: inviterText, inline: true }
      )
      .setFooter({ text: 'الاستخدام: #invites | #invites lb | #invites rewards | #invites add @user <عدد>' })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
};
