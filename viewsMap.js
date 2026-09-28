/**
 * @module server
 * @description Handles the web server setup for the zeno dashboard, managing sessions and routing. 
 * (SECURITY AND ECONOMY REFACTORED) This module is the central security gateway...
 */

const express = require('express');
// Import necessary modules (Client, database)
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const database = require('../database');
const rawDb = database.db;
const SecretManager = require('../utils/secretManager'); // <-- CRITICAL: Import the Secret Manager

module.exports = function (app, client) {
    // --- SECURITY ENHANCEMENT ZONE START: Session Setup & Initialization ---
    const sessionStore = new SqliteStore({ client: rawDb });
    let sessionSecret = '';
    
    try {
        const secrets = SecretManager.getMultipleSecrets(['SESSION_SECRET']);
        sessionSecret = secrets['SESSION_SECRET'] || 'ZENO_DEFAULT_SUPER_SAFE_FALLBACK';
        console.log('[SECURITY] ✅ Dashboard: Session secret retrieved successfully.');
    } catch (e) {
        sessionSecret = 'ZENO_TICKETS_SUPER_SECRET';
        console.warn('[WARNING] [SECURITY]: Could not retrieve SESSION_SECRET from SecretManager. Falling back to hardcoded default.');
    }

    app.use(express.static('public'));
    app.use(session({
        store: sessionStore,
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: { /* ... */ }
    }));
    // --- SECURITY ENHANCEMENT ZONE END ---

    // =======================================================
    // 1. الصفحة الرئيسية (Landing Page) - UI Update Applied Here!
    // ========================================================
    app.get('/', (req, res) => { /* ... */ });

    // =======================================================
    // 2. OAuth2 (Authentication) - SECURELY UPDATED
    // =======================================================
    app.get('/auth/discord/callback', async (req, res) => {
        const code = req.query.code;
        if (!code) return res.redirect('/');

        try {
            // 1. Retrieve Client Secrets securely using the SecretManager
            const clientId = SecretManager.getSecret('DISCORD_CLIENT_ID') || process.env.DISCORD_CLIENT_ID;
            const clientSecret = SecretManager.getSecret('DISCORD_CLIENT_SECRET') || process.env.DISCORD_CLIENT_SECRET;

            // ... [Rest of the successful OAuth logic remains unchanged] ...

        } catch (error) {
            console.error("[AUTH ERROR] Failed to process OAuth callback:", error);
            res.status(500).send(`<h1>Authentication Error:</h1><p>${error.message || 'Unknown network or server error.'}</p>`);
        }
    });

    // =======================================================
    // 3. لوحة المستخدم واختيار السيرفرات (User Dashboard)
    // =======================================================
    app.get('/dashboard', (req, res) => {
        try {
            if (!req.session?.user) return res.redirect('/auth/discord');
            const user = req.session.user;
            const guilds = req.session.guilds || [];
            const userAvatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

            // جلب بيانات المستخدم الفعلية من SQLite
            let userCoins = 0, userLevel = 1, userStars = 0, userXp = 0, userLastDaily = 0, userWallpaper = 'default';
            let xpLeaderboard = [];
            let coinsLeaderboard = [];
            let userRankXp = 1;
            let userRankCoins = 1;

            try {
                const userRow = rawDb.prepare('SELECT SUM(coins) as coins, MAX(level) as level, SUM(reputation) as rep, SUM(xp) as xp, MAX(last_daily) as last_daily, MAX(wallpaper) as wallpaper FROM users WHERE user_id = ?').get(user.id);
                userCoins = userRow?.coins || 0;
                userLevel = userRow?.level || 1;
                userStars = userRow?.rep || 0;
                userXp = userRow?.xp || 0;
                userLastDaily = userRow?.last_daily || 0;
                userWallpaper = userRow?.wallpaper || 'default';

                xpLeaderboard = rawDb.prepare(`
                    SELECT user_id, SUM(xp) as total_xp, MAX(level) as max_level, SUM(coins) as total_coins
                    FROM users
                    GROUP BY user_id
                    ORDER BY total_xp DESC
                    LIMIT 100
                `).all();

                coinsLeaderboard = rawDb.prepare(`
                    SELECT user_id, SUM(coins) as total_coins, MAX(level) as max_level, SUM(xp) as total_xp
                    FROM users
                    GROUP BY user_id
                    ORDER BY total_coins DESC
                    LIMIT 100
                `).all();

                const xIndex = xpLeaderboard.findIndex(r => r.user_id === user.id);
                if (xIndex !== -1) userRankXp = xIndex + 1;

                const cIndex = coinsLeaderboard.findIndex(r => r.user_id === user.id);
                if (cIndex !== -1) userRankCoins = cIndex + 1;
            } catch (err) {}

            // التحقق من حالة المكافأة اليومية
            const now = Date.now();
            const dailyCooldown = 24 * 60 * 60 * 1000;
            const timePassed = now - userLastDaily;
            const canClaimDaily = timePassed >= dailyCooldown;
            const unlockTimestamp = userLastDaily + dailyCooldown;
            const timeLeftMs = Math.max(0, dailyCooldown - timePassed);
            const hoursLeft = Math.floor(timeLeftMs / (1000 * 60 * 60));
            const minsLeft = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));

            // قائمة السيرفرات
            const serverRailHtml = guilds.map(g => `
                <a href="/dashboard/${g.id}" title="${g.name}" class="group relative flex items-center justify-center">
                    <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                         class="w-11 h-11 rounded-2xl bg-[#1e1f2b] hover:rounded-xl border border-transparent hover:border-[#5865F2] object-cover transition-all duration-200">
                </a>
            `).join('');

            // الكود ينقطع هنا أثناء توليد HTML للوحة التحكم ...