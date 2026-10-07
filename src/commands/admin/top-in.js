const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'top-in',
  description: 'لوحة شرف وترتيب ساعات ونقاط طاقم الإدارة',
  aliases: ['توب_ادارة', 'top-staff', 'topin'],
  data: new SlashCommandBuilder()
    .setName('top-in')
    .setDescription('Staff hours and points leaderboard')

    // 1. توب الساعات (Top Hours)
    .addSubcommand(sub =>
      sub.setName('hours')
        .setDescription('Show the most present admins by work hours (Top Hours)')

        .addIntegerOption(opt =>
          opt.setName('limit')
            .setDescription('Number of admins shown (1-25)')

            .setMinValue(1)
            .setMaxValue(25)
            .setRequired(false)
        )
    )
    // 2. توب النقاط (Top Points)
    .addSubcommand(sub =>
      sub.setName('points')
        .setDescription('Show admin ranking by total points (Top Points)')

        .addIntegerOption(opt =>
          opt.setName('limit')
            .setDescription('Number of admins shown (1-25)')

            .setMinValue(1)
            .setMaxValue(25)
            .setRequired(false)
        )
    )
    // 3. تحديث وإضافة نقاط لإداري (Add Points)
    .addSubcommand(sub =>
      sub.setName('add-points')
        .setDescription('Grant bonus points to an admin (Admin Only)')

        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The admin to grant points')

            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('points')
            .setDescription('Points to add')

            .setRequired(true)
        )
    )
    // 4. تعيين وتعديل نقاط إداري (Set Points)
    .addSubcommand(sub =>
      sub.setName('set-points')
        .setDescription('Edit the total point balance of an admin (Admin Only)')

        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('The admin member')

            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('points')
            .setDescription('The new point balance')

            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // 1. توب الساعات (Top Hours)
    if (sub === 'hours') {
      const limit = interaction.options.getInteger('limit') || 10;
      const list = db.getStaffHoursLeaderboard(guildId, limit);

      if (!list || list.length === 0) {
        return interaction.reply({
          content: t(lang, 'admin.topin.hours_empty'),
          flags: 64
        });
      }

      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      const lines = list.map((s, i) => {
        const hours = Math.floor((s.shift_seconds || 0) / 3600);
        const mins = Math.floor(((s.shift_seconds || 0) % 3600) / 60);
        const timeDisplay = t(lang, 'admin.topin.hours_time', { h: hours, m: mins });
        return t(lang, 'admin.topin.hours_row', {
          medal: medals[i] || '▫️', id: s.user_id, time: timeDisplay,
          shifts: s.total_shifts || 0, points: s.points || 0
        });
      });

      const embed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle(t(lang, 'admin.topin.hours_title'))
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: t(lang, 'admin.topin.hours_footer') })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // 2. توب النقاط (Top Points)
    if (sub === 'points') {
      const limit = interaction.options.getInteger('limit') || 10;
      const list = db.getStaffPointsLeaderboard(guildId, limit);

      if (!list || list.length === 0) {
        return interaction.reply({
          content: t(lang, 'admin.topin.points_empty'),
          flags: 64
        });
      }

      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      const lines = list.map((s, i) => {
        const hours = Math.floor((s.shift_seconds || 0) / 3600);
        return t(lang, 'admin.topin.points_row', {
          medal: medals[i] || '▫️', id: s.user_id, points: (s.points || 0).toLocaleString(),
          h: hours, t: s.tickets_closed || 0, m: s.mod_actions || 0
        });
      });

      const embed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle(t(lang, 'admin.topin.points_title'))
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: t(lang, 'admin.topin.points_footer') })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // 3. إضافة نقاط (add-points)
    if (sub === 'add-points') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: t(lang, 'admin.topin.need_admin'), flags: 64 });
      }

      const targetUser = interaction.options.getUser('user');
      const points = interaction.options.getInteger('points');

      db.addStaffPoints(guildId, targetUser.id, points);
      const updatedMember = db.getStaffMember(guildId, targetUser.id);

      const embed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle(t(lang, 'admin.topin.add_title'))
        .setDescription(t(lang, 'admin.topin.add_desc', { points, user: targetUser, total: (updatedMember.points || 0).toLocaleString() }))
        .setFooter({ text: t(lang, 'admin.topin.by_footer', { tag: interaction.user.tag }) })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // 4. تعيين وتعديل نقاط (set-points)
    if (sub === 'set-points') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: t(lang, 'admin.topin.need_admin_set'), flags: 64 });
      }

      const targetUser = interaction.options.getUser('user');
      const points = interaction.options.getInteger('points');

      db.setStaffPoints(guildId, targetUser.id, points);

      const embed = new EmbedBuilder()
        .setColor('#7c3aed')
        .setTitle(t(lang, 'admin.topin.set_title'))
        .setDescription(t(lang, 'admin.topin.set_desc', { user: targetUser, points: points.toLocaleString() }))
        .setFooter({ text: t(lang, 'admin.topin.by_footer', { tag: interaction.user.tag }) })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  }
};
