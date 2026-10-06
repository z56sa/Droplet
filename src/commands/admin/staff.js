const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'staff',
  description: 'عرض إحصائيات نشاط طاقم الإدارة، الترتيب، والإنجازات',
  aliases: ['ستاف', 'ادارة', 'نشاط_الادارة'],
  data: new SlashCommandBuilder()
    .setName('staff')
    .setDescription('نظام متابعة نشاط طاقم الإدارة (Staff Activity)')
    .addSubcommand(sub =>
      sub.setName('stats')
        .setDescription('عرض إحصائياتك أو إحصائيات عضو من الستاف')
        .addUserOption(opt => opt.setName('user').setDescription('عضو الإدارة المراد فحص نشاطه').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('leaderboard')
        .setDescription('عرض لوحة شرف وترتيب الستاف الأكثر نشاطاً')
    )
    .addSubcommand(sub =>
      sub.setName('logs')
        .setDescription('عرض آخر الإجراءات المتخذة من قبل الستاف (Action Logs)')
        .addIntegerOption(opt => opt.setName('limit').setDescription('عدد الإجراءات المعروضة (1-20)').setMinValue(1).setMaxValue(20).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('goals')
        .setDescription('عرض أهداف الستاف وإنجازاتهم')
    )
    .addSubcommand(sub =>
      sub.setName('reset')
        .setDescription('إعادة تعيين إحصائيات الستاف (خاص بمالك السيرفر)')
        .addUserOption(opt => opt.setName('user').setDescription('العضو المراد تصفير نشاطه (اتركه فارغاً لتصفير الكل)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('rank-set')
        .setDescription('🎖️ تحديد رتبة ديسكورد كترقية تلقائية عند وصول عدد معين من النقاط')
        .addRoleOption(opt => opt.setName('role').setDescription('رتبة ديسكورد التي ستُمنح عند الترقية').setRequired(true))
        .addIntegerOption(opt => opt.setName('points').setDescription('عدد النقاط المطلوبة للترقية').setMinValue(1).setRequired(true))
        .addStringOption(opt => opt.setName('name').setDescription('اسم الرتبة (اختياري)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('rank-list')
        .setDescription('📋 عرض قائمة رتب الترقية التلقائية المضبوطة في السيرفر')
    )
    .addSubcommand(sub =>
      sub.setName('rank-remove')
        .setDescription('🗑️ حذف رتبة من نظام الترقية التلقائية')
        .addRoleOption(opt => opt.setName('role').setDescription('الرتبة المراد حذفها من نظام الترقية').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('points')
        .setDescription('⭐ منح نقاط مكافأة يدوياً لأحد أعضاء الإدارة')
        .addUserOption(opt => opt.setName('user').setDescription('عضو الإدارة المراد منحه نقاط').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('عدد النقاط المراد منحها').setMinValue(1).setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('سبب منح النقاط').setRequired(false))
    ),

  async execute(interaction) {
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
      const rankStr = rankIndex !== -1 ? `#${rankIndex + 1}` : 'غير مصنف';

      // فحص الإنجازات (Achievements)
      const achievements = [];
      if (staff.tickets_closed >= 100) achievements.push('🏆 بطل التذاكر (100+)');
      else if (staff.tickets_closed >= 25) achievements.push('🎫 خبير الدعم (25+)');
      if (staff.mod_actions >= 50) achievements.push('🛡️ حارس السيرفر (50+ إجراء)');
      if (staff.streak_days >= 7) achievements.push('🔥 وحش الاستمرارية (7+ أيام)');
      if (voiceHours >= 10) achievements.push('🎙️ عملاق الرومات (10+ ساعات)');
      if (achievements.length === 0) achievements.push('🌱 عضو ستاف جديد');

      const embed = new EmbedBuilder()
        .setColor(config.colors?.primary || '#7c3aed')
        .setTitle(`👮 إحصائيات نشاط الستاف | ${targetUser.username}`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setDescription(`📊 **التقييم العام للأداء (Performance Score):** \`${score} نقطة\`\n🏆 **الترتيب في السيرفر:** \`${rankStr}\``)
        .addFields(
          { name: '🎫 التذاكر المغلقة', value: `\`${staff.tickets_closed}\` تذكرة`, inline: true },
          { name: '🔨 الإجراءات الإدارية', value: `\`${staff.mod_actions}\` إجراء`, inline: true },
          { name: '💬 عدد الرسائل', value: `\`${staff.messages_count.toLocaleString()}\` رسالة`, inline: true },
          { name: '🔊 ساعات الصوت', value: `\`${voiceHours}\` ساعة`, inline: true },
          { name: '🔥 النشاط المتتالي (Streak)', value: `\`${staff.streak_days}\` يوم`, inline: true },
          { name: '💰 نقاط المكافآت', value: `\`${staff.points}\` نقطة`, inline: true },
          { 
            name: '📋 تفاصيل العقوبات المتخذة', 
            value: `🔨 باند: **${staff.bans_count}** | 👢 طرد: **${staff.kicks_count}** | 🔇 كتم: **${staff.mutes_count}** | ⚠️ تحذير: **${staff.warns_count}**`, 
            inline: false 
          },
          { name: '🏅 الإنجازات والألقاب', value: achievements.join(' • '), inline: false }
        )
        .setFooter({ text: 'ZENO Staff Activity System • يتم التحديث تلقائياً' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'leaderboard') {
      const list = db.getStaffLeaderboard(guildId, 10);
      if (list.length === 0) {
        return interaction.reply({ content: '📭 لا توجد بيانات نشاط مسجلة للستاف بعد.', flags: 64 });
      }

      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      const lines = list.map((s, i) => {
        const vHours = (s.voice_seconds / 3600).toFixed(1);
        return `${medals[i] || '▫️'} <@${s.user_id}>\n> 🎫 **${s.tickets_closed}** تذكرة • 🔨 **${s.mod_actions}** إجراء • 💬 **${s.messages_count}** رسالة • 🔊 **${vHours}h** صوت • 🔥 **${s.streak_days}d**\n> 📈 التقييم: **${Math.floor(s.performance_score)}** نقطة`;
      });

      const embed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle('🏆 لوحة شرف نشاط الستاف (Staff Leaderboard)')
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: 'يتم احتساب الترتيب حسب النقاط والإجراءات وساعات التواجد والتذاكر' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'logs') {
      const limit = interaction.options.getInteger('limit') || 10;
      const logs = db.getStaffActionLogs(guildId, limit);
      if (logs.length === 0) {
        return interaction.reply({ content: '📭 لا توجد سجلات إجراءات إدارية بعد.', flags: 64 });
      }

      const actionIcons = {
        ticket_close: '🎫 إغلاق تذكرة',
        ban: '🔨 حظر (Ban)',
        kick: '👢 طرد (Kick)',
        mute: '🔇 كتم (Mute)',
        warn: '⚠️ تحذير (Warn)'
      };

      const lines = logs.map(l => {
        const timeAgo = `<t:${l.created_at}:R>`;
        const target = l.target_id ? `<@${l.target_id}>` : 'غير محدد';
        const typeStr = actionIcons[l.action_type] || l.action_type;
        return `• ${typeStr} بواسطة <@${l.staff_id}> ضد ${target} (${timeAgo})\n  📋 السبب: \`${l.reason || 'لم يُذكر'}\`${l.details ? ` | تفاصيل: ${l.details}` : ''}`;
      });

      const embed = new EmbedBuilder()
        .setColor(config.colors?.info || '#3b82f6')
        .setTitle('📝 سجل الإجراءات الإدارية المباشرة (Action Logs)')
        .setDescription(lines.join('\n\n'))
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'goals') {
      const goals = db.getStaffGoals(guildId);
      const defaultGoals = [
        { title: 'إغلاق 20 تذكرة أسبوعياً', type: '🎫 التذاكر', target: '20 تذكرة', reward: '150 نقطة' },
        { title: 'اتخاذ 15 إجراء إداري', type: '🔨 الإشراف', target: '15 إجراء', reward: '100 نقطة' },
        { title: 'التواجد 10 ساعات في الرومات الصوتية', type: '🔊 الصوت', target: '10 ساعات', reward: '200 نقطة' },
        { title: 'الحفاظ على تفاعل 7 أيام متتالية', type: '🔥 الاستمرارية', target: '7 أيام Streak', reward: '250 نقطة' }
      ];

      const fields = defaultGoals.map(g => ({
        name: `🎯 ${g.title}`,
        value: `📂 النوع: **${g.type}** | الهدف: \`${g.target}\` | المكافأة: **${g.reward}**`,
        inline: false
      }));

      const embed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle('🎯 أهداف وإنجازات طاقم الإدارة (Staff Goals & Rewards)')
        .setDescription('حقق الأهداف التالية للحصول على نقاط مكافأة وترقية تقييمك الإداري 🚀')
        .addFields(fields)
        .setFooter({ text: 'تُراجع وتُصرف المكافآت من قبل الإدارة العليا' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'reset') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ هذا الأمر مخصص لمالك ومسؤولي السيرفر فقط.', flags: 64 });
      }

      const targetUser = interaction.options.getUser('user');
      if (targetUser) {
        db.resetStaffStats(guildId, targetUser.id);
        return interaction.reply({ content: `✅ تم تصفير وإعادة تعيين إحصائيات العضو <@${targetUser.id}> بنجاح.` });
      } else {
        db.resetStaffStats(guildId);
        return interaction.reply({ content: '✅ تم تصفير وإعادة تعيين إحصائيات جميع الستاف في هذا السيرفر بنجاح.' });
      }
    }

    // ─── Rank Set ───
    if (sub === 'rank-set') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ هذا الأمر مخصص للإدارة العليا فقط.', flags: 64 });
      }
      const role = interaction.options.getRole('role');
      const points = interaction.options.getInteger('points');
      const name = interaction.options.getString('name') || role.name;

      db.setStaffRank(guildId, role.id, points, name);

      const embed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle('🎖️ تم ضبط رتبة الترقية التلقائية')
        .addFields(
          { name: '🏷️ الرتبة', value: `<@&${role.id}>`, inline: true },
          { name: '⭐ النقاط المطلوبة', value: `\`${points}\` نقطة`, inline: true },
          { name: '📝 الاسم', value: `\`${name}\``, inline: true }
        )
        .setDescription('سيتم منح هذه الرتبة تلقائياً لأي عضو إدارة يصل لهذا العدد من النقاط.')
        .setFooter({ text: 'ZENO Staff Auto-Promotion System' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ─── Rank List ───
    if (sub === 'rank-list') {
      const ranks = db.getStaffRanks(guildId);
      if (!ranks || ranks.length === 0) {
        return interaction.reply({ content: '📭 لا توجد رتب ترقية تلقائية مضبوطة بعد.\nاستخدم `/staff rank-set` لإضافة رتبة.', flags: 64 });
      }

      const lines = ranks.map((r, i) =>
        `**${i + 1}.** <@&${r.role_id}> — \`${r.required_points}\` نقطة${r.rank_name ? ` (**${r.rank_name}**)` : ''}`
      );

      const embed = new EmbedBuilder()
        .setColor('#7c3aed')
        .setTitle('🎖️ قائمة رتب الترقية التلقائية (Staff Auto-Promotion Ranks)')
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'تُمنح الرتب تلقائياً عند تحقق شرط النقاط' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ─── Rank Remove ───
    if (sub === 'rank-remove') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ هذا الأمر مخصص للإدارة العليا فقط.', flags: 64 });
      }
      const role = interaction.options.getRole('role');
      const result = db.removeStaffRank(guildId, role.id);

      if (!result || result.changes === 0) {
        return interaction.reply({ content: `⚠️ الرتبة <@&${role.id}> غير موجودة في نظام الترقيات.`, flags: 64 });
      }

      return interaction.reply({ content: `✅ تم حذف الرتبة <@&${role.id}> من نظام الترقية التلقائية بنجاح.` });
    }

    // ─── Points Award ───
    if (sub === 'points') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '❌ هذا الأمر مخصص للإدارة العليا فقط.', flags: 64 });
      }
      const targetUser = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      const reason = interaction.options.getString('reason') || 'مكافأة إدارية';

      const updated = db.addStaffPoints(guildId, targetUser.id, amount, reason);
      if (!updated) {
        return interaction.reply({ content: '❌ حدث خطأ أثناء منح النقاط.', flags: 64 });
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
                promotionStr += `\n🎖️ تمت الترقية التلقائية إلى <@&${r.role_id}>!`;
              }
            }
          }
        } catch (e) {}
      }

      const embed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle('⭐ تم منح نقاط المكافأة')
        .addFields(
          { name: '👤 العضو', value: `<@${targetUser.id}>`, inline: true },
          { name: '⭐ النقاط المضافة', value: `+\`${amount}\` نقطة`, inline: true },
          { name: '💰 إجمالي النقاط', value: `\`${updated.points}\` نقطة`, inline: true },
          { name: '📋 السبب', value: reason, inline: false }
        )
        .setFooter({ text: `بواسطة ${interaction.user.username} • ZENO Staff System` })
        .setTimestamp();

      if (promotionStr) embed.setDescription(promotionStr);

      return interaction.reply({ embeds: [embed] });
    }
  },

  async executePrefix(message, args) {
    const targetUser = message.mentions.users.first() || message.author;
    const staff = db.getStaffMember(message.guild.id, targetUser.id);
    const score = (staff.tickets_closed * 25) + (staff.mod_actions * 10) + (staff.messages_count * 1) + Math.floor((staff.voice_seconds / 300) * 1);
    const voiceHours = (staff.voice_seconds / 3600).toFixed(1);

    const embed = new EmbedBuilder()
      .setColor('#7c3aed')
      .setTitle(`👮 إحصائيات نشاط الستاف | ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setDescription(`📊 **تقييم الأداء:** \`${score} نقطة\`\n🔥 **النشاط المتتالي:** \`${staff.streak_days} يوم\``)
      .addFields(
        { name: '🎫 التذاكر', value: `\`${staff.tickets_closed}\``, inline: true },
        { name: '🔨 الإجراءات', value: `\`${staff.mod_actions}\``, inline: true },
        { name: '💬 الرسائل', value: `\`${staff.messages_count}\``, inline: true },
        { name: '🔊 ساعات الصوت', value: `\`${voiceHours}h\``, inline: true },
        { name: '💰 النقاط', value: `\`${staff.points}\``, inline: true }
      )
      .setFooter({ text: 'استخدم /staff لعرض لوحة الشرف الكاملة وسجل الإجراءات' })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
};
