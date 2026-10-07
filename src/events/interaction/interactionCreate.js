const autoHealer = require('../../services/aiAutoHealer');
const { t } = require('../../utils/lang');
const { ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder } = require('discord.js');
const db = require('../../database');
const embedUtil = require('../../utils/embed');
const logger = require('../../utils/logger');
const config = require('../../config.json');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      if (await autoHealer.handleInteraction(interaction)) return;

      // 1. التعامل مع أوامر السلاش (Slash Commands)
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          return interaction.reply({ content: t(interaction.guildId, 'events.common.cmd_not_found'), flags: 64 }).catch(() => { });
        }

        // فحص الأوامر المعطلة من لوحة الداشبورد
        if (interaction.guild) {
          try {
            const gSettings = db.getGuildSettings ? db.getGuildSettings(interaction.guild.id) : {};
            const disabledCmds = JSON.parse(gSettings?.disabled_commands || '[]');
            const slashName = '/' + interaction.commandName;
            if (disabledCmds.includes(slashName) || disabledCmds.includes(interaction.commandName)) {
              return interaction.reply({ content: t(interaction.guildId, 'events.common.cmd_disabled'), flags: 64 }).catch(() => {});
            }

            // فحص إعدادات الصلاحيات والقنوات المخصصة للأمر
            let cmdConfigs = {};
            try {
              cmdConfigs = typeof gSettings?.command_configs === 'string' ? JSON.parse(gSettings.command_configs) : (gSettings?.command_configs || {});
            } catch(e) {}
            const cfg = cmdConfigs[slashName] || cmdConfigs[interaction.commandName];
            if (cfg) {
              // فحص الرتب المسموح لها
              if (cfg.allowedRoles && Array.isArray(cfg.allowedRoles) && cfg.allowedRoles.length > 0) {
                const hasRole = interaction.member.roles.cache.some(r => cfg.allowedRoles.includes(r.id));
                const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
                if (!hasRole && !isAdmin) {
                  return interaction.reply({ content: t(interaction.guildId, 'events.common.cmd_no_role'), flags: 64 }).catch(() => {});
                }
              }
              // فحص القنوات المسموح فيها
              if (cfg.allowedChannels && Array.isArray(cfg.allowedChannels) && cfg.allowedChannels.length > 0) {
                const isAdminCh = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                                  interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
                if (!isAdminCh && !cfg.allowedChannels.includes(interaction.channelId)) {
                  const allowedList = cfg.allowedChannels.map(id => `<#${id}>`).join(', ');
                  return interaction.reply({ content: t(interaction.guildId, 'events.common.cmd_wrong_channel', { channels: allowedList }), flags: 64 }).catch(() => {});
                }
              }
            }
          } catch(e) {}
        }

        try {
          await command.execute(interaction, client);
        } catch (error) {
          logger.error(`خطأ أثناء تنفيذ أمر السلاش ${interaction.commandName}:`, error);
          const errorEmbed = embedUtil.error(t(interaction.guildId, 'events.common.slash_error_title'), t(interaction.guildId, 'events.common.slash_error_desc'));
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [errorEmbed], flags: 64 }).catch(() => { });
          } else {
            await interaction.reply({ embeds: [errorEmbed], flags: 64 }).catch(() => { });
          }
        }
        return;
      }

      // 2.0 أزرار متجر السيرفر التفاعلي (Shop Embed Buttons)
      if (interaction.isButton() && (interaction.customId === 'shop_view' || interaction.customId === 'shop_balance')) {
        await interaction.deferReply({ flags: 64 }).catch(() => {});
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const userCoins = db.getCoins(userId, guildId);

        if (interaction.customId === 'shop_balance') {
          const balEmbed = new EmbedBuilder()
            .setColor('#f59e0b')
            .setTitle('💰 رصيدك في السيرفر')
            .setDescription(`مرحباً ${interaction.user}، رصيدك الحالي هو:\n\n🪙 **${userCoins.toLocaleString()}** ذهب\n\nيمكنك جمع المزيد من الذهب عبر التفاعل والكتابة والأوامر اليومية!`)
            .setTimestamp();
          return interaction.editReply({ embeds: [balEmbed] });
        }

        if (interaction.customId === 'shop_view') {
          const settings = db.getGuildSettings ? db.getGuildSettings(guildId) : {};
          let shopSettings = { customRole: { enabled: true, price: 500, duration: 30 }, textRoom: { enabled: true, price: 600, duration: 30 }, badge: { enabled: false, price: 200, duration: 0 } };
          try { if (settings?.shop_items) shopSettings = JSON.parse(settings.shop_items); } catch(e) {}

          const shopEmbed = new EmbedBuilder()
            .setColor('#8b5cf6')
            .setTitle('🛒 متجر السيرفر التفاعلي')
            .setDescription(`رصيدك: **${userCoins.toLocaleString()}** 🪙 ذهب\n\nطريقة الشراء عبر الأوامر السريعة:\n• لشراء رتبة خاصة: \`#shop buy-role name:اسم color:#hex\`\n• لشراء روم كتابي: \`#shop rent-room type:text name:اسم\`\n• لشراء شارة مظهر: \`#shop buy-cosmetic item:badge_vip\``)
            .setTimestamp();

          return interaction.editReply({ embeds: [shopEmbed] });
        }
        return;
      }

      // 2. التعامل مع أزرار الرتب التفاعلية (Reaction Roles)
      if (interaction.isButton() && interaction.customId.startsWith('rr_')) {
        await interaction.deferReply({ flags: 64 }).catch(() => { });
        const rrData = db.getReactionRole(interaction.customId);
        if (rrData) {
          const role = interaction.guild.roles.cache.get(rrData.role_id);
          if (!role) {
            return interaction.editReply({ content: t(interaction.guildId, 'events.rr.not_found') });
          }

          if (interaction.member.roles.cache.has(role.id)) {
            await interaction.member.roles.remove(role);
            return interaction.editReply({ content: t(interaction.guildId, 'events.rr.removed', { role: role.name }) });
          } else {
            await interaction.member.roles.add(role);
            return interaction.editReply({ content: t(interaction.guildId, 'events.rr.added', { role: role.name }) });
          }
        }
        return;
      }

      // 2.1 التعامل مع تصويتات الاقتراحات (Suggestion Upvote & Downvote Buttons)
      if (interaction.isButton() && (interaction.customId === 'sugg_upvote' || interaction.customId === 'sugg_downvote')) {
        // Defer early to prevent "didn't respond in time" timeout (3s limit)
        await interaction.deferReply({ flags: 64 }).catch(() => {});

        const voteType = interaction.customId === 'sugg_upvote' ? 'up' : 'down';
        const res = db.voteSuggestion(interaction.message.id, interaction.user.id, voteType);
        if (!res) {
          return interaction.editReply({ content: t(interaction.guildId, 'suggest.vote.not_found') });
        }

        const sugg = db.getSuggestion(interaction.message.id);
        const { buildSuggestionEmbed, buildSuggestionComponents } = require('../../utils/suggestionBuilder');

        // تحديث إيمبد الاقتراح بنسبة التصويت وشريط التقدم الحي
        try {
          const suggAuthor = sugg ? await client.users.fetch(sugg.user_id).catch(() => null) : null;
          const userObj = suggAuthor || { tag: t(interaction.guildId, 'suggest.unknown_member'), username: t(interaction.guildId, 'suggest.unknown_member') };

          const updatedEmbed = buildSuggestionEmbed({
            user: userObj,
            content: sugg?.content || interaction.message.embeds[0]?.description || '',
            title: sugg?.title || null,
            code: sugg?.id ? sugg.id.toString(36) : interaction.message.id.slice(-8),
            status: sugg?.status || 'pending',
            upvotes: res.upvotesCount,
            downvotes: res.downvotesCount,
            createdAt: sugg?.created_at ? sugg.created_at * 1000 : interaction.message.createdTimestamp,
            reviewerId: sugg?.reviewed_by || null,
            reason: sugg?.status_reason || null,
            lang: interaction.guildId
          });

          // الحفاظ على أزرار التصويت والإدارة بنفس الحالة
          const isClosed = sugg?.status && sugg.status !== 'pending' && sugg.status !== 'considered';
          const newComponents = buildSuggestionComponents({
            upvotes: res.upvotesCount,
            downvotes: res.downvotesCount,
            disabled: isClosed,
            lang: interaction.guildId
          });

          await interaction.message.edit({ embeds: [updatedEmbed], components: newComponents }).catch(() => {});
        } catch (e) {
          console.error('[Suggestion Vote Edit Error]:', e);
        }

        const actionText = res.action === 'removed' ? t(interaction.guildId, 'suggest.vote.action_removed') : (voteType === 'up' ? t(interaction.guildId, 'suggest.vote.action_up') : t(interaction.guildId, 'suggest.vote.action_down'));
        return interaction.editReply({ content: t(interaction.guildId, 'suggest.vote.done', { action: actionText }) });
      }

      // 2.1.1 التعامل مع قبول أو رفض أو دراسة الاقتراح إدارياً (Suggestion Staff Decision)
      if (interaction.isButton() && (interaction.customId === 'sugg_accept_btn' || interaction.customId === 'sugg_reject_btn' || interaction.customId === 'sugg_consider_btn')) {
        const isStaffOrAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                               interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                               interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers);

        if (!isStaffOrAdmin) {
          return interaction.reply({ content: t(interaction.guildId, 'suggest.staff.only'), flags: 64 });
        }

        let actionType = 'accept';
        let modalTitle = t(interaction.guildId, 'suggest.modal.accept_title');
        if (interaction.customId === 'sugg_reject_btn') {
          actionType = 'reject';
          modalTitle = t(interaction.guildId, 'suggest.modal.reject_title');
        } else if (interaction.customId === 'sugg_consider_btn') {
          actionType = 'consider';
          modalTitle = t(interaction.guildId, 'suggest.modal.consider_title');
        }

        const modal = new ModalBuilder()
          .setCustomId(`modal_sugg_${actionType}_${interaction.message.id}`)
          .setTitle(modalTitle);

        const isRequired = actionType === 'reject';
        const reasonInput = new TextInputBuilder()
          .setCustomId('sugg_decision_reason')
          .setLabel(actionType === 'accept' ? t(interaction.guildId, 'suggest.modal.label_accept') : (actionType === 'reject' ? t(interaction.guildId, 'suggest.modal.label_reject') : t(interaction.guildId, 'suggest.modal.label_consider')))
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(actionType === 'accept' ? t(interaction.guildId, 'suggest.modal.ph_accept') : (actionType === 'reject' ? t(interaction.guildId, 'suggest.modal.ph_reject') : t(interaction.guildId, 'suggest.modal.ph_consider')))
          .setRequired(isRequired)
          .setMaxLength(500);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        return interaction.showModal(modal);
      }

      // 2.2 التعامل مع زر المشاركة في القيف اواي (Giveaway Enter Button)
      if (interaction.isButton() && interaction.customId === 'gw_enter_btn') {
        const gw = db.getGiveaway(interaction.message.id);
        if (!gw || gw.status !== 'active') {
          return interaction.reply({ content: t(interaction.guildId, 'events.gw.ended'), flags: 64 });
        }

        const entries = db.getGiveawayEntries(interaction.message.id);
        const hasJoined = entries.includes(interaction.user.id);

        if (hasJoined) {
          // رسالة تأكيد إلغاء الاشتراك مع أزرار
          const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`gw_leave_confirm_${interaction.message.id}`)
              .setLabel(t(interaction.guildId, 'events.gw.leave_confirm_label'))
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🗑️'),
            new ButtonBuilder()
              .setCustomId('gw_leave_cancel')
              .setLabel(t(interaction.guildId, 'events.gw.leave_cancel_label'))
              .setStyle(ButtonStyle.Secondary)
          );

          return interaction.reply({
            content: t(interaction.guildId, 'events.gw.leave_confirm_text', { prize: gw.prize }),
            components: [confirmRow],
            flags: 64
          });
        }

        if (gw.required_role && !interaction.member.roles.cache.has(gw.required_role)) {
          return interaction.reply({ content: t(interaction.guildId, 'events.gw.need_role', { role: gw.required_role }), flags: 64 });
        }

        const res = db.addGiveawayEntry(interaction.message.id, interaction.user.id);
        return interaction.reply({ content: t(interaction.guildId, 'events.gw.joined', { prize: gw.prize, count: res.count }), flags: 64 });
      }

      // تأكيد إلغاء المشاركة (من الداشبورد أو أمر السلاش)
      if (interaction.isButton() && (interaction.customId.startsWith('gw_leave_confirm_') || interaction.customId.startsWith('slash_gw_leave_confirm_'))) {
        const isSlashGw = interaction.customId.startsWith('slash_gw_leave_confirm_');
        const targetMsgId = interaction.customId.replace(isSlashGw ? 'slash_gw_leave_confirm_' : 'gw_leave_confirm_', '');
        const gw = db.getGiveaway(targetMsgId);
        const res = db.removeGiveawayEntry(targetMsgId, interaction.user.id);

        if (isSlashGw) {
          try {
            const channel = interaction.channel;
            const originalMsg = await channel.messages.fetch(targetMsgId).catch(() => null);
            if (originalMsg) {
              const newRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId('join_giveaway')
                  .setLabel(t(interaction.guildId, 'events.gw.join_btn', { count: res.count }))
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setCustomId('view_giveaway_entries')
                  .setLabel(t(interaction.guildId, 'events.gw.entries_btn'))
                  .setStyle(ButtonStyle.Secondary)
              );
              await originalMsg.edit({ components: [newRow] }).catch(() => {});
            }
          } catch (e) {}
        }

        return interaction.update({
          content: t(interaction.guildId, 'events.gw.left', { prize: gw ? gw.prize : t(interaction.guildId, 'events.gw.untitled'), count: res.count }),
          components: []
        });
      }

      // التراجع عن إلغاء المشاركة
      if (interaction.isButton() && interaction.customId === 'gw_leave_cancel') {
        return interaction.update({
          content: t(interaction.guildId, 'events.gw.leave_cancelled'),
          components: []
        });
      }




      // 2.4 نظام التحقق الأمني (Verification Button & Direct Role)
      if (interaction.isButton() && (interaction.customId === 'btn_start_verification' || interaction.customId === 'btn_quick_verify' || interaction.customId === 'verify_button' || interaction.customId === 'verify_member')) {
        const settings = db.getGuildSettings(interaction.guild.id);
        const roleId = settings.verify_role || settings.verification_role;
        if (!roleId) {
          return interaction.reply({ content: t(interaction.guildId, 'events.verify.no_role'), flags: 64 });
        }
        const verifiedRole = interaction.guild.roles.cache.get(roleId) || await interaction.guild.roles.fetch(roleId).catch(() => null);
        if (!verifiedRole) {
          return interaction.reply({ content: t(interaction.guildId, 'events.verify.role_missing'), flags: 64 });
        }
        if (interaction.member.roles.cache.has(verifiedRole.id)) {
          return interaction.reply({ content: t(interaction.guildId, 'events.verify.already'), flags: 64 });
        }

        // فحص عمر الحساب (Anti-Alt Check)
        if (settings.anti_alt_days && settings.anti_alt_days > 0) {
          const accountAgeDays = (Date.now() - interaction.user.createdTimestamp) / (1000 * 60 * 60 * 24);
          if (accountAgeDays < settings.anti_alt_days) {
            return interaction.reply({
              content: t(interaction.guildId, 'events.verify.young', { days: settings.anti_alt_days, age: Math.floor(accountAgeDays) }),
              flags: 64
            });
          }
        }

        if (settings.verification_type === 'captcha') {
          const num1 = Math.floor(Math.random() * 9) + 1;
          const num2 = Math.floor(Math.random() * 9) + 1;
          const answer = num1 + num2;
          const modal = new ModalBuilder()
            .setCustomId(`captcha_verify_${answer}`)
            .setTitle(t(interaction.guildId, 'events.verify.captcha_title'));
          const captchaInput = new TextInputBuilder()
            .setCustomId('captcha_answer')
            .setLabel(t(interaction.guildId, 'events.verify.captcha_label', { a: num1, b: num2 }))
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(t(interaction.guildId, 'events.verify.captcha_ph'))
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(3);
          modal.addComponents(new ActionRowBuilder().addComponents(captchaInput));
          return interaction.showModal(modal);
        } else if (settings.verification_type === 'code') {
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          let code = '';
          for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));

          const modal = new ModalBuilder()
            .setCustomId(`code_verify_${code}`)
            .setTitle(t(interaction.guildId, 'events.verify.code_title'));
          const codeInput = new TextInputBuilder()
            .setCustomId('code_answer')
            .setLabel(t(interaction.guildId, 'events.verify.code_label', { code }))
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(code)
            .setRequired(true)
            .setMinLength(5)
            .setMaxLength(5);
          modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
          return interaction.showModal(modal);
        } else {
          await interaction.deferReply({ flags: 64 }).catch(() => { });
          try {
            await interaction.member.roles.add(verifiedRole);
            if (settings.unverified_role) {
              const unverifiedRole = interaction.guild.roles.cache.get(settings.unverified_role);
              if (unverifiedRole && interaction.member.roles.cache.has(unverifiedRole.id)) {
                await interaction.member.roles.remove(unverifiedRole).catch(() => { });
              }
            }

            if (settings.log_channel) {
              const logCh = interaction.guild.channels.cache.get(settings.log_channel);
              if (logCh) {
                logCh.send({
                  embeds: [new EmbedBuilder()
                    .setColor('#2ECC71')
                    .setTitle(t(interaction.guildId, 'events.verify.log_title'))
                    .addFields(
                      { name: t(interaction.guildId, 'events.verify.log_member'), value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                      { name: t(interaction.guildId, 'events.verify.log_role'), value: `${verifiedRole.name}`, inline: true },
                      { name: t(interaction.guildId, 'events.verify.log_joined'), value: `<t:${Math.floor(interaction.member.joinedTimestamp / 1000)}:R>`, inline: true }
                    )
                    .setTimestamp()
                  ]
                }).catch(() => { });
              }
            }

            return interaction.editReply({
              content: t(interaction.guildId, 'events.verify.done', { role: verifiedRole.name })
            });
          } catch (err) {
            logger.error('فشل في إعطاء رتبة التحقق:', err);
            return interaction.editReply({ content: t(interaction.guildId, 'events.verify.role_error') });
          }
        }
      }

      // معالجة إجابة الكابتشا الحسابية والنصية (Captcha & Code Modal Submit)
      if (interaction.isModalSubmit() && (interaction.customId.startsWith('captcha_verify_') || interaction.customId.startsWith('code_verify_'))) {
        await interaction.deferReply({ flags: 64 }).catch(() => { });
        const isCode = interaction.customId.startsWith('code_verify_');
        const correctVal = interaction.customId.split('_')[2];
        const userVal = isCode
          ? interaction.fields.getTextInputValue('code_answer').trim().toUpperCase()
          : parseInt(interaction.fields.getTextInputValue('captcha_answer'));

        const isMatch = isCode ? (userVal === correctVal) : (userVal === parseInt(correctVal));
        const settings = db.getGuildSettings(interaction.guild.id);

        if (isMatch) {
          const verifiedRole = interaction.guild.roles.cache.get(settings.verification_role);
          if (verifiedRole) {
            try {
              await interaction.member.roles.add(verifiedRole);
              if (settings.unverified_role) {
                const unverifiedRole = interaction.guild.roles.cache.get(settings.unverified_role);
                if (unverifiedRole && interaction.member.roles.cache.has(unverifiedRole.id)) {
                  await interaction.member.roles.remove(unverifiedRole).catch(() => { });
                }
              }

              if (settings.log_channel) {
                const logCh = interaction.guild.channels.cache.get(settings.log_channel);
                if (logCh) {
                  logCh.send({
                    embeds: [new EmbedBuilder()
                      .setColor('#2ECC71')
                      .setTitle(t(interaction.guildId, 'events.verify.log_title2'))
                      .addFields(
                        { name: t(interaction.guildId, 'events.verify.log_member'), value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                        { name: t(interaction.guildId, 'events.verify.log_type'), value: isCode ? t(interaction.guildId, 'events.verify.type_code') : t(interaction.guildId, 'events.verify.type_captcha'), inline: true },
                        { name: t(interaction.guildId, 'events.verify.log_age'), value: `<t:${Math.floor(interaction.user.createdTimestamp / 1000)}:R>`, inline: true }
                      )
                      .setTimestamp()
                    ]
                  }).catch(() => { });
                }
              }

              return interaction.editReply({
                content: t(interaction.guildId, 'events.verify.correct', { member: interaction.member })
              });
            } catch {
              return interaction.editReply({ content: t(interaction.guildId, 'events.verify.role_error2') });
            }
          }
        } else {
          return interaction.editReply({
            content: t(interaction.guildId, 'events.verify.wrong')
          });
        }
      }

      // 2.5 التعامل مع زر الاشتراك في القيف أواي (Giveaways Pro)
      if (interaction.isButton() && interaction.customId === 'join_giveaway') {
        await interaction.deferReply({ flags: 64 }).catch(() => { });
        const giveaway = db.getGiveaway(interaction.message.id);
        if (!giveaway || giveaway.ended) {
          return interaction.editReply({ content: t(interaction.guildId, 'events.gwpro.ended') });
        }

        const entries = db.getGiveawayEntries(interaction.message.id);
        const hasJoined = entries.includes(interaction.user.id);

        if (hasJoined) {
          const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`slash_gw_leave_confirm_${interaction.message.id}`)
              .setLabel(t(interaction.guildId, 'events.gw.leave_confirm_label'))
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🗑️'),
            new ButtonBuilder()
              .setCustomId('gw_leave_cancel')
              .setLabel(t(interaction.guildId, 'events.gw.leave_cancel_label'))
              .setStyle(ButtonStyle.Secondary)
          );

          return interaction.editReply({
            content: t(interaction.guildId, 'events.gw.leave_confirm_text', { prize: giveaway.prize }),
            components: [confirmRow]
          });
        } else {
          if (giveaway.required_role && !interaction.member.roles.cache.has(giveaway.required_role)) {
            return interaction.editReply({
              content: t(interaction.guildId, 'events.gwpro.need_role', { role: giveaway.required_role })
            });
          }

          if (giveaway.min_account_age > 0) {
            const ageDays = (Date.now() - interaction.user.createdTimestamp) / (1000 * 60 * 60 * 24);
            if (ageDays < giveaway.min_account_age) {
              return interaction.editReply({
                content: t(interaction.guildId, 'events.gwpro.low_age', { min: giveaway.min_account_age, age: Math.floor(ageDays) })
              });
            }
          }

          if (giveaway.min_level > 0) {
            const userDb = db.getUser(interaction.user.id, interaction.guild.id);
            if ((userDb.level || 0) < giveaway.min_level) {
              return interaction.editReply({
                content: t(interaction.guildId, 'events.gwpro.low_level', { min: giveaway.min_level, level: userDb.level || 0 })
              });
            }
          }

          db.addGiveawayEntry(interaction.message.id, interaction.user.id);
          const newEntries = db.getGiveawayEntries(interaction.message.id);
          const hasBonus = giveaway.extra_role && interaction.member.roles.cache.has(giveaway.extra_role);

          const newRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('join_giveaway')
              .setLabel(t(interaction.guildId, 'events.gw.join_btn', { count: newEntries.length }))
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('view_giveaway_entries')
              .setLabel(t(interaction.guildId, 'events.gw.entries_btn'))
              .setStyle(ButtonStyle.Secondary)
          );
          await interaction.message.edit({ components: [newRow] }).catch(() => { });

          return interaction.editReply({
            content: t(interaction.guildId, 'events.gwpro.joined', { bonus: hasBonus ? t(interaction.guildId, 'events.gwpro.bonus') : '' })
          });
        }
      }

      // 2.6 استعراض المشتركين في القيف أواي
      if (interaction.isButton() && interaction.customId === 'view_giveaway_entries') {
        await interaction.deferReply({ flags: 64 }).catch(() => { });
        const giveaway = db.getGiveaway(interaction.message.id);
        if (!giveaway) {
          return interaction.editReply({ content: t(interaction.guildId, 'events.gwpro.not_found') });
        }
        const entries = db.getGiveawayEntries(interaction.message.id);
        if (entries.length === 0) {
          return interaction.editReply({ content: t(interaction.guildId, 'events.gwpro.no_entries') });
        }

        const topEntries = entries.slice(0, 30).map((id, i) => `${i + 1}. <@${id}>`).join('\n');
        const countText = entries.length > 30 ? t(interaction.guildId, 'events.gwpro.entries_more', { n: entries.length - 30 }) : '';

        return interaction.editReply({
          content: t(interaction.guildId, 'events.gwpro.entries_list', { count: entries.length, list: topEntries, more: countText })
        });
      }

      // 3. التعامل مع أزرار وقوائم التذاكر المخصصة (Custom Tickets)
      const isTicketButton = interaction.isButton() && (interaction.customId === 'open_ticket' || interaction.customId.startsWith('ticket_open_'));
      const isTicketSelect = interaction.isStringSelectMenu() && interaction.customId.startsWith('ticket_select_');

      if (isTicketButton || isTicketSelect) {
        await interaction.deferReply({ flags: 64 }).catch(() => { });

        let panelId = null;
        let selectedCategoryType = 'General';
        let categoryLabel = 'Ticket';

        if (interaction.isButton() && interaction.customId.startsWith('ticket_open_')) {
          panelId = interaction.customId.replace('ticket_open_', '');
        } else if (interaction.isStringSelectMenu()) {
          panelId = interaction.customId.replace('ticket_select_', '');
          selectedCategoryType = interaction.values[0];

          const selectedOption = interaction.component?.options?.find(o => o.value === selectedCategoryType);
          if (selectedOption) {
            categoryLabel = selectedOption.label || selectedCategoryType;
          } else {
            categoryLabel = selectedCategoryType;
          }
        }

        const panel = panelId ? db.getTicketPanel(panelId) : null;
        const settings = db.getGuildSettings(interaction.guild.id);

        let catConfig = null;
        if (panel?.categories_json) {
          try {
            const parsedCats = JSON.parse(panel.categories_json);
            catConfig = parsedCats[selectedCategoryType];
          } catch { }
        }

        const cleanCategory = selectedCategoryType.replace(/[^a-zA-Z0-9\u0621-\u064A]/g, '-').slice(0, 15);
        const existingTicket = interaction.guild.channels.cache.find(
          c => c.name === `ticket-${interaction.user.username.toLowerCase()}` ||
            c.name === `ticket-${cleanCategory}-${interaction.user.username.toLowerCase()}` ||
            c.name.startsWith(`ticket-`) && c.name.endsWith(interaction.user.id.slice(-4))
        );

        if (existingTicket) {
          return interaction.editReply({
            content: t(interaction.guildId, 'events.ticket.exists', { channel: existingTicket.id })
          });
        }

        const supportRoleId = catConfig?.role || panel?.support_role || settings.support_role || settings.ticket_role;
        const categoryId = catConfig?.category || panel?.category_id || settings.ticket_category;

        // Auto-increment ticket counter
        let ticketNum = 1;
        try {
          ticketNum = (settings.ticket_counter || 0) + 1;
          db.setGuildSetting(interaction.guild.id, 'ticket_counter', ticketNum);
        } catch (e) {}

        const channelName = `ticket-${ticketNum}`;

        const permissionOverwrites = [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.EmbedLinks
            ]
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ManageMessages,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.AttachFiles
            ]
          }
        ];

        if (supportRoleId) {
          permissionOverwrites.push({
            id: supportRoleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.EmbedLinks
            ]
          });
        }

        const ticketChannel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: categoryId || null,
          permissionOverwrites
        });

        db.createTicket(interaction.guild.id, ticketChannel.id, interaction.user.id, selectedCategoryType);

        // Date string formatted like "Thursday, September 3, 2026 7:07 PM"
        const now = new Date();
        const formattedDate = now.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }) + '\n' + now.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });

        // Head Admin / Support display tag
        const adminTag = supportRoleId ? `<@&${supportRoleId}>` : 'None';

        // Welcome Embed - Exact match to Image 3
        const welcomeEmbed = new EmbedBuilder()
          .setColor('#06070a')
          .addFields(
            { name: '[ 👤 ] : Ticket\nOwner', value: `<@${interaction.user.id}>`, inline: true },
            { name: '[ 🛡️ ] : Ticket\nAdmins', value: adminTag, inline: true },
            { name: '[ 📅 ] : Ticket Date', value: formattedDate, inline: false },
            { name: '[ 🔢 ] : Ticket\nNumber', value: `\`\`\`${ticketNum}\`\`\``, inline: true },
            { name: '[ ❓ ] : Ticket\nSection', value: `\`\`\`${categoryLabel}\`\`\``, inline: true }
          );

        // Set thumbnail (User Avatar or Server Icon)
        welcomeEmbed.setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }));

        // Check if server or panel has a welcome image
        const welcomeImg = panel?.welcome_image || settings.ticket_welcome_image;
        if (welcomeImg) {
          welcomeEmbed.setImage(welcomeImg);
        }

        const ticketButtonsRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_options_menu_btn')
            .setLabel('Ticket Options')
            .setEmoji('🗃️')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('claim_ticket')
            .setLabel('Claim')
            .setEmoji('💼')
            .setStyle(ButtonStyle.Secondary)
        );

        const mentionContent = `${interaction.user} ${supportRoleId ? `| <@&${supportRoleId}>` : ''}`;

        const pinnedMsg = await ticketChannel.send({
          content: mentionContent,
          embeds: [welcomeEmbed],
          components: [ticketButtonsRow]
        });

        // Auto-pin message (Image 3: Wicks pinned a message to this channel)
        try {
          await pinnedMsg.pin();
        } catch (e) {}

        // Ephemeral reply (Image 4: Ticket created: # 🎫 • 4)
        return interaction.editReply({
          content: `Ticket created: <#${ticketChannel.id}>`
        });
      }

      // ==========================================
      // 4. خيارات التذكرة (Ticket Options Dropdown - Image 5)
      // ==========================================
      if (interaction.isButton() && interaction.customId === 'ticket_options_menu_btn') {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('ticket_actions_select')
          .setPlaceholder('Choose a Ticket Action')
          .addOptions([
            {
              label: 'Close with Reason',
              description: 'Close the ticket with reason',
              value: 'action_close_reason',
              emoji: '🔒'
            },
            {
              label: 'Add User to Ticket',
              description: 'Add a user to the ticket',
              value: 'action_add_user',
              emoji: '👥'
            },
            {
              label: 'Member PM Reminder',
              description: 'Send a PM reminder to the ticket creator',
              value: 'action_pm_reminder',
              emoji: '✉️'
            },
            {
              label: 'Request Ticket Copy',
              description: 'Request a copy of the ticket',
              value: 'action_request_copy',
              emoji: '📄'
            }
          ]);

        const actionRow = new ActionRowBuilder().addComponents(selectMenu);

        return interaction.reply({
          components: [actionRow],
          flags: 64
        });
      }

      // 4.1 التعامل مع اختيار خيار من قائمة خيارات التذكرة (Dropdown Actions)
      if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_actions_select') {
        const action = interaction.values[0];
        const ticketData = db.getTicket(interaction.channel.id);

        if (!ticketData) {
          return interaction.reply({ content: t(interaction.guildId, 'events.ticket.action_not_ticket'), flags: 64 });
        }

        // A. Close with Reason
        if (action === 'action_close_reason') {
          const modal = new ModalBuilder()
            .setCustomId('modal_close_ticket_reason')
            .setTitle('Close Ticket with Reason');

          const reasonInput = new TextInputBuilder()
            .setCustomId('ticket_close_reason_input')
            .setLabel(t(interaction.guildId, 'events.ticket.close_label'))
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder(t(interaction.guildId, 'events.ticket.close_ph'))
            .setRequired(false)
            .setMaxLength(500);

          modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
          return interaction.showModal(modal);
        }

        // B. Add User to Ticket
        if (action === 'action_add_user') {
          const userSelect = new UserSelectMenuBuilder()
            .setCustomId('ticket_user_add_select')
            .setPlaceholder(t(interaction.guildId, 'events.ticket.add_user_ph'))
            .setMinValues(1)
            .setMaxValues(1);

          return interaction.reply({
            content: t(interaction.guildId, 'events.ticket.add_user_prompt'),
            components: [new ActionRowBuilder().addComponents(userSelect)],
            flags: 64
          });
        }

        // C. Member PM Reminder
        if (action === 'action_pm_reminder') {
          await interaction.deferReply({ flags: 64 });
          try {
            const ticketOwner = await client.users.fetch(ticketData.user_id).catch(() => null);
            if (!ticketOwner) {
              return interaction.editReply({ content: t(interaction.guildId, 'events.ticket.owner_not_found') });
            }

            const reminderEmbed = new EmbedBuilder()
              .setColor('#06070a')
              .setTitle(t(interaction.guildId, 'events.ticket.reminder_title'))
              .setDescription(t(interaction.guildId, 'events.ticket.reminder_desc', { user: ticketOwner.username, guild: interaction.guild.name, channel: interaction.channel.id }))
              .setTimestamp();

            await ticketOwner.send({ embeds: [reminderEmbed] });
            await interaction.channel.send({ content: t(interaction.guildId, 'events.ticket.reminder_sent', { user: ticketData.user_id }) });
            return interaction.editReply({ content: t(interaction.guildId, 'events.ticket.reminder_done') });
          } catch (e) {
            return interaction.editReply({ content: t(interaction.guildId, 'events.ticket.reminder_fail') });
          }
        }

        // D. Request Ticket Copy (Transcript directly to user)
        if (action === 'action_request_copy') {
          await interaction.deferReply({ flags: 64 });
          try {
            const { generateHtmlTranscript } = require('../../utils/transcript');
            const transcriptResult = await generateHtmlTranscript(interaction.channel);
            if (transcriptResult?.attachment) {
              await interaction.user.send({
                content: t(interaction.guildId, 'events.ticket.copy_content', { channel: interaction.channel.name, guild: interaction.guild.name }),
                files: [transcriptResult.attachment]
              }).catch(() => {});
              return interaction.editReply({ content: t(interaction.guildId, 'events.ticket.copy_done') });
            } else {
              return interaction.editReply({ content: t(interaction.guildId, 'events.ticket.copy_fail') });
            }
          } catch (e) {
            return interaction.editReply({ content: t(interaction.guildId, 'events.ticket.copy_error') });
          }
        }
      }

      // 4.2 إضافة مستخدم بعد اختياره من UserSelect
      if (interaction.isUserSelectMenu() && interaction.customId === 'ticket_user_add_select') {
        const targetUserId = interaction.values[0];
        await interaction.deferReply({ flags: 64 });

        try {
          await interaction.channel.permissionOverwrites.edit(targetUserId, {
            ViewChannel: true,
            SendMessages: true,
            AttachFiles: true,
            ReadMessageHistory: true,
            EmbedLinks: true
          });
          await interaction.channel.send({ content: t(interaction.guildId, 'events.ticket.user_added', { user: targetUserId, staff: interaction.user }) });
          return interaction.editReply({ content: t(interaction.guildId, 'events.ticket.user_added_ok', { user: targetUserId }) });
        } catch (e) {
          return interaction.editReply({ content: t(interaction.guildId, 'events.ticket.user_add_fail') });
        }
      }

      // ==========================================
      // 5. استلام التذكرة (Claim Ticket)
      // ==========================================
      if (interaction.isButton() && interaction.customId === 'claim_ticket') {
        const ticketData = db.getTicket(interaction.channel.id);
        const settings = db.getGuildSettings(interaction.guild.id);
        const supportRoleId = settings.support_role || settings.ticket_role || settings.staff_role;

        const isStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
          interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
          (supportRoleId && interaction.member.roles.cache.has(supportRoleId));

        // منع صاحب التذكرة من استلام تذكرته بنفسه (Image 5: "You cannot claim your own ticket.")
        if (ticketData?.user_id === interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: 'You cannot claim your own ticket.', flags: 64 });
        }

        if (!isStaff) {
          return interaction.reply({ content: t(interaction.guildId, 'events.ticket.claim_staff'), flags: 64 });
        }

        if (ticketData?.claimed_by) {
          return interaction.reply({ content: t(interaction.guildId, 'events.ticket.claim_taken', { user: ticketData.claimed_by }), flags: 64 });
        }

        db.claimTicket(interaction.channel.id, interaction.user.id);
        if (db.recordStaffAction) {
          db.recordStaffAction(interaction.guild.id, interaction.user.id, 'ticket_claim', ticketData?.user_id || null, 'استلام تذكرة');
        }
        if (db.touchStaffShiftAction) db.touchStaffShiftAction(interaction.guild.id, interaction.user.id);

        // تعديل الصلاحيات
        await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
          ViewChannel: true,
          SendMessages: true,
          AttachFiles: true,
          ReadMessageHistory: true
        }).catch(() => {});

        const updatedButtonsRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_options_menu_btn')
            .setLabel('Ticket Options')
            .setEmoji('🗃️')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('unclaim_ticket')
            .setLabel('Unclaim')
            .setEmoji('↩️')
            .setStyle(ButtonStyle.Secondary)
        );

        const claimEmbed = new EmbedBuilder()
          .setColor('#10b981')
          .setDescription(t(interaction.guildId, 'events.ticket.claimed', { user: interaction.user }))
          .setTimestamp();

        await interaction.reply({ embeds: [claimEmbed] });
        return interaction.message.edit({ components: [updatedButtonsRow] }).catch(() => {});
      }

      // 5.5 إلغاء استلام التذكرة (Unclaim Ticket)
      if (interaction.isButton() && interaction.customId === 'unclaim_ticket') {
        const ticketData = db.getTicket(interaction.channel.id);
        const isClaimerOrAdmin = ticketData?.claimed_by === interaction.user.id || interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isClaimerOrAdmin) {
          return interaction.reply({ content: t(interaction.guildId, 'events.ticket.unclaim_no_perm'), flags: 64 });
        }

        db.unclaimTicket(interaction.channel.id);

        const claimRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_options_menu_btn')
            .setLabel('Ticket Options')
            .setEmoji('🗃️')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('claim_ticket')
            .setLabel('Claim')
            .setEmoji('💼')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ content: t(interaction.guildId, 'events.ticket.unclaimed', { user: interaction.user }) });
        return interaction.message.edit({ components: [claimRow] }).catch(() => {});
      }

      // ==========================================
      // 5.5 معالجة قبول أو رفض أو دراسة الاقتراح بعد إرسال النموذج (Suggestion Modal Submit)
      // ==========================================
      if (interaction.isModalSubmit() && (interaction.customId.startsWith('modal_sugg_accept_') || interaction.customId.startsWith('modal_sugg_reject_') || interaction.customId.startsWith('modal_sugg_consider_'))) {
        await interaction.deferReply({ flags: 64 }).catch(() => {});
        let actionType = 'accept';
        if (interaction.customId.startsWith('modal_sugg_reject_')) actionType = 'reject';
        if (interaction.customId.startsWith('modal_sugg_consider_')) actionType = 'consider';

        const prefix = `modal_sugg_${actionType}_`;
        const msgId = interaction.customId.replace(prefix, '');
        const defaultReasons = {
          accept: 'تمت الموافقة من قبل الإدارة',
          reject: 'تم الرفض من قبل الإدارة',
          consider: 'الفكرة مميزة وقيد الدراسة من قبل الفريق'
        };
        const reason = interaction.fields.getTextInputValue('sugg_decision_reason') || defaultReasons[actionType];

        const sugg = db.getSuggestion ? db.getSuggestion(msgId) : null;
        if (!sugg) {
          return interaction.editReply({ content: '❌ لم يتم العثور على بيانات هذا الاقتراح في قاعدة البيانات.' });
        }

        const statusMap = { accept: 'accepted', reject: 'rejected', consider: 'considered' };
        const newStatus = statusMap[actionType];
        db.updateSuggestionStatus(msgId, newStatus, reason, interaction.user.id);

        if (db.recordStaffAction) {
          db.recordStaffAction(interaction.guild.id, interaction.user.id, `sugg_${newStatus}`, sugg.user_id, reason);
        }

        const { buildSuggestionEmbed, buildSuggestionComponents } = require('../../utils/suggestionBuilder');

        // تحديث رسالة الاقتراح الأصلية
        try {
          const suggChannel = interaction.guild.channels.cache.get(sugg.channel_id) || await interaction.guild.channels.fetch(sugg.channel_id).catch(() => null);
          if (suggChannel) {
            const targetMsg = await suggChannel.messages.fetch(sugg.message_id).catch(() => null);
            if (targetMsg) {
              const suggAuthor = await client.users.fetch(sugg.user_id).catch(() => null);
              const userObj = suggAuthor || { tag: t(interaction.guildId, 'suggest.unknown_member'), username: t(interaction.guildId, 'suggest.unknown_member') };

              let upvotesList = [];
              let downvotesList = [];
              try { upvotesList = JSON.parse(sugg.upvotes || '[]'); } catch(e) {}
              try { downvotesList = JSON.parse(sugg.downvotes || '[]'); } catch(e) {}

              const updatedEmbed = buildSuggestionEmbed({
                user: userObj,
                content: sugg.content,
                title: sugg.title,
                code: sugg.id ? sugg.id.toString(36) : msgId.slice(-8),
                status: newStatus,
                upvotes: upvotesList.length,
                downvotes: downvotesList.length,
                createdAt: sugg.created_at ? sugg.created_at * 1000 : targetMsg.createdTimestamp,
                reviewerId: interaction.user.id,
                reason: reason,
                lang: interaction.guildId
              });

              // إذا تم القبول أو الرفض النهائي، نقفل الأزرار؛ إذا كانت قيد الدراسة تبقى الأزرار مفعلة
              const isFinal = newStatus === 'accepted' || newStatus === 'rejected';
              const newComponents = buildSuggestionComponents({
                upvotes: upvotesList.length,
                downvotes: downvotesList.length,
                disabled: isFinal,
                lang: interaction.guildId
              });

              await targetMsg.edit({ embeds: [updatedEmbed], components: newComponents });
            }
          }
        } catch (editErr) {
          console.error('Error updating suggestion message:', editErr);
        }

        // إرسال إشعار في الخاص لصاحب الاقتراح
        try {
          const owner = await client.users.fetch(sugg.user_id).catch(() => null);
          if (owner) {
            const statusTitles = {
              accepted: t(interaction.guildId, 'suggest.notify.accepted'),
              rejected: t(interaction.guildId, 'suggest.notify.rejected'),
              considered: t(interaction.guildId, 'suggest.notify.considered')
            };
            const statusColors = {
              accepted: '#22c55e',
              rejected: '#ef4444',
              considered: '#3b82f6'
            };
            const notifyEmbed = new EmbedBuilder()
              .setColor(statusColors[newStatus] || '#9333ea')
              .setTitle(statusTitles[newStatus] || t(interaction.guildId, 'suggest.notify.default'))
              .setDescription(t(interaction.guildId, 'suggest.notify.desc', { user: owner.username, guild: interaction.guild.name, content: sugg.content.slice(0, 300), status: newStatus, reason }))
              .setTimestamp();
            await owner.send({ embeds: [notifyEmbed] }).catch(() => {});
          }
        } catch (e) {}

        const actionLabels = { accept: t(interaction.guildId, 'suggest.button.accept'), reject: t(interaction.guildId, 'suggest.button.reject'), consider: t(interaction.guildId, 'suggest.action.consider_label') };
        return interaction.editReply({
          content: t(interaction.guildId, 'suggest.action.done', { action: actionLabels[actionType] })
        });
      }

      // ==========================================
      // 6. إغلاق التذكرة واللوق الاحترافي (Close with Reason & Log Embed - Image 1)
      // ==========================================
      if (interaction.isModalSubmit() && interaction.customId === 'modal_close_ticket_reason') {
        await interaction.deferReply().catch(() => {});
        const reason = interaction.fields.getTextInputValue('ticket_close_reason_input') || t(interaction.guildId, 'events.ticket.close_no_reason');
        const ticketData = db.getTicket(interaction.channel.id);
        const settings = db.getGuildSettings(interaction.guild.id);
        const staffClaimerId = ticketData?.claimed_by || null;

        db.closeTicket(interaction.channel.id, interaction.user.id, reason);

        // تسجيل نشاط الإدارة
        if (db.recordStaffAction) {
          db.recordStaffAction(interaction.guild.id, interaction.user.id, 'ticket_close', ticketData ? ticketData.user_id : null, reason);
        }

        // توليد Transcript HTML
        let transcriptResult = null;
        try {
          const { generateHtmlTranscript } = require('../../utils/transcript');
          transcriptResult = await generateHtmlTranscript(interaction.channel);
          if (transcriptResult) {
            db.saveTranscript(interaction.guild.id, interaction.channel.id, ticketData?.user_id || 'unknown', interaction.user.id, reason, transcriptResult.html);
          }
        } catch (tErr) {}

        // Format dates exactly as shown in Image 1
        const createdDateObj = ticketData?.created_at ? new Date(ticketData.created_at * 1000) : new Date();
        const closedDateObj = new Date();

        const formatFullDateTime = (d) => {
          return d.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }) + '\n' + d.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
        };

        const openTimeFormatted = formatFullDateTime(createdDateObj);
        const closeTimeFormatted = formatFullDateTime(closedDateObj);

        const noReasonEn = t('EN', 'events.ticket.close_no_reason');
        const noReasonAr = t('AR', 'events.ticket.close_no_reason');
        const closeReasonText = (reason && reason.trim() !== noReasonAr && reason.trim() !== noReasonEn) ? reason : t(interaction.guildId, 'events.ticket.close_no_reason');

        // إرسال اللوق لقناة السجلات (Exact 1:1 match to Wicks screenshot)
        const logChannelId = settings.ticket_log_channel || settings.log_channel;
        if (logChannelId) {
          try {
            const logChannel = interaction.guild.channels.cache.get(logChannelId) || await interaction.guild.channels.fetch(logChannelId).catch(() => null);
            if (logChannel && logChannel.isTextBased()) {
              const closeLogEmbed = new EmbedBuilder()
                .setColor('#06070a')
                .setAuthor({
                  name: interaction.guild.name,
                  iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
                })
                .setTitle('Ticket Closed')
                .addFields(
                  { name: 'Opened By', value: ticketData?.user_id ? `<@${ticketData.user_id}>` : 'Unknown', inline: true },
                  { name: 'Claimed By', value: staffClaimerId ? `<@${staffClaimerId}>` : 'No one', inline: true },
                  { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
                  { name: 'Open Time', value: openTimeFormatted, inline: true },
                  { name: 'Close Time', value: closeTimeFormatted, inline: true },
                  { name: '\u200B', value: '\u200B', inline: true },
                  { name: 'Close Reason', value: `\`\`\`fix\n${closeReasonText}\n\`\`\``, inline: false }
                )
                .setThumbnail('https://cdn.discordapp.com/emojis/1215354964654559282.png'); // Document icon

              const viewTranscriptBtnRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`view_transcript_${interaction.channel.id}`)
                  .setLabel('View Ticket')
                  .setEmoji('↗️')
                  .setStyle(ButtonStyle.Secondary)
              );

              const files = transcriptResult?.attachment ? [transcriptResult.attachment] : [];
              await logChannel.send({ embeds: [closeLogEmbed], components: [viewTranscriptBtnRow], files }).catch(() => {});
            }
          } catch (logErr) {}
        }

        // إرسال نسخة في الخاص لصاحب التذكرة مع أزرار التقييم
        if (ticketData?.user_id) {
          try {
            const ticketOwner = await client.users.fetch(ticketData.user_id).catch(() => null);
            if (ticketOwner) {
              const ratingEmbed = new EmbedBuilder()
                .setColor('#06070a')
                .setTitle(t(interaction.guildId, 'events.ticket.rating_title'))
                .setDescription(t(interaction.guildId, 'events.ticket.rating_desc', { user: ticketOwner.username, guild: interaction.guild.name, reason }))
                .setFooter({ text: t(interaction.guildId, 'events.ticket.rating_footer') })
                .setTimestamp();

              const ratingRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`rate_ticket_1_${interaction.channel.id}_${staffClaimerId || '0'}_${interaction.guild.id}`).setLabel('⭐ 1').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`rate_ticket_2_${interaction.channel.id}_${staffClaimerId || '0'}_${interaction.guild.id}`).setLabel('⭐ 2').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`rate_ticket_3_${interaction.channel.id}_${staffClaimerId || '0'}_${interaction.guild.id}`).setLabel('⭐ 3').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`rate_ticket_4_${interaction.channel.id}_${staffClaimerId || '0'}_${interaction.guild.id}`).setLabel('⭐ 4').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`rate_ticket_5_${interaction.channel.id}_${staffClaimerId || '0'}_${interaction.guild.id}`).setLabel(t(interaction.guildId, 'events.ticket.rate_5')).setStyle(ButtonStyle.Success)
              );

              const userFiles = transcriptResult?.attachment ? [transcriptResult.attachment] : [];
              await ticketOwner.send({ embeds: [ratingEmbed], components: [ratingRow], files: userFiles }).catch(() => {});
            }
          } catch (e) {}
        }

        await interaction.editReply({ content: t(interaction.guildId, 'events.ticket.closed') });

        setTimeout(async () => {
          try {
            db.deleteTicket(interaction.channel.id);
            await interaction.channel.delete().catch(() => {});
          } catch (err) {}
        }, 3000);
        return;
      }

      // زر عرض التذكرة من اللوق
      if (interaction.isButton() && interaction.customId.startsWith('view_transcript_')) {
        const ticketChannelId = interaction.customId.replace('view_transcript_', '');
        const trans = db.getTranscript(ticketChannelId);
        if (trans && trans.html_content) {
          const buffer = Buffer.from(trans.html_content, 'utf-8');
          const attachment = new AttachmentBuilder(buffer, { name: `transcript-${ticketChannelId}.html` });
          return interaction.reply({
            content: t(interaction.guildId, 'events.ticket.view_transcript'),
            files: [attachment],
            flags: 64
          });
        } else {
          return interaction.reply({ content: t(interaction.guildId, 'events.ticket.transcript_missing'), flags: 64 });
        }
      }

      // 7. زر التحقق وتوثيق الحساب (Verification System)
      if (interaction.isButton() && interaction.customId === 'verify_user_btn') {
        await interaction.deferReply({ flags: 64 }).catch(() => { });
        const settings = db.getGuildSettings(interaction.guild.id);
        if (!settings.verify_role) {
          return interaction.editReply({ content: t(interaction.guildId, 'events.verify2.no_role') });
        }

        const role = interaction.guild.roles.cache.get(settings.verify_role);
        if (!role) {
          return interaction.editReply({ content: t(interaction.guildId, 'events.verify2.role_missing') });
        }

        if (interaction.member.roles.cache.has(role.id)) {
          return interaction.editReply({ content: t(interaction.guildId, 'events.verify2.already') });
        }

        try {
          await interaction.member.roles.add(role);
          return interaction.editReply({ content: t(interaction.guildId, 'events.verify2.done', { role: role.name }) });
        } catch (err) {
          return interaction.editReply({ content: t(interaction.guildId, 'events.verify2.error') });
        }
      }

      // 8. الضغط على نجوم التقييم (Ticket Rating Stars Button)
      if (interaction.isButton() && interaction.customId.startsWith('rate_ticket_')) {
        const parts = interaction.customId.split('_');
        const rating = parseInt(parts[2], 10) || 5;
        const ticketId = parts[3] || '0';
        const staffId = parts[4] || '0';
        const guildId = parts[5] || interaction.guildId;

        const modal = new ModalBuilder()
          .setCustomId(`modal_review_${rating}_${ticketId}_${staffId}_${guildId}`)
          .setTitle(t(interaction.guildId, 'events.ticket.rate_title', { rating }));

        const commentInput = new TextInputBuilder()
          .setCustomId('review_comment')
          .setLabel(t(interaction.guildId, 'events.ticket.rate_label'))
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(t(interaction.guildId, 'events.ticket.rate_ph'))
          .setRequired(false)
          .setMaxLength(500);

        const row = new ActionRowBuilder().addComponents(commentInput);
        modal.addComponents(row);

        return interaction.showModal(modal);
      }

      // 9. إرسال نموذج التقييم (Ticket Rating Modal Submit)
      if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_review_')) {
        await interaction.deferReply({ flags: 64 }).catch(() => { });
        const parts = interaction.customId.split('_');
        const rating = parseInt(parts[2], 10) || 5;
        const ticketId = parts[3];
        const staffId = parts[4] !== '0' ? parts[4] : null;
        const guildId = parts[5] || interaction.guildId;
        const comment = interaction.fields.getTextInputValue('review_comment') || t(interaction.guildId, 'events.ticket.rate_no_comment');

        if (db.addTicketRating) {
          db.addTicketRating(guildId, ticketId, interaction.user.id, staffId || 'staff', rating, comment);
        }

        const settings = db.getGuildSettings(guildId);
        const feedbackChannelId = settings?.ticket_feedback_channel || settings?.ticket_rating_channel || settings?.ticket_log_channel || settings?.log_channel || settings?.feedback_channel;
        if (feedbackChannelId) {
          const targetGuild = client.guilds.cache.get(guildId);
          const feedbackChan = targetGuild?.channels.cache.get(feedbackChannelId);
          if (feedbackChan && feedbackChan.isTextBased()) {
            const starsEmoji = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
            const feedbackEmbed = new EmbedBuilder()
              .setColor(rating >= 4 ? (config.colors.success || '#10b981') : (rating === 3 ? (config.colors.warning || '#f59e0b') : (config.colors.danger || '#ef4444')))
              .setTitle(t(interaction.guildId, 'events.ticket.feedback_title'))
              .addFields(
                { name: t(interaction.guildId, 'events.ticket.feedback_member'), value: `<@${interaction.user.id}> (\`${interaction.user.tag}\`)`, inline: true },
                { name: t(interaction.guildId, 'events.ticket.feedback_staff'), value: staffId ? `<@${staffId}>` : t(interaction.guildId, 'events.ticket.feedback_team'), inline: true },
                { name: t(interaction.guildId, 'events.ticket.feedback_level'), value: `\`${starsEmoji}\` (${rating}/5)`, inline: true },
                { name: t(interaction.guildId, 'events.ticket.feedback_comment'), value: `\`\`\`${comment}\`\`\`` }
              )
              .setFooter({ text: targetGuild.name, iconURL: targetGuild.iconURL({ dynamic: true }) || undefined })
              .setTimestamp();

            await feedbackChan.send({ embeds: [feedbackEmbed] }).catch(() => { });
          }
        }

        return interaction.editReply({ content: t(interaction.guildId, 'events.ticket.feedback_done') });
      }

      // ==========================================
      // 10. نظام التقديمات (Applications System Handlers)
      // ==========================================
      // ==========================================
      // 10. نظام التقديمات والتوظيف (Applications System Handlers)
      // ==========================================
      // فتح نموذج التقديم عبر اختيار من القائمة أو ضغطة زر
      if ((interaction.isStringSelectMenu() && interaction.customId === 'select_apply_form') || (interaction.isButton() && interaction.customId.startsWith('btn_apply_'))) {
        const appId = interaction.isStringSelectMenu() ? interaction.values[0] : interaction.customId.replace('btn_apply_', '');
        const app = db.getApplication(appId);

        if (!app || app.status !== 'open') {
          return interaction.reply({ content: t(interaction.guildId, 'events.app.closed'), flags: 64 });
        }

        let questions = [];
        try {
          questions = typeof app.questions === 'string' ? JSON.parse(app.questions) : app.questions;
        } catch (e) {
          questions = [{ text: t(interaction.guildId, 'events.app.q_fallback'), type: 'paragraph' }];
        }

        const modal = new ModalBuilder()
          .setCustomId(`modal_submit_app_${app.id}`)
          .setTitle(`📝 ${app.title.slice(0, 40)}`);

        questions.slice(0, 5).forEach((q, idx) => {
          const qText = typeof q === 'object' ? (q.text || t(interaction.guildId, 'events.app.q_default', { n: idx + 1 })) : String(q);
          const isShort = typeof q === 'object' && q.type === 'short';

          const input = new TextInputBuilder()
            .setCustomId(`q_${idx}`)
            .setLabel(qText.slice(0, 45))
            .setStyle(isShort ? TextInputStyle.Short : TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);
          modal.addComponents(new ActionRowBuilder().addComponents(input));
        });

        return interaction.showModal(modal);
      }

      // استلام إجابات التقديم وحفظها وإرسالها للإدارة
      if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_submit_app_')) {
        await interaction.deferReply({ flags: 64 }).catch(() => { });
        const appId = interaction.customId.replace('modal_submit_app_', '');
        const app = db.getApplication(appId);

        if (!app) {
          return interaction.editReply({ content: t(interaction.guildId, 'events.app.not_found') });
        }

        let questions = [];
        try {
          questions = typeof app.questions === 'string' ? JSON.parse(app.questions) : app.questions;
        } catch (e) {
          questions = [];
        }

        const answers = [];
        questions.slice(0, 5).forEach((q, idx) => {
          const qText = typeof q === 'object' ? (q.text || t(interaction.guildId, 'events.app.q_default', { n: idx + 1 })) : String(q);
          const ans = interaction.fields.getTextInputValue(`q_${idx}`) || t(interaction.guildId, 'events.app.no_answer');
          answers.push({ question: qText, answer: ans });
        });

        const submission = db.createSubmission(interaction.guild.id, app.id, interaction.user.id, answers);

        // إرسال الطلب لقناة السجلات / المراجعة
        const logChannelId = app.log_channel || db.getGuildSettings(interaction.guild.id)?.log_channel;
        if (logChannelId) {
          const logChan = interaction.guild.channels.cache.get(logChannelId);
          if (logChan) {
            const reviewEmbed = new EmbedBuilder()
              .setColor('#9333ea')
              .setTitle(t(interaction.guildId, 'events.app.review_title', { title: app.title, id: submission.id }))
              .setDescription(t(interaction.guildId, 'events.app.review_desc', { user: interaction.user, tag: interaction.user.tag, id: interaction.user.id, ts: submission.submitted_at }))
              .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
              .setFooter({ text: t(interaction.guildId, 'events.app.review_footer', { app: app.id }) })
              .setTimestamp();

            answers.forEach((item, i) => {
              reviewEmbed.addFields({
                name: t(interaction.guildId, 'events.app.field_q', { i: i + 1, q: item.question }),
                value: `\`\`\`${item.answer.slice(0, 1000)}\`\`\``
              });
            });

            const actionRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`btn_app_accept_${submission.id}`)
                .setLabel(t(interaction.guildId, 'events.app.btn_accept'))
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`btn_app_reject_${submission.id}`)
                .setLabel(t(interaction.guildId, 'events.app.btn_reject'))
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId(`btn_app_review_${submission.id}`)
                .setLabel(t(interaction.guildId, 'events.app.btn_review'))
                .setStyle(ButtonStyle.Secondary)
            );

            await logChan.send({ embeds: [reviewEmbed], components: [actionRow] }).catch(() => { });
          }
        }

        return interaction.editReply({
          content: t(interaction.guildId, 'events.app.received')
        });
      }

      // مراجعة طلب التقديم (Under Review)
      if (interaction.isButton() && interaction.customId.startsWith('btn_app_review_')) {
        const subId = interaction.customId.replace('btn_app_review_', '');
        const submission = db.getSubmission(subId);

        if (!submission) {
          return interaction.reply({ content: t(interaction.guildId, 'events.app.sub_missing'), flags: 64 });
        }

        const app = db.getApplication(submission.app_id);
        const reviewerRole = app?.reviewer_role;
        const hasPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || 
                        (reviewerRole && interaction.member.roles.cache.has(reviewerRole));

        if (!hasPerm) {
          return interaction.reply({ content: t(interaction.guildId, 'events.app.no_perm_review'), flags: 64 });
        }

        const oldEmbed = interaction.message.embeds[0];
        const updatedEmbed = EmbedBuilder.from(oldEmbed)
          .setColor('#eab308')
          .setTitle(oldEmbed.title.replace(/\[.*\]/, '').trim() + t(interaction.guildId, 'events.app.suffix_review'))
          .addFields({ name: t(interaction.guildId, 'events.app.field_review'), value: `${interaction.user} (<t:${Math.floor(Date.now() / 1000)}:R>)`, inline: false });

        return interaction.update({ embeds: [updatedEmbed] });
      }

      // قبول طلب التقديم (Accept Application)
      if (interaction.isButton() && interaction.customId.startsWith('btn_app_accept_')) {
        const subId = interaction.customId.replace('btn_app_accept_', '');
        const submission = db.getSubmission(subId);

        if (!submission || submission.status !== 'pending') {
          return interaction.reply({ content: t(interaction.guildId, 'events.app.already'), flags: 64 });
        }

        const app = db.getApplication(submission.app_id);
        const reviewerRole = app?.reviewer_role;
        const hasPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || 
                        (reviewerRole && interaction.member.roles.cache.has(reviewerRole));

        if (!hasPerm) {
          return interaction.reply({ content: t(interaction.guildId, 'events.app.no_perm_accept'), flags: 64 });
        }

        await interaction.deferUpdate().catch(() => { });
        db.updateSubmissionStatus(subId, 'accepted', interaction.user.id);
        db.addApplicationPoint(interaction.guild.id, interaction.user.id);

        // إعطاء الرتبة للمتقدم إن وجدت
        if (app && app.accepted_role) {
          const role = interaction.guild.roles.cache.get(app.accepted_role);
          const member = interaction.guild.members.cache.get(submission.user_id) || await interaction.guild.members.fetch(submission.user_id).catch(() => null);
          if (role && member) {
            await member.roles.add(role).catch(() => { });
          }
        }

        // إشعار العضو بالخاص
        const applicantUser = client.users.cache.get(submission.user_id) || await client.users.fetch(submission.user_id).catch(() => null);
        if (applicantUser) {
          applicantUser.send({
            embeds: [new EmbedBuilder()
              .setColor('#10b981')
              .setTitle(t(interaction.guildId, 'events.app.dm_accept_title'))
              .setDescription(t(interaction.guildId, 'events.app.dm_accept_desc', { title: app ? app.title : t(interaction.guildId, 'events.app.rank_fallback'), guild: interaction.guild.name }))
              .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
              .setTimestamp()
            ]
          }).catch(() => { });
        }

        const oldEmbed = interaction.message.embeds[0];
        const updatedEmbed = EmbedBuilder.from(oldEmbed)
          .setColor('#10b981')
          .setTitle(oldEmbed.title.replace(/\[.*\]/, '').trim() + t(interaction.guildId, 'events.app.suffix_accepted'))
          .addFields({ name: t(interaction.guildId, 'events.app.field_accepted'), value: `${interaction.user} (<t:${Math.floor(Date.now() / 1000)}:R>)`, inline: false });

        return interaction.editReply({ embeds: [updatedEmbed], components: [] });
      }

      // فتح نافذة سبب الرفض (Reject Application Modal)
      if (interaction.isButton() && interaction.customId.startsWith('btn_app_reject_')) {
        const subId = interaction.customId.replace('btn_app_reject_', '');
        const submission = db.getSubmission(subId);

        if (!submission || submission.status !== 'pending') {
          return interaction.reply({ content: t(interaction.guildId, 'events.app.already'), flags: 64 });
        }

        const app = db.getApplication(submission.app_id);
        const reviewerRole = app?.reviewer_role;
        const hasPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || 
                        (reviewerRole && interaction.member.roles.cache.has(reviewerRole));

        if (!hasPerm) {
          return interaction.reply({ content: t(interaction.guildId, 'events.app.no_perm_reject'), flags: 64 });
        }

        const modal = new ModalBuilder()
          .setCustomId(`modal_reject_reason_${subId}`)
          .setTitle(t(interaction.guildId, 'events.app.reject_title'));

        const reasonInput = new TextInputBuilder()
          .setCustomId('reject_reason')
          .setLabel(t(interaction.guildId, 'events.app.reject_label'))
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(t(interaction.guildId, 'events.app.reject_ph'))
          .setRequired(false)
          .setMaxLength(500);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        return interaction.showModal(modal);
      }

      // معالجة سبب الرفض وإرساله للعضو
      if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_reject_reason_')) {
        await interaction.deferReply({ flags: 64 }).catch(() => { });
        const subId = interaction.customId.replace('modal_reject_reason_', '');
        const submission = db.getSubmission(subId);

        if (!submission || submission.status !== 'pending') {
          return interaction.editReply({ content: t(interaction.guildId, 'events.app.already') });
        }

        const reason = interaction.fields.getTextInputValue('reject_reason') || t(interaction.guildId, 'events.app.reject_default');
        const app = db.getApplication(submission.app_id);

        db.updateSubmissionStatus(subId, 'rejected', interaction.user.id);
        db.addApplicationPoint(interaction.guild.id, interaction.user.id);

        // إشعار العضو بالخاص مع السبب
        const applicantUser = client.users.cache.get(submission.user_id) || await client.users.fetch(submission.user_id).catch(() => null);
        if (applicantUser) {
          applicantUser.send({
            embeds: [new EmbedBuilder()
              .setColor('#ef4444')
              .setTitle(t(interaction.guildId, 'events.app.dm_reject_title'))
              .setDescription(t(interaction.guildId, 'events.app.dm_reject_desc', { title: app ? app.title : t(interaction.guildId, 'events.app.rank_fallback'), guild: interaction.guild.name, reason }))
              .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
              .setTimestamp()
            ]
          }).catch(() => { });
        }

        // تحديث رسالة المشرفين
        const logChannelId = app?.log_channel || db.getGuildSettings(interaction.guild.id)?.log_channel;
        if (logChannelId) {
          const logChan = interaction.guild.channels.cache.get(logChannelId);
          if (logChan) {
            try {
              const msgs = await logChan.messages.fetch({ limit: 30 });
              const targetMsg = msgs.find(m => m.embeds[0] && m.embeds[0].title && m.embeds[0].title.includes(`(#${submission.id})`));
              if (targetMsg) {
                const oldEmbed = targetMsg.embeds[0];
                const updatedEmbed = EmbedBuilder.from(oldEmbed)
                  .setColor('#ef4444')
                  .setTitle(oldEmbed.title.replace(/\[.*\]/, '').trim() + t(interaction.guildId, 'events.app.suffix_rejected'))
                  .addFields(
                    { name: t(interaction.guildId, 'events.app.field_rejected'), value: `${interaction.user} (<t:${Math.floor(Date.now() / 1000)}:R>)`, inline: true },
                    { name: t(interaction.guildId, 'events.app.field_reason'), value: `\`\`\`${reason}\`\`\``, inline: false }
                  );
                await targetMsg.edit({ embeds: [updatedEmbed], components: [] });
              }
            } catch(e) {}
          }
        }

        return interaction.editReply({ content: t(interaction.guildId, 'events.app.rejected_ok') });
      }

      // ==========================================
      // 11. نظام تسجيل حضور وانصراف الإدارة (Staff Shift Login / Logout)
      // ==========================================
      if (interaction.isButton() && (interaction.customId === 'staff_login_btn' || interaction.customId === 'staff_logout_btn')) {
        let shiftDeferred = false;
        try {
          await interaction.deferReply({ ephemeral: true });
          shiftDeferred = true;
        } catch (e) {
          return; // فشل deferReply = الـ interaction منتهية الصلاحية
        }
        try {
          const settings = db.getGuildSettings(interaction.guild.id) || {};
          const staffRoleId = settings.staff_role;

          // التحقق من أن العضو من طاقم الإدارة (مالك، صلاحيات إدارية/إشرافية، أو يحمل رتب الإدارة المحددة)
          const hasStaffPermissions = 
            interaction.member.id === interaction.guild.ownerId ||
            interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
            interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
            interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
            interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) ||
            interaction.member.permissions.has(PermissionFlagsBits.KickMembers) ||
            interaction.member.permissions.has(PermissionFlagsBits.BanMembers);

          const hasStaffRole = 
            (staffRoleId && interaction.member.roles.cache.has(staffRoleId)) ||
            (settings.admin_role && interaction.member.roles.cache.has(settings.admin_role)) ||
            (settings.mod_role && interaction.member.roles.cache.has(settings.mod_role));

          // متاح لجميع أفراد الإدارة أو من يملكون الرتب المحددة
          const isStaff = hasStaffPermissions || hasStaffRole;

          if (!isStaff) {
            return interaction.editReply({
              content: t(interaction.guildId, 'events.shift.staff_only')
            });
          }

          const logChannelId = settings.staff_log_channel || settings.log_channel;
          const logChannel = logChannelId 
            ? (interaction.guild.channels.cache.get(logChannelId) || await interaction.guild.channels.fetch(logChannelId).catch(() => null))
            : null;

          // تسجيل الدخول (Login)
          if (interaction.customId === 'staff_login_btn') {
            const result = db.startStaffShift(interaction.guild.id, interaction.user.id);
            if (!result.success && result.error === 'already_active') {
              const startedAt = result.shift?.start_time || Math.floor(Date.now() / 1000);
              return interaction.editReply({
                content: t(interaction.guildId, 'events.shift.already_in', { ts: startedAt })
              });
            }

            const nowUnix = Math.floor(Date.now() / 1000);
            const loginEmbed = new EmbedBuilder()
              .setColor('#10b981')
              .setTitle(t(interaction.guildId, 'events.shift.login_title'))
              .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
              .addFields(
                { name: t(interaction.guildId, 'events.shift.f_admin'), value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                { name: t(interaction.guildId, 'events.shift.f_id'), value: `\`${interaction.user.id}\``, inline: true },
                { name: t(interaction.guildId, 'events.shift.f_start'), value: `<t:${nowUnix}:F>\n(<t:${nowUnix}:R>)`, inline: false }
              )
              .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
              .setTimestamp();

            if (logChannel && logChannel.isTextBased()) {
              await logChannel.send({ embeds: [loginEmbed] }).catch(() => {});
            }

            return interaction.editReply({
              content: t(interaction.guildId, 'events.shift.login_ok', { ts: nowUnix })
            });
          }

          // تسجيل الخروج (Logout)
          if (interaction.customId === 'staff_logout_btn') {
            const result = db.endStaffShift(interaction.guild.id, interaction.user.id, 'user');
            if (!result.success && result.error === 'not_active') {
              return interaction.editReply({
                content: t(interaction.guildId, 'events.shift.not_active')
              });
            }

            const durationHours = Math.floor(result.duration / 3600);
            const durationMins = Math.floor((result.duration % 3600) / 60);
            const durationSecs = result.duration % 60;
            const durationStr = durationHours > 0
              ? t(interaction.guildId, 'events.shift.dur_h', { h: durationHours, m: durationMins, s: durationSecs })
              : t(interaction.guildId, 'events.shift.dur_m', { m: durationMins, s: durationSecs });

            const logoutEmbed = new EmbedBuilder()
              .setColor('#ef4444')
              .setTitle(t(interaction.guildId, 'events.shift.logout_title'))
              .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
              .addFields(
                { name: t(interaction.guildId, 'events.shift.f_admin'), value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                { name: t(interaction.guildId, 'events.shift.f_duration'), value: `\`${durationStr}\``, inline: true },
                { name: t(interaction.guildId, 'events.shift.f_points'), value: t(interaction.guildId, 'events.shift.points_val', { n: result.pointsEarned }), inline: true },
                { name: t(interaction.guildId, 'events.shift.f_start2'), value: `<t:${result.startTime}:T>`, inline: true },
                { name: t(interaction.guildId, 'events.shift.f_end'), value: `<t:${result.endTime}:T>`, inline: true },
                { name: t(interaction.guildId, 'events.shift.f_exit_type'), value: t(interaction.guildId, 'events.shift.exit_manual'), inline: true }
              )
              .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
              .setTimestamp();

            if (logChannel && logChannel.isTextBased()) {
              await logChannel.send({ embeds: [logoutEmbed] }).catch(() => {});
            }

            return interaction.editReply({
              content: t(interaction.guildId, 'events.shift.logout_ok', { dur: durationStr, pts: result.pointsEarned })
            });
          }
        } catch (shiftErr) {
          logger.error('[STAFF SHIFT ERROR]', shiftErr);
          if (shiftDeferred) {
            await interaction.editReply({ content: t(interaction.guildId, 'events.common.unexpected') }).catch(() => {});
          }
        }
      }
    } catch (err) {
      logger.error('خطأ في interactionCreate:', err);
    }
  }
};