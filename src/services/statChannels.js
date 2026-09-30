/**
 * @module statChannels
 * @description خدمة قنوات الإحصائيات - تحدث قنوات صوتية بإحصائيات السيرفر كل 10 دقائق
 * Stat types: total_members, humans, bots, online, voice, text_channels, voice_channels, total_channels, roles
 */

const database = require('../database');

const STAT_TYPES = {
    // ── الإحصائيات الفردية ──
    total_members:  { label: '👥 إجمالي الأعضاء',    format: (g) => `👥 إجمالي الأعضاء: ${g.memberCount}` },
    humans:         { label: '👤 البشر',               format: (g) => `👤 البشر: ${g.members.cache.filter(m => !m.user.bot).size}` },
    bots:           { label: '🤖 البوتات',             format: (g) => `🤖 البوتات: ${g.members.cache.filter(m => m.user.bot).size}` },
    online:         { label: '🟢 الأعضاء الأونلاين',  format: (g) => `🟢 أونلاين: ${g.members.cache.filter(m => m.presence?.status !== 'offline' && m.presence?.status).size}` },
    voice:          { label: '🎙️ المتصلين صوتياً',   format: (g) => `🎙️ في الصوت: ${g.voiceStates.cache.filter(v => v.channelId).size}` },
    text_channels:  { label: '📝 القنوات النصية',     format: (g) => `📝 قنوات نصية: ${g.channels.cache.filter(c => c.type === 0).size}` },
    voice_channels: { label: '🔊 القنوات الصوتية',    format: (g) => `🔊 قنوات صوتية: ${g.channels.cache.filter(c => c.type === 2).size}` },
    total_channels: { label: '📂 عدد القنوات الكلي',  format: (g) => `📂 جميع القنوات: ${g.channels.cache.size}` },
    roles:          { label: '🏷️ الرتب الكلية',       format: (g) => `🏷️ الرتب: ${g.roles.cache.size}` },
    boosts:         { label: '💎 عدد البوستات',        format: (g) => `💎 البوستات: ${g.premiumSubscriptionCount || 0}` },
    boost_level:    { label: '🚀 مستوى البوست',        format: (g) => `🚀 مستوى البوست: ${g.premiumTier || 0}` },

    // ── الإحصائيات المجمّعة (قناة واحدة لعدة إحصائيات) ──
    combined_boosts:   {
        label: '💎🚀 البوستات ومستواها',
        format: (g) => `💎 ${g.premiumSubscriptionCount || 0} بوست │ 🚀 مستوى ${g.premiumTier || 0}`
    },
    combined_roles_channels: {
        label: '🏷️📂 الرتب والقنوات الكلية',
        format: (g) => `🏷️ ${g.roles.cache.size} رتبة │ 📂 ${g.channels.cache.size} قناة`
    },
    combined_channel_types: {
        label: '📝🔊🎙️ أنواع القنوات والمتصلين',
        format: (g) => `📝 ${g.channels.cache.filter(c => c.type === 0).size} │ 🔊 ${g.channels.cache.filter(c => c.type === 2).size} │ 🎙️ ${g.voiceStates.cache.filter(v => v.channelId).size}`
    },
    combined_members: {
        label: '👥👤🤖🟢 إحصائيات الأعضاء',
        format: (g) => `👥 ${g.memberCount} │ 🟢 ${g.members.cache.filter(m => m.presence?.status && m.presence.status !== 'offline').size} │ 👤 ${g.members.cache.filter(m => !m.user.bot).size} │ 🤖 ${g.members.cache.filter(m => m.user.bot).size}`
    },
};


class StatChannelsService {
    constructor(client) {
        this.client = client;
        this._interval = null;
        this.running = false;
    }

    start() {
        if (this.running) return;
        this.running = true;
        // Run immediately then every 10 minutes
        this._tick().catch(() => {});
        this._interval = setInterval(() => this._tick().catch(() => {}), 10 * 60 * 1000);
        console.log('[StatChannels] ✅ Stat Channels Service started (every 10 minutes)');
    }

    stop() {
        if (this._interval) clearInterval(this._interval);
        this.running = false;
    }

    async _tick() {
        const rawDb = database.db;
        try {
            // Ensure table exists before querying
            rawDb.exec(`CREATE TABLE IF NOT EXISTS stat_channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                stat_type TEXT NOT NULL,
                custom_prefix TEXT DEFAULT '',
                enabled INTEGER DEFAULT 1,
                UNIQUE(guild_id, channel_id)
            )`);

            const rows = rawDb.prepare(
                "SELECT * FROM stat_channels WHERE enabled = 1"
            ).all();

            for (const row of rows) {
                await this._updateChannel(row);
            }
        } catch (e) {
            console.error('[StatChannels] Tick error:', e.message);
        }
    }

    async _updateChannel(row) {
        try {
            const guild = this.client.guilds.cache.get(row.guild_id);
            if (!guild) return;

            // Fetch members to get accurate count
            if (!guild.members.cache.size || guild.members.cache.size < guild.memberCount) {
                await guild.members.fetch().catch(() => {});
            }

            const channel = guild.channels.cache.get(row.channel_id)
                || await guild.channels.fetch(row.channel_id).catch(() => null);
            if (!channel) return;

            const typeDef = STAT_TYPES[row.stat_type];
            if (!typeDef) return;

            const prefix = row.custom_prefix || '';
            let newName;
            try {
                if (prefix) {
                    const rawValue = this._getValue(row.stat_type, guild);
                    if (rawValue !== null && rawValue !== undefined) {
                        newName = `${prefix}: ${rawValue}`;
                    } else {
                        newName = `${prefix} │ ${typeDef.format(guild)}`;
                    }
                } else {
                    newName = typeDef.format(guild);
                }
            } catch (e) {
                newName = typeDef.format(guild);
            }

            // Only update if name changed to avoid rate limits
            if (channel.name !== newName) {
                await channel.setName(newName).catch(() => {});
            }
        } catch (e) {
            // Silently ignore per-channel errors (missing perms, etc.)
        }
    }

    _getValue(statType, guild) {
        switch (statType) {
            case 'total_members':  return guild.memberCount;
            case 'humans':         return guild.members.cache.filter(m => !m.user.bot).size;
            case 'bots':           return guild.members.cache.filter(m => m.user.bot).size;
            case 'online':         return guild.members.cache.filter(m => m.presence?.status && m.presence.status !== 'offline').size;
            case 'voice':          return guild.voiceStates.cache.filter(v => v.channelId).size;
            case 'text_channels':  return guild.channels.cache.filter(c => c.type === 0).size;
            case 'voice_channels': return guild.channels.cache.filter(c => c.type === 2).size;
            case 'total_channels': return guild.channels.cache.size;
            case 'roles':          return guild.roles.cache.size;
            case 'boosts':         return guild.premiumSubscriptionCount || 0;
            case 'boost_level':    return guild.premiumTier || 0;
            default:               return 0;
        }
    }

    // Force update a single guild immediately
    async forceUpdateGuild(guildId) {
        const rawDb = database.db;
        try {
            const rows = rawDb.prepare(
                "SELECT * FROM stat_channels WHERE guild_id = ? AND enabled = 1"
            ).all(guildId);
            for (const row of rows) {
                await this._updateChannel(row);
            }
        } catch (e) {
            console.error('[StatChannels] Force update error:', e.message);
        }
    }
}

module.exports = StatChannelsService;
module.exports.STAT_TYPES = STAT_TYPES;
