const { EmbedBuilder } = require('discord.js');
const db = require('../database');
const { isEnabled } = require('./isEnabled');

// ✅ السجلات المدعومة
const ALLOWED_LOG_EVENTS = new Set([
  // الأعضاء والرتب
  'member_ban', 'member_timeout', 'member_untimeout', 'member_kick', 'member_unban', 'member_join', 'member_leave', 'member_nick_change',
  'member_boost_add', 'member_boost_remove',
  'role_give_member', 'role_remove_member', 'role_create', 'role_update', 'role_delete',

  // الرسائل
  'msg_delete', 'msg_purge', 'msg_update', 'msg_reaction_add', 'msg_reaction_remove', 'msg_reaction_remove_all', 'msg_pin', 'msg_unpin',

  // القنوات والثريدات
  'channel_create', 'channel_update', 'channel_delete', 'thread_create', 'thread_update', 'thread_delete', 'channel_perms_update',

  // السيرفر والدعوات
  'server_update', 'invite_create', 'invite_delete', 'bot_add',

  // الإيموجي والستيكرز
  'emoji_create', 'emoji_update', 'emoji_delete', 'sticker_create', 'sticker_update', 'sticker_delete',

  // الفعاليات المجدولة (Scheduled Events)
  'event_create', 'event_update', 'event_delete', 'event_start', 'event_end', 'event_user_interested',

  // الرومات الصوتية
  'vc_join', 'vc_leave', 'vc_switch', 'vc_disconnect', 'vc_mute_server', 'vc_unmute_server',
  'vc_deafen_server', 'vc_undeafen_server', 'vc_stream_start', 'vc_stream_stop',

  // أوتومود
  'automod_rule_create', 'automod_rule_update', 'automod_rule_delete'
]);

/**
 * Dispatch an audit log event
 * @param {import('discord.js').Guild} guild 
 * @param {string} eventId 
 * @param {string} catKey 
 * @param {object} embedData - { title, desc, fields, color, author, thumbnail, footer }
 */
async function sendServerLog(guild, eventId, catKey, embedData = {}, opts = {}) {
    if (!guild) return;
    if (!ALLOWED_LOG_EVENTS.has(eventId)) return;

    try {
        const settings = db.getGuildSettings(guild.id) || {};
        if (!isEnabled(settings.logs_enabled, false)) return;
        // ✅ بوابات السجلات التفصيلية (الغائب = مطفي)
        if (catKey === 'moderation' && !isEnabled(settings.mod_logs_enabled, false)) return;
        if ((catKey === 'server' || catKey === 'automod') && !isEnabled(settings.security_logs_enabled, false)) return;

        let logsConfig = {};
        try {
            logsConfig = settings.logs_config ? (typeof settings.logs_config === 'string' ? JSON.parse(settings.logs_config) : settings.logs_config) : {};
        } catch(e) { logsConfig = {}; }

        const logCfg = logsConfig[eventId];
        
        // ✅ مطفي افتراضياً — يُرسل فقط عند التفعيل الصريح من الداشبورد (أو opts.force للاختبار)
        let eventOn = false;
        if (logCfg && (logCfg.enabled === true || logCfg.enabled === 1 || logCfg.enabled === '1')) {
            eventOn = true;
        }

        if (!eventOn && !(opts && opts.force)) return;

        // Channel determination priority:
        // 1. Specific event channel
        // 2. Dedicated module channel (automod/antiraid) then category channel (e.g. log_channel_messages)
        // 3. General fallback log_channel
        let targetChannelId = (logCfg && logCfg.channel_id)
            || (catKey === 'automod' ? (settings.automod_log_channel || null) : null)
            || settings['log_channel_' + catKey] || settings.log_channel;
        try { console.log(`[MSGLOG-DBG] sendServerLog event=${eventId} cat=${catKey} guild=${guild.id} target=${targetChannelId || 'NONE'} master=${settings.logs_enabled} cfg=${logCfg ? JSON.stringify(logCfg) : '{}'}`); } catch {}
        if (!targetChannelId) {
            // Find in categorized channels
            const catChannelNameMap = {
                members: '🎯┃سجل-الأعضاء',
                roles: '🎖️┃سجل-الرتب',
                channels: '📌┃سجل-القنوات',
                messages: '💬┃سجل-الرسائل',
                voice: '🎙️┃سجل-الصوتيات',
                moderation: '🛡️┃سجل-الإشراف',
                server: '⚙️┃سجل-السيرفر',
                invites: '🔗┃سجل-الدعوات',
                emojis: '😃┃سجل-الإيموجي',
                events: '📅┃سجل-الفعاليات',
                integrations: '🔌┃سجل-التكاملات',
                automod: '🤖┃سجل-الرقابة',
                stage: '📢┃سجل-المنصة'
            };
            const matchName = catChannelNameMap[catKey];
            if (matchName) {
                const foundCh = guild.channels.cache.find(c => c.name === matchName);
                if (foundCh) targetChannelId = foundCh.id;
            }

            // Fallback: ابحث عن أي روم يحتوي اسمه على 'log' أو 'سجل'
            if (!targetChannelId) {
                const autoLog = guild.channels.cache.find(c => 
                    c.isTextBased() && (c.name.toLowerCase().includes('log') || c.name.includes('سجل') || c.name.includes('لوق'))
                );
                if (autoLog) targetChannelId = autoLog.id;
            }
        }

        if (!targetChannelId) return;

        const targetChannel = guild.channels.cache.get(targetChannelId) || await guild.channels.fetch(targetChannelId).catch(() => null);
        if (!targetChannel || !targetChannel.isTextBased()) return;

        const defaultColors = {
            members: '#5865F2',
            roles: '#9333ea',
            channels: '#3b82f6',
            messages: '#10b981',
            voice: '#ec4899',
            moderation: '#ef4444',
            server: '#f59e0b',
            invites: '#06b6d4',
            emojis: '#8b5cf6',
            events: '#14b8a6',
            integrations: '#6366f1',
            automod: '#f43f5e',
            stage: '#84cc16'
        };

        const finalColor = (logCfg && logCfg.color) || embedData.color || defaultColors[catKey] || '#9333ea';

        const embed = new EmbedBuilder()
            .setColor(finalColor)
            .setTimestamp();

        if (embedData.title) embed.setTitle(embedData.title);
        if (embedData.desc) embed.setDescription(embedData.desc);
        if (embedData.fields && Array.isArray(embedData.fields)) {
            embed.addFields(embedData.fields);
        }
        if (embedData.image) embed.setImage(embedData.image);
        if (embedData.author) embed.setAuthor(embedData.author);
        if (embedData.thumbnail) embed.setThumbnail(embedData.thumbnail);
        if (embedData.footer) {
            embed.setFooter(typeof embedData.footer === 'string' ? { text: embedData.footer } : embedData.footer);
        } else {
            embed.setFooter({ text: `${guild.name} • سجلات السيرفر الفورية`, iconURL: guild.iconURL({ dynamic: true }) });
        }

        const sendOptions = { embeds: [embed] };
        if (embedData.files && Array.isArray(embedData.files) && embedData.files.length > 0) {
            sendOptions.files = embedData.files;
        }

        await targetChannel.send(sendOptions).catch((err) => {
            console.error(`[SERVER LOGS] ❌ Failed to send log [${eventId}] to channel #${targetChannel.name} (${targetChannel.id}):`, err.message);
        });
    } catch(err) {
        console.error('[SERVER LOGS] Error dispatching log event [' + eventId + ']:', err);
    }
}

module.exports = {
    sendServerLog
};
