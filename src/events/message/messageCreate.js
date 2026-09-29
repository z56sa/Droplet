const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const embedUtil = require('../../utils/embed');
const config = require('../../config.json');
const { askAI } = require('../../utils/ai');

// مخزن مؤقت لكشف السبام (Spam Protection)
const spamMap = new Map();

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (!message.guild || message.author.bot) return;

    const guildId = message.guild.id;
    const userId = message.author.id;
    const settings = db.getGuildSettings(guildId);

    // =========================================================================
    // 🛡️ ZENO Security Guardian: secrets + dangerous files
    // Runs before AI/Auto-Mod so sensitive data never reaches the AI layer.
    // =========================================================================
    if (client.securityGuardian) {
      try {
        const securityScan = await client.securityGuardian.scanMessage(message);
        const sensitiveFindings = securityScan.findings.filter(f => !f.startsWith('Dangerous attachment:'));
        const dangerousFiles = securityScan.findings.filter(f => f.startsWith('Dangerous attachment:'));

        if (sensitiveFindings.length || dangerousFiles.length) {
          await message.delete().catch(() => {});

          const reasons = [
            ...sensitiveFindings.map(f => `Sensitive information: ${f}`),
            ...dangerousFiles
          ];

          await client.securityGuardian.report(
            message.guild,
            'Blocked security incident',
            `User ${message.author.id} in guild ${guildId}. Findings: ${reasons.join(', ')}`,
            'critical'
          );

          const warning = await message.channel.send({
            content: `⚠️ ${message.author} تم حظر المحتوى تلقائياً لحماية السيرفر والبيانات.`
          }).catch(() => null);
          if (warning) setTimeout(() => warning.delete().catch(() => {}), 7000);
          return;
        }
      } catch (securityError) {
        // Security scanner failure is reported, but does not crash the message handler.
        await client.securityGuardian.report(
          message.guild,
          'Security scanner error',
          securityError?.stack || String(securityError),
          'warning'
        ).catch(() => {});
      }
    }

    // تحديث كاش السيرفر إذا لم يكن متوفراً
    const serverTracker = require('../../utils/serverTracker');
    if (!serverTracker.memoryGuilds.has(guildId)) {
      serverTracker.trackGuild(message.guild).catch(() => {});
    }

    // حفظ وتحديث بيانات العضو (الاسم والصورة) في كاش قاعدة البيانات و Turso
    if (db.trackUserProfile) {
      db.trackUserProfile({
        userId: message.author.id,
        username: message.author.tag || message.author.username,
        displayName: message.member?.displayName || message.author.globalName || message.author.username,
        avatar: message.author.avatar,
        avatarUrl: message.author.displayAvatarURL({ dynamic: true, size: 128 })
      });
    }

    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator) ||
                    message.member?.permissions.has(PermissionFlagsBits.ManageGuild);

    // الأدمنية غير معفيين من الرقابة التلقائية بأي حال — يجب إضافتهم يدوياً في الداشبورد
    const isAutoModWhitelisted =
      (settings.automod_whitelist_role && message.member?.roles.cache.has(settings.automod_whitelist_role)) ||
      (settings.automod_whitelist_channel && message.channel.id === settings.automod_whitelist_channel) ||
      (settings.automod_exempt_users && settings.automod_exempt_users.split(',').map(u => u.trim()).includes(userId)) ||
      (db.isUserWhitelisted && db.isUserWhitelisted(guildId, userId, 'whitelist'));

    // 👮 Staff Activity: تسجيل رسائل الإدارة تلقائياً
    const isStaff = isAdmin || 
      (settings.staff_role && message.member?.roles.cache.has(settings.staff_role)) ||
      (settings.support_role && message.member?.roles.cache.has(settings.support_role)) ||
      message.member?.permissions.has(PermissionFlagsBits.ModerateMembers);

    if (isStaff && db.addStaffMessages) {
      db.addStaffMessages(guildId, userId, 1);
      if (db.touchStaffShiftAction) db.touchStaffShiftAction(guildId, userId);
    }

    // =========================================================================
    // 🤖 التحدث التلقائي المباشر مع ZENO بالذكاء الاصطناعي (أولوية قصوى)
    // =========================================================================
    const cleanContent = message.content ? message.content.trim() : '';
    const botMentionRegex = new RegExp(`^<@!?${client.user?.id}>`);
    const isBotMentioned = botMentionRegex.test(cleanContent) || (message.mentions && message.mentions.has(client.user?.id) && !message.mentions.everyone);

    // كشف مناداة ZENO أو زينو في بداية الرسالة أو كلمة ZENO منفردة
    const zenoCallRegex = /^(?:zeno|زينو)(?:[\s,:!\?؟-]+(.+)|$)/i;
    const matchZeno = cleanContent.match(zenoCallRegex);

    if (isBotMentioned || matchZeno) {
      let userPrompt = '';
      if (isBotMentioned) {
        userPrompt = cleanContent.replace(botMentionRegex, '').replace(new RegExp(`<@!?${client.user?.id}>`, 'g'), '').trim();
      } else if (matchZeno) {
        userPrompt = (matchZeno[1] || '').trim();
      }

      if (!userPrompt) {
        userPrompt = 'أهلاً وسهلاً! أنا ZENO، كيف يمكنني مساعدتك اليوم؟';
      }

      try {
        await message.channel.sendTyping().catch(() => {});
        const aiResponse = await askAI(userPrompt);

        if (aiResponse) {
          if (aiResponse.length <= 2000) {
            await message.reply({ content: aiResponse }).catch(async () => {
              await message.channel.send({ content: aiResponse }).catch(() => {});
            });
          } else {
            const chunks = aiResponse.match(/[\s\S]{1,1950}/g) || [aiResponse];
            await message.reply({ content: chunks[0] }).catch(async () => {
              await message.channel.send({ content: chunks[0] }).catch(() => {});
            });
            for (let i = 1; i < chunks.length; i++) {
              await message.channel.send({ content: chunks[i] }).catch(() => {});
            }
          }
        }
        return; // تم التفاعل بنجاح
      } catch (err) {
        console.error('[Auto ZENO AI Error]:', err);
      }
    }

    // ==========================================
    // 🛡️ درع الرقابة التلقائية المتقدم (Auto-Mod)
    // ==========================================

    if (!isAutoModWhitelisted) {
      // 1. فلتر الكلمات المحظورة والشتم (Blacklist Words Filter)
      if (settings.bad_words_enabled && settings.bad_words_list) {
        const rawList = settings.bad_words_list.split(/[\n,]+/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
        const lowerMsg = message.content.toLowerCase();
        const foundBadWord = rawList.find(word => lowerMsg.includes(word));

        if (foundBadWord) {
          try {
            await message.delete().catch(() => {});

            // تطبيق الإجراء المحدد
            const action = settings.automod_action || 'warn';
            let actionText = 'تحذير';

            if (action === 'timeout_5m') {
              await message.member?.timeout(5 * 60 * 1000, 'Auto-Mod: استخدام كلمات محظورة').catch(() => {});
              actionText = 'عزل مؤقت (5 دقائق)';
            } else if (action === 'timeout_1h') {
              await message.member?.timeout(60 * 60 * 1000, 'Auto-Mod: استخدام كلمات محظورة').catch(() => {});
              actionText = 'عزل مؤقت (ساعة)';
            } else if (action === 'kick') {
              await message.member?.kick('Auto-Mod: استخدام كلمات محظورة').catch(() => {});
              actionText = 'طرد من السيرفر';
            }

            const alert = await message.channel.send({
              content: `⚠️ **الرقابة التلقائية | Auto-Mod:** يا ${message.author}، تم حذف رسالتك لاحتوائها على كلمات غير مسموح بها! (${actionText})`
            });
            setTimeout(() => alert.delete().catch(() => {}), 5000);

            // إرسال تقرير اللوق
            if (settings.log_channel) {
              const logCh = message.guild.channels.cache.get(settings.log_channel);
              if (logCh) {
                logCh.send({
                  embeds: [new (require('discord.js').EmbedBuilder)()
                    .setColor('#E74C3C')
                    .setTitle('🛡️ Auto-Mod | رصد كلمة محظورة')
                    .addFields(
                      { name: '👤 العضو', value: `${message.author.tag} (${message.author.id})`, inline: true },
                      { name: '💬 الروم', value: `<#${message.channel.id}>`, inline: true },
                      { name: '⚖️ الإجراء المتخذ', value: actionText, inline: true },
                      { name: '📄 نص الرسالة', value: `\`\`\`${message.content.substring(0, 1000)}\`\`\``, inline: false }
                    )
                    .setTimestamp()
                  ]
                }).catch(() => {});
              }
            }
            return;
          } catch (err) {
            console.error('فشل في معالجة الكلمات المحظورة:', err);
          }
        }
      }

      // 2. منع المنشن الجماعي (Anti-Mass-Mention)
      if (settings.anti_mass_mention) {
        const mentionLimit = settings.max_mentions || 4;
        const totalMentions = message.mentions.users.size + message.mentions.roles.size;
        if (totalMentions >= mentionLimit) {
          try {
            await message.delete().catch(() => {});
            await message.member?.timeout(5 * 60 * 1000, 'Auto-Mod: منشن جماعي مفرط').catch(() => {});
            const warn = await message.channel.send({
              content: `⚠️ **Auto-Mod:** تم حذف رسالة ${message.author} وعزله 5 دقائق لتجاوز حد المنشن المسموح (${totalMentions}/${mentionLimit})!`
            });
            setTimeout(() => warn.delete().catch(() => {}), 6000);
            return;
          } catch (err) {
            console.error('فشل معالجة المنشن الجماعي:', err);
          }
        }
      }

      // 3. منع الحروف الكبيرة الصارخة (Anti-Caps)
      if (settings.anti_caps && message.content.length >= 8) {
        const letters = message.content.replace(/[^a-zA-Z]/g, '');
        if (letters.length >= 6) {
          const upperCount = letters.replace(/[^A-Z]/g, '').length;
          const capsRatio = upperCount / letters.length;
          if (capsRatio > 0.7) {
            try {
              await message.delete().catch(() => {});
              const warn = await message.channel.send({
                content: `⚠️ **Auto-Mod:** يا ${message.author}، يرجى عدم الكتابة بالحروف الكبيرة (Caps Lock) بشكل مفرط!`
              });
              setTimeout(() => warn.delete().catch(() => {}), 4000);
              return;
            } catch (err) {}
          }
        }
      }

      // 4. منع سبام الإيموجيات (Anti-Emoji-Spam)
      if (settings.anti_emoji_spam || settings.anti_emoji) {
        const maxEmojis = settings.max_emojis || 5;
        const customEmojis = (message.content.match(/<a?:.+?:\d+>/g) || []).length;
        const unicodeEmojis = (message.content.match(/\p{Extended_Pictographic}/gu) || []).length;
        const totalEmojis = customEmojis + unicodeEmojis;

        if (totalEmojis > maxEmojis) {
          try {
            await message.delete().catch(() => {});
            const warn = await message.channel.send({
              content: `⚠️ **Auto-Mod:** يا ${message.author}، تم حذف رسالتك لتجاوز حد الإيموجيات المسموح (${totalEmojis}/${maxEmojis})!`
            });
            setTimeout(() => warn.delete().catch(() => {}), 4000);
            return;
          } catch (err) {}
        }
      }

      // 5. منع تكرار الأسطر الفارغة والنصوص الطويلة (Anti-Line-Spam)
      if (settings.anti_line_spam) {
        const maxLines = settings.max_lines || 8;
        const linesCount = message.content.split('\n').length;
        if (linesCount > maxLines) {
          try {
            await message.delete().catch(() => {});
            const warn = await message.channel.send({
              content: `⚠️ **Auto-Mod:** يا ${message.author}، يرجى عدم النزول بأسطر متعددة في رسالة واحدة!`
            });
            setTimeout(() => warn.delete().catch(() => {}), 4000);
            return;
          } catch (err) {}
        }
      }

      // 6. منع إزعاج السبويلر (Anti-Spoilers)
      if (settings.anti_spoilers) {
        const spoilerMatches = (message.content.match(/\|\|.*?\|\|/g) || []).length;
        if (spoilerMatches >= 3) {
          try {
            await message.delete().catch(() => {});
            const warn = await message.channel.send({
              content: `⚠️ **Auto-Mod:** يا ${message.author}، يمنع الاستخدام المفرط لعلامات السبويلر (Spoilers)!`
            });
            setTimeout(() => warn.delete().catch(() => {}), 4000);
            return;
          } catch (err) {}
        }
      }

      // 7. منع نصوص زالجو المشوهة (Anti-Zalgo Text)
      if (settings.anti_zalgo) {
        const zalgoRegex = /[\u0300-\u036F\u0489\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]{3,}/g;
        if (zalgoRegex.test(message.content)) {
          try {
            await message.delete().catch(() => {});
            const warn = await message.channel.send({
              content: `⚠️ **Auto-Mod:** يا ${message.author}، يمنع إرسال النصوص المشوهة والرموز الغريبة (Zalgo Text)!`
            });
            setTimeout(() => warn.delete().catch(() => {}), 4000);
            return;
          } catch (err) {}
        }
      }

      // 8. منع تكرار نفس الحرف أو الكلمة (Anti-Text-Repeat)
      if (settings.anti_text_repeat) {
        const charRepeatRegex = /(.)\1{7,}/i;
        const wordRepeatRegex = /\b(\w+)\s+\1\s+\1\s+\1\b/i;
        if (charRepeatRegex.test(message.content) || wordRepeatRegex.test(message.content)) {
          try {
            await message.delete().catch(() => {});
            const warn = await message.channel.send({
              content: `⚠️ **Auto-Mod:** يا ${message.author}، يمنع تكرار نفس الحروف أو الكلمات بشكل مفرط!`
            });
            setTimeout(() => warn.delete().catch(() => {}), 4000);
            return;
          } catch (err) {}
        }
      }

      // 9. منع سبام الملصقات (Anti-Stickers)
      if (settings.anti_stickers && message.stickers && message.stickers.size > 0) {
        try {
          await message.delete().catch(() => {});
          const warn = await message.channel.send({
            content: `⚠️ **Auto-Mod:** يا ${message.author}، إرسال الملصقات غير مسموح به حالياً!`
          });
          setTimeout(() => warn.delete().catch(() => {}), 4000);
          return;
        } catch (err) {}
      }

      // 10. منع الرسائل الطويلة المفرطة (Anti-Long-Messages)
      if (settings.anti_long_messages && message.content.length > 1000) {
        try {
          await message.delete().catch(() => {});
          const warn = await message.channel.send({
            content: `⚠️ **Auto-Mod:** يا ${message.author}، تم حذف رسالتك لتجاوزها الحد الأقصى للأحرف!`
          });
          setTimeout(() => warn.delete().catch(() => {}), 4000);
          return;
        } catch (err) {}
      }
    }

    // --- 1. نظام الحماية من الروابط (Anti-Link) ---
    if ((settings.anti_link || settings.anti_links) && !isAutoModWhitelisted) {
      const linkRegex = /(https?:\/\/[^\s]+)|(discord\.(gg|io|me|li)\/[^\s]+)|(discord\.com\/invite\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|net|org|xyz|gg|tk|ml|ga|cf|gq)\b)/gi;
      if (linkRegex.test(message.content)) {
        try {
          await message.delete().catch(() => {});
          const warnMsg = await message.channel.send({
            content: `🚫 **تم حذف الرابط تلقائياً!** يمنع نشر الروابط في السيرفر يا ${message.author}!`
          }).catch(() => {});
          if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
          return;
        } catch (err) {
          console.error('فشل حذف الرابط (تأكد من صلاحيات البوت Manage Messages):', err);
        }
      }
    }

    // --- 1.5 نظام الحماية من دعوات الديسكورد (Anti-Invites) ---
    if ((settings.anti_invites || settings.anti_invite_links) && !isAutoModWhitelisted) {
      const inviteRegex = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/[a-zA-Z0-9\-._]+/gi;
      if (inviteRegex.test(message.content)) {
        try {
          await message.delete().catch(() => {});
          const warnMsg = await message.channel.send({
            content: `🔗 **تم حذف الدعوة!** ممنوع نشر دعوات السيرفرات الأخرى يا ${message.author}!`
          }).catch(() => {});
          if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
          return;
        } catch (err) {
          console.error('فشل حذف دعوة الديسكورد:', err);
        }
      }
    }

    // --- 1.6 تتبع الرسائل لكشف الغوست بينج (Anti-Ghost-Ping Tracker) ---
    if (settings.anti_ghost_ping && message.mentions.users.size > 0 && !message.author.bot) {
      // حفظ معرفات المذكورين مؤقتاً في الرسالة (سيتم الكشف في messageDelete)
      message.mentionedUserIds = [...message.mentions.users.keys()];
    }

    // --- 2. نظام الحماية من السبام (Anti-Spam) ---
    if (settings.anti_spam) {
      const now = Date.now();
      const userSpam = spamMap.get(userId) || { count: 0, lastMessage: now, messages: [] };

      if (now - userSpam.lastMessage < 2500) {
        userSpam.count += 1;
        userSpam.messages.push(message);
      } else {
        userSpam.count = 1;
        userSpam.messages = [message];
      }
      userSpam.lastMessage = now;
      spamMap.set(userId, userSpam);

      if (userSpam.count >= 4) {
        try {
          // حذف رسائل السبام السريعة
          for (const msg of userSpam.messages) {
            await msg.delete().catch(() => {});
          }
          await message.member?.timeout(60 * 1000, 'Anti-Spam Protection').catch(() => {});
          const spamWarn = await message.channel.send({
            content: `⚠️ تم إسكات ${message.author} لمدة دقيقة وحذف الرسائل المتكررة (Anti-Spam).`
          });
          setTimeout(() => spamWarn.delete().catch(() => {}), 6000);
          spamMap.delete(userId);
          return;
        } catch (err) {
          console.error('فشل في معالجة السبام:', err);
        }
      }
    }

    // --- 3. نظام نقاط الخبرة والمستويات (XP & Leveling) ---
    if (settings.leveling_enabled !== 0) {
      const userDb = db.getUser(userId, guildId);
      const now = Date.now();
      const economy = config.economy || { xpCooldownMs: 60000, xpPerMessage: 5 };
      if (now - userDb.last_message_xp >= economy.xpCooldownMs) {
        const baseXP = Math.floor(Math.random() * 10) + economy.xpPerMessage;
        const multiplier = settings.level_multiplier || 1;
        const xpGained = baseXP * multiplier;

        const { level, leveledUp } = db.addXp(userId, guildId, xpGained);

        if (leveledUp) {
          // فحص مكافآت الرتب للمستوى الجديد وإعطاؤها للعضو
          try {
            const rewards = db.getLevelRewards ? db.getLevelRewards(guildId).filter(r => r.level <= level) : [];
            for (const rew of rewards) {
              const roleObj = message.guild.roles.cache.get(rew.role_id) || await message.guild.roles.fetch(rew.role_id).catch(() => null);
              if (roleObj && !message.member.roles.cache.has(roleObj.id)) {
                await message.member.roles.add(roleObj).catch(() => {});
              }
            }
          } catch (e) {}

          // تجهيز رسالة رفع المستوى (إن كانت مفعّلة)
          if (settings.level_up_msg_enabled !== 0) {
            let rawMsg = settings.level_message || '🎉 مبروك يا [user]! لقد ارتفع مستواك إلى **المستوى [level]**! 🚀';
            const formattedMsg = rawMsg
              .replace(/\[user\]/gi, `<@${message.author.id}>`)
              .replace(/\{user\}/gi, `<@${message.author.id}>`)
              .replace(/\[mention\]/gi, `<@${message.author.id}>`)
              .replace(/\{mention\}/gi, `<@${message.author.id}>`)
              .replace(/\[userName\]/gi, message.author.username)
              .replace(/\{userName\}/gi, message.author.username)
              .replace(/\[level\]/gi, level.toString())
              .replace(/\{level\}/gi, level.toString())
              .replace(/\[server\]/gi, message.guild.name)
              .replace(/\{server\}/gi, message.guild.name);

            const levelEmbed = new EmbedBuilder()
              .setColor(config.colors.primary || '#9333ea')
              .setAuthor({ name: `ترقية مستوى جديد! (Level Up) 🎉`, iconURL: message.guild.iconURL() || undefined })
              .setDescription(formattedMsg)
              .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 256 }))
              .addFields(
                { name: '🎖️ المستوى الجديد', value: `\`Level ${level}\``, inline: true },
                { name: '👤 العضو', value: `<@${message.author.id}>`, inline: true }
              )
              .setFooter({ text: `${message.guild.name} • Leveling System` })
              .setTimestamp();

            const channelMode = settings.level_channel || 'current';
            if (channelMode === 'disabled') {
              // معطلة بدون إرسال رسالة
            } else if (channelMode === 'dm') {
              message.author.send({ embeds: [levelEmbed] }).catch(() => {});
            } else if (channelMode === 'current') {
              await message.channel.send({ embeds: [levelEmbed] }).catch(() => {});
            } else {
              // روم مخصص
              const targetChan = message.guild.channels.cache.get(channelMode) || await message.guild.channels.fetch(channelMode).catch(() => null);
              if (targetChan && targetChan.isTextBased()) {
                targetChan.send({ embeds: [levelEmbed] }).catch(() => {});
              }
            }
          }
        }
      }
    }

    // --- 4. نظام الرد التلقائي المتقدم (Versa Advanced Auto Responder) ---
    const autoResponders = db.getAutoResponders(guildId);
    if (autoResponders && autoResponders.length > 0) {
      const rawContent = message.content.trim();
      const lowerContent = rawContent.toLowerCase();

      for (const r of autoResponders) {
        if (r.is_active === 0) continue;

        // فحص القنوات والرتب المستثناة والمسموحة
        if (r.exempt_channels && r.exempt_channels.split(',').includes(message.channel.id)) continue;
        if (r.allowed_channels && !r.allowed_channels.split(',').includes(message.channel.id)) continue;
        if (r.exempt_roles && message.member && r.exempt_roles.split(',').some(roleId => message.member.roles.cache.has(roleId))) continue;
        if (r.allowed_roles && message.member && !r.allowed_roles.split(',').some(roleId => message.member.roles.cache.has(roleId))) continue;

        const trig = r.case_sensitive ? r.trigger_word : r.trigger_word.toLowerCase();
        const testContent = r.case_sensitive ? rawContent : lowerContent;
        let isMatch = false;

        const mode = r.match_mode || 'contains';
        if (mode === 'exact') {
          isMatch = (testContent === trig);
        } else if (mode === 'starts') {
          isMatch = testContent.startsWith(trig);
        } else if (mode === 'ends') {
          isMatch = testContent.endsWith(trig);
        } else if (mode === 'regex') {
          try {
            const re = new RegExp(r.trigger_word, r.case_sensitive ? '' : 'i');
            isMatch = re.test(rawContent);
          } catch(e) {}
        } else {
          // 'contains' / يحتوي على
          isMatch = testContent.includes(trig);
        }

        if (isMatch) {
          // حذف رسالة المحفز إذا كان الخيار مفعل
          if (r.delete_trigger) {
            message.delete().catch(() => {});
          }

          // تجهيز المتغيرات
          let replyContent = r.reply_text || '';
          replyContent = replyContent
            .replace(/\{user\}/gi, `<@${message.author.id}>`)
            .replace(/\{username\}/gi, message.author.username)
            .replace(/\{server\}/gi, message.guild.name)
            .replace(/\{channel\}/gi, `<#${message.channel.id}>`)
            .replace(/\{memberCount\}/gi, message.guild.memberCount.toString());

          if (r.reply_type === 'reaction') {
            // تفاعل إيموجي
            try {
              message.react(r.reply_text.trim()).catch(() => {});
            } catch(e) {}
          } else if (r.reply_type === 'embed') {
            // رسالة إيمبد
            const autoEmbed = new EmbedBuilder()
              .setColor('#EF5700')
              .setDescription(replyContent)
              .setTimestamp();
            message.channel.send({ embeds: [autoEmbed] }).catch(() => {});
          } else {
            // رد نصي عادي
            message.reply({ content: replyContent }).catch(() => {
              message.channel.send({ content: replyContent }).catch(() => {});
            });
          }

          if (db.incrementAutoResponderUse) {
            db.incrementAutoResponderUse(r.id);
          }
          break; // تم تنفيذ الرد المطابق
        }
      }
    }

    // --- 4.5. نظام الخط التلقائي (Auto-Line) ---
    let autolineChannels = [];
    try {
      autolineChannels = JSON.parse(settings.autoline_channels || '[]');
    } catch(e) {}

    if (autolineChannels.includes(message.channel.id)) {
      const lineUrl = settings.autoline_line || 'https://cdn.discordapp.com/attachments/1083818318856237128/1148721611180638318/line.png';
      const mode = settings.autoline_mode || 'line';
      if (mode === 'line') {
        message.channel.send({ content: lineUrl }).catch(() => {});
      } else if (mode === 'embed') {
        const lineEmbed = new EmbedBuilder().setColor(config.colors?.primary || '#5865F2').setImage(lineUrl);
        message.channel.send({ embeds: [lineEmbed] }).catch(() => {});
      }
    }

    // --- 4.6. روم الملاحظات والآراء (Feedback Channel) ---
    if (settings.feedback_channel && message.channel.id === settings.feedback_channel && !message.content.startsWith(settings.prefix || '#')) {
      const feedbackLine = settings.feedback_line || settings.autoline_line;
      const feedbackMode = settings.feedback_mode || 'embed';
      if (feedbackMode === 'embed') {
        const fbEmbed = new EmbedBuilder()
          .setColor(config.colors?.primary || '#5865F2')
          .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
          .setDescription(message.content)
          .setTimestamp();
        if (message.attachments.size > 0) {
          fbEmbed.setImage(message.attachments.first().url);
        }
        await message.delete().catch(() => {});
        const sent = await message.channel.send({ embeds: [fbEmbed] }).catch(() => null);
        if (sent) {
          sent.react('❤️').catch(() => {});
          sent.react('⭐').catch(() => {});
        }
        if (feedbackLine) {
          message.channel.send({ content: feedbackLine }).catch(() => {});
        }
      }
    }

    // --- 4.7. روم ناديكو (Nadeko Room Protection / Whitelist) ---
    let nadekoChannels = [];
    try {
      nadekoChannels = JSON.parse(settings.nadeko_channels || '[]');
    } catch(e) {}
    // تمكين تفاعل الأعضاء بحرية أو توجيهات داخل الروم المخصص

    // --- 5. معالجة الأوامر بالبرفكس (Prefix Commands) ---
    const prefix = settings.prefix || config.defaultPrefix || '#';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    let command = client.prefixCommands.get(commandName) ||
                    client.prefixCommands.get(client.aliases.get(commandName));

    // فحص اختصارات الأوامر المخصصة (Custom Aliases) من الداشبورد
    let cmdConfigs = {};
    try {
      cmdConfigs = typeof settings.command_configs === 'string' ? JSON.parse(settings.command_configs) : (settings.command_configs || {});
    } catch(e) {}

    let matchedCmdKey = null;
    if (!command) {
      for (const [cmdKey, cfg] of Object.entries(cmdConfigs)) {
        if (cfg && cfg.alias) {
          const cleanAlias = cfg.alias.replace(/^[/#!.]+/, '').toLowerCase();
          if (cleanAlias === commandName || cfg.alias.toLowerCase() === (prefix + commandName).toLowerCase()) {
            const rawName = cmdKey.replace(/^\//, '');
            command = client.prefixCommands.get(rawName) || client.prefixCommands.get(client.aliases.get(rawName));
            if (command) {
              matchedCmdKey = cmdKey;
              break;
            }
          }
        }
      }
    }

    if (!command) return;

    try {
      // فحص الأوامر المعطلة من الداشبورد
      const disabledCmdsRaw = settings.disabled_commands || '[]';
      let disabledCmdsList = [];
      try { disabledCmdsList = JSON.parse(disabledCmdsRaw); } catch(e) {}
      const prefixCmdSlash = '/' + commandName;
      if (disabledCmdsList.includes(prefixCmdSlash) || disabledCmdsList.includes(commandName) || (matchedCmdKey && disabledCmdsList.includes(matchedCmdKey))) return;

      // فحص قيود الرتب والقنوات
      const activeCfg = (matchedCmdKey && cmdConfigs[matchedCmdKey]) || cmdConfigs[prefixCmdSlash] || cmdConfigs[commandName];
      if (activeCfg) {
        if (activeCfg.allowedRoles && Array.isArray(activeCfg.allowedRoles) && activeCfg.allowedRoles.length > 0) {
          const hasRole = message.member?.roles.cache.some(r => activeCfg.allowedRoles.includes(r.id));
          const isAdmin = message.member?.permissions.has(1n << 3n); // Administrator
          if (!hasRole && !isAdmin) return;
        }
        if (activeCfg.allowedChannels && Array.isArray(activeCfg.allowedChannels) && activeCfg.allowedChannels.length > 0) {
          if (!activeCfg.allowedChannels.includes(message.channelId)) return;
        }
      }

      if (command.executePrefix) {
        await command.executePrefix(message, args, client);
      }
    } catch (error) {
      console.error(`خطأ أثناء تنفيذ الأمر البرفكس ${commandName}:`, error);
      message.reply({
        embeds: [embedUtil.error('خطأ', 'حدث خطأ أثناء محاولة تنفيذ هذا الأمر.')]
      }).catch(() => {});
    }
  }
};
