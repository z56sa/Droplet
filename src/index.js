/**
 * @module index
 * @description Main entry point for the zeno bot. Manages Discord client initialization, event handlers, and web server setup.
 */

const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const express = require('express');
// Import SecretManager first to enforce security checks immediately upon load
const SecretManager = require('./utils/secretManager');
require('dotenv').config(); // Keep dotenv for local development setup

// --- Google GenAI Integration ---
const { askAI } = require('./utils/ai');
const { SecurityGuardian } = require('./services/securityGuardian');
// -----------------------------

const app = express();
const config = require('./config.json');
app.set('trust proxy', 1);

// =============================================================================
// Discord Client Initialization and Security Check
// =============================================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

// Intercept client.on and client.once globally so any library or handler using 'ready' is converted to 'clientReady'
const originalClientOn = Client.prototype.on;
const originalClientOnce = Client.prototype.once;
Client.prototype.on = function (event, ...args) {
    const ev = event === 'ready' ? 'clientReady' : event;
    return originalClientOn.call(this, ev, ...args);
};
Client.prototype.once = function (event, ...args) {
    const ev = event === 'ready' ? 'clientReady' : event;
    return originalClientOnce.call(this, ev, ...args);
};

client.commands = new Collection();
client.prefixCommands = new Collection();
client.aliases = new Collection();

// Centralized AI + security guardian. It never writes source code automatically.
const securityGuardian = new SecurityGuardian(client);
client.securityGuardian = securityGuardian;

process.on('unhandledRejection', (reason) => {
    securityGuardian.report(null, 'Unhandled promise rejection', String(reason?.stack || reason), 'critical').catch(() => {});
});

process.on('uncaughtException', (error) => {
    securityGuardian.report(null, 'Uncaught exception', error?.stack || String(error), 'critical').catch(() => {});
    setTimeout(() => process.exit(1), 1500).unref?.();
});

client.on('error', (error) => {
    securityGuardian.report(null, 'Discord client error', error?.stack || String(error), 'warning').catch(() => {});
});

// Intercept interaction responses globally to guarantee no library or handler triggers the ephemeral deprecation warning
const { BaseInteraction, MessageFlags } = require('discord.js');
const patchInteractionMethod = (proto, methodName) => {
    const original = proto[methodName];
    if (!original) return;
    proto[methodName] = function (options, ...rest) {
        if (options && typeof options === 'object') {
            if ('ephemeral' in options) {
                if (options.ephemeral) {
                    options.flags = (options.flags || 0) | (MessageFlags?.Ephemeral || 64);
                }
                delete options.ephemeral;
            }
            if ('fetchReply' in options) {
                options.withResponse = options.fetchReply;
                delete options.fetchReply;
            }
        }
        return original.call(this, options, ...rest);
    };
};

try {
    const CommandInteraction = require('discord.js').CommandInteraction?.prototype;
    const MessageComponentInteraction = require('discord.js').MessageComponentInteraction?.prototype;
    const ModalSubmitInteraction = require('discord.js').ModalSubmitInteraction?.prototype;
    const BaseInteractionProto = BaseInteraction?.prototype;

    [CommandInteraction, MessageComponentInteraction, ModalSubmitInteraction, BaseInteractionProto].forEach(proto => {
        if (!proto) return;
        ['reply', 'deferReply', 'followUp'].forEach(m => patchInteractionMethod(proto, m));
    });
} catch (e) { }


// =============================================================================
// Initialization Sequence (The Core Logic)
// =============================================================

(async () => {
    console.log('[INFO] 🚀 Starting Bot Initialization Sequence...');

    try {
        // --- 1. Security Check (Mandatory Step): Validate token and essential variables ---
        const botToken = process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.TOKEN;
        if (!botToken) {
            throw new Error('Critical secret missing: DISCORD_BOT_TOKEN (or BOT_TOKEN / DISCORD_TOKEN / TOKEN). Please configure it in your Railway/Cloud Dashboard Variables.');
        }
        console.log('[SECURITY] ✅ Discord Token found and verified.');

        // --- 2. Loading Handlers (Must run only after security check passes) ---
        const commandHandler = require('./handlers/commandHandler');
        const eventHandler = require('./handlers/eventHandler');
        await commandHandler(client);
        eventHandler(client);
        console.log('[INFO] ✅ Successfully loaded commands and event handlers.');
        securityGuardian.startHealthMonitor();

    } catch (err) {
        console.error('[CRITICAL FAILURE] 🛑 Initialization failed due to missing or invalid configuration:', err.message);
        process.exit(1);
    }
})();


// =============================================================================
// Login and Connection (Uses SecretManager or Direct Env)
// =============================================================

function getBotToken() {
    return process.env.DISCORD_BOT_TOKEN ||
        process.env.BOT_TOKEN ||
        process.env.DISCORD_TOKEN ||
        process.env.TOKEN ||
        SecretManager.getSecret('DISCORD_BOT_TOKEN');
}

const token = getBotToken();

if (!token) {
    console.error('[ERROR] ❌ Failed to retrieve Bot Token. The bot cannot connect.');
} else {
    client.login(token).catch((err) => {
        console.error('[ERROR] ⚠️ Could not log in to Discord:', err.message);
    });
}


// =============================================================================
// Dashboard + Web Server Setup (Web Interface Layer)
// =============================================================================

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

const mountDashboard = require('./dashboard/server');
mountDashboard(app, client);

// Stat Channels Service
const StatChannelsService = require('./services/statChannels');
const statChannelsService = new StatChannelsService(client);

// Staff Shift Service
const StaffShiftService = require('./services/staffShiftService');
const staffShiftService = new StaffShiftService(client);

// Giveaway Auto-End Service
const GiveawayService = require('./services/giveawayService');
const giveawayService = new GiveawayService(client);

client.once('clientReady', () => {
    statChannelsService.start();
    staffShiftService.start();
    giveawayService.start();
});

// API Route for Stats
app.get('/api/stats', (req, res) => {
    res.json({
        status: client.isReady() ? 'online' : 'offline',
        ping: client.ws?.ping || 0,
        guilds: client.guilds?.cache?.size || 0,
        uptime: client.uptime || 0,
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[INFO] 🚀 Web server running on port ${PORT}`);

    const pingUrl = process.env.RENDER_EXTERNAL_URL
        ? `${process.env.RENDER_EXTERNAL_URL}/api/stats`
        : `${config.dashboardUrl || 'http://localhost:' + PORT}/api/stats`;

    setInterval(async () => {
        try {
            const res = await fetch(pingUrl);
            if (res.ok) {
                console.log(`[Self-Ping] 💓 Keep-alive ping sent to ${pingUrl} (Status: ${res.status})`);
            }
        } catch (err) {
            console.error('[Self-Ping] ⚠️ Failed to ping self:', err.message);
        }
    }, 10 * 60 * 1000);
});

module.exports = { client, statChannelsService, askAI };