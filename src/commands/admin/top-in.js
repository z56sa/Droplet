const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'top-in',
  description: 'لوحة شرف وترتيب ساعات ونقاط طاقم الإدارة',
  aliases: ['توب_ادارة', 'top-staff', 'topin'],
  data: new SlashCommandBuilder()
    .setName('top-in')
    .setDescription('لوحة شرف وترتيب ساعات ونقاط طاقم الإدارة')
    // 1. توب الساعات (Top Hours)
    .addSubcommand(sub =>
      sub.setName('hours')
        .setDescription('عرض قائمة أكثر الإداريين تواجداً وساعات عمل داخل السيرفر (Top Hours)')
        .addIntegerOption(opt =>
          opt.setName('limit')
            .setDescription('عدد الإداريين المعروضين (1-25)')
            .setMinValue(1)
            .setMaxValue(25)
            .setRequired(false)
        )
    )
    // 2. توب النقاط (Top Points)
    .addSubcommand(sub =>
      sub.setName('points')
        .setDescription('عرض ترتيب الإداريين حسب النقاط الإجمالية وتقييم الأداء (Top Points)')
        .addIntegerOption(opt =>
          opt.setName('limit')
            .setDescription('عدد الإداريين المعروضين (1-25)')
            .setMinValue(1)
            .setMaxValue(25)
            .setRequired(false)
        )
    )
    // 3. تحديث وإضافة نقاط لإداري (Add Points)
    .addSubcommand(sub =>
      sub.setName('add-points')
        .setDescription('منح نقاط إضافية أو بونص لإداري لتقييم أدائه (Admin Only)')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('عضو الإدارة المراد منحه النقاط')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('points')
            .setDescription('عدد النقاط المراد إضافتها')
            .setRequired(true)
        )
    )
    // 4. تعيين وتعديل نقاط إداري (Set Points)
    .addSubcommand(sub =>
      sub.setName('set-points')
        .setDescription('تعديل الرصيد الإجمالي لنقاط إداري محدد (Admin Only)')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('عضو الإدارة')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('points')
            .setDescription('الرصيد الجديد للنقاط')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // 1. توب الساعات (Top Hours)
    if (sub === 'hours') {
      const limit = interaction.options.getInteger('limit') || 10;
      const list = db.getStaffHoursLeaderboard(guildId, limit);

      if (!list || list.length === 0) {
        return interaction.reply({
          content: '📭 لا توجد ساعات عمل مسجلة لأي إداري حتى الآن. تبدأ الساعات بالتسجيل عند الضغط على زر **تسجيل الدخول** في لوحة الحضور.',
          flags: 64
        });
      }

      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      const lines = list.map((s, i) => {
        const hours = Math.floor((s.shift_seconds || 0) / 3600);
        const mins = Math.floor(((s.shift_seconds || 0) % 3600) / 60);
        const timeDisplay = `${hours} ساعة و ${mins} دقيقة`;
        return `${medals[i] || '▫️'} <@${s.user_id}>\n> ⏱️ **الوقت:** \`${timeDisplay}\` • 🔄 **الجلسات:** \`${s.total_shifts || 0}\` • ⭐ **النقاط:** \`${s.points || 0}\``;
      });

      const embed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle('⏱️ توب ساعات عمل وتواجد طاقم الإدارة (Top Hours)')
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: 'يتم احتساب الساعات بدقة تلقائياً عبر نظام الشفتات • Droplet Staff' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // 2. توب النقاط (Top Points)
    if (sub === 'points') {
      const limit = interaction.options.getInteger('limit') || 10;
      const list = db.getStaffPointsLeaderboard(guildId, limit);

      if (!list || list.length === 0) {
        return interaction.reply({
          content: '📭 لا توجد نقاط مسجلة للإدارة بعد.',
          flags: 64
        });
      }

      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      const lines = list.map((s, i) => {
        const hours = Math.floor((s.shift_seconds || 0) / 3600);
        return `${medals[i] || '▫️'} <@${s.user_id}>\n> ⭐ **إجمالي النقاط:** \`${(s.points || 0).toLocaleString()} نقطة\`\n> ⏱️ الساعات: \`${hours}h\` • 🎫 تذاكر: \`${s.tickets_closed || 0}\` • 🔨 إجراءات: \`${s.mod_actions || 0}\``;
      });

      const embed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle('🏆 توب نقاط وتقييم أداء طاقم الإدارة (Top Points)')
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: 'تُمنح النقاط بناءً على الساعات، التذاكر، الإشراف، والمكافآت الإدارية' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // 3. إضافة نقاط (add-points)
    if (sub === 'add-points') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ تحتاج لصلاحية Administrator لإضافة نقاط للإدارة.', flags: 64 });
      }

      const targetUser = interaction.options.getUser('user');
      const points = interaction.options.getInteger('points');

      db.addStaffPoints(guildId, targetUser.id, points);
      const updatedMember = db.getStaffMember(guildId, targetUser.id);

      const embed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle('⭐ إضافة نقاط بونص ومكافأة للإداري')
        .setDescription(`تمت إضافة **+${points}** نقطة بنجاح إلى الإداري ${targetUser}!\n\n• **الرصيد الإجمالي الحالي:** \`${(updatedMember.points || 0).toLocaleString()} نقطة\``)
        .setFooter({ text: `تم التنفيذ بواسطة: ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // 4. تعيين وتعديل نقاط (set-points)
    if (sub === 'set-points') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ تحتاج لصلاحية Administrator لتعديل نقاط الإدارة.', flags: 64 });
      }

      const targetUser = interaction.options.getUser('user');
      const points = interaction.options.getInteger('points');

      db.setStaffPoints(guildId, targetUser.id, points);

      const embed = new EmbedBuilder()
        .setColor('#7c3aed')
        .setTitle('✏️ تعديل وتعيين نقاط الإداري')
        .setDescription(`تم تعيين الرصيد الإجمالي لنقاط ${targetUser} ليصبح: **\`${points.toLocaleString()} نقطة\`** بنجاح.`)
        .setFooter({ text: `تم التنفيذ بواسطة: ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  }
};
