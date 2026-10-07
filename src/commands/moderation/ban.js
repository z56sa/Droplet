const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ms = require('ms');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'ban',
  description: 'حظر عضو من السيرفر مع خيارات متقدمة',
  aliases: ['حظر', 'ban'],
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('حظر عضو من السيرفر')
    .addUserOption(opt => opt.setName('target').setDescription('العضو المراد حظره').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('سبب الحظر').setRequired(false))
    .addStringOption(opt => opt.setName('duration').setDescription('مدة الحظر المؤقت (مثال: 1h, 1d, 7d) — اتركه فارغاً للحظر الدائم').setRequired(false))
    .addIntegerOption(opt => opt.setName('delete_days').setDescription('حذف رسائل العضو (بالأيام)').setRequired(false)
      .addChoices({ name: 'لا تحذف', value: 0 }, { name: 'آخر يوم', value: 1 }, { name: 'آخر 7 أيام', value: 7 }))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers))
      return interaction.reply({ content: '❌ ليس لديك صلاحية حظر الأعضاء.', flags: 64 });

    await interaction.deferReply({ flags: 64 }).catch(() => {});

    const targetUser  = interaction.options.getUser('target');
    const reason      = interaction.options.getString('reason') || 'لم يُذكر سبب';
    const durationStr = interaction.options.getString('duration');
    const deleteDays  = interaction.options.getInteger('delete_days') ?? 0;

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (member && !member.bannable)
      return interaction.editReply({ content: '❌ لا أستطيع حظر هذا العضو (صلاحياته أعلى مني).' });

    if (member && member.id === interaction.user.id)
      return interaction.editReply({ content: '❌ لا تستطيع حظر نفسك!' });

    // إرسال DM قبل الحظر مع رابط تقديم الاستئناف
    const durationMs = durationStr ? ms(durationStr) : null;
    const baseUrl = process.env.DASHBOARD_URL || config.dashboardUrl || 'https://zeno-dashboard.onrender.com';
    const appealUrl = `${baseUrl}/appeal`;

    const dmEmbed = new EmbedBuilder()
      .setColor(config.colors?.danger || '#e74c3c')
      .setTitle(`🔨 تم حظرك من ${interaction.guild.name}`)
      .setDescription(`⚖️ **تقديم طلب فك حظر (Appeal):**\nإذا كنت تعتقد أن الحظر تم عن طريق الخطأ أو ترغب بطلب استئناف، يمكنك التقديم عبر الرابط التالي:\n🔗 **[اضغط هنا لتقديم طلب فك الحظر](${appealUrl})**`)
      .addFields(
        { name: '📋 السبب', value: reason, inline: false },
        { name: '⏳ المدة', value: durationStr ? durationStr : 'دائم', inline: true },
        { name: '👮 بواسطة', value: interaction.user.tag, inline: true }
      )
      .setFooter({ text: 'Droplet Security & Unban Appeal System' })
      .setTimestamp();

    if (member) await member.send({ embeds: [dmEmbed] }).catch(() => {});

    await interaction.guild.bans.create(targetUser.id, {
      reason: `${reason} | بواسطة: ${interaction.user.tag}`,
      deleteMessageSeconds: deleteDays * 86400
    });

    if (db.recordStaffAction) {
      db.recordStaffAction(interaction.guild.id, interaction.user.id, 'ban', targetUser.id, reason, durationStr || 'دائم');
    }

    const banEmbed = new EmbedBuilder()
      .setColor(config.colors?.danger || '#e74c3c')
      .setTitle(durationMs ? '🔨 حظر مؤقت تم بنجاح' : '🔨 حظر دائم تم بنجاح')
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '👤 العضو', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
        { name: '👮 المشرف', value: interaction.user.tag, inline: true },
        { name: '⏳ المدة', value: durationStr || 'دائم', inline: true },
        { name: '📋 السبب', value: reason, inline: false }
      )
      .setTimestamp();

    await interaction.deleteReply().catch(() => {});
    await interaction.channel.send({ embeds: [banEmbed] });
    this.sendToLog(interaction.guild, banEmbed);

    // رفع الحظر المؤقت بعد المدة
    if (durationMs) {
      setTimeout(async () => {
        await interaction.guild.bans.remove(targetUser.id, 'انتهت مدة الحظر المؤقت').catch(() => {});
        const unbanEmbed = new EmbedBuilder()
          .setColor(config.colors?.success || '#2ecc71')
          .setTitle('✅ انتهى الحظر المؤقت')
          .setDescription(`تم رفع الحظر عن **${targetUser.tag}** تلقائياً بعد انتهاء المدة.`)
          .setTimestamp();
        const logSettings = db.getGuildSettings(interaction.guild.id);
        if (logSettings?.log_channel) {
          const logCh = interaction.guild.channels.cache.get(logSettings.log_channel);
          if (logCh) logCh.send({ embeds: [unbanEmbed] }).catch(() => {});
        }
      }, durationMs);
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply('❌ ليس لديك صلاحية حظر الأعضاء.');

    const targetUser = message.mentions.users.first() ||
      (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!targetUser) return message.reply('❌ حدد العضو المراد حظره.');

    const reason = args.slice(1).join(' ') || 'لم يُذكر سبب';
    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);

    if (member && !member.bannable) return message.reply('❌ لا أستطيع حظر هذا العضو.');

    if (member) await member.send(`🔨 تم حظرك من **${message.guild.name}**\n📋 **السبب:** ${reason}`).catch(() => {});

    await message.guild.bans.create(targetUser.id, { reason: `${reason} | بواسطة: ${message.author.tag}` });

    const embed = new EmbedBuilder()
      .setColor(config.colors?.danger || '#e74c3c')
      .setTitle('🔨 تم الحظر بنجاح')
      .addFields(
        { name: '👤 العضو', value: `${targetUser.tag}`, inline: true },
        { name: '👮 بواسطة', value: message.author.tag, inline: true },
        { name: '📋 السبب', value: reason, inline: false }
      )
      .setTimestamp();

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
