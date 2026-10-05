const autoHealer = require('../../services/aiAutoHealer');
if (await autoHealer.handleInteraction(interaction)) return;
const { ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder } = require('discord.js');
const db = require('../../database');
const embedUtil = require('../../utils/embed');
const logger = require('../../utils/logger');
const config = require('../../config.json');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      // 1. التعامل مع أوامر السلاش (Slash Commands)
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          return interaction.reply({ content: '❌ هذا الأمر غير مسجل حالياً.', flags: 64 }).catch(() => { });
        }

        // فحص الأوامر المعطلة من لوحة الداشبورد
        if (interaction.guild) {
          try {
            const gSettings = db.getGuildSettings ? db.getGuildSettings(interaction.guild.id) : {};
            const disabledCmds = JSON.parse(gSettings?.disabled_commands || '[]');
            const slashName = '/' + interaction.commandName;
            if (disabledCmds.includes(slashName) || disabledCmds.includes(interaction.commandName)) {
              return interaction.reply({ content: '❌ هذا الأمر معطّل في هذا السيرفر من قبل الإدارة.', flags: 64 }).catch(() => {});
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
                  return interaction.reply({ content: '❌ ليس لديك الرتبة المسموح لها بتشغيل هذا الأمر.', flags: 64 }).catch(() => {});
                }
              }
              // فحص القنوات المسموح فيها
              if (cfg.allowedChannels && Array.isArray(cfg.allowedChannels) && cfg.allowedChannels.length > 0) {
                const isAdminCh = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                                  interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
                if (!isAdminCh && !cfg.allowedChannels.includes(interaction.channelId)) {
                  const allowedList = cfg.allowedChannels.map(id => `<#${id}>`).join(', ');
                  return interaction.reply({ content: `❌ لا يمكن تشغيل هذا الأمر هنا. القنوات المسموح بها: ${allowedList}`, flags: 64 }).catch(() => {});
                }
              }
            }
          } catch(e) {}
        }

        try {
          await command.execute(interaction, client);
        } catch (error) {
          logger.error(`خطأ أثناء تنفيذ أمر السلاش ${interaction.commandName}:`, error);
          const errorEmbed = embedUtil.error('حدث خطأ', 'حدث خطأ غير متوقع أثناء محاولة تنفيذ هذا الأمر.');
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [errorEmbed], flags: 64 }).catch(() => { });
          } else {
            await interaction.reply({ embeds: [errorEmbed], flags: 64 }).catch(() => { });
          }
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
            return interaction.editReply({ content: '❌ لم يتم العثور على الرتبة المحددة.' });
          }

          if (interaction.member.roles.cache.has(role.id)) {
            await interaction.member.roles.remove(role);
            return interaction.editReply({ content: `✅ تمت إزالة رتبة **${role.name}** منك.` });
          } else {
            await interaction.member.roles.add(role);
            return interaction.editReply({ content: `✅ تم إعطاؤك رتبة **${role.name}** بنجاح.` });
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
          return interaction.editReply({ content: '❌ تعذر العثور على بيانات هذا الاقتراح في قاعدة البيانات.' });
        }

        const sugg = db.getSuggestion(interaction.message.id);
        const { buildSuggestionEmbed, buildSuggestionComponents } = require('../../utils/suggestionBuilder');

        // تحديث إيمبد الاقتراح بنسبة التصويت وشريط التقدم الحي
        try {
          const suggAuthor = sugg ? await client.users.fetch(sugg.user_id).catch(() => null) : null;
          const userObj = suggAuthor || { tag: 'عضو', username: 'عضو' };

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
            reason: sugg?.status_reason || null
          });

          // الحفاظ على أزرار التصويت والإدارة بنفس الحالة
          const isClosed = sugg?.status && sugg.status !== 'pending' && sugg.status !== 'considered';
          const newComponents = buildSuggestionComponents({
            upvotes: res.upvotesCount,
            downvotes: res.downvotesCount,
            disabled: isClosed
          });

          await interaction.message.edit({ embeds: [updatedEmbed], components: newComponents }).catch(() => {});
        } catch (e) {
          console.error('[Suggestion Vote Edit Error]:', e);
        }

        const actionText = res.action === 'removed' ? 'إلغاء تصويتك' : (voteType === 'up' ? 'تسجيل تأييدك 👍' : 'تسجيل معارضتك 👎');
        return interaction.editReply({ content: `✅ تم ${actionText} بنجاح!` });
      }

      // 2.1.1 التعامل مع قبول أو رفض أو دراسة الاقتراح إدارياً (Suggestion Staff Decision)
      if (interaction.isButton() && (interaction.customId === 'sugg_accept_btn' || interaction.customId === 'sugg_reject_btn' || interaction.customId === 'sugg_consider_btn')) {
        const isStaffOrAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                               interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                               interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers);

        if (!isStaffOrAdmin) {
          return interaction.reply({ content: '❌ هذا الإجراء مخصص لإدارة ومشرفي السيرفر فقط.', flags: 64 });
        }

        let actionType = 'accept';
        let modalTitle = '✅ قبول الاقتراح رسمياً';
        if (interaction.customId === 'sugg_reject_btn') {
          actionType = 'reject';
          modalTitle = '❌ رفض الاقتراح';
        } else if (interaction.customId === 'sugg_consider_btn') {
          actionType = 'consider';
          modalTitle = '🔍 وضع الاقتراح قيد الدراسة';
        }

        const modal = new ModalBuilder()
          .setCustomId(`modal_sugg_${actionType}_${interaction.message.id}`)
          .setTitle(modalTitle);

        const isRequired = actionType === 'reject';
        const reasonInput = new TextInputBuilder()
          .setCustomId('sugg_decision_reason')
          .setLabel(actionType === 'accept' ? 'ملاحظة القبول (اختياري):' : (actionType === 'reject' ? 'سبب الرفض:' : 'ملاحظات قيد الدراسة (اختياري):'))
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(actionType === 'accept' ? 'اكتب ملاحظة للإدارة أو صاحب الاقتراح...' : (actionType === 'reject' ? 'اكتب سبب عدم إمكانية تطبيق الاقتراح...' : 'اكتب ملاحظة حول كيفية وتفاصيل دراسة الفكرة...'))
          .setRequired(isRequired)
          .setMaxLength(500);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        return interaction.showModal(modal);
      }

      // 2.2 التعامل مع زر المشاركة في القيف اواي (Giveaway Enter Button)
      if (interaction.isButton() && interaction.customId === 'gw_enter_btn') {
        const gw = db.getGiveaway(interaction.message.id);
        if (!gw || gw.status !== 'active') {
          return interaction.reply({ content: '❌ هذا السحب منتهي أو غير متوفر حالياً.', flags: 64 });
        }

        const entries = db.getGiveawayEntries(interaction.message.id);
        const hasJoined = entries.includes(interaction.user.id);

        if (hasJoined) {
          // رسالة تأكيد إلغاء الاشتراك مع أزرار
          const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`gw_leave_confirm_${interaction.message.id}`)
              .setLabel('نعم، تأكيد إلغاء المشاركة')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🗑️'),
            new ButtonBuilder()
              .setCustomId('gw_leave_cancel')
              .setLabel('تراجع والبقاء في السحب')
              .setStyle(ButtonStyle.Secondary)
          );

          return interaction.reply({
            content: `⚠️ **هل أنت متأكد من رغبتك في إلغاء مشاركتك في سحب: ${gw.prize}؟**\nإذا قمت بالإلغاء ستفقد فرصتك في الفوز!`,
            components: [confirmRow],
            flags: 64
          });
        }

        if (gw.required_role && !interaction.member.roles.cache.has(gw.required_role)) {
          return interaction.reply({ content: `❌ لا يمكنك المشاركة، يجب أن تمتلك رتبة <@&${gw.required_role}> للمشاركة في هذا السحب.`, flags: 64 });
        }

        const res = db.addGiveawayEntry(interaction.message.id, interaction.user.id);
        return interaction.reply({ content: `🎉 تم اشتراكك في سحب **${gw.prize}** بنجاح! إجمالي المشاركين الآن: ${res.count}`, flags: 64 });
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
                  .setLabel(`🎉 اشتراك (${res.count})`)
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setCustomId('view_giveaway_entries')
                  .setLabel('👥 المشتركين')
                  .setStyle(ButtonStyle.Secondary)
              );
              await originalMsg.edit({ components: [newRow] }).catch(() => {});
            }
          } catch (e) {}
        }

        return interaction.update({
          content: `🗑️ **تم إلغاء اشتراكك بنجاح** من سحب **${gw ? gw.prize : 'القيف أواي'}**. إجمالي المشاركين الآن: ${res.count}`,
          components: []
        });
      }

      // التراجع عن إلغاء المشاركة
      if (interaction.isButton() && interaction.customId === 'gw_leave_cancel') {
        return interaction.update({
          content: '✅ **تم التراجع!** ما زلت مشاركاً في السحب، نتمنى لك التوفيق! 🍀',
          components: []
        });
      }




      // 2.4 نظام التحقق الأمني (Verification Button & Direct Role)
      if (interaction.isButton() && (interaction.customId === 'btn_start_verification' || interaction.customId === 'btn_quick_verify' || interaction.customId === 'verify_button' || interaction.customId === 'verify_member')) {
        const settings = db.getGuildSettings(interaction.guild.id);
        const roleId = settings.verify_role || settings.verification_role;
        if (!roleId) {
          return interaction.reply({ content: '❌ لم يتم تحديد رتبة التفعيل بعد في إعدادات السيرفر.', flags: 64 });
        }
        const verifiedRole = interaction.guild.roles.cache.get(roleId) || await interaction.guild.roles.fetch(roleId).catch(() => null);
        if (!verifiedRole) {
          return interaction.reply({ content: '❌ لم يتم العثور على رتبة التحقق. يرجى مراجعة إعدادات الرتب.', flags: 64 });
        }
        if (interaction.member.roles.cache.has(verifiedRole.id)) {
          return interaction.reply({ content: '✅ أنت موثق ومفعل مسبقاً ولديك حق الوصول لجميع القنوات!', flags: 64 });
        }

        // فحص عمر الحساب (Anti-Alt Check)
        if (settings.anti_alt_days && settings.anti_alt_days > 0) {
          const accountAgeDays = (Date.now() - interaction.user.createdTimestamp) / (1000 * 60 * 60 * 24);
          if (accountAgeDays < settings.anti_alt_days) {
            return interaction.reply({
              content: `❌ **عذراً، حسابك حديث جداً!**\nيتطلب السيرفر أن يكون عمر الحساب **${settings.anti_alt_days} يوم** على الأقل للتوثيق (عمر حسابك الحالي: ${Math.floor(accountAgeDays)} يوم).`,
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
            .setTitle('🔢 التحقق الأمني - أثبت أنك لست بوت!');
          const captchaInput = new TextInputBuilder()
            .setCustomId('captcha_answer')
            .setLabel(`⚡ احسب: ${num1} + ${num2} = ?`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('أدخل الجواب بالأرقام...')
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
            .setTitle('🔤 التحقق الأمني - كود التأكيد');
          const codeInput = new TextInputBuilder()
            .setCustomId('code_answer')
            .setLabel(`اكتب هذا الكود بالضبط: [ ${code} ]`)
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
                    .setTitle('✅ توثيق وتفعيل عضو جديد')
                    .addFields(
                      { name: '👤 العضو', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                      { name: '🎖️ الرتبة الممنوحة', value: `${verifiedRole.name}`, inline: true },
                      { name: '📅 تاريخ الإنضمام', value: `<t:${Math.floor(interaction.member.joinedTimestamp / 1000)}:R>`, inline: true }
                    )
                    .setTimestamp()
                  ]
                }).catch(() => { });
              }
            }

            return interaction.editReply({
              content: `🎉 **تم تفعيلك بنجاح!**\nتم منحك رتبة **${verifiedRole.name}** وأصبح بإمكانك الوصول الكامل لجميع قنوات السيرفر. استمتع! 🚀`
            });
          } catch (err) {
            logger.error('فشل في إعطاء رتبة التحقق:', err);
            return interaction.editReply({ content: '❌ حدث خطأ أثناء إعطاء رتبة التحقق. تأكد من أن رتبة البوت أعلى من الرتبة المراد إعطاؤها.' });
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
                      .setTitle('✅ توثيق عضو جديد')
                      .addFields(
                        { name: '👤 العضو', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                        { name: '🔒 النوع', value: isCode ? 'كود نصي' : 'كابتشا حسابية', inline: true },
                        { name: '📅 عمر الحساب', value: `<t:${Math.floor(interaction.user.createdTimestamp / 1000)}:R>`, inline: true }
                      )
                      .setTimestamp()
                    ]
                  }).catch(() => { });
                }
              }

              return interaction.editReply({
                content: `✅ **إجابة صحيحة!** تم التحقق من هويتك بنجاح يا ${interaction.member}!\nأصبح بإمكانك الوصول الكامل لجميع قنوات السيرفر. 🎉`
              });
            } catch {
              return interaction.editReply({ content: '❌ حدث خطأ أثناء إعطاء الرتبة. تواصل مع الإدارة.' });
            }
          }
        } else {
          return interaction.editReply({
            content: `❌ **إجابة خاطئة!** يرجى الضغط على زر التحقق مجدداً والمحاولة مرة أخرى.`
          });
        }
      }

      // 2.5 التعامل مع زر الاشتراك في القيف أواي (Giveaways Pro)
      if (interaction.isButton() && interaction.customId === 'join_giveaway') {
        await interaction.deferReply({ flags: 64 }).catch(() => { });
        const giveaway = db.getGiveaway(interaction.message.id);
        if (!giveaway || giveaway.ended) {
          return interaction.editReply({ content: '❌ هذا القيف أواي قد انتهى بالفعل!' });
        }

        const entries = db.getGiveawayEntries(interaction.message.id);
        const hasJoined = entries.includes(interaction.user.id);

        if (hasJoined) {
          const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`slash_gw_leave_confirm_${interaction.message.id}`)
              .setLabel('نعم، تأكيد إلغاء المشاركة')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🗑️'),
            new ButtonBuilder()
              .setCustomId('gw_leave_cancel')
              .setLabel('تراجع والبقاء في السحب')
              .setStyle(ButtonStyle.Secondary)
          );

          return interaction.editReply({
            content: `⚠️ **هل أنت متأكد من رغبتك في إلغاء مشاركتك في سحب: ${giveaway.prize}؟**\nإذا قمت بالإلغاء ستفقد فرصتك في الفوز!`,
            components: [confirmRow]
          });
        } else {
          if (giveaway.required_role && !interaction.member.roles.cache.has(giveaway.required_role)) {
            return interaction.editReply({
              content: `❌ **عذراً، لا تستوفي شرط الرتبة!**\nتحتاج إلى رتبة <@&${giveaway.required_role}> للاشتراك في هذا السحب.`
            });
          }

          if (giveaway.min_account_age > 0) {
            const ageDays = (Date.now() - interaction.user.createdTimestamp) / (1000 * 60 * 60 * 24);
            if (ageDays < giveaway.min_account_age) {
              return interaction.editReply({
                content: `❌ **عمر حسابك غير كافٍ!**\nيجب أن يكون عمر حسابك **${giveaway.min_account_age} يوم** على الأقل (عمر حسابك الحالي: ${Math.floor(ageDays)} يوم).`
              });
            }
          }

          if (giveaway.min_level > 0) {
            const userDb = db.getUser(interaction.user.id, interaction.guild.id);
            if ((userDb.level || 0) < giveaway.min_level) {
              return interaction.editReply({
                content: `❌ **مستواك الحالي غير كافٍ!**\nتحتاج إلى المستوى **${giveaway.min_level}** للاشتراك (مستواك الحالي: Level ${userDb.level || 0}).`
              });
            }
          }

          db.addGiveawayEntry(interaction.message.id, interaction.user.id);
          const newEntries = db.getGiveawayEntries(interaction.message.id);
          const hasBonus = giveaway.extra_role && interaction.member.roles.cache.has(giveaway.extra_role);

          const newRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('join_giveaway')
              .setLabel(`🎉 اشتراك (${newEntries.length})`)
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('view_giveaway_entries')
              .setLabel('👥 المشتركين')
              .setStyle(ButtonStyle.Secondary)
          );
          await interaction.message.edit({ components: [newRow] }).catch(() => { });

          return interaction.editReply({
            content: `🎉 **تم تسجيل اشتراكك بنجاح في السحب!** 🍀${hasBonus ? '\n🔥 **ميزة:** لديك فرصة فوز مضاعفة (x2) بفضل رتبتك المميزة!' : ''}`
          });
        }
      }

      // 2.6 استعراض المشتركين في القيف أواي
      if (interaction.isButton() && interaction.customId === 'view_giveaway_entries') {
        await interaction.deferReply({ flags: 64 }).catch(() => { });
        const giveaway = db.getGiveaway(interaction.message.id);
        if (!giveaway) {
          return interaction.editReply({ content: '❌ لم يتم العثور على القيف أواي.' });
        }
        const entries = db.getGiveawayEntries(interaction.message.id);
        if (entries.length === 0) {
          return interaction.editReply({ content: '👥 لا يوجد أي مشتركين في هذا السحب حتى الآن.' });
        }

        const topEntries = entries.slice(0, 30).map((id, i) => `${i + 1}. <@${id}>`).join('\n');
        const countText = entries.length > 30 ? `\n... و ${entries.length - 30} مشترك آخرين.` : '';

        return interaction.editReply({
          content: `📊 **إجمالي المشتركين في السحب (${entries.length} مشترك):**\n\n${topEntries}${countText}`
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
            content: `❌ لديك تذكرة مفتوحة بالفعل: <#${existingTicket.id}>`
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
          return interaction.reply({ content: '❌ لا يمكن تنفيذ الإجراء: هذه القناة ليست تذكرة نشطة.', flags: 64 });
        }

        // A. Close with Reason
        if (action === 'action_close_reason') {
          const modal = new ModalBuilder()
            .setCustomId('modal_close_ticket_reason')
            .setTitle('Close Ticket with Reason');

          const reasonInput = new TextInputBuilder()
            .setCustomId('ticket_close_reason_input')
            .setLabel('سبب الإغلاق / Reason for closing:')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('اكتب سبب إغلاق التذكرة (اختياري)...')
            .setRequired(false)
            .setMaxLength(500);

          modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
          return interaction.showModal(modal);
        }

        // B. Add User to Ticket
        if (action === 'action_add_user') {
          const userSelect = new UserSelectMenuBuilder()
            .setCustomId('ticket_user_add_select')
            .setPlaceholder('اختر العضو لإضافته إلى التذكرة...')
            .setMinValues(1)
            .setMaxValues(1);

          return interaction.reply({
            content: '👤 **اختر العضو الذي ترغب في إضافته إلى هذه التذكرة:**',
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
              return interaction.editReply({ content: '❌ تعذر العثور على صاحب التذكرة.' });
            }

            const reminderEmbed = new EmbedBuilder()
              .setColor('#06070a')
              .setTitle('🔔 تذكير بخصوص تذكرتك المفتوحة')
              .setDescription(`مرحباً **${ticketOwner.username}**!\nفريق الدعم الفني في سيرفر **${interaction.guild.name}** بانتظار ردك في التذكرة: <#${interaction.channel.id}>`)
              .setTimestamp();

            await ticketOwner.send({ embeds: [reminderEmbed] });
            await interaction.channel.send({ content: `✉️ تم إرسال تذكير في الخاص إلى صاحب التذكرة: <@${ticketData.user_id}>` });
            return interaction.editReply({ content: '✅ تم إرسال التذكير في الخاص بنجاح!' });
          } catch (e) {
            return interaction.editReply({ content: '❌ تعذر إرسال التذكير في الخاص (قد يكون خاص العضو مقفلاً).' });
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
                content: `📄 **نسخة من سجل التذكرة:** \`#${interaction.channel.name}\` في سيرفر **${interaction.guild.name}**`,
                files: [transcriptResult.attachment]
              }).catch(() => {});
              return interaction.editReply({ content: '✅ تم إرسال نسخة من سجل التذكرة (Transcript HTML) إلى رسائلك الخاصة!' });
            } else {
              return interaction.editReply({ content: '❌ تعذر استخراج سجل التذكرة.' });
            }
          } catch (e) {
            return interaction.editReply({ content: '❌ حدث خطأ أثناء تجهيز نسخة السجل.' });
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
          await interaction.channel.send({ content: `➕ تمت إضافة <@${targetUserId}> إلى هذه التذكرة بواسطة ${interaction.user}.` });
          return interaction.editReply({ content: `✅ تمت إضافة <@${targetUserId}> بنجاح إلى التذكرة.` });
        } catch (e) {
          return interaction.editReply({ content: '❌ فشل تعديل صلاحيات القناة لإضافة العضو.' });
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
          return interaction.reply({ content: '❌ هذا الزر مخصص لطاقم الدعم الفني والإدارة فقط.', flags: 64 });
        }

        if (ticketData?.claimed_by) {
          return interaction.reply({ content: `⚠️ هذه التذكرة مستلمة بالفعل بواسطة: <@${ticketData.claimed_by}>`, flags: 64 });
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
          .setDescription(`💼 **تم استلام التذكرة بواسطة ${interaction.user} وسيتابع معك الآن.**`)
          .setTimestamp();

        await interaction.reply({ embeds: [claimEmbed] });
        return interaction.message.edit({ components: [updatedButtonsRow] }).catch(() => {});
      }

      // 5.5 إلغاء استلام التذكرة (Unclaim Ticket)
      if (interaction.isButton() && interaction.customId === 'unclaim_ticket') {
        const ticketData = db.getTicket(interaction.channel.id);
        const isClaimerOrAdmin = ticketData?.claimed_by === interaction.user.id || interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isClaimerOrAdmin) {
          return interaction.reply({ content: '❌ لا يمكنك إلغاء استلام التذكرة إلا إذا كنت أنت المستلم أو مسؤول بالسيرفر.', flags: 64 });
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

        await interaction.reply({ content: `↩️ قام ${interaction.user} بإلغاء استلام التذكرة، وأصبحت متاحة لفريق الدعم.` });
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
              const userObj = suggAuthor || { tag: 'عضو', username: 'عضو' };

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
                reason: reason
              });

              // إذا تم القبول أو الرفض النهائي، نقفل الأزرار؛ إذا كانت قيد الدراسة تبقى الأزرار مفعلة
              const isFinal = newStatus === 'accepted' || newStatus === 'rejected';
              const newComponents = buildSuggestionComponents({
                upvotes: upvotesList.length,
                downvotes: downvotesList.length,
                disabled: isFinal
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
              accepted: '🎉 تم قبول اقتراحك!',
              rejected: '📌 تم رفض اقتراحك',
              considered: '🔍 اقتراحك الآن قيد الدراسة!'
            };
            const statusColors = {
              accepted: '#22c55e',
              rejected: '#ef4444',
              considered: '#3b82f6'
            };
            const notifyEmbed = new EmbedBuilder()
              .setColor(statusColors[newStatus] || '#9333ea')
              .setTitle(statusTitles[newStatus] || '📌 تحديث بخصوص اقتراحك')
              .setDescription(`مرحباً **${owner.username}**!\nقام فريق الإدارة بمراجعة اقتراحك في سيرفر **${interaction.guild.name}**:\n\n**الاقتراح:** ${sugg.content.slice(0, 300)}\n**الحالة الجديدة:** \`${newStatus}\`\n**التعليق/السبب:** \`${reason}\``)
              .setTimestamp();
            await owner.send({ embeds: [notifyEmbed] }).catch(() => {});
          }
        } catch (e) {}

        const actionLabels = { accept: 'قبول', reject: 'رفض', consider: 'وضع الاقتراح قيد الدراسة' };
        return interaction.editReply({
          content: `✅ تم ${actionLabels[actionType]} بنجاح وتحديث حالته وشريط التصويت وإشعار صاحب الاقتراح.`
        });
      }

      // ==========================================
      // 6. إغلاق التذكرة واللوق الاحترافي (Close with Reason & Log Embed - Image 1)
      // ==========================================
      if (interaction.isModalSubmit() && interaction.customId === 'modal_close_ticket_reason') {
        await interaction.deferReply().catch(() => {});
        const reason = interaction.fields.getTextInputValue('ticket_close_reason_input') || 'لم يتم تقديم سبب';
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

        const closeReasonText = (reason && reason.trim() !== 'لم يتم تقديم سبب' && reason.trim() !== 'No reason provided') ? reason : 'No reason provided';

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
                .setTitle('⭐ تقييم تجربة الدعم الفني')
                .setDescription(`مرحباً **${ticketOwner.username}**!\nتم إغلاق تذكرتك في سيرفر **${interaction.guild.name}**.\nسبب الإغلاق: \`${reason}\`\n\nتجد مرفقاً سجل التذكرة الكامل (Transcript HTML).\nيرجى تقييم مستوى الخدمة ومساعدة فريق الدعم بالضغط على النجوم أدناه:`)
                .setFooter({ text: 'تقييمك يساعدنا على تحسين وتطوير الخدمة دائماً!' })
                .setTimestamp();

              const ratingRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`rate_ticket_1_${interaction.channel.id}_${staffClaimerId || '0'}_${interaction.guild.id}`).setLabel('⭐ 1').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`rate_ticket_2_${interaction.channel.id}_${staffClaimerId || '0'}_${interaction.guild.id}`).setLabel('⭐ 2').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`rate_ticket_3_${interaction.channel.id}_${staffClaimerId || '0'}_${interaction.guild.id}`).setLabel('⭐ 3').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`rate_ticket_4_${interaction.channel.id}_${staffClaimerId || '0'}_${interaction.guild.id}`).setLabel('⭐ 4').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`rate_ticket_5_${interaction.channel.id}_${staffClaimerId || '0'}_${interaction.guild.id}`).setLabel('⭐ 5 ممتاز').setStyle(ButtonStyle.Success)
              );

              const userFiles = transcriptResult?.attachment ? [transcriptResult.attachment] : [];
              await ticketOwner.send({ embeds: [ratingEmbed], components: [ratingRow], files: userFiles }).catch(() => {});
            }
          } catch (e) {}
        }

        await interaction.editReply({ content: '🔒 **تم إغلاق التذكرة بنجاح وجاري حذف القناة...**' });

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
            content: '📄 **سجل التذكرة الكامل (Transcript HTML):**',
            files: [attachment],
            flags: 64
          });
        } else {
          return interaction.reply({ content: '❌ لم يتم العثور على ملف السجل المحفوظ.', flags: 64 });
        }
      }

      // 7. زر التحقق وتوثيق الحساب (Verification System)
      if (interaction.isButton() && interaction.customId === 'verify_user_btn') {
        await interaction.deferReply({ flags: 64 }).catch(() => { });
        const settings = db.getGuildSettings(interaction.guild.id);
        if (!settings.verify_role) {
          return interaction.editReply({ content: '❌ لم يتم تحديد رتبة التوثيق في لوحة التحكم بعد.' });
        }

        const role = interaction.guild.roles.cache.get(settings.verify_role);
        if (!role) {
          return interaction.editReply({ content: '❌ الرتبة المحددة غير موجودة بالسيرفر.' });
        }

        if (interaction.member.roles.cache.has(role.id)) {
          return interaction.editReply({ content: '✅ حسابك موثق بالفعل وتمتلك الرتبة مسبقاً!' });
        }

        try {
          await interaction.member.roles.add(role);
          return interaction.editReply({ content: `🎉 تم توثيق حسابك بنجاح! تم منحك رتبة **@${role.name}** وفتح قنوات السيرفر.` });
        } catch (err) {
          return interaction.editReply({ content: '❌ حدث خطأ أثناء محاولة منحك الرتبة. تأكد من أن رتبة البوت أعلى من رتبة التوثيق.' });
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
          .setTitle(`⭐ تقييمك: ${rating} من 5 نجوم`);

        const commentInput = new TextInputBuilder()
          .setCustomId('review_comment')
          .setLabel('ملاحظتك أو رأيك في الدعم الفني (اختياري):')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('اكتب أي ملاحظة أو رسالة لفريق الإدارة والدعم الفني...')
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
        const comment = interaction.fields.getTextInputValue('review_comment') || 'بدون تعليق إضافي';

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
              .setTitle('⭐ تقييم جديد لخدمة الدعم الفني والتذاكر')
              .addFields(
                { name: '👤 العضو المقيم', value: `<@${interaction.user.id}> (\`${interaction.user.tag}\`)`, inline: true },
                { name: '👮 الموظف المسؤول', value: staffId ? `<@${staffId}>` : 'فريق الدعم', inline: true },
                { name: '📊 مستوى التقييم', value: `\`${starsEmoji}\` (${rating}/5)`, inline: true },
                { name: '💬 التعليق والملاحظات', value: `\`\`\`${comment}\`\`\`` }
              )
              .setFooter({ text: targetGuild.name, iconURL: targetGuild.iconURL({ dynamic: true }) || undefined })
              .setTimestamp();

            await feedbackChan.send({ embeds: [feedbackEmbed] }).catch(() => { });
          }
        }

        return interaction.editReply({ content: '🌟 **تم إرسال تقييمك بنجاح للإدارة!** شكراً جزيلاً لوقتك وملاحظاتك القيمة.' });
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
          return interaction.reply({ content: '❌ استمارة التقديم هذه غير متاحة أو تم إغلاقها.', flags: 64 });
        }

        let questions = [];
        try {
          questions = typeof app.questions === 'string' ? JSON.parse(app.questions) : app.questions;
        } catch (e) {
          questions = [{ text: 'ما هو سبب تقديمك؟', type: 'paragraph' }];
        }

        const modal = new ModalBuilder()
          .setCustomId(`modal_submit_app_${app.id}`)
          .setTitle(`📝 ${app.title.slice(0, 40)}`);

        questions.slice(0, 5).forEach((q, idx) => {
          const qText = typeof q === 'object' ? (q.text || `السؤال ${idx + 1}`) : String(q);
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
          return interaction.editReply({ content: '❌ لم يتم العثور على نموذج التقديم.' });
        }

        let questions = [];
        try {
          questions = typeof app.questions === 'string' ? JSON.parse(app.questions) : app.questions;
        } catch (e) {
          questions = [];
        }

        const answers = [];
        questions.slice(0, 5).forEach((q, idx) => {
          const qText = typeof q === 'object' ? (q.text || `السؤال ${idx + 1}`) : String(q);
          const ans = interaction.fields.getTextInputValue(`q_${idx}`) || 'لا توجد إجابة';
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
              .setTitle(`📋 طلب تقديم جديد: ${app.title} (#${submission.id})`)
              .setDescription(`👤 **مقدم الطلب:** ${interaction.user} (\`${interaction.user.tag}\`)\n🆔 **الآيدي:** \`${interaction.user.id}\`\n📅 **تاريخ التقديم:** <t:${submission.submitted_at}:F>`)
              .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
              .setFooter({ text: `نموذج #${app.id} • بانتظار قرار الإدارة` })
              .setTimestamp();

            answers.forEach((item, i) => {
              reviewEmbed.addFields({
                name: `❓ ${i + 1}. ${item.question}`,
                value: `\`\`\`${item.answer.slice(0, 1000)}\`\`\``
              });
            });

            const actionRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`btn_app_accept_${submission.id}`)
                .setLabel('قبول ✅')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`btn_app_reject_${submission.id}`)
                .setLabel('رفض ❌')
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId(`btn_app_review_${submission.id}`)
                .setLabel('مراجعة 🔍')
                .setStyle(ButtonStyle.Secondary)
            );

            await logChan.send({ embeds: [reviewEmbed], components: [actionRow] }).catch(() => { });
          }
        }

        return interaction.editReply({
          content: `✅ **تم استلام طلب تقديمك بنجاح!**\nتم إرسال إجاباتك إلى إدارة السيرفر لمراجعتها، وسيتم إشعارك بالنتيجة فور اتخاذ القرار.`
        });
      }

      // مراجعة طلب التقديم (Under Review)
      if (interaction.isButton() && interaction.customId.startsWith('btn_app_review_')) {
        const subId = interaction.customId.replace('btn_app_review_', '');
        const submission = db.getSubmission(subId);

        if (!submission) {
          return interaction.reply({ content: '❌ لم يتم العثور على بيانات هذا الطلب.', flags: 64 });
        }

        const app = db.getApplication(submission.app_id);
        const reviewerRole = app?.reviewer_role;
        const hasPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || 
                        (reviewerRole && interaction.member.roles.cache.has(reviewerRole));

        if (!hasPerm) {
          return interaction.reply({ content: '❌ ليس لديك صلاحية لمراجعة هذا الطلب.', flags: 64 });
        }

        const oldEmbed = interaction.message.embeds[0];
        const updatedEmbed = EmbedBuilder.from(oldEmbed)
          .setColor('#eab308')
          .setTitle(oldEmbed.title.replace(/\[.*\]/, '').trim() + ' [قيد المراجعة 🔍]')
          .addFields({ name: '🔍 قيد المراجعة بواسطة', value: `${interaction.user} (<t:${Math.floor(Date.now() / 1000)}:R>)`, inline: false });

        return interaction.update({ embeds: [updatedEmbed] });
      }

      // قبول طلب التقديم (Accept Application)
      if (interaction.isButton() && interaction.customId.startsWith('btn_app_accept_')) {
        const subId = interaction.customId.replace('btn_app_accept_', '');
        const submission = db.getSubmission(subId);

        if (!submission || submission.status !== 'pending') {
          return interaction.reply({ content: '⚠️ هذا الطلب تمت مراجعته مسبقاً!', flags: 64 });
        }

        const app = db.getApplication(submission.app_id);
        const reviewerRole = app?.reviewer_role;
        const hasPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || 
                        (reviewerRole && interaction.member.roles.cache.has(reviewerRole));

        if (!hasPerm) {
          return interaction.reply({ content: '❌ ليس لديك صلاحية لمراجعة وقبول التقديمات.', flags: 64 });
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
              .setTitle('🎉 تهانينا! تم قبول طلب تقديمك')
              .setDescription(`تمت الموافقة على طلب تقديمك على **${app ? app.title : 'الرتبة'}** في سيرفر **${interaction.guild.name}**.\nنتمنى لك كل التوفيق والتميز! 🌟`)
              .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
              .setTimestamp()
            ]
          }).catch(() => { });
        }

        const oldEmbed = interaction.message.embeds[0];
        const updatedEmbed = EmbedBuilder.from(oldEmbed)
          .setColor('#10b981')
          .setTitle(oldEmbed.title.replace(/\[.*\]/, '').trim() + ' [مقبول ✅]')
          .addFields({ name: '✨ تم القبول بواسطة', value: `${interaction.user} (<t:${Math.floor(Date.now() / 1000)}:R>)`, inline: false });

        return interaction.editReply({ embeds: [updatedEmbed], components: [] });
      }

      // فتح نافذة سبب الرفض (Reject Application Modal)
      if (interaction.isButton() && interaction.customId.startsWith('btn_app_reject_')) {
        const subId = interaction.customId.replace('btn_app_reject_', '');
        const submission = db.getSubmission(subId);

        if (!submission || submission.status !== 'pending') {
          return interaction.reply({ content: '⚠️ هذا الطلب تمت مراجعته مسبقاً!', flags: 64 });
        }

        const app = db.getApplication(submission.app_id);
        const reviewerRole = app?.reviewer_role;
        const hasPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || 
                        (reviewerRole && interaction.member.roles.cache.has(reviewerRole));

        if (!hasPerm) {
          return interaction.reply({ content: '❌ ليس لديك صلاحية لمراجعة ورفض التقديمات.', flags: 64 });
        }

        const modal = new ModalBuilder()
          .setCustomId(`modal_reject_reason_${subId}`)
          .setTitle('سبب رفض الطلب 📝');

        const reasonInput = new TextInputBuilder()
          .setCustomId('reject_reason')
          .setLabel('اكتب سبب الرفض لإرساله للعضو')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('مثال: عدم استيفاء الشروط المطلوبة حالياً...')
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
          return interaction.editReply({ content: '⚠️ هذا الطلب تمت مراجعته مسبقاً!' });
        }

        const reason = interaction.fields.getTextInputValue('reject_reason') || 'لم يتم تحديد سبب إضافي';
        const app = db.getApplication(submission.app_id);

        db.updateSubmissionStatus(subId, 'rejected', interaction.user.id);
        db.addApplicationPoint(interaction.guild.id, interaction.user.id);

        // إشعار العضو بالخاص مع السبب
        const applicantUser = client.users.cache.get(submission.user_id) || await client.users.fetch(submission.user_id).catch(() => null);
        if (applicantUser) {
          applicantUser.send({
            embeds: [new EmbedBuilder()
              .setColor('#ef4444')
              .setTitle('❌ نعتذر منك! تم رفض طلب التقديم')
              .setDescription(`نأسف لإبلاغك بأنه لم يتم قبول طلب تقديمك على **${app ? app.title : 'الرتبة'}** في سيرفر **${interaction.guild.name}**.\n\n📌 **سبب الرفض:**\n\`\`\`${reason}\`\`\`\nشكراً جزيلاً لاهتمامك ووقتك!`)
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
                  .setTitle(oldEmbed.title.replace(/\[.*\]/, '').trim() + ' [مرفوض ❌]')
                  .addFields(
                    { name: '🚫 تم الرفض بواسطة', value: `${interaction.user} (<t:${Math.floor(Date.now() / 1000)}:R>)`, inline: true },
                    { name: '📝 سبب الرفض', value: `\`\`\`${reason}\`\`\``, inline: false }
                  );
                await targetMsg.edit({ embeds: [updatedEmbed], components: [] });
              }
            } catch(e) {}
          }
        }

        return interaction.editReply({ content: `✅ تم رفض الطلب بنجاح وإرسال السبب للعضو في الخاص.` });
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
              content: '❌ هذا الزر مخصص لطاقم الإدارة والمشرفين فقط!'
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
                content: `⚠️ أنت مسجل دخول بالفعل وفي الخدمة حالياً منذ <t:${startedAt}:R>!`
              });
            }

            const nowUnix = Math.floor(Date.now() / 1000);
            const loginEmbed = new EmbedBuilder()
              .setColor('#10b981')
              .setTitle('🟢 تسجيل دخول إداري جديد (Shift Started)')
              .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
              .addFields(
                { name: '👤 الإداري', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                { name: '🆔 الأيدي', value: `\`${interaction.user.id}\``, inline: true },
                { name: '⏰ وقت البداية', value: `<t:${nowUnix}:F>\n(<t:${nowUnix}:R>)`, inline: false }
              )
              .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
              .setTimestamp();

            if (logChannel && logChannel.isTextBased()) {
              await logChannel.send({ embeds: [loginEmbed] }).catch(() => {});
            }

            return interaction.editReply({
              content: `✅ **تم تسجيل بداية دوامك بنجاح!**\nالوقت: <t:${nowUnix}:T>. بالتوفيق في خدمة الأعضاء 🫡`
            });
          }

          // تسجيل الخروج (Logout)
          if (interaction.customId === 'staff_logout_btn') {
            const result = db.endStaffShift(interaction.guild.id, interaction.user.id, 'user');
            if (!result.success && result.error === 'not_active') {
              return interaction.editReply({
                content: '❌ أنت لست مسجلاً في الخدمة حالياً! اضغط على زر **تسجيل الدخول** لبدء دوامك أولاً.'
              });
            }

            const durationHours = Math.floor(result.duration / 3600);
            const durationMins = Math.floor((result.duration % 3600) / 60);
            const durationSecs = result.duration % 60;
            const durationStr = `${durationHours > 0 ? `${durationHours} ساعة و ` : ''}${durationMins} دقيقة و ${durationSecs} ثانية`;

            const logoutEmbed = new EmbedBuilder()
              .setColor('#ef4444')
              .setTitle('🔴 تسجيل خروج إداري (Shift Ended)')
              .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
              .addFields(
                { name: '👤 الإداري', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                { name: '⏱️ مدة التواجد', value: `\`${durationStr}\``, inline: true },
                { name: '⭐ النقاط المكتسبة', value: `+${result.pointsEarned} نقطة`, inline: true },
                { name: '⏰ البداية', value: `<t:${result.startTime}:T>`, inline: true },
                { name: '⏰ النهاية', value: `<t:${result.endTime}:T>`, inline: true },
                { name: '📌 نوع الخروج', value: 'يدوي (بواسطة الإداري)', inline: true }
              )
              .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
              .setTimestamp();

            if (logChannel && logChannel.isTextBased()) {
              await logChannel.send({ embeds: [logoutEmbed] }).catch(() => {});
            }

            return interaction.editReply({
              content: `🛑 **تم تسجيل خروجك بنجاح!**\n⏱️ إجمالي مدة خدمتك اليوم: **${durationStr}**\n⭐ نقاط إضافية: **+${result.pointsEarned}** نقطة.\nشكراً لجهودك وعملك المتميز! 👏`
            });
          }
        } catch (shiftErr) {
          logger.error('[STAFF SHIFT ERROR]', shiftErr);
          if (shiftDeferred) {
            await interaction.editReply({ content: '❌ حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.' }).catch(() => {});
          }
        }
      }
    } catch (err) {
      logger.error('خطأ في interactionCreate:', err);
    }
  }
};