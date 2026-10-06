// ========================================================
// FILE: src/commands/tickets/ticket.js
// أوامر إدارة التذاكر المتقدمة (Close, Claim, Unclaim, Transfer, Transcript, Add, Remove)
// ========================================================
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database');
const { generateHtmlTranscript } = require('../../utils/transcript');
const config = require('../../config.json');

module.exports = {
  name: 'ticket',
  description: 'إدارة التذكرة الحالية (إغلاق، استلام، نقل، سجل، إضافة/إزالة عضو)',
  aliases: ['تذكرة', 'تكت'],
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('أوامر إدارة التذاكر المتقدمة')
    .addSubcommand(sub =>
      sub.setName('close')
        .setDescription('إغلاق وحفظ سجل التذكرة الحالية')
        .addStringOption(opt => opt.setName('reason').setDescription('سبب إغلاق التذكرة').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('claim')
        .setDescription('استلام التذكرة من قبل موظف الدعم')
    )
    .addSubcommand(sub =>
      sub.setName('unclaim')
        .setDescription('إلغاء استلام التذكرة وإتاحتها للآخرين')
    )
    .addSubcommand(sub =>
      sub.setName('transfer')
        .setDescription('نقل التذكرة إلى موظف دعم آخر')
        .addUserOption(opt => opt.setName('staff').setDescription('الموظف المراد تحويل التذكرة إليه').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('transcript')
        .setDescription('توليد وتحميل سجل المحادثة التفاعلي (HTML Transcript)')
    )
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('إضافة عضو للتذكرة الحالية')
        .addUserOption(opt => opt.setName('user').setDescription('العضو المراد إضافته').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('إزالة عضو من التذكرة الحالية')
        .addUserOption(opt => opt.setName('user').setDescription('العضو المراد إزالته').setRequired(true))
    ),

  async execute(interaction, client) {
    const ticket = db.getTicket(interaction.channel.id);
    if (!ticket) {
      return interaction.reply({ content: '❌ هذا الأمر يعمل فقط داخل قنوات التذاكر.', flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    const settings = db.getGuildSettings(interaction.guild.id);
    const supportRoleId = settings.support_role || settings.ticket_role || settings.staff_role;
    const isStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
      interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
      (supportRoleId && interaction.member.roles.cache.has(supportRoleId));

    if (sub === 'close') {
      const reason = interaction.options.getString('reason') || 'تم الإغلاق بواسطة أمر المشرف';
      await interaction.deferReply().catch(() => {});

      db.closeTicket(interaction.channel.id, interaction.user.id, reason);
      if (db.recordStaffAction) {
        db.recordStaffAction(interaction.guild.id, interaction.user.id, 'ticket_close', ticket.user_id, reason);
      }

      await interaction.editReply(`🔒 **جاري توليد السجل التفاعلي وإغلاق التذكرة خلال 5 ثوانٍ...**\nالسبب: \`${reason}\``);

      // توليد Transcript
      const transcriptResult = await generateHtmlTranscript(interaction.channel).catch(() => null);
      if (transcriptResult) {
        db.saveTranscript(interaction.guild.id, interaction.channel.id, ticket.user_id, interaction.user.id, reason, transcriptResult.html);

        const baseUrl = process.env.DASHBOARD_URL || config.dashboardUrl || 'https://zeno-dashboard.onrender.com';
        const webUrl = `${baseUrl}/transcript/${interaction.channel.id}`;

        // إرسال لقناة السجلات
        const logChannelId = settings.ticket_log_channel || settings.log_channel;
        if (logChannelId) {
          const logChannel = interaction.guild.channels.cache.get(logChannelId);
          if (logChannel) {
            const closeEmbed = new EmbedBuilder()
              .setColor(config.colors.danger || '#ef4444')
              .setTitle('🔒 تم إغلاق تذكرة وحفظ السجل التفاعلي')
              .addFields(
                { name: '🎫 اسم الروم', value: `\`${interaction.channel.name}\``, inline: true },
                { name: '👤 صاحب التذكرة', value: `<@${ticket.user_id}>`, inline: true },
                { name: '👮 أغلقت بواسطة', value: `${interaction.user}`, inline: true },
                { name: '🌐 عارض الويب', value: `[مشاهدة السجل التفاعلي مباشرة](${webUrl})`, inline: false },
                { name: '📝 السبب', value: `\`${reason}\``, inline: false }
              )
              .setTimestamp();
            await logChannel.send({ embeds: [closeEmbed], files: [transcriptResult.attachment] }).catch(() => {});
          }
        }

        // إرسال للمستخدم في الخاص مع أزرار التقييم
        try {
          const user = await client.users.fetch(ticket.user_id).catch(() => null);
          if (user) {
            const staffId = ticket.claimed_by || interaction.user.id;
            const rateEmbed = new EmbedBuilder()
              .setColor('#9333ea')
              .setTitle('⭐ تقييم تجربة الدعم الفني')
              .setDescription(`مرحباً **${user.username}**!\nتم إغلاق تذكرتك في سيرفر **${interaction.guild.name}**.\n\n🌐 **رابط السجل التفاعلي:** [اضغط هنا لمشاهدة التذكرة](${webUrl})\nيرجى تقييم أداء الدعم الفني بالضغط على النجوم أدناه:`)
              .setTimestamp();

            const ratingRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`rate_ticket_1_${interaction.channel.id}_${staffId}_${interaction.guild.id}`).setLabel('⭐ 1').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`rate_ticket_2_${interaction.channel.id}_${staffId}_${interaction.guild.id}`).setLabel('⭐ 2').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`rate_ticket_3_${interaction.channel.id}_${staffId}_${interaction.guild.id}`).setLabel('⭐ 3').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`rate_ticket_4_${interaction.channel.id}_${staffId}_${interaction.guild.id}`).setLabel('⭐ 4').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`rate_ticket_5_${interaction.channel.id}_${staffId}_${interaction.guild.id}`).setLabel('⭐ 5 ممتاز').setStyle(ButtonStyle.Success)
            );

            await user.send({ embeds: [rateEmbed], components: [ratingRow], files: [transcriptResult.attachment] }).catch(() => {});
          }
        } catch (e) {}
      }

      setTimeout(async () => {
        try {
          db.deleteTicket(interaction.channel.id);
          await interaction.channel.delete().catch(() => {});
        } catch (e) {}
      }, 5000);

    } else if (sub === 'claim') {
      if (!isStaff) return interaction.reply({ content: '❌ هذا الأمر مخصص لطاقم الدعم الفني فقط.', flags: 64 });
      if (ticket.claimed_by) {
        return interaction.reply({ content: `⚠️ هذه التذكرة مستلمة بالفعل بواسطة: <@${ticket.claimed_by}>`, flags: 64 });
      }

      db.claimTicket(interaction.channel.id, interaction.user.id);
      if (db.recordStaffAction) {
        db.recordStaffAction(interaction.guild.id, interaction.user.id, 'ticket_claim', ticket?.user_id || null, 'استلام تذكرة');
      }
      if (db.touchStaffShiftAction) db.touchStaffShiftAction(interaction.guild.id, interaction.user.id);
      await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        ReadMessageHistory: true
      }).catch(() => {});

      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#10b981').setDescription(`🙋‍♂️ **قام ${interaction.user} باستلام التذكرة وسيقوم بمتابعتها الآن.**`)]
      });

    } else if (sub === 'unclaim') {
      if (!isStaff) return interaction.reply({ content: '❌ هذا الأمر مخصص لطاقم الدعم الفني فقط.', flags: 64 });
      if (!ticket.claimed_by) {
        return interaction.reply({ content: '⚠️ هذه التذكرة ليست مستلمة من أحد حالياً.', flags: 64 });
      }

      db.unclaimTicket(interaction.channel.id);
      return interaction.reply({ content: `↩️ قام ${interaction.user} بإلغاء استلام التذكرة، وأصبحت متاحة للجميع.` });

    } else if (sub === 'transfer') {
      if (!isStaff) return interaction.reply({ content: '❌ هذا الأمر مخصص لطاقم الدعم الفني فقط.', flags: 64 });
      const targetUser = interaction.options.getUser('staff');

      db.transferTicket(interaction.channel.id, targetUser.id);
      await interaction.channel.permissionOverwrites.edit(targetUser.id, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        ReadMessageHistory: true
      }).catch(() => {});

      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#3b82f6').setDescription(`🔀 **تم تحويل التذكرة بنجاح إلى المسؤول ${targetUser}.**`)]
      });

    } else if (sub === 'transcript') {
      await interaction.deferReply().catch(() => {});
      const result = await generateHtmlTranscript(interaction.channel).catch(() => null);
      if (!result) {
        return interaction.editReply('❌ فشل في توليد السجل التفاعلي لهذه التذكرة.');
      }
      return interaction.editReply({
        content: `📄 **تفضل، تم استخراج سجل التذكرة بنجاح!**`,
        files: [result.attachment]
      });

    } else if (sub === 'add') {
      await interaction.deferReply({ flags: 64 }).catch(() => { });
      const user = interaction.options.getUser('user');
      await interaction.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        ReadMessageHistory: true
      });
      await interaction.editReply(`✅ تمت إضافة ${user} إلى التذكرة.`);
    } else if (sub === 'remove') {
      await interaction.deferReply({ flags: 64 }).catch(() => { });
      const user = interaction.options.getUser('user');
      await interaction.channel.permissionOverwrites.delete(user.id);
      await interaction.editReply(`✅ تمت إزالة ${user} من التذكرة.`);
    }
  },

  async executePrefix(message, args, client) {
    const ticket = db.getTicket(message.channel.id);
    if (!ticket) {
      return message.reply('❌ هذا الأمر يعمل فقط داخل قنوات التذاكر.');
    }

    const action = args[0]?.toLowerCase();
    const settings = db.getGuildSettings(message.guild.id);
    const supportRoleId = settings.support_role || settings.ticket_role || settings.staff_role;
    const isStaff = message.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
      message.member.permissions.has(PermissionFlagsBits.Administrator) ||
      (supportRoleId && message.member.roles.cache.has(supportRoleId));

    if (action === 'close') {
      const reason = args.slice(1).join(' ') || 'تم الإغلاق بأمر #ticket close';
      await message.reply(`🔒 **سيتم حفظ السجل وحذف التذكرة خلال 5 ثوانٍ...**\nالسبب: \`${reason}\``);
      db.closeTicket(message.channel.id, message.author.id, reason);

      const transcriptResult = await generateHtmlTranscript(message.channel).catch(() => null);
      if (transcriptResult) {
        db.saveTranscript(message.guild.id, message.channel.id, ticket.user_id, message.author.id, reason, transcriptResult.html);
      }

      setTimeout(async () => {
        try {
          db.deleteTicket(message.channel.id);
          await message.channel.delete().catch(() => {});
        } catch (err) {}
      }, 5000);

    } else if (action === 'claim') {
      if (!isStaff) return message.reply('❌ مخصص لطاقم الدعم الفني فقط.');
      db.claimTicket(message.channel.id, message.author.id);
      if (db.recordStaffAction) {
        db.recordStaffAction(message.guild.id, message.author.id, 'ticket_claim', ticket?.user_id || null, 'استلام تذكرة');
      }
      if (db.touchStaffShiftAction) db.touchStaffShiftAction(message.guild.id, message.author.id);
      await message.channel.permissionOverwrites.edit(message.author.id, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        ReadMessageHistory: true
      }).catch(() => {});
      message.reply(`🙋‍♂️ قام ${message.author} باستلام التذكرة.`);

    } else if (action === 'unclaim') {
      if (!isStaff) return message.reply('❌ مخصص لطاقم الدعم الفني فقط.');
      db.unclaimTicket(message.channel.id);
      message.reply(`↩️ تم إلغاء استلام التذكرة.`);

    } else if (action === 'transfer') {
      if (!isStaff) return message.reply('❌ مخصص لطاقم الدعم الفني فقط.');
      const user = message.mentions.users.first();
      if (!user) return message.reply('❌ يرجى منشن موظف الدعم.');
      db.transferTicket(message.channel.id, user.id);
      await message.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        ReadMessageHistory: true
      }).catch(() => {});
      message.reply(`🔀 تم تحويل التذكرة إلى ${user}.`);

    } else if (action === 'transcript') {
      const result = await generateHtmlTranscript(message.channel).catch(() => null);
      if (result) {
        message.reply({ content: '📄 تم توليد سجل التذكرة:', files: [result.attachment] });
      } else {
        message.reply('❌ فشل في توليد السجل.');
      }

    } else if (action === 'add') {
      const user = message.mentions.users.first();
      if (!user) return message.reply('❌ يرجى منشن العضو.');
      await message.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        ReadMessageHistory: true
      });
      await message.channel.send(`✅ تمت إضافة ${user} إلى التذكرة.`);
    } else if (action === 'remove') {
      const user = message.mentions.users.first();
      if (!user) return message.reply('❌ يرجى منشن العضو.');
      await message.channel.permissionOverwrites.delete(user.id);
      await message.channel.send(`✅ تمت إزالة ${user} من التذكرة.`);
    } else {
      message.reply('❌ الاستخدام:\n`#ticket close [reason]`\n`#ticket claim`\n`#ticket unclaim`\n`#ticket transfer @staff`\n`#ticket transcript`\n`#ticket add @user`\n`#ticket remove @user`');
    }
  }
};