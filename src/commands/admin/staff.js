const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'staff',
  description: 'عرض إحصائيات نشاط طاقم الإدارة، الترتيب، والإنجازات',
  aliases: ['ستاف', 'ادارة', 'نشاط_الادارة'],
  data: new SlashCommandBuilder()
    .setName('staff')
    .setDescription('Track staff activity (Staff Activity)')

    .addSubcommand(sub =>
      sub.setName('stats')
        .setDescription('Show your or a staff member stats')

        .addUserOption(opt => opt.setName('user').setDescription('The staff member to check').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('leaderboard')
        .setDescription('Show the most active staff leaderboard')

    )
    .addSubcommand(sub =>
      sub.setName('logs')
        .setDescription('Show recent staff actions (Action Logs)')

        .addIntegerOption(opt => opt.setName('limit').setDescription('Number of actions shown (1-20)').setMinValue(1).setMaxValue(20).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('goals')
        .setDescription('Show staff goals and achievements')

    )
    .addSubcommand(sub =>
      sub.setName('reset')
        .setDescription('Reset staff stats (server owner only)')

        .addUserOption(opt => opt.setName('user').setDescription('The member to reset (leave empty to reset all)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('rank-set')
        .setDescription('Set a Discord role as auto-promotion at a point total')

        .addRoleOption(opt => opt.setName('role').setDescription('The Discord role granted on promotion').setRequired(true))
        .addIntegerOption(opt => opt.setName('points').setDescription('Points required for promotion').setMinValue(1).setRequired(true))
        .addStringOption(opt => opt.setName('name').setDescription('Rank name (optional)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('rank-list')
        .setDescription('Show the configured auto-promotion ranks')

    )
    .addSubcommand(sub =>
      sub.setName('rank-remove')
        .setDescription('Remove a role from auto-promotion')

        .addRoleOption(opt => opt.setName('role').setDescription('The role to remove from promotion').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('points')
        .setDescription('Manually grant bonus points to a staff member')

        .addUserOption(opt => opt.setName('user').setDescription('The staff member to grant points').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Points to grant').setMinValue(1).setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for granting points').setRequired(false))
    ),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'stats') {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const staff = db.getStaffMember(guildId, targetUser.id);
      const score = (staff.tickets_closed * 25) + (staff.mod_actions * 10) + (staff.messages_count * 1) + Math.floor((staff.voice_seconds / 300) * 1);
      const voiceHours = (staff.voice_seconds / 3600).toFixed(1);

      // حساب الترتيب في الليدربورد
      const leaderboard = db.getStaffLeaderboard(guildId, 100);
      const rankIndex = leaderboard.findIndex(s => s.user_id === targetUser.id);
      const rankStr = rankIndex !== -1 ? `#${rankIndex + 1}` : t(lang, 'admin.staff.unranked');

      // فحص الإنجازات (Achievements)
      const achievements = [];
      if (staff.tickets_closed >= 100) achievements.push(t(lang, 'admin.staff.ach_tickets100'));
      else if (staff.tickets_closed >= 25) achievements.push(t(lang, 'admin.staff.ach_tickets25'));
      if (staff.mod_actions >= 50) achievements.push(t(lang, 'admin.staff.ach_mod50'));
      if (staff.streak_days >= 7) achievements.push(t(lang, 'admin.staff.ach_streak7'));
      if (voiceHours >= 10) achievements.push(t(lang, 'admin.staff.ach_voice10'));
      if (achievements.length === 0) achievements.push(t(lang, 'admin.staff.ach_new'));

      const embed = new EmbedBuilder()
        .setColor(config.colors?.primary || '#7c3aed')
        .setTitle(t(lang, 'admin.staff.stats_title', { user: targetUser.username }))
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setDescription(t(lang, 'admin.staff.stats_desc', { score, rank: rankStr }))
        .addFields(
          { name: t(lang, 'admin.staff.f_closed'), value: t(lang, 'admin.staff.f_closed_v', { n: staff.tickets_closed }), inline: true },
          { name: t(lang, 'admin.staff.f_mod'), value: t(lang, 'admin.staff.f_mod_v', { n: staff.mod_actions }), inline: true },
          { name: t(lang, 'admin.staff.f_msgs'), value: t(lang, 'admin.staff.f_msgs_v', { n: staff.messages_count.toLocaleString() }), inline: true },
          { name: t(lang, 'admin.staff.f_voice'), value: t(lang, 'admin.staff.f_voice_v', { n: voiceHours }), inline: true },
          { name: t(lang, 'admin.staff.f_streak'), value: t(lang, 'admin.staff.f_streak_v', { n: staff.streak_days }), inline: true },
          { name: t(lang, 'admin.staff.f_points'), value: t(lang, 'admin.staff.f_points_v', { n: staff.points }), inline: true },
          {
            name: t(lang, 'admin.staff.f_punish'),
            value: t(lang, 'admin.staff.f_punish_v', { b: staff.bans_count, k: staff.kicks_count, m: staff.mutes_count, w: staff.warns_count }),
            inline: false
          },
          { name: t(lang, 'admin.staff.f_ach'), value: achievements.join(' • '), inline: false }
        )
        .setFooter({ text: t(lang, 'admin.staff.stats_footer') })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'leaderboard') {
      const list = db.getStaffLeaderboard(guildId, 10);
      if (list.length === 0) {
        return interaction.reply({ content: t(lang, 'admin.staff.lb_empty'), flags: 64 });
      }

      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      const lines = list.map((s, i) => {
        const vHours = (s.voice_seconds / 3600).toFixed(1);
        return t(lang, 'admin.staff.lb_row', {
          medal: medals[i] || '▫️', id: s.user_id, t: s.tickets_closed, m: s.mod_actions,
          c: s.messages_count, v: vHours, s: s.streak_days, score: Math.floor(s.performance_score)
        });
      });

      const embed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle(t(lang, 'admin.staff.lb_title'))
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: t(lang, 'admin.staff.lb_footer') })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'logs') {
      const limit = interaction.options.getInteger('limit') || 10;
      const logs = db.getStaffActionLogs(guildId, limit);
      if (logs.length === 0) {
        return interaction.reply({ content: t(lang, 'admin.staff.logs_empty'), flags: 64 });
      }

      const actionIcons = {
        ticket_close: t(lang, 'admin.staff.act_ticket_close'),
        ban: t(lang, 'admin.staff.act_ban'),
        kick: t(lang, 'admin.staff.act_kick'),
        mute: t(lang, 'admin.staff.act_mute'),
        warn: t(lang, 'admin.staff.act_warn')
      };

      const lines = logs.map(l => {
        const timeAgo = `<t:${l.created_at}:R>`;
        const target = l.target_id ? `<@${l.target_id}>` : t(lang, 'admin.staff.log_target_unknown');
        const typeStr = actionIcons[l.action_type] || l.action_type;
        return t(lang, 'admin.staff.log_row', {
          type: typeStr, staff: l.staff_id, target, time: timeAgo,
          reason: l.reason || t(lang, 'admin.staff.log_no_reason'),
          details: l.details ? t(lang, 'admin.staff.log_details', { details: l.details }) : ''
        });
      });

      const embed = new EmbedBuilder()
        .setColor(config.colors?.info || '#3b82f6')
        .setTitle(t(lang, 'admin.staff.logs_title'))
        .setDescription(lines.join('\n\n'))
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'goals') {
      const goals = db.getStaffGoals(guildId);
      const defaultGoals = [
        { title: t(lang, 'admin.staff.goal1'), type: t(lang, 'admin.staff.goal1_type'), target: t(lang, 'admin.staff.goal1_target'), reward: t(lang, 'admin.staff.goal1_reward') },
        { title: t(lang, 'admin.staff.goal2'), type: t(lang, 'admin.staff.goal2_type'), target: t(lang, 'admin.staff.goal2_target'), reward: t(lang, 'admin.staff.goal2_reward') },
        { title: t(lang, 'admin.staff.goal3'), type: t(lang, 'admin.staff.goal3_type'), target: t(lang, 'admin.staff.goal3_target'), reward: t(lang, 'admin.staff.goal3_reward') },
        { title: t(lang, 'admin.staff.goal4'), type: t(lang, 'admin.staff.goal4_type'), target: t(lang, 'admin.staff.goal4_target'), reward: t(lang, 'admin.staff.goal4_reward') }
      ];

      const fields = defaultGoals.map(g => ({
        name: `🎯 ${g.title}`,
        value: t(lang, 'admin.staff.goal_field', { type: g.type, target: g.target, reward: g.reward }),
        inline: false
      }));

      const embed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle(t(lang, 'admin.staff.goals_title'))
        .setDescription(t(lang, 'admin.staff.goals_desc'))
        .addFields(fields)
        .setFooter({ text: t(lang, 'admin.staff.goals_footer') })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'reset') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: t(lang, 'admin.staff.reset_admin_only'), flags: 64 });
      }

      const targetUser = interaction.options.getUser('user');
      if (targetUser) {
        db.resetStaffStats(guildId, targetUser.id);
        return interaction.reply({ content: t(lang, 'admin.staff.reset_user', { id: targetUser.id }) });
      } else {
        db.resetStaffStats(guildId);
        return interaction.reply({ content: t(lang, 'admin.staff.reset_all') });
      }
    }

    // ─── Rank Set ───
    if (sub === 'rank-set') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: t(lang, 'admin.staff.rank_admin_only'), flags: 64 });
      }
      const role = interaction.options.getRole('role');
      const points = interaction.options.getInteger('points');
      const name = interaction.options.getString('name') || role.name;

      db.setStaffRank(guildId, role.id, points, name);

      const embed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle(t(lang, 'admin.staff.rank_set_title'))
        .addFields(
          { name: t(lang, 'admin.staff.rank_f_role'), value: `<@&${role.id}>`, inline: true },
          { name: t(lang, 'admin.staff.rank_f_points'), value: t(lang, 'admin.staff.rank_f_points_v', { n: points }), inline: true },
          { name: t(lang, 'admin.staff.rank_f_name'), value: t(lang, 'admin.staff.rank_f_name_v', { name }), inline: true }
        )
        .setDescription(t(lang, 'admin.staff.rank_set_desc'))
        .setFooter({ text: t(lang, 'admin.staff.rank_footer') })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ─── Rank List ───
    if (sub === 'rank-list') {
      const ranks = db.getStaffRanks(guildId);
      if (!ranks || ranks.length === 0) {
        return interaction.reply({ content: t(lang, 'admin.staff.rank_empty'), flags: 64 });
      }

      const lines = ranks.map((r, i) =>
        t(lang, 'admin.staff.rank_row', {
          i: i + 1, role: r.role_id, points: r.required_points,
          name: r.rank_name ? t(lang, 'admin.staff.rank_row_name', { name: r.rank_name }) : ''
        })
      );

      const embed = new EmbedBuilder()
        .setColor('#7c3aed')
        .setTitle(t(lang, 'admin.staff.rank_list_title'))
        .setDescription(lines.join('\n'))
        .setFooter({ text: t(lang, 'admin.staff.rank_list_footer') })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ─── Rank Remove ───
    if (sub === 'rank-remove') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: t(lang, 'admin.staff.rank_admin_only'), flags: 64 });
      }
      const role = interaction.options.getRole('role');
      const result = db.removeStaffRank(guildId, role.id);

      if (!result || result.changes === 0) {
        return interaction.reply({ content: t(lang, 'admin.staff.rank_not_found', { id: role.id }), flags: 64 });
      }

      return interaction.reply({ content: t(lang, 'admin.staff.rank_removed', { id: role.id }) });
    }

    // ─── Points Award ───
    if (sub === 'points') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: t(lang, 'admin.staff.rank_admin_only'), flags: 64 });
      }
      const targetUser = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      const reason = interaction.options.getString('reason') || t(lang, 'admin.staff.points_default_reason');

      const updated = db.addStaffPoints(guildId, targetUser.id, amount, reason);
      if (!updated) {
        return interaction.reply({ content: t(lang, 'admin.staff.points_error'), flags: 64 });
      }

      // فحص الترقية التلقائية بعد منح النقاط
      let promotionStr = '';
      const promotion = db.checkStaffPromotion(guildId, targetUser.id);
      if (promotion) {
        const allRoles = promotion.allEligible;
        try {
          const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
          if (member) {
            for (const r of allRoles) {
              if (!member.roles.cache.has(r.role_id)) {
                await member.roles.add(r.role_id).catch(() => {});
                promotionStr += t(lang, 'admin.staff.promoted', { id: r.role_id });
              }
            }
          }
        } catch (e) {}
      }

      const embed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle(t(lang, 'admin.staff.points_title'))
        .addFields(
          { name: t(lang, 'admin.staff.points_f_member'), value: `<@${targetUser.id}>`, inline: true },
          { name: t(lang, 'admin.staff.points_f_added'), value: t(lang, 'admin.staff.points_f_added_v', { n: amount }), inline: true },
          { name: t(lang, 'admin.staff.points_f_total'), value: t(lang, 'admin.staff.points_f_total_v', { n: updated.points }), inline: true },
          { name: t(lang, 'admin.staff.points_f_reason'), value: reason, inline: false }
        )
        .setFooter({ text: t(lang, 'admin.staff.points_footer', { user: interaction.user.username }) })
        .setTimestamp();

      if (promotionStr) embed.setDescription(promotionStr);

      return interaction.reply({ embeds: [embed] });
    }
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild.id);
    const targetUser = message.mentions.users.first() || message.author;
    const staff = db.getStaffMember(message.guild.id, targetUser.id);
    const score = (staff.tickets_closed * 25) + (staff.mod_actions * 10) + (staff.messages_count * 1) + Math.floor((staff.voice_seconds / 300) * 1);
    const voiceHours = (staff.voice_seconds / 3600).toFixed(1);

    const embed = new EmbedBuilder()
      .setColor('#7c3aed')
      .setTitle(t(lang, 'admin.staff.stats_title', { user: targetUser.username }))
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setDescription(t(lang, 'admin.staff.prefix_stats_desc', { score, streak: staff.streak_days }))
      .addFields(
        { name: t(lang, 'admin.staff.prefix_f_tickets'), value: `\`${staff.tickets_closed}\``, inline: true },
        { name: t(lang, 'admin.staff.prefix_f_actions'), value: `\`${staff.mod_actions}\``, inline: true },
        { name: t(lang, 'admin.staff.prefix_f_messages'), value: `\`${staff.messages_count}\``, inline: true },
        { name: t(lang, 'admin.staff.f_voice'), value: `\`${voiceHours}h\``, inline: true },
        { name: t(lang, 'admin.staff.f_points'), value: `\`${staff.points}\``, inline: true }
      )
      .setFooter({ text: t(lang, 'admin.staff.prefix_footer') })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
};
