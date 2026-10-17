const { sendServerLog } = require('../../utils/serverLogger');
const db = require('../../database');
const { AuditLogEvent } = require('discord.js');
const { cacheMessage, getCachedMessage } = require('../../utils/messageCache');

// تتبع آخر تثبيت لكل قناة للتمييز بين التثبيت وإلغائه
const lastPinMap = new Map(); // channelId -> ms timestamp

module.exports = [
  {
    name: 'messageDelete',
    async execute(message) {
      try { console.log(`[MSGLOG-DBG] messageDelete fired guild=${message.guildId || message.guild?.id} ch=${message.channelId} bot=${message.author?.bot}`); } catch {}
      const guild = message.guild;
      if (!guild) return;

      // محاولة جلب الرسالة إذا كانت جزئية
      try { if (message.partial) await message.fetch().catch(() => {}); } catch {}

      // استرجاع البيانات: 1) Discord.js | 2) الذاكرة | 3) قاعدة البيانات (يبقى بعد إعادة التشغيل)
      const cached = getCachedMessage(message.id);
      const dbCached = (!cached && db.getMessageFromLogCache) ? db.getMessageFromLogCache(message.id) : null;

      // إذا كان الكاتب بوتاً، نتجاهل
      if (message.author?.bot || cached?.author?.bot) return;

      // تجهيز بيانات الكاتب والمحتوى (الأولوية: Discord.js ← ذاكرة ← قاعدة البيانات)
      let authorId = message.author?.id || cached?.author?.id || dbCached?.author_id || null;
      let authorTag = message.author?.tag || cached?.author?.tag || dbCached?.author_tag || null;
      let authorUsername = message.author?.username || cached?.author?.username || null;
      let authorAvatar = (typeof message.author?.displayAvatarURL === 'function' ? message.author.displayAvatarURL({ dynamic: true }) : null)
                        || cached?.author?.avatarURL
                        || dbCached?.author_avatar_url || null;
      let content = message.content || cached?.content || dbCached?.content || '';

      // فحص المرفقات والصور
      const rawAtts = message.attachments?.size > 0
        ? [...message.attachments.values()]
        : (cached?.attachments || dbCached?.attachments || []);
      let imageAtt = rawAtts.find(a => a.contentType?.startsWith('image') || /\.(png|jpe?g|webp|gif)$/i.test(a.url || ''));
      const hasImage = !!imageAtt;

      // ── حفظ صورة المرفق قبل انتهاء صلاحيتها (قبل انتظار Audit Log) ──
      // روابط Discord CDN تنتهي صلاحيتها بعد الحذف — لذا نحفظ رابط الصورة مسبقاً
      const liveImageAtt = message.attachments?.size > 0
        ? [...message.attachments.values()].find(a => a.contentType?.startsWith('image') || /\.(png|jpe?g|webp|gif)$/i.test(a.url || ''))
        : null;

      // ── البحث في سجل التدقيق لمعرفة من حذف الرسالة ──
      let deletedBy = null;
      let selfDeleted = false;
      try {
        // ننتظر 1.5 ثانية لأن ديسكورد يحتاج وقتاً لكتابة الحذف في Audit Log
        await new Promise(r => setTimeout(r, 1500));

        const auditLogs = await guild.fetchAuditLogs({ limit: 10, type: AuditLogEvent.MessageDelete }).catch(() => null);
        if (auditLogs && auditLogs.entries.size > 0) {
          const now = Date.now();

          // نبحث عن أقرب سجل حذف في نفس القناة خلال 20 ثانية
          const entry = auditLogs.entries.find(e => {
            const sameChannel = e.extra?.channel?.id === message.channelId;
            const isRecent = (now - e.createdTimestamp) < 20000;
            // إذا كان الكاتب معروفاً نتحقق أن الـ target هو نفس الكاتب
            const targetMatches = !authorId || !e.target || e.target.id === authorId;
            return sameChannel && isRecent && targetMatches;
          });

          if (entry) {
            console.log(`[MSGLOG-AUDIT] found entry executor=${entry.executor?.id} target=${entry.target?.id} authorId=${authorId}`);

            // استخراج كاتب الرسالة من سجل التدقيق إذا لم يكن معروفاً
            if (!authorId && entry.target && !entry.target.bot) {
              authorId = entry.target.id;
              authorTag = entry.target.tag || entry.target.username;
              authorUsername = entry.target.username;
              if (typeof entry.target.displayAvatarURL === 'function') {
                authorAvatar = entry.target.displayAvatarURL({ dynamic: true });
              }
            }

            // تحديد من حذف الرسالة
            if (entry.executor) {
              if (entry.executor.id === authorId) {
                // الكاتب حذف رسالته بنفسه
                selfDeleted = true;
              } else {
                // شخص آخر (مشرف/بوت) حذف الرسالة
                deletedBy = entry.executor;
              }
            }
          } else {
            // لم يوجد سجل تدقيق = الكاتب حذف رسالته بنفسه (عمليات الحذف الذاتي لا تُسجَّل في Audit Log)
            if (authorId) selfDeleted = true;
          }
        } else {
          // لا توجد سجلات تدقيق حديثة = حذف ذاتي
          if (authorId) selfDeleted = true;
        }
      } catch (err) {
        console.error('[MSGLOG-AUDIT-ERR]:', err);
      }

      // تجاهل الغوست-بينج هنا — معالج messageDelete يرسل تنبيهه الخاص
      try {
        const s = db.getGuildSettings ? db.getGuildSettings(guild.id) : {};
        if (s.anti_ghost_ping) {
          const hasM = message.mentions?.users?.size > 0 || message.mentions?.roles?.size > 0;
          const admin = message.member?.permissions?.has(0x8n);
          if (hasM && !admin) return;
        }
      } catch {}

      // تنسيق حقل الكاتب
      let authorValue = 'غير معروف';
      if (authorId) {
        const displayTag = authorTag || authorUsername || authorId;
        authorValue = `<@${authorId}> (${displayTag})\n\`ID: ${authorId}\``;
      }

      const fields = [
        { name: '👤 الكاتب', value: authorValue, inline: true },
        { name: '📌 القناة', value: `<#${message.channelId}>`, inline: true }
      ];

      // حقل: من حذف الرسالة؟
      if (deletedBy) {
        fields.push({ name: '🗑️ حُذفت بواسطة', value: `<@${deletedBy.id}> (${deletedBy.tag || deletedBy.username})`, inline: true });
      } else if (selfDeleted && authorId) {
        fields.push({ name: '🗑️ حُذفت بواسطة', value: `<@${authorId}> *(حذف ذاتي)*`, inline: true });
      } else {
        fields.push({ name: '🗑️ حُذفت بواسطة', value: '*غير معروف*', inline: true });
      }

      // ── معالجة الصورة المرفقة ──
      // نستخدم الرابط الفعلي فقط إذا كانت الصورة مأخوذة مباشرة من Discord (وليس من كاش قديم)
      // لأن روابط Discord تنتهي بعد الحذف
      const freshImageUrl = liveImageAtt ? (liveImageAtt.proxyURL || liveImageAtt.url) : null;

      // المحتوى: نص أو إشارة لصورة
      const hasAnyImage = !!liveImageAtt || !!imageAtt;
      fields.push({
        name: '📝 المحتوى',
        value: content ? (content.length > 1000 ? content.slice(0, 1000) + '...' : content) : (hasAnyImage ? '*[صورة مرفقة]*' : '*[لا يوجد محتوى مسجل]*'),
        inline: false
      });

      if (liveImageAtt) {
        // إشارة اسم الملف في المحتوى كمعلومة إضافية
        fields.push({ name: '📎 اسم الملف', value: `\`${liveImageAtt.name || 'image'}\``, inline: true });
      }

      const eventId = 'msg_delete';
      await sendServerLog(guild, eventId, 'messages', {
        title: hasAnyImage ? '🖼️ حذف صورة' : '🗑️ حذف رسالة',
        desc: `تم حذف رسالة في <#${message.channelId}>`,
        fields,
        // نضع الصورة فقط إذا كانت من Discord مباشرة (رابط حي غير منتهي الصلاحية)
        image: freshImageUrl || null,
        thumbnail: authorAvatar
      });
    }
  },
  {
    name: 'messageUpdate',
    async execute(oldMessage, newMessage) {
      try { console.log(`[MSGLOG-DBG] messageUpdate fired guild=${newMessage.guildId || newMessage.guild?.id}`); } catch {}
      if (!newMessage.guild || newMessage.author?.bot) return;
      try { if (oldMessage.partial) await oldMessage.fetch().catch(() => {}); } catch {}
      try { if (newMessage.partial) await newMessage.fetch().catch(() => {}); } catch {}
      
      // تحديث كاش الرسالة
      try { cacheMessage(newMessage); } catch {}

      const cached = getCachedMessage(oldMessage.id);
      const oldContent = oldMessage.content || cached?.content || '';
      const newContent = newMessage.content || '';

      if (oldContent === newContent) return;

      const author = newMessage.author || oldMessage.author || (cached?.author ? { id: cached.author.id, tag: cached.author.tag } : null);
      const authorText = author ? `<@${author.id}> (${author.tag || author.username || author.id})` : 'غير معروف';
      const authorAvatar = newMessage.author?.displayAvatarURL({ dynamic: true }) || cached?.author?.avatarURL || null;

      await sendServerLog(newMessage.guild, 'msg_update', 'messages', {
        title: '✏️ تعديل رسالة',
        desc: `تم تعديل رسالة في <#${newMessage.channelId}>`,
        fields: [
          { name: '👤 الكاتب', value: authorText, inline: true },
          { name: '📌 القناة', value: `<#${newMessage.channelId}>`, inline: true },
          { name: '📝 قبل', value: oldContent.slice(0, 500) || '*[لا يوجد]*', inline: false },
          { name: '📝 بعد', value: newContent.slice(0, 500) || '*[لا يوجد]*', inline: false },
          { name: '🔗 الرابط', value: `[اضغط هنا](${newMessage.url})`, inline: true }
        ],
        thumbnail: authorAvatar
      });
    }
  },
  {
    name: 'messageDeleteBulk',
    async execute(messages, channel) {
      if (!channel.guild) return;
      await sendServerLog(channel.guild, 'msg_purge', 'messages', {
        title: 'ℹ️ حذف رسائل جماعي',
        desc: `تم حذف **${messages.size}** رسالة دفعة واحدة`,
        fields: [
          { name: '📌 القناة', value: `<#${channel.id}>`, inline: true },
          { name: '🔢 عدد الرسائل المحذوفة', value: `${messages.size}`, inline: true }
        ]
      });
    }
  },

  {
    name: 'channelPinsUpdate',
    async execute(channel, time) {
      try {
        if (!channel.guild) return;
        const prev = lastPinMap.get(channel.id) || 0;
        const cur = time ? time.getTime() : 0;
        lastPinMap.set(channel.id, cur);
        const isPin = cur > prev;
        await sendServerLog(channel.guild, isPin ? 'msg_pin' : 'msg_unpin', 'messages', {
          title: isPin ? 'تثبيت رسالة' : 'إلغاء تثبيت رسالة',
          desc: `${isPin ? 'تم تثبيت رسالة' : 'تم إلغاء تثبيت رسالة'} في <#${channel.id}>`,
          fields: [{ name: '📌 القناة', value: `<#${channel.id}>`, inline: true }]
        });
      } catch {}
    }
  }
];
