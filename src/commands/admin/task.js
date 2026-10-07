const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'task',
  description: 'نظام إدارة مهام الطاقم الإداري وتوزيع النقاط (Staff Tasks)',
  aliases: ['مهام', 'مهمة', 'tasks'],
  data: new SlashCommandBuilder()
    .setName('task')
    .setDescription('Staff tasks and rewards system (Staff Tasks & Points)')

    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Create a new staff task')

        .addStringOption(opt => opt.setName('title').setDescription('The task title').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('The required task details').setRequired(true))
        .addIntegerOption(opt => opt.setName('points').setDescription('Points earned on completion (default: 50)').setMinValue(1).setRequired(false))
        .addUserOption(opt => opt.setName('assign').setDescription('Assign to a specific admin (empty = all staff)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Show the current staff tasks')

        .addStringOption(opt =>
          opt.setName('status')
            .setDescription('Task status filter')

            .setRequired(false)
            .addChoices(
              { name: 'Pending tasks', value: 'pending' },
              { name: 'Completed tasks', value: 'completed' },
              { name: 'All tasks', value: 'all' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('done')
        .setDescription('Mark a task as done and claim its points')

        .addIntegerOption(opt => opt.setName('id').setDescription('The task ID').setMinValue(1).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('cancel')
        .setDescription('Cancel a staff task')

        .addIntegerOption(opt => opt.setName('id').setDescription('The task ID').setMinValue(1).setRequired(true))
    ),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ─── Add Task ───
    if (sub === 'add') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: t(lang, 'admin.task.managers_only'), flags: 64 });
      }

      const title = interaction.options.getString('title');
      const desc = interaction.options.getString('description');
      const points = interaction.options.getInteger('points') || 50;
      const assigned = interaction.options.getUser('assign');

      const res = db.addStaffTask(guildId, title, desc, assigned ? assigned.id : null, points, interaction.user.username);
      const taskId = res?.lastInsertRowid || t(lang, 'admin.task.id_new');

      const embed = new EmbedBuilder()
        .setColor('#3b82f6')
        .setTitle(t(lang, 'admin.task.created_title', { id: taskId }))
        .addFields(
          { name: t(lang, 'admin.task.f_title'), value: `\`${title}\``, inline: false },
          { name: t(lang, 'admin.task.f_details'), value: desc, inline: false },
          { name: t(lang, 'admin.task.f_points'), value: t(lang, 'admin.task.f_points_v', { n: points }), inline: true },
          { name: t(lang, 'admin.task.f_assigned'), value: assigned ? `<@${assigned.id}>` : t(lang, 'admin.task.assigned_all'), inline: true }
        )
        .setFooter({ text: t(lang, 'admin.task.footer', { user: interaction.user.username }) })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ─── List Tasks ───
    if (sub === 'list') {
      const statusFilter = interaction.options.getString('status') || 'pending';
      const tasks = db.getStaffTasks(guildId, statusFilter === 'all' ? null : statusFilter);

      if (!tasks || tasks.length === 0) {
        return interaction.reply({ content: t(lang, 'admin.task.list_empty'), flags: 64 });
      }

      const statusIcons = {
        pending: t(lang, 'admin.task.status_pending'),
        completed: t(lang, 'admin.task.status_completed'),
        cancelled: t(lang, 'admin.task.status_cancelled')
      };

      const lines = tasks.slice(0, 15).map(tk => {
        const assignedStr = tk.assigned_to ? `<@${tk.assigned_to}>` : t(lang, 'admin.task.list_assigned_all');
        const stStr = statusIcons[tk.status] || tk.status;
        return t(lang, 'admin.task.list_row', { id: tk.id, title: tk.title, status: stStr, desc: tk.description, points: tk.points, assigned: assignedStr });
      });

      const embed = new EmbedBuilder()
        .setColor('#8b5cf6')
        .setTitle(t(lang, 'admin.task.list_title'))
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: t(lang, 'admin.task.list_footer') })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ─── Complete Task ───
    if (sub === 'done') {
      const taskId = interaction.options.getInteger('id');
      const result = db.completeStaffTask(taskId, guildId, interaction.user.id);

      if (!result.success) {
        return interaction.reply({ content: t(lang, 'admin.task.cant_complete', { reason: result.reason || t(lang, 'admin.task.reason_unknown') }), flags: 64 });
      }

      // التحقق من ترقية تلقائية محتملة
      let promoMsg = '';
      const promo = db.checkStaffPromotion(guildId, interaction.user.id);
      if (promo) {
        for (const r of promo.allEligible) {
          if (!interaction.member.roles.cache.has(r.role_id)) {
            await interaction.member.roles.add(r.role_id).catch(() => {});
            promoMsg += t(lang, 'admin.task.promoted', { id: r.role_id });
          }
        }
      }

      const embed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle(t(lang, 'admin.task.done_title'))
        .setDescription(t(lang, 'admin.task.done_desc', { id: interaction.user.id, task: taskId, title: result.task.title, points: result.points, promo: promoMsg }))
        .setFooter({ text: t(lang, 'admin.task.done_footer') })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ─── Cancel Task ───
    if (sub === 'cancel') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: t(lang, 'admin.task.managers_only'), flags: 64 });
      }

      const taskId = interaction.options.getInteger('id');
      const res = db.cancelStaffTask(taskId, guildId);

      if (!res || res.changes === 0) {
        return interaction.reply({ content: t(lang, 'admin.task.not_found', { id: taskId }), flags: 64 });
      }

      return interaction.reply({ content: t(lang, 'admin.task.cancelled', { id: taskId }) });
    }
  }
};
