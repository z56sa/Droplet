const { sendServerLog } = require('../../utils/serverLogger');
const db = require('../../database');

// تتبع آخر تثبيت لكل قناة للتمييز بين التثبيت وإلغائه
const lastPinMap = new Map(); // channelId -> ms timestamp

module.exports = [
  {
    name: 'messageDelete',
    async execute(message) {
      if (!message.guild || message.author?.bot) return;
      try { if (message.partial) await message.fetch().catch(() => {}); } catch {}
      // تجاهل الغوست-بينج هنا — معالج messageDelete يرسل تنبيهه الخاص
      try {
        const s = db.getGuildSettings ? db.getGuildSettings(message.guild.id) : {};
        if (s.anti_ghost_ping) {
          const hasM = message.mentions?.users?.size > 0 || message.mentions?.roles?.size > 0;
          const admin = message.member?.permissions?.has(0x8n);
          if (hasM && !admin) return;
        }
      } catch {}
      const hasImage = message.attachments?.some(a => a.contentType?.startsWith('image'));
      const eventId = hasImage ? 'msg_image_delete' : 'msg_delete';
      await sendServerLog(message.guild, eventId, 'messages', {
        title: hasImage ? '🖼️ حذف صورة' : '🗑️ حذف رسالة',
        desc: `تم حذف رسالة في <#${message.channelId}>`,
        fields: [
          { name: '👤 الكاتب', value: message.author ? `<@${message.author.id}> (${message.author.tag})` : 'غير معروف', inline: true },
          { name: '📌 القناة', value: `<#${message.channelId}>`, inline: true },
          { name: '📝 المحتوى', value: message.content?.slice(0, 1000) || '*[لا يوجد محتوى]*', inline: false }
        ],
        thumbnail: message.author?.displayAvatarURL({ dynamic: true })
      });
    }
  },
  {
    name: 'messageUpdate',
    async execute(oldMessage, newMessage) {
      if (!newMessage.guild || newMessage.author?.bot) return;
      try { if (oldMessage.partial) await oldMessage.fetch().catch(() => {}); } catch {}
      try { if (newMessage.partial) await newMessage.fetch().catch(() => {}); } catch {}
      if (oldMessage.content === newMessage.content) return;
      await sendServerLog(newMessage.guild, 'msg_update', 'messages', {
        title: '✏️ تعديل رسالة',
        desc: `تم تعديل رسالة في <#${newMessage.channelId}>`,
        fields: [
          { name: '👤 الكاتب', value: `<@${newMessage.author.id}> (${newMessage.author.tag})`, inline: true },
          { name: '📌 القناة', value: `<#${newMessage.channelId}>`, inline: true },
          { name: '📝 قبل', value: oldMessage.content?.slice(0, 500) || '*[لا يوجد]*', inline: false },
          { name: '📝 بعد', value: newMessage.content?.slice(0, 500) || '*[لا يوجد]*', inline: false },
          { name: '🔗 الرابط', value: `[اضغط هنا](${newMessage.url})`, inline: true }
        ],
        thumbnail: newMessage.author?.displayAvatarURL({ dynamic: true })
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
