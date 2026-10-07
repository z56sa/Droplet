const { EmbedBuilder } = require('discord.js');
const db = require('../database');

/**
 * Dispatch an audit log event
 * @param {import('discord.js').Guild} guild 
 * @param {string} eventId 
 * @param {string} catKey 
 * @param {object} embedData - { title, desc, fields, color, author, thumbnail, footer }
 */
async function sendServerLog(guild, eventId, catKey, embedData = {}) {
    if (!guild) return;

    try {
        const settings = db.getGuildSettings(guild.id) || {};
        if (settings.logs_enabled === 0) return;

        let logsConfig = {};
        try {
            logsConfig = settings.logs_config ? (typeof settings.logs_config === 'string' ? JSON.parse(settings.logs_config) : settings.logs_config) : {};
        } catch(e) { logsConfig = {}; }

        const logCfg = logsConfig[eventId];
        
        // Logs are enabled by default UNLESS explicitly disabled (enabled === false or 0)
        let isEnabled = true;
        if (logCfg && (logCfg.enabled === false || logCfg.enabled === 0 || logCfg.enabled === '0')) {
            isEnabled = false;
        }

        if (!isEnabled) return;

        // Channel determination priority: 
        // 1. Specific event channel
        // 2. Specific category channel (e.g. log_channel_messages)
        // 3. General fallback log_channel
        let targetChannelId = (logCfg && logCfg.channel_id) || settings['log_channel_' + catKey] || settings.log_channel;
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
        if (embedData.author) embed.setAuthor(embedData.author);
        if (embedData.thumbnail) embed.setThumbnail(embedData.thumbnail);
        if (embedData.footer) {
            embed.setFooter(typeof embedData.footer === 'string' ? { text: embedData.footer } : embedData.footer);
        } else {
            embed.setFooter({ text: 'Droplet Logs • سجلات السيرفر' });
        }

        await targetChannel.send({ embeds: [embed] }).catch((err) => {
            console.error(`[SERVER LOGS] ❌ Failed to send log [${eventId}] to channel #${targetChannel.name} (${targetChannel.id}):`, err.message);
        });
    } catch(err) {
        console.error('[SERVER LOGS] Error dispatching log event [' + eventId + ']:', err);
    }
}

module.exports = {
    sendServerLog
};
