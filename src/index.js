/**
 * ZENO Dashboard entrypoint.
 *
 * The Discord bot itself runs on Bot-Hosting.net.
 * This process hosts the dashboard on Render and uses a lightweight
 * Discord.js client for dashboard-side guild/member/channel operations.
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const dashboardServer = require('./dashboard/server');

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Render health/port endpoint.
app.get('/health', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'zeno-dashboard',
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
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.GuildMember, Partials.User, Partials.Channel]
});

client.once('ready', () => {
    console.log('[Dashboard Discord] Connected as ' + client.user.tag);
    console.log('[Dashboard Discord] Guilds: ' + client.guilds.cache.size);
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
        console.error('[Dashboard Discord] Missing DASHBOARD_BOT_TOKEN.');
        console.error('[Dashboard Discord] Add the same Discord bot token used by the Bot-Hosting deployment.');
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
    try { client.destroy(); } catch {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

loginDashboardClient().catch(error => {
    console.error('[Dashboard] Discord startup error:', error);
});
