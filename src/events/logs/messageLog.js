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

      // استرجاع البيانات من الكاش الخاص بنا إذا كانت مفقودة من Discord.js
      const cached = getCachedMessage(message.id);

      // إذا كان الكاتب بوتاً، نتجاهل
      if (message.author?.bot || cached?.author?.bot) return;

      // تجهيز بيانات الكاتب والمحتوى
      let authorId = message.author?.id || cached?.author?.id || null;
      let authorTag = message.author?.tag || cached?.author?.tag || null;
      let authorUsername = message.author?.username || cached?.author?.username || null;
      let authorAvatar = (typeof message.author?.displayAvatarURL === 'function' ? message.author.displayAvatarURL({ dynamic: true }) : null) || cached?.author?.avatarURL || null;
      let content = message.content || cached?.content || '';
      
      // فحص المرفقات والصور
      let imageAtt = message.attachments?.find(a => a.contentType?.startsWith('image') || /\.(png|jpe?g|webp|gif)$/i.test(a.url));
      if (!imageAtt && cached?.attachments?.length > 0) {
        imageAtt = cached.attachments.find(a => a.contentType?.startsWith('image') || /\.(png|jpe?g|webp|gif)$/i.test(a.url));
      }
      const hasImage = !!imageAtt;

      // البحث في سجل التدقيق لمعرفة ما إذا كان هناك مشرف قام بالحذف أو التعرف على الكاتب
      let deletedBy = null;
      try {
        const auditLogs = await guild.fetchAuditLogs({ limit: 3, type: AuditLogEvent.MessageDelete }).catch(() => null);
        if (auditLogs) {
          const entry = auditLogs.entries.find(e => 
            e.extra?.channel?.id === message.channelId &&
            (!e.target || e.target.id === authorId) &&
            (Date.now() - e.createdTimestamp < 10000)
          );
          if (entry) {
            if (entry.executor && entry.executor.id !== authorId) {
              deletedBy = entry.executor;
            }
            if (!authorId && entry.target) {
              authorId = entry.target.id;
              authorTag = entry.target.tag;
              authorUsername = entry.target.username;
              if (typeof entry.target.displayAvatarURL === 'function') {
                authorAvatar = entry.target.displayAvatarURL({ dynamic: true });
              }
            }
          }
        }
      } catch (err) {}

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

      if (deletedBy) {
        fields.push({ name: '🛡️ تم الحذف بواسطة', value: `<@${deletedBy.id}> (${deletedBy.tag || deletedBy.username})`, inline: true });
      }

      fields.push({
        name: '📝 المحتوى',
        value: content ? (content.length > 1000 ? content.slice(0, 1000) + '...' : content) : (hasImage ? '*[صورة مرفقة]*' : '*[لا يوجد محتوى مسجل]*'),
        inline: false
      });

      const eventId = 'msg_delete';
      await sendServerLog(guild, eventId, 'messages', {
        title: hasImage ? '🖼️ حذف صورة' : '🗑️ حذف رسالة',
        desc: `تم حذف رسالة في <#${message.channelId}>`,
        fields,
        image: imageAtt ? (imageAtt.proxyURL || imageAtt.url) : null,
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
    name: 'messageReactionAdd',
    async execute(reaction, user) {
      try {
        if (user.bot) return;
        if (reaction.partial) await reaction.fetch().catch(() => {});
        const message = reaction.message;
        if (!message?.guild) return;
        // تجاهل تفاعلات دخول السحوبات لتقليل الضجيج
        try {
          const gw = db.getGiveaway ? db.getGiveaway(message.id) : null;
          if (gw && gw.status === 'active' && (gw.entry_mode || 'button') === 'reaction') return;
        } catch {}
        await sendServerLog(message.guild, 'msg_reaction_add', 'messages', {
          title: 'إضافة تفاعل',
          desc: `تفاعل ${reaction.emoji} على رسالة في <#${message.channelId}>`,
          fields: [
            { name: '👤 العضو', value: `<@${user.id}> (${user.tag})`, inline: true },
            { name: '📌 القناة', value: `<#${message.channelId}>`, inline: true },
            { name: '🔗 الرابط', value: `[اضغط هنا](${message.url})`, inline: true }
          ]
        });
      } catch {}
    }
  },
  {
    name: 'messageReactionRemove',
    async execute(reaction, user) {
      try {
        if (user.bot) return;
        if (reaction.partial) await reaction.fetch().catch(() => {});
        const message = reaction.message;
        if (!message?.guild) return;
        await sendServerLog(message.guild, 'msg_reaction_remove', 'messages', {
          title: 'إزالة تفاعل',
          desc: `إزالة تفاعل ${reaction.emoji} من رسالة في <#${message.channelId}>`,
          fields: [
            { name: '👤 العضو', value: `<@${user.id}> (${user.tag})`, inline: true },
            { name: '📌 القناة', value: `<#${message.channelId}>`, inline: true },
            { name: '🔗 الرابط', value: `[اضغط هنا](${message.url})`, inline: true }
          ]
        });
      } catch {}
    }
  },
  {
    name: 'messageReactionRemoveAll',
    async execute(message) {
      try {
        if (message.partial) await message.fetch().catch(() => {});
        if (!message?.guild) return;
        await sendServerLog(message.guild, 'msg_reaction_remove_all', 'messages', {
          title: 'مسح جميع التفاعلات',
          desc: `تم مسح كل التفاعلات من رسالة في <#${message.channelId}>`,
          fields: [
            { name: '📌 القناة', value: `<#${message.channelId}>`, inline: true },
            { name: '🔗 الرابط', value: `[اضغط هنا](${message.url})`, inline: true }
          ]
        });
      } catch {}
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
