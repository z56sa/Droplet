// ========================================================
// FILE: src/utils/transcript.js
// منشئ سجلات التذاكر بتصميم HTML حديث وداكن (Dark Modern HTML Transcript)
// ========================================================
const { AttachmentBuilder } = require('discord.js');

async function generateHtmlTranscript(channel, options = {}) {
  const limit = options.limit || 100;
  const messages = await channel.messages.fetch({ limit }).catch(() => null);
  if (!messages) return null;

  const sortedMessages = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const guildName = channel.guild?.name || 'Server';
  const channelName = channel.name;
  const generatedAt = new Date().toLocaleString('ar-SA', { timeZone: 'UTC', dateStyle: 'full', timeStyle: 'medium' });

  let messageRows = '';

  for (const msg of sortedMessages) {
    const isBot = msg.author.bot;
    const authorName = escapeHtml(msg.author.username);
    const authorAvatar = msg.author.displayAvatarURL({ dynamic: true, size: 64 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const timestamp = new Date(msg.createdTimestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    const content = escapeHtml(msg.cleanContent || msg.content || '');

    let attachmentsHtml = '';
    if (msg.attachments && msg.attachments.size > 0) {
      msg.attachments.forEach(att => {
        const isImg = att.contentType && att.contentType.startsWith('image/');
        if (isImg) {
          attachmentsHtml += `<div class="attachment" style="margin-top:8px;"><a href="${att.url}" target="_blank"><img src="${att.url}" alt="Attachment" class="att-img" /></a></div>`;
        } else {
          attachmentsHtml += `<div class="attachment-file" style="margin-top:6px;"><a href="${att.url}" target="_blank" style="color:#38bdf8;text-decoration:none;">📎 ${escapeHtml(att.name)} (${(att.size / 1024).toFixed(1)} KB)</a></div>`;
        }
      });
    }

    let embedsHtml = '';
    if (msg.embeds && msg.embeds.length > 0) {
      msg.embeds.forEach(emb => {
        const embTitle = emb.title ? `<div class="emb-title" style="font-weight:bold;color:white;margin-bottom:4px;font-size:14px;">${escapeHtml(emb.title)}</div>` : '';
        const embDesc = emb.description ? `<div class="emb-desc" style="color:#94a3b8;font-size:12.5px;">${escapeHtml(emb.description).replace(/\n/g, '<br>')}</div>` : '';
        const color = emb.hexColor || '#5865F2';
        embedsHtml += `<div class="embed-box" style="border-right:4px solid ${color};margin-top:8px;background:#0b0d14;padding:12px 14px;border-radius:8px;font-size:13px;">${embTitle}${embDesc}</div>`;
      });
    }

    messageRows += `
      <div class="message" style="display:flex;gap:14px;align-items:flex-start;">
        <img class="avatar" src="${authorAvatar}" alt="${authorName}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;border:2px solid #2d3748;flex-shrink:0;" />
        <div class="msg-content" style="flex:1;min-width:0;">
          <div class="header" style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span class="author ${isBot ? 'bot-name' : ''}" style="font-weight:700;font-size:14px;color:${isBot ? '#818cf8' : '#f8fafc'};">${authorName}</span>
            ${isBot ? '<span class="bot-tag" style="background:#4f46e5;color:white;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px;">BOT</span>' : ''}
            <span class="timestamp" style="font-size:11px;color:#94a3b8;">${timestamp}</span>
          </div>
          ${content ? `<div class="text" style="font-size:13.5px;color:#cbd5e1;line-height:1.5;word-break:break-word;background:#0f111a;padding:10px 14px;border-radius:10px;display:inline-block;max-width:100%;border:1px solid #1e293b;">${content.replace(/\n/g, '<br>')}</div>` : ''}
          ${attachmentsHtml}
          ${embedsHtml}
        </div>
      </div>
    `;
  }

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>سجل تذكرة - #${escapeHtml(channelName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    body { background-color: #0f111a; color: #e2e8f0; padding: 24px; direction: rtl; }
    .container { max-width: 900px; margin: 0 auto; background: #161926; border-radius: 16px; border: 1px solid #2d3748; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .header-bar { background: linear-gradient(135deg, #6b21a8, #3b82f6); padding: 24px; color: white; display: flex; justify-content: space-between; align-items: center; }
    .header-bar h1 { font-size: 20px; font-weight: 800; }
    .header-bar p { font-size: 12px; opacity: 0.85; margin-top: 4px; }
    .messages-list { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
    .att-img { max-width: 320px; max-height: 240px; border-radius: 8px; margin-top: 8px; border: 1px solid #334155; }
    .footer-bar { text-align: center; padding: 14px; font-size: 11px; color: #64748b; border-top: 1px solid #1e293b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-bar">
      <div>
        <h1>🎫 سجل التذكرة: #${escapeHtml(channelName)}</h1>
        <p>السيرفر: ${escapeHtml(guildName)} | عدد الرسائل: ${sortedMessages.length}</p>
      </div>
      <div>
        <span style="background: rgba(0,0,0,0.3); padding: 6px 12px; border-radius: 8px; font-size: 11px;">${generatedAt}</span>
      </div>
    </div>
    <div class="messages-list">
      ${messageRows || '<p style="text-align: center; color: #64748b;">لا توجد رسائل في هذه التذكرة.</p>'}
    </div>
    <div class="footer-bar">
      تم إنشاء هذا السجل تلقائياً بواسطة بوت Droplet • جميع الحقوق محفوظة ©
    </div>
  </div>
</body>
</html>`;

  const buffer = Buffer.from(html, 'utf-8');
  const attachment = new AttachmentBuilder(buffer, { name: `transcript-${channelName}.html` });
  return { html, attachment, buffer };
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = { generateHtmlTranscript };
