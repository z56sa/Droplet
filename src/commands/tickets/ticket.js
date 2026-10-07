// ========================================================
// FILE: src/commands/tickets/ticket.js
// أوامر إدارة التذاكر المتقدمة (Close, Claim, Unclaim, Transfer, Transcript, Add, Remove)
// ========================================================
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database');
const { generateHtmlTranscript } = require('../../utils/transcript');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'ticket',
  description: 'إدارة التذكرة الحالية (إغلاق، استلام، نقل، سجل، إضافة/إزالة عضو)',
  aliases: ['تذكرة', 'تكت'],
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Advanced ticket management commands')

    .addSubcommand(sub =>
      sub.setName('close')
        .setDescription('Close and save the current ticket transcript')

        .addStringOption(opt => opt.setName('reason').setDescription('Ticket close reason').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('claim')
        .setDescription('Claim the ticket as support staff')

    )
    .addSubcommand(sub =>
      sub.setName('unclaim')
        .setDescription('Unclaim the ticket and make it available to others')

    )
    .addSubcommand(sub =>
      sub.setName('transfer')
        .setDescription('Transfer the ticket to another support staff member')

        .addUserOption(opt => opt.setName('staff').setDescription('The staff member to transfer the ticket to').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('transcript')
        .setDescription('Generate and download the interactive transcript (HTML)')

    )
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a member to the current ticket')

        .addUserOption(opt => opt.setName('user').setDescription('The member to add').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a member from the current ticket')

        .addUserOption(opt => opt.setName('user').setDescription('The member to remove').setRequired(true))
    ),

  async execute(interaction, client) {
    const lang = getGuildLang(interaction.guild.id);
    const ticket = db.getTicket(interaction.channel.id);
    if (!ticket) {
      return interaction.reply({ content: t(lang, 'tickets.common.not_in_ticket_channel'), flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    const settings = db.getGuildSettings(interaction.guild.id);
    const supportRoleId = settings.support_role || settings.ticket_role || settings.staff_role;
    const isStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
      interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
      (supportRoleId && interaction.member.roles.cache.has(supportRoleId));

    if (sub === 'close') {
      const reason = interaction.options.getString('reason') || t(lang, 'tickets.ticket.default_reason');
      await interaction.deferReply().catch(() => {});

      db.closeTicket(interaction.channel.id, interaction.user.id, reason);
      if (db.recordStaffAction) {
        db.recordStaffAction(interaction.guild.id, interaction.user.id, 'ticket_close', ticket.user_id, reason);
      }

      await interaction.editReply(t(lang, 'tickets.ticket.close_generating', { reason }));

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
              .setTitle(t(lang, 'tickets.ticket.log_title'))
              .addFields(
                { name: t(lang, 'tickets.ticket.log_field_channel'), value: `\`${interaction.channel.name}\``, inline: true },
                { name: t(lang, 'tickets.ticket.log_field_owner'), value: `<@${ticket.user_id}>`, inline: true },
                { name: t(lang, 'tickets.ticket.log_field_closed_by'), value: `${interaction.user}`, inline: true },
                { name: t(lang, 'tickets.ticket.log_field_web'), value: t(lang, 'tickets.ticket.log_web_link', { url: webUrl }), inline: false },
                { name: t(lang, 'tickets.ticket.log_field_reason'), value: `\`${reason}\``, inline: false }
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
              .setTitle(t(lang, 'tickets.ticket.rate_title'))
              .setDescription(t(lang, 'tickets.ticket.rate_desc', { user: user.username, guild: interaction.guild.name, url: webUrl }))
              .setTimestamp();

            const ratingRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`rate_ticket_1_${interaction.channel.id}_${staffId}_${interaction.guild.id}`).setLabel('⭐ 1').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`rate_ticket_2_${interaction.channel.id}_${staffId}_${interaction.guild.id}`).setLabel('⭐ 2').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`rate_ticket_3_${interaction.channel.id}_${staffId}_${interaction.guild.id}`).setLabel('⭐ 3').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`rate_ticket_4_${interaction.channel.id}_${staffId}_${interaction.guild.id}`).setLabel('⭐ 4').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`rate_ticket_5_${interaction.channel.id}_${staffId}_${interaction.guild.id}`).setLabel(t(lang, 'tickets.ticket.rate_5')).setStyle(ButtonStyle.Success)
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
      if (!isStaff) return interaction.reply({ content: t(lang, 'tickets.ticket.staff_only'), flags: 64 });
      if (ticket.claimed_by) {
        return interaction.reply({ content: t(lang, 'tickets.ticket.already_claimed', { user: ticket.claimed_by }), flags: 64 });
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
        embeds: [new EmbedBuilder().setColor('#10b981').setDescription(t(lang, 'tickets.ticket.claimed', { user: interaction.user }))]
      });

    } else if (sub === 'unclaim') {
      if (!isStaff) return interaction.reply({ content: t(lang, 'tickets.ticket.staff_only'), flags: 64 });
      if (!ticket.claimed_by) {
        return interaction.reply({ content: t(lang, 'tickets.ticket.not_claimed'), flags: 64 });
      }

      db.unclaimTicket(interaction.channel.id);
      return interaction.reply({ content: t(lang, 'tickets.ticket.unclaimed', { user: interaction.user }) });

    } else if (sub === 'transfer') {
      if (!isStaff) return interaction.reply({ content: t(lang, 'tickets.ticket.staff_only'), flags: 64 });
      const targetUser = interaction.options.getUser('staff');

      db.transferTicket(interaction.channel.id, targetUser.id);
      await interaction.channel.permissionOverwrites.edit(targetUser.id, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        ReadMessageHistory: true
      }).catch(() => {});

      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#3b82f6').setDescription(t(lang, 'tickets.ticket.transferred', { user: targetUser }))]
      });

    } else if (sub === 'transcript') {
      await interaction.deferReply().catch(() => {});
      const result = await generateHtmlTranscript(interaction.channel).catch(() => null);
      if (!result) {
        return interaction.editReply(t(lang, 'tickets.ticket.transcript_fail'));
      }
      return interaction.editReply({
        content: t(lang, 'tickets.ticket.transcript_done'),
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
      await interaction.editReply(t(lang, 'tickets.ticket.added', { user }));
    } else if (sub === 'remove') {
      await interaction.deferReply({ flags: 64 }).catch(() => { });
      const user = interaction.options.getUser('user');
      await interaction.channel.permissionOverwrites.delete(user.id);
      await interaction.editReply(t(lang, 'tickets.ticket.removed', { user }));
    }
  },

  async executePrefix(message, args, client) {
    const lang = getGuildLang(message.guild.id);
    const ticket = db.getTicket(message.channel.id);
    if (!ticket) {
      return message.reply(t(lang, 'tickets.common.not_in_ticket_channel'));
    }

    const action = args[0]?.toLowerCase();
    const settings = db.getGuildSettings(message.guild.id);
    const supportRoleId = settings.support_role || settings.ticket_role || settings.staff_role;
    const isStaff = message.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
      message.member.permissions.has(PermissionFlagsBits.Administrator) ||
      (supportRoleId && message.member.roles.cache.has(supportRoleId));

    if (action === 'close') {
      const reason = args.slice(1).join(' ') || t(lang, 'tickets.ticket.prefix_default_reason');
      await message.reply(t(lang, 'tickets.ticket.prefix_close_notice', { reason }));
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
      if (!isStaff) return message.reply(t(lang, 'tickets.ticket.prefix_staff_only'));
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
      message.reply(t(lang, 'tickets.ticket.prefix_claimed', { user: message.author }));

    } else if (action === 'unclaim') {
      if (!isStaff) return message.reply(t(lang, 'tickets.ticket.prefix_staff_only'));
      db.unclaimTicket(message.channel.id);
      message.reply(t(lang, 'tickets.ticket.prefix_unclaimed'));

    } else if (action === 'transfer') {
      if (!isStaff) return message.reply(t(lang, 'tickets.ticket.prefix_staff_only'));
      const user = message.mentions.users.first();
      if (!user) return message.reply(t(lang, 'tickets.ticket.prefix_need_staff_mention'));
      db.transferTicket(message.channel.id, user.id);
      await message.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        ReadMessageHistory: true
      }).catch(() => {});
      message.reply(t(lang, 'tickets.ticket.prefix_transferred', { user }));

    } else if (action === 'transcript') {
      const result = await generateHtmlTranscript(message.channel).catch(() => null);
      if (result) {
        message.reply({ content: t(lang, 'tickets.ticket.prefix_transcript_done'), files: [result.attachment] });
      } else {
        message.reply(t(lang, 'tickets.ticket.prefix_transcript_fail'));
      }

    } else if (action === 'add') {
      const user = message.mentions.users.first();
      if (!user) return message.reply(t(lang, 'tickets.ticket.prefix_need_member_mention'));
      await message.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        ReadMessageHistory: true
      });
      await message.channel.send(t(lang, 'tickets.ticket.added', { user }));
    } else if (action === 'remove') {
      const user = message.mentions.users.first();
      if (!user) return message.reply(t(lang, 'tickets.ticket.prefix_need_member_mention'));
      await message.channel.permissionOverwrites.delete(user.id);
      await message.channel.send(t(lang, 'tickets.ticket.removed', { user }));
    } else {
      message.reply(t(lang, 'tickets.ticket.prefix_usage'));
    }
  }
};
