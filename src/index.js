/**
 * Droplet Bot + Dashboard entrypoint.
 *
 * Both the Discord bot (commands/events) and the web dashboard
 * run on Render as a single Node.js web service.
 *
 * - Web service: hosts the dashboard at /dashboard/*
 * - Discord client: handles all bot commands and events
 * - Turso: persists user data across Render restarts
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const dashboardServer = require('./dashboard/server');

const app = express();

// Render terminates HTTPS at its proxy and forwards the request to this process.
// Trust the first proxy so express-session can correctly set secure cookies.
app.set('trust proxy', 1);

const PORT = Number(process.env.PORT || 3000);

// Render health/port endpoint.
app.get('/health', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'droplet-dashboard',
        discord: client.isReady() ? 'ready' : 'connecting'
    });
});

// The dashboard code reads req.cookies without requiring cookie-parser.
// Keep this tiny parser local so we don't add another dependency.
app.use((req, _res, next) => {
    const raw = req.headers.cookie || '';
    req.cookies = {};
    for (const part of raw.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (key) {
            try {
                req.cookies[key] = decodeURIComponent(value);
            } catch {
                req.cookies[key] = value;
            }
        }
    }
    next();
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '1mb' }));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ],
    partials: [
        Partials.GuildMember,
        Partials.User,
        Partials.Channel,
        Partials.Message,
        Partials.Reaction
    ]
});

const aiAutoHealer = require('./services/aiAutoHealer');
const commandHandler = require('./handlers/commandHandler');
const eventHandler = require('./handlers/eventHandler');

// Initialize AI Auto-Healer immediately (hooks process errors before client is ready)
aiAutoHealer.init(null);

// Load commandHandler & eventHandler
(async () => {
    try {
        await commandHandler(client);
        eventHandler(client);
        console.log('[Discord] Commands & Events loaded successfully ✅');
    } catch(err) {
        console.error('[Discord] Failed to load handlers:', err);
    }
})();

client.once('ready', async () => {
    console.log('[Dashboard Discord] Connected as ' + client.user.tag);
    console.log('[Dashboard Discord] Guilds: ' + client.guilds.cache.size);

    // Attach Discord client to Auto-Healer so it can send owner DMs
    aiAutoHealer.init(client);

    // ✅ بدء مسّاح العقوبات التلقائي (auto_clear)
    try { require('./utils/autoClear').ensureAutoClear(); } catch (e) {}
    // ✅ بدء خدمة شفتات الإدارة (انتهاء الشفتات/السجن/الكتم/الرتب المؤقتة والترقيات)
    try {
      const StaffShiftService = require('./services/staffShiftService');
      if (!global._staffShiftSvc) {
        global._staffShiftSvc = new StaffShiftService(client);
        global._staffShiftSvc.start();
      }
    } catch (e) { console.error('[StaffShiftService] start failed:', e.message); }

    // Register slash commands to Discord globally
    if (client.registerSlashCommands) {
        client.registerSlashCommands().catch(err => {
            console.error('[Dashboard Discord] Error registering slash commands:', err);
        });
    }

    // استعادة صورة البوت الأصلية من App Icon في Developer Portal
    try {
        const appInfo = await client.rest.get('/applications/@me');
        if (appInfo?.icon && appInfo?.id) {
            const iconUrl = `https://cdn.discordapp.com/app-icons/${appInfo.id}/${appInfo.icon}.png?size=512`;
            const imgRes = await fetch(iconUrl);
            const buf = await imgRes.arrayBuffer();
            const b64 = Buffer.from(buf).toString('base64');
            await client.user.setAvatar(`data:image/png;base64,${b64}`);
            console.log('[Dashboard Discord] Bot avatar restored to App Icon ✅');
        }
    } catch(e) {
        console.error('[Dashboard Discord] Avatar restore skipped:', e.message);
    }
});

client.on('error', (error) => {
    console.error('[Dashboard Discord] Client error:', error);
});

// Register the complete existing dashboard routes.
dashboardServer(app, client);

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('[Dashboard] Listening on 0.0.0.0:' + PORT);
});

async function loginDashboardClient() {
    const token = process.env.DASHBOARD_BOT_TOKEN || process.env.BOT_TOKEN;

    if (!token) {
        console.error('[Discord] Missing BOT_TOKEN / DASHBOARD_BOT_TOKEN.');
        console.error('[Discord] Set BOT_TOKEN in your Render environment variables.');
        return;
    }


    let delay = 60000;

    while (!client.isReady()) {
        try {
            await client.login(token);
            return;
        } catch (error) {
            const status = error?.status || error?.code;
            const retryAfter = Number(error?.retryAfter || 0);
            const waitMs = Math.max(
                retryAfter * 1000,
                status === 429 ? 60000 : 15000
            );

            console.error('[Dashboard Discord] Login failed:', error?.message || error);
            console.error('[Dashboard Discord] Retrying in ' + Math.ceil(waitMs / 1000) + 's.');

            try {
                client.destroy();
            } catch {}

            await new Promise(resolve => setTimeout(resolve, waitMs));
            delay = Math.min(delay * 2, 15 * 60 * 1000);
        }
    }
}

async function shutdown(signal) {
    console.log('[Dashboard] ' + signal + ' received. Shutting down...');
    try {
        const tursoSync = require('./database/tursoSync');
        await Promise.race([
            tursoSync.flush(8000),
            new Promise(r => setTimeout(r, 9000))
        ]);
    } catch {}
    try { client.destroy(); } catch {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

loginDashboardClient().catch(error => {
    console.error('[Dashboard] Discord startup error:', error);
});
