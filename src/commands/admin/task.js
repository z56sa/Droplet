const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'task',
  description: 'نظام إدارة مهام الطاقم الإداري وتوزيع النقاط (Staff Tasks)',
  aliases: ['مهام', 'مهمة', 'tasks'],
  data: new SlashCommandBuilder()
    .setName('task')
    .setDescription('📋 نظام مهام الإدارة والمكافآت (Staff Tasks & Points)')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('➕ إنشاء مهمة إدارية جديدة')
        .addStringOption(opt => opt.setName('title').setDescription('عنوان المهمة').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('تفاصيل المهمة المطلوبة').setRequired(true))
        .addIntegerOption(opt => opt.setName('points').setDescription('النقاط المكتسبة عند الإنجاز (افتراضي: 50)').setMinValue(1).setRequired(false))
        .addUserOption(opt => opt.setName('assign').setDescription('تخصيص المهمة لإداري معين (اتركه فارغاً لجميع الستاف)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('📋 عرض قائمة المهام الإدارية الحالية')
        .addStringOption(opt =>
          opt.setName('status')
            .setDescription('حالة المهام')
            .setRequired(false)
            .addChoices(
              { name: 'المهام المعلقة (Pending)', value: 'pending' },
              { name: 'المهام المكتملة (Completed)', value: 'completed' },
              { name: 'جميع المهام', value: 'all' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('done')
        .setDescription('✅ تسجيل إنجاز مهمة واستلام نقاطها')
        .addIntegerOption(opt => opt.setName('id').setDescription('رقم معرف المهمة (Task ID)').setMinValue(1).setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('cancel')
        .setDescription('❌ إلغاء مهمة إدارية')
        .addIntegerOption(opt => opt.setName('id').setDescription('رقم معرف المهمة (Task ID)').setMinValue(1).setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ─── Add Task ───
    if (sub === 'add') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '❌ هذا الأمر مخصص للمسؤولين فقط.', flags: 64 });
      }

      const title = interaction.options.getString('title');
      const desc = interaction.options.getString('description');
      const points = interaction.options.getInteger('points') || 50;
      const assigned = interaction.options.getUser('assign');

      const res = db.addStaffTask(guildId, title, desc, assigned ? assigned.id : null, points, interaction.user.username);
      const taskId = res?.lastInsertRowid || 'جديد';

      const embed = new EmbedBuilder()
        .setColor('#3b82f6')
        .setTitle(`📋 تم إنشاء مهمة إدارية جديدة #${taskId}`)
        .addFields(
          { name: '📌 عنوان المهمة', value: `\`${title}\``, inline: false },
          { name: '📝 التفاصيل', value: desc, inline: false },
          { name: '⭐ النقاط والمكافأة', value: `\`${points}\` نقطة`, inline: true },
          { name: '👤 مخصصة لـ', value: assigned ? `<@${assigned.id}>` : 'متاحة لجميع طاقم الإدارة', inline: true }
        )
        .setFooter({ text: `أنشئت بواسطة ${interaction.user.username} • Droplet Tasks` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ─── List Tasks ───
    if (sub === 'list') {
      const statusFilter = interaction.options.getString('status') || 'pending';
      const tasks = db.getStaffTasks(guildId, statusFilter === 'all' ? null : statusFilter);

      if (!tasks || tasks.length === 0) {
        return interaction.reply({ content: '📭 لا توجد مهام إدارية مسجلة حالياً بهذا الفلتر.', flags: 64 });
      }

      const statusIcons = {
        pending: '⏳ معلقة',
        completed: '✅ مكتملة',
        cancelled: '❌ ملغية'
      };

      const lines = tasks.slice(0, 15).map(t => {
        const assignedStr = t.assigned_to ? `<@${t.assigned_to}>` : 'الجميع';
        const stStr = statusIcons[t.status] || t.status;
        return `**#${t.id} - ${t.title}** [${stStr}]\n> 📝 ${t.description}\n> ⭐ المكافأة: \`${t.points}\` نقطة | 👤 لـ: ${assignedStr}`;
      });

      const embed = new EmbedBuilder()
        .setColor('#8b5cf6')
        .setTitle('📋 قائمة المهام الإدارية (Staff Tasks)')
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: 'لإكمال مهمة واستلام نقاطها: /task done <id>' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ─── Complete Task ───
    if (sub === 'done') {
      const taskId = interaction.options.getInteger('id');
      const result = db.completeStaffTask(taskId, guildId, interaction.user.id);

      if (!result.success) {
        return interaction.reply({ content: `❌ يتعذر إكمال المهمة: ${result.reason || 'المهمة غير موجودة'}`, flags: 64 });
      }

      // التحقق من ترقية تلقائية محتملة
      let promoMsg = '';
      const promo = db.checkStaffPromotion(guildId, interaction.user.id);
      if (promo) {
        for (const r of promo.allEligible) {
          if (!interaction.member.roles.cache.has(r.role_id)) {
            await interaction.member.roles.add(r.role_id).catch(() => {});
            promoMsg += `\n🎖️ **تهانينا! تمت ترقيتك تلقائياً إلى رتبة <@&${r.role_id}>!**`;
          }
        }
      }

      const embed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle('🎉 تم إنجاز المهمة بنجاح!')
        .setDescription(`قام الإداري <@${interaction.user.id}> بإنجاز المهمة:\n**#${taskId} - ${result.task.title}**\n\n⭐ حصل على: \`+${result.points}\` نقطة مكافأة!${promoMsg}`)
        .setFooter({ text: 'Droplet Staff Task System' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ─── Cancel Task ───
    if (sub === 'cancel') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '❌ هذا الأمر مخصص للمسؤولين فقط.', flags: 64 });
      }

      const taskId = interaction.options.getInteger('id');
      const res = db.cancelStaffTask(taskId, guildId);

      if (!res || res.changes === 0) {
        return interaction.reply({ content: `⚠️ لم يتم العثور على المهمة #${taskId}.`, flags: 64 });
      }

      return interaction.reply({ content: `✅ تم إلغاء المهمة #${taskId} بنجاح.` });
    }
  }
};
