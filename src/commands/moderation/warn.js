const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ms = require('ms');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'warn',
  description: 'إدارة تحذيرات الأعضاء وعرض سجل المخالفات مع عقوبات تلقائية',
  aliases: ['تحذير', 'warnings', 'تحذيرات', 'delwarn', 'حذف_تحذير'],
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('إدارة تحذيرات الأعضاء')
    .addSubcommand(sub => sub.setName('add').setDescription('إضافة تحذير لعضو')
      .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('سبب التحذير').setRequired(true)))
    .addSubcommand(sub => sub.setName('list').setDescription('عرض سجل تحذيرات عضو')
      .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true)))
    .addSubcommand(sub => sub.setName('remove').setDescription('حذف تحذير محدد برقم الـ ID')
      .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true))
      .addIntegerOption(opt => opt.setName('warn_id').setDescription('رقم التحذير').setRequired(true).setMinValue(1)))
    .addSubcommand(sub => sub.setName('clear').setDescription('مسح جميع تحذيرات عضو')
      .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return interaction.reply({ content: '❌ ليس لديك صلاحية إدارة المخالفات.', flags: 64 });

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
        .setTitle(`⚠️ تلقيت تحذيراً في ${interaction.guild.name}`)
        .addFields(
          { name: '📋 السبب', value: reason },
          { name: '🔢 إجمالي تحذيراتك', value: `${count}` },
          { name: '👮 المشرف', value: interaction.user.tag }
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
            content: `🔨 **تم حظرك نهائياً من سيرفر ${interaction.guild.name} لتجاوزك حد التحذيرات (${count} تحذيرات).**\n⚖️ يمكنك تقديم طلب فك حظر واستئناف عبر الرابط التالي:\n🔗 ${appealUrl}`
          }).catch(() => {});
          await interaction.guild.bans.create(targetUser.id, { reason: `تجاوز حد المخالفات التراكمية (${count} تحذيرات)` }).catch(() => {});
          autoPunishment = `🔨 **تم حظره تلقائياً** (6+ تحذيرات) • [تقديم استئناف](${appealUrl})`;
        } else if (count >= 4) {
          await member.send({
            content: `👢 **تم طردك من سيرفر ${interaction.guild.name} لتراكم التحذيرات (${count} تحذيرات).**`
          }).catch(() => {});
          await member.kick(`تجاوز حد المخالفات (${count} تحذيرات)`).catch(() => {});
          autoPunishment = '👢 **تم طرده تلقائياً** (4+ تحذيرات)';
        } else if (count >= 3) {
          await member.timeout(30 * 60 * 1000, `تراكم 3 تحذيرات`).catch(() => {});
          autoPunishment = '🔇 **تم إسكاته لمدة 30 دقيقة** (3 تحذيرات)';
        } else if (count >= 2) {
          await member.timeout(5 * 60 * 1000, `تراكم تحذيرين`).catch(() => {});
          autoPunishment = '🔇 **تم إسكاته لمدة 5 دقائق** (تحذيران)';
        }
      }

      const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('⚠️ تم إضافة تحذير')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '👤 العضو', value: `${targetUser.tag}`, inline: true },
          { name: '👮 المشرف', value: interaction.user.tag, inline: true },
          { name: '🔢 مجموع التحذيرات', value: `\`${count}\``, inline: true },
          { name: '📋 السبب', value: reason }
        )
        .setTimestamp();

      if (autoPunishment) embed.addFields({ name: '⚡ عقوبة تلقائية', value: autoPunishment });

      await interaction.editReply({ embeds: [embed] });
      this.sendToLog(interaction.guild, embed);

    } else if (sub === 'list') {
      const warns = db.getWarnings(interaction.guild.id, targetUser.id);
      if (!warns.length)
        return interaction.reply({ content: `✅ لا توجد أي تحذيرات مسجلة لـ **${targetUser.tag}**.`, flags: 64 });

      const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle(`⚠️ سجل تحذيرات ${targetUser.tag}`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setDescription(
          warns.map((w, i) =>
            `**#${i + 1}** (ID: \`${w.id}\`) | 👮 <@${w.moderator_id}> | 🕐 <t:${Math.floor((w.created_at || Date.now()) / 1000)}:R>\n📋 السبب: \`${w.reason || 'بدون سبب'}\``
          ).join('\n\n')
        )
        .setFooter({ text: `إجمالي التحذيرات: ${warns.length} | لحذف تحذير: /warn remove أو #delwarn` })
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });

    } else if (sub === 'remove') {
      const warnId = interaction.options.getInteger('warn_id');
      const warns = db.getWarnings(interaction.guild.id, targetUser.id);
      if (!warns[warnId - 1]) return interaction.reply({ content: `❌ رقم التحذير (#${warnId}) غير موجود في سجل العضو. استخدم \`/warn list\` لرؤية الأرقام.`, flags: 64 });
      db.db.prepare('DELETE FROM warnings WHERE id = ?').run(warns[warnId - 1].id);
      await interaction.reply({ content: `✅ تم حذف التحذير #${warnId} لـ **${targetUser.tag}** بنجاح.` });

    } else if (sub === 'clear') {
      db.clearWarnings(interaction.guild.id, targetUser.id);
      await interaction.reply({ content: `✅ تم مسح وتصفير جميع تحذيرات **${targetUser.tag}**.` });
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply('❌ ليس لديك صلاحية إدارة المخالفات.');

    const invoked = (message.content.trim().slice(1).split(/\s+/)[0] || '').toLowerCase();

    // 1. أمر عرض التحذيرات المباشر #warnings @user
    if (invoked === 'warnings' || invoked === 'تحذيرات') {
      const target = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null) || message.author;
      const warns = db.getWarnings(message.guild.id, target.id);
      if (!warns.length) return message.reply(`✅ لا توجد تحذيرات مسجلة لـ **${target.tag}**.`);
      const embed = new EmbedBuilder().setColor('#f39c12').setTitle(`⚠️ سجل تحذيرات ${target.tag}`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .setDescription(warns.map((w, i) => `**#${i + 1}** (ID: \`${w.id}\`) | المشرف: <@${w.moderator_id}>\n📋 السبب: \`${w.reason || 'بدون سبب'}\``).join('\n\n'))
        .setFooter({ text: `إجمالي: ${warns.length} تحذير` });
      return message.reply({ embeds: [embed] });
    }

    // 2. أمر حذف تحذير مباشر #delwarn @user [رقم_التحذير]
    if (invoked === 'delwarn' || invoked === 'حذف_تحذير') {
      const target = message.mentions.users.first();
      const num = parseInt(args[1]);
      if (!target || isNaN(num)) return message.reply('❌ الاستخدام: `#delwarn @user [رقم التحذير]` (مثال: `#delwarn @user 1`)');
      const warns = db.getWarnings(message.guild.id, target.id);
      if (!warns[num - 1]) return message.reply(`❌ رقم التحذير (#${num}) غير موجود. اعرض تحذيراته عبر \`#warnings @user\``);
      db.db.prepare('DELETE FROM warnings WHERE id = ?').run(warns[num - 1].id);
      return message.reply(`✅ تم حذف التحذير #${num} من سجل **${target.tag}**.`);
    }

    const action = args[0]?.toLowerCase();
    const target = message.mentions.users.first();
    if (!target) return message.reply('❌ حدد العضو. الاستخدام: `#warn @user [السبب]` أو `#warnings @user` أو `#delwarn @user [رقم]`');

    if (action === 'clear') {
      db.clearWarnings(message.guild.id, target.id);
      return message.reply(`✅ تم مسح جميع تحذيرات **${target.tag}**.`);
    }
    if (action === 'list') {
      const warns = db.getWarnings(message.guild.id, target.id);
      if (!warns.length) return message.reply(`✅ لا توجد تحذيرات لـ **${target.tag}**.`);
      const embed = new EmbedBuilder().setColor('#f39c12').setTitle(`⚠️ تحذيرات ${target.tag}`)
        .setDescription(warns.map((w, i) => `**#${i + 1}** | <@${w.moderator_id}> | \`${w.reason}\``).join('\n'));
      return message.reply({ embeds: [embed] });
    }

    const reason = args.slice(1).join(' ') || 'لم يُذكر سبب';
    const count = db.addWarning(message.guild.id, target.id, message.author.id, reason);
    const member = await message.guild.members.fetch(target.id).catch(() => null);
    if (member) await member.send(`⚠️ تحذير من **${message.guild.name}**: ${reason}`).catch(() => {});
    const embed = new EmbedBuilder().setColor('#f39c12').setTitle('⚠️ تم إضافة التحذير')
      .addFields(
        { name: '👤 العضو', value: target.tag, inline: true },
        { name: '🔢 إجمالي التحذيرات', value: `${count}`, inline: true },
        { name: '📋 السبب', value: reason }
      ).setTimestamp();
    await message.reply({ embeds: [embed] });
    this.sendToLog(message.guild, embed);
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
