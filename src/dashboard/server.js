/**
 * @module server
 * @description Handles the web server setup for the droplet dashboard, managing sessions and routing.
 */

const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const database = require('../database');
const rawDb = database.db;
const SecretManager = require('../utils/secretManager');
const identityWallpapers = require('../data/identityWallpapers.json');
const config = require('../../config.json');
const { askAI } = require('../utils/ai');

// Language detection helper
function getReqCookies(req) {
    try {
        if (req.cookies && typeof req.cookies === 'object' && Object.keys(req.cookies).length) return req.cookies;
        const header = req.headers && req.headers.cookie;
        if (!header) return {};
        const out = {};
        String(header).split(';').forEach(p => {
            const i = p.indexOf('=');
            if (i > -1) {
                try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }
                catch (e) { out[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }
            }
        });
        return out;
    } catch (e) { return {}; }
}
function detectLanguage(req) {
    const cookieLang = getReqCookies(req).droplet_dashboard_lang;
    if (cookieLang === 'ar' || cookieLang === 'en') return cookieLang;
    const acceptLang = req.headers['accept-language'] || '';
    return acceptLang.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}
// Date/number locale for server-rendered dashboard strings (Latin digits in EN mode)
function dashDateLocale(req, arLocale) {
    try {
        return getReqCookies(req).droplet_dashboard_lang === 'en' ? 'en-US' : arLocale;
    } catch (e) { return arLocale; }
}

const { requireAuth, createGuildAuthMiddleware } = require('./middleware/auth');
const { apiLimiter, sensitiveActionLimiter, aiLimiter } = require('./middleware/rateLimiter');
const { errorHandler } = require('./middleware/errorHandler');
const {
    validate,
    settingsSchema,
    whitelistSchema,
    autoresponderSchema,
    warnPunishmentSchema,
    levelRewardSchema,
    sendEmbedSchema,
    giveawaySchema,
    suggestionSchema,
    staffPointsSchema,
    inviteBonusSchema,
    aiChatSchema
} = require('./validators/apiSchemas');

module.exports = function (app, client) {
    const sessionStore = new SqliteStore({ client: rawDb });
    let sessionSecret = '';
    try {
        const secrets = SecretManager.getMultipleSecrets(['SESSION_SECRET']);
        sessionSecret = secrets['SESSION_SECRET'] || 'Droplet_DEFAULT_SUPER_SAFE_FALLBACK';
        console.log('[SECURITY] ✅ Dashboard: Session secret retrieved successfully.');
    } catch (e) {
        sessionSecret = 'Droplet_TICKETS_SUPER_SECRET';
    }

    const requireGuildPermission = createGuildAuthMiddleware(client);

    app.use(express.static(require('path').join(__dirname, 'public'), { index: false }));
    // Never cache dashboard HTML in browsers (stale titles/content after deploys)
    app.use('/dashboard', function(req, res, next) {
        res.set('Cache-Control', 'no-store, must-revalidate');
        next();
    });
    app.use(session({
        store: sessionStore,
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        rolling: true, // Renews cookie and session expiration on active requests
        cookie: {
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        }
    }));

    // Apply API rate limiter to all API endpoints
    app.use('/api/', apiLimiter);

    // Helper: Discord OAuth2 config
    const getOAuthConfig = (req) => {
        const clientId = process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID || client?.user?.id || config.clientId;
        const clientSecret = process.env.CLIENT_SECRET || process.env.DISCORD_CLIENT_SECRET || 'MNeCz9uTvXRzXeEUp8lUckSQeviU-cRY';
        const baseUrl = process.env.DASHBOARD_URL || config.dashboardUrl || `${req.protocol}://${req.get('host')}`;
        const redirectUri = `${baseUrl}/auth/discord/callback`;
        return { clientId, clientSecret, redirectUri };
    };

    // 1. الصفحة الرئيسية وشاشة البداية (ProBot Black & Purple Landing Page)
    app.get(['/', '/dashboard'], (req, res) => {
        return res.sendFile(require('path').join(__dirname, 'public', 'index.html'));
    });

    // 1.1 Real Bot Info API - used by landing page stats
    app.get('/api/bot-info', async (req, res) => {
        try {
            const botUser = client?.user;
            const guildsCount = client?.guilds?.cache?.size || 0;
            const ping = client?.ws?.ping || 0;

            // حساب إجمالي الأعضاء من كل السيرفرات
            let totalMembers = 0;
            if (client?.guilds?.cache) {
                client.guilds.cache.forEach(guild => {
                    totalMembers += guild.memberCount || 0;
                });
            }

            res.json({
                id: botUser?.id || config.clientId,
                username: botUser?.username || config.botName || 'Droplet',
                avatar: botUser
                    ? (botUser.avatar ? `https://cdn.discordapp.com/avatars/${botUser.id}/${botUser.avatar}.png?size=128` : `https://cdn.discordapp.com/embed/avatars/${parseInt(botUser.discriminator || '0') % 5}.png`)
                    : null,
                guildsCount,
                ping: Math.max(0, ping),
                usersCount: totalMembers
            });
        } catch (err) {
            res.json({ id: config.clientId, guildsCount: 0, ping: 0, usersCount: 0 });
        }
    });

    // ==========================================
    // 🌐 Interactive Web Transcript Viewer
    // ==========================================
    app.get('/transcript/:channelId', async (req, res) => {
        const { channelId } = req.params;
        const transcript = database.getTranscript ? database.getTranscript(channelId) : null;
        if (!transcript || !transcript.html_content) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html lang="ar" dir="rtl">
                <head>
                    <meta charset="UTF-8">
                    <title>السجل غير موجود | Droplet</title>
                    <style>
                        body { background: #0b1526; color: #dbeafe; font-family: 'Segoe UI', Tahoma, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                        body.light-mode { background: #f1f5f9 !important; color: #0f172a !important; }
                        body.light-mode .card { background: #ffffff !important; border-color: #e5e7eb !important; }
                        body.light-mode p { color: #475569 !important; }
                        .card { background: #122036; padding: 40px; border-radius: 16px; border: 1px solid #23405f; text-align: center; max-width: 450px; }
                        h1 { color: #ef4444; font-size: 24px; margin-bottom: 12px; }
                        p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
                    input:focus, select:focus, textarea:focus { outline: none; }
                    /* Droplet blended headings */ h1[class*="text-white"]:not([style]), h2[class*="text-white"]:not([style]) { background:linear-gradient(90deg,#c084fc,#60a5fa); -webkit-background-clip:text; background-clip:text; color:transparent !important; }</style>
                </head>
                <body>
                    <div class="card">
                        <h1>⚠️ السجل غير متوفر</h1>
                        <p>عذراً، لم يتم العثور على سجل تفاعلي لهذه التذكرة أو أنه قد تم حذفه.</p>
                        <a href="/dashboard">العودة للوحة التحكم ←</a>
                    </div>
                </body>
                </html>
            `);
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(transcript.html_content);
    });


    // ─── Shop Settings API ───
    app.post('/api/shop/settings', express.json(), async (req, res) => {
        const { guildId, shopItems, shopChannelId } = req.body;
        if (!guildId) return res.status(400).json({ success: false, message: 'بيانات غير مكتملة' });
        try {
            if (shopItems) database.updateGuildSetting(guildId, 'shop_items', JSON.stringify(shopItems));
            if (shopChannelId) database.updateGuildSetting(guildId, 'shop_channel_id', shopChannelId);
            return res.json({ success: true });
        } catch(e) {
            return res.status(500).json({ success: false, message: e.message });
        }
    });

    // ─── Shop Send Embed API ───
    app.post('/api/shop/send-embed', express.json(), async (req, res) => {
        const { guildId, channelId } = req.body;
        if (!guildId || !channelId) return res.status(400).json({ success: false, message: 'بيانات غير مكتملة' });
        try {
            const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) return res.status(404).json({ success: false, message: 'السيرفر غير موجود' });
            const channel = guild.channels.cache.get(channelId);
            if (!channel) return res.status(404).json({ success: false, message: 'القناة غير موجودة' });

            const settings = database.getGuildSettings(guildId);
            let shopSettings = { customRole: { enabled: true, price: 500, duration: 30 }, textRoom: { enabled: true, price: 600, duration: 30 }, badge: { enabled: false, price: 200, duration: 0 } };
            try { if (settings.shop_items) shopSettings = JSON.parse(settings.shop_items); } catch(e) {}

            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const embed = new EmbedBuilder()
                .setTitle('🏪 متجر السيرفر الرسمي | SERVER SHOP')
                .setColor(0x7c3aed)
                .setDescription('✨ **مرحباً بكم في متجر السيرفر الحصري!**\nيمكنك شراء رتب خاصة وقنوات صوتية وكتابية مخصصة باستخدام عملة **الذهب (Gold 🪙)** التي تجمعها من التفاعل والأوامر والداشبورد.\n\n👇 **اضغط على الأزرار بالأسفل لتصفح العناصر أو معرفة رصيدك الحالي:**')
                .setFooter({ text: `${guild.name} • مدعوم بنظام الاقتصاد السحابي Droplet`, iconURL: guild.iconURL() })
                .setTimestamp();

            const items = [];
            if (shopSettings.customRole?.enabled !== false) items.push(`👑 **رتبة مخصصة (Custom Role)**\n┗ السعر: **${(shopSettings.customRole?.price || 500).toLocaleString()}** Gold 🪙 • المدة: **${shopSettings.customRole?.duration || 30}** يوم`);
            if (shopSettings.badge?.enabled) items.push(`🎖️ **شارة / لقب مخصص (Badge)**\n┗ السعر: **${(shopSettings.badge?.price || 200).toLocaleString()}** Gold 🪙 • المدة: ${shopSettings.badge?.duration > 0 ? `**${shopSettings.badge.duration}** يوم` : '**دائم**'}`);

            embed.addFields({ name: '🛍️ الباقات والعناصر المتاحة للشراء فوراً', value: items.length ? items.join('\n\n') : 'لا توجد عناصر متاحة حالياً', inline: false });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('shop_view').setLabel('🛒 تصفح وشراء العناصر').setStyle(ButtonStyle.Primary).setEmoji('🛍️'),
                new ButtonBuilder().setCustomId('shop_balance').setLabel('🪙 رصيد محفظتي').setStyle(ButtonStyle.Success).setEmoji('💰')
            );

            await channel.send({ embeds: [embed], components: [row] });
            database.updateGuildSetting(guildId, 'shop_channel_id', channelId);
            return res.json({ success: true });
        } catch(e) {
            console.error('[Shop Embed]', e);
            return res.status(500).json({ success: false, message: e.message });
        }
    });

    // ─── Staff Auto-Promotion Ranks API ───
    app.post('/api/staff/ranks', express.json(), (req, res) => {
        const { guildId, roleId, points, name } = req.body;
        if (!guildId || !roleId || !points) {
            return res.status(400).json({ success: false, message: 'بيانات غير مكتملة' });
        }
        database.setStaffRank(guildId, roleId, points, name || null);
        return res.json({ success: true });
    });

    app.post('/api/staff/ranks/delete', express.json(), (req, res) => {
        const { guildId, roleId } = req.body;
        if (!guildId || !roleId) {
            return res.status(400).json({ success: false, message: 'بيانات غير مكتملة' });
        }
        database.removeStaffRank(guildId, roleId);
        return res.json({ success: true });
    });

    // ─── Dashboard Custom Roles API ───
    app.post('/api/custom-roles/create', express.json(), async (req, res) => {
        const { guildId, userId, roleName, roleColor, days } = req.body;
        if (!guildId || !userId || !roleName) {
            return res.status(400).json({ success: false, message: 'بيانات غير مكتملة' });
        }
        try {
            const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) return res.status(404).json({ success: false, message: 'السيرفر غير موجود' });

            const createdRole = await guild.roles.create({
                name: roleName,
                color: roleColor || '#60a5fa',
                reason: `إنشاء رتبة مخصصة من الداشبورد بواسطة الإدارة`
            });

            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) await member.roles.add(createdRole).catch(() => {});

            const expiresAt = Math.floor(Date.now() / 1000) + ((days || 30) * 24 * 3600);
            database.addCustomRole(guildId, userId, createdRole.id, roleName, roleColor, null, expiresAt);

            return res.json({ success: true, roleId: createdRole.id });
        } catch(err) {
            return res.status(500).json({ success: false, message: err.message });
        }
    });

    // 2. Real Discord OAuth2 Authentication Routes
    app.get('/auth/discord', (req, res) => {
        const { clientId, redirectUri } = getOAuthConfig(req);
        const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=identify+guilds`;
        res.redirect(discordAuthUrl);
    });

    app.get('/auth/discord/callback', async (req, res) => {
        const code = req.query.code;
        if (!code) {
            return res.redirect('/auth/discord');
        }

        const { clientId, clientSecret, redirectUri } = getOAuthConfig(req);
        if (!clientSecret) {
            console.error('[OAUTH ERROR] CLIENT_SECRET is missing from environment variables!');
            return res.status(500).send('خطأ في إعدادات البوت: CLIENT_SECRET غير مضاف في لوحة Render.');
        }

        try {
            // Exchange code for Access Token
            const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
            const tokenParams = new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri
            });

            const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${basicAuth}`
                },
                body: tokenParams.toString()
            });

            if (!tokenRes.ok) {
                const errText = await tokenRes.text();
                console.error('[OAUTH ERROR] Token exchange failed:', errText);
                return res.status(400).send(`
                    <div style="background:#070d1d;color:#ffffff;font-family:sans-serif;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px;">
                        <h2 style="color:#ef4444;">تعذر إكمال تسجيل الدخول عبر Discord</h2>
                        <p style="color:#aaa;max-width:500px;margin-top:10px;">رسالة الخطأ من Discord: <code>${errText}</code></p>
                        <p style="color:#888;font-size:13px;margin-top:5px;">تأكد من صحة Client Secret في إعدادات البوت.</p>
                        <a href="/" style="color:#93c5fd;margin-top:20px;text-decoration:none;font-weight:bold;">العودة للصفحة الرئيسية</a>
                    </div>
                `);
            }

            const tokenData = await tokenRes.json();
            const accessToken = tokenData.access_token;

            // Fetch user profile from Discord
            const userRes = await fetch('https://discord.com/api/v10/users/@me', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (!userRes.ok) throw new Error('فشل جلب بيانات المستخدم من Discord');
            const userData = await userRes.json();

            // Fetch user guilds from Discord
            const guildsRes = await fetch('https://discord.com/api/v10/users/@me/guilds', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (!guildsRes.ok) throw new Error('فشل جلب سيرفرات المستخدم من Discord');
            const rawGuilds = await guildsRes.json();

            // Filter guilds: User must be Owner OR have MANAGE_GUILD (0x20) or ADMINISTRATOR (0x8)
            // AND Bot must be currently present in this guild
            const ADMIN_OR_MANAGE = 0x8 | 0x20;
            const manageableGuilds = [];

            if (Array.isArray(rawGuilds)) {
                for (const g of rawGuilds) {
                    const isOwner = !!g.owner;
                    const perms = BigInt(g.permissions || '0');
                    const hasPerm = (perms & BigInt(0x8)) !== 0n || (perms & BigInt(0x20)) !== 0n;

                    if (isOwner || hasPerm) {
                        // Check if bot is present in this guild
                        const botGuild = client?.guilds?.cache?.get(g.id);
                        if (botGuild) {
                            manageableGuilds.push({
                                id: g.id,
                                name: g.name,
                                icon: g.icon,
                                memberCount: botGuild.memberCount || 0,
                                permissions: Number(perms & 0xffn) || 8,
                                isOwner: isOwner
                            });
                        }
                    }
                }
            }

            // Save to user session including OAuth token lifecycle
            req.session.user = {
                id: userData.id,
                username: userData.global_name || userData.username,
                discriminator: userData.discriminator,
                avatar: userData.avatar
            };
            req.session.token = {
                accessToken: accessToken,
                refreshToken: tokenData.refresh_token || null,
                tokenType: tokenData.token_type || 'Bearer',
                scope: tokenData.scope || '',
                expiresAt: tokenData.expires_in ? Date.now() + (tokenData.expires_in * 1000) : null
            };
            req.session.guilds = manageableGuilds;
            req.session.lastActive = Date.now();

            // حفظ بيانات المستخدم المسجل في كاش وقاعدة بيانات Turso
            if (database.trackUserProfile) {
                database.trackUserProfile({
                    userId: userData.id,
                    username: userData.username,
                    displayName: userData.global_name || userData.username,
                    avatar: userData.avatar,
                    avatarUrl: userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'
                });
            }

            // Redirect directly to dashboard
            res.redirect('/dashboard/manage');
        } catch (err) {
            console.error('[OAUTH ERROR] OAuth callback error:', err);
            res.status(500).send('حدث خطأ أثناء تسجيل الدخول: ' + err.message);
        }
    });

    app.get('/logout', (req, res) => {
        if (req.session) {
            req.session.destroy(err => {
                if (err) console.error('[AUTH LOGOUT ERROR]', err);
                res.clearCookie('connect.sid');
                return res.redirect('/');
            });
        } else {
            return res.redirect('/');
        }
    });

    // Bot Info API for public landing pages
    app.get('/api/bot-info', (req, res) => {
        const avatarUrl = client?.user?.avatar 
            ? `https://cdn.discordapp.com/avatars/${client.user.id}/${client.user.avatar}.png` 
            : 'https://cdn.discordapp.com/embed/avatars/0.png';

        // إحصائيات حقيقية وديناميكية 100% بناءً على السيرفرات المتواجد فيها البوت فعلياً
        const realGuildsCount = client?.guilds?.cache ? client.guilds.cache.size : 0;

        // حساب إجمالي الأعضاء الفعليين ديناميكياً من كل سيرفر يدخله البوت
        let totalMembersCount = 0;
        if (client?.guilds?.cache && client.guilds.cache.size > 0) {
            client.guilds.cache.forEach(g => {
                totalMembersCount += (g.memberCount || 0);
            });
        }

        const realPing = (client?.ws?.ping !== undefined && client.ws.ping >= 0) ? Math.round(client.ws.ping) : 0;

        res.json({
            id: client?.user?.id || config.clientId,
            username: client?.user?.username || config.botName || 'Droplet',
            avatar: avatarUrl,
            guildsCount: realGuildsCount,
            dashboardUsersCount: totalMembersCount,
            usersCount: totalMembersCount,
            ping: realPing
        });
    });

    // 🔍 فحص وإظهار جميع السيرفرات المتواجد فيها البوت وأصحابها
    app.get('/api/admin/my-guilds', async (req, res) => {
        try {
            if (!client?.guilds?.cache) return res.json({ guilds: [] });
            const list = [];
            for (const [id, g] of client.guilds.cache) {
                let ownerTag = 'غير معروف';
                try {
                    const owner = await g.fetchOwner().catch(() => null);
                    if (owner) ownerTag = `${owner.user.tag} (${owner.id})`;
                } catch(e) {}
                list.push({
                    id: g.id,
                    name: g.name,
                    memberCount: g.memberCount,
                    owner: ownerTag
                });
            }
            res.json({ total: list.length, guilds: list });
        } catch(err) {
            res.status(500).json({ error: err.message });
        }
    });

    // 🚪 أمر خروج البوت من سيرفر معين غريب
    app.post('/api/admin/leave-guild', async (req, res) => {
        try {
            const { guildId } = req.body;
            if (!guildId) return res.status(400).json({ error: 'guildId required' });
            const g = client.guilds.cache.get(guildId);
            if (!g) return res.status(404).json({ error: 'السيرفر غير موجود في كاش البوت' });
            await g.leave();
            res.json({ success: true, message: `تم خروج البوت بنجاح من سيرفر ${g.name}` });
        } catch(err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ✅ Lazy-load: API يُرجع بطاقات الخلفيات عند الطلب فقط (بدل توليدها في كل تحميل للصفحة)
    app.get('/api/user/wallpapers', (req, res) => {
        try {
            const user = req.session?.user;
            if (!user) return res.status(401).json({ success: false, error: 'يجب تسجيل الدخول' });
            const userId = user.id;
            const userRow = rawDb.prepare('SELECT MAX(wallpaper) as wallpaper FROM users WHERE user_id = ?').get(userId);
            const userWallpaper = userRow?.wallpaper || 'default';
            const html = identityWallpapers.map(w => {
                const isSelected = userWallpaper === w.url || userWallpaper === w.name;
                return `<div class="wallpaper-item bg-[#080e1c] border ${isSelected ? 'border-blue-400 ring-2 ring-blue-400/40' : 'border-blue-500/20 hover:border-blue-500/20'} rounded-2xl overflow-hidden shadow-lg transition-all flex flex-col justify-between group" data-category="${w.category}">
                    <div class="relative h-32 overflow-hidden bg-black">
                        <img src="${w.url}" alt="${w.name}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                        <div class="absolute inset-0 bg-gradient-to-t from-[#080e1c] via-transparent to-black/20"></div>
                        <span class="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-[10px] font-bold text-white px-2 py-0.5 rounded-md border border-blue-500/20">${w.category}</span>
                        ${isSelected ? '<span class="absolute top-2 left-2 bg-emerald-500 text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-md">✓ مفعّل حالياً</span>' : ''}
                    </div>
                    <div class="p-3.5 flex flex-col justify-between flex-1 text-right gap-2.5">
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-mono font-bold text-amber-300">🪙 ${w.price.toLocaleString()}</span>
                            <h4 class="text-xs font-bold text-white truncate max-w-[140px]">${w.name}</h4>
                        </div>
                        <button onclick="buyItem('identity', '${w.url}', ${w.price}, this)" class="w-full py-2 bg-gradient-to-r ${isSelected ? 'from-emerald-600 to-teal-600 cursor-default' : 'from-blue-400 to-indigo-600 hover:from-blue-400 hover:to-indigo-500'} text-white rounded-xl text-xs font-bold transition shadow-md flex items-center justify-center gap-1.5">
                            ${isSelected ? '<span>مجهزة على بطاقتك 🪪</span>' : `<span>شراء وتجهيز (${w.price.toLocaleString()} 🪙)</span>`}
                        </button>
                    </div>
                </div>`;
            }).join('');
            res.send(html);
        } catch (e) {
            res.status(500).send('<p class="text-red-400 text-xs text-center py-4">حدث خطأ أثناء تحميل الخلفيات</p>');
        }
    });

    // ========================================================
    // ✅ API: بيانات الداشبورد الخاصة بالمستخدم (لتحميل الصفحة بعد الـ shell)
    // ========================================================
    app.get('/api/dashboard/me', (req, res) => {
        try {
            const user = req.session?.user;
            if (!user) return res.status(401).json({ error: 'not_logged_in' });

            // user data - مرشح بالـ cache
            const _userCache = _pageCache?.get('_user_' + user.id);
            let userRow;
            if (_userCache && (Date.now() - _userCache.ts) < _PAGE_TTL) {
                userRow = _userCache.data;
            } else {
                userRow = rawDb.prepare('SELECT SUM(coins) as coins, MAX(level) as level, SUM(reputation) as rep, SUM(xp) as xp, MAX(last_daily) as last_daily, MAX(wallpaper) as wallpaper FROM users WHERE user_id = ?').get(user.id);
                if (_pageCache) _pageCache.set('_user_' + user.id, { data: userRow, ts: Date.now() });
            }

            const now = Date.now();
            const lastDaily = userRow?.last_daily || 0;
            const cooldown = 24 * 60 * 60 * 1000;
            const canClaim = (now - lastDaily) > cooldown;
            const nextDailyIn = canClaim ? 0 : (cooldown - (now - lastDaily));

            // leaderboard ranks من الكاش
            const lb = getLeaderboardCached ? getLeaderboardCached() : { xpLeaderboard: [], coinsLeaderboard: [] };
            const xpRank = lb.xpLeaderboard.findIndex(r => r.user_id === user.id);
            const coinsRank = lb.coinsLeaderboard.findIndex(r => r.user_id === user.id);

            res.json({
                coins: userRow?.coins || 0,
                level: userRow?.level || 1,
                xp: userRow?.xp || 0,
                rep: userRow?.rep || 0,
                wallpaper: userRow?.wallpaper || 'default',
                canClaimDaily: canClaim,
                nextDailyIn,
                rankXp: xpRank >= 0 ? xpRank + 1 : '99+',
                rankCoins: coinsRank >= 0 ? coinsRank + 1 : '99+'
            });
        } catch(e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Endpoint for claiming daily reward from web dashboard

    app.post('/api/user/daily', (req, res) => {
        try {
            // Use real Discord user ID if logged in, else use stable session ID
            const userId = req.session?.user?.id || req.session?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: 'يجب تسجيل الدخول أولاً' });
            }
            const now = Date.now();
            const cooldown = 24 * 60 * 60 * 1000;

            const lastDaily = database.getLastDaily(userId);
            if (now - lastDaily < cooldown) {
                const remaining = cooldown - (now - lastDaily);
                const h = Math.floor(remaining / 3600000);
                const m = Math.floor((remaining % 3600000) / 60000);
                return res.status(400).json({
                    success: false,
                    error: `لقد استلمت راتبك اليومي مسبقاً! المكافأة التالية بعد ${h} ساعة و ${m} دقيقة.`
                });
            }

            // Determine active guild
            let targetGuildId = 'global';
            if (client?.guilds?.cache?.size > 0) {
                targetGuildId = client.guilds.cache.first().id;
            }

            const userData = database.getUser(userId, targetGuildId);
            let streak = userData.streak || 0;
            const twoDaysMs = 48 * 60 * 60 * 1000;
            if (now - lastDaily <= twoDaysMs && lastDaily > 0) {
                streak += 1;
            } else {
                streak = 1;
            }

            // Base reward 500 gold with streak bonus
            let reward = 500;
            if (streak >= 30) reward = 1000;
            else if (streak >= 7) reward = 750;
            else if (streak >= 3) reward = 600;

            database.addCoins(userId, targetGuildId, reward);
            database.setLastDaily(userId, targetGuildId, now, streak);

            const updatedUser = database.getUser(userId, targetGuildId);
            const newBalance = updatedUser.coins || updatedUser.credits || 0;

            // ✅ إبطال cache المستخدم لكي تُحدَّث البيانات في التحميل التالي
            if (_pageCache) {
                _pageCache.delete(userId);
                _pageCache.delete('_user_' + userId);
            }

            return res.json({
                success: true,
                amount: reward,
                streak,
                newBalance
            });
        } catch (err) {
            console.error('Error claiming web daily:', err);
            return res.status(500).json({ success: false, error: 'حدث خطأ أثناء معالجة الراتب اليومي: ' + err.message });
        }
    });

    // ========================================================
    // 💡 ECONOMY API ENDPOINTS (Live Persistent Dashboard API)
    // ========================================================
    
    // 1. Get Guild Economy Leaderboard
    app.get('/api/guilds/:guildId/economy/leaderboard', (req, res) => {
        try {
            const { guildId } = req.params;
            const limit = Math.min(parseInt(req.query.limit) || 10, 100);
            const leaderboard = db.getCoinsLeaderboard(guildId, limit);
            res.json({ success: true, leaderboard });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 2. Get User Balance
    app.get('/api/guilds/:guildId/economy/users/:userId', (req, res) => {
        try {
            const { guildId, userId } = req.params;
            const user = db.getUser(userId, guildId);
            res.json({
                success: true,
                user: {
                    userId: user.user_id,
                    guildId: user.guild_id,
                    balance: user.coins || 0,
                    level: user.level || 1,
                    xp: user.xp || 0,
                    lastDaily: user.last_daily || 0
                }
            });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 3. Admin Manage User Balance (Add / Remove / Set) with instant persistent write
    app.post('/api/guilds/:guildId/economy/manage', (req, res) => {
        try {
            if (!req.session?.user) {
                return res.status(401).json({ success: false, error: 'يجب تسجيل الدخول أولاً' });
            }

            const { guildId } = req.params;
            const { targetUserId, action, amount } = req.body;
            const val = parseInt(amount, 10);

            if (!targetUserId || isNaN(val) || val < 0) {
                return res.status(400).json({ success: false, error: 'بيانات غير صالحة' });
            }

            let newBalance = 0;
            if (action === 'set') {
                newBalance = db.setCoins(targetUserId, guildId, val);
            } else if (action === 'add') {
                newBalance = db.addCoins(targetUserId, guildId, val);
            } else if (action === 'remove') {
                newBalance = db.removeCoins(targetUserId, guildId, val);
            } else {
                return res.status(400).json({ success: false, error: 'إجراء غير معروف' });
            }

            res.json({
                success: true,
                message: 'تم تحديث الرصيد وحفظه فوراً في قاعدة البيانات',
                targetUserId,
                newBalance
            });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });


    // API: حفظ إعدادات السجلات
    app.post('/api/logs/save', (req, res) => {
        try {
            const { settings } = req.body;
            // يمكنك هنا إضافة الكود الخاص بـ database.updateLogsSettings(settings)
            console.log('Received log settings:', settings);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ============================================================
    // 🛍️ STORE SYSTEM — Economy Store API
    // ============================================================

    // مخزن مؤقت للعمليات الجارية (منع Race Conditions)
    const _purchaseLocks = new Set();

    // GET /api/guild/:guildId/store/items — جلب عناصر المتجر
    app.get('/api/guild/:guildId/store/items', (req, res) => {
        try {
            const { guildId } = req.params;
            const items = rawDb.prepare(`
                SELECT * FROM store_items
                WHERE guild_id = ? AND is_active = 1
                ORDER BY is_featured DESC, total_sold DESC, created_at DESC
            `).all(guildId);
            res.json({ success: true, items });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // GET /api/guild/:guildId/store/inventory — مخزون المستخدم
    app.get('/api/guild/:guildId/store/inventory', (req, res) => {
        try {
            const { guildId } = req.params;
            const userId = req.session?.user?.id;
            if (!userId) return res.status(401).json({ success: false, error: 'غير مسجل الدخول' });
            const now = Math.floor(Date.now() / 1000);
            const inventory = rawDb.prepare(`
                SELECT ui.*, si.name, si.icon, si.item_type, si.description
                FROM user_inventory ui
                JOIN store_items si ON ui.item_id = si.id
                WHERE ui.user_id = ? AND ui.guild_id = ?
                  AND (ui.expires_at = 0 OR ui.expires_at > ?)
                ORDER BY ui.purchased_at DESC
            `).all(userId, guildId, now);
            res.json({ success: true, inventory });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // GET /api/guild/:guildId/store/transactions — سجل المعاملات (أدمن)
    app.get('/api/guild/:guildId/store/transactions', (req, res) => {
        try {
            const { guildId } = req.params;
            const userId = req.session?.user?.id;
            if (!userId) return res.status(401).json({ success: false, error: 'غير مسجل الدخول' });
            // التحقق من صلاحيات الأدمن (يمتلك MANAGE_GUILD)
            const userGuilds = req.session?.guilds || [];
            const guild = userGuilds.find(g => g.id === guildId);
            const isAdmin = guild && (BigInt(guild.permissions || 0) & BigInt(0x20)) !== BigInt(0);
            const query = isAdmin
                ? rawDb.prepare(`SELECT * FROM store_transactions WHERE guild_id = ? ORDER BY created_at DESC LIMIT 100`).all(guildId)
                : rawDb.prepare(`SELECT * FROM store_transactions WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 50`).all(guildId, userId);
            res.json({ success: true, transactions: query });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // POST /api/guild/:guildId/store/buy/:itemId — شراء عنصر
    app.post('/api/guild/:guildId/store/buy/:itemId', async (req, res) => {
        const { guildId, itemId } = req.params;
        const userId = req.session?.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: 'يجب تسجيل الدخول أولاً' });

        const lockKey = `${userId}:${guildId}:${itemId}`;
        if (_purchaseLocks.has(lockKey)) {
            return res.status(429).json({ success: false, error: 'طلبك السابق لا يزال قيد المعالجة، انتظر لحظة...' });
        }
        _purchaseLocks.add(lockKey);

        try {
            // جلب العنصر
            const item = rawDb.prepare(`SELECT * FROM store_items WHERE id = ? AND guild_id = ? AND is_active = 1`).get(itemId, guildId);
            if (!item) return res.status(404).json({ success: false, error: 'العنصر غير موجود أو غير متاح' });

            // تحقق من المخزون
            if (item.stock === 0) return res.status(400).json({ success: false, error: 'نفد المخزون لهذا العنصر' });

            // تحقق من كولداون المستخدم
            if (item.cooldown_seconds > 0) {
                const lastTx = rawDb.prepare(`
                    SELECT created_at FROM store_transactions
                    WHERE user_id = ? AND item_id = ? AND status = 'success'
                    ORDER BY created_at DESC LIMIT 1
                `).get(userId, item.id);
                if (lastTx) {
                    const elapsed = Math.floor(Date.now() / 1000) - lastTx.created_at;
                    if (elapsed < item.cooldown_seconds) {
                        const remaining = item.cooldown_seconds - elapsed;
                        const h = Math.floor(remaining / 3600);
                        const m = Math.floor((remaining % 3600) / 60);
                        return res.status(400).json({ success: false, error: `يجب الانتظار ${h > 0 ? h + 'س ' : ''}${m}د قبل إعادة الشراء` });
                    }
                }
            }

            // جلب رصيد المستخدم
            const userRow = rawDb.prepare(`SELECT coins FROM users WHERE user_id = ? AND guild_id = ?`).get(userId, guildId);
            const userCoins = userRow?.coins || 0;
            if (userCoins < item.price) {
                return res.status(400).json({ success: false, error: `رصيدك غير كافٍ! تحتاج ${item.price} 🪙 ولديك ${userCoins} 🪙` });
            }

            // === تنفيذ الشراء كـ Transaction ===
            const purchaseTransaction = rawDb.transaction(() => {
                // خصم الذهب
                rawDb.prepare(`UPDATE users SET coins = coins - ? WHERE user_id = ? AND guild_id = ?`).run(item.price, userId, guildId);

                // تقليل المخزون إن كان محدوداً
                if (item.stock > 0) {
                    rawDb.prepare(`UPDATE store_items SET stock = stock - 1, total_sold = total_sold + 1, updated_at = strftime('%s','now') WHERE id = ?`).run(item.id);
                } else {
                    rawDb.prepare(`UPDATE store_items SET total_sold = total_sold + 1, updated_at = strftime('%s','now') WHERE id = ?`).run(item.id);
                }

                // حساب وقت الانتهاء
                const expiresAt = item.booster_duration > 0 && (item.item_type === 'xp_booster' || item.item_type === 'coin_booster' || item.item_type === 'vip')
                    ? Math.floor(Date.now() / 1000) + item.booster_duration
                    : 0;

                // إضافة للمخزون
                rawDb.prepare(`
                    INSERT INTO user_inventory (user_id, guild_id, item_id, quantity, is_active, expires_at)
                    VALUES (?, ?, ?, 1, 1, ?)
                `).run(userId, guildId, item.id, expiresAt);

                // تسجيل المعاملة
                rawDb.prepare(`
                    INSERT INTO store_transactions (guild_id, user_id, item_id, item_name, amount, price_paid, status)
                    VALUES (?, ?, ?, ?, 1, ?, 'success')
                `).run(guildId, userId, item.id, item.name, item.price);

                return expiresAt;
            });

            const expiresAt = purchaseTransaction();

            // ✅ تطبيق الفائدة في Discord
            let discordNote = '';
            try {
                const discordGuild = client?.guilds?.cache?.get(guildId);
                if (discordGuild && item.item_type === 'role' && item.role_id) {
                    const member = await discordGuild.members.fetch(userId).catch(() => null);
                    if (member) {
                        await member.roles.add(item.role_id).catch(() => {});
                        discordNote = 'تم تعيين الرتبة في Discord ✅';
                    }
                }
            } catch (discordErr) {
                discordNote = 'سيتم تطبيق الفائدة قريباً';
            }

            // مزامنة مع Turso
            try {
                const tursoSync = require('../database/tursoSync');
                const updatedUser = rawDb.prepare(`SELECT * FROM users WHERE user_id = ? AND guild_id = ?`).get(userId, guildId);
                if (updatedUser) tursoSync.queueUserSync(updatedUser);
            } catch (e) {}

            // مسح page cache للمستخدم
            if (typeof global._dropletDashboardClearCaches === 'function') {
                global._dropletDashboardClearCaches();
            }

            return res.json({
                success: true,
                message: `تم شراء "${item.name}" بنجاح!`,
                newBalance: (userCoins - item.price),
                discordNote,
                expiresAt
            });

        } catch (e) {
            console.error('[STORE] Purchase error:', e);
            return res.status(500).json({ success: false, error: 'حدث خطأ أثناء المعالجة، حاول مجدداً' });
        } finally {
            _purchaseLocks.delete(lockKey);
        }
    });

    // === Admin Store Endpoints ===

    // POST /api/guild/:guildId/store/admin/items — إضافة عنصر
    app.post('/api/guild/:guildId/store/admin/items', (req, res) => {
        try {
            const { guildId } = req.params;
            const userId = req.session?.user?.id;
            if (!userId) return res.status(401).json({ success: false, error: 'غير مسجل الدخول' });
            const userGuilds = req.session?.guilds || [];
            const guild = userGuilds.find(g => g.id === guildId);
            if (!guild || (BigInt(guild.permissions || 0) & BigInt(0x20)) === BigInt(0)) {
                return res.status(403).json({ success: false, error: 'ليس لديك صلاحية إدارة المتجر' });
            }
            const { name, description, item_type, icon, image_url, price, original_price, stock, role_id, booster_multiplier, booster_duration, cooldown_seconds, is_featured, badge_label } = req.body;
            if (!name || !price) return res.status(400).json({ success: false, error: 'الاسم والسعر مطلوبان' });
            const result = rawDb.prepare(`
                INSERT INTO store_items (guild_id, name, description, item_type, icon, image_url, price, original_price, stock, role_id, booster_multiplier, booster_duration, cooldown_seconds, is_featured, badge_label)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(guildId, name, description || '', item_type || 'role', icon || '🎁', image_url || '', Number(price), Number(original_price || 0), Number(stock ?? -1), role_id || '', Number(booster_multiplier || 1.5), Number(booster_duration || 3600), Number(cooldown_seconds || 0), is_featured ? 1 : 0, badge_label || '');
            res.json({ success: true, id: result.lastInsertRowid });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // PUT /api/guild/:guildId/store/admin/items/:itemId — تعديل عنصر
    app.put('/api/guild/:guildId/store/admin/items/:itemId', (req, res) => {
        try {
            const { guildId, itemId } = req.params;
            const userId = req.session?.user?.id;
            if (!userId) return res.status(401).json({ success: false, error: 'غير مسجل الدخول' });
            const userGuilds = req.session?.guilds || [];
            const guild = userGuilds.find(g => g.id === guildId);
            if (!guild || (BigInt(guild.permissions || 0) & BigInt(0x20)) === BigInt(0)) {
                return res.status(403).json({ success: false, error: 'ليس لديك صلاحية' });
            }
            const fields = req.body;
            const allowed = ['name','description','item_type','icon','image_url','price','original_price','stock','role_id','booster_multiplier','booster_duration','cooldown_seconds','is_featured','is_active','badge_label'];
            const sets = allowed.filter(k => fields[k] !== undefined).map(k => `${k} = @${k}`).join(', ');
            if (!sets) return res.status(400).json({ success: false, error: 'لا توجد بيانات للتعديل' });
            const values = {};
            allowed.forEach(k => { if (fields[k] !== undefined) values[k] = fields[k]; });
            values.id = itemId; values.guild_id = guildId;
            rawDb.prepare(`UPDATE store_items SET ${sets}, updated_at = strftime('%s','now') WHERE id = @id AND guild_id = @guild_id`).run(values);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // DELETE /api/guild/:guildId/store/admin/items/:itemId — حذف عنصر
    app.delete('/api/guild/:guildId/store/admin/items/:itemId', (req, res) => {
        try {
            const { guildId, itemId } = req.params;
            const userId = req.session?.user?.id;
            if (!userId) return res.status(401).json({ success: false, error: 'غير مسجل الدخول' });
            const userGuilds = req.session?.guilds || [];
            const guild = userGuilds.find(g => g.id === guildId);
            if (!guild || (BigInt(guild.permissions || 0) & BigInt(0x20)) === BigInt(0)) {
                return res.status(403).json({ success: false, error: 'ليس لديك صلاحية' });
            }
            rawDb.prepare(`UPDATE store_items SET is_active = 0 WHERE id = ? AND guild_id = ?`).run(itemId, guildId);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 3. User Dashboard & Main Routes (لوحة التحكم الداخلية للسيرفرات)


    // ✅ Cache للـ leaderboard - يمنع تشغيل GROUP BY على كل الجدول في كل request
    const _lbCache = { xp: null, coins: null, ts: 0 };
    const _LB_TTL = 60 * 1000; // 60 ثانية

    function getLeaderboardCached() {
        const now = Date.now();
        if (_lbCache.xp && _lbCache.coins && (now - _lbCache.ts) < _LB_TTL) {
            return { xpLeaderboard: _lbCache.xp, coinsLeaderboard: _lbCache.coins };
        }
        const xpLeaderboard = rawDb.prepare(`
            SELECT u.user_id,
                   SUM(u.xp) as xp,
                   SUM(u.xp) as total_xp,
                   MAX(u.level) as max_level,
                   SUM(u.coins) as total_coins,
                   COALESCE(p.display_name, p.username, u.user_id) as display_name,
                   p.username as username,
                   COALESCE(p.avatar_url, '') as avatar_url,
                   p.avatar as avatar
            FROM users u LEFT JOIN user_profiles p ON u.user_id = p.user_id
            GROUP BY u.user_id
            ORDER BY xp DESC LIMIT 100
        `).all();
        const coinsLeaderboard = rawDb.prepare(`
            SELECT u.user_id,
                   SUM(u.coins) as total_coins,
                   SUM(u.coins) as coins,
                   MAX(u.level) as max_level,
                   SUM(u.xp) as total_xp,
                   COALESCE(p.display_name, p.username, u.user_id) as display_name,
                   p.username as username,
                   COALESCE(p.avatar_url, '') as avatar_url,
                   p.avatar as avatar
            FROM users u LEFT JOIN user_profiles p ON u.user_id = p.user_id
            GROUP BY u.user_id
            ORDER BY total_coins DESC LIMIT 100
        `).all();
        _lbCache.xp = xpLeaderboard;
        _lbCache.coins = coinsLeaderboard;
        _lbCache.ts = now;
        return { xpLeaderboard, coinsLeaderboard };
    }

    async function _warmLeaderboardCache() {
        try { getLeaderboardCached(); } catch(e) {}
    }

    setTimeout(_warmLeaderboardCache, 15000);
    setInterval(_warmLeaderboardCache, 8 * 60 * 1000);

    // ✅ Page cache للداشبورد - يمنع إعادة بناء HTML في كل request
    const _pageCache = new Map();
    const _PAGE_TTL = 30 * 1000; // 30 ثانية

    // مسح cache عند تغيير الإعدادات
    global._dropletDashboardClearCaches = () => {
        _pageCache.clear();
        _lbCache.xp = null;
        _lbCache.coins = null;
        console.log('[DASH] 🔄 Dashboard caches cleared after Turso restore.');
    };

    app.get('/dashboard/manage', async (req, res) => {


        const _t0 = Date.now();
        try {
            let user = req.session?.user || null;
            if (!user) return res.redirect('/auth/discord');

            // تحقق من cache أولاً
            const cached = _pageCache.get(user.id);
            if (cached && (Date.now() - cached.ts) < _PAGE_TTL) {
                console.log(`[DASH] cache HIT for ${user.id} — ${Date.now()-_t0}ms`);
                return res.send(cached.html);
            }

            // عرض فقط السيرفرات التي يمتلك فيها المستخدم صلاحية إدارة والموجود فيها البوت
            let guilds = req.session?.guilds || [];

            // في حال تم إضافة سيرفر جديد للبوت أثناء جلسته، نتحقق من سيرفراته المدارة
            if (client?.guilds?.cache) {
                guilds = guilds.filter(g => client.guilds.cache.has(g.id));
            }

            const userAvatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
            const botAvatarUrl = client?.user?.avatar ? `https://cdn.discordapp.com/avatars/${client.user.id}/${client.user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

            let userCoins = 0, userLevel = 1, userStars = 0, userXp = 0, userLastDaily = 0, userWallpaper = 'default';
            let xpLeaderboard = [];
            let coinsLeaderboard = [];
            let userRankXp = 1;
            let userRankCoins = 1;

            try {
                // ✅ cache بيانات المستخدم لمدة 5 دقائق
                const _userCache = _pageCache.get('_user_' + user.id);
                let userRow;
                if (_userCache && (Date.now() - _userCache.ts) < _PAGE_TTL) {
                    userRow = _userCache.data;
                    console.log(`[DASH] user cache HIT — ${Date.now()-_t0}ms`);
                } else {
                    const _tSQL = Date.now();
                    userRow = rawDb.prepare('SELECT SUM(coins) as coins, MAX(level) as level, SUM(reputation) as rep, SUM(xp) as xp, MAX(last_daily) as last_daily, MAX(wallpaper) as wallpaper FROM users WHERE user_id = ?').get(user.id);
                    _pageCache.set('_user_' + user.id, { data: userRow, ts: Date.now() });
                    console.log(`[DASH] user SQL MISS — ${Date.now()-_tSQL}ms`);
                }
                userCoins = userRow?.coins || 0;
                userLevel = userRow?.level || 1;
                userStars = userRow?.rep || 0;
                userXp = userRow?.xp || 0;
                userLastDaily = userRow?.last_daily || 0;
                userWallpaper = userRow?.wallpaper || 'default';

                // ✅ استخدام cache بدلاً من GROUP BY ثقيل في كل request
                const _tLB = Date.now();
                const lb = getLeaderboardCached();
                xpLeaderboard = lb.xpLeaderboard;
                coinsLeaderboard = lb.coinsLeaderboard;
                console.log(`[DASH] leaderboard ready — ${Date.now()-_tLB}ms (total ${Date.now()-_t0}ms)`);

                // تعبئة بيانات المستخدمين من الكاش فقط (بدون طلبات Discord API لتجنب التجميد)
                const fillFromCache = (list) => {
                    for (const item of list) {
                        if (!item.username || !item.avatar_url) {
                            const cached = client?.users?.cache?.get(item.user_id);
                            if (cached) {
                                item.username = cached.tag || cached.username;
                                item.display_name = cached.globalName || cached.username;
                                item.avatar = cached.avatar;
                                item.avatar_url = cached.displayAvatarURL({ dynamic: true, size: 128 });
                            } else {
                                item.username = item.username || `عضو #${item.user_id.slice(-4)}`;
                                item.display_name = item.display_name || item.username;
                                item.avatar_url = item.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png';
                            }
                        }
                    }
                };

                fillFromCache(xpLeaderboard);
                fillFromCache(coinsLeaderboard);

                const xIndex = xpLeaderboard.findIndex(r => r.user_id === user.id);
                if (xIndex !== -1) userRankXp = xIndex + 1;

                const cIndex = coinsLeaderboard.findIndex(r => r.user_id === user.id);
                if (cIndex !== -1) userRankCoins = cIndex + 1;
            } catch (err) {}

            const now = Date.now();
            const canClaimDaily = (now - userLastDaily) >= 24 * 60 * 60 * 1000;
            const nextDailyIn = Math.max(0, 24 * 60 * 60 * 1000 - (now - userLastDaily));
            const nextDailyHours = Math.floor(nextDailyIn / (1000 * 60 * 60));
            const nextDailyMinutes = Math.floor((nextDailyIn % (1000 * 60 * 60)) / (1000 * 60));

            const xpNeeded = userLevel * 100;
            const xpProgress = Math.min(100, Math.floor((userXp % 100) / 100 * 100));

            const serverRailHtml = guilds.map(g => `
                <a href="/dashboard/${g.id}" title="${g.name}" class="group relative flex items-center justify-center">
                    <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                         class="w-11 h-11 rounded-2xl border border-blue-500/20 hover:border-blue-400 hover:rounded-xl object-cover transition-all shadow-md">
                </a>
            `).join('');

            const userDashboardGuildsHtml = guilds.length > 0 ? guilds.map(g => `
                <div class="bg-[#091124] border border-blue-500/20 hover:border-blue-500/40 p-4 rounded-2xl flex items-center justify-between transition group shadow-lg">
                    <a href="/dashboard/${g.id}" class="px-5 py-2.5 bg-gradient-to-r from-[#a855f7] to-[#2563eb] hover:from-[#c084fc] hover:to-[#3b82f6] text-white font-black text-xs rounded-xl transition shadow-lg shadow-purple-500/30 flex items-center gap-1.5 hover:scale-105">
                        <span>إدارة</span>
                        <span>⚙️</span>
                    </a>
                    <div class="flex items-center gap-3">
                        <div class="text-right">
                            <h4 class="font-bold text-white text-sm group-hover:text-blue-400 transition truncate max-w-[160px]">${g.name}</h4>
                            <span class="text-[10px] text-gray-400 font-mono">${g.id}</span>
                        </div>
                        <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-12 h-12 rounded-2xl bg-[#040714] object-cover ring-2 ring-blue-500/20">
                    </div>
                </div>
            `).join('') : `
                <div class="col-span-full py-12 text-center space-y-3 bg-[#091124] rounded-2xl border border-dashed border-blue-500/20 p-6">
                    <div class="text-4xl">🛡️</div>
                    <h4 class="text-white font-bold text-sm">No manageable servers found</h4>
                    <p class="text-gray-400 text-xs max-w-md mx-auto">To manage a server, you must be the owner or have Administrator / Manage Server permissions, and the bot must be invited.</p>
                    <a href="https://discord.com/api/oauth2/authorize?client_id=${client?.user?.id || config.clientId}&permissions=8&scope=bot%20applications.commands" target="_blank" class="inline-flex items-center gap-2 px-5 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold rounded-xl transition shadow-lg shadow-blue-600/40 mt-2">
                        <span>➕ Add Bot to Server</span>
                    </a>
                </div>
            `;

            const xpLeaderboardHtml = xpLeaderboard.slice(0, 20).map((r, i) => {
                const uName = r.display_name || r.username || `عضو #${String(r.user_id).slice(-4)}`;
                const uAvatar = r.avatar_url || (r.avatar ? `https://cdn.discordapp.com/avatars/${r.user_id}/${r.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png');
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                const rowBg = i === 0 ? 'bg-amber-500/5 hover:bg-amber-500/10' : i === 1 ? 'bg-slate-500/5 hover:bg-slate-500/10' : i === 2 ? 'bg-orange-700/5 hover:bg-orange-700/10' : 'hover:bg-white/[0.02]';
                const rankColor = i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-400' : 'text-gray-500';
                const isMe = r.user_id === user.id;
                return `<div class="leaderboard-row px-4 py-3 flex items-center justify-between transition-all ${rowBg} ${isMe ? 'ring-1 ring-inset ring-blue-400/30' : ''}">
                    <div class="lb-rank flex items-center gap-1.5 min-w-[50px]">
                        ${medal ? `<span class="text-xl">${medal}</span>` : `<span class="text-sm font-black font-mono ${rankColor} w-7 text-center">${i + 1}</span>`}
                    </div>
                    <div class="lb-user flex items-center gap-3 flex-1 min-w-0">
                        <img src="${uAvatar}" alt="${uName}" class="w-8 h-8 rounded-xl object-cover shrink-0 ${isMe ? 'ring-2 ring-blue-400' : ''}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                        <div class="min-w-0">
                            <span class="text-xs text-white font-bold block truncate max-w-[150px]">${uName}${isMe ? ' 👤' : ''}</span>
                            <span class="text-[10px] text-gray-500 font-mono block">Lv.${r.max_level || 1}</span>
                        </div>
                    </div>
                    <div class="lb-stat shrink-0 text-left">
                        <span class="text-xs font-black font-mono text-blue-400">⚡ ${Number(r.total_xp || 0).toLocaleString()}</span>
                        <span class="text-[10px] text-gray-600 block">XP</span>
                    </div>
                </div>`;
            }).join('') || '<p class="text-xs text-gray-500 text-center py-6">لا توجد بيانات بعد</p>';


            const coinsLeaderboardHtml = coinsLeaderboard.slice(0, 20).map((r, i) => {
                const uName = r.display_name || r.username || `عضو #${String(r.user_id).slice(-4)}`;
                const uAvatar = r.avatar_url || (r.avatar ? `https://cdn.discordapp.com/avatars/${r.user_id}/${r.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png');
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                const rowBg = i === 0 ? 'bg-amber-500/5 hover:bg-amber-500/10' : i === 1 ? 'bg-slate-500/5 hover:bg-slate-500/10' : i === 2 ? 'bg-orange-700/5 hover:bg-orange-700/10' : 'hover:bg-white/[0.02]';
                const rankColor = i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-400' : 'text-gray-500';
                const isMe = r.user_id === user.id;
                return `<div class="leaderboard-row px-4 py-3 flex items-center justify-between transition-all ${rowBg} ${isMe ? 'ring-1 ring-inset ring-amber-500/30' : ''}">
                    <div class="lb-rank flex items-center gap-1.5 min-w-[50px]">
                        ${medal ? `<span class="text-xl">${medal}</span>` : `<span class="text-sm font-black font-mono ${rankColor} w-7 text-center">${i + 1}</span>`}
                    </div>
                    <div class="lb-user flex items-center gap-3 flex-1 min-w-0">
                        <img src="${uAvatar}" alt="${uName}" class="w-8 h-8 rounded-xl object-cover shrink-0 ${isMe ? 'ring-2 ring-amber-500' : ''}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                        <div class="min-w-0">
                            <span class="text-xs text-white font-bold block truncate max-w-[150px] ${isMe ? 'text-amber-300' : ''}">${uName}${isMe ? ' 👤' : ''}</span>
                            <span class="text-[10px] text-gray-500 font-mono block">Lv.${r.max_level || 1}</span>
                        </div>
                    </div>
                    <div class="lb-stat shrink-0 text-left">
                        <span class="text-xs font-black font-mono text-amber-400">🪙 ${Number(r.total_coins || 0).toLocaleString()}</span>
                        <span class="text-[10px] text-gray-600 block">Gold</span>
                    </div>
                </div>`;
            }).join('') || '<p class="text-xs text-gray-500 text-center py-6">لا توجد بيانات بعد</p>';


            const dailyActionBoxHtml = canClaimDaily ? `
                <button type="button" onclick="window.claimDailyReward()" id="claimDailyBtn" class="px-10 py-3.5 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-blue-800/60 hover:scale-105 transition-all cursor-pointer flex items-center gap-2 mx-auto">
                    <span class="text-lg">🎁</span>
                    <span>استلام الرصيد اليومي</span>
                </button>
            ` : `
                <div class="inline-flex items-center gap-2.5 text-xs font-black text-white bg-blue-800/50 border border-blue-500/20 px-6 py-3 rounded-2xl shadow-xl shadow-blue-800/40">
                    <span class="text-sm">⏳</span>
                    <span>متاح بعد: </span>
                    <span id="liveDailyTimer" class="font-mono text-gray-300 tracking-wider text-sm font-black" data-target="${now + nextDailyIn}">${nextDailyHours}س ${nextDailyMinutes}د</span>
                </div>
            `;

            const identityWallpapersHtml = `<div id="wallpapersGrid" class="contents"><div class="col-span-full flex items-center justify-center py-12"><div class="text-blue-400 text-sm font-bold animate-pulse">⏳ جارٍ تحميل الخلفيات...</div></div></div>`;

            const _pageHtml = `
            <!DOCTYPE html>
            <html lang="en" dir="ltr" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Droplet Dashboard</title>
                <!-- ✅ Tailwind - يُحمَّل بدون تجميد الصفحة -->
                <link rel="stylesheet" href="/tw.css" onerror="this.remove()">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                
                <style>
                    :root {
                        --bg-main: #060c1d;
                        --bg-sidebar: #081026;
                        --bg-card: #0b1530;
                        --bg-card-hover: #101e44;
                        --primary: #2563eb;
                        --border: rgba(59, 130, 246, 0.28);
                    }
                    body { background-color: var(--bg-main) !important; color: #ffffff !important; font-family: 'Cairo', sans-serif !important; transition: background-color 0.3s, color 0.3s; }
                    body.light-mode { background-color: #f8f9fa !important; color: #1a1a1a !important; }
                    body.light-mode .bg-\[\#060c1d\], body.light-mode .bg-\[\#0b1530\] { background-color: #ffffff !important; border-color: #e5e7eb !important; }
                    body.light-mode .text-white { color: #1a1a1a !important; }
                    body.light-mode .text-blue-200 { color: #4b5563 !important; }
                    body.light-mode .text-blue-300 { color: #6b7280 !important; }
                    ::-webkit-scrollbar { width: 6px; height: 6px; }
                    ::-webkit-scrollbar-track { background: #060c1d; }
                    ::-webkit-scrollbar-thumb { background: #2563eb; border-radius: 10px; }
                    @keyframes spin { to { transform: rotate(360deg); } }
                    .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(37, 99, 235, 0.2); border-radius: 50%; border-top-color: #3b82f6; animation: spin 0.8s linear infinite; }
                    @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                    /* Direction and Layout fixes */
                    [dir="rtl"] .text-right { text-align: right !important; }
                    [dir="rtl"] .text-left { text-align: left !important; }
                    .tab-content { width: 100%; }
                    /* Droplet blended headings */ h1[class*="text-white"]:not([style]), h2[class*="text-white"]:not([style]) { background:linear-gradient(90deg,#c084fc,#60a5fa); -webkit-background-clip:text; background-clip:text; color:transparent !important; }
                    /* Leaderboard row alignment fix */
                    .leaderboard-row {
                        direction: rtl !important;
                    }
                    .leaderboard-row .lb-rank {
                        order: 1;
                    }
                    .leaderboard-row .lb-user {
                        order: 2;
                    }
                    .leaderboard-row .lb-stat {
                        order: 3;
                    }
                </style>
            
    <script>
    function _t(text) {
        if (window.DropletI18n && typeof window.DropletI18n.translate === 'function') {
            return window.DropletI18n.translate(text);
        }
        return text;
    }

    function _isEn() {
        return document.documentElement.getAttribute('lang') === 'en';
    }

    window.toggleNavGroup = function(groupId) {
        const el = document.getElementById(groupId);
        const arrow = document.getElementById('arrow_' + groupId);
        if (!el) return;
        el.classList.toggle('hidden');
        if (arrow) arrow.classList.toggle('rotate-180');
    };

    window.filterWallpapers = function(cat, btn) {
        const items = document.querySelectorAll('.wallpaper-item');
        items.forEach(el => {
            if (cat === 'all' || el.getAttribute('data-category') === cat) {
                el.style.display = 'flex';
            } else {
                el.style.display = 'none';
            }
        });
        const filterBtns = document.querySelectorAll('.cat-filter-btn');
        filterBtns.forEach(b => {
            b.classList.remove('bg-gradient-to-l from-purple-600 to-blue-500', 'text-white');
            b.classList.add('bg-white/5', 'text-blue-300');
        });
        if (btn) {
            btn.classList.add('bg-gradient-to-l from-purple-600 to-blue-500', 'text-white');
            btn.classList.remove('bg-white/5', 'text-blue-300');
        }
    };

    var _wallpapersLoaded = false;

    window.switchTab = function(tabId, btn) {
        const tabs = document.querySelectorAll('.tab-content');
        tabs.forEach(t => t.classList.add('hidden'));

        const target = document.getElementById(tabId);
        if (target) {
            target.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        if (btn) {
            const allNavBtns = document.querySelectorAll('.nav-btn');
            allNavBtns.forEach(b => {
                b.classList.remove('bg-gradient-to-r', 'from-[#c084fc]', 'to-[#2563eb]', 'text-white', 'font-black', 'shadow-md', 'shadow-[#c084fc]/20');
                b.classList.add('text-gray-300', 'hover:text-white', 'hover:bg-white/5', 'font-medium');
            });
            btn.classList.add('bg-gradient-to-r', 'from-[#c084fc]', 'to-[#2563eb]', 'text-white', 'font-black', 'shadow-md', 'shadow-[#c084fc]/20');
            btn.classList.remove('text-gray-300', 'hover:text-white', 'hover:bg-white/5', 'font-medium');
        }

        // ✅ تحميل كسول للخلفيات عند فتح تاب الهوية لأول مرة فقط
        if ((tabId === 'tabProfile' || tabId === 'tabIdentity') && !_wallpapersLoaded) {
            _wallpapersLoaded = true;
            var grid = document.getElementById('wallpapersGrid');
            if (grid) {
                fetch('/api/user/wallpapers')
                    .then(function(r) { return r.text(); })
                    .then(function(html) {
                        var container = grid.parentElement || grid;
                        container.innerHTML = html;
                    })
                    .catch(function() {
                        _wallpapersLoaded = false;
                    });
            }
        }

        // dropletI18n.apply() أُزيلت من هنا لأنها كانت تُجمّد المتصفح في كل ضغطة
        // (كانت تمسح كل DOM لتطبيق الترجمات — 77KB script على صفحة ضخمة)
    };

    window.claimDailyReward = async function() {
        const btn = document.getElementById('claimDailyBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = _t('جارٍ الاستلام... ⏳');
        }
        try {
            const res = await fetch('/api/user/daily', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                if (_isEn()) {
                    alert('🎉 Successfully received ' + data.amount + ' gold! Your new balance: ' + data.newBalance.toLocaleString() + ' 🪙');
                } else {
                    alert('🎉 تم استلام ' + data.amount + ' ذهب بنجاح! رصيدك الجديد: ' + data.newBalance.toLocaleString() + ' 🪙');
                }
                // ✅ تحديث الأرقام مباشرة بدون إعادة تحميل الصفحة
                // تحديث رصيد الذهب في كل مكان يظهر فيه
                var coinsDisplay = document.getElementById('userCoinsDisplay');
                if (coinsDisplay) coinsDisplay.textContent = data.newBalance.toLocaleString();
                // تحديث رصيد الذهب في الهيدر
                document.querySelectorAll('.text-yellow-400.font-mono').forEach(function(el) {
                    el.textContent = '🪙 ' + data.newBalance.toLocaleString() + ' Gold';
                });
                // تحديث صندوق زر الراتب - يحوله لعداد 24 ساعة
                var box = document.getElementById('dailyActionBox');
                if (box) {
                    var nextTarget = Date.now() + 24 * 60 * 60 * 1000;
                    var countdownLabel = _isEn() ? 'Next reward in:' : 'المكافأة التالية بعد:';
                    box.innerHTML = '<div class="flex flex-col items-center gap-2">'
                        + '<span class="text-xs text-white">' + countdownLabel + '</span>'
                        + '<span id="liveDailyTimer" class="font-mono text-gray-300 tracking-wider text-sm font-black" data-target="' + nextTarget + '">24س 00د 00ث</span>'
                        + '</div>';
                }
            } else {
                alert('❌ ' + (data.error || _t('فشل استلام الراتب اليومي')));
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = _t('استلام الرصيد 🎁');
                }
            }
        } catch(e) {
            alert(_t('حدث خطأ في الاتصال بالسيرفر'));
            if (btn) {
                btn.disabled = false;
                btn.textContent = _t('استلام الرصيد 🎁');
            }
        }
    };

    
    // Live ticking countdown for daily reward
    setInterval(function() {
        var timerEl = document.getElementById('liveDailyTimer');
        if (!timerEl) return;
        var target = parseInt(timerEl.getAttribute('data-target'), 10);
        if (!target) return;
        var diff = target - Date.now();
        if (diff <= 0) {
            var box = document.getElementById('dailyActionBox');
            if (box) {
                const claimBtnLabel = _t('استلام الرصيد اليومي');
                box.innerHTML = '<button type="button" onclick="window.claimDailyReward()" id="claimDailyBtn" class="px-10 py-3.5 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-blue-800/60 hover:scale-105 transition-all cursor-pointer flex items-center gap-2 mx-auto"><span class="text-lg">🎁</span><span>' + claimBtnLabel + '</span></button>';
            }
            return;
        }
        var h = Math.floor(diff / (1000 * 60 * 60));
        var m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        var sec = Math.floor((diff % (1000 * 60)) / 1000);
        if (_isEn()) {
            timerEl.textContent = (h < 10 ? '0' + h : h) + 'h ' + (m < 10 ? '0' + m : m) + 'm ' + (sec < 10 ? '0' + sec : sec) + 's';
        } else {
            timerEl.textContent = (h < 10 ? '0' + h : h) + 'س ' + (m < 10 ? '0' + m : m) + 'د ' + (sec < 10 ? '0' + sec : sec) + 'ث';
        }
    }, 1000);
    
    window.buyItem = async function(type, name, price, btn) {
        const confirmMsg = _isEn()
            ? 'Are you sure you want to buy and activate "' + name + '" for ' + price.toLocaleString() + ' 🪙?'
            : _t('هل أنت متأكد من شراء وتفعيل "') + name + _t('" مقابل ') + price.toLocaleString() + _t(' 🪙؟');
        if (!confirm(confirmMsg)) return;
        if (btn) {
            btn.disabled = true;
            btn.textContent = _t('جارٍ الشراء... ⏳');
        }
        try {
            const res = await fetch('/api/user/buy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: type, name: name, price: price })
            });
            const data = await res.json();
            if (data.success) {
                alert(_t('✅ تم الشراء والتفعيل بنجاح!'));
                // ✅ تحديث رصيد الذهب بدون reload
                if (data.newBalance !== undefined) {
                    var coinsDisplay = document.getElementById('userCoinsDisplay');
                    if (coinsDisplay) coinsDisplay.textContent = data.newBalance.toLocaleString();
                    document.querySelectorAll('.text-yellow-400.font-mono').forEach(function(el) {
                        el.textContent = '🪙 ' + data.newBalance.toLocaleString() + ' Gold';
                    });
                }
                // تغيير نص الزر للمشتري
                if (btn) {
                    btn.disabled = true;
                    btn.textContent = '✅ ' + _t('مفعّل');
                    btn.classList.remove('bg-gradient-to-l from-purple-600 to-blue-500', 'hover:bg-gradient-to-l from-purple-600 to-blue-500');
                    btn.classList.add('bg-green-600');
                }
            } else {
                alert('❌ ' + (data.error || _t('رصيدك لا يكفي لإتمام الشراء')));
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = _t('شراء وتجهيز');
                }
            }
        } catch(e) {
            alert(_t('حدث خطأ أثناء الشراء'));
            if (btn) {
                btn.disabled = false;
                btn.textContent = _t('شراء وتجهيز');
            }
        }
    };
    </script>

    <script src="/i18n.js"></script><script src="/i18n-dash.js"></script><script src="/i18n-dash2.js"></script>
</head>
            <body data-droplet-manual-lang="true" class="min-h-screen flex flex-col bg-[#060c1d] text-white">
                <header class="h-16 bg-[#081026]/95 backdrop-blur-md border-b border-blue-500/20 px-6 flex items-center justify-between sticky top-0 z-40">
                    <div class="flex items-center gap-3">
                        <button type="button" onclick="window.dropletI18n.toggleLang()" class="droplet-lang-toggle-btn px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-blue-500/20 text-blue-100 rounded-xl transition flex items-center gap-1.5 cursor-pointer text-xs">
                            <span class="text-sm">🌐</span>
                            <span class="font-black text-xs uppercase tracking-wider">EN</span>
                        </button>
                        <span class="text-gray-700">|</span>
                        <a href="/logout" data-i18n="logout" class="text-xs text-rose-400 hover:text-rose-300 font-bold transition">تسجيل الخروج</a>
                        <span class="text-gray-700">|</span>
                        <a href="https://discord.gg/zduGPYv7pE" target="_blank" data-i18n="support_server" class="text-xs text-white hover:text-blue-100 transition">الدعم الفني</a>
                        <span class="text-gray-700">|</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <img src="${botAvatarUrl}" class="w-8 h-8 rounded-xl object-cover ring-2 ring-blue-400/40 shadow-md shadow-blue-700/30">
                        <span class="font-black text-sm text-white tracking-wide hidden sm:block">Droplet</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="text-right">
                            <span class="text-xs font-bold text-white block">${user.username}</span>
                            <span class="text-[10px] text-yellow-400 font-mono">🪙 ${userCoins.toLocaleString()} Gold</span>
                        </div>
                        <img src="${userAvatar}" class="w-9 h-9 rounded-xl object-cover ring-2 ring-yellow-500/40">
                    </div>
                </header>

                <div class="flex-1 flex overflow-hidden">
                    
                    <!-- Main Content (Left in RTL - Novax User Dashboard Style) -->
                    <main class="flex-1 p-8 overflow-y-auto custom-scrollbar space-y-6">
                        
                        <!-- Tab 1: نظرة عامة والملف الشخصي (Novax Exact Style) -->
                        <div id="tabOverview" class="tab-content space-y-6">
                            
                            <!-- Header Title -->
                            <div class="flex items-center justify-end gap-2 text-white font-black text-lg">
                                <span>نظرة عامة</span>
                                <span class="text-blue-400">🎛️</span>
                            </div>

                            <!-- Top Stats 4-Grid (Novax Exact Order & Icons: Gold / Reputation / Rank / Level) -->
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                
                                <!-- 1. Gold (Golds / Gold) -->
                                <div class="bg-[#080e1c] border border-blue-500/20 hover:border-blue-500/20 rounded-2xl p-4 flex items-center justify-between shadow-lg transition">
                                    <div class="w-10 h-10 rounded-xl bg-blue-400/10 text-amber-400 flex items-center justify-center text-xl font-bold shadow-inner">🪙</div>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-white">Gold</span>
                                        <h3 id="userCoinsDisplay" class="text-xl font-black text-white mt-0.5">${userCoins.toLocaleString()}</h3>
                                    </div>
                                </div>

                                <!-- 2. Reputation (Reputation) -->
                                <div class="bg-[#080e1c] border border-blue-500/20 hover:border-blue-500/20 rounded-2xl p-4 flex items-center justify-between shadow-lg transition">
                                    <div class="w-10 h-10 rounded-xl bg-blue-400/10 text-blue-400 flex items-center justify-center text-xl shadow-inner">👍</div>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-white">Reputation</span>
                                        <h3 class="text-xl font-black text-white mt-0.5">${userStars}</h3>
                                    </div>
                                </div>

                                <!-- 3. Rank (Rank) -->
                                <div class="bg-[#080e1c] border border-blue-500/20 hover:border-blue-500/20 rounded-2xl p-4 flex items-center justify-between shadow-lg transition">
                                    <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xl shadow-inner">🏆</div>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-white">Rank</span>
                                        <h3 class="text-xl font-black text-white mt-0.5">#${userRankXp}</h3>
                                    </div>
                                </div>

                                <!-- 4. Level (Level) -->
                                <div class="bg-[#080e1c] border border-blue-500/20 hover:border-blue-500/20 rounded-2xl p-4 flex items-center justify-between shadow-lg transition">
                                    <div class="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xl shadow-inner">📈</div>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-white">Level</span>
                                        <h3 class="text-xl font-black text-white mt-0.5">${userLevel}</h3>
                                    </div>
                                </div>

                            </div>

                            <!-- خوادمك المتاحة للإدارة (Servers List) -->
                            <div class="bg-[#080e1c] border border-blue-500/20 rounded-3xl p-6 shadow-xl space-y-4">
                                <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                    <span class="text-xs text-blue-400 font-bold bg-blue-800/40 px-2.5 py-1 rounded-lg">${guilds.length} Servers</span>
                                    <h3 class="text-sm font-black text-white text-right flex items-center gap-2"><span>🛡️</span><span>Your Manageable Servers</span></h3>
                                </div>
                                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    ${userDashboardGuildsHtml}
                                </div>
                            </div>

                            <!-- Recent Gold Transactions (Recent Gold Transactions - Novax Exact Style) -->
                            <div class="bg-[#080e1c] border border-blue-500/20 rounded-3xl p-6 shadow-xl space-y-4 text-right">
                                <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                    <span class="text-xs text-white">Transaction & Rewards Log</span>
                                    <h3 class="text-sm font-black text-white flex items-center gap-2"><span>Last 5 Gold Transactions</span><span>🪙</span></h3>
                                </div>

                                <div class="overflow-x-auto">
                                    <div class="bg-gradient-to-r from-emerald-950/30 via-[#151724] to-[#151724] border border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between shadow-lg">
                                        <div class="flex items-center gap-2 text-emerald-400 font-bold font-mono text-sm">
                                            <span>↗️ ${userCoins.toLocaleString()}</span>
                                            <span class="text-xs text-white font-normal">الرصيد</span>
                                        </div>
                                        <div class="text-emerald-400 font-mono font-bold text-sm">
                                            +500
                                            <span class="text-[10px] text-white block font-normal">المبلغ</span>
                                        </div>
                                        <div class="text-gray-300 text-xs text-center">
                                            <span>اليوم</span>
                                            <span class="text-[10px] text-white block">تاريخ</span>
                                        </div>
                                        <div class="flex items-center gap-2.5 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white leading-tight">المكافأة اليومية (Daily)</h5>
                                                <span class="text-[10px] text-white font-mono">Droplet Bot System</span>
                                            </div>
                                            <div class="w-8 h-8 rounded-xl bg-blue-400/20 text-blue-400 flex items-center justify-center text-sm font-bold border border-blue-500/20">🎁</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- قسم الملف الشخصي وبطاقة الهوية (Profile Card & Identity Card - Novax Exact Style) -->
                            <div class="space-y-4 text-right">
                                <h3 class="text-sm font-black text-white flex items-center justify-end gap-2"><span>الملف الشخصي</span><span>👤</span></h3>
                                
                                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    
                                    <!-- 1. الملف الشخصي (Main Profile Card) -->
                                    <div class="bg-[#080e1c] border border-blue-500/20 rounded-3xl p-5 shadow-xl space-y-4">
                                        <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                            <h4 class="text-xs font-black text-white">الملف الشخصي</h4>
                                        </div>

                                        <!-- The Graphic Discord Card (Purple Nebula Design) -->
                                        <div class="relative rounded-2xl overflow-hidden bg-gradient-to-br from-blue-800 via-[#101a36] to-[#0a0f26] border border-blue-500/20 p-5 shadow-2xl space-y-4">
                                            <!-- Top Header in Card -->
                                            <div class="flex items-center justify-between">
                                                <span class="px-2.5 py-1 bg-blue-700/60 border border-blue-500/20 text-gray-300 text-[10px] font-bold rounded-lg">+0 REP</span>
                                                <div class="flex items-center gap-3">
                                                    <div class="text-right">
                                                        <h4 class="text-sm font-black text-white leading-tight">@${user.username}</h4>
                                                    </div>
                                                    <img src="${userAvatar}" class="w-12 h-12 rounded-2xl object-cover ring-2 ring-blue-400/60 shadow-lg shadow-black/40">
                                                </div>
                                            </div>

                                            <!-- About Me Box -->
                                            <div class="bg-black/30 border border-blue-500/20 rounded-xl p-3 text-right">
                                                <span class="text-[9px] font-bold text-white block mb-0.5">ABOUT ME</span>
                                                <p class="text-xs text-blue-100">مرحباً بك في لوحة تحكم Droplet Bot!</p>
                                            </div>

                                            <!-- Stats & Gold in Card -->
                                            <div class="grid grid-cols-2 gap-3 text-right">
                                                <div class="bg-black/30 border border-blue-500/20 rounded-xl p-3 space-y-1 text-xs">
                                                    <span class="text-[9px] font-bold text-white block">STATISTICS</span>
                                                    <div class="text-[11px] text-gray-300 flex items-center justify-between">
                                                        <span class="font-bold text-white">${userLevel}</span>
                                                        <span>⚡ LEVEL:</span>
                                                    </div>
                                                    <div class="text-[11px] text-gray-300 flex items-center justify-between">
                                                        <span class="font-bold text-emerald-400">#${userRankXp}</span>
                                                        <span>🏆 RANK:</span>
                                                    </div>
                                                    <div class="text-[11px] text-gray-300 flex items-center justify-between">
                                                        <span class="font-bold text-blue-100 font-mono">${userXp} XP</span>
                                                        <span>✨ XP:</span>
                                                    </div>
                                                </div>

                                                <div class="bg-black/30 border border-blue-500/20 rounded-xl p-3 space-y-2 text-right">
                                                    <span class="text-[9px] font-bold text-white block">GOLDS</span>
                                                    <div class="flex items-center justify-end gap-1.5 text-amber-400 font-black text-sm">
                                                        <span>${userCoins.toLocaleString()}</span>
                                                        <span class="text-base">🪙</span>
                                                    </div>
                                                    <span class="text-[9px] font-bold text-white block pt-1">BADGES</span>
                                                    <div class="flex items-center justify-end gap-1 text-base">
                                                        <span>👑</span><span>💎</span><span>🔥</span><span>⚡</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- 2. بطاقة الهوية (Identity / Voice & Invites Card) -->
                                    <div class="bg-[#080e1c] border border-blue-500/20 rounded-3xl p-5 shadow-xl space-y-4">
                                        <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                            <h4 class="text-xs font-black text-white">بطاقة الهوية</h4>
                                        </div>

                                        <!-- The Graphic Identity Card -->
                                        <div class="relative rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-950 via-[#0c1430] to-[#060b16] border border-indigo-500/30 p-5 shadow-2xl space-y-4">
                                            <div class="flex items-center justify-between">
                                                <div class="text-left text-xs font-bold text-indigo-300 bg-indigo-950/60 border border-indigo-800/40 px-3 py-1 rounded-xl">
                                                    <span>INVITES: 0</span>
                                                </div>
                                                <div class="flex items-center gap-3">
                                                    <div class="text-right">
                                                        <h4 class="text-sm font-black text-white leading-tight">@${user.username}</h4>
                                                        <span class="text-[10px] text-white">ID CARD</span>
                                                    </div>
                                                    <img src="${userAvatar}" class="w-12 h-12 rounded-2xl object-cover ring-2 ring-indigo-500/60 shadow-lg shadow-black/40">
                                                </div>
                                            </div>

                                            <div class="grid grid-cols-2 gap-3 text-right">
                                                <div class="bg-black/30 border border-blue-500/20 rounded-xl p-3 space-y-1">
                                                    <div class="flex items-center justify-between text-xs text-indigo-400 font-bold mb-1">
                                                        <span>TOP #1</span>
                                                        <span>💬 TEXT</span>
                                                    </div>
                                                    <div class="text-[10px] text-gray-300">TOTAL XP: <span class="font-mono text-white">${userXp}</span></div>
                                                    <div class="text-[10px] text-gray-300">STREAK: <span class="font-mono text-emerald-400">Active</span></div>
                                                </div>

                                                <div class="bg-black/30 border border-blue-500/20 rounded-xl p-3 space-y-1">
                                                    <div class="flex items-center justify-between text-xs text-blue-400 font-bold mb-1">
                                                        <span>TOP #1</span>
                                                        <span>🎙️ VOICE</span>
                                                    </div>
                                                    <div class="text-[10px] text-gray-300">VOICE TIME: <span class="font-mono text-white">Online</span></div>
                                                    <div class="text-[10px] text-gray-300">STREAK: <span class="font-mono text-emerald-400">Level ${userLevel}</span></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>

                        </div>


                        <!-- Tab 5: أعلى نقاط XP -->
                        <div id="tabLeaderboard" class="tab-content hidden space-y-5">
                            <!-- Hero Banner -->
                            <div class="relative bg-[#091124] border border-blue-500/20 rounded-3xl p-6 overflow-hidden shadow-xl">
                                <div class="relative flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <div class="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-2xl">⚡</div>
                                        <div>
                                            <h2 class="text-base font-black text-white">لوحة الصدارة — XP</h2>
                                            <p class="text-xs text-gray-400 mt-0.5">أعلى 20 عضو بنقاط الخبرة</p>
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        <span class="text-[10px] text-gray-500 block">ترتيبك</span>
                                        <span class="text-2xl font-black text-white font-mono">#${userRankXp}</span>
                                    </div>
                                </div>
                            </div>
                            <!-- List -->
                            <div class="bg-[#091124] border border-blue-500/20 rounded-3xl overflow-hidden shadow-xl">
                                <div class="space-y-0 max-h-[520px] overflow-y-auto divide-y divide-white/5">
                                    ${xpLeaderboardHtml}
                                </div>
                            </div>
                        </div>

                        <!-- Tab 5B: أغنى الأثرياء -->
                        <div id="tabCoinsLeaderboard" class="tab-content hidden space-y-5">
                            <!-- Hero Banner -->
                            <div class="relative bg-[#091124] border border-amber-500/20 rounded-3xl p-6 overflow-hidden shadow-xl">
                                <div class="relative flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <div class="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-center text-2xl">🏆</div>
                                        <div>
                                            <h2 class="text-base font-black text-white">أغنى الأثرياء — الذهب</h2>
                                            <p class="text-xs text-amber-300/70 mt-0.5">أعلى 20 عضو برصيد الذهب</p>
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        <span class="text-[10px] text-gray-500 block">ترتيبك</span>
                                        <span class="text-2xl font-black text-amber-300 font-mono">#${userRankCoins}</span>
                                    </div>
                                </div>
                            </div>
                            <!-- List -->
                            <div class="bg-[#091124] border border-blue-500/20 rounded-3xl overflow-hidden shadow-xl">
                                <div class="space-y-0 max-h-[520px] overflow-y-auto divide-y divide-white/5">
                                    ${coinsLeaderboardHtml}
                                </div>
                            </div>
                        </div>

                        <!-- Tab 6: الراتب اليومي -->
                        <div id="tabDaily" class="tab-content hidden space-y-5">
                            <!-- Hero Card -->
                            <div class="relative bg-[#091124] border border-blue-500/20 rounded-3xl p-8 overflow-hidden shadow-xl text-center">
                                <div class="relative space-y-5">
                                    <!-- Icon -->
                                    <div class="w-20 h-20 rounded-3xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-4xl mx-auto">🎁</div>
                                    <!-- Title -->
                                    <div>
                                        <h2 class="text-xl font-black text-white">الراتب اليومي</h2>
                                        <p class="text-gray-400 text-xs mt-1.5 leading-relaxed">استلم مكافأتك مجاناً كل 24 ساعة!</p>
                                    </div>
                                    <!-- Stats Row -->
                                    <div class="grid grid-cols-3 gap-3 text-center">
                                        <div class="bg-black/30 rounded-2xl py-3 border border-blue-500/20">
                                            <span class="text-amber-400 font-black font-mono text-base block">+500</span>
                                            <span class="text-[10px] text-gray-500">الحد الأدنى 🪙</span>
                                        </div>
                                        <div class="bg-black/30 rounded-2xl py-3 border border-blue-500/20">
                                            <span class="text-amber-300 font-black font-mono text-base block">+1000</span>
                                            <span class="text-[10px] text-gray-500">الحد الأقصى 🪙</span>
                                        </div>
                                        <div class="bg-black/30 rounded-2xl py-3 border border-blue-500/20">
                                            <span class="text-white font-black text-base block">24س</span>
                                            <span class="text-[10px] text-gray-500">كل يوم ⏰</span>
                                        </div>
                                    </div>
                                    <!-- رصيدك الحالي -->
                                    <div class="bg-[#091124] border border-blue-500/20 rounded-2xl px-5 py-3 flex items-center justify-between">
                                        <span class="text-amber-400 font-black font-mono text-lg" id="userCoinsDisplay">${userCoins.toLocaleString()}</span>
                                        <div class="flex items-center gap-2">
                                            <span class="text-xs text-white">رصيدك الحالي</span>
                                            <span class="text-lg">🪙</span>
                                        </div>
                                    </div>
                                    <!-- Action Button -->
                                    <div id="dailyActionBox" class="space-y-3">
                                        ${dailyActionBoxHtml}
                                    </div>
                                </div>
                            </div>

                            <!-- Vote Card -->
                            <div class="relative bg-[#091124] border border-blue-500/20 rounded-3xl p-6 overflow-hidden shadow-xl text-center">
                                <div class="relative space-y-4">
                                    <div class="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-2xl mx-auto">🗳️</div>
                                    <div>
                                        <h3 class="text-base font-black text-white">صوّت للبوت على Top.gg</h3>
                                        <p class="text-gray-400 text-xs mt-1.5 leading-relaxed">صوّتك يساعد البوت على الانتشار! يمكنك التصويت كل <span class="text-white font-bold">12 ساعة</span></p>
                                    </div>
                                    <a href="https://top.gg/ar/bot/${client?.user?.id || config.clientId}/vote" target="_blank"
                                       class="inline-flex items-center gap-2 px-7 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-2xl text-sm font-black transition-all">
                                        🗳️ صوّت الآن
                                    </a>
                                </div>
                            </div>
                        </div>

                    </main>

                    <!-- Sidebar Right (Novax User Dashboard Menu with Exact Categories) -->
                    <aside class="w-72 bg-[#060b16] border-l border-blue-500/20 flex flex-col shrink-0 h-full select-none">
                        
                        <!-- Top Server Management Switcher Card (Novax Style) -->
                        <div class="p-3">
                            <a href="#servers" onclick="switchTab('tabOverview')" class="bg-[#0b1322] hover:bg-[#121e38] border border-blue-500/20 rounded-2xl p-3 flex items-center justify-between shadow-lg transition group">
                                <div class="text-white text-xs">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/></svg>
                                </div>
                                <div class="flex items-center gap-2.5">
                                    <span class="font-bold text-white text-xs">Manage Server</span>
                                    <div class="w-8 h-8 rounded-xl bg-blue-400/20 text-blue-400 flex items-center justify-center text-sm border border-blue-500/20">
                                        🗂️
                                    </div>
                                </div>
                            </a>
                        </div>

                        <!-- Categorized Scrollable Nav Menu -->
                        <div class="flex-1 overflow-y-auto px-3 py-2 space-y-4 text-xs text-right custom-scrollbar">

                            <!-- عام -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('user_grp_general')" class="w-full flex items-center justify-between text-white hover:text-gray-300 px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_user_grp_general" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>عام</span></span>
                                </button>
                                <div id="user_grp_general" class="space-y-1">
                                    <button onclick="switchTab('tabOverview', this)" class="nav-btn px-3 py-2 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#2563eb] text-white font-black flex items-center justify-between shadow-md shadow-[#c084fc]/20 w-full transition">
                                        <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
                                        <span class="flex items-center gap-2"><span>نظرة عامة</span><span class="text-white">🎛️</span></span>
                                    </button>
                                </div>
                            </div>


                            <!-- لوحة المتصدرين (Leaderboards) -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('user_grp_leaderboard')" class="w-full flex items-center justify-between text-white hover:text-gray-300 px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_user_grp_leaderboard" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>لوحة المتصدرين</span></span>
                                </button>
                                <div id="user_grp_leaderboard" class="space-y-1">
                                    <button onclick="switchTab('tabCoinsLeaderboard', this)" class="nav-btn px-3 py-2 rounded-xl text-gray-300 hover:text-gray-300 hover:bg-[#151724] font-medium flex items-center justify-between transition w-full">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>أغنى الأثرياء</span><span class="text-white">🪙</span></span>
                                    </button>
                                    <button onclick="switchTab('tabLeaderboard', this)" class="nav-btn px-3 py-2 rounded-xl text-gray-300 hover:text-gray-300 hover:bg-[#151724] font-medium flex items-center justify-between transition w-full">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span class="text-white">🏆</span><span>Top Rep & XP</span></span>
                                    </button>
                                </div>
                            </div>


                            <!-- أخرى (Other) -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('user_grp_other')" class="w-full flex items-center justify-between text-white hover:text-gray-300 px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_user_grp_other" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>أخرى</span></span>
                                </button>
                                <div id="user_grp_other" class="space-y-1">
                                    <button onclick="switchTab('tabDaily', this)" class="nav-btn px-3 py-2 rounded-xl text-gray-300 hover:text-gray-300 hover:bg-[#151724] font-medium flex items-center justify-between transition w-full">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>الراتب اليومي</span><span class="text-white">🎁</span></span>
                                    </button>
                                    <a href="https://top.gg/ar/bot/${client?.user?.id || config.clientId}/vote" target="_blank" class="flex items-center justify-between px-3 py-2 rounded-xl text-blue-400 hover:text-white hover:bg-blue-800/20 font-medium transition w-full">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"/></svg>
                                        <span class="flex items-center gap-2"><span>صوّت للبوت</span><span>🗳️</span></span>
                                    </a>
                                    <a href="/logout" class="flex items-center justify-between px-3 py-2 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 font-medium transition w-full">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                                        <span class="flex items-center gap-2"><span>تسجيل الخروج</span><span>🚪</span></span>
                                    </a>
                                </div>
                            </div>

                        </div>

                        <!-- User Profile Bottom Bar (Novax Exact Style) -->
                        <div class="p-3 border-t border-blue-500/20">
                            <div class="bg-gradient-to-r from-blue-500 to-indigo-700 rounded-2xl p-2.5 flex items-center justify-between shadow-lg shadow-blue-800/40">
                                <div class="text-white/80 hover:text-gray-300 cursor-pointer px-1">
                                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z"/></svg>
                                </div>
                                <div class="flex items-center gap-2.5">
                                    <div class="text-right">
                                        <span class="text-xs font-black text-white block leading-tight truncate max-w-[110px]">${user.username}</span>
                                    </div>
                                    <img src="${userAvatar}" class="w-8 h-8 rounded-xl object-cover ring-2 ring-blue-300/20 shadow-md">
                                </div>
                            </div>
                        </div>

                    </aside>

                    <!-- Server Rail (Far Right Column - Novax Style) -->
                    <div class="w-18 bg-[#040810] border-l border-blue-500/20 py-4 px-2 flex flex-col items-center gap-3 shrink-0 overflow-y-auto select-none">
                        <!-- Home Icon Button -->
                        <a href="/dashboard" title="الصفحة الرئيسية" class="w-12 h-12 rounded-2xl bg-blue-400/30 border border-blue-400/50 flex items-center justify-center text-white hover:text-gray-300 transition shadow-lg mb-1 group">
                            <svg class="w-6 h-6 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                        </a>
                        <div class="w-8 h-[1px] bg-white/5"></div>
                        ${serverRailHtml}
                    </div>

                </div>

                <script>
                function toggleNavGroup(groupId) {
                    const el = document.getElementById(groupId);
                    const arrow = document.getElementById('arrow_' + groupId);
                    if (!el) return;
                    el.classList.toggle('hidden');
                    if (arrow) arrow.classList.toggle('rotate-180');
                }
                </script>
            </body>
            </html>
            `;
            // ✅ حفظ الصفحة في cache وإرسالها
            _pageCache.set(user.id, { html: _pageHtml, ts: Date.now() });
            console.log(`[DASH] ✅ RENDER DONE for ${user.id} — TOTAL: ${Date.now()-_t0}ms`);
            res.send(_pageHtml);
        } catch (e) {
            console.error("Dashboard render error:", e);
            res.status(500).send("Internal error: " + e.message);
        }
    });

    // 4. Guild Dashboard & Sub-pages (وصول محمي بصلاحيات ديسكورد)
    app.get('/dashboard/:guildId/:section?', async (req, res) => {
        try {
            const guildId = req.params.guildId;
            const section = req.params.section || 'overview';
            
            // التحقق من تسجيل الدخول
            const user = req.session?.user;
            if (!user) {
                return res.redirect('/auth/discord');
            }

            // التحقق من وجود البوت في هذا السيرفر وجلب أحدث بيانات (بما فيها البوستات والأعضاء)
            let botGuild = client?.guilds?.cache?.get(guildId);
            if (!botGuild) {
                try {
                    botGuild = await client?.guilds?.fetch(guildId);
                } catch(e) {}
            } else {
                // جلب أحدث بيانات السيرفر لتحديث عداد البوستات في حال تغير
                try {
                    await botGuild.fetch().catch(() => {});
                } catch(e) {}
            }
            if (!botGuild) {
                return res.status(404).send(`
                    <div style="background:#070d1d;color:#ffffff;font-family:sans-serif;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
                        <h2>Bot not in this server</h2>
                        <a href="/dashboard/manage" style="color:#93c5fd;margin-top:10px;">Back to Dashboard</a>
                    </div>
                `);
            }

            // التحقق من امتلاك المستخدم لصلاحية إدارة في هذا السيرفر
            const sessionGuilds = req.session?.guilds || [];
            const userCanManage = sessionGuilds.some(g => g.id === guildId);
            if (!userCanManage) {
                return res.status(403).send(`
                    <div style="background:#070d1d;color:#ffffff;font-family:sans-serif;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
                        <h2>You don't have admin permissions in this server</h2>
                        <p style="color:#888;">You must be the server owner or have Manage Server / Administrator permissions</p>
                        <a href="/dashboard/manage" style="color:#93c5fd;margin-top:10px;">Back to Manageable Servers</a>
                    </div>
                `);
            }

            const guilds = sessionGuilds;
            let guild = { id: botGuild.id, name: botGuild.name, icon: botGuild.icon };

            let settings = {};
            try {
                settings = database.getGuildSettings ? database.getGuildSettings(guildId) : {};
            } catch (err) {}
            if (!settings) settings = {};

            let whitelistUsers = [];
            let antimodUsers = [];
            let securityLogsList = [];
            let warnPunishmentsList = [];
            let autoRespondersList = [];
            let guildTicketsList = [];
            try {
                if (database.getGuildTickets) {
                    guildTicketsList = database.getGuildTickets(guildId, 100) || [];
                }
            } catch (e) {}
            let guildGiveawaysList = [];
            let guildSuggestionsList = [];
            try {
                if (database.getGuildSuggestions) {
                    guildSuggestionsList = database.getGuildSuggestions(guildId, req.query?.status || null) || [];
                }
            } catch(e) {}
            try {
                if (database.getGuildGiveaways) {
                    guildGiveawaysList = database.getGuildGiveaways(guildId) || [];
                }
            } catch(e) {}
            let levelRewardsList = [];
            let guildLeaderboardUsers = [];
            const currentTab = req.query?.tab || 'settings';
            try {
                if (database.getLeaderboard) {
                    guildLeaderboardUsers = database.getLeaderboard(guildId, 20) || [];
                }
            } catch(e) {}
            try {
                if (database.getLevelRewards) {
                    levelRewardsList = database.getLevelRewards(guildId) || [];
                }
            } catch (err) {}
            try {
                if (database.getAutoResponders) {
                    autoRespondersList = database.getAutoResponders(guildId) || [];
                }
            } catch (err) {}
            try {
                if (database.getWarnPunishments) {
                    warnPunishmentsList = database.getWarnPunishments(guildId) || [];
                }
            } catch (err) {}
            try {
                if (database.getProtectionWhitelist) {
                    whitelistUsers = database.getProtectionWhitelist(guildId, 'whitelist') || [];
                    antimodUsers = database.getProtectionWhitelist(guildId, 'antimod') || [];
                }
                if (database.getSecurityLogs) {
                    securityLogsList = database.getSecurityLogs(guildId, null, 50) || [];
                }
            } catch (err) {}

            const userAvatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
            const botAvatarUrl = client?.user?.avatar ? `https://cdn.discordapp.com/avatars/${client.user.id}/${client.user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
            const guildIcon = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';

            const serverRailHtml = guilds.map(g => `
                <a href="/dashboard/${g.id}" title="${g.name}" class="group relative flex items-center justify-center">
                    <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
                         class="w-11 h-11 rounded-2xl ${g.id === guildId ? 'border-2 border-blue-400 shadow-lg shadow-blue-700/50 p-0.5 ring-2 ring-blue-400/30' : 'border border-transparent hover:border-blue-500/20'} hover:rounded-xl object-cover transition-all shadow-md">
                </a>
            `).join('');

            const sectionTitles = {
                'overview': 'Server Overview 📊',
                'analytics': 'Analytics & Stats 📊',
                'stats': 'Analytics & Stats 📊',
                'appearance': 'Bot Appearance & Customization 🎨',
                'settings': 'General Server Settings ⚙️',
                'general': 'All Commands & Services ⌨️',
                'commands': 'Comprehensive Commands Center ⌨️',
                'moderation': 'Moderation & Members Management 🔨',
                'automod': 'AutoMod Rules & Chat Filters 🤖',
                'welcome': 'Welcome & Leave Messages 👋',
                'autoresponder': 'Auto Responder on Words 💬',
                'tickets': 'Ticket & Support System 🎫',
                'protection': 'Comprehensive Shield & Anti-Nuke 🛡️',
                'whitelist': 'Security / Whitelist ⚪',
                'protection-logs': 'Security / Logs 📋',
                'antiraid': 'Anti-Raid & Fake Accounts 🚨',
                'staff-activity': 'Staff & Moderator Activity Tracking 👮',
                'tempvoice': 'Temp Voice Channels 🕒',
                'boost': 'Server Boost Notifications 💎',
                'colors': 'Advanced Color Roles System 🎨',
                'logs': 'Comprehensive Server Logs 📜',
                'levels': 'Levels & XP System 🏆',
                'autoroles': 'Auto Roles on Join 🎖️',
                'giveaways': 'Giveaways System 🎁',
                'suggestions': 'Suggestions & Feedback System 💡',
                'invites': 'Advanced Invite Tracker 🔗',
                'broadcast': 'Broadcast System 📢',
                'embed': 'Advanced Embed Builder 📄',
                'applications': 'Staff Applications System 📝',
                'help': 'Full Commands List 📚',
                'staff_system': 'نظام الإدارة والترقيات التلقائية 👮',
                'custom_shop': 'متجر السيرفر والرتب والرومات 🛒',
            };

            let title = sectionTitles[section] || 'لوحة الإعدادات ⚙️';

            const guildTextChannels = botGuild ? Array.from(botGuild.channels.cache.values()).filter(c => c.type === 0 || c.type === 5) : [];
            const guildVoiceChannels = botGuild ? Array.from(botGuild.channels.cache.values()).filter(c => c.type === 2) : [];
            const guildRoles = botGuild ? Array.from(botGuild.roles.cache.values()).filter(r => r.name !== '@everyone') : [];

            function renderChannelSelect(inputName, selectedId, isMulti = false) {
                return `
                    <select name="${inputName}" id="${inputName}" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer">
                        <option value="">...اختر القناة</option>
                        ${guildTextChannels.map(c => `<option value="${c.id}" ${String(selectedId).includes(String(c.id)) ? 'selected' : ''}># ${c.name}</option>`).join('')}
                    </select>
                `;
            }

            function renderRoleSelect(inputName, selectedId) {
                return `
                    <select name="${inputName}" id="${inputName}" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer">
                        <option value="">...اختر الرتبة</option>
                        ${guildRoles.map(r => `<option value="${r.id}" ${String(selectedId) === String(r.id) ? 'selected' : ''}>@ ${r.name}</option>`).join('')}
                    </select>
                `;
            }

            let formFieldsHtml = '';
            let embedScriptHtml = '';

            if (section === 'overview') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Server Overview Hero Banner -->
                        <div class="bg-[#091124] border border-blue-500/20 p-6 rounded-3xl shadow-xl relative overflow-hidden">
                            <div class="relative flex items-center justify-between">
                                <div class="flex items-center gap-4">
                                    <div class="text-right">
                                        <h2 class="text-2xl font-black text-white">${guild.name || "Droplet'BOT"}</h2>
                                        <p class="text-white/80 text-xs font-mono mt-0.5">ID: ${guildId}</p>
                                        <div class="flex items-center gap-1.5 mt-2 justify-end">
                                            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                            <span class="text-xs text-emerald-300 font-bold">البوت متصل ويعمل</span>
                                        </div>
                                    </div>
                                    <img src="${guild.icon ? `https://cdn.discordapp.com/icons/${guildId}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="w-20 h-20 rounded-3xl ring-4 ring-blue-400/40 shadow-xl object-cover">
                                </div>
                                <div class="text-left">
                                    <div class="text-5xl font-black text-white/10 select-none">🏰</div>
                                </div>
                            </div>
                        </div>

                        <!-- Real-Time Stats Grid (4 Counters) -->
                        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl shadow-xl text-right hover:border-blue-500/20 transition group">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-blue-400/20 border border-blue-500/20 text-blue-400 flex items-center justify-center text-sm">👥</div>
                                    <span class="text-[10px] text-gray-500 font-mono">MEMBERS</span>
                                </div>
                                <div class="text-2xl font-black text-white">${(botGuild?.memberCount || 0).toLocaleString()}</div>
                                <p class="text-xs text-white mt-1 font-bold">إجمالي الأعضاء</p>
                            </div>
                            <div class="bg-[#0b1322] border border-emerald-500/20 p-5 rounded-2xl shadow-xl text-right hover:border-emerald-500/40 transition group">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-sm">🟢</div>
                                    <span class="text-[10px] text-gray-500 font-mono">ONLINE</span>
                                </div>
                                <div class="text-2xl font-black text-white" id="onlineMembersCount">…</div>
                                <p class="text-xs text-white mt-1 font-bold">الأعضاء المتصلون</p>
                            </div>
                            <div class="bg-[#0b1322] border border-indigo-500/20 p-5 rounded-2xl shadow-xl text-right hover:border-indigo-500/40 transition group">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center text-sm">📁</div>
                                    <span class="text-[10px] text-gray-500 font-mono">CHANNELS</span>
                                </div>
                                <div class="text-2xl font-black text-white">${(botGuild?.channels?.cache?.size || 0)}</div>
                                <p class="text-xs text-white mt-1 font-bold">إجمالي القنوات</p>
                            </div>
                            <div class="bg-[#0b1322] border border-amber-500/20 p-5 rounded-2xl shadow-xl text-right hover:border-amber-500/40 transition group">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-amber-600/20 border border-amber-500/30 text-amber-400 flex items-center justify-center text-sm">💎</div>
                                    <span class="text-[10px] text-gray-500 font-mono">BOOSTS</span>
                                </div>
                                <div class="text-2xl font-black text-white">${(botGuild?.premiumSubscriptionCount || 0)}</div>
                                <p class="text-xs text-white mt-1 font-bold">بوستات السيرفر</p>
                            </div>
                        </div>

                        <!-- Second Row Stats -->
                        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl shadow-xl text-right hover:border-blue-500/20 transition">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-pink-600/20 border border-pink-500/30 text-pink-400 flex items-center justify-center text-sm">🎖️</div>
                                    <span class="text-[10px] text-gray-500 font-mono">ROLES</span>
                                </div>
                                <div class="text-2xl font-black text-white">${(botGuild?.roles?.cache?.size || 0)}</div>
                                <p class="text-xs text-white mt-1 font-bold">إجمالي الرتب</p>
                            </div>
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl shadow-xl text-right hover:border-blue-500/20 transition">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/20 text-blue-400 flex items-center justify-center text-sm">😃</div>
                                    <span class="text-[10px] text-gray-500 font-mono">EMOJIS</span>
                                </div>
                                <div class="text-2xl font-black text-white">${(botGuild?.emojis?.cache?.size || 0)}</div>
                                <p class="text-xs text-white mt-1 font-bold">الإيموجيات المخصصة</p>
                            </div>
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl shadow-xl text-right hover:border-blue-500/20 transition">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 flex items-center justify-center text-sm">🤖</div>
                                    <span class="text-[10px] text-gray-500 font-mono">BOTS</span>
                                </div>
                                <div class="text-2xl font-black text-white" id="botsCount">…</div>
                                <p class="text-xs text-white mt-1 font-bold">عدد البوتات</p>
                            </div>
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl shadow-xl text-right hover:border-blue-500/20 transition">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="w-8 h-8 rounded-xl bg-blue-400/20 border border-blue-500/20 text-blue-400 flex items-center justify-center text-sm">🎁</div>
                                    <span class="text-[10px] text-gray-500 font-mono">GIVEAWAYS</span>
                                </div>
                                <div class="text-2xl font-black text-white" id="giveawaysCount">${guildGiveawaysList?.length || 0}</div>
                                <p class="text-xs text-white mt-1 font-bold">إجمالي القيف اوايز</p>
                            </div>
                        </div>

                        <!-- Server Info & Boost Level -->
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <!-- Server Details -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl shadow-xl space-y-3 text-right">
                                <h4 class="font-black text-white text-sm flex items-center justify-end gap-2"><span>🏰</span><span>Server Information</span></h4>
                                <div class="space-y-2.5 text-xs text-white">
                                    <div class="flex items-center justify-between bg-[#070d1d] p-3 rounded-xl border border-blue-500/20">
                                        <span class="text-white font-bold font-mono">${new Date((parseInt(guildId) / 4194304 + 1420070400000)).toLocaleDateString(dashDateLocale(req, 'ar-IQ'), {year:'numeric',month:'long',day:'numeric'})}</span>
                                        <span>Server Creation Date</span>
                                    </div>
                                    <div class="flex items-center justify-between bg-[#070d1d] p-3 rounded-xl border border-blue-500/20">
                                        <span class="text-white font-bold">مستوى ${botGuild?.premiumTier || 0}</span>
                                        <span>مستوى البوست</span>
                                    </div>
                                    <div class="flex items-center justify-between bg-[#070d1d] p-3 rounded-xl border border-blue-500/20">
                                        <span class="text-white font-bold font-mono">${botGuild?.vanityURLCode ? `discord.gg/${botGuild.vanityURLCode}` : '—'}</span>
                                        <span>Vanity URL</span>
                                    </div>
                                    <div class="flex items-center justify-between bg-[#070d1d] p-3 rounded-xl border border-blue-500/20">
                                        <span class="text-white font-bold">${botGuild?.verificationLevel === 0 ? 'لا يوجد' : botGuild?.verificationLevel === 1 ? 'منخفض' : botGuild?.verificationLevel === 2 ? 'متوسط' : botGuild?.verificationLevel === 3 ? 'عالي' : 'عالي جداً'}</span>
                                        <span>مستوى التحقق</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Quick Actions -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl shadow-xl space-y-3 text-right">
                                <h4 class="font-black text-white text-sm flex items-center justify-end gap-2"><span>الإجراءات السريعة</span><span>⚡</span></h4>
                                <div class="space-y-2">
                                    <a href="/dashboard/${guildId}/commands" class="flex items-center justify-between bg-[#060c1d] hover:bg-[#c084fc]/10 border border-[#c084fc]/20 hover:border-[#c084fc]/50 p-3.5 rounded-xl transition group shadow-sm">
                                        <span class="text-[#c084fc] text-xs group-hover:translate-x-[-3px] transition-transform">←</span>
                                        <div class="flex items-center gap-2 text-right">
                                            <span class="text-xs font-bold text-white group-hover:text-[#c084fc] transition">إدارة الأوامر</span>
                                            <span class="text-sm">🎛️</span>
                                        </div>
                                    </a>
                                    <a href="/dashboard/${guildId}/moderation" class="flex items-center justify-between bg-[#060c1d] hover:bg-[#c084fc]/10 border border-[#c084fc]/20 hover:border-[#c084fc]/50 p-3.5 rounded-xl transition group shadow-sm">
                                        <span class="text-[#c084fc] text-xs group-hover:translate-x-[-3px] transition-transform">←</span>
                                        <div class="flex items-center gap-2 text-right">
                                            <span class="text-xs font-bold text-white group-hover:text-[#c084fc] transition">إعدادات الإشراف</span>
                                            <span class="text-sm">🔨</span>
                                        </div>
                                    </a>
                                    <a href="/dashboard/${guildId}/protection" class="flex items-center justify-between bg-[#060c1d] hover:bg-[#c084fc]/10 border border-[#c084fc]/20 hover:border-[#c084fc]/50 p-3.5 rounded-xl transition group shadow-sm">
                                        <span class="text-[#c084fc] text-xs group-hover:translate-x-[-3px] transition-transform">←</span>
                                        <div class="flex items-center gap-2 text-right">
                                            <span class="text-xs font-bold text-white group-hover:text-[#c084fc] transition">نظام الحماية</span>
                                            <span class="text-sm">🛡️</span>
                                        </div>
                                    </a>
                                    <a href="/dashboard/${guildId}/analytics" class="flex items-center justify-between bg-[#060c1d] hover:bg-[#c084fc]/10 border border-[#c084fc]/20 hover:border-[#c084fc]/50 p-3.5 rounded-xl transition group shadow-sm">
                                        <span class="text-[#c084fc] text-xs group-hover:translate-x-[-3px] transition-transform">←</span>
                                        <div class="flex items-center gap-2 text-right">
                                            <span class="text-xs font-bold text-white group-hover:text-[#c084fc] transition">الإحصائيات والتحليلات</span>
                                            <span class="text-sm">📊</span>
                                        </div>
                                    </a>
                                    <a href="/dashboard/${guildId}/stat-channels" class="flex items-center justify-between bg-[#060c1d] hover:bg-[#c084fc]/10 border border-[#c084fc]/20 hover:border-[#c084fc]/50 p-3.5 rounded-xl transition group shadow-sm">
                                        <span class="text-[9px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded">جديد</span>
                                        <span class="flex items-center gap-2"><span>قنوات الإحصائيات</span><span class="text-white group-hover:text-[#c084fc]">📈</span></span>
                                    </a>
                                </div>
                            </div>
                        </div>

                        <!-- Top Members & Leaderboard Preview -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl shadow-xl text-right">
                            <div class="flex items-center justify-between mb-4">
                                <a href="/dashboard/${guildId}/analytics" class="text-xs text-blue-400 hover:text-white font-bold transition">عرض الكل ←</a>
                                <h4 class="font-black text-white text-sm flex items-center gap-2"><span>أكثر الأعضاء نشاطاً</span><span>🏆</span></h4>
                            </div>
                            <div class="space-y-2">
                                ${guildLeaderboardUsers.slice(0, 5).map((u, i) => {
                                    const uName = u.display_name || u.username || `عضو #${String(u.user_id).slice(-4)}`;
                                    const uTag = u.username && u.username !== uName ? `@${u.username}` : `ID: ${u.user_id}`;
                                    const uAvatar = u.avatar_url || (u.avatar ? `https://cdn.discordapp.com/avatars/${u.user_id}/${u.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png');
                                    const badgeClass = i === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                                                       i === 1 ? 'bg-gray-400/20 text-blue-200 border border-gray-400/30' :
                                                       i === 2 ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20' :
                                                                 'bg-blue-400/20 text-blue-400 border border-blue-500/20';
                                    return `
                                    <div class="flex items-center justify-between bg-[#070d1d] border border-blue-500/20 p-3 rounded-xl hover:border-blue-500/20 transition group">
                                        <div class="text-left">
                                            <span class="text-xs font-mono font-black text-blue-400">⚡ ${Number(u.total_xp || 0).toLocaleString()} XP</span>
                                            <span class="text-[10px] text-gray-500 block font-mono">Level: ${u.level || 1}</span>
                                        </div>
                                        <div class="flex items-center gap-3">
                                            <div class="text-right">
                                                <span class="text-xs text-white font-bold block group-hover:text-white transition truncate max-w-[130px]">${uName}</span>
                                                <span class="text-[10px] text-white font-mono block">${uTag}</span>
                                            </div>
                                            <img src="${uAvatar}" alt="${uName}" class="w-8 h-8 rounded-xl object-cover ring-2 ring-blue-300/10 group-hover:ring-blue-400/50 transition shrink-0" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                                            <span class="w-6 h-6 rounded-lg ${badgeClass} text-[10px] font-black flex items-center justify-center shrink-0">#${i+1}</span>
                                        </div>
                                    </div>
                                    `;
                                }).join('')}
                                ${guildLeaderboardUsers.length === 0 ? '<p class="text-xs text-gray-500 text-center py-4">لا توجد بيانات نشاط حتى الآن</p>' : ''}
                            </div>
                        </div>

                    </div>

<script>
(function() {
    var guildId = '${guildId}';
    function fetchStats() {
        fetch('/api/guild/' + guildId + '/online-count')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (!data.success) return;
                var elOnline = document.getElementById('onlineMembersCount');
                if (elOnline) elOnline.textContent = (data.online || 0).toLocaleString();
                var elBots = document.getElementById('botsCount');
                if (elBots) elBots.textContent = (data.bots || 0).toLocaleString();
                var elGw = document.getElementById('giveawaysCount');
                if (elGw) elGw.textContent = (data.giveaways || 0).toLocaleString();
            })
            .catch(function() {
                var elOnline = document.getElementById('onlineMembersCount');
                if (elOnline && elOnline.textContent === '\u2026') elOnline.textContent = '0';
                var elBots = document.getElementById('botsCount');
                if (elBots && elBots.textContent === '\u2026') elBots.textContent = '0';
            });
    }
    fetchStats();
    setInterval(fetchStats, 30000);
})();
</script>
`;
            } else if (section === 'general' || section === 'commands') {
              formFieldsHtml = `<div id="cmdsMgmtRoot" data-droplet-manual-lang="true" class="space-y-6 text-right" dir="rtl" style="margin-top:0">

    <!-- Header Card -->
    <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl flex items-center justify-between shadow-xl">
        <div class="flex items-center gap-6">
            <div class="text-center">
                <span id="customAliasesCount" class="text-xl font-black text-blue-400 font-mono">0</span>
                <span class="text-[10px] text-white block font-bold">اختصارات مخصصة</span>
            </div>
            <div class="text-center">
                <span id="enabledCmdsCount" class="text-xl font-black text-emerald-400 font-mono">98</span>
                <span class="text-[10px] text-white block font-bold">الأوامر المفعلة</span>
            </div>
            <div class="text-center">
                <span id="totalCmdsCount" class="text-xl font-black text-white font-mono">98</span>
                <span class="text-[10px] text-white block font-bold">إجمالي الأوامر</span>
            </div>
        </div>
        <div class="flex items-center gap-3">
            <div class="text-right">
                <h4 class="font-black text-white text-base">إدارة الأوامر</h4>
                <p class="text-white text-xs mt-0.5">تخصيص وإدارة جميع أوامر البوت والصلاحيات</p>
            </div>
            <div class="w-10 h-10 rounded-xl bg-blue-400/20 text-blue-400 flex items-center justify-center text-lg border border-blue-500/20">🎛️</div>
        </div>
    </div>

    <!-- Search & Filter Bar -->
    <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-1.5 bg-[#0b1322] border border-blue-500/20 p-1 rounded-xl">
            <button type="button" id="btnFilterDisabled" onclick="window.filterCmdStatus('disabled')" class="px-3 py-1 rounded-lg text-xs font-bold text-white hover:text-gray-300 transition cursor-pointer">معطل</button>
            <button type="button" id="btnFilterEnabled" onclick="window.filterCmdStatus('enabled')" class="px-3 py-1 rounded-lg text-xs font-bold text-white hover:text-gray-300 transition cursor-pointer">مفعل</button>
            <button type="button" id="btnFilterAll" onclick="window.filterCmdStatus('all')" class="px-3 py-1 rounded-lg text-xs font-bold bg-gradient-to-l from-purple-600 to-blue-500 text-white transition shadow cursor-pointer">الكل</button>
        </div>
        <div class="flex-1 relative">
            <input type="text" id="cmdSearchInput" placeholder="...ابحث عن أمر" oninput="window.searchCommands()" class="w-full bg-[#0b1322] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right pr-10">
            <span class="absolute right-3 top-2.5 text-white">🔍</span>
        </div>
    </div>

    <!-- Main Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">

        <!-- Sidebar: Categories -->
        <div class="lg:col-span-1 space-y-1.5 bg-[#0b1322] border border-blue-500/20 p-3 rounded-2xl shadow-xl h-fit max-h-[750px] overflow-y-auto">
            <div class="flex items-center justify-end gap-1.5 text-xs font-black text-white px-2 py-1.5 border-b border-blue-500/20 mb-1 sticky top-0 bg-[#0b1322] z-10">
                <span>الأقسام والأنظمة</span><span>📁</span>
            </div>
            <button type="button" id="btnCatAll" onclick="window.switchCmdCategory('all')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-l from-purple-600 to-blue-500 text-white shadow-lg transition cursor-pointer">
                <span id="badgeCatAll" class="px-2 py-0.5 bg-white/20 text-white rounded-lg text-[10px] font-mono">98/98</span>
                <span class="flex items-center gap-1.5"><span>جميع الأوامر</span><span>🌐</span></span>
            </button>
            <button type="button" id="btnCatGeneral" onclick="window.switchCmdCategory('general')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white hover:text-gray-300 hover:bg-white/5 transition cursor-pointer">
                <span id="badgeCatGeneral" class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">20/20</span>
                <span class="flex items-center gap-1.5"><span>الأوامر العامة</span><span>⚙️</span></span>
            </button>
            <button type="button" id="btnCatModeration" onclick="window.switchCmdCategory('moderation')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white hover:text-gray-300 hover:bg-white/5 transition cursor-pointer">
                <span id="badgeCatModeration" class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">17/17</span>
                <span class="flex items-center gap-1.5"><span>الإشراف والعقوبات</span><span>🔨</span></span>
            </button>
            <button type="button" id="btnCatProtection" onclick="window.switchCmdCategory('protection')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white hover:text-gray-300 hover:bg-white/5 transition cursor-pointer">
                <span id="badgeCatProtection" class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">6/6</span>
                <span class="flex items-center gap-1.5"><span>الحماية والأمان</span><span>🛡️</span></span>
            </button>
            <button type="button" id="btnCatWelcome" onclick="window.switchCmdCategory('welcome')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white hover:text-gray-300 hover:bg-white/5 transition cursor-pointer">
                <span id="badgeCatWelcome" class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">1/1</span>
                <span class="flex items-center gap-1.5"><span>الترحيب والمغادرة</span><span>👋</span></span>
            </button>
            <button type="button" id="btnCatAutoresponder" onclick="window.switchCmdCategory('autoresponder')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white hover:text-gray-300 hover:bg-white/5 transition cursor-pointer">
                <span id="badgeCatAutoresponder" class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">4/4</span>
                <span class="flex items-center gap-1.5"><span>الرد التلقائي</span><span>💬</span></span>
            </button>
            <button type="button" id="btnCatTickets" onclick="window.switchCmdCategory('tickets')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white hover:text-gray-300 hover:bg-white/5 transition cursor-pointer">
                <span id="badgeCatTickets" class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">10/10</span>
                <span class="flex items-center gap-1.5"><span>نظام التذاكر</span><span>🎫</span></span>
            </button>
            <button type="button" id="btnCatLevels" onclick="window.switchCmdCategory('levels')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white hover:text-gray-300 hover:bg-white/5 transition cursor-pointer">
                <span id="badgeCatLevels" class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">4/4</span>
                <span class="flex items-center gap-1.5"><span>المستويات & XP</span><span>🏆</span></span>
            </button>
            <button type="button" id="btnCatEconomy" onclick="window.switchCmdCategory('economy')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white hover:text-gray-300 hover:bg-white/5 transition cursor-pointer">
                <span id="badgeCatEconomy" class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">9/9</span>
                <span class="flex items-center gap-1.5"><span>الاقتصاد والمال</span><span>🪙</span></span>
            </button>
            <button type="button" id="btnCatAutoroles" onclick="window.switchCmdCategory('autoroles')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white hover:text-gray-300 hover:bg-white/5 transition cursor-pointer">
                <span id="badgeCatAutoroles" class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">4/4</span>
                <span class="flex items-center gap-1.5"><span>الرتب التلقائية</span><span>🎖️</span></span>
            </button>
            <button type="button" id="btnCatGiveaways" onclick="window.switchCmdCategory('giveaways')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white hover:text-gray-300 hover:bg-white/5 transition cursor-pointer">
                <span id="badgeCatGiveaways" class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">1/1</span>
                <span class="flex items-center gap-1.5"><span>قيف اواي</span><span>🎁</span></span>
            </button>
            <button type="button" id="btnCatInvites" onclick="window.switchCmdCategory('invites')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white hover:text-gray-300 hover:bg-white/5 transition cursor-pointer">
                <span id="badgeCatInvites" class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">1/1</span>
                <span class="flex items-center gap-1.5"><span>Invite Tracker</span><span>🔗</span></span>
            </button>
            <button type="button" id="btnCatApplications" onclick="window.switchCmdCategory('applications')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white hover:text-gray-300 hover:bg-white/5 transition cursor-pointer">
                <span id="badgeCatApplications" class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">3/3</span>
                <span class="flex items-center gap-1.5"><span>التقديمات</span><span>📝</span></span>
            </button>
            <button type="button" id="btnCatSuggestions" onclick="window.switchCmdCategory('suggestions')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white hover:text-gray-300 hover:bg-white/5 transition cursor-pointer">
                <span id="badgeCatSuggestions" class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">7/7</span>
                <span class="flex items-center gap-1.5"><span>الاقتراحات والشكاوي</span><span>💡</span></span>
            </button>
            <button type="button" id="btnCatAutomod" onclick="window.switchCmdCategory('automod')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white hover:text-gray-300 hover:bg-white/5 transition cursor-pointer">
                <span id="badgeCatAutomod" class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">1/1</span>
                <span class="flex items-center gap-1.5"><span>الرقابة التلقائية</span><span>🤖</span></span>
            </button>
            <button type="button" id="btnCatTempvoice" onclick="window.switchCmdCategory('tempvoice')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white hover:text-gray-300 hover:bg-white/5 transition cursor-pointer">
                <span id="badgeCatTempvoice" class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">1/1</span>
                <span class="flex items-center gap-1.5"><span>الرومات المؤقتة</span><span>🕒</span></span>
            </button>
            <button type="button" id="btnCatAdmin" onclick="window.switchCmdCategory('admin')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-white hover:text-gray-300 hover:bg-white/5 transition cursor-pointer">
                <span id="badgeCatAdmin" class="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono">9/9</span>
                <span class="flex items-center gap-1.5"><span>الإدارة والسجلات</span><span>⚙️</span></span>
            </button>
        </div>

        <!-- Commands Display Area -->
        <div class="lg:col-span-3 space-y-4">
            <!-- Active Category Header -->
            <div class="bg-[#0b1322] border border-blue-500/20 p-4 rounded-2xl flex items-center justify-between shadow-xl">
                <div class="flex items-center gap-2">
                    <span id="cmdSaveIndicator" class="text-xs font-bold text-emerald-400 bg-emerald-950/60 px-2 py-1 rounded-lg opacity-0 transition-opacity duration-300">✓ حُفظ</span>
                    <button type="button" onclick="window.toggleAllCategoryCmds(false)" class="px-3.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 rounded-xl text-xs font-bold transition flex items-center gap-1">
                        <span>✕</span><span>تعطيل الكل</span>
                    </button>
                    <button type="button" onclick="window.toggleAllCategoryCmds(true)" class="px-3.5 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/40 rounded-xl text-xs font-bold transition flex items-center gap-1">
                        <span>✓</span><span>تفعيل الكل</span>
                    </button>
                </div>
                <div class="flex items-center gap-3">
                    <div class="text-right">
                        <h5 id="catTitle" class="font-black text-white text-sm">جميع الأوامر والخدمات</h5>
                        <p id="catDesc" class="text-white text-[11px] mt-0.5">عرض وإدارة كافة أنظمة وأوامر البوت في مكان واحد</p>
                    </div>
                    <span id="catIcon" class="text-xl">🌐</span>
                </div>
            </div>
            <!-- Commands List -->
            <div id="cmdsListContainer" data-droplet-manual-lang="true" class="space-y-3"></div>
        </div>
    </div>
</div>

<script>
(function() {
    var DB = {
        general: { title: '\u0627\u0644\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0639\u0627\u0645\u0629', desc: '\u0627\u0644\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0623\u0633\u0627\u0633\u064a\u0629 \u0648\u0627\u0644\u062a\u0641\u0627\u0639\u0644\u064a\u0629 \u0644\u0644\u0623\u0639\u0636\u0627\u0621 \u0648\u0627\u0644\u0633\u064a\u0631\u0641\u0631', icon: '\u2699\ufe0f', items: [
            { name: '/add-autoline-channel', desc: '\u0627\u0636\u0627\u0641\u0629 \u0631\u0648\u0645 \u062e\u0637 \u062a\u0644\u0642\u0627\u0626\u064a', badge: '', icon: '\ud83d\udce2' },
            { name: '/add-nadeko-room', desc: '\u0627\u0636\u0627\u0641\u0629 \u0631\u0648\u0645 \u0644\u062a\u0641\u0639\u064a\u0644 \u062e\u0627\u0635\u064a\u0629 \u0646\u0627\u062f\u064a\u0643\u0648', badge: '', icon: '\ud83e\udd16' },
            { name: '/ai', desc: '\u0627\u0644\u062a\u062d\u062f\u062b \u0645\u0639 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a (Droplet AI)', badge: '', icon: '\ud83e\udd16' },
            { name: '/ask', desc: '\u0627\u0633\u0623\u0644 \u0630\u0643\u0627\u0621 Droplet \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a \u0623\u064a \u0633\u0624\u0627\u0644!', badge: '', icon: '\ud83e\udd16' },
            { name: '/avatar', desc: '\u0639\u0631\u0636 \u0635\u0648\u0631\u0629 \u062d\u0633\u0627\u0628\u0643 \u0623\u0648 \u062d\u0633\u0627\u0628 \u0639\u0636\u0648 \u0622\u062e\u0631', badge: '', icon: '\ud83d\uddbc\ufe0f' },
            { name: '/banner', desc: '\u0639\u0631\u0636 \u0628\u0646\u0631 \u062d\u0633\u0627\u0628\u0643 \u0623\u0648 \u062d\u0633\u0627\u0628 \u0639\u0636\u0648 \u0622\u062e\u0631', badge: '', icon: '\ud83c\udfa8' },
            { name: '/come', desc: '\u0637\u0644\u0628 \u0642\u062f\u0648\u0645 \u0639\u0636\u0648 \u0644\u0644\u0631\u0648\u0645 \u0627\u0644\u062d\u0627\u0644\u064a', badge: '', icon: '\ud83d\udc4b' },
            { name: '/copy-emoji', desc: '\u0646\u0633\u062e \u0625\u064a\u0645\u0648\u062c\u064a \u0648\u0625\u0636\u0627\u0641\u062a\u0647 \u0644\u0644\u0633\u064a\u0631\u0641\u0631', badge: '', icon: '\ud83d\ude03' },
            { name: '/embed', desc: '\u0625\u0631\u0633\u0627\u0644 \u0631\u0633\u0627\u0644\u0629 Embed \u0645\u0646\u0633\u0642\u0629', badge: '', icon: '\ud83d\udce6' },
            { name: '/help', desc: '\u0639\u0631\u0636 \u0642\u0627\u0626\u0645\u0629 \u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0628\u0648\u062a \u0627\u0644\u0643\u0627\u0645\u0644\u0629 \u0628\u0634\u0643\u0644 \u062a\u0641\u0627\u0639\u0644\u064a', badge: '', icon: '\ud83d\udcd6' },
            { name: '/line-mode', desc: '\u062a\u062d\u062f\u064a\u062f \u0646\u0645\u0637 \u0627\u0644\u062e\u0637', badge: '', icon: '\ud83d\udcdd' },
            { name: '/ping', desc: '\u0639\u0631\u0636 \u0633\u0631\u0639\u0629 \u0627\u0633\u062a\u062c\u0627\u0628\u0629 \u0627\u0644\u0628\u0648\u062a (Ping)', badge: '', icon: '\ud83d\udcf6' },
            { name: '/remove-autoline-channel', desc: '\u0627\u0632\u0627\u0644\u0629 \u0631\u0648\u0645 \u062e\u0637 \u062a\u0644\u0642\u0627\u0626\u064a', badge: '', icon: '\ud83d\udce2' },
            { name: '/remove-nadeko-room', desc: '\u0627\u0632\u0627\u0644\u0629 \u0631\u0648\u0645 \u0646\u0627\u062f\u064a\u0643\u0648', badge: '', icon: '\ud83e\udd16' },
            { name: '/roles', desc: '\u0639\u0631\u0636 \u0631\u062a\u0628 \u0627\u0644\u0633\u064a\u0631\u0641\u0631', badge: '', icon: '\ud83c\udf96\ufe0f' },
            { name: '/say', desc: '\u0627\u0631\u0633\u0627\u0644 \u0631\u0633\u0627\u0644\u0629 \u0639\u0646 \u0637\u0631\u064a\u0642 \u0627\u0644\u0628\u0648\u062a', badge: '', icon: '\ud83d\udcac' },
            { name: '/send', desc: '\u0627\u0631\u0633\u0627\u0644 \u0631\u0633\u0627\u0644\u0629 \u0644\u0631\u0648\u0645 \u0645\u062d\u062f\u062f', badge: '', icon: '\ud83d\udcec' },
            { name: '/server', desc: '\u0639\u0631\u0636 \u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u0633\u064a\u0631\u0641\u0631 \u0648\u0625\u062d\u0635\u0627\u0626\u064a\u0627\u062a\u0647', badge: '', icon: '\ud83c\udfe0' },
            { name: '/set-autoline-line', desc: '\u062a\u062d\u062f\u064a\u062f \u062e\u0637 \u0644\u0631\u0648\u0645', badge: '', icon: '\ud83d\udcdd' },
            { name: '/user', desc: '\u0639\u0631\u0636 \u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u0639\u0636\u0648', badge: '', icon: '\ud83d\udc64' }
        ]},
        moderation: { title: '\u0627\u0644\u0625\u0634\u0631\u0627\u0641 \u0648\u0627\u0644\u0639\u0642\u0648\u0628\u0627\u062a', desc: '\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0639\u0642\u0648\u0628\u0627\u062a \u0627\u0644\u0645\u0628\u0627\u0634\u0631\u0629 \u0648\u0627\u0644\u0625\u0634\u0631\u0627\u0641 \u0648\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0623\u0639\u0636\u0627\u0621', icon: '\ud83d\udd28', items: [
            { name: '/ban', desc: '\u062d\u0638\u0631 \u0639\u0636\u0648 \u0645\u0646 \u0627\u0644\u0633\u064a\u0631\u0641\u0631', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83e\ude93' },
            { name: '/clear', desc: '\u062d\u0630\u0641 \u0631\u0633\u0627\u0626\u0644 \u0645\u0646 \u0627\u0644\u0642\u0646\u0627\u0629', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\uddd1\ufe0f' },
            { name: '/hide', desc: '\u0625\u062e\u0641\u0627\u0621 \u0627\u0644\u0631\u0648\u0645 \u0627\u0644\u062d\u0627\u0644\u064a \u0639\u0646 \u0627\u0644\u0623\u0639\u0636\u0627\u0621', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udc41\ufe0f' },
            { name: '/jail', desc: '\u0646\u0638\u0627\u0645 \u0633\u062c\u0646 \u0648\u0639\u0632\u0644 \u0627\u0644\u0623\u0639\u0636\u0627\u0621 \u0627\u0644\u0645\u062e\u0627\u0644\u0641\u064a\u0646', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\u26d3\ufe0f' },
            { name: '/kick', desc: '\u0637\u0631\u062f \u0639\u0636\u0648 \u0645\u0646 \u0627\u0644\u0633\u064a\u0631\u0641\u0631', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83e\ude93' },
            { name: '/lock', desc: '\u0642\u0641\u0644 \u0627\u0644\u0631\u0648\u0645 \u0627\u0644\u062d\u0627\u0644\u064a', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udd12' },
            { name: '/mute', desc: '\u0625\u0633\u0643\u0627\u062a \u0639\u0636\u0648 \u0643\u062a\u0627\u0628\u064a\u0627\u064b \u0648\u0635\u0648\u062a\u064a\u0627\u064b', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udd07' },
            { name: '/nickname', desc: '\u062a\u063a\u064a\u064a\u0631 \u0644\u0642\u0628 \u0639\u0636\u0648', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\u270f\ufe0f' },
            { name: '/role', desc: '\u0625\u062f\u0627\u0631\u0629 \u0623\u062f\u0648\u0627\u0631 \u0627\u0644\u0623\u0639\u0636\u0627\u0621', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83c\udf96\ufe0f' },
            { name: '/role-all', desc: '\u0625\u0639\u0637\u0627\u0621 \u0631\u062a\u0628\u0629 \u0644\u062c\u0645\u064a\u0639 \u0627\u0644\u0623\u0639\u0636\u0627\u0621 \u0623\u0648 \u0625\u0632\u0627\u0644\u062a\u0647\u0627 \u0645\u0646\u0647\u0645', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udc65' },
            { name: '/slowmode', desc: '\u062a\u062d\u062f\u064a\u062f \u0633\u0631\u0639\u0629 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u0633\u0627\u0626\u0644 \u0628\u0627\u0644\u062b\u0648\u0627\u0646\u064a', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udc0c' },
            { name: '/timeout', desc: '\u0639\u0632\u0644 / \u0625\u0633\u0643\u0627\u062a \u0639\u0636\u0648 \u0645\u0624\u0642\u062a\u0627\u064b \u0641\u064a \u0627\u0644\u0633\u064a\u0631\u0641\u0631', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\u23f3' },
            { name: '/unban', desc: '\u0625\u0644\u063a\u0627\u0621 \u062d\u0638\u0631 \u0639\u0636\u0648 \u0645\u0646 \u0627\u0644\u0633\u064a\u0631\u0641\u0631', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udee1\ufe0f' },
            { name: '/unhide', desc: '\u0625\u0638\u0647\u0627\u0631 \u0627\u0644\u0631\u0648\u0645 \u0627\u0644\u062d\u0627\u0644\u064a \u0648\u0625\u0644\u063a\u0627\u0621 \u0625\u062e\u0641\u0627\u0626\u0647', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udc41\ufe0f' },
            { name: '/unlock', desc: '\u0641\u062a\u062d \u0627\u0644\u0631\u0648\u0645 \u0627\u0644\u062d\u0627\u0644\u064a', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udd13' },
            { name: '/untimeout', desc: '\u0641\u0643 \u0627\u0644\u0639\u0632\u0644 \u0639\u0646 \u0639\u0636\u0648 \u0641\u064a \u0627\u0644\u0633\u064a\u0631\u0641\u0631', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udee1\ufe0f' },
            { name: '/warn', desc: '\u0625\u062f\u0627\u0631\u0629 \u062a\u062d\u0630\u064a\u0631\u0627\u062a \u0627\u0644\u0623\u0639\u0636\u0627\u0621', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\u26a0\ufe0f' }
        ]},
        protection: { title: '\u0627\u0644\u062d\u0645\u0627\u064a\u0629 \u0648\u0627\u0644\u0623\u0645\u0627\u0646', desc: '\u0645\u0646\u0638\u0648\u0645\u0629 \u0627\u0644\u062d\u0645\u0627\u064a\u0629 \u0645\u0646 \u0627\u0644\u062a\u062e\u0631\u064a\u0628 \u0648\u0627\u0644\u0628\u0648\u062a\u0627\u062a \u0648\u0627\u0644\u0646\u0648\u0643', icon: '\ud83d\udee1\ufe0f', items: [
            { name: '/anti-ban', desc: '\u062a\u0633\u0637\u064a\u0628 \u0646\u0638\u0627\u0645 \u0627\u0644\u062d\u0645\u0627\u064a\u0629 \u0645\u0646 \u0627\u0644\u0628\u0627\u0646\u062f', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udee1\ufe0f' },
            { name: '/anti-bots', desc: '\u062a\u0633\u0637\u064a\u0628 \u0646\u0638\u0627\u0645 \u0627\u0644\u062d\u0645\u0627\u064a\u0629 \u0645\u0646 \u0627\u0644\u0628\u0648\u062a\u0627\u062a', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83e\udd16' },
            { name: '/anti-delete-roles', desc: '\u062a\u0633\u0637\u064a\u0628 \u0646\u0638\u0627\u0645 \u0627\u0644\u062d\u0645\u0627\u064a\u0629 \u0645\u0646 \u062d\u0630\u0641 \u0627\u0644\u0631\u062a\u0628', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udee1\ufe0f' },
            { name: '/anti-delete-rooms', desc: '\u062a\u0633\u0637\u064a\u0628 \u0646\u0638\u0627\u0645 \u0627\u0644\u062d\u0645\u0627\u064a\u0629 \u0645\u0646 \u062d\u0630\u0641 \u0627\u0644\u0631\u0648\u0645\u0627\u062a', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udee1\ufe0f' },
            { name: '/protection-status', desc: '\u0639\u0631\u0636 \u062d\u0627\u0644\u0629 \u0623\u0646\u0638\u0645\u0629 \u0627\u0644\u062d\u0645\u0627\u064a\u0629', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udee1\ufe0f' },
            { name: '/set-protect-logs', desc: '\u062a\u0639\u064a\u064a\u0646 \u0631\u0648\u0645 \u0644\u0633\u062c\u0644\u0627\u062a \u0627\u0644\u062d\u0645\u0627\u064a\u0629 \u0648\u0627\u0644\u0646\u0648\u0643', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udee1\ufe0f' }
        ]},
        welcome: { title: '\u0627\u0644\u062a\u0631\u062d\u064a\u0628 \u0648\u0627\u0644\u0645\u063a\u0627\u062f\u0631\u0629', desc: '\u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0631\u0633\u0627\u0626\u0644 \u0648\u0628\u0637\u0627\u0642\u0627\u062a \u0627\u0644\u062a\u0631\u062d\u064a\u0628 \u0648\u0627\u0644\u0645\u063a\u0627\u062f\u0631\u0629', icon: '\ud83d\udc4b', items: [
            { name: '/set-welcome', desc: '\u0625\u0639\u062f\u0627\u062f \u0646\u0638\u0627\u0645 \u0627\u0644\u062a\u0631\u062d\u064a\u0628', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83c\udf89' }
        ]},
        autoresponder: { title: '\u0627\u0644\u0631\u062f \u0627\u0644\u062a\u0644\u0642\u0627\u0626\u064a', desc: '\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0631\u062f\u0648\u062f \u0627\u0644\u062a\u0644\u0642\u0627\u0626\u064a\u0629 \u0639\u0644\u0649 \u0627\u0644\u0643\u0644\u0645\u0627\u062a \u0648\u0627\u0644\u062c\u0645\u0644', icon: '\ud83d\udcac', items: [
            { name: '/auto-responder', desc: '\u0625\u062f\u0627\u0631\u0629 \u0646\u0638\u0627\u0645 \u0627\u0644\u0631\u062f \u0627\u0644\u062a\u0644\u0642\u0627\u0626\u064a', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\u2699\ufe0f' },
            { name: '/autoreply-add', desc: '\u0644\u0627\u0636\u0627\u0641\u0629 \u0631\u062f \u062a\u0644\u0642\u0627\u0626\u064a', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\u2699\ufe0f' },
            { name: '/autoreply-list', desc: '\u0644\u0631\u0624\u064a\u0629 \u062c\u0645\u064a\u0639 \u0627\u0644\u0631\u062f\u0648\u062f \u0627\u0644\u062a\u0644\u0642\u0627\u0626\u064a\u0629', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udcdc' },
            { name: '/autoreply-remove', desc: '\u0644\u0627\u0632\u0627\u0644\u0629 \u0631\u062f \u062a\u0644\u0642\u0627\u0626\u064a', badge: '\u0635\u0644\u0627\u062d\u064a\u062f\u064a\u0629', icon: '\u2699\ufe0f' }
        ]},
        tickets: { title: '\u0646\u0638\u0627\u0645 \u0627\u0644\u062a\u0630\u0627\u0643\u0631', desc: '\u0625\u0639\u062f\u0627\u062f \u0648\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u062a\u0630\u0627\u0643\u0631 \u0648\u0627\u0644\u062f\u0639\u0645 \u0627\u0644\u0641\u0646\u064a', icon: '\ud83c\udfab', items: [
            { name: '/add-ticket-button', desc: '\u0625\u0631\u0633\u0627\u0644 \u0632\u0631 \u0627\u0644\u062a\u0630\u0643\u0631\u0629', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83c\udfab' },
            { name: '/add-user', desc: '\u0625\u0636\u0627\u0641\u0629 \u0639\u0636\u0648 \u0644\u0644\u062a\u0630\u0643\u0631\u0629', badge: '', icon: '\u2795' },
            { name: '/close', desc: '\u0627\u063a\u0644\u0627\u0642 \u0627\u0644\u062a\u0630\u0643\u0631\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629', badge: '', icon: '\ud83d\udd12' },
            { name: '/delete', desc: '\u062d\u0630\u0641 \u0627\u0644\u062a\u0630\u0643\u0631\u0629 \u0641\u0648\u0631\u0627\u064b', badge: '', icon: '\ud83d\uddd1\ufe0f' },
            { name: '/remove-user', desc: '\u0625\u0632\u0627\u0644\u0629 \u0639\u0636\u0648 \u0645\u0646 \u0627\u0644\u062a\u0630\u0643\u0631\u0629', badge: '', icon: '\u2796' },
            { name: '/rename', desc: '\u0625\u0639\u0627\u062f\u0629 \u062a\u0633\u0645\u064a\u0629 \u0627\u0644\u062a\u0630\u0643\u0631\u0629', badge: '', icon: '\u270f\ufe0f' },
            { name: '/set-ticket-log', desc: '\u062a\u062d\u062f\u064a\u062f \u0631\u0648\u0645 \u0633\u062c\u0644\u0627\u062a \u0627\u0644\u062a\u0630\u0627\u0643\u0631', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udcdc' },
            { name: '/setup-rating', desc: '\u062a\u0641\u0639\u064a\u0644 \u0646\u0638\u0627\u0645 \u0627\u0644\u062a\u0642\u064a\u064a\u0645 \u0641\u064a \u0627\u0644\u062a\u0630\u0627\u0643\u0631', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\u2b50' },
            { name: '/ticket', desc: '\u0623\u0648\u0627\u0645\u0631 \u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u062a\u0630\u0627\u0643\u0631 \u0627\u0644\u0645\u062a\u0642\u062f\u0645\u0629', badge: '', icon: '\ud83c\udfab' },
            { name: '/ticket-setup', desc: '\u0625\u0639\u062f\u0627\u062f \u0644\u0648\u062d\u0629 \u062a\u0630\u0627\u0643\u0631 \u0645\u062e\u0635\u0635\u0629 \u0628\u0627\u0644\u0643\u0627\u0645\u0644', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\u2699\ufe0f' }
        ]},
        levels: { title: '\u0627\u0644\u0645\u0633\u062a\u0648\u064a\u0627\u062a & XP', desc: '\u0646\u0638\u0627\u0645 \u0646\u0642\u0627\u0637 \u0627\u0644\u062e\u0628\u0631\u0629 \u0648\u0627\u0644\u0645\u0633\u062a\u0648\u064a\u0627\u062a \u0648\u0627\u0644\u062a\u0631\u062a\u064a\u0628', icon: '\ud83c\udfc6', items: [
            { name: '/leaderboard', desc: '\u0639\u0631\u0636 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u062a\u0635\u062f\u0631\u064a\u0646', badge: '', icon: '\ud83c\udfc6' },
            { name: '/profile', desc: '\u0639\u0631\u0636 \u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u0628\u0631\u0648\u0641\u0627\u064a\u0644 \u0648\u0627\u0644\u0647\u0648\u064a\u0629 \u0627\u0644\u0634\u062e\u0635\u064a\u0629', badge: '', icon: '\ud83d\udcb3' },
            { name: '/rank', desc: '\u0639\u0631\u0636 \u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u0645\u0633\u062a\u0648\u0649 \u0648\u0646\u0642\u0627\u0637 \u0627\u0644\u062e\u0628\u0631\u0629', badge: '', icon: '\u2b50' },
            { name: '/setwallpaper', desc: '\u062a\u0639\u064a\u064a\u0646 \u062e\u0644\u0641\u064a\u0629 \u0645\u062e\u0635\u0635\u0629 \u0644\u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u0628\u0631\u0648\u0641\u0627\u064a\u0644', badge: '', icon: '\ud83d\uddbc\ufe0f' }
        ]},
        economy: { title: '\u0627\u0644\u0627\u0642\u062a\u0635\u0627\u062f \u0648\u0627\u0644\u0645\u0627\u0644', desc: '\u0646\u0638\u0627\u0645 \u0627\u0644\u0631\u0635\u064a\u062f\u060c \u0627\u0644\u0628\u0646\u0643\u060c \u0627\u0644\u062a\u062d\u0648\u064a\u0644 \u0648\u0627\u0644\u0636\u0631\u0627\u0626\u0628', icon: '\ud83e\ude99', items: [
            { name: '/balance', desc: '\u0639\u0631\u0636 \u0631\u0635\u064a\u062f\u0643 \u0627\u0644\u062d\u0627\u0644\u064a \u0645\u0646 \u0627\u0644\u0639\u0645\u0644\u0627\u062a', badge: '', icon: '\ud83d\udcb0' },
            { name: '/bank', desc: '\u0646\u0638\u0627\u0645 \u0627\u0644\u0628\u0646\u0643', badge: '', icon: '\ud83c\udfe6' },
            { name: '/daily', desc: '\u0627\u062d\u0635\u0644 \u0639\u0644\u0649 \u0645\u0643\u0627\u0641\u0623\u062a\u0643 \u0627\u0644\u064a\u0648\u0645\u064a\u0629', badge: '', icon: '\ud83d\udcb5' },
            { name: '/pay', desc: '\u062a\u062d\u0648\u064a\u0644 \u0639\u0645\u0644\u0627\u062a \u0627\u0644\u0630\u0647\u0628 \u0625\u0644\u0649 \u0639\u0636\u0648 \u0622\u062e\u0631', badge: '', icon: '\ud83d\udcb8' },
            { name: '/set-tax-line', desc: '\u062a\u062d\u062f\u064a\u062f \u062e\u0637 \u0644\u0631\u0648\u0645 \u0627\u0644\u0636\u0631\u064a\u0628\u0629', badge: '', icon: '\ud83e\ude99' },
            { name: '/set-tax-room', desc: '\u062a\u062d\u062f\u064a\u062f \u0631\u0648\u0645 \u062d\u0633\u0627\u0628 \u0627\u0644\u0636\u0631\u064a\u0628\u0629', badge: '', icon: '\ud83e\ude99' },
            { name: '/tax', desc: '\u062d\u0633\u0627\u0628 \u0636\u0631\u064a\u0628\u0629 \u0628\u0631\u0648\u0628\u0648\u062a', badge: '', icon: '\ud83e\ude99' },
            { name: '/tax-mode', desc: '\u062a\u062d\u062f\u064a\u062f \u0646\u0645\u0637 \u0627\u0644\u0636\u0631\u064a\u0628\u0629', badge: '', icon: '\u2699\ufe0f' },
            { name: '/work', desc: '\u0627\u0639\u0645\u0644 \u0644\u062a\u0643\u0633\u0628 Star Coin', badge: '', icon: '\ud83d\udcbc' }
        ]},
        autoroles: { title: '\u0627\u0644\u0631\u062a\u0628 \u0627\u0644\u062a\u0644\u0642\u0627\u0626\u064a\u0629', desc: '\u0625\u0639\u0637\u0627\u0621 \u0627\u0644\u0631\u062a\u0628 \u062a\u0644\u0642\u0627\u0626\u064a\u0627\u064b \u0639\u0646\u062f \u0627\u0644\u0627\u0646\u0636\u0645\u0627\u0645 \u0623\u0648 \u0627\u0644\u062a\u0641\u0627\u0639\u0644', icon: '\ud83c\udf96\ufe0f', items: [
            { name: '/set-autorole', desc: '\u062a\u0639\u064a\u064a\u0646 \u0627\u0644\u0631\u062a\u0628\u0629 \u0627\u0644\u062a\u0644\u0642\u0627\u0626\u064a\u0629 \u0644\u0644\u0623\u0639\u0636\u0627\u0621 \u0627\u0644\u062c\u062f\u062f', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\u2699\ufe0f' },
            { name: '/reaction-role', desc: '\u0625\u0646\u0634\u0627\u0621 \u0631\u0633\u0627\u0644\u0629 \u0625\u0639\u0637\u0627\u0621 \u0631\u062a\u0628\u0629 \u0628\u0632\u0631 \u062a\u0641\u0627\u0639\u0644\u064a', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83c\udf96\ufe0f' },
            { name: '/new-panel', desc: '\u0625\u0646\u0634\u0627\u0621 \u0628\u0627\u0646\u0644 \u0631\u062a\u0628 \u062c\u062f\u064a\u062f', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udd18' },
            { name: '/add-button', desc: '\u0625\u0636\u0627\u0641\u0629 \u0632\u0631 (\u0631\u062a\u0628\u0629 \u0623\u0648 \u0645\u0639\u0644\u0648\u0645\u0627\u062a) \u0644\u0631\u0633\u0627\u0644\u0629 \u0645\u062d\u062f\u062f\u0629', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udd18' }
        ]},
        giveaways: { title: '\u0642\u064a\u0641 \u0627\u0648\u0627\u064a', desc: '\u0625\u062f\u0627\u0631\u0629 \u0645\u0633\u0627\u0628\u0642\u0627\u062a \u0648\u0633\u062d\u0648\u0628\u0627\u062a \u0627\u0644\u0642\u064a\u0641 \u0623\u0648\u0627\u064a', icon: '\ud83c\udf89', items: [
            { name: '/giveaway', desc: '\u0625\u062f\u0627\u0631\u0629 \u0633\u062d\u0648\u0628\u0627\u062a \u0627\u0644\u0642\u064a\u0641 \u0623\u0648\u0627\u064a \u0627\u0644\u0645\u062a\u0642\u062f\u0645\u0629', badge: '', icon: '\ud83c\udf89' }
        ]},
        invites: { title: 'Invite Tracker', desc: '\u0645\u062a\u062a\u0628\u0639 \u062f\u0639\u0648\u0627\u062a \u0627\u0644\u0623\u0639\u0636\u0627\u0621 \u0648\u0625\u062d\u0635\u0627\u0626\u064a\u0627\u062a \u0627\u0644\u062f\u0639\u0648\u0627\u062a', icon: '\ud83d\udd17', items: [
            { name: '/invites', desc: '\u0623\u0648\u0627\u0645\u0631 \u0646\u0638\u0627\u0645 \u0645\u062a\u062a\u0628\u0639 \u0627\u0644\u062f\u0639\u0648\u0627\u062a (Invite Tracker)', badge: '', icon: '\ud83d\udd17' }
        ]},
        applications: { title: '\u0627\u0644\u062a\u0642\u062f\u064a\u0645\u0627\u062a', desc: '\u0646\u0638\u0627\u0645 \u0627\u0644\u062a\u0642\u062f\u064a\u0645 \u0639\u0644\u0649 \u0627\u0644\u0625\u062f\u0627\u0631\u0629 \u0648\u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0637\u0644\u0628\u0627\u062a', icon: '\ud83d\udcdd', items: [
            { name: '/apply', desc: '\u0641\u062a\u062d \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062a\u0642\u062f\u064a\u0645\u0627\u062a \u0623\u0648 \u0625\u0631\u0633\u0627\u0644 \u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u062a\u0642\u062f\u064a\u0645\u0627\u062a \u0641\u064a \u0627\u0644\u0642\u0646\u0627\u0629', badge: '', icon: '\ud83d\udcdd' },
            { name: '/applications', desc: '\u0625\u062f\u0627\u0631\u0629 \u0646\u0638\u0627\u0645 \u0627\u0644\u062a\u0642\u062f\u064a\u0645\u0627\u062a \u0648\u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0637\u0644\u0628\u0627\u062a', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udcdd' },
            { name: '/dm-mode', desc: '\u0625\u0634\u0639\u0627\u0631 \u0627\u0644\u062a\u0642\u062f\u064a\u0645 \u0628\u0627\u0644\u062e\u0627\u0635', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udcec' }
        ]},
        suggestions: { title: '\u0627\u0644\u0627\u0642\u062a\u0631\u0627\u062d\u0627\u062a \u0648\u0627\u0644\u0634\u0643\u0627\u0648\u064a', desc: '\u0646\u0638\u0627\u0645 \u0627\u0633\u062a\u0642\u0628\u0627\u0644 \u0648\u062a\u0646\u0633\u064a\u0642 \u0627\u0644\u0627\u0642\u062a\u0631\u0627\u062d\u0627\u062a \u0648\u0627\u0644\u0622\u0631\u0627\u0621', icon: '\ud83d\udca1', items: [
            { name: '/feedback-mode', desc: '\u062a\u062d\u062f\u064a\u062f \u0646\u0645\u0637 \u0627\u0644\u0622\u0631\u0627\u0621', badge: '', icon: '\ud83d\udca1' },
            { name: '/set-feedback-line', desc: '\u062a\u062d\u062f\u064a\u062f \u062e\u0637 \u0644\u0631\u0648\u0645 \u0627\u0644\u0622\u0631\u0627\u0621', badge: '', icon: '\ud83d\udca1' },
            { name: '/set-feedback-room', desc: '\u062a\u062d\u062f\u064a\u062f \u0631\u0648\u0645 \u0627\u0644\u0622\u0631\u0627\u0621', badge: '', icon: '\ud83d\udca1' },
            { name: '/set-suggestions-line', desc: '\u062a\u062d\u062f\u064a\u062f \u062e\u0637 \u0644\u0631\u0648\u0645 \u0627\u0644\u0627\u0642\u062a\u0631\u0627\u062d\u0627\u062a', badge: '', icon: '\ud83d\udca1' },
            { name: '/set-suggestions-room', desc: '\u062a\u062d\u062f\u064a\u062f \u0631\u0648\u0645 \u0627\u0644\u0627\u0642\u062a\u0631\u0627\u062d\u0627\u062a', badge: '', icon: '\ud83d\udca1' },
            { name: '/suggest', desc: '\u062a\u0642\u062f\u064a\u0645 \u0627\u0642\u062a\u0631\u0627\u062d \u0623\u0648 \u0641\u0643\u0631\u0629 \u0644\u062a\u0637\u0648\u064a\u0631 \u0627\u0644\u0633\u064a\u0631\u0641\u0631', badge: '', icon: '\ud83d\udca1' },
            { name: '/suggestion-mode', desc: '\u062a\u062d\u062f\u064a\u062f \u0646\u0645\u0637 \u0627\u0644\u0627\u0642\u062a\u0631\u0627\u062d\u0627\u062a', badge: '', icon: '\ud83d\udca1' }
        ]},
        automod: { title: '\u0627\u0644\u0631\u0642\u0627\u0628\u0629 \u0627\u0644\u062a\u0644\u0642\u0627\u0626\u064a\u0629', desc: '\u0645\u0646\u0638\u0648\u0645\u0629 AutoMod \u0644\u0645\u0646\u0639 \u0627\u0644\u0633\u0628 \u0648\u0627\u0644\u0625\u0639\u0644\u0627\u0646\u0627\u062a \u0648\u0627\u0644\u0633\u0628\u0627\u0645', icon: '\ud83e\udd16', items: [
            { name: '/automod', desc: '\u0625\u062f\u0627\u0631\u0629 \u0648\u062a\u062e\u0635\u064a\u0635 \u0645\u0646\u0638\u0648\u0645\u0629 \u0627\u0644\u0631\u0642\u0627\u0628\u0629 \u0627\u0644\u062a\u0644\u0642\u0627\u0626\u064a\u0629 \u0627\u0644\u0630\u0643\u064a\u0629 (Auto-Mod)', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\u2699\ufe0f' }
        ]},
        tempvoice: { title: '\u0627\u0644\u0631\u0648\u0645\u0627\u062a \u0627\u0644\u0645\u0624\u0642\u062a\u0629', desc: '\u0625\u0646\u0634\u0627\u0621 \u0648\u062a\u062e\u0635\u064a\u0635 \u0631\u0648\u0645\u0627\u062a \u0635\u0648\u062a\u064a\u0629 \u0645\u0624\u0642\u062a\u0629 \u0644\u0644\u0623\u0639\u0636\u0627\u0621', icon: '\ud83d\udd52', items: [
            { name: '/set-tempvoice', desc: '\u062a\u0639\u064a\u064a\u0646 \u0631\u0648\u0645 \u0627\u0644\u0631\u0648\u0645\u0627\u062a \u0627\u0644\u0635\u0648\u062a\u064a\u0629 \u0627\u0644\u0645\u0624\u0642\u062a\u0629', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83c\udfa4' }
        ]},
        admin: { title: '\u0627\u0644\u0625\u062f\u0627\u0631\u0629 \u0648\u0627\u0644\u0633\u062c\u0644\u0627\u062a', desc: '\u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0627\u0644\u0633\u064a\u0631\u0641\u0631 \u0648\u0627\u0644\u0633\u062c\u0644\u0627\u062a \u0648\u0645\u062a\u0627\u0628\u0639\u0629 \u0637\u0627\u0642\u0645 \u0627\u0644\u0625\u062f\u0627\u0631\u0629', icon: '\u2699\ufe0f', items: [
            { name: '/set', desc: '\u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0648\u062a\u062e\u0635\u064a\u0635 \u0627\u0644\u0628\u0648\u062a \u0648\u0644\u0648\u062d\u0627\u062a \u0627\u0644\u0625\u062f\u0627\u0631\u0629', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\u2699\ufe0f' },
            { name: '/set-jail', desc: '\u0625\u0639\u062f\u0627\u062f \u0648\u062a\u062e\u0635\u064a\u0635 \u0631\u062a\u0628\u0629 \u0648\u0631\u0648\u0645 \u0627\u0644\u0633\u062c\u0646', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\u26d3\ufe0f' },
            { name: '/set-logs', desc: '\u062a\u062d\u062f\u064a\u062f \u0631\u0648\u0645 \u0627\u0644\u0633\u062c\u0644\u0627\u062a \u0627\u0644\u0634\u062a\u0645\u0644\u0629', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udcdc' },
            { name: '/set-prefix', desc: '\u062a\u063a\u064a\u064a\u0631 \u0631\u0645\u0632 \u0627\u0644\u0628\u0631\u0641\u0643\u0633 \u0627\u0644\u062e\u0627\u0635 \u0628\u0627\u0644\u0633\u064a\u0631\u0641\u0631', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\u2699\ufe0f' },
            { name: '/set-shortcut', desc: '\u0648\u0636\u0639 \u0627\u062e\u062a\u0635\u0627\u0631 \u0644\u0623\u0645\u0631 \u0645\u0639\u064a\u0646', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\u2699\ufe0f' },
            { name: '/set-verification', desc: '\u0625\u0639\u062f\u0627\u062f \u0648\u062a\u0641\u0639\u064a\u0644 \u0646\u0638\u0627\u0645 \u0627\u0644\u062a\u062d\u0642\u0642 \u0627\u0644\u062a\u0641\u0627\u0639\u0644\u064a \u0641\u064a \u0627\u0644\u0633\u064a\u0631\u0641\u0631', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\u2705' },
            { name: '/logs', desc: '\u0646\u0638\u0627\u0645 \u062a\u062a\u0628\u0639 \u062c\u0645\u064a\u0639 \u0627\u0644\u0623\u062d\u062f\u0627\u062b \u0641\u064a \u0627\u0644\u0633\u064a\u0631\u0641\u0631 \u0645\u0639 \u0627\u0644\u0641\u0627\u0639\u0644 \u0648\u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644 \u0641\u0648\u0631\u064a\u0627\u064b', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udcdc' },
            { name: '/staff', desc: '\u0646\u0638\u0627\u0645 \u0645\u062a\u0627\u0628\u0639\u0629 \u0646\u0634\u0627\u0637 \u0637\u0627\u0642\u0645 \u0627\u0644\u0625\u062f\u0627\u0631\u0629 (Staff Activity)', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83d\udcca' },
            { name: '/top-in', desc: '\u0644\u0648\u062d\u0629 \u0634\u0631\u0641 \u0648\u062a\u0631\u062a\u064a\u0628 \u0633\u0627\u0639\u0627\u062a \u0648\u0646\u0642\u0627\u0637 \u0637\u0627\u0642\u0645 \u0627\u0644\u0625\u062f\u0627\u0631\u0629', badge: '\u0635\u0644\u0627\u062d\u064a\u0627\u062a \u0625\u062f\u0627\u0631\u064a\u0629', icon: '\ud83c\udfc6' }
        ]}
    };

    var baseCats = ['general', 'moderation', 'protection', 'welcome', 'autoresponder', 'tickets', 'levels', 'economy', 'autoroles', 'giveaways', 'invites', 'applications', 'suggestions', 'automod', 'tempvoice', 'admin'];
    var seenCmds = {};
    var allItems = [];
    for (var ck = 0; ck < baseCats.length; ck++) {
        var cItems = DB[baseCats[ck]].items;
        for (var ci = 0; ci < cItems.length; ci++) {
            if (!seenCmds[cItems[ci].name]) {
                seenCmds[cItems[ci].name] = true;
                allItems.push(cItems[ci]);
            }
        }
    }
    DB['all'] = {
        title: '\u062c\u0645\u064a\u0639 \u0627\u0644\u0623\u0648\u0627\u0645\u0631 \u0648\u0627\u0644\u062e\u062f\u0645\u0627\u062a',
        desc: '\u0639\u0631\u0636 \u0648\u0625\u062f\u0627\u0631\u0629 \u0643\u0627\u0641\u0629 \u0623\u0646\u0638\u0645\u0629 \u0648\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0628\u0648\u062a \u0641\u064a \u0645\u0643\u0627\u0646 \u0648\u0627\u062d\u062f',
        icon: '\ud83c\udf10',
        items: allItems
    };

    var catBtnMap = {
        all:'btnCatAll', general:'btnCatGeneral', moderation:'btnCatModeration', protection:'btnCatProtection',
        welcome:'btnCatWelcome', autoresponder:'btnCatAutoresponder', tickets:'btnCatTickets', levels:'btnCatLevels',
        economy:'btnCatEconomy', autoroles:'btnCatAutoroles', giveaways:'btnCatGiveaways', invites:'btnCatInvites',
        applications:'btnCatApplications', suggestions:'btnCatSuggestions', automod:'btnCatAutomod', tempvoice:'btnCatTempvoice',
        admin:'btnCatAdmin'
    };
    var catBadgeMap = {
        all:'badgeCatAll', general:'badgeCatGeneral', moderation:'badgeCatModeration', protection:'badgeCatProtection',
        welcome:'badgeCatWelcome', autoresponder:'badgeCatAutoresponder', tickets:'badgeCatTickets', levels:'badgeCatLevels',
        economy:'badgeCatEconomy', autoroles:'badgeCatAutoroles', giveaways:'badgeCatGiveaways', invites:'badgeCatInvites',
        applications:'badgeCatApplications', suggestions:'badgeCatSuggestions', automod:'badgeCatAutomod', tempvoice:'badgeCatTempvoice',
        admin:'badgeCatAdmin'
    };

    var currentCat = 'all';
    var currentFilter = 'all';
    var disabledCmds = ` + JSON.stringify((function() { try { var raw = settings.disabled_commands; if (!raw) return {}; var arr = typeof raw === "string" ? JSON.parse(raw) : raw; var m = {}; for (var i = 0; i < arr.length; i++) m[arr[i]] = true; return m; } catch(e) { return {}; } })()) + `;
    var commandConfigs = ` + JSON.stringify((function() { try { var raw = settings.command_configs; if (!raw) return {}; return typeof raw === "string" ? JSON.parse(raw) : (raw || {}); } catch(e) { return {}; } })()) + `;
    var guildRoles = ` + JSON.stringify((guildRoles || []).map(function(r) { return { id: r.id, name: r.name }; })) + `;
    var guildChannels = ` + JSON.stringify((guildTextChannels || []).map(function(c) { return { id: c.id, name: c.name }; })) + `;

    function isEn(name) { return !disabledCmds[name]; }

    function render() {
        var container = document.getElementById('cmdsListContainer');
        if (!container) return;
        var data = DB[currentCat] || DB.general;
        var t = document.getElementById('catTitle');
        var d = document.getElementById('catDesc');
        var ic = document.getElementById('catIcon');
        if (t) t.innerText = data.title;
        if (d) d.innerText = data.desc;
        if (ic) ic.innerText = data.icon;
        var searchEl = document.getElementById('cmdSearchInput');
        var sv = searchEl ? searchEl.value.toLowerCase().trim() : '';
        var filtered = data.items.filter(function(item) {
            if (currentFilter === 'enabled' && !isEn(item.name)) return false;
            if (currentFilter === 'disabled' && isEn(item.name)) return false;
            if (sv && item.name.toLowerCase().indexOf(sv) === -1 && item.desc.toLowerCase().indexOf(sv) === -1) return false;
            return true;
        });
        if (!filtered.length) {
            container.innerHTML = '<div class="py-12 bg-[#0b1322] border border-blue-500/20 rounded-2xl text-center text-xs text-gray-500">\u0644\u0627 \u062a\u0648\u062c\u062f \u0623\u0648\u0627\u0645\u0631 \u0645\u0637\u0627\u0628\u0642\u0629 \ud83d\udd0d</div>';
            updateCounters();
            return;
        }

        var html = '';
        for (var i = 0; i < filtered.length; i++) {
            var item = filtered[i];
            var en = isEn(item.name);
            var bh = item.badge ? '<span class="px-2.5 py-0.5 bg-blue-800/60 text-white border border-blue-500/20 rounded-lg text-[10px] font-bold flex items-center gap-1"><span>' + escH(item.badge) + '</span><span>&#128737;</span></span>' : '';
            html += '<div class="cmd-card-wrap border border-blue-500/20 rounded-2xl bg-[#0b1322] overflow-hidden transition hover:border-blue-500/20' + (en ? '' : ' opacity-50') + '" data-cmd="' + escH(item.name) + '">' +
                '<div class="cmd-card-header p-4 flex items-center justify-between cursor-pointer select-none" data-cmd="' + escH(item.name) + '" onclick="window.toggleCmdAccordion(this, event)">' +
                  '<div class="flex items-center gap-3">' +
                    '<label class="toggle" onclick="event.stopPropagation();"><input type="checkbox" data-cmd="' + escH(item.name) + '"' + (en ? ' checked' : '') + '><span class="slider"></span></label>' +
                    '<button type="button" class="cmd-expand-btn text-gray-500 hover:text-blue-400 p-1 text-xs transition cursor-pointer" data-cmd="' + escH(item.name) + '" data-no-i18n="true" onclick="event.stopPropagation(); window.toggleCmdAccordion(this, event);">&#9660;</button>' +
                  '</div>' +
                  '<div class="flex items-center gap-3">' +
                    '<div class="text-right">' +
                      '<div class="flex items-center justify-end gap-2">' + bh + '<span class="font-black text-white text-xs font-mono inline-block" dir="ltr">' + escH(item.name) + '</span></div>' +
                      '<p class="text-[11px] text-white mt-0.5">' + escH(item.desc) + '</p>' +
                    '</div>' +
                    '<div class="w-9 h-9 rounded-xl bg-[#070d1d] border border-blue-500/20 flex items-center justify-center text-sm shadow-inner">' + (item.icon || '&#9881;') + '</div>' +
                  '</div>' +
                '</div>' +
                '<div class="cmd-accordion border-t border-blue-500/20 bg-[#070d1d] rounded-b-2xl text-right" data-cmd="' + escH(item.name) + '" style="display:none;"></div>' +
            '</div>';
        }
        container.innerHTML = html;
        updateCounters();
    }

    function escH(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function loadAccordion(panel, cmdName) {
        // Show loading indicator immediately so the UI isn't frozen
        panel.innerHTML = '<div class="p-4 text-center text-xs text-gray-400">\u23f3 \u062c\u0627\u0631\u064a \u0627\u0644\u062a\u062d\u0645\u064a\u0644...</div>';

        setTimeout(function() {
            try {
                var cfg = (commandConfigs && commandConfigs[cmdName]) || {};
                var alias = (cfg.alias || '').replace(/^[\/!]+|[\/!]+$/g, '');
                var aRoles = [];
                if (Array.isArray(cfg.allowedRoles)) {
                    aRoles = cfg.allowedRoles;
                } else if (typeof cfg.allowedRoles === 'string') {
                    try { aRoles = JSON.parse(cfg.allowedRoles); } catch(e) { aRoles = [cfg.allowedRoles]; }
                    if (!Array.isArray(aRoles)) aRoles = [];
                }
                var aChs = [];
                if (Array.isArray(cfg.allowedChannels)) {
                    aChs = cfg.allowedChannels;
                } else if (typeof cfg.allowedChannels === 'string') {
                    try { aChs = JSON.parse(cfg.allowedChannels); } catch(e) { aChs = [cfg.allowedChannels]; }
                    if (!Array.isArray(aChs)) aChs = [];
                }

                var rolesHtml = '';
                var safeRoles = Array.isArray(guildRoles) ? guildRoles : [];
                if (safeRoles.length === 0) {
                    rolesHtml = '<span class="text-[10px] text-gray-500 py-1 px-2">\u0644\u0627 \u062a\u0648\u062c\u062f \u0631\u062a\u0628 \u0641\u064a \u0627\u0644\u0633\u064a\u0631\u0641\u0631</span>';
                } else {
                    var rLimit = Math.min(safeRoles.length, 100);
                    for (var ri = 0; ri < rLimit; ri++) {
                        var r = safeRoles[ri];
                        if (!r) continue;
                        var rChecked = aRoles.indexOf(r.id) !== -1;
                        rolesHtml += '<label class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-blue-500/20 bg-[#0b1322] hover:border-blue-500/20 cursor-pointer text-[10px] text-gray-300">' +
                            '<span>' + escH(r.name || r.id) + '</span>' +
                            '<input type="checkbox" class="cmd-role-chk accent-blue-400" data-cmd="' + escH(cmdName) + '" data-rid="' + escH(r.id) + '"' + (rChecked ? ' checked' : '') + '>' +
                        '</label>';
                    }
                    if (safeRoles.length > 100) {
                        rolesHtml += '<span class="text-[10px] text-gray-500 py-1 px-2">+' + (safeRoles.length - 100) + ' \u0631\u062a\u0628\u0629 \u0625\u0636\u0627\u0641\u064a\u0629</span>';
                    }
                }

                var chsHtml = '';
                var safeChs = Array.isArray(guildChannels) ? guildChannels : [];
                if (safeChs.length === 0) {
                    chsHtml = '<span class="text-[10px] text-gray-500 py-1 px-2">\u0644\u0627 \u062a\u0648\u062c\u062f \u0642\u0646\u0648\u0627\u062a \u0641\u064a \u0627\u0644\u0633\u064a\u0631\u0641\u0631</span>';
                } else {
                    var cLimit = Math.min(safeChs.length, 100);
                    for (var ci = 0; ci < cLimit; ci++) {
                        var ch = safeChs[ci];
                        if (!ch) continue;
                        var chChecked = aChs.indexOf(ch.id) !== -1;
                        chsHtml += '<label class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-blue-500/20 bg-[#0b1322] hover:border-blue-500/20 cursor-pointer text-[10px] text-gray-300">' +
                            '<span>#' + escH(ch.name || ch.id) + '</span>' +
                            '<input type="checkbox" class="cmd-ch-chk accent-blue-400" data-cmd="' + escH(cmdName) + '" data-chid="' + escH(ch.id) + '"' + (chChecked ? ' checked' : '') + '>' +
                        '</label>';
                    }
                    if (safeChs.length > 100) {
                        chsHtml += '<span class="text-[10px] text-gray-500 py-1 px-2">+' + (safeChs.length - 100) + ' \u0642\u0646\u0627\u0629 \u0625\u0636\u0627\u0641\u064a\u0629</span>';
                    }
                }

                var h = '<div class="p-4 space-y-4">' +
                    '<div class="flex items-center justify-between gap-4 flex-wrap"><div class="flex-1 min-w-[200px]">' +
                        '<label class="block text-[10px] text-white font-bold mb-1">\u0627\u062e\u062a\u0635\u0627\u0631 \u0645\u062e\u0635\u0635 \u0644\u0644\u0623\u0645\u0631 (Custom Alias)</label>' +
                        '<input type="text" dir="ltr" class="cmd-alias-input w-full bg-[#0b1322] border border-blue-500/20 focus:border-blue-400 rounded-xl px-3 py-2 text-xs text-white outline-none text-left" placeholder="H \u0623\u0648 b \u0623\u0648 !help" data-cmd="' + escH(cmdName) + '" value="' + escH(alias) + '">' +
                    '</div></div>' +
                    '<div>' +
                        '<label class="block text-[10px] text-white font-bold mb-1.5">\u0627\u0644\u0631\u062a\u0628 \u0627\u0644\u0645\u0633\u0645\u0648\u062d \u0644\u0647\u0627 \u0641\u0642\u0637 \u0628\u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u0623\u0645\u0631 (Allowed Roles)</label>' +
                        '<div class="cmd-roles-box flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-[#0b1322]/50 border border-blue-500/20 rounded-xl justify-end">' + rolesHtml + '</div>' +
                    '</div>' +
                    '<div>' +
                        '<label class="block text-[10px] text-white font-bold mb-1.5">\u0627\u0644\u0642\u0646\u0648\u0627\u062a \u0627\u0644\u0645\u0633\u0645\u0648\u062d \u0641\u064a\u0647\u0627 \u0641\u0642\u0637 \u0628\u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u0623\u0645\u0631 (Allowed Channels)</label>' +
                        '<div class="cmd-chs-box flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-[#0b1322]/50 border border-blue-500/20 rounded-xl justify-end">' + chsHtml + '</div>' +
                    '</div>' +
                    '<div class="flex items-center justify-between pt-2 border-t border-blue-500/20">' +
                        '<button type="button" class="cmd-reset-btn px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 rounded-xl text-xs font-bold transition cursor-pointer" data-cmd="' + escH(cmdName) + '">\u0625\u0639\u0627\u062f\u0629 \u0636\u0628\u0637</button>' +
                        '<button type="button" class="cmd-save-btn px-4 py-1.5 bg-gradient-to-l from-purple-600 to-blue-500 hover:bg-gradient-to-l from-purple-600 to-blue-500 text-white rounded-xl text-xs font-bold transition shadow-lg cursor-pointer" data-cmd="' + escH(cmdName) + '">\u062d\u0641\u0638 \u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0623\u0645\u0631</button>' +
                    '</div>' +
                '</div>';

                panel.innerHTML = h;
            } catch (err) {
                console.error('loadAccordion error for', cmdName, err);
                panel.innerHTML = '<div class="p-3 text-xs text-rose-400 text-center">\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u062a\u062d\u0645\u064a\u0644 \u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0623\u0645\u0631</div>';
            }
        }, 0);
    }

    function updateCounters() {
        var keys = ['all'].concat(baseCats);
        for (var i = 0; i < keys.length; i++) {
            var cat = keys[i];
            if (!DB[cat]) continue;
            var items = DB[cat].items;
            var catEn = 0;
            for (var j = 0; j < items.length; j++) { if (isEn(items[j].name)) catEn++; }
            var bId = catBadgeMap[cat];
            if (bId) {
                var badge = document.getElementById(bId);
                if (badge) {
                    badge.textContent = catEn + '/' + items.length;
                    badge.className = catEn === 0
                        ? 'px-2 py-0.5 bg-rose-950/60 text-rose-400 rounded-lg text-[10px] font-mono'
                        : catEn < items.length
                            ? 'px-2 py-0.5 bg-amber-950/60 text-amber-400 rounded-lg text-[10px] font-mono'
                            : 'px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded-lg text-[10px] font-mono';
                }
            }
        }
        var total = DB['all'] ? DB['all'].items.length : 0;
        var enabled = 0;
        if (DB['all']) {
            for (var ai = 0; ai < DB['all'].items.length; ai++) {
                if (isEn(DB['all'].items[ai].name)) enabled++;
            }
        }
        var aliasCount = Object.keys(commandConfigs).filter(function(k){ return commandConfigs[k] && commandConfigs[k].alias; }).length;
        var acEl = document.getElementById('customAliasesCount');
        if (acEl) acEl.textContent = aliasCount;
        var te = document.getElementById('totalCmdsCount');
        var ee = document.getElementById('enabledCmdsCount');
        if (te) te.textContent = total;
        if (ee) ee.textContent = enabled;
    }

    function showSaved() {
        var el = document.getElementById('cmdSaveIndicator');
        if (el) { el.classList.remove('opacity-0'); setTimeout(function() { el.classList.add('opacity-0'); }, 2000); }
    }

    var saveTimeout = null;
    function saveStates() {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(function() {
            try {
                var gId = '${guildId}' || window.location.pathname.split('/')[2];
                if (!gId) return;
                var disArr = Object.keys(disabledCmds).filter(function(k) { return disabledCmds[k] === true; });
                var xhr = new XMLHttpRequest();
                xhr.open('POST', '/api/guild/' + gId + '/settings', true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.onload = function() { try { if (JSON.parse(xhr.responseText).success) showSaved(); } catch(e) {} };
                xhr.send(JSON.stringify({ disabled_commands: JSON.stringify(disArr), command_configs: JSON.stringify(commandConfigs) }));
            } catch(e) {}
        }, 300);
    }

    window.switchCmdCategory = function(catKey) {
        currentCat = catKey;
        var bKeys = Object.keys(catBtnMap);
        for (var i = 0; i < bKeys.length; i++) {
            var btn = document.getElementById(catBtnMap[bKeys[i]]);
            if (!btn) continue;
            btn.className = bKeys[i] === catKey
                ? 'w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-l from-purple-600 to-blue-500 text-white shadow-lg transition cursor-pointer'
                : 'w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-blue-300 hover:text-white hover:bg-white/5 transition cursor-pointer';
        }
        render();
    };

    window.searchCommands = function() { render(); };

    window.filterCmdStatus = function(status) {
        currentFilter = status;
        var statusList = ['all','enabled','disabled'];
        for (var i = 0; i < statusList.length; i++) {
            var s = statusList[i];
            var label = s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1);
            var btn = document.getElementById('btnFilter' + label);
            if (btn) btn.className = s === status
                ? 'px-3 py-1 rounded-lg text-xs font-bold bg-gradient-to-l from-purple-600 to-blue-500 text-white transition shadow cursor-pointer'
                : 'px-3 py-1 rounded-lg text-xs font-bold text-blue-300 hover:text-white transition cursor-pointer';
        }
        render();
    };

    window.toggleAllCategoryCmds = function(enable) {
        var items = (DB[currentCat] || DB.general).items;
        for (var i = 0; i < items.length; i++) {
            if (enable) {
                delete disabledCmds[items[i].name];
            } else {
                disabledCmds[items[i].name] = true;
            }
        }
        render();
        saveStates();
    };

    window.toggleSingleCmd = function(cmdName, enabled) {
        if (enabled) {
            delete disabledCmds[cmdName];
        } else {
            disabledCmds[cmdName] = true;
        }
        updateCounters();
        saveStates();
    };

    window.toggleCmdAccordion = function(triggerEl, e) {
        if (e) {
            if (e.target && (e.target.closest('.toggle') || e.target.closest('input'))) return;
        }
        var cardWrap = triggerEl.closest('.cmd-card-wrap');
        if (!cardWrap) return;
        var panel = cardWrap.querySelector('.cmd-accordion');
        var arrow = cardWrap.querySelector('.cmd-expand-btn');
        if (!panel) return;
        var cmdName = cardWrap.getAttribute('data-cmd') || (arrow ? arrow.getAttribute('data-cmd') : null);

        var isOpen = panel.style.display !== 'none' && panel.style.display !== '';
        if (isOpen) {
            panel.style.display = 'none';
            if (arrow) arrow.innerHTML = '&#9660;';
        } else {
            panel.style.display = 'block';
            if (arrow) arrow.innerHTML = '&#9650;';
            if (!panel.getAttribute('data-loaded')) {
                loadAccordion(panel, cmdName);
                panel.setAttribute('data-loaded', '1');
            }
        }
    };

    // Event delegation — set up once, works for all dynamically rendered cards
    (function() {
        var container = document.getElementById('cmdsListContainer');
        if (!container) return;

        // Checkbox toggle (main enable/disable toggle only, not role/channel checkboxes)
        container.addEventListener('change', function(e) {
            var cb = e.target;
            if (cb.tagName !== 'INPUT' || cb.type !== 'checkbox') return;
            if (cb.classList.contains('cmd-role-chk') || cb.classList.contains('cmd-ch-chk')) return;
            if (!cb.hasAttribute('data-cmd')) return;
            window.toggleSingleCmd(cb.getAttribute('data-cmd'), cb.checked);
            var card = cb.closest('.cmd-card-wrap');
            if (card) {
                if (cb.checked) card.classList.remove('opacity-50');
                else card.classList.add('opacity-50');
            }
        });

        // Click delegation: Expand/collapse, Save details, Reset command
        container.addEventListener('click', function(e) {
            // Ignore if clicked on toggle slider or input
            if (e.target.closest('.toggle') || e.target.closest('input')) return;

            // 1. Expand / Collapse: either clicking arrow button or clicking card header
            var expBtn = e.target.closest('.cmd-expand-btn');
            var cardHeader = e.target.closest('.cmd-card-header');
            if (expBtn || cardHeader) {
                window.toggleCmdAccordion(expBtn || cardHeader, e);
                return;
            }

            // 2. Save details button
            var saveBtn = e.target.closest('.cmd-save-btn');
            if (saveBtn) {
                e.preventDefault();
                e.stopPropagation();
                var cmdName = saveBtn.getAttribute('data-cmd');
                var panel = saveBtn.closest('.cmd-accordion');
                if (!panel) return;
                var aliasInput = panel.querySelector('.cmd-alias-input');
                var a = aliasInput ? aliasInput.value.trim().replace(/^[\/!]+|[\/!]+$/g, '') : '';
                var roleChks = panel.querySelectorAll('.cmd-role-chk:checked');
                var chChks = panel.querySelectorAll('.cmd-ch-chk:checked');
                var roles = [], chs = [];
                for (var i = 0; i < roleChks.length; i++) roles.push(roleChks[i].getAttribute('data-rid'));
                for (var i = 0; i < chChks.length; i++) chs.push(chChks[i].getAttribute('data-chid'));
                if (!commandConfigs[cmdName]) commandConfigs[cmdName] = {};
                commandConfigs[cmdName].alias = a;
                commandConfigs[cmdName].allowedRoles = roles;
                commandConfigs[cmdName].allowedChannels = chs;
                var originalText = saveBtn.textContent;
                saveBtn.textContent = '✓ \u062a\u0645 \u0627\u0644\u062d\u0641\u0638';
                saveBtn.classList.remove('bg-gradient-to-l from-purple-600 to-blue-500', 'hover:bg-gradient-to-l from-purple-600 to-blue-500');
                saveBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
                setTimeout(function() {
                    saveBtn.textContent = originalText;
                    saveBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
                    saveBtn.classList.add('bg-gradient-to-l from-purple-600 to-blue-500', 'hover:bg-gradient-to-l from-purple-600 to-blue-500');
                }, 1500);
                saveStates();
                updateCounters();
                return;
            }

            // 3. Reset button
            var resetBtn = e.target.closest('.cmd-reset-btn');
            if (resetBtn) {
                e.preventDefault();
                e.stopPropagation();
                var cmdName = resetBtn.getAttribute('data-cmd');
                var panel = resetBtn.closest('.cmd-accordion');
                delete commandConfigs[cmdName];
                if (panel) {
                    panel.removeAttribute('data-loaded');
                    panel.style.display = 'none';
                }
                var cardWrap = resetBtn.closest('.cmd-card-wrap');
                var exp = cardWrap ? cardWrap.querySelector('.cmd-expand-btn') : null;
                if (exp) exp.innerHTML = '&#9660;';
                saveStates();
                updateCounters();
                return;
            }
        });
    })();

    render();
})();
</script>`;
            } else if (section === 'automod') {
formFieldsHtml = `                    <div class="space-y-6 text-left" dir="ltr">

                        <!-- 1. Master Toggle & Banner -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                            <label class="toggle">
                                <input type="checkbox" name="automod_enabled" value="1" ${settings.automod_enabled !== 0 ? 'checked' : ''} onchange="saveAutomodSetting('automod_enabled', this.checked)">
                                <span class="slider"></span>
                            </label>
                            <div class="flex items-center gap-3">
                                <div class="text-left">
                                    <h4 class="font-black text-white text-base">Auto Moderation</h4>
                                    <p class="text-white text-xs mt-0.5">Protect your server from unwanted content</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-blue-400/20 text-blue-400 flex items-center justify-center text-lg border border-blue-500/20">
                                    🛡️
                                </div>
                            </div>
                        </div>

                        <!-- 2. Discord AutoMod Header -->
                        <div class="space-y-4">
                            <div class="flex items-center justify-between">
                                <span class="text-[11px] text-white font-bold">Word Filters</span>
                                <div class="flex items-center gap-2 text-indigo-400 font-bold text-xs">
                                    <span>Discord AutoMod — Protection supported directly by Discord - fast and reliable</span>
                                    <span>🤖</span>
                                </div>
                            </div>

                            <!-- Banned Words Filtering -->
                            <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="bad_words_enabled" value="1" ${settings.bad_words_enabled ? 'checked' : ''} onchange="saveAutomodSetting('bad_words_enabled', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="document.getElementById('sec_strict_words').scrollIntoView({behavior:'smooth'})" class="text-white hover:text-gray-300 p-1 text-xs">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-left">
                                    <div>
                                        <div class="flex items-center justify-start gap-2">
                                            <h5 class="text-xs font-bold text-white">Banned Words Filtering</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">Enabled</span>
                                        </div>
                                        <p class="text-[10px] text-white mt-0.5">Filter offensive words, profanity, and inappropriate content</p>
                                    </div>
                                    <span class="text-base">🛡️</span>
                                </div>
                            </div>

                            <!-- Server Invites Blocking -->
                            <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_invites" value="1" ${settings.anti_invites ? 'checked' : ''} onchange="saveAutomodSetting('anti_invites', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_invites', 'Server Invites Blocking')" class="text-white hover:text-gray-300 p-1 text-xs" title="Settings">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-left">
                                    <div>
                                        <div class="flex items-center justify-start gap-2">
                                            <h5 class="text-xs font-bold text-white">Server Invites Blocking</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">Enabled</span>
                                        </div>
                                        <p class="text-[10px] text-white mt-0.5">Prevent sharing of other server invite links</p>
                                    </div>
                                    <span class="text-base">🚨</span>
                                </div>
                            </div>
                        </div>

                        <!-- 3. Spam Filters -->
                        <div class="space-y-3 pt-2">
                            <span class="text-[11px] text-white font-bold block">Spam Filters</span>

                            <!-- Anti Spam -->
                            <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_spam" value="1" ${settings.anti_spam ? 'checked' : ''} onchange="saveAutomodSetting('anti_spam', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_spam', 'Anti Spam')" class="text-white hover:text-gray-300 p-1 text-xs" title="Settings">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-left">
                                    <div>
                                        <div class="flex items-center justify-start gap-2">
                                            <h5 class="text-xs font-bold text-white">Anti Spam</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">Enabled</span>
                                        </div>
                                        <p class="text-[10px] text-white mt-0.5">Detect and block annoying and repetitive messages</p>
                                    </div>
                                    <span class="text-base">🛡️</span>
                                </div>
                            </div>

                            <!-- Link Blocking -->
                            <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_link" value="1" ${settings.anti_link ? 'checked' : ''} onchange="saveAutomodSetting('anti_link', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_link', 'Link Blocking')" class="text-white hover:text-gray-300 p-1 text-xs" title="Settings">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-left">
                                    <div>
                                        <div class="flex items-center justify-start gap-2">
                                            <h5 class="text-xs font-bold text-white">Link Blocking</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">Enabled</span>
                                        </div>
                                        <p class="text-[10px] text-white mt-0.5">Block unauthorized links</p>
                                    </div>
                                    <span class="text-base">🗑️</span>
                                </div>
                            </div>

                            <!-- Mention Spam Blocking -->
                            <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_mass_mention" value="1" ${settings.anti_mass_mention ? 'checked' : ''} onchange="saveAutomodSetting('anti_mass_mention', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_mass_mention', 'Mention Spam Blocking')" class="text-white hover:text-gray-300 p-1 text-xs" title="Settings">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-left">
                                    <div>
                                        <div class="flex items-center justify-start gap-2">
                                            <h5 class="text-xs font-bold text-white">Mention Spam Blocking</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">Enabled</span>
                                        </div>
                                        <p class="text-[10px] text-white mt-0.5">حدد عدد المنشنات المسموح بها في الرسالة الواحدة</p>
                                    </div>
                                    <span class="text-base">🔔</span>
                                </div>
                            </div>

                            <!-- حظر الحروف الكبيرة -->
                            <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_caps" value="1" ${settings.anti_caps ? 'checked' : ''} onchange="saveAutomodSetting('anti_caps', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_caps', 'حظر الحروف الكبيرة')" class="text-white hover:text-gray-300 p-1 text-xs" title="إعدادات">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">حظر الحروف الكبيرة</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-white mt-0.5">منع الرسائل التي تحتوي على أحرف كبيرة بشكل مفرط (70% أو أكثر)</p>
                                    </div>
                                    <span class="text-base">✏️</span>
                                </div>
                            </div>

                            <!-- إزعاج Spoilers -->
                            <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_spoilers" value="1" ${settings.anti_spoilers ? 'checked' : ''} onchange="saveAutomodSetting('anti_spoilers', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_spoilers', 'إزعاج Spoilers')" class="text-white hover:text-gray-300 p-1 text-xs" title="إعدادات">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">إزعاج Spoilers</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-white mt-0.5">منع الاستخدام المفرط لعلامات السبويلر</p>
                                    </div>
                                    <span class="text-base">🧕</span>
                                </div>
                            </div>

                            <!-- نص Zalgo -->
                            <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_zalgo" value="1" ${settings.anti_zalgo ? 'checked' : ''} onchange="saveAutomodSetting('anti_zalgo', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_zalgo', 'نص Zalgo')" class="text-white hover:text-gray-300 p-1 text-xs" title="إعدادات">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">نص Zalgo</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-white mt-0.5">منع النصوص المشوهة والرموز الغريبة (Zalgo text)</p>
                                    </div>
                                    <span class="text-base">🔎</span>
                                </div>
                            </div>
                        </div>

                        <!-- 4. حماية متقدمة - حماية البوت (Bot Shield Automod) -->
                        <div class="space-y-3 pt-4 border-t border-blue-500/20">
                            <div class="flex items-center justify-between">
                                <span class="text-[11px] text-white">مرونة أكثر في التخصيص</span>
                                <div class="flex items-center gap-2 text-amber-400 font-bold text-xs">
                                    <span>حماية البوت — حماية متقدمة يديرها البوت مباشرة</span>
                                    <span>🛡️</span>
                                </div>
                            </div>

                            <!-- مكافحة السبام المتقدم -->
                            <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_spam_adv" value="1" checked onchange="saveAutomodSetting('anti_spam_adv', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_spam_adv', 'مكافحة السبام المتقدم')" class="text-white hover:text-gray-300 p-1 text-xs" title="إعدادات">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">مكافحة السبام</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-white mt-0.5">كشف الرسائل المتكررة والفيضان السريع وحظرها تلقائياً</p>
                                    </div>
                                    <span class="text-base">🛡️</span>
                                </div>
                            </div>

                            <!-- Emoji Spam -->
                            <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_emoji" value="1" ${settings.anti_emoji ? 'checked' : ''} onchange="saveAutomodSetting('anti_emoji', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_emoji', 'Emoji Spam')" class="text-white hover:text-gray-300 p-1 text-xs" title="Settings">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-left">
                                    <div>
                                        <div class="flex items-center justify-start gap-2">
                                            <h5 class="text-xs font-bold text-white">Emoji Spam</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">Enabled</span>
                                        </div>
                                        <p class="text-[10px] text-white mt-0.5">Prevent excessive use of emojis</p>
                                    </div>
                                    <span class="text-base">✨</span>
                                </div>
                            </div>

                            <!-- Text Repeat -->
                            <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_text_repeat" value="1" ${settings.anti_text_repeat ? 'checked' : ''} onchange="saveAutomodSetting('anti_text_repeat', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_text_repeat', 'Text Repeat')" class="text-white hover:text-gray-300 p-1 text-xs" title="Settings">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-left">
                                    <div>
                                        <div class="flex items-center justify-start gap-2">
                                            <h5 class="text-xs font-bold text-white">Text Repeat</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">Enabled</span>
                                        </div>
                                        <p class="text-[10px] text-white mt-0.5">Prevent excessive repetition of same characters or words</p>
                                    </div>
                                    <span class="text-base">⏳</span>
                                </div>
                            </div>

                            <!-- Duplicate Messages -->
                            <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_repeat_messages" value="1" ${settings.anti_repeat_messages ? 'checked' : ''} onchange="saveAutomodSetting('anti_repeat_messages', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_repeat_messages', 'Duplicate Messages')" class="text-white hover:text-gray-300 p-1 text-xs" title="Settings">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-left">
                                    <div>
                                        <div class="flex items-center justify-start gap-2">
                                            <h5 class="text-xs font-bold text-white">Duplicate Messages</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">Enabled</span>
                                        </div>
                                        <p class="text-[10px] text-white mt-0.5">Prevent sending the same message multiple times consecutively</p>
                                    </div>
                                    <span class="text-base">📜</span>
                                </div>
                            </div>

                            <!-- Sticker Spam -->
                            <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_stickers" value="1" ${settings.anti_stickers ? 'checked' : ''} onchange="saveAutomodSetting('anti_stickers', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_stickers', 'Sticker Spam')" class="text-white hover:text-gray-300 p-1 text-xs" title="Settings">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-left">
                                    <div>
                                        <div class="flex items-center justify-start gap-2">
                                            <h5 class="text-xs font-bold text-white">Sticker Spam</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">Enabled</span>
                                        </div>
                                        <p class="text-[10px] text-white mt-0.5">Prevent sending stickers repeatedly and quickly</p>
                                    </div>
                                    <span class="text-base">✨</span>
                                </div>
                            </div>

                            <!-- Line Spam -->
                            <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_line_spam" value="1" ${settings.anti_line_spam ? 'checked' : ''} onchange="saveAutomodSetting('anti_line_spam', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_line_spam', 'Line Spam')" class="text-white hover:text-gray-300 p-1 text-xs" title="Settings">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-left">
                                    <div>
                                        <div class="flex items-center justify-start gap-2">
                                            <h5 class="text-xs font-bold text-white">Line Spam</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">Enabled</span>
                                        </div>
                                        <p class="text-[10px] text-white mt-0.5">Prevent messages with many empty lines</p>
                                    </div>
                                    <span class="text-base">⏳</span>
                                </div>
                            </div>

                            <!-- الرسائل الطويلة -->
                            <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                <div class="flex items-center gap-2">
                                    <label class="toggle"><input type="checkbox" name="anti_long_messages" value="1" ${settings.anti_long_messages ? 'checked' : ''} onchange="saveAutomodSetting('anti_long_messages', this.checked)"><span class="slider"></span></label>
                                    <button type="button" onclick="configureAutomodRule('anti_long_messages', 'الرسائل الطويلة')" class="text-white hover:text-gray-300 p-1 text-xs" title="إعدادات">⚙️</button>
                                </div>
                                <div class="flex items-center gap-3 text-right">
                                    <div>
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-xs font-bold text-white">الرسائل الطويلة</h5>
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">مفعل</span>
                                        </div>
                                        <p class="text-[10px] text-white mt-0.5">منع الرسائل التي تتجاوز الحد الأقصى لعدد الأحرف</p>
                                    </div>
                                    <span class="text-base">💬</span>
                                </div>
                            </div>
                        </div>

                        <!-- 5. نظام العقوبات التلقائية للتحذيرات -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                <span class="px-2.5 py-1 bg-amber-950/60 text-amber-300 border border-amber-800/40 rounded-xl text-xs font-mono font-bold" id="warnRulesCount">${(warnPunishmentsList || []).length} قاعدة</span>
                                <div class="text-right">
                                    <div class="flex items-center justify-end gap-2 text-white font-black text-sm">
                                        <span>نظام العقوبات التلقائية للتحذيرات</span>
                                        <span class="text-amber-400">⚠️</span>
                                    </div>
                                    <p class="text-white text-[10px] mt-0.5">تطبيق عقوبات تلقائية عند تجاوز عدد التحذيرات من أمر warn!</p>
                                </div>
                            </div>

                            <div id="warnPunishmentsList" class="space-y-2">
                                ${(warnPunishmentsList && warnPunishmentsList.length > 0) ? warnPunishmentsList.map(rule => `
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-3.5 rounded-xl flex items-center justify-between hover:border-amber-500/30 transition text-xs">
                                        <button type="button" onclick="deleteWarnRule(${rule.id})" class="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                                        <div class="flex items-center gap-3">
                                            <div class="text-right">
                                                <span class="font-bold text-white block">عند بلوغ ${rule.warn_count} تحذيرات</span>
                                                <span class="text-[10px] text-amber-400 font-mono">العقوبة: ${rule.action_type}</span>
                                            </div>
                                            <span class="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center font-bold">⚠️</span>
                                        </div>
                                    </div>
                                `).join('') : `
                                    <div class="py-8 text-center space-y-2">
                                        <div class="w-12 h-12 rounded-full bg-white/5 text-white flex items-center justify-center text-xl mx-auto">📋</div>
                                        <h5 class="text-xs font-bold text-gray-300">لا توجد قواعد بعد</h5>
                                        <p class="text-[10px] text-gray-500">أضف قاعدة عقوبة لتفعيل النظام</p>
                                    </div>
                                `}
                            </div>

                            <!-- زر إضافة قاعدة جديدة -->
                            <button type="button" onclick="openAddWarnModal()" class="w-full py-3 bg-[#111e36] hover:bg-[#14263e] border border-dashed border-amber-500/40 hover:border-amber-500/80 rounded-xl text-amber-300 font-bold text-xs transition flex items-center justify-center gap-2">
                                <span>➕</span>
                                <span>إضافة قاعدة جديدة</span>
                            </button>
                        </div>

                        <!-- 6. فلتر الكلمات المحظورة المشدد (Strict Bad Words Filter) -->
                        <div id="sec_strict_words" class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-5 shadow-xl">
                            <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                <label class="toggle">
                                    <input type="checkbox" name="strict_bad_words_enabled" value="1" ${settings.strict_bad_words_enabled ? 'checked' : ''} onchange="saveAutomodSetting('strict_bad_words_enabled', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <div class="text-right">
                                    <div class="flex items-center justify-end gap-2 text-rose-400 font-black text-sm">
                                        <span>فلتر الكلمات المحظورة المشدد</span>
                                        <span>🚫</span>
                                    </div>
                                    <p class="text-white text-[10px] mt-0.5">يعمل على جميع الأعضاء — يتخطى Discord AutoMod</p>
                                </div>
                            </div>

                            <!-- مربع الكلمات المحظورة -->
                            <div class="space-y-2">
                                <div class="flex items-center justify-between text-xs text-gray-300 font-bold">
                                    <div class="flex items-center gap-2 text-[10px] text-white">
                                        <span>جزئي — يحتوي على الكلمة في أي مكان</span>
                                        <span>•</span>
                                        <span>كلمة كاملة — الكلمة وحدها فقط</span>
                                    </div>
                                    <div class="flex items-center gap-1 text-white">
                                        <span>الكلمات المحظورة</span>
                                        <span>💬</span>
                                    </div>
                                </div>

                                <div class="flex items-center gap-2">
                                    <button type="button" onclick="addStrictBadWord()" class="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-rose-950/40">إضافة</button>
                                    <select id="strictWordMatchMode" class="bg-[#070d1d] border border-blue-500/20 rounded-xl px-3 py-2.5 text-xs text-gray-300 outline-none">
                                        <option value="partial">جزئي</option>
                                        <option value="exact">كلمة كاملة</option>
                                    </select>
                                    <input type="text" id="strictWordInput" placeholder="اكتب كلمة محظورة..." class="flex-1 bg-[#070d1d] border border-blue-500/20 focus:border-rose-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right" onkeydown="if(event.key==='Enter') addStrictBadWord()">
                                </div>

                                <div id="strictWordsContainer" class="flex flex-wrap gap-2 pt-2">
                                    ${(settings.bad_words_list ? settings.bad_words_list.split(/[\n,]+/).map(w => w.trim()).filter(Boolean) : []).map(w => `
                                        <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-950/60 text-rose-300 border border-rose-800/40 rounded-xl text-xs font-mono">
                                            <span>${w}</span>
                                            <button type="button" onclick="removeStrictBadWord('${w}')" class="text-rose-400 hover:text-gray-300 font-bold text-xs">×</button>
                                        </span>
                                    `).join('')}
                                </div>
                            </div>

                            <!-- كلمات مسموح بها (Whitelist) -->
                            <div class="space-y-2 pt-3 border-t border-blue-500/20">
                                <div class="flex items-center justify-end gap-1 text-xs font-bold text-emerald-400">
                                    <span>كلمات مسموح بها (Whitelist)</span>
                                    <span>🛡️</span>
                                </div>
                                <p class="text-[10px] text-white text-right">أضف كلمات تحتوي على كلمة محظورة لكنها مقبولة</p>

                                <div class="flex items-center gap-2">
                                    <button type="button" onclick="addWhitelistedWord()" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-950/40">إضافة</button>
                                    <input type="text" id="whitelistWordInput" placeholder="اكتب كلمة مسموح بها..." class="flex-1 bg-[#070d1d] border border-blue-500/20 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right" onkeydown="if(event.key==='Enter') addWhitelistedWord()">
                                </div>

                                <div id="whitelistWordsContainer" class="flex flex-wrap gap-2 pt-2">
                                    ${(settings.whitelist_words_list ? settings.whitelist_words_list.split(/[\n,]+/).map(w => w.trim()).filter(Boolean) : []).map(w => `
                                        <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 rounded-xl text-xs font-mono">
                                            <span>${w}</span>
                                            <button type="button" onclick="removeWhitelistedWord('${w}')" class="text-emerald-400 hover:text-gray-300 font-bold text-xs">×</button>
                                        </span>
                                    `).join('')}
                                </div>
                            </div>

                            <!-- أعضاء معفيون من الفلتر -->
                            <div class="space-y-2 pt-3 border-t border-blue-500/20">
                                <div class="flex items-center justify-end gap-1 text-xs font-bold text-white">
                                    <span>أعضاء معفيون من الفلتر</span>
                                    <span class="text-emerald-400">🛡️</span>
                                </div>
                                <input type="text" name="automod_exempt_users" value="${settings.automod_exempt_users || ''}" placeholder="ابحث عن عضو أو أدخل الـ ID..." class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-mono">
                                <p class="text-[10px] text-gray-500 text-right">الأدمنية غير معفيين تلقائياً — أضفهم هنا إذا أردت</p>
                            </div>

                            <!-- قناة السجل (اختياري) -->
                            <div class="space-y-2 pt-3 border-t border-blue-500/20">
                                <div class="flex items-center justify-end gap-1 text-xs font-bold text-white">
                                    <span>قناة السجل ((اختياري))</span>
                                    <span>📜</span>
                                </div>
                                ${renderChannelSelect('automod_log_channel', settings.automod_log_channel || settings.log_channel || '')}
                            </div>
                        </div>

                    </div>

                    <script>
                    async function saveAutomodSetting(key, value) {
                        try {
                            const res = await fetch('/api/guild/${guildId}/settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ [key]: value ? 1 : 0 })
                            });
                            const data = await res.json();
                            const status = document.getElementById('saveStatus');
                            if (status) {
                                status.classList.remove('hidden');
                                setTimeout(() => status.classList.add('hidden'), 3000);
                            }
                        } catch(e) {
                            console.error('Failed to save automod setting', e);
                        }
                    }

                    async function addStrictBadWord() {
                        const input = document.getElementById('strictWordInput');
                        const word = input.value.trim();
                        if (!word) return;
                        
                        let current = ${JSON.stringify(String(settings.bad_words_list || ''))};
                        let words = current ? current.split(/[\n,]+/).map(w => w.trim()).filter(Boolean) : [];
                        if (!words.includes(word)) {
                            words.push(word);
                            await fetch('/api/guild/${guildId}/settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ bad_words_list: words.join(',') })
                            });
                            location.reload();
                        }
                    }

                    async function removeStrictBadWord(word) {
                        let current = ${JSON.stringify(String(settings.bad_words_list || ''))};
                        let words = current ? current.split(/[\n,]+/).map(w => w.trim()).filter(Boolean) : [];
                        words = words.filter(w => w !== word);
                        await fetch('/api/guild/${guildId}/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ bad_words_list: words.join(',') })
                        });
                        location.reload();
                    }

                    async function addWhitelistedWord() {
                        const input = document.getElementById('whitelistWordInput');
                        const word = input.value.trim();
                        if (!word) return;

                        let current = ${JSON.stringify(String(settings.whitelist_words_list || ''))};
                        let words = current ? current.split(/[\n,]+/).map(w => w.trim()).filter(Boolean) : [];
                        if (!words.includes(word)) {
                            words.push(word);
                            await fetch('/api/guild/${guildId}/settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ whitelist_words_list: words.join(',') })
                            });
                            location.reload();
                        }
                    }

                    async function removeWhitelistedWord(word) {
                        let current = ${JSON.stringify(String(settings.whitelist_words_list || ''))};
                        let words = current ? current.split(/[\n,]+/).map(w => w.trim()).filter(Boolean) : [];
                        words = words.filter(w => w !== word);
                        await fetch('/api/guild/${guildId}/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ whitelist_words_list: words.join(',') })
                        });
                        location.reload();
                    }

                    async function openAddWarnModal() {
                        const count = prompt('أدخل عدد التحذيرات المطلوب لتنفيذ العقوبة (مثلاً: 3):');
                        if (!count || isNaN(count)) return;
                        const action = prompt('اختر نوع العقوبة:\\n1 = timeout_5m (عزل 5 دقائق)\\n2 = timeout_1h (عزل ساعة)\\n3 = timeout_24h (عزل 24 ساعة)\\n4 = kick (طرد)\\n5 = ban (حظر نهائي)', '1');
                        
                        const actionMap = { '1': 'timeout_5m', '2': 'timeout_1h', '3': 'timeout_24h', '4': 'kick', '5': 'ban' };
                        const finalAction = actionMap[action] || 'timeout_5m';

                        try {
                            const res = await fetch('/api/guild/${guildId}/warn-punishments', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ warnCount: parseInt(count), actionType: finalAction })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تمت إضافة قاعدة العقوبة التلقائية بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (data.error || 'فشل الإضافة'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
                    }

                    async function configureAutomodRule(ruleKey, ruleTitle) {
                        const exemptUsersSec = document.querySelector('input[name="automod_exempt_users"]');
                        if (ruleKey === 'anti_mass_mention') {
                            const currentLimit = prompt('أدخل الحد الأقصى للمنشنات المسموح بها في الرسالة الواحدة (مثلاً: 5):', '5');
                            if (currentLimit && !isNaN(currentLimit)) {
                                await saveAutomodSetting('anti_mass_mention_limit', parseInt(currentLimit));
                                alert('✅ تم تحديث حد المنشنات بنجاح!');
                            }
                        } else if (ruleKey === 'anti_long_messages') {
                            const currentLimit = prompt('أدخل الحد الأقصى لطول الرسالة بالأحرف (مثلاً: 1000):', '1000');
                            if (currentLimit && !isNaN(currentLimit)) {
                                await saveAutomodSetting('max_message_length', parseInt(currentLimit));
                                alert('✅ تم تحديث حد طول الرسائل بنجاح!');
                            }
                        } else if (ruleKey === 'bad_words_enabled') {
                            const sec = document.getElementById('sec_strict_words');
                            if (sec) sec.scrollIntoView({ behavior: 'smooth' });
                        } else {
                            if (exemptUsersSec) {
                                exemptUsersSec.scrollIntoView({ behavior: 'smooth' });
                                exemptUsersSec.focus();
                                alert('⚙️ إعدادات ' + ruleTitle + ':\\nيمكنك استثناء أعضاء محددين عبر حقل "أعضاء معفيون من الفلتر" بالأسفل.');
                            } else {
                                alert('⚙️ ' + ruleTitle + ' تعمل بكفاءة وفق الإعدادات الحالية.');
                            }
                        }
                    }

                    async function deleteWarnRule(ruleId) {
                        if (!confirm('هل أنت متأكد من رغبتك في حذف قاعدة العقوبة هذه؟')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/warn-punishments/' + ruleId, {
                                method: 'DELETE'
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم الحذف بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ خطأ في الحذف');
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
                    }
                    </script>
`;
            } else if (section === 'invites') {
const leaderboard = database.getInvitesLeaderboard ? database.getInvitesLeaderboard(guildId, 20) : [];
                const totalInvitesCount = leaderboard.reduce((acc, r) => acc + (r.total || 0), 0);
                const topInviter = leaderboard.length > 0 ? leaderboard[0] : null;

                const lbRowsHtml = leaderboard.length > 0 ? leaderboard.map((item, index) => {
                    const memberObj = botGuild?.members?.cache?.get(item.user_id);
                    const name = memberObj ? memberObj.user.username : `User (${item.user_id})`;
                    const avatar = memberObj ? memberObj.user.displayAvatarURL({ dynamic: true }) : 'https://cdn.discordapp.com/embed/avatars/0.png';
                    const medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : `#${index + 1}`));
                    return `
                        <tr class="border-b border-blue-500/20 hover:bg-white/[0.02] transition text-right">
                            <td class="py-3 px-4 font-bold text-center text-amber-400 font-mono">${medal}</td>
                            <td class="py-3 px-4 flex items-center gap-3 justify-end">
                                <div>
                                    <div class="font-bold text-white text-xs">${name}</div>
                                    <div class="text-[10px] text-gray-500 font-mono">${item.user_id}</div>
                                </div>
                                <img src="${avatar}" class="w-7 h-7 rounded-full object-cover">
                            </td>
                            <td class="py-3 px-4 font-bold text-emerald-400 font-mono text-center">${item.regular}</td>
                            <td class="py-3 px-4 font-bold text-rose-400 font-mono text-center">${item.leaves}</td>
                            <td class="py-3 px-4 font-bold text-orange-400 font-mono text-center">${item.fake}</td>
                            <td class="py-3 px-4 font-bold text-blue-400 font-mono text-center">${item.bonus}</td>
                            <td class="py-3 px-4 font-black text-yellow-400 font-mono text-center text-sm">${item.total}</td>
                        </tr>
                    `;
                }).join('') : `<tr><td colspan="7" class="text-center py-8 text-gray-500 text-xs">لا توجد بيانات دعوات مسجلة حتى الآن</td></tr>`;

                formFieldsHtml = `
                    <div class="space-y-6 text-right">
                        <!-- Top Header -->
                        <div class="flex flex-col md:flex-row items-center justify-between gap-4 bg-[#14233c] border border-blue-500/20 p-6 rounded-2xl">
                            <div class="flex items-center gap-3">
                                <button type="button" onclick="resetAllInvitesDirect()" class="px-4 py-2 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 rounded-xl text-xs font-bold transition">
                                    🗑️ تصفير كل الدعوات
                                </button>
                            </div>
                            <div>
                                <h3 class="font-black text-white text-xl">متتبع الدعوات المتقدم (Invite Tracker) 🔗</h3>
                                <p class="text-white text-xs mt-1">تتبع دقيق لمن قام بدعوة الأعضاء وحساب الدعوات الحقيقية والمغادرين والوهمية والبونص</p>
                            </div>
                        </div>

                        <!-- 3 Stat Cards -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div class="bg-[#14233c] border border-blue-500/20 p-4 rounded-2xl">
                                <span class="text-white text-[11px]">إجمالي الدعوات الصالحة</span>
                                <h4 class="text-2xl font-black text-yellow-400 mt-1 font-mono">${totalInvitesCount.toLocaleString()}</h4>
                                <span class="text-[10px] text-emerald-400">✨ دعوة نشطة في السيرفر</span>
                            </div>
                            <div class="bg-[#14233c] border border-blue-500/20 p-4 rounded-2xl">
                                <span class="text-white text-[11px]">متصدر الدعوات (Top Inviter)</span>
                                <h4 class="text-base font-black text-white mt-1 truncate">${topInviter ? (botGuild?.members?.cache?.get(topInviter.user_id)?.user.username || topInviter.user_id) : 'لا يوجد'}</h4>
                                <span class="text-[10px] text-amber-400 font-mono font-bold">${topInviter ? topInviter.total : 0} دعوة مسجلة</span>
                            </div>
                            <div class="bg-[#14233c] border border-blue-500/20 p-4 rounded-2xl">
                                <span class="text-white text-[11px]">الأعضاء المشاركون بالدعوة</span>
                                <h4 class="text-2xl font-black text-blue-400 mt-1 font-mono">${leaderboard.length}</h4>
                                <span class="text-[10px] text-indigo-400">👥 داعين مسجلين</span>
                            </div>
                        </div>

                        <!-- Add Bonus Invites Box -->
                        <div class="bg-[#14233c] border border-blue-500/20 p-6 rounded-2xl space-y-4">
                            <h4 class="font-bold text-white text-sm">🎁 إضافة أو خصم دعوات إضافية (Bonus Invites)</h4>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">أيدي أو منشن العضو (User ID)</label>
                                    <input type="text" id="bonusUserId" placeholder="مثال: 123456789012345678" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">عدد الدعوات (موجب للإضافة / سالب للخصم)</label>
                                    <input type="number" id="bonusAmount" value="5" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                                <div>
                                    <button type="button" onclick="submitBonusInvites()" class="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition shadow-lg">
                                        تطبيق الرصيد ✅
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Leaderboard Table -->
                        <div class="bg-[#14233c] border border-blue-500/20 rounded-2xl p-5 overflow-x-auto">
                            <h4 class="font-bold text-white text-sm mb-4">🏆 قائمة متصدري الدعوات (Top Invites Leaderboard)</h4>
                            <table class="w-full text-xs">
                                <thead>
                                    <tr class="border-b border-blue-500/20 text-white font-bold text-center">
                                        <th class="py-2.5 px-4">#</th>
                                        <th class="py-2.5 px-4 text-right">العضو</th>
                                        <th class="py-2.5 px-4">حقيقية (Regular)</th>
                                        <th class="py-2.5 px-4">مغادرين (Leaves)</th>
                                        <th class="py-2.5 px-4">وهمية (Fake)</th>
                                        <th class="py-2.5 px-4">بونص (Bonus)</th>
                                        <th class="py-2.5 px-4">الصافي (Total)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${lbRowsHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <script>
                    async function submitBonusInvites() {
                        let rawUser = document.getElementById('bonusUserId').value.trim();
                        const userId = rawUser.replace(/[^0-9]/g, '');
                        const amount = parseInt(document.getElementById('bonusAmount').value, 10);
                        if (!userId || isNaN(amount)) return alert('يرجى كتابة أيدي العضو أو منشن صالح وتحديد عدد الدعوات!');
                        const res = await fetch('/api/guild/${guildId}/invites/add-bonus', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId, amount })
                        });
                        const data = await res.json();
                        if (data.success) { alert('✅ تم تحديث رصيد دعوات العضو بنجاح!'); location.reload(); }
                        else alert('❌ خطأ: ' + (data.error || 'فشل التحديث'));
                    }

                    async function resetAllInvitesDirect() {
                        if (!confirm('⚠️ تحذير: هل أنت متأكد من تصفير كافة بيانات الدعوات في السيرفر؟ لا يمكن التراجع عن هذا الإجراء!')) return;
                        const res = await fetch('/api/guild/${guildId}/invites/reset', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({})
                        });
                        const data = await res.json();
                        if (data.success) { alert('✅ تم تصفير الدعوات بنجاح!'); location.reload(); }
                    }
                    </script>
                `;
            } else if (section === 'broadcast' || section === 'announcements') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">
                        <div class="bg-[#0b1322] border border-blue-500/20 p-8 rounded-3xl text-center space-y-4 shadow-xl">
                            <div class="w-16 h-16 rounded-2xl bg-rose-600/20 text-rose-400 border border-rose-500/30 flex items-center justify-center text-3xl mx-auto shadow-lg">🚫</div>
                            <h3 class="font-black text-white text-lg">تم إيقاف وحذف نظام الإعلانات والبرودكاست</h3>
                            <p class="text-white text-xs max-w-md mx-auto leading-relaxed">تم إزالة هذا القسم بالكامل من البوت بناءً على طلبكم. يمكنك استخدام رسائل الأمبد أو باقي الميزات لإدارة سيرفرك.</p>
                            <div class="pt-2">
                                <a href="/dashboard/${guildId}/embed" class="px-5 py-2.5 bg-gradient-to-l from-purple-600 to-blue-500 hover:bg-gradient-to-l from-purple-600 to-blue-500 text-white rounded-xl text-xs font-bold transition inline-block">الانتقال إلى رسائل الأمبد 📄</a>
                            </div>
                        </div>
                    </div>

<script>
(function() {
    var guildId = '${guildId}';
    function fetchStats() {
        fetch('/api/guild/' + guildId + '/online-count')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (!data.success) return;
                var elOnline = document.getElementById('onlineMembersCount');
                if (elOnline) elOnline.textContent = (data.online || 0).toLocaleString();
                var elBots = document.getElementById('botsCount');
                if (elBots) elBots.textContent = (data.bots || 0).toLocaleString();
                var elGw = document.getElementById('giveawaysCount');
                if (elGw) elGw.textContent = (data.giveaways || 0).toLocaleString();
            })
            .catch(function() {
                var elOnline = document.getElementById('onlineMembersCount');
                if (elOnline && elOnline.textContent === '\u2026') elOnline.textContent = '0';
                var elBots = document.getElementById('botsCount');
                if (elBots && elBots.textContent === '\u2026') elBots.textContent = '0';
            });
    }
    fetchStats();
    setInterval(fetchStats, 30000);
})();
</script>
`;
            } else if (section === 'protection') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Banner Alert: البوت لا يملك صلاحيات حرجة الآن -->
                        <div class="bg-[#1c1016] border border-rose-900/50 p-4 rounded-2xl flex items-center justify-between shadow-lg">
                            <div class="flex items-center gap-3">
                                <label class="toggle">
                                    <input type="checkbox" name="lock_dashboard" value="1" ${settings.lock_dashboard ? 'checked' : ''} onchange="saveProtectionSetting('lock_dashboard', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <span class="text-xs font-bold text-rose-300">قفل لوحة التحكم</span>
                            </div>
                            <div class="flex items-center gap-2 text-rose-400 font-bold text-xs">
                                <span>البوت لا يملك صلاحيات حرجة الآن</span>
                                <span class="text-base">⚠️</span>
                            </div>
                        </div>

                        <!-- 2. Master Toggle: تفعيل نظام الحماية -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                            <label class="toggle">
                                <input type="checkbox" name="anti_nuke_enabled" value="1" ${settings.anti_nuke_enabled !== 0 ? 'checked' : ''} onchange="saveProtectionSetting('anti_nuke_enabled', this.checked)">
                                <span class="slider"></span>
                            </label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-sm">تفعيل نظام الحماية</h4>
                                    <p class="text-white text-xs mt-0.5">تفعيل أو تعطيل نظام الحماية الشامل</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-blue-400/20 text-blue-400 flex items-center justify-center text-lg border border-blue-500/20">
                                    🛡️
                                </div>
                            </div>
                        </div>

                        <!-- 3. حماية المتصفح (Browser Protection) -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl space-y-3 shadow-lg">
                            <div class="flex items-center justify-between">
                                <span class="text-xs text-gray-500 font-mono">PRO ONLY</span>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">حماية المتصفح</h4>
                                        <p class="text-white text-xs mt-0.5">يزيل رتب الأعضاء المحمية مؤقتاً عند الدخول من متصفح — بوتات خاصة فقط</p>
                                    </div>
                                    <div class="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-lg border border-indigo-500/30">
                                        🌐
                                    </div>
                                </div>
                            </div>
                            <div class="bg-[#070d1d] border border-blue-500/20 p-3 rounded-xl flex items-center justify-end gap-2 text-white text-xs">
                                <span>هذه الميزة تعمل فقط مع البوتات الخاصة — يتطلب اشتراك بوت خاص نشط لهذا السيرفر.</span>
                                <span>🔒</span>
                            </div>
                        </div>

                        <!-- 4. تحديد وعقوبة -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl space-y-6 shadow-xl">
                            <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                <span id="badge_limit_punish" class="px-3 py-1 bg-amber-950/60 text-amber-300 border border-amber-800/40 rounded-xl text-xs font-bold font-mono">${[settings.anti_channel_delete, settings.anti_channel_create, settings.anti_channel_update, settings.anti_channel_permissions, settings.anti_role_delete, settings.anti_role_create, settings.anti_role_update, settings.anti_webhook_create, settings.anti_webhook_update, settings.anti_mass_ban, settings.anti_mass_kick, settings.anti_mass_mention].filter(Boolean).length}/12 مفعل</span>
                                <div class="flex items-center gap-2">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">تحديد وعقوبة</h4>
                                        <p class="text-white text-[11px]">تعيين حد وعقوبة لكل إجراء</p>
                                    </div>
                                    <span class="text-base">🛡️</span>
                                </div>
                            </div>

                            <!-- مجموعة 1: حماية الرومات / الشاتات -->
                            <div class="space-y-3">
                                <div class="flex items-center justify-between text-xs text-white font-bold">
                                    <span id="badge_grp_channels">${[settings.anti_channel_delete, settings.anti_channel_create, settings.anti_channel_update, settings.anti_channel_permissions].filter(Boolean).length}/4 مفعل</span>
                                    <span class="text-white">حماية الرومات / الشاتات</span>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <!-- مكافحة حذف القنوات -->
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_channel_delete" value="1" ${settings.anti_channel_delete ? 'checked' : ''} onchange="saveProtectionSetting('anti_channel_delete', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة حذف القنوات</h5>
                                                <p class="text-[10px] text-white">منع حذف قنوات جماعي</p>
                                            </div>
                                            <span class="text-sm">🗑️</span>
                                        </div>
                                    </div>

                                    <!-- مكافحة إنشاء القنوات -->
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_channel_create" value="1" ${settings.anti_channel_create ? 'checked' : ''} onchange="saveProtectionSetting('anti_channel_create', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة إنشاء القنوات</h5>
                                                <p class="text-[10px] text-white">منع إنشاء قنوات جماعي</p>
                                            </div>
                                            <span class="text-sm">📢</span>
                                        </div>
                                    </div>

                                    <!-- مكافحة تعديل القنوات -->
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_channel_update" value="1" ${settings.anti_channel_update ? 'checked' : ''} onchange="saveProtectionSetting('anti_channel_update', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة تعديل القنوات</h5>
                                                <p class="text-[10px] text-white">منع تعديل قنوات جماعي</p>
                                            </div>
                                            <span class="text-sm">#️⃣</span>
                                        </div>
                                    </div>

                                    <!-- حماية صلاحيات القنوات -->
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_channel_permissions" value="1" ${settings.anti_channel_permissions ? 'checked' : ''} onchange="saveProtectionSetting('anti_channel_permissions', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">حماية صلاحيات القنوات</h5>
                                                <p class="text-[10px] text-white">منع أي تعديل على صلاحيات القنوات بأي شكل (Allow/Deny/Overwrites)</p>
                                            </div>
                                            <span class="text-sm">⚙️</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- مجموعة 2: حماية الرتب -->
                            <div class="space-y-3 pt-4 border-t border-blue-500/20">
                                <div class="flex items-center justify-between text-xs text-white font-bold">
                                    <span id="badge_grp_roles">${[settings.anti_role_delete, settings.anti_role_create, settings.anti_role_update].filter(Boolean).length}/3 مفعل</span>
                                    <span class="text-white">حماية الرتب</span>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <!-- مكافحة حذف الرتب -->
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_role_delete" value="1" ${settings.anti_role_delete ? 'checked' : ''} onchange="saveProtectionSetting('anti_role_delete', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة حذف الرتب</h5>
                                                <p class="text-[10px] text-white">منع حذف رتب جماعي</p>
                                            </div>
                                            <span class="text-sm">🗑️</span>
                                        </div>
                                    </div>

                                    <!-- مكافحة إنشاء الرتب -->
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_role_create" value="1" ${settings.anti_role_create ? 'checked' : ''} onchange="saveProtectionSetting('anti_role_create', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة إنشاء الرتب</h5>
                                                <p class="text-[10px] text-white">منع إنشاء رتب جماعي</p>
                                            </div>
                                            <span class="text-sm">🎖️</span>
                                        </div>
                                    </div>

                                    <!-- مكافحة تعديل الرتب -->
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_role_update" value="1" ${settings.anti_role_update ? 'checked' : ''} onchange="saveProtectionSetting('anti_role_update', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة تعديل الرتب</h5>
                                                <p class="text-[10px] text-white">منع تعديل رتب جماعي</p>
                                            </div>
                                            <span class="text-sm">🏅</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- مجموعة 3: حماية الويب هوك -->
                            <div class="space-y-3 pt-4 border-t border-blue-500/20">
                                <div class="flex items-center justify-between text-xs text-white font-bold">
                                    <span id="badge_grp_webhooks">${[settings.anti_webhook_create, settings.anti_webhook_update].filter(Boolean).length}/2 مفعل</span>
                                    <span class="text-white">حماية الويب هوك</span>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <!-- مكافحة إنشاء الويب هوك -->
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_webhook_create" value="1" ${settings.anti_webhook_create ? 'checked' : ''} onchange="saveProtectionSetting('anti_webhook_create', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة إنشاء الويب هوك</h5>
                                                <p class="text-[10px] text-white">منع إنشاء الويب هوك وحذفه فوراً مع معاقبة المسؤول</p>
                                            </div>
                                            <span class="text-sm">⚙️</span>
                                        </div>
                                    </div>

                                    <!-- مكافحة تعديل الويب هوك -->
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_webhook_update" value="1" ${settings.anti_webhook_update ? 'checked' : ''} onchange="saveProtectionSetting('anti_webhook_update', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة تعديل الويب هوك</h5>
                                                <p class="text-[10px] text-white">منع التعديل الجماعي على الويب هوكات الحالية مع معاقبة المسؤول</p>
                                            </div>
                                            <span class="text-sm">⚙️</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- مجموعة 4: حماية الأعضاء -->
                            <div class="space-y-3 pt-4 border-t border-blue-500/20">
                                <div class="flex items-center justify-between text-xs text-white font-bold">
                                    <span id="badge_grp_members">${[settings.anti_mass_ban, settings.anti_mass_kick].filter(Boolean).length}/2 مفعل</span>
                                    <span class="text-white">حماية الأعضاء</span>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <!-- مكافحة الحظر -->
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_mass_ban" value="1" ${settings.anti_mass_ban ? 'checked' : ''} onchange="saveProtectionSetting('anti_mass_ban', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة الحظر</h5>
                                                <p class="text-[10px] text-white">منع الحظر الجماعي</p>
                                            </div>
                                            <span class="text-sm">🔨</span>
                                        </div>
                                    </div>

                                    <!-- مكافحة الطرد -->
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_mass_kick" value="1" ${settings.anti_mass_kick ? 'checked' : ''} onchange="saveProtectionSetting('anti_mass_kick', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة الطرد</h5>
                                                <p class="text-[10px] text-white">منع الطرد الجماعي</p>
                                            </div>
                                            <span class="text-sm">👢</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- مجموعة 5: حماية المحتوى -->
                            <div class="space-y-3 pt-4 border-t border-blue-500/20">
                                <div class="flex items-center justify-between text-xs text-white font-bold">
                                    <span id="badge_grp_content">${[settings.anti_mass_mention].filter(Boolean).length}/1 مفعل</span>
                                    <span class="text-white">حماية المحتوى</span>
                                </div>
                                <div class="grid grid-cols-1 gap-3">
                                    <!-- مكافحة المنشنات -->
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                        <label class="toggle"><input type="checkbox" name="anti_mass_mention" value="1" ${settings.anti_mass_mention ? 'checked' : ''} onchange="saveProtectionSetting('anti_mass_mention', this.checked)"><span class="slider"></span></label>
                                        <div class="flex items-center gap-2 text-right">
                                            <div>
                                                <h5 class="text-xs font-bold text-white">مكافحة المنشنات</h5>
                                                <p class="text-[10px] text-white">منع المنشنات المفرطة</p>
                                            </div>
                                            <span class="text-sm">📢</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>

                        <!-- 5. عقوبة فورية -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                <span id="badge_instant_punish" class="px-3 py-1 bg-rose-950/60 text-rose-300 border border-rose-800/40 rounded-xl text-xs font-bold font-mono">${[settings.anti_onboarding_danger, settings.anti_join_danger_roles, settings.anti_raid_fast, settings.anti_dangerous_perms, settings.anti_linked_roles, settings.anti_bot_add, settings.anti_prune, settings.anti_server_name_change, settings.anti_server_icon_change].filter(Boolean).length}/9 مفعل</span>
                                <div class="flex items-center gap-2">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">عقوبة فورية</h4>
                                        <p class="text-white text-[11px]">تطبيق العقوبة فوراً</p>
                                    </div>
                                    <span class="text-base">🏏</span>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <!-- رتب Onboarding الخطيرة -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_onboarding_danger" value="1" ${settings.anti_onboarding_danger ? 'checked' : ''} onchange="saveProtectionSetting('anti_onboarding_danger', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">رتب Onboarding الخطيرة</h5>
                                            <p class="text-[10px] text-white">يمنع منح رتبة بصلاحيات خطيرة تلقائياً لأي عضو جديد عبر أسئلة الانضمام (Onboarding)</p>
                                        </div>
                                        <span class="text-sm">🚨</span>
                                    </div>
                                </div>

                                <!-- رتب خطيرة عند الانضمام (حماية الانفايت) -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_join_danger_roles" value="1" ${settings.anti_join_danger_roles ? 'checked' : ''} onchange="saveProtectionSetting('anti_join_danger_roles', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">رتب خطيرة عند الانضمام (حماية الانفايت)</h5>
                                            <p class="text-[10px] text-white">يزيل تلقائياً أي رتبة استقرت على عضو جديد عبر رابط دعوة أو Onboarding ولم تكن الرتبة التلقائية الرسمية</p>
                                        </div>
                                        <span class="text-sm">🚨</span>
                                    </div>
                                </div>

                                <!-- مكافحة الريد -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_raid_fast" value="1" ${settings.anti_raid_fast ? 'checked' : ''} onchange="saveProtectionSetting('anti_raid_fast', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة الريد</h5>
                                            <p class="text-[10px] text-white">حماية ضد الانضمام الجماعي</p>
                                        </div>
                                        <span class="text-sm">🛡️</span>
                                    </div>
                                </div>

                                <!-- مكافحة الصلاحيات الخطيرة -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_dangerous_perms" value="1" ${settings.anti_dangerous_perms ? 'checked' : ''} onchange="saveProtectionSetting('anti_dangerous_perms', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة الصلاحيات الخطيرة</h5>
                                            <p class="text-[10px] text-white">منع منح صلاحيات خطيرة</p>
                                        </div>
                                        <span class="text-sm">🚨</span>
                                    </div>
                                </div>

                                <!-- مكافحة الرتب الخطيرة القابلة للربط -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_linked_roles" value="1" ${settings.anti_linked_roles ? 'checked' : ''} onchange="saveProtectionSetting('anti_linked_roles', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة الرتب الخطيرة القابلة للربط</h5>
                                            <p class="text-[10px] text-white">يمنع أي رتبة تحمل صلاحية خطيرة من أن تصبح قابلة للحصول عليها ذاتياً عبر ربط حساب خارجي (Linked Roles)</p>
                                        </div>
                                        <span class="text-sm">🚨</span>
                                    </div>
                                </div>

                                <!-- مكافحة إضافة البوتات -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_bot_add" value="1" ${settings.anti_bot_add ? 'checked' : ''} onchange="saveProtectionSetting('anti_bot_add', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة إضافة البوتات</h5>
                                            <p class="text-[10px] text-white">منع إضافة بوتات بدون إذن</p>
                                        </div>
                                        <span class="text-sm">🤖</span>
                                    </div>
                                </div>

                                <!-- مكافحة التطهير -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_prune" value="1" ${settings.anti_prune ? 'checked' : ''} onchange="saveProtectionSetting('anti_prune', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة التطهير</h5>
                                            <p class="text-[10px] text-white">منع تطهير الأعضاء</p>
                                        </div>
                                        <span class="text-sm">🧹</span>
                                    </div>
                                </div>

                                <!-- مكافحة تغيير اسم السيرفر -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_server_name_change" value="1" ${settings.anti_server_name_change ? 'checked' : ''} onchange="saveProtectionSetting('anti_server_name_change', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة تغيير اسم السيرفر</h5>
                                            <p class="text-[10px] text-white">منع تغيير اسم السيرفر</p>
                                        </div>
                                        <span class="text-sm">✏️</span>
                                    </div>
                                </div>

                                <!-- مكافحة تغيير أيقونة السيرفر -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_server_icon_change" value="1" ${settings.anti_server_icon_change ? 'checked' : ''} onchange="saveProtectionSetting('anti_server_icon_change', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة تغيير أيقونة السيرفر</h5>
                                            <p class="text-[10px] text-white">منع تغيير أيقونة السيرفر</p>
                                        </div>
                                        <span class="text-sm">🖼️</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 6. كشف فقط -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                <span id="badge_detect_only" class="px-3 py-1 bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 rounded-xl text-xs font-bold font-mono">${[settings.anti_scam, settings.anti_invite_links, settings.anti_nsfw_content, settings.anti_ghost_ping, settings.anti_channel_move, (settings.anti_webhook_spam !== 0 ? 1 : 0)].filter(Boolean).length}/6 مفعل</span>
                                <div class="flex items-center gap-2">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">كشف فقط</h4>
                                        <p class="text-white text-[11px]">تسجيل فقط بدون عقوبة</p>
                                    </div>
                                    <span class="text-base">🔭</span>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <!-- مكافحة الاحتيال -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_scam" value="1" ${settings.anti_scam ? 'checked' : ''} onchange="saveProtectionSetting('anti_scam', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة الاحتيال</h5>
                                            <p class="text-[10px] text-white">كشف وحذف روابط الاحتيال</p>
                                        </div>
                                        <span class="text-sm">🦅</span>
                                    </div>
                                </div>

                                <!-- مكافحة روابط الدعوة -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_invite_links" value="1" ${settings.anti_invite_links ? 'checked' : ''} onchange="saveProtectionSetting('anti_invite_links', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة روابط الدعوة</h5>
                                            <p class="text-[10px] text-white">حذف روابط الدعوة</p>
                                        </div>
                                        <span class="text-sm">🪵</span>
                                    </div>
                                </div>

                                <!-- مكافحة المحتوى الغير لائق -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_nsfw_content" value="1" ${settings.anti_nsfw_content ? 'checked' : ''} onchange="saveProtectionSetting('anti_nsfw_content', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة المحتوى الغير لائق</h5>
                                            <p class="text-[10px] text-white">حذف المحتوى الغير لائق</p>
                                        </div>
                                        <span class="text-sm">🛡️</span>
                                    </div>
                                </div>

                                <!-- مكافحة الغوست بينغ -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_ghost_ping" value="1" ${settings.anti_ghost_ping ? 'checked' : ''} onchange="saveProtectionSetting('anti_ghost_ping', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة الغوست بينغ</h5>
                                            <p class="text-[10px] text-white">كشف حذف المنشنات</p>
                                        </div>
                                        <span class="text-sm">👻</span>
                                    </div>
                                </div>

                                <!-- كشف نقل القنوات -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                    <label class="toggle"><input type="checkbox" name="anti_channel_move" value="1" ${settings.anti_channel_move ? 'checked' : ''} onchange="saveProtectionSetting('anti_channel_move', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">كشف نقل القنوات</h5>
                                            <p class="text-[10px] text-white">كشف نقل القنوات إلى تصنيفات أخرى (تنبيه فقط)</p>
                                        </div>
                                        <span class="text-sm">📍</span>
                                    </div>
                                </div>

                                <!-- مكافحة سبام الويب هوك -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-400/60 transition shadow-inner">
                                    <label class="toggle"><input type="checkbox" name="anti_webhook_spam" value="1" checked onchange="saveProtectionSetting('anti_webhook_spam', this.checked)"><span class="slider"></span></label>
                                    <div class="flex items-center gap-2 text-right">
                                        <div>
                                            <h5 class="text-xs font-bold text-white">مكافحة سبام الويب هوك</h5>
                                            <p class="text-[10px] text-white">يحذف تلقائياً رسائل السبام المرسلة عبر أي ويبهوك ويزيل الويب هوك نفسه — يعمل باستمرار بالخلفية</p>
                                        </div>
                                        <span class="text-sm">⚙️</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 7. الدفاع الذاتي للبوت (Self Defense - مقفلة دائماً) -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                <span class="text-[11px] text-white">مقفلة دائماً — تحمي البوت نفسه، لا يمكن إيقافها</span>
                                <div class="flex items-center gap-2">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">الدفاع الذاتي للبوت</h4>
                                    </div>
                                    <span class="text-base">🛡️</span>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between">
                                    <span class="px-2.5 py-1 bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 text-[10px] font-bold rounded-lg">مقفلة دائماً</span>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">مكافحة نزع صلاحيات البوت</h5>
                                        <p class="text-[10px] text-white">ينبهك (عبر رسالة خاصة) لو فقدت رتبة البوت نفسها صلاحيات حرجة — مثلاً عند إعادة استخدام رابط دعوته وإلغاء تحديد الصلاحيات</p>
                                    </div>
                                </div>

                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between">
                                    <span class="px-2.5 py-1 bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 text-[10px] font-bold rounded-lg">مقفلة دائماً</span>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">مكافحة إزالة رتبة البوت</h5>
                                        <p class="text-[10px] text-white">ينبهك (عبر رسالة خاصة) لو أزيلت من البوت مباشرة رتبة تمنحه صلاحيات حرجة</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    <script>
                    function updateProtectionBadges() {
                        const countChecked = (names) => names.reduce((acc, n) => {
                            const el = document.querySelector('input[name="' + n + '"]');
                            return acc + (el && el.checked ? 1 : 0);
                        }, 0);

                        const chNames = ['anti_channel_delete', 'anti_channel_create', 'anti_channel_update', 'anti_channel_permissions'];
                        const roleNames = ['anti_role_delete', 'anti_role_create', 'anti_role_update'];
                        const whNames = ['anti_webhook_create', 'anti_webhook_update'];
                        const memNames = ['anti_mass_ban', 'anti_mass_kick'];
                        const cntNames = ['anti_mass_mention'];
                        const instNames = ['anti_onboarding_danger', 'anti_join_danger_roles', 'anti_raid_fast', 'anti_dangerous_perms', 'anti_linked_roles', 'anti_bot_add', 'anti_prune', 'anti_server_name_change', 'anti_server_icon_change'];
                        const detNames = ['anti_scam', 'anti_invite_links', 'anti_nsfw_content', 'anti_ghost_ping', 'anti_channel_move', 'anti_webhook_spam'];

                        const bCh = document.getElementById('badge_grp_channels');
                        if (bCh) bCh.innerText = countChecked(chNames) + '/4 مفعل';

                        const bRoles = document.getElementById('badge_grp_roles');
                        if (bRoles) bRoles.innerText = countChecked(roleNames) + '/3 مفعل';

                        const bWh = document.getElementById('badge_grp_webhooks');
                        if (bWh) bWh.innerText = countChecked(whNames) + '/2 مفعل';

                        const bMem = document.getElementById('badge_grp_members');
                        if (bMem) bMem.innerText = countChecked(memNames) + '/2 مفعل';

                        const bCnt = document.getElementById('badge_grp_content');
                        if (bCnt) bCnt.innerText = countChecked(cntNames) + '/1 مفعل';

                        const allPunishNames = chNames.concat(roleNames, whNames, memNames, cntNames);
                        const bPunish = document.getElementById('badge_limit_punish');
                        if (bPunish) bPunish.innerText = countChecked(allPunishNames) + '/12 مفعل';

                        const bInst = document.getElementById('badge_instant_punish');
                        if (bInst) bInst.innerText = countChecked(instNames) + '/9 مفعل';

                        const bDet = document.getElementById('badge_detect_only');
                        if (bDet) bDet.innerText = countChecked(detNames) + '/6 مفعل';
                    }

                    async function saveProtectionSetting(key, value) {
                        updateProtectionBadges();
                        try {
                            const res = await fetch('/api/guild/${guildId}/settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ [key]: value ? 1 : 0 })
                            });
                            const data = await res.json();
                            const status = document.getElementById('saveStatus');
                            if (status) {
                                status.classList.remove('hidden');
                                setTimeout(() => status.classList.add('hidden'), 3000);
                            }
                        } catch(e) {
                            console.error('Failed to save protection setting', e);
                        }
                    }
                    </script>
`;
            } else if (section === 'whitelist') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Banner Alert: البوت لا يملك صلاحيات حرجة الآن -->
                        <div class="bg-[#1c1016] border border-rose-900/50 p-4 rounded-2xl flex items-center justify-between shadow-lg">
                            <div class="flex items-center gap-3">
                                <label class="toggle">
                                    <input type="checkbox" name="lock_dashboard" value="1" ${settings.lock_dashboard ? 'checked' : ''} onchange="saveProtectionSetting('lock_dashboard', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <span class="text-xs font-bold text-rose-300">قفل لوحة التحكم</span>
                            </div>
                            <div class="flex items-center gap-2 text-rose-400 font-bold text-xs">
                                <span>البوت لا يملك صلاحيات حرجة الآن</span>
                                <span class="text-base">⚠️</span>
                            </div>
                        </div>

                        <!-- 2. بطاقة إضافة عضو موثوق -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-end gap-2 text-emerald-400 font-black text-sm">
                                <span>إضافة عضو موثوق</span>
                                <span class="text-base">➕</span>
                            </div>

                            <div class="space-y-3">
                                <div>
                                    <input type="text" id="wlSearchUser" placeholder="ابحث عن عضو لإضافته..." class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right placeholder-gray-500">
                                </div>
                                <div class="flex items-center gap-3">
                                    <button type="button" onclick="addWhitelistUser('whitelist')" class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-emerald-950/40">
                                        <span>➕</span>
                                        <span>إضافة</span>
                                    </button>
                                    <input type="text" id="wlUserId" placeholder="أدخل معرف المستخدم (User ID) ثم اضغط إضافة أو Enter" class="flex-1 bg-[#070d1d] border border-blue-500/20 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-mono placeholder-gray-500" onkeydown="if(event.key==='Enter') addWhitelistUser('whitelist')">
                                </div>
                                <div class="text-[10px] text-gray-500 flex items-center justify-end gap-1">
                                    <span>اضغط Enter للإضافة السريعة</span>
                                    <span>ℹ️</span>
                                </div>
                            </div>
                        </div>

                        <!-- 3. قائمة الأعضاء الموثوقين -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                <span class="px-2.5 py-1 bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 rounded-xl text-xs font-mono font-bold" id="wlCountBadge">${(whitelistUsers || []).length} عضو</span>
                                <div class="flex items-center gap-2 text-white font-black text-sm">
                                    <span>الأعضاء الموثوقين</span>
                                    <span class="text-emerald-400">🛡️</span>
                                </div>
                            </div>

                            <div id="wlUsersList" class="space-y-2">
                                ${(whitelistUsers && whitelistUsers.length > 0) ? whitelistUsers.map(u => `
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-3.5 rounded-xl flex items-center justify-between hover:border-emerald-500/30 transition">
                                        <button type="button" onclick="removeWhitelistUser('${u.user_id}', 'whitelist')" class="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                                        <div class="flex items-center gap-3">
                                            <div class="text-right">
                                                <span class="text-xs font-bold text-white block font-mono">${u.user_id}</span>
                                                <span class="text-[10px] text-white">مستثنى من جميع فلاتر الحماية</span>
                                            </div>
                                            <div class="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold text-xs">👤</div>
                                        </div>
                                    </div>
                                `).join('') : `
                                    <div class="py-10 text-center space-y-2">
                                        <div class="w-12 h-12 rounded-full bg-white/5 text-white flex items-center justify-center text-xl mx-auto">👥</div>
                                        <h5 class="text-xs font-bold text-gray-300">لا يوجد أعضاء موثوقين</h5>
                                        <p class="text-[10px] text-gray-500">أضف أعضاء موثوقين أعلاه لاستثنائهم من قيود الحماية</p>
                                    </div>
                                `}
                            </div>
                        </div>

                        <!-- 4. نظام Anti Mod (محمي من العقوبات) -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                <span class="px-2.5 py-1 bg-amber-950/60 text-amber-300 border border-amber-800/40 rounded-xl text-xs font-mono font-bold" id="antiModCountBadge">${(antimodUsers || []).length} عضو</span>
                                <div class="flex items-center gap-2 text-white font-black text-sm">
                                    <span>نظام Anti Mod (محمي من العقوبات)</span>
                                    <span class="text-amber-400">🛡️</span>
                                </div>
                            </div>

                            <div class="space-y-3">
                                <div>
                                    <input type="text" id="antiModSearchUser" placeholder="ابحث عن عضو لإضافته..." class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right placeholder-gray-500">
                                </div>
                                <div class="flex items-center gap-3">
                                    <button type="button" onclick="addWhitelistUser('antimod')" class="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-blue-800/40">
                                        <span>إضافة</span>
                                    </button>
                                    <input type="text" id="antiModUserId" placeholder="أدخل User ID لإضافته إلى Anti Mod" class="flex-1 bg-[#070d1d] border border-blue-500/20 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-mono placeholder-gray-500" onkeydown="if(event.key==='Enter') addWhitelistUser('antimod')">
                                </div>
                            </div>

                            <div id="antiModUsersList" class="space-y-2 pt-2">
                                ${(antimodUsers && antimodUsers.length > 0) ? antimodUsers.map(u => `
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-3.5 rounded-xl flex items-center justify-between hover:border-amber-500/30 transition">
                                        <button type="button" onclick="removeWhitelistUser('${u.user_id}', 'antimod')" class="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                                        <div class="flex items-center gap-3">
                                            <div class="text-right">
                                                <span class="text-xs font-bold text-white block font-mono">${u.user_id}</span>
                                                <span class="text-[10px] text-amber-400/80">محمي من الطرد والحظر والعقوبات التلقائية</span>
                                            </div>
                                            <div class="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center font-bold text-xs">🛡️</div>
                                        </div>
                                    </div>
                                `).join('') : `
                                    <div class="py-6 text-center text-xs text-gray-500">
                                        لا يوجد أعضاء في Anti Mod حالياً.
                                    </div>
                                `}
                            </div>
                        </div>

                    </div>

                    <script>
                    async function addWhitelistUser(type) {
                        const inputId = type === 'antimod' ? 'antiModUserId' : 'wlUserId';
                        const input = document.getElementById(inputId);
                        const userId = input.value.trim();
                        if (!userId) return alert('يرجى إدخال معرف المستخدم (User ID)!');

                        try {
                            const res = await fetch('/api/guild/${guildId}/whitelist', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId, type })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم إضافة العضو بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (data.error || 'فشل الإضافة'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال بالخادم');
                        }
                    }

                    async function removeWhitelistUser(userId, type) {
                        if (!confirm('هل أنت متأكد من حذف هذا العضو؟')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/whitelist', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId, type })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم الحذف بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (data.error || 'فشل الحذف'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
                    }
                    </script>
`;
            } else if (section === 'protection-logs' || section === 'security-logs') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Banner Alert: البوت لا يملك صلاحيات حرجة الآن -->
                        <div class="bg-[#1c1016] border border-rose-900/50 p-4 rounded-2xl flex items-center justify-between shadow-lg">
                            <div class="flex items-center gap-3">
                                <label class="toggle">
                                    <input type="checkbox" name="lock_dashboard" value="1" ${settings.lock_dashboard ? 'checked' : ''} onchange="saveProtectionSetting('lock_dashboard', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <span class="text-xs font-bold text-rose-300">قفل لوحة التحكم</span>
                            </div>
                            <div class="flex items-center gap-2 text-rose-400 font-bold text-xs">
                                <span>البوت لا يملك صلاحيات حرجة الآن</span>
                                <span class="text-base">⚠️</span>
                            </div>
                        </div>

                        <!-- 2. بطاقتي تفعيل سجلات الأمان وسجلات الإشراف جنباً إلى جنب -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <!-- سجلات الأمان -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                                <label class="toggle">
                                    <input type="checkbox" name="security_logs_enabled" value="1" ${settings.security_logs_enabled !== 0 ? 'checked' : ''} onchange="saveProtectionSetting('security_logs_enabled', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">سجلات الأمان</h4>
                                        <p class="text-white text-xs mt-0.5">تسجيل أحداث الأمان</p>
                                    </div>
                                    <div class="w-10 h-10 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center text-lg border border-amber-500/30">
                                        🛡️
                                    </div>
                                </div>
                            </div>

                            <!-- سجلات الإشراف -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl flex items-center justify-between shadow-xl">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_logs_enabled" value="1" ${settings.mod_logs_enabled !== 0 ? 'checked' : ''} onchange="saveProtectionSetting('mod_logs_enabled', this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">سجلات الإشراف</h4>
                                        <p class="text-white text-xs mt-0.5">تسجيل إجراءات الإشراف</p>
                                    </div>
                                    <div class="w-10 h-10 rounded-xl bg-blue-400/20 text-blue-400 flex items-center justify-center text-lg border border-blue-500/20">
                                        👥
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 3. بطاقة ماذا يتم تسجيله؟ -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-6 shadow-xl">
                            <div class="flex items-center justify-end gap-2 text-white font-black text-sm border-b border-blue-500/20 pb-3">
                                <span>ماذا يتم تسجيله؟</span>
                                <span class="text-base">⚙️</span>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <!-- عمود سجلات الأمان -->
                                <div class="space-y-3">
                                    <div class="flex items-center justify-end gap-2 text-amber-400 font-bold text-xs">
                                        <span>سجلات الأمان</span>
                                        <span>🔒</span>
                                    </div>
                                    <div class="space-y-2">
                                        <div class="bg-[#070d1d] border border-blue-500/20 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                                            <span class="text-gray-300 font-medium">محاولات التدمير</span>
                                        </div>
                                        <div class="bg-[#070d1d] border border-blue-500/20 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                                            <span class="text-gray-300 font-medium">العقوبات التلقائية</span>
                                        </div>
                                        <div class="bg-[#070d1d] border border-blue-500/20 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                                            <span class="text-gray-300 font-medium">تجاوز الحدود</span>
                                        </div>
                                        <div class="bg-[#070d1d] border border-blue-500/20 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                                            <span class="text-gray-300 font-medium">أنشطة مشبوهة</span>
                                        </div>
                                        <div class="bg-[#070d1d] border border-blue-500/20 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                                            <span class="text-gray-300 font-medium">روابط الاحتيال</span>
                                        </div>
                                    </div>
                                </div>

                                <!-- عمود سجلات الإشراف -->
                                <div class="space-y-3">
                                    <div class="flex items-center justify-end gap-2 text-blue-400 font-bold text-xs">
                                        <span>سجلات الإشراف</span>
                                        <span>🛡️</span>
                                    </div>
                                    <div class="space-y-2">
                                        <div class="bg-[#070d1d] border border-blue-500/20 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-gradient-to-l from-purple-600 to-blue-500"></span>
                                            <span class="text-gray-300 font-medium">أوامر الحظر والطرد</span>
                                        </div>
                                        <div class="bg-[#070d1d] border border-blue-500/20 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-gradient-to-l from-purple-600 to-blue-500"></span>
                                            <span class="text-gray-300 font-medium">أوامر العزل والكتم</span>
                                        </div>
                                        <div class="bg-[#070d1d] border border-blue-500/20 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-gradient-to-l from-purple-600 to-blue-500"></span>
                                            <span class="text-gray-300 font-medium">التحذيرات</span>
                                        </div>
                                        <div class="bg-[#070d1d] border border-blue-500/20 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-gradient-to-l from-purple-600 to-blue-500"></span>
                                            <span class="text-gray-300 font-medium">حذف الرسائل</span>
                                        </div>
                                        <div class="bg-[#070d1d] border border-blue-500/20 p-3 rounded-xl flex items-center justify-between text-xs">
                                            <span class="w-2 h-2 rounded-full bg-gradient-to-l from-purple-600 to-blue-500"></span>
                                            <span class="text-gray-300 font-medium">قفل/فتح القنوات</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 4. جدول الأحداث والسجلات الحية المسجلة -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                <span class="px-2.5 py-1 bg-blue-800/60 text-white border border-blue-500/20 rounded-xl text-xs font-mono font-bold">${(securityLogsList || []).length} سجل مسجل</span>
                                <h4 class="font-black text-white text-sm">أحدث سجلات الأمان والإشراف المسجلة لحظياً</h4>
                            </div>

                            <div class="space-y-2">
                                ${(securityLogsList && securityLogsList.length > 0) ? securityLogsList.map(log => `
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-3.5 rounded-xl flex items-center justify-between text-xs hover:border-blue-500/20 transition">
                                        <span class="text-[10px] text-gray-500 font-mono">${new Date(log.created_at * 1000).toLocaleString(dashDateLocale(req, 'ar-SA'))}</span>
                                        <div class="flex items-center gap-3">
                                            <div class="text-right">
                                                <span class="font-bold text-white block">${log.reason || log.action_type}</span>
                                                <span class="text-[10px] text-white">${log.details || ''} ${log.executor_id ? `• المشرف: <span class="font-mono text-white">${log.executor_id}</span>` : ''}</span>
                                            </div>
                                            <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold ${log.category === 'security' ? 'bg-amber-950/60 text-amber-400 border border-amber-800/30' : 'bg-blue-800/60 text-blue-400 border border-blue-500/20'}">${log.category === 'security' ? 'أمان' : 'إشراف'}</span>
                                        </div>
                                    </div>
                                `).join('') : `
                                    <div class="py-8 text-center text-xs text-gray-500">
                                        لا توجد سجلات أمان مسجلة حتى الآن. السيرفر آمن تماماً! 🛡️
                                    </div>
                                `}
                            </div>
                        </div>

                    </div>

<script>
(function() {
    var guildId = '${guildId}';
    function fetchStats() {
        fetch('/api/guild/' + guildId + '/online-count')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (!data.success) return;
                var elOnline = document.getElementById('onlineMembersCount');
                if (elOnline) elOnline.textContent = (data.online || 0).toLocaleString();
                var elBots = document.getElementById('botsCount');
                if (elBots) elBots.textContent = (data.bots || 0).toLocaleString();
                var elGw = document.getElementById('giveawaysCount');
                if (elGw) elGw.textContent = (data.giveaways || 0).toLocaleString();
            })
            .catch(function() {
                var elOnline = document.getElementById('onlineMembersCount');
                if (elOnline && elOnline.textContent === '\u2026') elOnline.textContent = '0';
                var elBots = document.getElementById('botsCount');
                if (elBots && elBots.textContent === '\u2026') elBots.textContent = '0';
            });
    }
    fetchStats();
    setInterval(fetchStats, 30000);
})();
</script>
`;
            } else if (section === 'welcome') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Top Tab Switcher (رسائل الترحيب / رسائل المغادرة) -->
                        <div class="flex items-center gap-3 bg-[#080e1c] border border-blue-500/20 p-2 rounded-2xl w-fit">
                            <button type="button" onclick="switchWelcomeTab('leave')" id="btnTabLeave" class="px-5 py-2 rounded-xl text-xs font-bold transition text-white hover:text-gray-300">
                                <span>رسائل المغادرة</span>
                                <span class="text-rose-400">🚪</span>
                            </button>
                            <button type="button" onclick="switchWelcomeTab('welcome')" id="btnTabWelcome" class="px-5 py-2 rounded-xl text-xs font-bold transition bg-gradient-to-r from-blue-400 to-blue-600 text-white shadow-lg">
                                <span>رسائل الترحيب</span>
                                <span class="text-amber-300">👋</span>
                            </button>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 1. قسم رسائل الترحيب (Welcome Section - Exact to Image 2 & 3) -->
                        <!-- ========================================================= -->
                        <div id="sectionWelcomeBox" class="space-y-6">
                            <!-- Card 1: Master Header Card -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                                <label class="toggle">
                                    <input type="checkbox" name="welcome_enabled" value="1" ${settings.welcome_enabled !== 0 ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <div class="flex items-center justify-end gap-2 text-white font-black text-base">
                                            <span>مفعل</span>
                                            <span class="text-emerald-400">🎁</span>
                                        </div>
                                        <p class="text-white text-xs mt-0.5">إرسال رسالة أو إمبد ترحيبي عند انضمام عضو جديد للسيرفر</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Card 2: قناة الترحيب والرسالة -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-4 shadow-xl">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة الترحيب <span class="text-blue-400">*</span></label>
                                    ${renderChannelSelect('welcome_channel', settings.welcome_channel || '')}
                                </div>

                                <div class="space-y-2">
                                    <div class="flex items-center justify-between text-xs text-white font-bold">
                                        <span>☺</span>
                                        <span>رسالة الترحيب (نص عادي)</span>
                                    </div>
                                    <textarea name="welcome_message" id="welcomeText" rows="3" oninput="updateWelcomePreview()" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl p-4 text-xs text-white outline-none leading-relaxed text-right">${settings.welcome_message || 'مرحباً {user} في سيرفر **{server}**! 🎉 أنت العضو رقم **{memberCount}**'}</textarea>
                                    
                                    <!-- Variables Pill Badges -->
                                    <div class="flex items-center justify-between pt-1">
                                        <span class="text-[10px] text-gray-500">إذا تريد فقط Embed أو صورة بدون نص، اترك الرسالة فارغة.</span>
                                        <div class="flex flex-wrap gap-1.5 justify-end">
                                            <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{user}')">{user}</span>
                                            <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{username}')">{username}</span>
                                            <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{server}')">{server}</span>
                                            <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{memberCount}')">{memberCount}</span>
                                            <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{inviter}')">{inviter}</span>
                                            <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20 cursor-pointer" onclick="insertVar('welcomeText', '{joinDate}')">{joinDate}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Card 3: خيارات الترحيب الثلاثة (نص فقط / صورة ترحيب / رسالة Embed) -->
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <button type="button" onclick="setWelcomeType('text')" id="btnWlTypeText" class="p-4 rounded-2xl border ${settings.welcome_embed_enabled === 0 && !settings.welcome_image ? 'border-blue-400 bg-orange-950/20 text-white' : 'border-blue-500/20 bg-[#0b1322] text-white'} text-center transition">
                                    <h5 class="font-bold text-xs">نص فقط</h5>
                                    <p class="text-[10px] text-gray-500 mt-1">رسالة نصية بسيطة</p>
                                </button>
                                <button type="button" onclick="setWelcomeType('image')" id="btnWlTypeImage" class="p-4 rounded-2xl border ${settings.welcome_image ? 'border-blue-400 bg-orange-950/20 text-white' : 'border-blue-500/20 bg-[#0b1322] text-white'} text-center transition">
                                    <h5 class="font-bold text-xs">صورة ترحيب</h5>
                                    <p class="text-[10px] text-gray-500 mt-1">صورة مخصصة مع اسم العضو</p>
                                </button>
                                <button type="button" onclick="setWelcomeType('embed')" id="btnWlTypeEmbed" class="p-4 rounded-2xl border ${settings.welcome_embed_enabled !== 0 ? 'border-blue-400 bg-orange-950/20 text-white' : 'border-blue-500/20 bg-[#0b1322] text-white'} text-center transition">
                                    <h5 class="font-bold text-xs">رسالة Embed</h5>
                                    <p class="text-[10px] text-gray-500 mt-1">رسالة منسقة مع ألوان</p>
                                </button>
                            </div>

                            <input type="hidden" name="welcome_embed_enabled" id="welcome_embed_enabled" value="${settings.welcome_embed_enabled !== 0 ? 1 : 0}">
                            <input type="hidden" name="welcome_image" id="welcome_image" value="${settings.welcome_image ? 1 : 0}">

                            <!-- Upload Card: صورة الترحيب بنمط Wicks -->
                            <div class="bg-[#070d1d] border border-blue-500/20 hover:border-blue-500/20 rounded-2xl p-5 transition shadow-lg" id="welcomeImageUploadCard">
                                <div class="flex flex-col md:flex-row items-center justify-between gap-4">
                                    <!-- المعاينة وزر الحذف -->
                                    <div class="w-full md:w-auto flex flex-col items-center gap-2">
                                        <div class="w-full md:w-56 h-28 rounded-xl border border-blue-500/20 bg-[#0b1322] overflow-hidden flex items-center justify-center relative group">
                                            <img id="img_welcome_banner_image" src="${settings.welcome_banner_image || ''}" class="w-full h-full object-cover ${settings.welcome_banner_image ? '' : 'hidden'}">
                                            <div id="placeholder_welcome_banner_image" class="text-gray-500 text-xs flex flex-col items-center gap-1 ${settings.welcome_banner_image ? 'hidden' : ''}">
                                                <span class="text-2xl">🖼️</span>
                                                <span>لا توجد صورة</span>
                                            </div>
                                        </div>
                                        <button type="button" onclick="clearUploadedImageInDOM('welcome_banner_image')" class="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition font-bold py-1 px-3 rounded-lg hover:bg-rose-950/30 cursor-pointer">
                                            <span>🗑️</span>
                                            <span>إزالة الصورة</span>
                                        </button>
                                    </div>

                                    <!-- نصوص الشرح -->
                                    <div class="flex-1 text-right space-y-1 w-full">
                                        <div class="flex items-center justify-end gap-2">
                                            <h5 class="text-sm font-black text-white">صورة بانر الترحيب</h5>
                                            <span class="text-blue-400 text-base">🖼️</span>
                                        </div>
                                        <ul class="text-[11px] text-white space-y-0.5 list-disc list-inside">
                                            <li>ستظهر هذه الصورة كبانر رئيسي مع رسالة الترحيب بالأعضاء الجدد.</li>
                                            <li>الحد الأدنى الموصى به للحجم هو 1024x512 بكسل.</li>
                                            <li>الصيغ المدعومة: PNG, JPG, GIF, WEBP.</li>
                                        </ul>
                                    </div>

                                    <!-- زر الرفع -->
                                    <div class="w-full md:w-auto flex justify-end">
                                        <input type="file" id="file_welcome_banner_image" accept="image/*" class="hidden" onchange="uploadImageFile(this, 'welcome_banner_image')">
                                        <input type="hidden" id="input_welcome_banner_image" name="welcome_banner_image" value="${settings.welcome_banner_image || ''}">
                                        <button type="button" onclick="document.getElementById('file_welcome_banner_image').click()" class="px-6 py-2.5 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-blue-700/30 flex items-center gap-2 cursor-pointer w-full md:w-auto justify-center">
                                            <span>📤</span>
                                            <span id="btn_text_welcome_banner_image">رفع الصورة</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <!-- Card 4: تخصيص رسالة الترحيب / الإيمبد (Live Preview & Embed Customizer - Exact to Image 2 & 3) -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-4 shadow-xl">
                                <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                    <div class="flex flex-wrap gap-1.5">
                                        <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20">{user}</span>
                                        <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20">{username}</span>
                                        <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20">{server}</span>
                                        <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20">{memberCount}</span>
                                        <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20">{user.avatar}</span>
                                        <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20">{inviter}</span>
                                    </div>
                                    <h5 class="text-xs font-black text-white">تخصيص رسالة الترحيب</h5>
                                </div>

                                <!-- Color Pickers Palette -->
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs font-mono text-white">#EF5700</span>
                                        <input type="color" name="welcome_embed_color" id="wlColorInput" value="${settings.welcome_embed_color || '#ef5700'}" class="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0">
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs font-bold text-gray-300">لون الإيمبد</span>
                                        <div class="flex items-center gap-1.5">
                                            <button type="button" onclick="setWlColor('#93c5fd')" class="w-4 h-4 rounded-md bg-[#93c5fd]"></button>
                                            <button type="button" onclick="setWlColor('#93c5fd')" class="w-4 h-4 rounded-md bg-[#93c5fd]"></button>
                                            <button type="button" onclick="setWlColor('#10b981')" class="w-4 h-4 rounded-md bg-[#10b981]"></button>
                                            <button type="button" onclick="setWlColor('#ec4899')" class="w-4 h-4 rounded-md bg-[#ec4899]"></button>
                                            <button type="button" onclick="setWlColor('#ef4444')" class="w-4 h-4 rounded-md bg-[#ef4444]"></button>
                                            <button type="button" onclick="setWlColor('#60a5fa')" class="w-4 h-4 rounded-md bg-[#60a5fa]"></button>
                                            <button type="button" onclick="setWlColor('#ef5700')" class="w-4 h-4 rounded-md bg-[#ef5700] ring-2 ring-blue-300/50"></button>
                                        </div>
                                    </div>
                                </div>

                                <!-- Live Interactive Embed Card (Exact to Image 3) -->
                                <div id="wlPreviewEmbed" class="bg-[#070d1d] border-r-4 border-blue-400 rounded-xl p-5 space-y-4 text-right shadow-inner">
                                    <div class="flex items-center justify-end gap-2 text-xs font-bold text-white">
                                        <span>${guild.name}</span>
                                        <img src="${guildIcon}" class="w-5 h-5 rounded-full object-cover">
                                    </div>

                                    <div class="space-y-1">
                                        <h4 class="text-sm font-black text-white flex items-center justify-end gap-1.5">
                                            <span>مرحباً بك!</span>
                                            <span>🎉</span>
                                        </h4>
                                        <p id="pvWlMsg" class="text-xs text-gray-300">مرحباً {user} في سيرفر **{server}**! أنت العضو رقم **{memberCount}**</p>
                                    </div>

                                    <div class="border border-dashed border-blue-500/20 rounded-xl p-6 text-center text-gray-600 text-xs">
                                        <span>🖼️ [صورة البنر أو بطاقة الترحيب]</span>
                                    </div>

                                    <div class="flex items-center justify-between text-[10px] text-gray-500 border-t border-blue-500/20 pt-2 font-mono">
                                        <span>نتمنى لك وقتاً ممتعاً 🕒</span>
                                        <div class="flex items-center gap-1">
                                            <input type="checkbox" checked id="wlShowTime">
                                            <label for="wlShowTime">إظهار الوقت</label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 2. قسم رسائل المغادرة (Leave Section - Exact to Image 4 & 5) -->
                        <!-- ========================================================= -->
                        <div id="sectionLeaveBox" class="space-y-6 hidden">
                            <!-- Card 1: Master Header Card -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                                <label class="toggle">
                                    <input type="checkbox" name="leave_enabled" value="1" ${settings.leave_enabled ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <div class="flex items-center justify-end gap-2 text-white font-black text-base">
                                            <span>مفعل</span>
                                            <span class="text-rose-400">🚪</span>
                                        </div>
                                        <p class="text-white text-xs mt-0.5">إرسال رسالة عند مغادرة عضو من السيرفر</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Card 2: قناة المغادرة والرسالة -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-4 shadow-xl">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة المغادرة <span class="text-rose-400">*</span></label>
                                    ${renderChannelSelect('leave_channel', settings.leave_channel || '')}
                                </div>

                                <div class="space-y-2">
                                    <div class="flex items-center justify-between text-xs text-white font-bold">
                                        <span>☺</span>
                                        <span>رسالة المغادرة (نص عادي)</span>
                                    </div>
                                    <textarea name="leave_message" id="leaveText" rows="3" oninput="updateLeavePreview()" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-rose-500 rounded-xl p-4 text-xs text-white outline-none leading-relaxed text-right">${settings.leave_message || 'وداعاً **{user}**، نتمنى لك التوفيق 👋'}</textarea>
                                    
                                    <!-- Variables Pill Badges -->
                                    <div class="flex items-center justify-end gap-1.5 pt-1">
                                        <span class="text-[10px] font-mono bg-[#14233c] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20 cursor-pointer" onclick="insertVar('leaveText', '{user}')">{user}</span>
                                        <span class="text-[10px] font-mono bg-[#14233c] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20 cursor-pointer" onclick="insertVar('leaveText', '{username}')">{username}</span>
                                        <span class="text-[10px] font-mono bg-[#14233c] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20 cursor-pointer" onclick="insertVar('leaveText', '{server}')">{server}</span>
                                        <span class="text-[10px] font-mono bg-[#14233c] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20 cursor-pointer" onclick="insertVar('leaveText', '{memberCount}')">{memberCount}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Card 3: خيارات المغادرة (رسالة نصية / رسالة Embed) -->
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <button type="button" onclick="setLeaveType('text')" id="btnLvTypeText" class="p-4 rounded-2xl border ${settings.leave_embed_enabled === 0 ? 'border-rose-500 bg-rose-950/20 text-white' : 'border-blue-500/20 bg-[#0b1322] text-white'} text-center transition">
                                    <h5 class="font-bold text-xs">رسالة نصية</h5>
                                    <p class="text-[10px] text-gray-500 mt-1">رسالة بسيطة</p>
                                </button>
                                <button type="button" onclick="setLeaveType('embed')" id="btnLvTypeEmbed" class="p-4 rounded-2xl border ${settings.leave_embed_enabled !== 0 ? 'border-rose-500 bg-rose-950/20 text-white' : 'border-blue-500/20 bg-[#0b1322] text-white'} text-center transition">
                                    <h5 class="font-bold text-xs">رسالة Embed</h5>
                                    <p class="text-[10px] text-gray-500 mt-1">رسالة منسقة مع ألوان</p>
                                </button>
                            </div>

                            <input type="hidden" name="leave_embed_enabled" id="leave_embed_enabled" value="${settings.leave_embed_enabled !== 0 ? 1 : 0}">

                            <!-- Card 4: تخصيص رسالة المغادرة (Live Preview & Colors) -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-4 shadow-xl">
                                <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                    <div class="flex flex-wrap gap-1.5">
                                        <span class="text-[10px] font-mono bg-[#14233c] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20">{user}</span>
                                        <span class="text-[10px] font-mono bg-[#14233c] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20">{username}</span>
                                        <span class="text-[10px] font-mono bg-[#14233c] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20">{server}</span>
                                        <span class="text-[10px] font-mono bg-[#14233c] text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/20">{memberCount}</span>
                                    </div>
                                    <h5 class="text-xs font-black text-white">تخصيص رسالة المغادرة</h5>
                                </div>

                                <!-- Color Pickers Palette -->
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs font-mono text-white">#EF4444</span>
                                        <input type="color" name="leave_embed_color" id="lvColorInput" value="${settings.leave_embed_color || '#ef4444'}" class="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0">
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs font-bold text-gray-300">لون الإيمبد</span>
                                        <div class="flex items-center gap-1.5">
                                            <button type="button" onclick="setLvColor('#ef4444')" class="w-4 h-4 rounded-md bg-[#ef4444] ring-2 ring-blue-300/50"></button>
                                            <button type="button" onclick="setLvColor('#60a5fa')" class="w-4 h-4 rounded-md bg-[#60a5fa]"></button>
                                            <button type="button" onclick="setLvColor('#eab308')" class="w-4 h-4 rounded-md bg-[#eab308]"></button>
                                            <button type="button" onclick="setLvColor('#10b981')" class="w-4 h-4 rounded-md bg-[#10b981]"></button>
                                            <button type="button" onclick="setLvColor('#06b6d4')" class="w-4 h-4 rounded-md bg-[#06b6d4]"></button>
                                            <button type="button" onclick="setLvColor('#93c5fd')" class="w-4 h-4 rounded-md bg-[#93c5fd]"></button>
                                        </div>
                                    </div>
                                </div>

                                <!-- Live Interactive Leave Embed Card -->
                                <div id="lvPreviewEmbed" class="bg-[#070d1d] border-r-4 border-rose-500 rounded-xl p-5 space-y-4 text-right shadow-inner">
                                    <div class="flex items-center justify-end gap-2 text-xs font-bold text-white">
                                        <span>${guild.name}</span>
                                        <img src="${guildIcon}" class="w-5 h-5 rounded-full object-cover">
                                    </div>

                                    <div class="space-y-1">
                                        <h4 class="text-sm font-black text-white flex items-center justify-end gap-1.5">
                                            <span>وداعاً 👋</span>
                                        </h4>
                                        <p id="pvLvMsg" class="text-xs text-gray-300">وداعاً **{username}**، نتمنى لك التوفيق</p>
                                    </div>

                                    <div class="border border-dashed border-blue-500/20 rounded-xl p-6 text-center text-gray-600 text-xs">
                                        <span>🖼️ [صورة البنر أو بطاقة المغادرة]</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    <script>
                    function switchWelcomeTab(tab) {
                        const secWl = document.getElementById('sectionWelcomeBox');
                        const secLv = document.getElementById('sectionLeaveBox');
                        const btnWl = document.getElementById('btnTabWelcome');
                        const btnLv = document.getElementById('btnTabLeave');

                        if (tab === 'welcome') {
                            secWl.classList.remove('hidden');
                            secLv.classList.add('hidden');
                            btnWl.className = "px-5 py-2 rounded-xl text-xs font-bold transition bg-gradient-to-r from-blue-400 to-blue-600 text-white shadow-lg";
                            btnLv.className = "px-5 py-2 rounded-xl text-xs font-bold transition text-blue-300 hover:text-white";
                        } else {
                            secWl.classList.add('hidden');
                            secLv.classList.remove('hidden');
                            btnLv.className = "px-5 py-2 rounded-xl text-xs font-bold transition bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-lg";
                            btnWl.className = "px-5 py-2 rounded-xl text-xs font-bold transition text-blue-300 hover:text-white";
                        }
                    }

                    function insertVar(targetId, varName) {
                        const el = document.getElementById(targetId);
                        if (!el) return;
                        el.value += ' ' + varName;
                        if (targetId === 'welcomeText') updateWelcomePreview();
                        if (targetId === 'leaveText') updateLeavePreview();
                    }

                    function updateWelcomePreview() {
                        const msg = document.getElementById('welcomeText').value;
                        const pv = document.getElementById('pvWlMsg');
                        if (pv) pv.innerText = msg || 'مرحباً {user} في سيرفر **{server}**!';
                    }

                    function updateLeavePreview() {
                        const msg = document.getElementById('leaveText').value;
                        const pv = document.getElementById('pvLvMsg');
                        if (pv) pv.innerText = msg || 'وداعاً **{user}**، نتمنى لك التوفيق';
                    }

                    function setWelcomeType(type) {
                        document.getElementById('welcome_embed_enabled').value = type === 'embed' ? 1 : 0;
                        document.getElementById('welcome_image').value = type === 'image' ? 1 : 0;
                        
                        document.getElementById('btnWlTypeText').className = type === 'text' ? 'p-4 rounded-2xl border border-blue-400 bg-orange-950/20 text-white text-center transition' : 'p-4 rounded-2xl border border-blue-500/20 bg-[#0b1322] text-blue-300 text-center transition';
                        document.getElementById('btnWlTypeImage').className = type === 'image' ? 'p-4 rounded-2xl border border-blue-400 bg-orange-950/20 text-white text-center transition' : 'p-4 rounded-2xl border border-blue-500/20 bg-[#0b1322] text-blue-300 text-center transition';
                        document.getElementById('btnWlTypeEmbed').className = type === 'embed' ? 'p-4 rounded-2xl border border-blue-400 bg-orange-950/20 text-white text-center transition' : 'p-4 rounded-2xl border border-blue-500/20 bg-[#0b1322] text-blue-300 text-center transition';
                    }

                    function setLeaveType(type) {
                        document.getElementById('leave_embed_enabled').value = type === 'embed' ? 1 : 0;
                        document.getElementById('btnLvTypeText').className = type === 'text' ? 'p-4 rounded-2xl border border-rose-500 bg-rose-950/20 text-white text-center transition' : 'p-4 rounded-2xl border border-blue-500/20 bg-[#0b1322] text-blue-300 text-center transition';
                        document.getElementById('btnLvTypeEmbed').className = type === 'embed' ? 'p-4 rounded-2xl border border-rose-500 bg-rose-950/20 text-white text-center transition' : 'p-4 rounded-2xl border border-blue-500/20 bg-[#0b1322] text-blue-300 text-center transition';
                    }

                    function setWlColor(c) {
                        document.getElementById('wlColorInput').value = c;
                        document.getElementById('wlPreviewEmbed').style.borderRightColor = c;
                    }

                    function setLvColor(c) {
                        document.getElementById('lvColorInput').value = c;
                        document.getElementById('lvPreviewEmbed').style.borderRightColor = c;
                    }
                    </script>
`;
            } else if (section === 'autoresponder') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Master Header Card (Exact to Image 1) -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <button type="button" onclick="openAddAutoresponderModal()" class="px-6 py-2.5 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-blue-800/40">
                                <span>➕</span>
                                <span>إضافة رد تلقائي</span>
                            </button>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">الرد التلقائي</h4>
                                    <p class="text-white text-xs mt-0.5">إعداد ردود تلقائية على كلمات أو عبارات معينة</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center text-lg border border-blue-500/20">
                                    💬
                                </div>
                            </div>
                        </div>

                        <!-- 2. Triple Stats Badges (Exact to Image 1) -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <!-- إجمالي الردود -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(autoRespondersList || []).length}</span>
                                <span class="text-xs font-bold text-white block">إجمالي الردود</span>
                            </div>
                            <!-- ردود نشطة -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-emerald-400 font-mono">${(autoRespondersList || []).filter(r => r.is_active !== 0).length}</span>
                                <span class="text-xs font-bold text-white block">ردود نشطة</span>
                            </div>
                            <!-- إجمالي الاستخدام -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(autoRespondersList || []).reduce((acc, r) => acc + (r.uses_count || 0), 0)}</span>
                                <span class="text-xs font-bold text-white block">إجمالي الاستخدام</span>
                            </div>
                        </div>

                        <!-- 3. Main List / Empty State Card (Exact to Image 1) -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-8 rounded-2xl space-y-6 shadow-xl">
                            ${(autoRespondersList && autoRespondersList.length > 0) ? `
                                <div class="space-y-3">
                                    <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                        <span class="text-xs font-mono text-white font-bold">${autoRespondersList.length} رد مسجل</span>
                                        <h5 class="text-xs font-black text-white">الردود التلقائية النشطة</h5>
                                    </div>
                                    ${autoRespondersList.map(r => `
                                        <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition">
                                            <button type="button" onclick="deleteAutoresponderItem(${r.id})" class="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                                            <div class="text-right space-y-1">
                                                <div class="flex items-center justify-end gap-2">
                                                    <span class="px-2 py-0.5 bg-white/5 text-white rounded text-[10px] font-mono">${r.match_mode || 'يحتوي على'}</span>
                                                    <span class="px-2.5 py-0.5 bg-orange-950/60 text-orange-300 border border-orange-800/40 rounded-lg text-xs font-bold font-mono">${r.trigger_word}</span>
                                                    <span class="text-white text-xs font-bold">الكلمة:</span>
                                                </div>
                                                <p class="text-xs text-gray-300">${r.reply_text}</p>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : `
                                <div class="py-12 text-center space-y-4">
                                    <div class="w-14 h-14 rounded-2xl bg-white/5 text-white flex items-center justify-center text-2xl mx-auto border border-blue-500/20">
                                        💬
                                    </div>
                                    <div class="space-y-1">
                                        <h5 class="text-sm font-black text-white">لا توجد ردود تلقائية</h5>
                                        <p class="text-xs text-white">أضف ردود تلقائية للرد على كلمات أو عبارات محددة</p>
                                    </div>
                                    <button type="button" onclick="openAddAutoresponderModal()" class="px-6 py-2.5 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-2 shadow-lg shadow-blue-800/40">
                                        <span>إضافة أول رد تلقائي</span>
                                    </button>
                                </div>
                            `}
                        </div>

                        <!-- ========================================================= -->
                        <!-- 4. نافذة الإضافة التفاعلية الكاملة (Exact to Image 2 Modal) -->
                        <!-- ========================================================= -->
                        <div id="addAutoresponderModal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
                            <div class="bg-[#0b1322] border border-blue-500/20 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6 text-right shadow-2xl" dir="rtl">
                                
                                <!-- Modal Header -->
                                <div class="flex items-center justify-between border-b border-blue-500/20 pb-4">
                                    <button type="button" onclick="closeAddAutoresponderModal()" class="text-white hover:text-gray-300 text-lg font-bold">✕</button>
                                    <h3 class="text-base font-black text-white">إضافة رد جديد</h3>
                                </div>

                                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    
                                    <!-- العمود الأيمن: المحفز ونوع المطابقة والرد -->
                                    <div class="space-y-4">
                                        <!-- حقل المحفز -->
                                        <div class="space-y-1.5">
                                            <label class="block text-xs font-bold text-gray-300">حقل المحفز</label>
                                            <input type="text" id="arTrigger" placeholder="اكتب الكلمة أو العبارة..." class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                        </div>

                                        <!-- نوع المطابقة (Buttons: يحتوي على / مطابقة تامة / يبدأ بـ / ينتهي بـ / Regex) -->
                                        <div class="space-y-1.5">
                                            <label class="block text-xs font-bold text-gray-300">نوع المطابقة</label>
                                            <div class="grid grid-cols-5 gap-1 bg-[#070d1d] p-1 rounded-xl border border-blue-500/20 text-[10px] text-center">
                                                <button type="button" onclick="setArMatchMode('regex')" id="btnArRegex" class="py-1.5 rounded-lg text-white hover:text-gray-300 transition">Regex</button>
                                                <button type="button" onclick="setArMatchMode('ends')" id="btnArEnds" class="py-1.5 rounded-lg text-white hover:text-gray-300 transition">ينتهي بـ</button>
                                                <button type="button" onclick="setArMatchMode('starts')" id="btnArStarts" class="py-1.5 rounded-lg text-white hover:text-gray-300 transition">يبدأ بـ</button>
                                                <button type="button" onclick="setArMatchMode('exact')" id="btnArExact" class="py-1.5 rounded-lg text-white hover:text-gray-300 transition">مطابقة تامة</button>
                                                <button type="button" onclick="setArMatchMode('contains')" id="btnArContains" class="py-1.5 rounded-lg bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold transition">يحتوي على</button>
                                            </div>
                                        </div>

                                        <!-- نوع الرد (Buttons: رد نصي / رد إيمبد / تفاعل) -->
                                        <div class="space-y-1.5">
                                            <label class="block text-xs font-bold text-gray-300">نوع الرد</label>
                                            <div class="grid grid-cols-3 gap-1.5">
                                                <button type="button" onclick="setArReplyType('reaction')" id="btnArReaction" class="py-2 bg-[#070d1d] border border-blue-500/20 rounded-xl text-[11px] text-white hover:text-gray-300 flex items-center justify-center gap-1 transition">
                                                    <span>تفاعل</span>
                                                    <span>😊</span>
                                                </button>
                                                <button type="button" onclick="setArReplyType('embed')" id="btnArEmbed" class="py-2 bg-[#070d1d] border border-blue-500/20 rounded-xl text-[11px] text-white hover:text-gray-300 flex items-center justify-center gap-1 transition">
                                                    <span>رد إيمبد</span>
                                                    <span>📄</span>
                                                </button>
                                                <button type="button" onclick="setArReplyType('text')" id="btnArText" class="py-2 bg-gradient-to-l from-purple-600 to-blue-500 border border-blue-400 rounded-xl text-[11px] text-white font-bold flex items-center justify-center gap-1 transition">
                                                    <span>رد نصي</span>
                                                    <span>💬</span>
                                                </button>
                                            </div>
                                        </div>

                                        <!-- الرد والبادجات -->
                                        <div class="space-y-2">
                                            <label class="block text-xs font-bold text-gray-300">الرد</label>
                                            <textarea id="arReply" rows="3" placeholder="اكتب الرد..." class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl p-3 text-xs text-white outline-none leading-relaxed text-right"></textarea>
                                            <div class="flex flex-wrap gap-1 justify-end">
                                                <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20 cursor-pointer" onclick="insertArVar('{user}')">{user}</span>
                                                <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20 cursor-pointer" onclick="insertArVar('{server}')">{server}</span>
                                                <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20 cursor-pointer" onclick="insertArVar('{channel}')">{channel}</span>
                                                <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20 cursor-pointer" onclick="insertArVar('{memberCount}')">{memberCount}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- العمود الأيسر: الحساسية والمؤقت والاستثناءات -->
                                    <div class="space-y-4">
                                        <!-- حساس لحالة الأحرف -->
                                        <div class="bg-[#070d1d] border border-blue-500/20 p-3 rounded-xl flex items-center justify-between">
                                            <label class="toggle"><input type="checkbox" id="arCase"><span class="slider"></span></label>
                                            <div class="text-right">
                                                <h5 class="text-xs font-bold text-white">حساس لحالة الأحرف</h5>
                                                <p class="text-[10px] text-gray-500">التمييز بين الأحرف الكبيرة والصغيرة</p>
                                            </div>
                                        </div>

                                        <!-- حذف رسالة المحفز -->
                                        <div class="bg-[#070d1d] border border-blue-500/20 p-3 rounded-xl flex items-center justify-between">
                                            <label class="toggle"><input type="checkbox" id="arDeleteTrigger"><span class="slider"></span></label>
                                            <div class="text-right">
                                                <h5 class="text-xs font-bold text-white">حذف رسالة المحفز</h5>
                                                <p class="text-[10px] text-gray-500">حذف الرسالة التي أطلقت الرد التلقائي</p>
                                            </div>
                                        </div>

                                        <!-- فترة الانتظار (ثانية) -->
                                        <div class="space-y-1">
                                            <label class="block text-xs font-bold text-gray-300">فترة الانتظار (ثانية)</label>
                                            <input type="number" id="arCooldown" placeholder="0" class="w-full bg-[#070d1d] border border-blue-500/20 rounded-xl px-4 py-2 text-xs text-white outline-none text-right font-mono">
                                        </div>

                                        <!-- القنوات المسموحة -->
                                        <div class="space-y-1">
                                            <label class="block text-xs font-bold text-gray-300">القنوات المسموحة (فارغ = جميع القنوات)</label>
                                            ${renderChannelSelect('arAllowedChan', '', true)}
                                        </div>

                                        <!-- الرتب المسموحة -->
                                        <div class="space-y-1">
                                            <label class="block text-xs font-bold text-gray-300">الرتب المسموحة (فارغ = جميع الرتب)</label>
                                            ${renderRoleSelect('arAllowedRole', '')}
                                        </div>

                                        <!-- قنوات مستثناة -->
                                        <div class="space-y-1">
                                            <label class="block text-xs font-bold text-gray-300">قنوات مستثناة</label>
                                            ${renderChannelSelect('arExemptChan', '', true)}
                                        </div>

                                        <!-- رتب مستثناة -->
                                        <div class="space-y-1">
                                            <label class="block text-xs font-bold text-gray-300">رتب مستثناة</label>
                                            ${renderRoleSelect('arExemptRole', '')}
                                        </div>
                                    </div>

                                </div>

                                <!-- Modal Footer Buttons -->
                                <div class="flex items-center justify-between pt-4 border-t border-blue-500/20 flex-row-reverse">
                                    <button type="button" onclick="submitNewAutoresponder()" class="px-8 py-2.5 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-blue-800/40">
                                        إضافة رد تلقائي
                                    </button>
                                    <button type="button" onclick="closeAddAutoresponderModal()" class="px-6 py-2.5 bg-[#070d1d] hover:bg-white/5 border border-blue-500/20 text-white hover:text-gray-300 rounded-xl text-xs font-bold transition">
                                        إلغاء
                                    </button>
                                </div>

                            </div>
                        </div>

                    </div>

                    <script>
                    let currentArMatchMode = 'contains';
                    let currentArReplyType = 'text';

                    function openAddAutoresponderModal() {
                        document.getElementById('addAutoresponderModal').classList.remove('hidden');
                    }

                    function closeAddAutoresponderModal() {
                        document.getElementById('addAutoresponderModal').classList.add('hidden');
                    }

                    function setArMatchMode(mode) {
                        currentArMatchMode = mode;
                        const modes = ['contains', 'exact', 'starts', 'ends', 'regex'];
                        modes.forEach(m => {
                            const btn = document.getElementById('btnAr' + m.charAt(0).toUpperCase() + m.slice(1));
                            if (btn) {
                                btn.className = m === mode
                                    ? "py-1.5 rounded-lg bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold transition"
                                    : "py-1.5 rounded-lg text-blue-300 hover:text-white transition";
                            }
                        });
                    }

                    function setArReplyType(type) {
                        currentArReplyType = type;
                        const types = ['text', 'embed', 'reaction'];
                        types.forEach(t => {
                            const btn = document.getElementById('btnAr' + t.charAt(0).toUpperCase() + t.slice(1));
                            if (btn) {
                                btn.className = t === type
                                    ? "py-2 bg-gradient-to-l from-purple-600 to-blue-500 border border-blue-400 rounded-xl text-[11px] text-white font-bold flex items-center justify-center gap-1 transition"
                                    : "py-2 bg-[#070d1d] border border-blue-500/20 rounded-xl text-[11px] text-blue-300 hover:text-white flex items-center justify-center gap-1 transition";
                            }
                        });
                    }

                    function insertArVar(varName) {
                        const el = document.getElementById('arReply');
                        if (el) el.value += ' ' + varName;
                    }

                    async function submitNewAutoresponder() {
                        const trigger = document.getElementById('arTrigger').value.trim();
                        const reply = document.getElementById('arReply').value.trim();
                        if (!trigger) { alert('يرجى كتابة كلمة أو عبارة المحفز'); return; }
                        if (!reply) { alert('يرجى كتابة الرد التلقائي'); return; }

                        const payload = {
                            trigger_word: trigger,
                            reply_text: reply,
                            match_mode: currentArMatchMode,
                            reply_type: currentArReplyType,
                            case_sensitive: document.getElementById('arCase').checked ? 1 : 0,
                            delete_trigger: document.getElementById('arDeleteTrigger').checked ? 1 : 0,
                            cooldown_seconds: parseInt(document.getElementById('arCooldown').value) || 0,
                            allowed_channels: document.getElementById('arAllowedChan')?.value || '',
                            allowed_roles: document.getElementById('arAllowedRole')?.value || '',
                            exempt_channels: document.getElementById('arExemptChan')?.value || '',
                            exempt_roles: document.getElementById('arExemptRole')?.value || ''
                        };

                        try {
                            const res = await fetch('/api/guild/${guildId}/autoresponder', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تمت إضافة الرد التلقائي بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (data.error || 'فشل الإضافة'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال بالخادم');
                        }
                    }

                    async function deleteAutoresponderItem(id) {
                        if (!confirm('هل أنت متأكد من حذف هذا الرد التلقائي؟')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/autoresponder/' + id, {
                                method: 'DELETE'
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم الحذف بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ فشل الحذف');
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
                    }
                    </script>
`;
            } else if (section === 'tickets') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Master Header Card (Tickets) -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <label class="toggle">
                                <input type="checkbox" name="tickets_enabled" value="1" ${settings.tickets_enabled !== 0 ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">نظام التذاكر والدعم الفني 🎫</h4>
                                    <p class="text-white text-xs mt-0.5">لوحات تذاكر تفاعلية، تصنيفات مخصصة، وتقييمات خدمة العملاء</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-blue-400/20 text-blue-400 flex items-center justify-center text-lg border border-blue-500/20">
                                    🎫
                                </div>
                            </div>
                        </div>

                        <!-- 2. إحصائيات التذاكر الحية (Live Ticket Stats) -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-blue-400 font-mono">${(guildTicketsList || []).length}</span>
                                <span class="text-xs font-bold text-white block">إجمالي التذاكر المسجلة</span>
                            </div>
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-emerald-400 font-mono">${(guildTicketsList || []).filter(t => t.status === 'open').length}</span>
                                <span class="text-xs font-bold text-white block">التذاكر المفتوحة حالياً</span>
                            </div>
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-amber-400 font-mono">${(guildTicketsList || []).filter(t => t.status === 'closed').length}</span>
                                <span class="text-xs font-bold text-white block">التذاكر المغلقة</span>
                            </div>
                        </div>

                        <!-- 3. إعدادات لوحة ورتب التذاكر الأساسية -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                <button type="button" onclick="sendTicketPanelDirect()" class="px-4 py-2 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-700/30 flex items-center gap-2 transition cursor-pointer">
                                    <span>📩</span>
                                    <span>إرسال اللوحة للشات الآن</span>
                                </button>
                                <h4 class="text-xs font-black text-white">إعدادات ومظهر لوحة الدعم الفني (Wicks Design)</h4>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">رتبة طاقم الدعم الفني (Support Role)</label>
                                    ${renderRoleSelect('ticket_role', settings.ticket_role || '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">روم إرسال لوحة التذاكر (Panel Channel)</label>
                                    ${renderChannelSelect('ticket_panel_channel', settings.ticket_panel_channel || '')}
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">عنوان لوحة التذاكر (Panel Title)</label>
                                    <input type="text" id="input_ticket_panel_title" name="ticket_panel_title" value="${settings.ticket_panel_title || 'Open a ticket 🎫'}" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة سجلات التذاكر (Transcripts Channel)</label>
                                    ${renderChannelSelect('ticket_log_channel', settings.ticket_log_channel || settings.log_channel || '')}
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">⭐ روم إرسال تقييمات التذاكر (Ratings / Feedback Channel)</label>
                                    ${renderChannelSelect('ticket_feedback_channel', settings.ticket_feedback_channel || settings.ticket_rating_channel || '')}
                                </div>
                                <div class="flex items-center justify-between p-3 bg-[#070d1d] border border-blue-500/20 rounded-xl self-end h-[46px]">
                                    <label class="toggle">
                                        <input type="checkbox" name="ticket_rating_enabled" value="1" ${settings.ticket_rating_enabled !== 0 ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-white block">طلب تقييم الخدمة عند إغلاق التذكرة</span>
                                        <span class="text-[10px] text-white">إرسال نجوم التقييم ⭐ للعضو بعد الإغلاق</span>
                                    </div>
                                </div>
                            </div>

                            <!-- بطاقات رفع الصور بتصميم Wicks (صورة خلفية الإعداد & صورة خط الإعداد) -->
                            <div class="space-y-4 pt-2">
                                <!-- 1. صورة خلفية إعداد التذكرة (Panel Banner) -->
                                <div class="bg-[#070d1d] border border-blue-500/20 hover:border-blue-500/20 rounded-2xl p-5 transition shadow-lg">
                                    <div class="flex flex-col md:flex-row items-center justify-between gap-4">
                                        <!-- المعاينة وزر الحذف -->
                                        <div class="w-full md:w-auto flex flex-col items-center gap-2">
                                            <div id="preview_box_ticket_panel_banner" class="w-full md:w-56 h-28 rounded-xl border border-blue-500/20 bg-[#0b1322] overflow-hidden flex items-center justify-center relative group">
                                                <img id="img_ticket_panel_banner" src="${settings.ticket_panel_banner || ''}" class="w-full h-full object-cover ${settings.ticket_panel_banner ? '' : 'hidden'}">
                                                <div id="placeholder_ticket_panel_banner" class="text-gray-500 text-xs flex flex-col items-center gap-1 ${settings.ticket_panel_banner ? 'hidden' : ''}">
                                                    <span class="text-2xl">🖼️</span>
                                                    <span>لا توجد خلفية</span>
                                                </div>
                                            </div>
                                            <button type="button" onclick="clearUploadedImage('ticket_panel_banner')" class="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition font-bold py-1 px-3 rounded-lg hover:bg-rose-950/30 cursor-pointer">
                                                <span>🗑️</span>
                                                <span>إزالة الخلفية</span>
                                            </button>
                                        </div>

                                        <!-- نصوص الشرح وزر الرفع -->
                                        <div class="flex-1 text-right space-y-1 w-full">
                                            <div class="flex items-center justify-end gap-2">
                                                <h5 class="text-sm font-black text-white">صورة خلفية إعداد التذكرة</h5>
                                                <span class="text-blue-400 text-base">🖼️</span>
                                            </div>
                                            <ul class="text-[11px] text-white space-y-0.5 list-disc list-inside">
                                                <li>ستظهر هذه الصورة كبانر رئيسي أعلى رسالة لوحة التذاكر.</li>
                                                <li>الحد الأدنى الموصى به للحجم هو 1920x1080 بكسل.</li>
                                                <li>نسبة العرض إلى الارتفاع الموصى بها هي 16:9.</li>
                                            </ul>
                                        </div>

                                        <!-- زر رفع الخلفية ومستودع الملف -->
                                        <div class="w-full md:w-auto flex justify-end">
                                            <input type="file" id="file_ticket_panel_banner" accept="image/*" class="hidden" onchange="handleImageFileUpload(this, 'ticket_panel_banner')">
                                            <input type="hidden" id="input_ticket_panel_banner" name="ticket_panel_banner" value="${settings.ticket_panel_banner || ''}">
                                            <button type="button" onclick="document.getElementById('file_ticket_panel_banner').click()" class="px-6 py-2.5 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-blue-700/30 flex items-center gap-2 cursor-pointer w-full md:w-auto justify-center">
                                                <span>📤</span>
                                                <span id="btn_text_ticket_panel_banner">رفع الخلفية</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <!-- 2. صورة خط إعداد التذاكر / كفاصل (Welcome Embed Image) -->
                                <div class="bg-[#070d1d] border border-blue-500/20 hover:border-blue-500/20 rounded-2xl p-5 transition shadow-lg">
                                    <div class="flex flex-col md:flex-row items-center justify-between gap-4">
                                        <!-- المعاينة وزر الحذف -->
                                        <div class="w-full md:w-auto flex flex-col items-center gap-2">
                                            <div id="preview_box_ticket_welcome_image" class="w-full md:w-56 h-14 rounded-xl border border-blue-500/20 bg-[#0b1322] overflow-hidden flex items-center justify-center relative group">
                                                <img id="img_ticket_welcome_image" src="${settings.ticket_welcome_image || ''}" class="w-full h-full object-cover ${settings.ticket_welcome_image ? '' : 'hidden'}">
                                                <div id="placeholder_ticket_welcome_image" class="text-gray-500 text-xs flex flex-col items-center gap-1 ${settings.ticket_welcome_image ? 'hidden' : ''}">
                                                    <span class="text-lg">🖼️</span>
                                                    <span>لا يوجد خط</span>
                                                </div>
                                            </div>
                                            <button type="button" onclick="clearUploadedImage('ticket_welcome_image')" class="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition font-bold py-1 px-3 rounded-lg hover:bg-rose-950/30 cursor-pointer">
                                                <span>🗑️</span>
                                                <span>إزالة الخط</span>
                                            </button>
                                        </div>

                                        <!-- نصوص الشرح وزر الرفع -->
                                        <div class="flex-1 text-right space-y-1 w-full">
                                            <div class="flex items-center justify-end gap-2">
                                                <h5 class="text-sm font-black text-white">صورة خط إعداد التذاكر</h5>
                                                <span class="text-blue-400 text-base">🖼️</span>
                                            </div>
                                            <ul class="text-[11px] text-white space-y-0.5 list-disc list-inside">
                                                <li>ستظهر صورة الخط هذه كفاصل في الترحيب داخل التذكرة.</li>
                                                <li>الحد الأدنى الموصى به للعرض هو 1920 بكسل.</li>
                                                <li>نسبة العرض إلى الارتفاع الموصى بها هي 5:1.</li>
                                            </ul>
                                        </div>

                                        <!-- زر رفع الخط ومستودع الملف -->
                                        <div class="w-full md:w-auto flex justify-end">
                                            <input type="file" id="file_ticket_welcome_image" accept="image/*" class="hidden" onchange="handleImageFileUpload(this, 'ticket_welcome_image')">
                                            <input type="hidden" id="input_ticket_welcome_image" name="ticket_welcome_image" value="${settings.ticket_welcome_image || ''}">
                                            <button type="button" onclick="document.getElementById('file_ticket_welcome_image').click()" class="px-6 py-2.5 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-blue-700/30 flex items-center gap-2 cursor-pointer w-full md:w-auto justify-center">
                                                <span>📤</span>
                                                <span id="btn_text_ticket_welcome_image">رفع الخط</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2">رسالة الترحيب التلقائية داخل التذكرة (Ticket Welcome Message)</label>
                                <textarea name="ticket_welcome_msg" rows="3" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl p-4 text-xs text-white outline-none leading-relaxed text-right">${settings.ticket_welcome_msg || 'مرحباً بك {user}! يرجى كتابة استفسارك وسيقوم طاقم الإدارة بالرد عليك قريباً 🌟'}</textarea>
                            </div>
                        </div>

                        <!-- 4. جدول التذاكر الحية (Live Active Tickets) -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                <span class="text-xs font-mono text-white font-bold">${(guildTicketsList || []).length} تذكرة</span>
                                <h4 class="text-xs font-black text-white">سجل التذاكر الأخيرة</h4>
                            </div>

                            <div class="space-y-2">
                                ${(guildTicketsList && guildTicketsList.length > 0) ? guildTicketsList.slice(0, 10).map(t => `
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-3.5 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition text-xs">
                                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${t.status === 'open' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/30' : 'bg-rose-950/60 text-rose-400 border border-rose-800/30'}">${t.status === 'open' ? 'مفتوحة 🟢' : 'مغلقة 🔴'}</span>
                                        <div class="text-right">
                                            <span class="font-bold text-white block">صاحب التذكرة: <span class="font-mono text-white">${t.user_id}</span></span>
                                            <span class="text-[10px] text-white">${t.category || 'عام'} • <span class="font-mono">${new Date(t.created_at * 1000).toLocaleDateString(dashDateLocale(req, 'ar-SA'))}</span></span>
                                        </div>
                                    </div>
                                `).join('') : `
                                    <div class="py-8 text-center text-xs text-gray-500">
                                        لا توجد تذاكر مسجلة حالياً في السيرفر 🎫
                                    </div>
                                `}
                            </div>
                        </div>

                    </div>
                    <script>
                    async function handleImageFileUpload(input, fieldName) {
                        const file = input.files && input.files[0];
                        if (!file) return;

                        if (!file.type.startsWith('image/')) {
                            alert('❌ يرجى اختيار ملف صورة صالح (PNG, JPG, WEBP, GIF)');
                            return;
                        }

                        if (file.size > 15 * 1024 * 1024) {
                            alert('❌ حجم الصورة يتجاوز 15 ميجابايت. يرجى اختيار صورة أصغر.');
                            return;
                        }

                        const btnText = document.getElementById('btn_text_' + fieldName);
                        const origText = btnText ? btnText.innerText : 'رفع';
                        if (btnText) btnText.innerText = 'جاري الرفع... ⏳';

                        const reader = new FileReader();
                        reader.onload = async function(e) {
                            const base64Data = e.target.result;
                            try {
                                const res = await fetch('/api/guild/${guildId}/upload-image', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        imageBase64: base64Data,
                                        fieldName: fieldName
                                    })
                                });
                                const data = await res.json();
                                if (data.success && data.url) {
                                    // Update hidden input
                                    const hiddenInput = document.getElementById('input_' + fieldName);
                                    if (hiddenInput) hiddenInput.value = data.url;

                                    // Update preview
                                    const imgElem = document.getElementById('img_' + fieldName);
                                    const placeholderElem = document.getElementById('placeholder_' + fieldName);
                                    if (imgElem) {
                                        imgElem.src = data.url;
                                        imgElem.classList.remove('hidden');
                                    }
                                    if (placeholderElem) {
                                        placeholderElem.classList.add('hidden');
                                    }
                                    if (btnText) btnText.innerText = '✅ تم الرفع';
                                    setTimeout(() => { if (btnText) btnText.innerText = origText; }, 2500);
                                } else {
                                    alert('❌ فشل رفع الصورة: ' + (data.error || 'خطأ غير معروف'));
                                    if (btnText) btnText.innerText = origText;
                                }
                            } catch(err) {
                                alert('حدث خطأ أثناء رفع الصورة: ' + err.message);
                                if (btnText) btnText.innerText = origText;
                            }
                        };
                        reader.readAsDataURL(file);
                    }

                    function clearUploadedImage(fieldName) {
                        const hiddenInput = document.getElementById('input_' + fieldName);
                        if (hiddenInput) hiddenInput.value = '';

                        const imgElem = document.getElementById('img_' + fieldName);
                        const placeholderElem = document.getElementById('placeholder_' + fieldName);
                        if (imgElem) {
                            imgElem.src = '';
                            imgElem.classList.add('hidden');
                        }
                        if (placeholderElem) {
                            placeholderElem.classList.remove('hidden');
                        }

                        const fileInput = document.getElementById('file_' + fieldName);
                        if (fileInput) fileInput.value = '';
                    }

                    async function sendTicketPanelDirect() {
                        const panelCh = document.getElementById('ticket_panel_channel')?.value;
                        if (!panelCh) {
                            return alert('يرجى اختيار "روم إرسال لوحة التذاكر (Panel Channel)" أولاً ثم حفظ التغييرات.');
                        }

                        const title = document.getElementById('input_ticket_panel_title')?.value || 'Open a ticket 🎫';
                        const banner = document.getElementById('input_ticket_panel_banner')?.value || '';

                        if (!confirm('هل تريد إرسال لوحة التذاكر الآن مباشرة إلى الروم المختار؟')) return;

                        try {
                            const res = await fetch('/api/guild/${guildId}/tickets/send-panel', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    channelId: panelCh,
                                    ticket_panel_title: title,
                                    ticket_panel_banner: banner
                                })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم إرسال لوحة التذاكر بنجاح إلى القناة!');
                            } else {
                                alert('❌ فشل الإرسال: ' + (data.error || 'تأكد من صلاحيات البوت في القناة'));
                            }
                        } catch(e) {
                            alert('حدث خطأ أثناء محاولة الإرسال: ' + e.message);
                        }
                    }
                    </script>
`;
            } else if (section === 'autoroles') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Master Header Card (Exact to Image 1) -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <label class="toggle">
                                <input type="checkbox" name="autoroles_enabled" value="1" ${settings.autoroles_enabled !== 0 ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                            <div class="flex items-center gap-3">
                                <span class="text-xs font-black text-white">مفعل</span>
                                <div class="w-10 h-10 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center text-lg border border-amber-500/30">
                                    🛡️
                                </div>
                            </div>
                        </div>

                        <!-- Card: رتب الأعضاء الجدد & رتبة البوتات الجديدة (Exact to Image 1) -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-6 shadow-xl">
                            <!-- رتب الأعضاء الجدد -->
                            <div class="space-y-2">
                                <div class="flex items-center justify-end gap-1 text-xs font-bold text-gray-300">
                                    <span>رتب الأعضاء الجدد</span>
                                </div>
                                ${renderRoleSelect('autorole_id', settings.autorole_id || settings.auto_role || '')}
                                <p class="text-[10px] text-gray-500 text-right">الرتب التي تُعطى للأعضاء الجدد عند الانضمام</p>
                            </div>

                            <!-- رتبة البوتات الجديدة -->
                            <div class="space-y-2 pt-4 border-t border-blue-500/20">
                                <div class="flex items-center justify-end gap-1 text-xs font-bold text-gray-300">
                                    <span>رتبة البوتات الجديدة</span>
                                </div>
                                ${renderRoleSelect('autorole_bot_id', settings.autorole_bot_id || '')}
                                <p class="text-[10px] text-gray-500 text-right">الرتبة التي تُعطى للبوتات عند إضافتها للسيرفر</p>
                            </div>
                        </div>

                    </div>

<script>
(function() {
    var guildId = '${guildId}';
    function fetchStats() {
        fetch('/api/guild/' + guildId + '/online-count')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (!data.success) return;
                var elOnline = document.getElementById('onlineMembersCount');
                if (elOnline) elOnline.textContent = (data.online || 0).toLocaleString();
                var elBots = document.getElementById('botsCount');
                if (elBots) elBots.textContent = (data.bots || 0).toLocaleString();
                var elGw = document.getElementById('giveawaysCount');
                if (elGw) elGw.textContent = (data.giveaways || 0).toLocaleString();
            })
            .catch(function() {
                var elOnline = document.getElementById('onlineMembersCount');
                if (elOnline && elOnline.textContent === '\u2026') elOnline.textContent = '0';
                var elBots = document.getElementById('botsCount');
                if (elBots && elBots.textContent === '\u2026') elBots.textContent = '0';
            });
    }
    fetchStats();
    setInterval(fetchStats, 30000);
})();
</script>
`;
            } else if (section === 'levels') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Top Tab Switcher & Master Toggle (Exact to Images 1, 2, 3) -->
                        <div class="flex items-center justify-between">
                            <label class="toggle">
                                <input type="checkbox" name="leveling_enabled" value="1" ${settings.leveling_enabled !== 0 ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>

                            <!-- Navigation Tabs (Exact to Versa Tab Bar) -->
                            <div class="flex items-center gap-2 bg-[#080e1c] border border-blue-500/20 p-1.5 rounded-2xl">
                                <button type="button" onclick="switchLevelTab('settings')" id="btnTabLvlSettings" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(!currentTab || currentTab === 'settings') ? 'bg-gradient-to-r from-blue-400 to-indigo-600 text-white shadow-md' : 'text-white hover:text-gray-300'} flex items-center gap-1">
                                    <span>الإعدادات</span>
                                    <span>⚙️</span>
                                </button>
                                <button type="button" onclick="switchLevelTab('text_roles')" id="btnTabLvlText" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(currentTab === 'text_roles') ? 'bg-gradient-to-r from-blue-400 to-indigo-600 text-white shadow-md' : 'text-white hover:text-gray-300'} flex items-center gap-1">
                                    <span>رتب كتابية</span>
                                    <span>📜</span>
                                </button>
                                <button type="button" onclick="switchLevelTab('voice_roles')" id="btnTabLvlVoice" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(currentTab === 'voice_roles') ? 'bg-gradient-to-r from-blue-400 to-indigo-600 text-white shadow-md' : 'text-white hover:text-gray-300'} flex items-center gap-1">
                                    <span>رتب صوتية</span>
                                    <span>🎵</span>
                                </button>
                                <button type="button" onclick="switchLevelTab('shared_roles')" id="btnTabLvlShared" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(currentTab === 'shared_roles') ? 'bg-gradient-to-r from-blue-400 to-indigo-600 text-white shadow-md' : 'text-white hover:text-gray-300'} flex items-center gap-1">
                                    <span>رتب مشتركة</span>
                                    <span>✨</span>
                                </button>
                                <button type="button" onclick="switchLevelTab('leaderboard')" id="btnTabLvlLeaderboard" class="px-4 py-1.5 rounded-xl text-xs font-bold transition ${(currentTab === 'leaderboard') ? 'bg-gradient-to-r from-blue-400 to-indigo-600 text-white shadow-md' : 'text-white hover:text-gray-300'} flex items-center gap-1">
                                    <span>المتصدرين</span>
                                    <span>🏆</span>
                                </button>
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 1. تبويب الإعدادات العامة (Settings Tab) -->
                        <!-- ========================================================= -->
                        <div id="tabLvlSettings" class="space-y-6 ${(!currentTab || currentTab === 'settings') ? '' : 'hidden'}">
                            <!-- بطاقة نظام XP -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-end gap-2 text-white font-black text-sm border-b border-blue-500/20 pb-3">
                                    <span>نظام XP</span>
                                    <span class="text-amber-400">✨</span>
                                </div>

                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <!-- مستويات كتابية -->
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between">
                                        <label class="toggle">
                                            <input type="checkbox" name="level_text_xp_enabled" value="1" ${settings.level_text_xp_enabled !== 0 ? 'checked' : ''}>
                                            <span class="slider"></span>
                                        </label>
                                        <div class="flex items-center gap-2 text-xs font-bold text-white">
                                            <span>مستويات كتابية</span>
                                            <span>💬</span>
                                        </div>
                                    </div>

                                    <!-- مستويات صوتية -->
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between">
                                        <label class="toggle">
                                            <input type="checkbox" name="level_voice_xp_enabled" value="1" ${settings.level_voice_xp_enabled !== 0 ? 'checked' : ''}>
                                            <span class="slider"></span>
                                        </label>
                                        <div class="flex items-center gap-2 text-xs font-bold text-white">
                                            <span>مستويات صوتية</span>
                                            <span>🎵</span>
                                        </div>
                                    </div>
                                </div>

                                <!-- فترة انتظار XP -->
                                <div class="space-y-2">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <span class="text-xs text-white">ثانية</span>
                                            <input type="number" name="level_cooldown_seconds" value="${settings.level_cooldown_seconds || 120}" class="w-20 bg-[#070d1d] border border-blue-500/20 rounded-xl px-3 py-1.5 text-xs text-white font-mono text-center outline-none">
                                        </div>
                                        <div class="text-right">
                                            <h5 class="text-xs font-bold text-white">فترة انتظار XP</h5>
                                            <p class="text-[10px] text-gray-500">الثواني بين كل رسالة تكسب XP</p>
                                        </div>
                                    </div>
                                </div>

                                <!-- XP الصوت في الدقيقة -->
                                <div class="space-y-2 pt-3 border-t border-blue-500/20">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <span class="text-xs text-white">XP/دقيقة</span>
                                            <input type="number" name="level_voice_xp_rate" value="${settings.level_voice_xp_rate || 3}" class="w-20 bg-[#070d1d] border border-blue-500/20 rounded-xl px-3 py-1.5 text-xs text-white font-mono text-center outline-none">
                                        </div>
                                        <div class="text-right">
                                            <h5 class="text-xs font-bold text-white">XP الصوت في الدقيقة</h5>
                                            <p class="text-[10px] text-gray-500">كمية XP الممنوحة لكل دقيقة في الصوت</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- بطاقة إعدادات صوتية -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-end gap-2 text-white font-black text-sm border-b border-blue-500/20 pb-3">
                                    <span>إعدادات صوتية</span>
                                    <span class="text-pink-400">🎵</span>
                                </div>

                                <div class="space-y-2">
                                    <div class="flex items-center justify-between text-xs font-bold">
                                        <span class="px-3 py-1 bg-orange-950/60 text-blue-400 border border-orange-800/40 rounded-xl font-mono text-sm" id="voiceMinMembersVal">${settings.level_voice_min_members || 2}</span>
                                        <span class="text-white">الحد الأدنى للأعضاء في القناة</span>
                                    </div>
                                    <input type="range" name="level_voice_min_members" min="1" max="10" value="${settings.level_voice_min_members || 2}" oninput="document.getElementById('voiceMinMembersVal').innerText = this.value" class="w-full accent-blue-400 cursor-pointer">
                                    <p class="text-[10px] text-gray-500 text-right">عدد الأعضاء المطلوب في القناة لبدء حساب XP</p>
                                </div>

                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between">
                                    <label class="toggle">
                                        <input type="checkbox" name="level_ignore_deafened" value="1" ${settings.level_ignore_deafened !== 0 ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">تجاهل الأعضاء المكتومين</h5>
                                        <p class="text-[10px] text-gray-500">لن يحصل الأعضاء المكتومون على XP صوتي</p>
                                    </div>
                                </div>

                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between">
                                    <label class="toggle">
                                        <input type="checkbox" name="level_ignore_muted" value="1" ${settings.level_ignore_muted !== 0 ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">تجاهل الأعضاء الصامتين</h5>
                                        <p class="text-[10px] text-gray-500">لن يحصل الأعضاء الصامتون على XP صوتي</p>
                                    </div>
                                </div>

                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between">
                                    <label class="toggle">
                                        <input type="checkbox" name="level_ignore_afk" value="1" ${settings.level_ignore_afk !== 0 ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">تجاهل قناة AFK</h5>
                                        <p class="text-[10px] text-gray-500">لن يحصل الأعضاء في قناة AFK على XP</p>
                                    </div>
                                </div>
                            </div>

                            <!-- بطاقة إعدادات رفع المستوى -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-end gap-2 text-white font-black text-sm border-b border-blue-500/20 pb-3">
                                    <span>إعدادات رفع المستوى</span>
                                    <span class="text-indigo-400">🎉</span>
                                </div>

                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between">
                                    <label class="toggle">
                                        <input type="checkbox" name="level_up_msg_enabled" value="1" ${settings.level_up_msg_enabled !== 0 ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">رسائل رفع المستوى</h5>
                                        <p class="text-[10px] text-gray-500">إرسال رسالة عند رفع المستوى</p>
                                    </div>
                                </div>

                                <div class="space-y-2">
                                    <label class="block text-xs font-bold text-gray-300">قناة إشعارات المستوى</label>
                                    <select name="level_channel" id="level_channel" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer">
                                        <option value="current" ${(!settings.level_channel || settings.level_channel === 'current') ? 'selected' : ''}>💬 الروم الحالي (نفس مكان كتابة الرسالة)</option>
                                        <option value="dm" ${settings.level_channel === 'dm' ? 'selected' : ''}>📩 رسالة خاصة بالخاص (DM)</option>
                                        <option value="disabled" ${settings.level_channel === 'disabled' ? 'selected' : ''}>🚫 معطل (بدون إرسال رسالة ترقية)</option>
                                        <optgroup label="── القنوات النصية ──">
                                            ${guildTextChannels.map(c => `<option value="${c.id}" ${settings.level_channel === c.id ? 'selected' : ''}># ${c.name}</option>`).join('')}
                                        </optgroup>
                                    </select>
                                </div>

                                <div class="space-y-2">
                                    <div class="flex items-center justify-between text-xs text-white">
                                        <div class="flex items-center gap-1">
                                            <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20">{server}</span>
                                            <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20">{xp}</span>
                                            <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20">{level}</span>
                                            <span class="text-[10px] font-mono bg-[#14233c] text-blue-400 px-2 py-0.5 rounded-lg border border-blue-500/20">{user}</span>
                                        </div>
                                        <span class="font-bold text-white">رسالة رفع المستوى (كتابي)</span>
                                    </div>
                                    <input type="text" name="level_message" value="${settings.level_message || '🎉 مبروك {user}! وصلت للمستوى **{level}**!'}" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>

                                <div class="space-y-2">
                                    <label class="block text-xs font-bold text-white text-right">رسالة رفع المستوى (صوتي)</label>
                                    <input type="text" name="level_voice_msg" value="${settings.level_voice_msg || '🎤 مبروك {user}! وصلت للمستوى الصوتي **{level}**!'}" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>

                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between">
                                    <label class="toggle">
                                        <input type="checkbox" name="level_dm_msg_enabled" value="1" ${settings.level_dm_msg_enabled ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">إرسال رسالة خاصة</h5>
                                        <p class="text-[10px] text-gray-500">إرسال إشعار رفع المستوى برسالة خاصة في DM</p>
                                    </div>
                                </div>

                                <!-- صورة إشعار المستوى بنمط Wicks -->
                                <div class="bg-[#070d1d] border border-blue-500/20 hover:border-blue-500/20 rounded-2xl p-4 transition shadow-lg">
                                    <div class="flex flex-col md:flex-row items-center justify-between gap-4">
                                        <!-- المعاينة وزر الحذف -->
                                        <div class="w-full md:w-auto flex flex-col items-center gap-2">
                                            <div class="w-full md:w-48 h-24 rounded-xl border border-blue-500/20 bg-[#0b1322] overflow-hidden flex items-center justify-center relative group">
                                                <img id="img_level_up_image" src="${settings.level_up_image || ''}" class="w-full h-full object-cover ${settings.level_up_image ? '' : 'hidden'}">
                                                <div id="placeholder_level_up_image" class="text-gray-500 text-xs flex flex-col items-center gap-1 ${settings.level_up_image ? 'hidden' : ''}">
                                                    <span class="text-2xl">🖼️</span>
                                                    <span>لا توجد صورة</span>
                                                </div>
                                            </div>
                                            <button type="button" onclick="clearUploadedImageInDOM('level_up_image')" class="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition font-bold py-1 px-3 rounded-lg hover:bg-rose-950/30 cursor-pointer">
                                                <span>🗑️</span>
                                                <span>إزالة الصورة</span>
                                            </button>
                                        </div>

                                        <!-- نصوص الشرح -->
                                        <div class="flex-1 text-right space-y-1 w-full">
                                            <div class="flex items-center justify-end gap-2">
                                                <h5 class="text-sm font-black text-white">صورة إشعار رفع المستوى</h5>
                                                <span class="text-blue-400 text-base">🎉</span>
                                            </div>
                                            <ul class="text-[11px] text-white space-y-0.5 list-disc list-inside">
                                                <li>صورة تظهر مع رسالة التهنئة برفع المستوى في الشات أو الخاص.</li>
                                                <li>الحد الأدنى الموصى به للحجم هو 1024x512 بكسل.</li>
                                                <li>الصيغ المدعومة: PNG, JPG, GIF, WEBP.</li>
                                            </ul>
                                        </div>

                                        <!-- زر الرفع -->
                                        <div class="w-full md:w-auto flex justify-end">
                                            <input type="file" id="file_level_up_image" accept="image/*" class="hidden" onchange="uploadImageFile(this, 'level_up_image')">
                                            <input type="hidden" id="input_level_up_image" name="level_up_image" value="${settings.level_up_image || ''}">
                                            <button type="button" onclick="document.getElementById('file_level_up_image').click()" class="px-5 py-2.5 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-blue-700/30 flex items-center gap-2 cursor-pointer w-full md:w-auto justify-center">
                                                <span>📤</span>
                                                <span id="btn_text_level_up_image">رفع الصورة</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- بطاقة تكديس الرتب & الاستثناءات -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-end gap-2 text-white font-black text-sm border-b border-blue-500/20 pb-3">
                                    <span>إعدادات الرتب والاستثناءات</span>
                                    <span class="text-amber-400">👑</span>
                                </div>

                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between">
                                    <label class="toggle">
                                        <input type="checkbox" name="level_stack_roles" value="1" ${settings.level_stack_roles ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">تكديس الرتب</h5>
                                        <p class="text-[10px] text-gray-500">الاحتفاظ بجميع رتب المستويات السابقة عند الترقية</p>
                                    </div>
                                </div>

                                <div class="space-y-2 pt-3 border-t border-blue-500/20">
                                    <label class="block text-xs font-bold text-white">قنوات مستثناة</label>
                                    ${renderChannelSelect('level_exempt_channels', settings.level_exempt_channels || '', true)}
                                </div>

                                <div class="space-y-2 pt-3 border-t border-blue-500/20">
                                    <label class="block text-xs font-bold text-white">رتب مستثناة</label>
                                    ${renderRoleSelect('level_exempt_roles', settings.level_exempt_roles || '')}
                                </div>
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 2. تبويب رتب المستويات الكتابية (Text Roles Tab) -->
                        <!-- ========================================================= -->
                        <div id="tabLvlText" class="space-y-6 ${(currentTab === 'text_roles') ? '' : 'hidden'}">
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                    <div class="flex items-center gap-2">
                                        <button type="button" onclick="openAddLevelRoleModal('text')" class="px-5 py-2 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-blue-800/40">
                                            <span>➕</span>
                                            <span>إضافة رتبة</span>
                                        </button>
                                        <button type="button" onclick="location.reload()" class="px-3.5 py-2 bg-[#070d1d] hover:bg-white/5 border border-blue-500/20 text-white hover:text-gray-300 rounded-xl text-xs font-bold transition flex items-center gap-1">
                                            <span>🔄</span>
                                            <span>مزامنة</span>
                                        </button>
                                    </div>
                                    <div class="text-right">
                                        <h4 class="text-sm font-black text-white">رتب المستويات الكتابية</h4>
                                        <p class="text-[10px] text-gray-500 mt-0.5">أضف رتب يحصل عليها الأعضاء عند الوصول لمستوى كتابي معين</p>
                                    </div>
                                </div>

                                <div class="space-y-2">
                                    ${(levelRewardsList && levelRewardsList.filter(r => r.reward_type === 'text' || !r.reward_type).length > 0) ? levelRewardsList.filter(r => r.reward_type === 'text' || !r.reward_type).map(r => `
                                        <div class="bg-[#070d1d] border border-blue-500/20 p-3.5 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition text-xs">
                                            <button type="button" onclick="deleteLevelRole(${r.id || r.level})" class="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                                            <div class="flex items-center gap-3">
                                                <div class="text-right">
                                                    <span class="font-bold text-white block">مستوى كتابي ${r.level}</span>
                                                    <span class="text-[10px] text-blue-400 font-mono">الرتبة: @${(guildRoles.find(role => role.id === r.role_id)?.name) || r.role_id}</span>
                                                </div>
                                                <span class="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">📜</span>
                                            </div>
                                        </div>
                                    `).join('') : `
                                        <div class="py-12 text-center space-y-3">
                                            <div class="w-12 h-12 rounded-full bg-white/5 text-white flex items-center justify-center text-xl mx-auto">📜</div>
                                            <h5 class="text-xs font-bold text-gray-300">لا توجد رتب مستويات</h5>
                                            <p class="text-[10px] text-gray-500">أضف رتب لمكافأة الأعضاء النشطين</p>
                                            <button type="button" onclick="openAddLevelRoleModal('text')" class="px-5 py-2 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-1.5 shadow-lg shadow-blue-800/40">
                                                <span>إضافة أول رتبة</span>
                                            </button>
                                        </div>
                                    `}
                                </div>

                                <!-- بطاقة معادلة حساب XP -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl space-y-3">
                                    <div class="flex items-center justify-end gap-1.5 text-xs font-bold text-gray-300">
                                        <span>معادلة حساب XP</span>
                                        <span class="text-blue-400">ℹ️</span>
                                    </div>
                                    <p class="text-[11px] text-white text-right font-mono">XP المطلوب للمستوى = (المستوى × 25)²</p>
                                    <div class="flex items-center justify-center gap-2 pt-1">
                                        <span class="px-3 py-1 bg-white/5 border border-blue-500/20 rounded-lg text-[10px] font-mono text-gray-300">مستوى 20 = 250,000 XP</span>
                                        <span class="px-3 py-1 bg-white/5 border border-blue-500/20 rounded-lg text-[10px] font-mono text-gray-300">مستوى 10 = 62,500 XP</span>
                                        <span class="px-3 py-1 bg-white/5 border border-blue-500/20 rounded-lg text-[10px] font-mono text-gray-300">مستوى 5 = 15,625 XP</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 3. تبويب رتب المستويات الصوتية (Voice Roles Tab - Image 1) -->
                        <!-- ========================================================= -->
                        <div id="tabLvlVoice" class="space-y-6 ${(currentTab === 'voice_roles') ? '' : 'hidden'}">
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                    <div class="flex items-center gap-2">
                                        <button type="button" onclick="openAddLevelRoleModal('voice')" class="px-5 py-2 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-blue-800/40">
                                            <span>➕</span>
                                            <span>إضافة رتبة</span>
                                        </button>
                                        <button type="button" onclick="location.reload()" class="px-3.5 py-2 bg-[#070d1d] hover:bg-white/5 border border-blue-500/20 text-white hover:text-gray-300 rounded-xl text-xs font-bold transition flex items-center gap-1">
                                            <span>🔄</span>
                                            <span>مزامنة</span>
                                        </button>
                                    </div>
                                    <div class="text-right">
                                        <h4 class="text-sm font-black text-white">رتب المستويات الصوتية</h4>
                                        <p class="text-[10px] text-gray-500 mt-0.5">أضف رتب يحصل عليها الأعضاء عند الوصول لمستوى صوتي معين</p>
                                    </div>
                                </div>

                                <div class="space-y-2">
                                    ${(levelRewardsList && levelRewardsList.filter(r => r.reward_type === 'voice').length > 0) ? levelRewardsList.filter(r => r.reward_type === 'voice').map(r => `
                                        <div class="bg-[#070d1d] border border-blue-500/20 p-3.5 rounded-xl flex items-center justify-between hover:border-pink-500/40 transition text-xs">
                                            <button type="button" onclick="deleteLevelRole(${r.id || r.level})" class="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                                            <div class="flex items-center gap-3">
                                                <div class="text-right">
                                                    <span class="font-bold text-white block">مستوى صوتي ${r.level}</span>
                                                    <span class="text-[10px] text-pink-400 font-mono">الرتبة: @${(guildRoles.find(role => role.id === r.role_id)?.name) || r.role_id}</span>
                                                </div>
                                                <span class="w-8 h-8 rounded-lg bg-pink-600/20 text-pink-400 flex items-center justify-center font-bold">🎵</span>
                                            </div>
                                        </div>
                                    `).join('') : `
                                        <div class="py-12 text-center space-y-3">
                                            <div class="w-12 h-12 rounded-full bg-pink-950/40 text-pink-400 flex items-center justify-center text-xl mx-auto border border-pink-500/20">🎵</div>
                                            <h5 class="text-xs font-bold text-gray-300">لا توجد رتب مستويات</h5>
                                            <p class="text-[10px] text-gray-500">أضف رتب لمكافأة الأعضاء النشطين</p>
                                            <button type="button" onclick="openAddLevelRoleModal('voice')" class="px-5 py-2 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-1.5 shadow-lg shadow-blue-800/40">
                                                <span>إضافة أول رتبة</span>
                                            </button>
                                        </div>
                                    `}
                                </div>

                                <!-- بطاقة معادلة حساب XP -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl space-y-3">
                                    <div class="flex items-center justify-end gap-1.5 text-xs font-bold text-gray-300">
                                        <span>معادلة حساب XP</span>
                                        <span class="text-blue-400">ℹ️</span>
                                    </div>
                                    <p class="text-[11px] text-white text-right font-mono">XP المطلوب للمستوى = (المستوى × 25)²</p>
                                    <div class="flex items-center justify-center gap-2 pt-1">
                                        <span class="px-3 py-1 bg-white/5 border border-blue-500/20 rounded-lg text-[10px] font-mono text-gray-300">مستوى 20 = 250,000 XP</span>
                                        <span class="px-3 py-1 bg-white/5 border border-blue-500/20 rounded-lg text-[10px] font-mono text-gray-300">مستوى 10 = 62,500 XP</span>
                                        <span class="px-3 py-1 bg-white/5 border border-blue-500/20 rounded-lg text-[10px] font-mono text-gray-300">مستوى 5 = 15,625 XP</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 4. تبويب رتب مشتركة / الشرط المزدوج (Shared Dual Roles - Image 2) -->
                        <!-- ========================================================= -->
                        <div id="tabLvlShared" class="space-y-6 ${(currentTab === 'shared_roles') ? '' : 'hidden'}">
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-5 shadow-xl">
                                <div class="flex items-center justify-between border-b border-blue-500/20 pb-3">
                                    <div class="flex items-center gap-2">
                                        <button type="button" onclick="openAddSharedRoleModal()" class="px-5 py-2 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-blue-800/40">
                                            <span>➕</span>
                                            <span>إضافة شرط</span>
                                        </button>
                                        <button type="button" onclick="location.reload()" class="px-3.5 py-2 bg-[#070d1d] hover:bg-white/5 border border-blue-500/20 text-white hover:text-gray-300 rounded-xl text-xs font-bold transition flex items-center gap-1">
                                            <span>🔄</span>
                                            <span>مزامنة</span>
                                        </button>
                                    </div>
                                    <div class="text-right">
                                        <h4 class="text-sm font-black text-white">رتب الشرط المزدوج</h4>
                                        <p class="text-[10px] text-gray-500 mt-0.5">الرتبة تُمنح فقط عند تحقق شرطي الكتابة والصوت معاً</p>
                                    </div>
                                </div>

                                <!-- بطاقة كيف تعمل الرتب المشتركة؟ (Exact to Image 2) -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl space-y-2 text-right">
                                    <div class="flex items-center justify-end gap-1.5 text-xs font-bold text-amber-400">
                                        <span>كيف تعمل الرتب المشتركة؟</span>
                                        <span>ℹ️</span>
                                    </div>
                                    <p class="text-[11px] text-gray-300 leading-relaxed">
                                        تُمنح الرتبة فقط عندما يحقق العضو كلا الشرطين في نفس الوقت — مستوى كتابي وصوتي يبلغان الحد المطلوب. إذا نقص أي شرط، تُسحب الرتبة تلقائياً.
                                    </p>
                                </div>

                                <!-- مثال توضيحي (Exact to Image 2) -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl space-y-2">
                                    <span class="text-[10px] text-gray-500 block text-right">مثال توضيحي:</span>
                                    <div class="flex items-center justify-center gap-3">
                                        <span class="px-3 py-1 bg-amber-950/60 text-amber-400 border border-amber-800/40 rounded-xl text-xs font-bold flex items-center gap-1.5">
                                            <span>عضو نشيط</span>
                                            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                                        </span>
                                        <span class="text-gray-500 font-bold">&gt;</span>
                                        <span class="px-3 py-1 bg-pink-950/60 text-pink-400 border border-pink-500/20 rounded-xl text-xs font-bold flex items-center gap-1">
                                            <span>صوتي ≥ 5</span>
                                            <span>🎵</span>
                                        </span>
                                        <span class="text-gray-500 font-bold">+</span>
                                        <span class="px-3 py-1 bg-indigo-950/60 text-indigo-400 border border-indigo-500/20 rounded-xl text-xs font-bold flex items-center gap-1">
                                            <span>كتابي ≥ 10</span>
                                            <span>💬</span>
                                        </span>
                                    </div>
                                </div>

                                <div class="space-y-2">
                                    ${(levelRewardsList && levelRewardsList.filter(r => r.reward_type === 'shared').length > 0) ? levelRewardsList.filter(r => r.reward_type === 'shared').map(r => `
                                        <div class="bg-[#070d1d] border border-blue-500/20 p-3.5 rounded-xl flex items-center justify-between hover:border-amber-500/40 transition text-xs">
                                            <button type="button" onclick="deleteLevelRole(${r.id || r.level})" class="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition">حذف 🗑️</button>
                                            <div class="flex items-center gap-3">
                                                <div class="text-right">
                                                    <span class="font-bold text-white block">كتابي ≥ ${r.level} + صوتي ≥ ${r.voice_level || 0}</span>
                                                    <span class="text-[10px] text-amber-400 font-mono">الرتبة: @${(guildRoles.find(role => role.id === r.role_id)?.name) || r.role_id}</span>
                                                </div>
                                                <span class="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center font-bold">✨</span>
                                            </div>
                                        </div>
                                    `).join('') : `
                                        <div class="py-12 text-center space-y-3">
                                            <div class="w-12 h-12 rounded-full bg-amber-950/40 text-amber-400 flex items-center justify-center text-xl mx-auto border border-amber-500/20">✨</div>
                                            <h5 class="text-xs font-bold text-gray-300">لا توجد رتب مشتركة</h5>
                                            <p class="text-[10px] text-gray-500">أضف شرطاً مزدوجاً يمنح رتبة عند تحقق مستوى صوتي وكتابي معاً</p>
                                            <button type="button" onclick="openAddSharedRoleModal()" class="px-5 py-2 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-1.5 shadow-lg shadow-blue-800/40">
                                                <span>إضافة أول شرط</span>
                                            </button>
                                        </div>
                                    `}
                                </div>
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 5. تبويب المتصدرين (Leaderboard Tab - Image 3) -->
                        <!-- ========================================================= -->
                        <div id="tabLvlLeaderboard" class="space-y-6 ${(currentTab === 'leaderboard') ? '' : 'hidden'}">
                            <div class="flex items-center justify-between">
                                <button type="button" onclick="location.reload()" class="px-4 py-2 bg-[#0b1322] hover:bg-white/5 border border-blue-500/20 text-gray-300 hover:text-gray-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5">
                                    <span>🔄</span>
                                    <span>تحديث</span>
                                </button>
                                <div class="text-right">
                                    <h4 class="text-sm font-black text-white">لوحة المتصدرين</h4>
                                    <p class="text-[10px] text-gray-500 mt-0.5">أكثر الأعضاء نشاطاً في السيرفر</p>
                                </div>
                            </div>

                            <!-- Triple Stats Cards (Exact to Image 3: عضو نشط | إجمالي XP | أعلى مستوى) -->
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                    <span class="text-2xl font-black text-white font-mono">${(guildLeaderboardUsers || []).length}</span>
                                    <span class="text-xs font-bold text-white block">عضو نشط</span>
                                </div>
                                <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                    <span class="text-2xl font-black text-white font-mono">${(guildLeaderboardUsers || []).reduce((acc, u) => acc + (u.xp || 0), 0)}</span>
                                    <span class="text-xs font-bold text-white block">إجمالي XP</span>
                                </div>
                                <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                    <span class="text-2xl font-black text-white font-mono">${(guildLeaderboardUsers && guildLeaderboardUsers[0]) ? guildLeaderboardUsers[0].level : 1}</span>
                                    <span class="text-xs font-bold text-white block">أعلى مستوى</span>
                                </div>
                            </div>

                            <!-- Leaderboard User Cards with Progress Bar (Exact to Image 3) -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-4 shadow-xl">
                                ${(guildLeaderboardUsers && guildLeaderboardUsers.length > 0) ? guildLeaderboardUsers.map((u, idx) => `
                                    <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-2xl flex items-center justify-between shadow-md">
                                        <div class="flex items-center gap-3">
                                            <span class="text-xs font-bold text-blue-400 font-mono">${u.xp || 0} <span class="text-[10px] text-gray-500">إجمالي XP</span></span>
                                        </div>
                                        
                                        <div class="flex-1 max-w-md mx-6 hidden sm:block">
                                            <div class="w-full bg-[#14233c] h-1.5 rounded-full overflow-hidden">
                                                <div class="bg-gradient-to-r from-blue-400 to-indigo-500 h-full rounded-full" style="width: ${Math.min(100, Math.max(10, ((u.xp || 0) % 1875) / 18.75))}%"></div>
                                            </div>
                                        </div>

                                        <div class="flex items-center gap-3">
                                            <span class="px-2 py-0.5 bg-indigo-950/60 text-indigo-300 border border-indigo-500/30 rounded-lg text-[10px] font-mono font-bold">Lv.${u.level || 1}</span>
                                            <span class="font-bold text-white text-xs">${u.user_id}</span>
                                            <div class="w-7 h-7 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center font-bold text-xs border border-amber-500/30 font-mono">
                                                ${idx + 1}
                                            </div>
                                        </div>
                                    </div>
                                `).join('') : `
                                    <div class="py-8 text-center text-xs text-gray-500">
                                        لا توجد بيانات مسجلة في لوحة المتصدرين بعد.
                                    </div>
                                `}
                            </div>
                        </div>

                    </div>

                    <script>
                    function switchLevelTab(tab) {
                        const tabs = ['settings', 'text_roles', 'voice_roles', 'shared_roles', 'leaderboard'];
                        tabs.forEach(t => {
                            const el = document.getElementById(t === 'settings' ? 'tabLvlSettings' : (t === 'text_roles' ? 'tabLvlText' : (t === 'voice_roles' ? 'tabLvlVoice' : (t === 'shared_roles' ? 'tabLvlShared' : 'tabLvlLeaderboard'))));
                            const btn = document.getElementById(t === 'settings' ? 'btnTabLvlSettings' : (t === 'text_roles' ? 'btnTabLvlText' : (t === 'voice_roles' ? 'btnTabLvlVoice' : (t === 'shared_roles' ? 'btnTabLvlShared' : 'btnTabLvlLeaderboard'))));
                            if (el) el.classList.toggle('hidden', t !== tab);
                            if (btn) {
                                btn.className = t === tab 
                                    ? "px-4 py-1.5 rounded-xl text-xs font-bold transition bg-gradient-to-r from-blue-400 to-indigo-600 text-white shadow-md flex items-center gap-1"
                                    : "px-4 py-1.5 rounded-xl text-xs font-bold transition text-blue-300 hover:text-white flex items-center gap-1";
                            }
                        });
                    }

                    async function openAddLevelRoleModal(rewardType = 'text') {
                        const typeLabel = rewardType === 'voice' ? 'الصوتي' : 'الكتابي';
                        const level = prompt('أدخل رقم المستوى ' + typeLabel + ' المطلوب (مثال: 5 أو 10 أو 20):');
                        if (!level || isNaN(level)) return;
                        const roleId = prompt('أدخل ID الرتبة الممنوحة:');
                        if (!roleId || !roleId.trim()) return;

                        try {
                            const res = await fetch('/api/guild/${guildId}/level-reward', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ level: parseInt(level), roleId: roleId.trim(), rewardType })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تمت إضافة رتبة المستوى بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (data.error || 'فشل الإضافة'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال بالخادم');
                        }
                    }

                    async function openAddSharedRoleModal() {
                        const textLevel = prompt('أدخل الحد الأدنى للمستوى الكتابي (مثال: 10):');
                        if (!textLevel || isNaN(textLevel)) return;
                        const voiceLevel = prompt('أدخل الحد الأدنى للمستوى الصوتي (مثال: 5):');
                        if (!voiceLevel || isNaN(voiceLevel)) return;
                        const roleId = prompt('أدخل ID الرتبة الممنوحة عند تحقق الشرطين:');
                        if (!roleId || !roleId.trim()) return;

                        try {
                            const res = await fetch('/api/guild/${guildId}/level-reward', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ level: parseInt(textLevel), voiceLevel: parseInt(voiceLevel), roleId: roleId.trim(), rewardType: 'shared' })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تمت إضافة رتبة الشرط المزدوج بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (data.error || 'فشل الإضافة'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال بالخادم');
                        }
                    }

                    async function deleteLevelRole(idOrLevel) {
                        if (!confirm('هل أنت متأكد من حذف هذه الرتبة؟')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/level-reward/' + idOrLevel, {
                                method: 'DELETE'
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم الحذف بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ فشل الحذف');
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
                    }
                    </script>
`;
            } else if (section === 'moderation') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Master Header Card (Exact to Image 1: الإشراف & Action Buttons) -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <div class="flex items-center gap-3">
                                <button type="button" onclick="clearAllServerWarnings()" class="px-4 py-2.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow">
                                    <span>🗑️</span>
                                    <span>مسح كل التحذيرات</span>
                                </button>
                            </div>

                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">الإشراف</h4>
                                    <p class="text-white text-xs mt-0.5">إعدادات الإشراف والعقوبات</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center text-lg border border-blue-500/20">
                                    🛡️
                                </div>
                            </div>
                        </div>

                        <!-- 2. Triple Stats Badges (Exact to Image 1: رتب الإشراف / رتب مستثناة / كلمات محظورة) -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <!-- رتب الإشراف -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(settings.mod_staff_roles ? settings.mod_staff_roles.split(',').filter(Boolean).length : 0)}</span>
                                <span class="text-xs font-bold text-white block">رتب الإشراف</span>
                            </div>
                            <!-- رتب مستثناة -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-emerald-400 font-mono">${(settings.mod_exempt_roles ? settings.mod_exempt_roles.split(',').filter(Boolean).length : 0)}</span>
                                <span class="text-xs font-bold text-white block">رتب مستثناة</span>
                            </div>
                            <!-- كلمات محظورة -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(settings.bad_words_list ? settings.bad_words_list.split(/[\n,]+/).filter(Boolean).length : 0)}</span>
                                <span class="text-xs font-bold text-white block">كلمات محظورة</span>
                            </div>
                        </div>

                        <!-- 3. Grid of 6 Moderation Feature Cards (Exact to Image 1) -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            
                            <!-- 1. نظام التحذيرات -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_warn_enabled" value="1" ${settings.mod_warn_enabled !== 0 ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-2 text-right">
                                    <h5 class="text-xs font-bold text-white">نظام التحذيرات</h5>
                                    <span class="text-amber-400">🛡️</span>
                                </div>
                            </div>

                            <!-- 2. نظام الكتم -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_mute_enabled" value="1" ${settings.mod_mute_enabled !== 0 ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-2 text-right">
                                    <h5 class="text-xs font-bold text-white">نظام الكتم</h5>
                                    <span class="text-indigo-400">⏳</span>
                                </div>
                            </div>

                            <!-- 3. الكلمات المحظورة -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_badwords_enabled" value="1" ${settings.mod_badwords_enabled !== 0 ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-2 text-right">
                                    <h5 class="text-xs font-bold text-white">الكلمات المحظورة</h5>
                                    <span class="text-rose-400">💬</span>
                                </div>
                            </div>

                            <!-- 4. سبام المنشنات -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_mention_spam_enabled" value="1" ${settings.mod_mention_spam_enabled !== 0 ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-2 text-right">
                                    <h5 class="text-xs font-bold text-white">سبام المنشنات</h5>
                                    <span class="text-pink-400">📢</span>
                                </div>
                            </div>

                            <!-- 5. فلتر الحروف الكبيرة -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_caps_enabled" value="1" ${settings.mod_caps_enabled ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-2 text-right">
                                    <h5 class="text-xs font-bold text-white">فلتر الحروف الكبيرة</h5>
                                    <span class="text-blue-400">🔠</span>
                                </div>
                            </div>

                            <!-- 6. سبام الإيموجيات -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                                <label class="toggle">
                                    <input type="checkbox" name="mod_emoji_spam_enabled" value="1" ${settings.mod_emoji_spam_enabled ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-2 text-right">
                                    <h5 class="text-xs font-bold text-white">سبام الإيموجيات</h5>
                                    <span class="text-amber-300">😜</span>
                                </div>
                            </div>

                        </div>

                        <!-- 4. بطاقة رتب الإشراف والرتب المستثناة (Exact to Image 1) -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-5 shadow-xl">
                            <div class="flex items-center justify-end gap-2 text-white font-black text-sm border-b border-blue-500/20 pb-3">
                                <span>رتب الإشراف</span>
                                <span class="text-blue-400">👮</span>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <!-- رتب المشرفين -->
                                <div class="space-y-1.5">
                                    <label class="block text-xs font-bold text-gray-300">رتب المشرفين</label>
                                    ${renderRoleSelect('mod_staff_roles', settings.mod_staff_roles || '')}
                                </div>

                                <!-- رتب مستثناة -->
                                <div class="space-y-1.5">
                                    <label class="block text-xs font-bold text-gray-300">رتب مستثناة</label>
                                    ${renderRoleSelect('mod_exempt_roles', settings.mod_exempt_roles || '')}
                                </div>
                            </div>
                        </div>

                    </div>

                    <script>
                    async function clearAllServerWarnings() {
                        if (!confirm('هل أنت متأكد من مسح جميع التحذيرات المسجلة لجميع الأعضاء في هذا السيرفر؟')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/clear-all-warnings', {
                                method: 'POST'
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم مسح جميع التحذيرات بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ فشل مسح التحذيرات');
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
                    }
                    </script>
`;
            } else if (section === 'giveaways') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Master Header Card (Exact to Image 1: نظام القيف اواي & Action Button) -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <button type="button" onclick="openCreateGiveawayModal()" class="px-6 py-2.5 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-blue-800/40">
                                <span>➕</span>
                                <span>إنشاء قيف اواي</span>
                            </button>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">نظام القيف اواي</h4>
                                    <p class="text-white text-xs mt-0.5">إنشاء وإدارة مسابقات القيف اواي في سيرفرك</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center text-lg border border-blue-500/20">
                                    🎁
                                </div>
                            </div>
                        </div>

                        <!-- 2. Quad Stats Badges (Exact to Image 1: إجمالي القيف اواي / نشطة الآن / منتهية / إجمالي المشاركين) -->
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <!-- إجمالي القيف اواي -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(guildGiveawaysList || []).length}</span>
                                <span class="text-xs font-bold text-white block">إجمالي القيف اواي</span>
                            </div>
                            <!-- نشطة الآن -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-emerald-400 font-mono">${(guildGiveawaysList || []).filter(g => g.status === 'active').length}</span>
                                <span class="text-xs font-bold text-white block">نشطة الآن</span>
                            </div>
                            <!-- منتهية -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(guildGiveawaysList || []).filter(g => g.status === 'ended').length}</span>
                                <span class="text-xs font-bold text-white block">منتهية</span>
                            </div>
                            <!-- إجمالي المشاركين -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-amber-400 font-mono">${(guildGiveawaysList || []).reduce((acc, g) => acc + ((g.entries ? (typeof g.entries === 'string' ? JSON.parse(g.entries || '[]').length : g.entries.length) : 0)), 0)}</span>
                                <span class="text-xs font-bold text-white block">إجمالي المشاركين</span>
                            </div>
                        </div>

                        <!-- 3. Filter Bar & List / Empty State (Exact to Image 1) -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-6 shadow-xl">
                            <div class="flex items-center justify-between border-b border-blue-500/20 pb-4">
                                <button type="button" onclick="location.reload()" class="p-2 bg-[#070d1d] hover:bg-white/5 border border-blue-500/20 text-white hover:text-gray-300 rounded-xl transition">
                                    🔄
                                </button>
                                <div class="flex items-center gap-1.5 bg-[#070d1d] p-1 rounded-xl border border-blue-500/20 text-xs font-bold">
                                    <button type="button" onclick="filterGiveawayTab('ended')" id="btnGwEnded" class="px-3 py-1 rounded-lg text-white hover:text-gray-300 transition">المنتهية ${(guildGiveawaysList || []).filter(g => g.status === 'ended').length}</button>
                                    <button type="button" onclick="filterGiveawayTab('active')" id="btnGwActive" class="px-3 py-1 rounded-lg text-white hover:text-gray-300 transition">النشطة ${(guildGiveawaysList || []).filter(g => g.status === 'active').length}</button>
                                    <button type="button" onclick="filterGiveawayTab('all')" id="btnGwAll" class="px-3 py-1 rounded-lg bg-gradient-to-l from-purple-600 to-blue-500 text-white transition shadow">الكل ${(guildGiveawaysList || []).length}</button>
                                </div>
                            </div>

                            <div id="giveawaysListContainer">
                                ${(guildGiveawaysList && guildGiveawaysList.length > 0) ? `
                                    <div class="space-y-3">
                                        ${guildGiveawaysList.map(g => {
                                            const entriesCount = g.entries ? (typeof g.entries === 'string' ? JSON.parse(g.entries || '[]').length : g.entries.length) : 0;
                                            return '<div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/20 transition text-xs">' +
                                                '<div class="flex items-center gap-3">' +
                                                    '<span class="px-2 py-0.5 rounded text-[10px] font-bold ' + (g.status === 'active' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/30' : 'bg-white/5 text-white') + '">' + (g.status === 'active' ? 'نشط 🟢' : 'منتهي 🔴') + '</span>' +
                                                    '<span class="text-white font-mono">' + entriesCount + ' مشارك 👥</span>' +
                                                '</div>' +
                                                '<div class="text-right">' +
                                                    '<h5 class="font-bold text-white text-sm">' + g.prize + '</h5>' +
                                                    '<p class="text-[10px] text-white">الفائزين: ' + (g.winners_count || 1) + ' • القناة: <#' + g.channel_id + '></p>' +
                                                '</div>' +
                                            '</div>';
                                        }).join('')}
                                    </div>
                                ` : `
                                    <div class="py-14 text-center space-y-4">
                                        <div class="w-16 h-16 rounded-2xl bg-orange-950/30 text-blue-400 flex items-center justify-center text-3xl mx-auto border border-blue-500/20 shadow-inner">
                                            🎁
                                        </div>
                                        <div class="space-y-1">
                                            <h5 class="text-sm font-black text-white">لا توجد قيف اواي بعد</h5>
                                            <p class="text-xs text-white">ابدأ بإنشاء أول قيف اواي لسيرفرك!</p>
                                        </div>
                                        <button type="button" onclick="openCreateGiveawayModal()" class="px-6 py-2.5 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-2 shadow-lg shadow-blue-800/40">
                                            <span>إنشاء قيف اواي</span>
                                        </button>
                                    </div>
                                `}
                            </div>
                        </div>

                        <!-- ========================================================= -->
                        <!-- 4. نافذة إنشاء قيف اواي التفاعلية الكاملة (Exact to Images 2 & 3 Modal) -->
                        <!-- ========================================================= -->
                        <div id="createGiveawayModal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
                            <div class="bg-[#0b1322] border border-blue-500/20 rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-5 text-right shadow-2xl" dir="rtl">
                                
                                <!-- Modal Header -->
                                <div class="flex items-center justify-between border-b border-blue-500/20 pb-4">
                                    <button type="button" onclick="closeCreateGiveawayModal()" class="text-white hover:text-gray-300 text-lg font-bold">✕</button>
                                    <div class="flex items-center gap-2.5">
                                        <div class="text-right">
                                            <h3 class="text-base font-black text-white">إنشاء قيف اواي جديد</h3>
                                            <p class="text-[10px] text-white">أعلن عن جائزتك الآن</p>
                                        </div>
                                        <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-sm shadow">
                                            🎉
                                        </div>
                                    </div>
                                </div>

                                <!-- حقل الجائزة -->
                                <div class="space-y-1.5">
                                    <label class="block text-xs font-bold text-gray-300">الجائزة <span class="text-blue-400">*</span></label>
                                    <input type="text" id="gwPrize" placeholder="مثال: Discord Nitro لمدة شهر" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                </div>

                                <!-- الوصف (اختياري) -->
                                <div class="space-y-1.5">
                                    <label class="block text-xs font-bold text-gray-300">الوصف (اختياري)</label>
                                    <textarea id="gwDesc" rows="2" placeholder="...أضف تفاصيل إضافية" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl p-3 text-xs text-white outline-none text-right leading-relaxed"></textarea>
                                </div>

                                <!-- القناة المستهدفة -->
                                <div class="space-y-1.5">
                                    <label class="block text-xs font-bold text-gray-300">القناة <span class="text-blue-400">*</span></label>
                                    ${renderChannelSelect('gwChannel', '')}
                                </div>

                                <!-- المدة & عدد الفائزين -->
                                <div class="grid grid-cols-2 gap-4">
                                    <div class="space-y-1.5">
                                        <label class="block text-xs font-bold text-gray-300">عدد الفائزين</label>
                                        <input type="number" id="gwWinners" value="1" min="1" max="50" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-center font-mono">
                                    </div>
                                    <div class="space-y-1.5">
                                        <label class="block text-xs font-bold text-gray-300">المدة</label>
                                        <select id="gwDuration" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right cursor-pointer">
                                            <option value="10m">10 دقائق</option>
                                            <option value="1h">ساعة واحدة</option>
                                            <option value="6h">6 ساعات</option>
                                            <option value="12h">12 ساعة</option>
                                            <option value="24h" selected>يوم كامل (24 ساعة)</option>
                                            <option value="3d">3 أيام</option>
                                            <option value="7d">أسبوع كامل</option>
                                        </select>
                                    </div>
                                </div>

                                <!-- المظهر (المجسم والإيموجي ولون الإطار) -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-2xl space-y-4">
                                    <span class="text-xs font-bold text-white block border-b border-blue-500/20 pb-2">المظهر</span>

                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <span class="text-lg">🎉</span>
                                            <input type="text" id="gwEmoji" value="🎉" class="w-16 bg-[#0b1322] border border-blue-500/20 rounded-xl px-2 py-1 text-xs text-center text-white font-mono outline-none">
                                        </div>
                                        <label class="text-xs font-bold text-gray-300">الإيموجي</label>
                                    </div>

                                    <!-- ألوان الإطار -->
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <input type="color" id="gwColorInput" value="#ef5700" class="w-6 h-6 rounded-md cursor-pointer bg-transparent border-0">
                                            <div class="flex items-center gap-1.5">
                                                <button type="button" onclick="setGwColor('#ef5700')" class="w-4 h-4 rounded-md bg-[#ef5700] ring-2 ring-blue-300/50"></button>
                                                <button type="button" onclick="setGwColor('#60a5fa')" class="w-4 h-4 rounded-md bg-[#60a5fa]"></button>
                                                <button type="button" onclick="setGwColor('#10b981')" class="w-4 h-4 rounded-md bg-[#10b981]"></button>
                                                <button type="button" onclick="setGwColor('#93c5fd')" class="w-4 h-4 rounded-md bg-[#93c5fd]"></button>
                                                <button type="button" onclick="setGwColor('#93c5fd')" class="w-4 h-4 rounded-md bg-[#93c5fd]"></button>
                                                <button type="button" onclick="setGwColor('#ec4899')" class="w-4 h-4 rounded-md bg-[#ec4899]"></button>
                                                <button type="button" onclick="setGwColor('#ef4444')" class="w-4 h-4 rounded-md bg-[#ef4444]"></button>
                                                <button type="button" onclick="setGwColor('#ffffff')" class="w-4 h-4 rounded-md bg-[#ffffff]"></button>
                                                <button type="button" onclick="setGwColor('#000000')" class="w-4 h-4 rounded-md bg-[#000000]"></button>
                                            </div>
                                        </div>
                                        <label class="text-xs font-bold text-gray-300">لون الإطار</label>
                                    </div>

                                    <!-- صورة القيف اواي (رفع ملف مع معاينة فورية بدون روابط) -->
                                    <div class="space-y-2 pt-2 border-t border-blue-500/20">
                                        <div class="flex items-center justify-between">
                                            <button type="button" onclick="clearGwImage()" class="text-[11px] text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 cursor-pointer">
                                                <span>✕</span><span>إزالة الصورة</span>
                                            </button>
                                            <label class="block text-xs font-bold text-gray-300">صورة القيف اواي (اختياري)</label>
                                        </div>
                                        
                                        <div class="flex items-center gap-3 bg-[#0b1322] p-3 rounded-2xl border border-blue-500/20">
                                            <div class="w-16 h-16 rounded-xl border border-blue-500/20 bg-[#070d1d] overflow-hidden flex items-center justify-center shrink-0">
                                                <img id="prev_gwImage_box" src="" class="w-full h-full object-cover hidden">
                                                <span id="ph_gwImage" class="text-xl text-gray-600">🖼️</span>
                                            </div>
                                            <div class="flex-1 space-y-1">
                                                <input type="hidden" id="gwImage" value="">
                                                <input type="file" id="file_gwImage" accept="image/*" class="hidden" onchange="uploadGwImageFile(this)">
                                                <button type="button" onclick="document.getElementById('file_gwImage').click()" class="w-full px-3 py-2 bg-blue-400/20 hover:bg-blue-400/30 border border-blue-500/20 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95">
                                                    <span>📤</span><span id="btn_text_gwImage">اختيار صورة من الجهاز</span>
                                                </button>
                                                <p class="text-[10px] text-white text-right">اختر صورة من جهازك مباشرة بدون الحاجة لأي رابط</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- المتطلبات والدخول -->
                                <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-2xl space-y-4">
                                    <span class="text-xs font-bold text-white block border-b border-blue-500/20 pb-2">المتطلبات والدخول</span>

                                    <!-- الرتب المطلوبة -->
                                    <div class="space-y-1.5">
                                        <div class="flex items-center justify-between">
                                            <span class="text-[10px] text-blue-400 font-bold">حصرية لهذه الرتبة فقط</span>
                                            <label class="block text-xs font-bold text-gray-300">الرتبة المسموح لها بالمشاركة فقط (اختياري)</label>
                                        </div>
                                        ${renderRoleSelect('gwReqRole', '')}
                                        <p class="text-[10px] text-gray-500">إذا اخترت رتبة، لن يتمكن أي عضو من دخول السحب إلا إذا كان يمتلك هذه الرتبة فقط.</p>
                                    </div>

                                    <!-- طريقة المشاركة & لون الزر -->
                                    <div class="grid grid-cols-2 gap-3">
                                        <div class="space-y-1.5">
                                            <label class="block text-xs font-bold text-gray-300">لون الزر</label>
                                            <select id="gwBtnStyle" class="w-full bg-[#0b1322] border border-blue-500/20 rounded-xl px-3 py-2 text-xs text-white outline-none text-right">
                                                <option value="Primary">🔵 أزرق (Primary)</option>
                                                <option value="Success">🟢 أخضر (Success)</option>
                                                <option value="Danger">🔴 أحمر (Danger)</option>
                                                <option value="Secondary">⚪ رمادي (Secondary)</option>
                                            </select>
                                        </div>
                                        <div class="space-y-1.5">
                                            <label class="block text-xs font-bold text-gray-300">طريقة المشاركة</label>
                                            <select id="gwEntryMode" class="w-full bg-[#0b1322] border border-blue-500/20 rounded-xl px-3 py-2 text-xs text-white outline-none text-right">
                                                <option value="button">🔘 زر (Button)</option>
                                                <option value="reaction">😊 تفاعل (Reaction)</option>
                                            </select>
                                        </div>
                                    </div>

                                    <!-- إعلان الفائزين -->
                                    <div class="flex items-center justify-between pt-2 border-t border-blue-500/20">
                                        <label class="toggle"><input type="checkbox" id="gwNotifyWinners" checked><span class="slider"></span></label>
                                        <div class="text-right">
                                            <h5 class="text-xs font-bold text-white">إعلان الفائزين</h5>
                                            <p class="text-[10px] text-gray-500">إرسال رسالة عند اختيار الفائزين</p>
                                        </div>
                                    </div>
                                </div>

                                <!-- Modal Footer Buttons -->
                                <div class="flex items-center justify-between pt-4 border-t border-blue-500/20 flex-row-reverse">
                                    <button type="button" onclick="submitCreateGiveaway()" class="px-8 py-2.5 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-blue-800/40">
                                        + إنشاء قيف اواي
                                    </button>
                                    <button type="button" onclick="closeCreateGiveawayModal()" class="px-6 py-2.5 bg-[#070d1d] hover:bg-white/5 border border-blue-500/20 text-white hover:text-gray-300 rounded-xl text-xs font-bold transition">
                                        إلغاء
                                    </button>
                                </div>

                            </div>
                        </div>

                    </div>

                    <script>
                    function openCreateGiveawayModal() {
                        document.getElementById('createGiveawayModal').classList.remove('hidden');
                    }

                    function closeCreateGiveawayModal() {
                        document.getElementById('createGiveawayModal').classList.add('hidden');
                    }

                    function setGwColor(c) {
                        document.getElementById('gwColorInput').value = c;
                    }

                    function filterGiveawayTab(status) {
                        document.getElementById('btnGwAll').className = status === 'all' ? "px-3 py-1 rounded-lg bg-gradient-to-l from-purple-600 to-blue-500 text-white transition shadow" : "px-3 py-1 rounded-lg text-blue-300 hover:text-white transition";
                        document.getElementById('btnGwActive').className = status === 'active' ? "px-3 py-1 rounded-lg bg-gradient-to-l from-purple-600 to-blue-500 text-white transition shadow" : "px-3 py-1 rounded-lg text-blue-300 hover:text-white transition";
                        document.getElementById('btnGwEnded').className = status === 'ended' ? "px-3 py-1 rounded-lg bg-gradient-to-l from-purple-600 to-blue-500 text-white transition shadow" : "px-3 py-1 rounded-lg text-blue-300 hover:text-white transition";
                    }

                    async function submitCreateGiveaway() {
                        const prize = document.getElementById('gwPrize').value.trim();
                        const channelId = document.getElementById('gwChannel')?.value;
                        const duration = document.getElementById('gwDuration').value;
                        const winners = parseInt(document.getElementById('gwWinners').value) || 1;
                        const desc = document.getElementById('gwDesc').value.trim();
                        const color = document.getElementById('gwColorInput').value;
                        const image = document.getElementById('gwImage').value.trim();
                        const emoji = document.getElementById('gwEmoji').value.trim() || '🎉';
                        const reqRole = document.getElementById('gwReqRole')?.value;

                        if (!prize) { alert('يرجى كتابة اسم الجائزة'); return; }
                        if (!channelId) { alert('يرجى اختيار القناة التي سيتم نشر القيف اواي فيها'); return; }

                        try {
                            const res = await fetch('/api/guild/${guildId}/giveaways', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ prize, channelId, duration, winners, desc, color, image, emoji, reqRole })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم إنشاء ونشر القيف اواي في السيرفر بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (data.error || 'فشل إنشاء القيف اواي'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال بالخادم');
                        }
                    }

                    async function uploadGwImageFile(input) {
                        var file = input.files && input.files[0];
                        if (!file) return;
                        if (!file.type.startsWith('image/')) {
                            alert('❌ يرجى اختيار ملف صورة صالح (PNG, JPG, WEBP, GIF)');
                            return;
                        }
                        if (file.size > 15 * 1024 * 1024) {
                            alert('❌ حجم الصورة كبير جداً (أكثر من 15 ميجابايت)');
                            return;
                        }

                        // معاينة فورية محلية
                        var localUrl = URL.createObjectURL(file);
                        var boxImg = document.getElementById('prev_gwImage_box');
                        var ph = document.getElementById('ph_gwImage');
                        if (boxImg) { boxImg.src = localUrl; boxImg.classList.remove('hidden'); }
                        if (ph) ph.classList.add('hidden');
                        var hiddenInput = document.getElementById('gwImage');
                        if (hiddenInput) hiddenInput.value = localUrl;

                        var btnText = document.getElementById('btn_text_gwImage');
                        var origText = btnText ? btnText.innerText : 'اختيار صورة من الجهاز';
                        if (btnText) btnText.innerText = 'جاري الرفع... ⏳';

                        var reader = new FileReader();
                        reader.onload = async function(e) {
                            try {
                                var res = await fetch('/api/guild/${guildId}/upload-image', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ imageBase64: e.target.result, fieldName: 'gwImage' })
                                });
                                var data = await res.json();
                                if (data.success && data.url) {
                                    if (hiddenInput) hiddenInput.value = data.url;
                                    if (boxImg) boxImg.src = data.url;
                                    if (btnText) btnText.innerText = '✅ تم الرفع';
                                    setTimeout(function() { if (btnText) btnText.innerText = origText; }, 2000);
                                    URL.revokeObjectURL(localUrl);
                                } else {
                                    alert('⚠️ تعذّر رفع الصورة: ' + (data.error || 'خطأ غير معروف'));
                                    if (btnText) btnText.innerText = origText;
                                }
                            } catch(err) {
                                alert('⚠️ خطأ في الاتصال أثناء رفع الصورة');
                                if (btnText) btnText.innerText = origText;
                            }
                        };
                        reader.readAsDataURL(file);
                    }

                    function clearGwImage() {
                        var hiddenInput = document.getElementById('gwImage');
                        if (hiddenInput) hiddenInput.value = '';
                        var fileInp = document.getElementById('file_gwImage');
                        if (fileInp) fileInp.value = '';
                        var boxImg = document.getElementById('prev_gwImage_box');
                        var ph = document.getElementById('ph_gwImage');
                        if (boxImg) { boxImg.src = ''; boxImg.classList.add('hidden'); }
                        if (ph) ph.classList.remove('hidden');
                    }

                    window.uploadGwImageFile = uploadGwImageFile;
                    window.clearGwImage = clearGwImage;
                    </script>
`;
            } else if (section === 'suggestions') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- 1. Master Header Card (Suggestions & Feedback) -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <button type="button" onclick="openCreateSuggestionModal()" class="px-6 py-2.5 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-blue-800/40">
                                <span>➕</span>
                                <span>إضافة اقتراح جديد</span>
                            </button>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">نظام الاقتراحات والشكاوي</h4>
                                    <p class="text-white text-xs mt-0.5">جمع آراء وتصويتات الأعضاء ومراجعة وتحديث حالات الاقتراحات</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-blue-400/20 text-blue-400 flex items-center justify-center text-lg border border-blue-500/20">
                                    💡
                                </div>
                            </div>
                        </div>

                        <!-- 2. Quad Stats Badges (إجمالي الاقتراحات / قيد الانتظار / مقبولة / مرفوضة) -->
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-white font-mono">${(guildSuggestionsList || []).length}</span>
                                <span class="text-xs font-bold text-white block">إجمالي الاقتراحات</span>
                            </div>
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-amber-400 font-mono">${(guildSuggestionsList || []).filter(s => s.status === 'pending').length}</span>
                                <span class="text-xs font-bold text-white block">قيد المراجعة</span>
                            </div>
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-emerald-400 font-mono">${(guildSuggestionsList || []).filter(s => s.status === 'accepted' || s.status === 'implemented').length}</span>
                                <span class="text-xs font-bold text-white block">مقبولة / منفذة</span>
                            </div>
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-center space-y-1 shadow-lg">
                                <span class="text-2xl font-black text-rose-400 font-mono">${(guildSuggestionsList || []).filter(s => s.status === 'rejected').length}</span>
                                <span class="text-xs font-bold text-white block">مرفوضة</span>
                            </div>
                        </div>

                        <!-- 3. إعدادات نظام الاقتراحات الأساسية (قناة الاقتراحات، رتب المراجعة، الخيوط التلقائية) -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-4 shadow-xl">
                            <h4 class="text-xs font-black text-white border-b border-blue-500/20 pb-3">إعدادات قناة وصلاحيات الاقتراحات</h4>
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة نشر الاقتراحات (Suggestions Channel)</label>
                                    ${renderChannelSelect('suggestions_channel', settings.suggestions_channel || '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة سجلات الإدارة (Log Channel)</label>
                                    ${renderChannelSelect('suggestions_log_channel', settings.suggestions_log_channel || settings.log_channel || '')}
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">رتب الإدارة المسؤولة عن المراجعة (Staff Roles)</label>
                                    ${renderRoleSelect('suggestions_staff_roles', settings.suggestions_staff_roles || '')}
                                </div>
                                <div class="flex items-center justify-between p-3.5 bg-[#070d1d] border border-blue-500/20 rounded-xl mt-6">
                                    <label class="toggle"><input type="checkbox" name="suggestions_auto_thread" value="1" ${settings.suggestions_auto_thread !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white">إنشاء خيط نقاش تلقائي (Thread)</h5>
                                        <p class="text-[10px] text-gray-500">فتح ثريد تحت كل اقتراح لتمكين الأعضاء من النقاش</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 4. قائمة وجدول الاقتراحات الحية والتفاعل (Live Suggestions List) -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-6 shadow-xl">
                            <div class="flex items-center justify-between border-b border-blue-500/20 pb-4">
                                <button type="button" onclick="location.reload()" class="p-2 bg-[#070d1d] hover:bg-white/5 border border-blue-500/20 text-white hover:text-gray-300 rounded-xl transition">
                                    🔄
                                </button>
                                <div class="flex items-center gap-1.5 bg-[#070d1d] p-1 rounded-xl border border-blue-500/20 text-xs font-bold">
                                    <button type="button" onclick="filterSuggTab('rejected')" id="btnSgRejected" class="px-3 py-1 rounded-lg text-white hover:text-gray-300 transition">المرفوضة</button>
                                    <button type="button" onclick="filterSuggTab('accepted')" id="btnSgAccepted" class="px-3 py-1 rounded-lg text-white hover:text-gray-300 transition">المقبولة</button>
                                    <button type="button" onclick="filterSuggTab('pending')" id="btnSgPending" class="px-3 py-1 rounded-lg text-white hover:text-gray-300 transition">قيد المراجعة</button>
                                    <button type="button" onclick="filterSuggTab('all')" id="btnSgAll" class="px-3 py-1 rounded-lg bg-gradient-to-l from-purple-600 to-blue-500 text-white transition shadow">الكل</button>
                                </div>
                            </div>

                            <div id="suggestionsListContainer" class="space-y-4">
                                ${(guildSuggestionsList && guildSuggestionsList.length > 0) ? guildSuggestionsList.map(s => {
                                    let upCount = 0;
                                    let downCount = 0;
                                    try { upCount = JSON.parse(s.upvotes || '[]').length; } catch(e) {}
                                    try { downCount = JSON.parse(s.downvotes || '[]').length; } catch(e) {}

                                    let statusBadge = '<span class="px-2.5 py-0.5 bg-amber-950/60 text-amber-400 border border-amber-800/30 rounded-lg text-[10px] font-bold">⏳ قيد المراجعة</span>';
                                    if (s.status === 'accepted') statusBadge = '<span class="px-2.5 py-0.5 bg-emerald-950/60 text-emerald-400 border border-emerald-800/30 rounded-lg text-[10px] font-bold">✅ مقبول</span>';
                                    if (s.status === 'implemented') statusBadge = '<span class="px-2.5 py-0.5 bg-indigo-950/60 text-indigo-400 border border-indigo-800/30 rounded-lg text-[10px] font-bold">🚀 تم التنفيذ</span>';
                                    if (s.status === 'rejected') statusBadge = '<span class="px-2.5 py-0.5 bg-rose-950/60 text-rose-400 border border-rose-800/30 rounded-lg text-[10px] font-bold">❌ مرفوض</span>';

                                    return '<div class="bg-[#070d1d] border border-blue-500/20 p-5 rounded-2xl space-y-3 hover:border-blue-500/20 transition text-right">' +
                                        '<div class="flex items-center justify-between border-b border-blue-500/20 pb-2">' +
                                            '<div class="flex items-center gap-2">' +
                                                '<button type="button" onclick="updateSuggestionStatus(' + s.id + ', &quot;accepted&quot;)" class="px-2.5 py-1 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/40 rounded-lg text-[10px] font-bold transition">قبول ✅</button>' +
                                                '<button type="button" onclick="updateSuggestionStatus(' + s.id + ', &quot;rejected&quot;)" class="px-2.5 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 rounded-lg text-[10px] font-bold transition">رفض ❌</button>' +
                                                '<button type="button" onclick="updateSuggestionStatus(' + s.id + ', &quot;implemented&quot;)" class="px-2.5 py-1 bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-400 border border-indigo-800/40 rounded-lg text-[10px] font-bold transition">تنفيذ 🚀</button>' +
                                            '</div>' +
                                            '<div class="flex items-center gap-2">' +
                                                statusBadge +
                                                '<span class="text-xs font-bold text-white font-mono">#' + s.id + '</span>' +
                                            '</div>' +
                                        '</div>' +
                                        '<div>' +
                                            (s.title ? '<h5 class="text-sm font-bold text-white mb-1">' + s.title + '</h5>' : '') +
                                            '<p class="text-xs text-gray-300 leading-relaxed">' + s.content + '</p>' +
                                        '</div>' +
                                        (s.status_reason ? '<div class="bg-[#0b1322] p-3 rounded-xl border border-blue-500/20 text-[11px] text-white"><span class="text-white font-bold">رد الإدارة: </span>' + s.status_reason + '</div>' : '') +
                                        '<div class="flex items-center justify-between text-[11px] text-gray-500 pt-2 border-t border-blue-500/20">' +
                                            '<div class="flex items-center gap-3">' +
                                                '<span class="text-emerald-400 font-mono font-bold">👍 ' + upCount + '</span>' +
                                                '<span class="text-rose-400 font-mono font-bold">👎 ' + downCount + '</span>' +
                                            '</div>' +
                                            '<div class="flex items-center gap-2">' +
                                                '<span>صاحب الاقتراح: <span class="font-mono text-white">' + s.user_id + '</span></span>' +
                                                '<span>•</span>' +
                                                '<span>' + (s.category || 'عام') + '</span>' +
                                            '</div>' +
                                        '</div>' +
                                    '</div>';
                                }).join('') : `
                                    <div class="py-14 text-center space-y-4">
                                        <div class="w-16 h-16 rounded-2xl bg-blue-800/30 text-blue-400 flex items-center justify-center text-3xl mx-auto border border-blue-500/20 shadow-inner">
                                            💡
                                        </div>
                                        <div class="space-y-1">
                                            <h5 class="text-sm font-black text-white">لا توجد اقتراحات بعد</h5>
                                            <p class="text-xs text-white">كن أول من يقترح فكرة لتطوير وتحسين السيرفر!</p>
                                        </div>
                                        <button type="button" onclick="openCreateSuggestionModal()" class="px-6 py-2.5 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-2 shadow-lg shadow-blue-800/40">
                                            <span>إضافة اقتراح</span>
                                        </button>
                                    </div>
                                `}
                            </div>
                        </div>

                        <!-- 5. نافذة إضافة اقتراح منبثقة (Create Suggestion Modal) -->
                        <div id="createSuggestionModal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
                            <div class="bg-[#0b1322] border border-blue-500/20 rounded-3xl w-full max-w-lg p-6 space-y-5 text-right shadow-2xl" dir="rtl">
                                <div class="flex items-center justify-between border-b border-blue-500/20 pb-4">
                                    <button type="button" onclick="closeCreateSuggestionModal()" class="text-white hover:text-gray-300 text-lg font-bold">✕</button>
                                    <h3 class="text-base font-black text-white">تقديم اقتراح جديد 💡</h3>
                                </div>

                                <div class="space-y-3">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1.5">عنوان الفكرة (اختياري)</label>
                                        <input type="text" id="sgTitle" placeholder="اكتب عنواناً مختصراً..." class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                    </div>

                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1.5">تصنيف الاقتراح</label>
                                        <select id="sgCategory" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right cursor-pointer">
                                            <option value="عام">💡 اقتراح عام</option>
                                            <option value="فعاليات">🎉 فعاليات ومسابقات</option>
                                            <option value="رتب">🎖️ رتب وأدوار</option>
                                            <option value="رومات">💬 قنوات ورومات صوتية</option>
                                            <option value="بوت">🤖 ميزات البوت</option>
                                            <option value="شكوى">⚠️ شكوى أو بلاغ</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1.5">تفاصيل الاقتراح <span class="text-blue-400">*</span></label>
                                        <textarea id="sgContent" rows="4" placeholder="اشرح فكرتك بالتفصيل وكيف ستفيد السيرفر..." class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl p-3 text-xs text-white outline-none text-right leading-relaxed"></textarea>
                                    </div>
                                </div>

                                <div class="flex items-center justify-between pt-4 border-t border-blue-500/20 flex-row-reverse">
                                    <button type="button" onclick="submitCreateSuggestion()" class="px-8 py-2.5 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-blue-800/40">
                                        إرسال الاقتراح
                                    </button>
                                    <button type="button" onclick="closeCreateSuggestionModal()" class="px-6 py-2.5 bg-[#070d1d] hover:bg-white/5 border border-blue-500/20 text-white hover:text-gray-300 rounded-xl text-xs font-bold transition">
                                        إلغاء
                                    </button>
                                </div>
                            </div>
                        </div>

                    </div>

                    <script>
                    function openCreateSuggestionModal() {
                        document.getElementById('createSuggestionModal').classList.remove('hidden');
                    }

                    function closeCreateSuggestionModal() {
                        document.getElementById('createSuggestionModal').classList.add('hidden');
                    }

                    async function submitCreateSuggestion() {
                        const title = document.getElementById('sgTitle').value.trim();
                        const category = document.getElementById('sgCategory').value;
                        const content = document.getElementById('sgContent').value.trim();

                        if (!content) { alert('يرجى كتابة تفاصيل الاقتراح'); return; }

                        try {
                            const res = await fetch('/api/guild/${guildId}/suggestions', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ title, category, content })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم إرسال الاقتراح بنجاح ونشره في السيرفر!');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (data.error || 'فشل إرسال الاقتراح'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
                    }

                    async function updateSuggestionStatus(id, status) {
                        const reason = prompt('أدخل سبب أو رد الإدارة على هذا القرار (اختياري):');
                        try {
                            const res = await fetch('/api/guild/${guildId}/suggestions/' + id + '/status', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status, reason })
                            });
                            const data = await res.json();
                            if (data.success) {
                                alert('✅ تم تحديث حالة الاقتراح بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ فشل تحديث الحالة');
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
                    }

                    function filterSuggTab(status) {
                        // Switch active class
                        ['all', 'pending', 'accepted', 'rejected'].forEach(s => {
                            const btn = document.getElementById('btnSg' + s.charAt(0).toUpperCase() + s.slice(1));
                            if (btn) {
                                btn.className = s === status 
                                    ? "px-3 py-1 rounded-lg bg-gradient-to-l from-purple-600 to-blue-500 text-white transition shadow"
                                    : "px-3 py-1 rounded-lg text-blue-300 hover:text-white transition";
                            }
                        });
                        location.href = '/dashboard/${guildId}/suggestions?status=' + (status === 'all' ? '' : status);
                    }
                    </script>
`;
            } else if (section === 'antiraid') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Header -->
                        <div class="bg-gradient-to-r from-[#140b10] via-[#0b1322] to-[#0d1729] border border-red-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-2xl bg-red-600/20 text-red-400 border border-red-500/30 flex items-center justify-center text-xl shadow-lg">🚨</div>
                                <div class="text-right">
                                    <h3 class="font-black text-white text-lg">مكافحة الغزو والأعضاء الوهميين</h3>
                                    <p class="text-white text-xs mt-0.5">كشف الغزو الجماعي وحظر الحسابات الوهمية والجديدة تلقائياً</p>
                                </div>
                            </div>
                            <div class="grid grid-cols-3 gap-3">
                                <div class="bg-[#070d1d] border border-blue-500/20 px-4 py-2 rounded-2xl text-center">
                                    <div class="text-xl font-black text-white">${settings.anti_alt_days || 3}</div>
                                    <div class="text-[10px] text-white font-bold mt-0.5">أيام الحساب</div>
                                </div>
                                <div class="bg-[#070d1d] border border-blue-500/20 px-4 py-2 rounded-2xl text-center">
                                    <div class="text-xl font-black text-emerald-400">${settings.raid_threshold || 5}</div>
                                    <div class="text-[10px] text-white font-bold mt-0.5">حد الغزو</div>
                                </div>
                                <div class="bg-[#070d1d] border border-blue-500/20 px-4 py-2 rounded-2xl text-center">
                                    <div class="text-xl font-black ${settings.antiraid_enabled ? 'text-emerald-400' : 'text-red-400'}">${settings.antiraid_enabled ? '🟢' : '🔴'}</div>
                                    <div class="text-[10px] text-white font-bold mt-0.5">الحالة</div>
                                </div>
                            </div>
                        </div>

                        <!-- Master Toggle -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-3xl flex items-center justify-between shadow-xl">
                            <label class="toggle">
                                <input type="checkbox" name="antiraid_enabled" value="1" ${settings.antiraid_enabled !== 0 ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-sm">تفعيل نظام مكافحة الغزو (Anti-Raid)</h4>
                                    <p class="text-white text-xs mt-0.5">رصد ومنع هجمات الدخول الجماعي والحسابات الوهمية أو الجديدة تلقائياً</p>
                                </div>
                                <div class="w-8 h-8 rounded-xl bg-red-600/20 text-red-400 flex items-center justify-center text-sm border border-red-500/30">🛡️</div>
                            </div>
                        </div>

                        <!-- Account Age & Raid Threshold Settings -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

                            <!-- Account Age Filter -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl space-y-4 shadow-xl">
                                <div class="flex items-center justify-between">
                                    <div class="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm border border-blue-500/20">🗓️</div>
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">الحد الأدنى لعمر الحساب</h4>
                                        <p class="text-white text-[11px] mt-0.5">الحسابات الجديدة الأقل من هذا العمر لن تتمكن من الدخول</p>
                                    </div>
                                </div>
                                <div class="grid grid-cols-4 gap-2">
                                    ${[0, 1, 3, 7, 14, 30, 60, 90].map(d => `
                                    <button type="button" onclick="selectAltDays(${d}, this)" class="alt-days-btn py-2 px-3 rounded-xl border text-xs font-bold transition ${(settings.anti_alt_days || 3) == d ? 'bg-blue-700/40 border-blue-400 text-white' : 'bg-[#070d1d] border-blue-500/20 text-white hover:text-gray-300'}">
                                        ${d === 0 ? 'بدون' : d + ' يوم'}
                                    </button>`).join('')}
                                </div>
                                <input type="hidden" name="anti_alt_days" id="inpAltDays" value="${settings.anti_alt_days || 3}">
                            </div>

                            <!-- Raid Threshold (Members / 10s) -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl space-y-4 shadow-xl">
                                <div class="flex items-center justify-between">
                                    <div class="w-8 h-8 rounded-xl bg-red-600/20 text-red-400 flex items-center justify-center text-sm border border-red-500/30">⚡</div>
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">حد رصد الغزو الجماعي</h4>
                                        <p class="text-white text-[11px] mt-0.5">عدد الأعضاء الذين ينضمون في 10 ثوانٍ لتفعيل درع الغزو</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-4">
                                    <div class="flex-1">
                                        <input type="range" name="raid_threshold" id="raidSlider" min="3" max="30" step="1" value="${settings.raid_threshold || 5}" oninput="document.getElementById('raidThresholdNum').innerText = this.value" class="w-full accent-blue-400">
                                    </div>
                                    <div class="bg-[#070d1d] border border-blue-500/20 text-white font-black text-lg font-mono px-4 py-2 rounded-xl min-w-[52px] text-center">
                                        <span id="raidThresholdNum">${settings.raid_threshold || 5}</span>
                                    </div>
                                </div>
                                <p class="text-[11px] text-gray-500 text-right">كلما كان العدد أصغر، كلما كان النظام أكثر حساسية للغزو</p>
                            </div>
                        </div>

                        <!-- Action & Options Row -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

                            <!-- Raid Action -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl space-y-3 shadow-xl">
                                <div class="flex items-center justify-between mb-2">
                                    <div class="w-8 h-8 rounded-xl bg-blue-400/20 text-blue-400 flex items-center justify-center text-sm border border-blue-500/20">⚖️</div>
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">إجراء مكافحة الغزو</h4>
                                        <p class="text-white text-[11px] mt-0.5">الإجراء التلقائي عند رصد غزو أو دخول مشبوه</p>
                                    </div>
                                </div>
                                <input type="hidden" name="antiraid_action" id="inpAntiraidAction" value="${settings.antiraid_action || 'kick'}">
                                <div class="grid grid-cols-3 gap-2">
                                    <button type="button" onclick="selectRaidAction('kick', this)" class="raid-action-btn py-3 rounded-2xl border text-xs font-bold transition ${(settings.antiraid_action || 'kick') === 'kick' ? 'bg-blue-700/40 border-blue-400 text-white' : 'bg-[#070d1d] border-blue-500/20 text-white hover:text-gray-300'}">
                                        🪓 طرد
                                    </button>
                                    <button type="button" onclick="selectRaidAction('ban', this)" class="raid-action-btn py-3 rounded-2xl border text-xs font-bold transition ${settings.antiraid_action === 'ban' ? 'bg-blue-700/40 border-blue-400 text-white' : 'bg-[#070d1d] border-blue-500/20 text-white hover:text-gray-300'}">
                                        🔨 حظر
                                    </button>
                                    <button type="button" onclick="selectRaidAction('timeout', this)" class="raid-action-btn py-3 rounded-2xl border text-xs font-bold transition ${settings.antiraid_action === 'timeout' ? 'bg-blue-700/40 border-blue-400 text-white' : 'bg-[#070d1d] border-blue-500/20 text-white hover:text-gray-300'}">
                                        ⏳ عزل
                                    </button>
                                </div>
                            </div>

                            <!-- Toggles: Anti-Bot & DM Notify & Log Channel -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl space-y-3 shadow-xl">
                                <h4 class="font-black text-white text-sm text-right border-b border-blue-500/20 pb-3">خيارات إضافية</h4>
                                <div class="space-y-2.5">
                                    <div class="flex items-center justify-between p-3 bg-[#070d1d] border border-blue-500/20 rounded-xl">
                                        <label class="toggle"><input type="checkbox" name="anti_bot" value="1" ${settings.anti_bot ? 'checked' : ''}><span class="slider"></span></label>
                                        <div class="text-right">
                                            <h5 class="text-xs font-bold text-white">منع إضافة بوتات جديدة (Anti-Bot)</h5>
                                            <p class="text-[10px] text-gray-500">تقييد إضافة أي بوتات إلا من قِبل الأونر أو الأدمن فقط</p>
                                        </div>
                                    </div>
                                    <div class="flex items-center justify-between p-3 bg-[#070d1d] border border-blue-500/20 rounded-xl">
                                        <label class="toggle"><input type="checkbox" name="antiraid_dm_notify" value="1" ${settings.antiraid_dm_notify !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                                        <div class="text-right">
                                            <h5 class="text-xs font-bold text-white">إشعار الأونر عبر DM</h5>
                                            <p class="text-[10px] text-gray-500">إرسال تنبيه خاص لأونر السيرفر عند رصد أي غزو</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Log Channel & Whitelist Roles -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl space-y-3 shadow-xl text-right">
                                <h4 class="font-black text-white text-sm">قناة سجلات مكافحة الغزو</h4>
                                <p class="text-white text-[11px]">تسجيل جميع الأحداث المشبوهة والإجراءات المتخذة</p>
                                ${renderChannelSelect('antiraid_log_channel', settings.antiraid_log_channel)}
                            </div>
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl space-y-3 shadow-xl text-right">
                                <h4 class="font-black text-white text-sm">رتبة مستثناة من الحماية (Whitelist)</h4>
                                <p class="text-white text-[11px]">هذه الرتبة لن تخضع لفلتر عمر الحساب أو حد الغزو</p>
                                ${renderRoleSelect('antiraid_whitelist_roles', settings.antiraid_whitelist_roles)}
                            </div>
                        </div>

                    </div>

                    <script>
                    function selectAltDays(days, btn) {
                        document.getElementById('inpAltDays').value = days;
                        document.querySelectorAll('.alt-days-btn').forEach(b => {
                            b.className = 'alt-days-btn py-2 px-3 rounded-xl border text-xs font-bold transition bg-[#070d1d] border-blue-500/20 text-blue-300 hover:text-white';
                        });
                        btn.className = 'alt-days-btn py-2 px-3 rounded-xl border text-xs font-bold transition bg-blue-700/40 border-blue-400 text-white';
                    }
                    function selectRaidAction(action, btn) {
                        document.getElementById('inpAntiraidAction').value = action;
                        document.querySelectorAll('.raid-action-btn').forEach(b => {
                            b.className = 'raid-action-btn py-3 rounded-2xl border text-xs font-bold transition bg-[#070d1d] border-blue-500/20 text-blue-300 hover:text-white';
                        });
                        btn.className = 'raid-action-btn py-3 rounded-2xl border text-xs font-bold transition bg-blue-700/40 border-blue-400 text-white';
                    }
                    </script>`;
            } else if (section === 'tempvoice') {
                const activeTempVoices = (rawDb ? rawDb.prepare('SELECT * FROM temp_voices WHERE guild_id = ?').all(guildId) : []) || [];

                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <!-- Header Banner -->
                        <div class="bg-gradient-to-r from-[#0a1430] via-[#0b1322] to-[#0a1430] border border-blue-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
                            <label class="toggle"><input type="checkbox" name="temp_voice_enabled" value="1" ${settings.temp_voice_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-xl flex items-center gap-2 justify-end"><span>الرومات الصوتية المؤقتة (Temp Voice)</span><span>🎙️</span></h4>
                                    <p class="text-white text-xs mt-0.5">إنشاء غرف صوتية خاصة تلقائياً عند دخول الأعضاء وحذفها فور خروجهم</p>
                                </div>
                                <div class="w-10 h-10 rounded-2xl bg-blue-400/20 text-blue-400 flex items-center justify-center text-xl border border-blue-500/20">🕒</div>
                            </div>
                        </div>

                        <!-- Quick Stats -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div class="bg-[#0b1322] border border-blue-500/20 p-4 rounded-2xl text-center">
                                <div class="text-2xl font-black text-blue-400 font-mono">${activeTempVoices.length}</div>
                                <div class="text-xs text-white font-bold mt-1">الرومات المؤقتة النشطة حالياً</div>
                            </div>
                            <div class="bg-[#0b1322] border border-blue-500/20 p-4 rounded-2xl text-center">
                                <div class="text-2xl font-black text-emerald-400 font-mono">${settings.temp_voice_channel ? 'مفعل ✓' : 'غير معطى'}</div>
                                <div class="text-xs text-white font-bold mt-1">حالة روم الإنشاء (Join-to-Create)</div>
                            </div>
                            <div class="bg-[#0b1322] border border-blue-500/20 p-4 rounded-2xl text-center">
                                <div class="text-2xl font-black text-white font-mono">${settings.temp_voice_user_limit || 'غير محدود'}</div>
                                <div class="text-xs text-white font-bold mt-1">الحد الأقصى الافتراضي</div>
                            </div>
                        </div>

                        <!-- Settings Form -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl space-y-4 shadow-xl">
                            <h4 class="text-sm font-black text-white border-b border-blue-500/20 pb-3 flex items-center gap-2 justify-end">
                                <span>إعدادات الروم الرئيسي والكاتيجوري</span>
                                <span>⚙️</span>
                            </h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">روم الدخول الرئيسي (Join-to-Create Channel)</label>
                                    ${renderChannelSelect('temp_voice_channel', settings.temp_voice_channel || '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قسم الرومات المنشأة (Category ID)</label>
                                    <input type="text" name="temp_voice_category" value="${settings.temp_voice_category || ''}" placeholder="آيدي الكاتيجوري الذي ستنشأ تحته الرومات..." class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الاسم الافتراضي للروم المنشأ</label>
                                    <input type="text" name="temp_voice_name_template" value="${settings.temp_voice_name_template || '🔊 | {username}'}" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-mono">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الحد الأقصى للمستخدمين الافتراضي</label>
                                    <input type="number" name="temp_voice_user_limit" value="${settings.temp_voice_user_limit || 0}" placeholder="0 = غير محدود" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono text-right">
                                </div>
                            </div>
                        </div>

                        <!-- Active Temp Channels Table -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl space-y-3 shadow-xl">
                            <h4 class="text-sm font-black text-white flex items-center justify-between pb-3 border-b border-blue-500/20">
                                <span class="text-xs text-blue-400 font-bold">${activeTempVoices.length} روم نشط</span>
                                <span class="flex items-center gap-2"><span>الرومات المؤقتة الفعالة الآن</span><span>🎙️</span></span>
                            </h4>
                            ${activeTempVoices.length === 0 ? `
                                <p class="text-center py-6 text-gray-500 text-xs font-bold">لا توجد أي رومات صوتية مؤقتة مفتوحة حالياً بالسيرفر</p>
                            ` : activeTempVoices.map(tv => `
                                <div class="bg-[#070d1d] p-3 rounded-2xl border border-blue-500/20 flex items-center justify-between">
                                    <span class="text-xs text-gray-500 font-mono">ID: ${tv.channel_id}</span>
                                    <div class="text-right">
                                        <span class="text-xs font-bold text-white block">صاحب الروم: <@${tv.owner_id}></span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>`;
            } else if (section === 'colors') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <label class="toggle"><input type="checkbox" name="colors_enabled" value="1" ${settings.colors_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">نظام رتب الألوان المتقدم (Color Roles)</h4>
                                    <p class="text-white text-xs mt-0.5">لوحة وقوائم تفاعلية لتمكين الأعضاء من اختيار ألوانهم المفضلة</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-pink-600/20 text-pink-400 flex items-center justify-center text-lg border border-pink-500/30">🎨</div>
                            </div>
                        </div>

                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-4 shadow-xl">
                            <h4 class="text-xs font-black text-white border-b border-blue-500/20 pb-3">إعدادات نشر لوحة الألوان</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة لوحة الألوان</label>
                                    ${renderChannelSelect('color_picker_channel', settings.color_picker_channel || '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">الرتبة المطلوبة لاختيار الألوان (اختياري)</label>
                                    ${renderRoleSelect('colors_required_role', settings.colors_required_role || '')}
                                </div>
                            </div>
                            <div class="pt-2">
                                <label class="block text-xs font-bold text-gray-300 mb-2">رتب الألوان المتاحة (Role IDs مفصولة بفواصل)</label>
                                <textarea name="color_role_ids" rows="3" placeholder="أيدي_رتبة_1, أيدي_رتبة_2, أيدي_رتبة_3..." class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl p-3 text-xs text-white outline-none font-mono text-right leading-relaxed">${settings.color_role_ids || ''}</textarea>
                            </div>
                        </div>
                    </div>`;
            } else if (section === 'boost') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl flex items-center justify-between shadow-xl">
                            <label class="toggle"><input type="checkbox" name="boost_msg_enabled" value="1" ${settings.boost_msg_enabled !== 0 ? 'checked' : ''}><span class="slider"></span></label>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">نظام تنبيهات ومعلومات البوست (Server Boost)</h4>
                                    <p class="text-white text-xs mt-0.5">تنبيهات تلقائية في الشات وشكر البوسترز وتوزيع الرتب والمميزات</p>
                                </div>
                                <div class="w-10 h-10 rounded-xl bg-pink-600/20 text-pink-400 flex items-center justify-center text-lg border border-pink-500/30">💎</div>
                            </div>
                        </div>

                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl space-y-4 shadow-xl">
                            <h4 class="text-xs font-black text-white border-b border-blue-500/20 pb-3">إعدادات رسالة البوست</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">قناة تنبيهات البوست</label>
                                    ${renderChannelSelect('boost_channel', settings.boost_channel || '')}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-2">رتبة مكافأة البوستر التلقائية</label>
                                    ${renderRoleSelect('booster_reward_role', settings.booster_reward_role || '')}
                                </div>
                            </div>
                            <div class="pt-2">
                                <label class="block text-xs font-bold text-gray-300 mb-2">نص رسالة البوست (يدعم {user} و {count})</label>
                                <textarea name="boost_message" rows="3" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl p-3 text-xs text-white outline-none text-right leading-relaxed">${settings.boost_message || 'شكراً لك {user} على تعزيز السيرفر 💎! أصبح عدد البوستات الآن {count} بوست!'}</textarea>
                            </div>
                        </div>
                    </div>`;
            } else if (section === 'logs') {
                const logsConfig = (function() {
                    try {
                        return settings.logs_config ? (typeof settings.logs_config === 'string' ? JSON.parse(settings.logs_config) : settings.logs_config) : {};
                    } catch(e) { return {}; }
                })();

                formFieldsHtml = `
                    <input type="hidden" name="logs_config" id="hidden_logs_config" value="">

                    <!-- Toast Notification Container -->
                    <div id="logs-toast-container" class="fixed top-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none w-full max-w-md px-4"></div>

                    <!-- Confirmation Modal -->
                    <div id="logs-confirm-modal" class="hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
                        <div class="bg-[#0c1526] border border-[#16345c] rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl text-right" dir="rtl">
                            <div class="flex items-center gap-3 mb-4">
                                <div class="w-10 h-10 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center shrink-0">
                                    <i class="fa-solid fa-triangle-exclamation"></i>
                                </div>
                                <h3 class="text-lg font-bold text-white">تأكيد العملية</h3>
                            </div>
                            <p id="logs-confirm-msg" class="text-sm text-gray-300 mb-6"></p>
                            <div class="flex gap-3 justify-start">
                                <button type="button" id="logs-confirm-ok" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition flex items-center gap-2 cursor-pointer">
                                    <span>تأكيد</span>
                                </button>
                                <button type="button" id="logs-confirm-cancel" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-bold transition cursor-pointer">
                                    إلغاء
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Top Logs Action Bar -->
                    <div class="bg-[#0c1526]/90 backdrop-blur-md border border-[#16345c] rounded-2xl px-5 py-3 flex items-center justify-between gap-4 shadow-xl mb-2" dir="rtl">
                        <div class="flex items-center gap-3">
                            <button type="button" id="logs-btn-undo" class="flex items-center gap-2 text-sm text-white hover:text-gray-300 transition cursor-pointer disabled:opacity-40" disabled title="التراجع عن آخر تغيير">
                                <i class="fa-solid fa-rotate-left text-xs"></i>
                                <span class="text-xs font-bold">تراجع</span>
                            </button>
                            <div class="h-4 w-px bg-gray-700"></div>
                            <button type="button" id="logs-btn-export" class="flex items-center gap-2 text-sm text-white hover:text-gray-300 transition cursor-pointer" title="تصدير إعدادات السجلات">
                                <i class="fa-solid fa-download text-xs"></i>
                                <span class="text-xs font-bold">تصدير</span>
                            </button>
                            <div class="h-4 w-px bg-gray-700"></div>
                            <button type="button" id="logs-btn-theme" class="flex items-center gap-2 text-sm text-white hover:text-gray-300 transition cursor-pointer" title="تبديل المظهر">
                                <i class="fa-solid fa-moon text-xs"></i>
                                <span class="text-xs font-bold">مظهر</span>
                            </button>
                        </div>
                        <div class="flex items-center gap-2 text-xs text-gray-500">
                            <i class="fa-solid fa-shield-halved text-blue-400"></i>
                            <span>إعدادات السجلات الشاملة</span>
                        </div>
                    </div>

                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Global Master Logs Header Card -->
                        <div class="bg-[#0c1526] border border-[#16345c] rounded-2xl p-6 shadow-xl relative overflow-hidden">
                            <div class="absolute top-0 right-0 w-32 h-32 bg-blue-400/10 rounded-full blur-3xl pointer-events-none"></div>
                            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div class="space-y-1">
                                    <div class="flex items-center gap-3">
                                        <div class="p-2.5 bg-blue-400/10 text-blue-400 rounded-xl">
                                            <i class="fa-solid fa-book-bookmark text-xl"></i>
                                        </div>
                                        <h1 class="text-2xl font-black text-white">سجلات السيرفر الشاملة</h1>
                                    </div>
                                    <p class="text-sm text-white pr-11">يتم تطبيق كل التعديلات وحفظها مباشرة في سيرفر الديسكورد لحظياً بدون إعادة تشغيل.</p>
                                </div>
                                <label class="toggle relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="logsMasterToggle" name="logs_enabled" value="1" ${settings.logs_enabled !== 0 ? 'checked' : ''} onchange="window.saveLogsSetting('logs_enabled', this.checked)">
                                    <span class="slider"></span>
                                </label>
                            </div>

                            <!-- Sub Logs Section Switcher Card -->
                            <div class="mt-6 bg-[#070d1d] border border-[#16345c] rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-lg bg-blue-400/10 text-blue-400 flex items-center justify-center">
                                        <i class="fa-solid fa-shield-halved text-lg"></i>
                                    </div>
                                    <div>
                                        <h3 class="font-bold text-white text-base">السجلات</h3>
                                        <p class="text-xs text-white">تتبع جميع الأحداث في السيرفر مع الفاعل والتفاصيل فورياً</p>
                                    </div>
                                </div>
                                <label class="toggle relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="sub-logs-switch" ${settings.logs_enabled !== 0 ? 'checked' : ''} onchange="window.saveLogsSetting('logs_enabled', this.checked); document.getElementById('logsMasterToggle').checked = this.checked;">
                                    <span class="slider"></span>
                                </label>
                            </div>

                            <!-- Master Stats and Controls Bar -->
                            <div class="mt-6 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[#16345c]">
                                <div class="flex items-center gap-2">
                                    <button type="button" onclick="window.toggleAllLogsGlobally(false)" class="px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer">
                                        <i class="fa-solid fa-xmark"></i>
                                        <span>تعطيل الكل (كل الأقسام)</span>
                                    </button>
                                    <button type="button" onclick="window.toggleAllLogsGlobally(true)" class="px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer">
                                        <i class="fa-solid fa-check"></i>
                                        <span>تفعيل الكل (كل الأقسام)</span>
                                    </button>
                                </div>

                                <div class="flex flex-wrap items-center gap-3 text-xs">
                                    <span class="px-3 py-1.5 bg-[#16345c] rounded-xl text-gray-300 font-medium flex items-center gap-1.5">
                                        <i class="fa-solid fa-network-wired text-blue-400"></i>
                                        <span id="statChannelsUsed">0</span>
                                        <span>القنوات المستخدمة</span>
                                    </span>
                                    <span class="px-3 py-1.5 bg-[#16345c] rounded-xl text-gray-300 font-medium flex items-center gap-1.5">
                                        <i class="fa-solid fa-folder-tree text-amber-400"></i>
                                        <span>13 الأقسام</span>
                                    </span>
                                    <span class="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl font-medium flex items-center gap-1.5">
                                        <i class="fa-solid fa-circle-check"></i>
                                        <span id="statEnabledLogs">0</span>
                                        <span>السجلات المفعلة</span>
                                    </span>
                                    <span class="px-3 py-1.5 bg-blue-400/10 text-blue-400 border border-blue-500/20 rounded-xl font-medium flex items-center gap-1.5">
                                        <i class="fa-solid fa-bars-progress"></i>
                                        <span>105 إجمالي السجلات</span>
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- Auto Setup Channels Card -->
                        <div class="bg-[#0c1526] border border-[#16345c] rounded-2xl p-6 shadow-xl">
                            <div class="flex items-center justify-between mb-4">
                                <div class="flex items-center gap-2">
                                    <i class="fa-solid fa-gear text-blue-400"></i>
                                    <h2 class="font-bold text-white text-base">إعداد تلقائي للقنوات</h2>
                                </div>
                                <span class="text-xs text-white">إنشاء قنوات السجلات تلقائياً لجميع الأقسام بضغطة واحدة</span>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <!-- Normal Channels Setup -->
                                <button type="button" onclick="window.autoSetupLogsChannels('grouped')" class="group bg-[#070d1d] hover:bg-[#13233c] border border-[#16345c] hover:border-blue-400/50 rounded-xl p-4 text-right transition flex flex-col justify-between gap-3 relative overflow-hidden cursor-pointer">
                                    <div class="absolute top-0 right-0 w-24 h-24 bg-blue-400/5 rounded-full blur-xl group-hover:bg-blue-400/15 transition"></div>
                                    <div class="flex items-center justify-between w-full">
                                        <div class="w-10 h-10 rounded-xl bg-blue-400/10 text-blue-400 flex items-center justify-center group-hover:scale-110 transition">
                                            <i class="fa-solid fa-thumbtack"></i>
                                        </div>
                                        <span class="text-xs font-semibold text-blue-400 bg-blue-400/10 px-2.5 py-1 rounded-lg">شائع</span>
                                    </div>
                                    <div>
                                        <h3 class="font-bold text-white text-sm">إنشاء قنوات عادية</h3>
                                        <p class="text-xs text-white mt-1">قناة واحدة لكل قسم (أعضاء، رسائل، أدوار...) — مناسب لأغلب السيرفرات</p>
                                    </div>
                                </button>

                                <!-- Detailed Channels Setup -->
                                <button type="button" onclick="window.autoSetupLogsChannels('detailed')" class="group bg-[#070d1d] hover:bg-[#13233c] border border-[#16345c] hover:border-blue-400/50 rounded-xl p-4 text-right transition flex flex-col justify-between gap-3 relative overflow-hidden cursor-pointer">
                                    <div class="absolute top-0 right-0 w-24 h-24 bg-blue-400/5 rounded-full blur-xl group-hover:bg-blue-400/15 transition"></div>
                                    <div class="flex items-center justify-between w-full">
                                        <div class="w-10 h-10 rounded-xl bg-blue-400/10 text-blue-400 flex items-center justify-center group-hover:scale-110 transition">
                                            <i class="fa-solid fa-folder-open"></i>
                                        </div>
                                        <span class="text-xs font-semibold text-blue-400 bg-blue-400/10 px-2.5 py-1 rounded-lg">متقدم</span>
                                    </div>
                                    <div>
                                        <h3 class="font-bold text-white text-sm">إنشاء قنوات مفصلة</h3>
                                        <p class="text-xs text-white mt-1">قناة منفصلة لكل نوع سجل — للسيرفرات الكبيرة التي تحتاج تنظيم دقيق</p>
                                    </div>
                                </button>

                                <!-- Delete Channels Setup -->
                                <button type="button" onclick="window.deleteLogsChannels()" class="group bg-[#070d1d] hover:bg-red-500/10 border border-[#16345c] hover:border-red-500/40 rounded-xl p-4 text-right transition flex flex-col justify-between gap-3 relative overflow-hidden cursor-pointer">
                                    <div class="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-xl group-hover:bg-red-500/15 transition"></div>
                                    <div class="flex items-center justify-between w-full">
                                        <div class="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center group-hover:scale-110 transition">
                                            <i class="fa-solid fa-trash-can"></i>
                                        </div>
                                        <span class="text-xs font-semibold text-red-400 bg-red-500/10 px-2.5 py-1 rounded-lg">إزالة</span>
                                    </div>
                                    <div>
                                        <h3 class="font-bold text-white text-sm">حذف قنوات السجلات</h3>
                                        <p class="text-xs text-white mt-1">حذف كاتيغوري Droplet Server Logs وجميع القنوات بداخله وتعطيل السجلات</p>
                                    </div>
                                </button>
                            </div>
                        </div>

                        <!-- Search and Filter Bar -->
                        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#0c1526] border border-[#16345c] p-4 rounded-2xl">
                            <!-- Filter Tabs -->
                            <div class="flex items-center gap-1.5 bg-[#070d1d] p-1.5 rounded-xl border border-[#16345c] w-full sm:w-auto">
                                <button type="button" id="btnLogFilterDisabled" onclick="window.filterLogsByStatus('disabled')" class="filter-tab px-4 py-2 rounded-lg text-xs font-bold text-white hover:text-gray-300 transition cursor-pointer">المعطلة</button>
                                <button type="button" id="btnLogFilterEnabled" onclick="window.filterLogsByStatus('enabled')" class="filter-tab px-4 py-2 rounded-lg text-xs font-bold text-white hover:text-gray-300 transition cursor-pointer">المفعلة</button>
                                <button type="button" id="btnLogFilterAll" onclick="window.filterLogsByStatus('all')" class="filter-tab px-4 py-2 rounded-lg text-xs font-bold bg-gradient-to-l from-purple-600 to-blue-500 text-white shadow-md transition cursor-pointer">الكل</button>
                            </div>

                            <!-- Search Bar -->
                            <div class="relative w-full sm:w-72">
                                <span class="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-white">
                                    <i class="fa-solid fa-magnifying-glass text-sm"></i>
                                </span>
                                <input type="text" id="logSearchInput" placeholder="ابحث عن سجل..." oninput="window.searchLogsItems()" class="w-full bg-[#070d1d] border border-[#16345c] rounded-xl py-2.5 pr-10 pl-4 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-400 transition">
                            </div>
                        </div>

                        <!-- Main Two-Column View: Categories Sidebar + Active Category Content -->
                        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">

                            <!-- Sidebar: 13 Categories -->
                            <div class="lg:col-span-1 space-y-1 bg-[#0c1526] border border-[#16345c] p-3 rounded-2xl shadow-xl h-fit">
                                <button type="button" onclick="window.toggleLogsCategoriesDropdown()" class="w-full flex items-center justify-between text-xs font-black text-white px-2 py-2 border-b border-[#16345c] mb-1 cursor-pointer hover:text-white transition">
                                    <i id="logsCategoriesDropdownArrow" class="fa-solid fa-chevron-down text-white text-xs"></i>
                                    <span class="flex items-center gap-2">
                                        <span>الأقسام (13 قسم)</span>
                                        <i class="fa-solid fa-folder text-amber-400"></i>
                                    </span>
                                </button>
                                <div id="logsCategoriesList" class="space-y-1 transition-all"></div>
                            </div>

                            <!-- Right Display Area: Active Category Header + Section Default Channel/Color + Logs Grid -->
                            <div class="lg:col-span-3 space-y-6">

                                <!-- Active Category Card Header -->
                                <div class="bg-[#0c1526] border border-[#16345c] rounded-2xl p-6 shadow-xl space-y-6">
                                    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                        <div class="flex items-center gap-3.5">
                                            <div id="activeCatIconBox" class="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500/20 to-blue-400/20 border border-pink-500/30 text-pink-400 flex items-center justify-center shadow-lg text-xl">
                                                <span id="activeCatIcon">🎯</span>
                                            </div>
                                            <div>
                                                <h2 id="activeCatTitle" class="text-lg font-black text-white">الأعضاء</h2>
                                                <span id="activeCatCount" class="text-xs text-white">17 سجل</span>
                                            </div>
                                        </div>

                                        <!-- Category Actions: Enable All / Disable All -->
                                        <div class="flex items-center gap-2">
                                            <button type="button" onclick="window.toggleActiveCategoryLogs(false)" class="px-3.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer">
                                                <i class="fa-solid fa-xmark"></i>
                                                <span>تعطيل الكل</span>
                                            </button>
                                            <button type="button" onclick="window.toggleActiveCategoryLogs(true)" class="px-3.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer">
                                                <i class="fa-solid fa-check"></i>
                                                <span>تفعيل الكل</span>
                                            </button>
                                        </div>
                                    </div>

                                    <!-- Section Settings Form Block -->
                                    <div class="bg-[#070d1d] border border-[#16345c] rounded-2xl p-5 space-y-5">
                                        <div class="flex items-center justify-between border-b border-[#16345c] pb-3">
                                            <div class="flex items-center gap-2 text-white font-bold text-sm">
                                                <i class="fa-solid fa-gear text-blue-400"></i>
                                                <span>إعدادات القسم</span>
                                            </div>
                                            <span class="text-xs text-gray-500">طبق نفس الإعدادات على جميع السجلات المفعلة بالقسم</span>
                                        </div>

                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <!-- Default Channel Dropdown -->
                                            <div class="space-y-2">
                                                <label class="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                                                    <i class="fa-solid fa-bullhorn text-pink-400 text-sm"></i>
                                                    <span>القناة الافتراضية</span>
                                                </label>
                                                <div class="relative">
                                                    ${renderChannelSelect('catDefaultChannel', settings.log_channel_members || settings.log_channel || '')}
                                                </div>
                                            </div>

                                            <!-- Default Color Picker Input -->
                                            <div class="space-y-2">
                                                <label class="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                                                    <i class="fa-solid fa-palette text-pink-400 text-sm"></i>
                                                    <span>اللون الافتراضي</span>
                                                </label>
                                                <div class="flex items-center gap-3">
                                                    <div class="relative w-10 h-10 rounded-xl overflow-hidden border border-[#16345c] cursor-pointer shrink-0">
                                                        <input type="color" id="catColorPicker" value="#60a5fa" class="absolute -top-2 -right-2 w-16 h-16 cursor-pointer opacity-0" onchange="document.getElementById('catColorHex').value = this.value; document.getElementById('catColorPreviewBox').style.backgroundColor = this.value;">
                                                        <div id="catColorPreviewBox" class="w-full h-full bg-[#60a5fa]"></div>
                                                    </div>
                                                    <input type="text" id="catColorHex" value="#60a5fa" class="w-full bg-[#0c1526] border border-[#16345c] focus:border-blue-400 rounded-xl py-2.5 px-3.5 text-xs text-white font-mono focus:outline-none transition" dir="ltr" onchange="document.getElementById('catColorPicker').value = this.value; document.getElementById('catColorPreviewBox').style.backgroundColor = this.value;">
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Apply to All Enabled Logs Button -->
                                        <div class="pt-2">
                                            <button type="button" onclick="window.applyCatSettingsToAll()" class="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-400/20 transition flex items-center justify-center gap-2 cursor-pointer">
                                                <i class="fa-solid fa-wand-magic-sparkles"></i>
                                                <span>تطبيق على جميع السجلات المفعلة</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <!-- Logs Cards 2-Column Grid -->
                                <div id="logsCardsGrid" class="grid grid-cols-1 md:grid-cols-2 gap-3"></div>

                            </div>
                        </div>

                    </div>

                    <!-- Individual Log Edit Modal -->
                    <div id="editLogModal" class="fixed inset-0 bg-black/80 backdrop-blur-md z-50 hidden flex items-center justify-center p-4">
                        <div class="bg-[#0c1526] border border-[#16345c] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl text-right" dir="rtl">
                            <div class="flex items-center justify-between border-b border-[#16345c] pb-3">
                                <button type="button" onclick="window.closeEditLogModal()" class="text-white hover:text-gray-300 text-lg font-bold">✕</button>
                                <div class="flex items-center gap-2">
                                    <h5 class="text-white font-black text-sm" id="modalLogTitle">تخصيص السجل</h5>
                                    <span id="modalLogIcon" class="text-base">📜</span>
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-1.5 flex items-center gap-1.5">
                                    <i class="fa-solid fa-bullhorn text-blue-400 text-xs"></i>
                                    <span>القناة المخصصة لهذا السجل</span>
                                </label>
                                ${renderChannelSelect('modalLogChannel', '')}
                                <p class="text-[10px] text-gray-500 mt-1">اتركها فارغة لاستخدام القناة الافتراضية للقسم</p>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-1.5 flex items-center gap-1.5">
                                    <i class="fa-solid fa-palette text-blue-400 text-xs"></i>
                                    <span>لون الإيمبد (Hex Color)</span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <div class="relative w-10 h-10 rounded-xl overflow-hidden border border-[#16345c] cursor-pointer shrink-0">
                                        <input type="color" id="modalLogColorPicker" value="#60a5fa" class="absolute -top-2 -right-2 w-16 h-16 cursor-pointer opacity-0" onchange="document.getElementById('modalLogColorHex').value = this.value; document.getElementById('modalColorPreviewBox').style.backgroundColor = this.value;">
                                        <div id="modalColorPreviewBox" class="w-full h-full bg-[#60a5fa]"></div>
                                    </div>
                                    <input type="text" id="modalLogColorHex" value="#60a5fa" class="w-full bg-[#070d1d] border border-[#16345c] focus:border-blue-400 rounded-xl py-2 px-3 text-xs text-white font-mono outline-none text-center" dir="ltr" onchange="document.getElementById('modalLogColorPicker').value = this.value; document.getElementById('modalColorPreviewBox').style.backgroundColor = this.value;">
                                </div>
                            </div>

                            <div class="flex items-center justify-end gap-2 pt-3 border-t border-[#16345c]">
                                <button type="button" onclick="window.closeEditLogModal()" class="px-4 py-2 bg-[#16345c] hover:bg-[#1d3a5c] text-gray-300 rounded-xl text-xs font-bold transition">إلغاء</button>
                                <button type="button" onclick="window.saveModalLogConfig()" class="px-5 py-2 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2">
                                    <i class="fa-solid fa-floppy-disk"></i>
                                    <span>حفظ التغييرات</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Bottom Sticky Save Bar -->
                    <div class="sticky bottom-0 z-40 bg-[#0c1526]/95 backdrop-blur-md border-t border-[#16345c] p-4 mt-4 rounded-2xl shadow-2xl" dir="rtl">
                        <div class="flex items-center justify-between gap-4">
                            <div class="flex items-center gap-2 text-xs text-white">
                                <i class="fa-solid fa-shield-check text-emerald-400"></i>
                                <span>التغييرات تُحفظ تلقائياً في قاعدة البيانات</span>
                            </div>
                            <button type="button" id="logs-btn-save" onclick="window.saveLogsConfigToServer(null, '✓ تم حفظ جميع التغييرات في قاعدة البيانات')" class="px-6 py-2.5 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-400/20 transition flex items-center gap-2 cursor-pointer">
                                <i class="fa-solid fa-floppy-disk"></i>
                                <span>حفظ التغييرات</span>
                            </button>
                        </div>
                    </div>
                `;

                // Scripts MUST be outside the <form> tag to execute in modern browsers
                embedScriptHtml = `
// ===== Droplet LOGS SCRIPT - FULL REWRITE =====
// =============================================

// ---- Server-injected state ----
var _logsGuildId = '${guildId}';
var logsState = ${JSON.stringify((() => { try { const raw = settings.logs_config; const parsed = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {}; return (parsed && typeof parsed === 'object') ? parsed : {}; } catch(e) { return {}; } })())};
var categoryChannels = ${JSON.stringify({
    members: settings.log_channel_members || settings.log_channel || '',
    roles: settings.log_channel_roles || settings.log_channel || '',
    channels: settings.log_channel_channels || settings.log_channel || '',
    messages: settings.log_channel_messages || settings.log_channel || '',
    voice: settings.log_channel_voice || settings.log_channel || '',
    moderation: settings.log_channel_moderation || settings.log_channel || '',
    server: settings.log_channel_server || settings.log_channel || '',
    invites: settings.log_channel_invites || settings.log_channel || '',
    emojis: settings.log_channel_emojis || settings.log_channel || '',
    events: settings.log_channel_events || settings.log_channel || '',
    integrations: settings.log_channel_integrations || settings.log_channel || '',
    automod: settings.log_channel_automod || settings.log_channel || '',
    stage: settings.log_channel_stage || settings.log_channel || ''
})};

// ---- UI state ----
var currentCategory = 'members';
var currentFilter = 'all';
var currentEditModalLogId = null;
var logsHistory = [];
var logsConfirmCallback = null;

// ---- LOG_CATEGORIES (defined FIRST so all functions below can use it) ----
var LOG_CATEGORIES = {
    members: {
        title: 'الأعضاء', icon: '🎯', desc: 'أحداث دخول وخروج وحظر وعقوبات الأعضاء', defaultColor: '#60a5fa',
        items: [
            { id: 'member_join', title: 'دخول عضو', desc: 'عند دخول عضو جديد للسيرفر', icon: '📥' },
            { id: 'member_leave', title: 'خروج عضو', desc: 'عند خروج عضو من السيرفر', icon: '📤' },
            { id: 'member_ban', title: 'حظر عضو', desc: 'عند حظر عضو من السيرفر', icon: '🪓' },
            { id: 'member_unban', title: 'فك حظر عضو', desc: 'عند فك حظر عضو', icon: '🔓' },
            { id: 'member_kick', title: 'طرد عضو', desc: 'عند طرد عضو من السيرفر', icon: '👢' },
            { id: 'member_prison', title: 'سجن عضو', desc: 'عند سجن عضو', icon: '🔒' },
            { id: 'member_unprison', title: 'إخراج من السجن', desc: 'عند إخراج عضو من السجن', icon: '🔓' },
            { id: 'member_timeout', title: 'عزل عضو', desc: 'عند عزل عضو (تايم أوت)', icon: '⏳' },
            { id: 'member_untimeout', title: 'إزالة العزل', desc: 'عند إزالة العزل عن عضو', icon: '➕' },
            { id: 'member_mute', title: 'إسكات كتابي', desc: 'عند إسكات عضو كتابياً', icon: '🔇' },
            { id: 'member_unmute', title: 'إلغاء إسكات كتابي', desc: 'عند إلغاء الإسكات الكتابي', icon: '🔊' },
            { id: 'member_nick_change', title: 'تغيير الاسم المستعار', desc: 'عند تغيير الاسم المستعار للعضو', icon: '✏️' },
            { id: 'member_avatar_change', title: 'تغيير الصورة', desc: 'عند تغيير صورة العضو', icon: '🖼️', isSpecial: true },
            { id: 'member_username_change', title: 'تغيير اسم المستخدم', desc: 'عند تغيير اسم المستخدم للعضو', icon: '👤', isSpecial: true },
            { id: 'member_boost_add', title: 'بوست السيرفر', desc: 'عند بوست السيرفر من قبل عضو', icon: '💎' },
            { id: 'member_boost_remove', title: 'إزالة البوست', desc: 'عند إزالة البوست من السيرفر', icon: '🗑️' },
            { id: 'member_suspicious', title: 'حساب مشبوه', desc: 'عند إسناد رتبة لحساب جديد بسبب عمر الحساب', icon: '🚨' }
        ]
    },
    roles: {
        title: 'الرتب', icon: '🎖️', desc: 'أحداث إنشاء وتعديل وحذف وإعطاء الرتب', defaultColor: '#60a5fa',
        items: [
            { id: 'role_create', title: 'إنشاء رتبة', desc: 'عند إنشاء رتبة جديدة', icon: '➕' },
            { id: 'role_delete', title: 'حذف رتبة', desc: 'عند حذف رتبة', icon: '🗑️' },
            { id: 'role_update', title: 'تعديل رتبة', desc: 'عند تعديل رتبة', icon: '✏️' },
            { id: 'role_give_member', title: 'إضافة رتبة لعضو', desc: 'عند إعطاء رتبة لعضو', icon: '🎁' },
            { id: 'role_remove_member', title: 'إزالة رتبة من عضو', desc: 'عند إزالة رتبة من عضو', icon: '❌' },
            { id: 'role_custom_manage', title: 'رتبة خاصة', desc: 'تعديل/حذف رتبة خاصة (نفس أمر rlog)', icon: '👑' }
        ]
    },
    channels: {
        title: 'القنوات', icon: '📌', desc: 'أحداث إنشاء وتعديل وحذف القنوات والثريدات', defaultColor: '#60a5fa',
        items: [
            { id: 'channel_create', title: 'إنشاء قناة', desc: 'عند إنشاء قناة جديدة', icon: '➕' },
            { id: 'channel_delete', title: 'حذف قناة', desc: 'عند حذف قناة', icon: '🗑️' },
            { id: 'channel_update', title: 'تعديل قناة', desc: 'عند تعديل قناة', icon: '✏️' },
            { id: 'channel_perms_update', title: 'تعديل صلاحيات قناة', desc: 'عند تعديل صلاحيات قناة', icon: '🔒' },
            { id: 'thread_create', title: 'إنشاء ثريد', desc: 'عند إنشاء ثريد جديد', icon: '💬' },
            { id: 'thread_delete', title: 'حذف ثريد', desc: 'عند حذف ثريد', icon: '🗑️' },
            { id: 'thread_update', title: 'تعديل ثريد', desc: 'عند تعديل ثريد', icon: '✏️' }
        ]
    },
    messages: {
        title: 'الرسائل', icon: '💬', desc: 'أحداث حذف وتعديل وتثبيت ومسح الرسائل', defaultColor: '#60a5fa',
        items: [
            { id: 'msg_delete', title: 'حذف رسالة', desc: 'عند حذف رسالة', icon: '🗑️' },
            { id: 'msg_image_delete', title: 'حذف صورة', desc: 'عند حذف رسالة تحتوي على صورة', icon: '🖼️' },
            { id: 'msg_update', title: 'تعديل رسالة', desc: 'عند تعديل رسالة', icon: '✏️' },
            { id: 'msg_purge', title: 'حذف رسائل جماعي', desc: 'عند حذف عدة رسائل', icon: 'ℹ️' },
            { id: 'msg_pin', title: 'تثبيت رسالة', desc: 'عند تثبيت رسالة', icon: 'ℹ️' },
            { id: 'msg_unpin', title: 'إلغاء تثبيت رسالة', desc: 'عند إلغاء تثبيت رسالة', icon: 'ℹ️' },
            { id: 'msg_reaction_add', title: 'إضافة تفاعل', desc: 'عند إضافة تفاعل على رسالة', icon: 'ℹ️' },
            { id: 'msg_reaction_remove', title: 'إزالة تفاعل', desc: 'عند إزالة تفاعل من رسالة', icon: 'ℹ️' },
            { id: 'msg_reaction_remove_all', title: 'مسح جميع التفاعلات', desc: 'عند مسح جميع التفاعلات', icon: 'ℹ️' }
        ]
    },
    voice: {
        title: 'الصوت', icon: '🎙️', desc: 'أحداث الرومات الصوتية والكتم والبث والكاميرا', defaultColor: '#60a5fa',
        items: [
            { id: 'vc_join', title: 'دخول روم صوتي', desc: 'عند دخول عضو لروم صوتي', icon: '⬇️', isSpecial: true },
            { id: 'vc_leave', title: 'خروج من روم صوتي', desc: 'عند خروج عضو من روم صوتي', icon: '⬆️', isSpecial: true },
            { id: 'vc_switch', title: 'نقل بين الرومات', desc: 'عند نقل عضو بين الرومات', icon: '🔀', isSpecial: true },
            { id: 'vc_mute_server', title: 'كتم عضو', desc: 'عند كتم عضو في الصوتي', icon: '⬆️', isSpecial: true },
            { id: 'vc_unmute_server', title: 'إلغاء كتم عضو', desc: 'عند إلغاء كتم عضو', icon: '🔓', isSpecial: true },
            { id: 'vc_deafen_server', title: 'إصمات عضو', desc: 'عند إصمات عضو', icon: '🔒', isSpecial: true },
            { id: 'vc_undeafen_server', title: 'إلغاء إصمات', desc: 'عند إلغاء إصمات عضو', icon: '🔓', isSpecial: true },
            { id: 'vc_self_mute', title: 'سيلف ميوت', desc: 'عند تفعيل العضو سيلف ميوت', icon: 'ℹ️', isSpecial: true },
            { id: 'vc_self_unmute', title: 'إلغاء السيلف ميوت', desc: 'عند إلغاء العضو السيلف ميوت', icon: 'ℹ️', isSpecial: true },
            { id: 'vc_self_deaf', title: 'سيلف ديفن', desc: 'عند تفعيل العضو سيلف ديفن', icon: 'ℹ️', isSpecial: true },
            { id: 'vc_self_undeaf', title: 'إلغاء السيلف ديفن', desc: 'عند إلغاء العضو السيلف ديفن', icon: '🔓', isSpecial: true },
            { id: 'vc_stream_start', title: 'بدء بث', desc: 'عند بدء عضو بث مباشر', icon: '🖼️', isSpecial: true },
            { id: 'vc_stream_stop', title: 'إنهاء بث', desc: 'عند إنهاء البث', icon: '🖼️', isSpecial: true },
            { id: 'vc_video_start', title: 'تشغيل الكاميرا', desc: 'عند تشغيل الكاميرا', icon: '🖼️', isSpecial: true },
            { id: 'vc_video_stop', title: 'إيقاف الكاميرا', desc: 'عند إيقاف الكاميرا', icon: '⬆️', isSpecial: true },
            { id: 'vc_disconnect', title: 'فصل من الصوتية', desc: 'عند فصل عضو من قناة صوتية (بواسطة مشرف)', icon: 'ℹ️', isSpecial: true }
        ]
    },
    moderation: {
        title: 'الإشراف', icon: '🛡️', desc: 'أحداث التحذيرات والبلوك والبلاك لست', defaultColor: '#60a5fa',
        items: [
            { id: 'mod_warn_add', title: 'إعطاء تحذير', desc: 'عند إعطاء عضو تحذير', icon: 'ℹ️' },
            { id: 'mod_warn_remove', title: 'إزالة تحذير', desc: 'عند إزالة تحذير واحد من عضو', icon: 'ℹ️' },
            { id: 'mod_warn_clear', title: 'مسح التحذيرات', desc: 'عند مسح جميع تحذيرات عضو أو السيرفر', icon: 'ℹ️' },
            { id: 'mod_block_add', title: 'إعطاء بلوك', desc: 'عند إعطاء عضو بلوك على رتبة', icon: '🗑️' },
            { id: 'mod_blacklist_add', title: 'إضافة بلاك لست', desc: 'عند إضافة عضو إلى البلاك لست', icon: 'ℹ️' },
            { id: 'mod_blacklist_remove', title: 'إزالة بلاك لست', desc: 'عند إزالة عضو من البلاك لست', icon: '➕' }
        ]
    },
    server: {
        title: 'السيرفر', icon: '⚙️', desc: 'أحداث تعديل إعدادات وبنر وبوستات السيرفر', defaultColor: '#60a5fa',
        items: [
            { id: 'server_update', title: 'تعديل السيرفر', desc: 'عند تعديل إعدادات السيرفر', icon: '✏️', isSpecial: true },
            { id: 'server_name_change', title: 'تغيير اسم السيرفر', desc: 'عند تغيير اسم السيرفر', icon: '✏️', isSpecial: true },
            { id: 'server_icon_change', title: 'تغيير أيقونة السيرفر', desc: 'عند تغيير أيقونة السيرفر', icon: '🖼️', isSpecial: true },
            { id: 'server_banner_change', title: 'تغيير بانر السيرفر', desc: 'عند تغيير بانر السيرفر', icon: '✏️', isSpecial: true },
            { id: 'server_vanity_change', title: 'تغيير رابط الفانيتي', desc: 'عند تغيير رابط الدعوة المخصص', icon: '✏️', isSpecial: true },
            { id: 'server_boost_level_up', title: 'رفع مستوى البوست', desc: 'عند رفع مستوى بوست السيرفر', icon: '✏️', isSpecial: true },
            { id: 'server_boost_level_down', title: 'انخفاض مستوى البوست', desc: 'عند انخفاض مستوى البوست', icon: '✏️', isSpecial: true }
        ]
    },
    invites: {
        title: 'الدعوات', icon: '🔗', desc: 'أحداث إنشاء وحذف واستخدام روابط الدعوة', defaultColor: '#60a5fa',
        items: [
            { id: 'invite_create', title: 'إنشاء دعوة', desc: 'عند إنشاء رابط دعوة', icon: '➕' },
            { id: 'invite_delete', title: 'حذف دعوة', desc: 'عند حذف رابط دعوة', icon: '🗑️' },
            { id: 'invite_used', title: 'استخدام دعوة', desc: 'عند استخدام رابط دعوة', icon: '🖼️' }
        ]
    },
    emojis: {
        title: 'الإيموجي والستيكرز', icon: '😃', desc: 'أحداث إضافة وتعديل وحذف الإيموجيات والستيكرات', defaultColor: '#60a5fa',
        items: [
            { id: 'emoji_create', title: 'إضافة إيموجي', desc: 'عند إضافة إيموجي جديد', icon: '➕', isSpecial: true },
            { id: 'emoji_delete', title: 'حذف إيموجي', desc: 'عند حذف إيموجي', icon: '🗑️', isSpecial: true },
            { id: 'emoji_update', title: 'تعديل إيموجي', desc: 'عند تعديل إيموجي', icon: '✏️', isSpecial: true },
            { id: 'sticker_create', title: 'إضافة ستيكر', desc: 'عند إضافة ستيكر جديد', icon: '🖼️', isSpecial: true },
            { id: 'sticker_delete', title: 'حذف ستيكر', desc: 'عند حذف ستيكر', icon: '🗑️', isSpecial: true },
            { id: 'sticker_update', title: 'تعديل ستيكر', desc: 'عند تعديل ستيكر', icon: '✏️', isSpecial: true }
        ]
    },
    events: {
        title: 'الأحداث', icon: '📅', desc: 'أحداث إنشاء ومجدولة وبدء الأحداث المباشرة بالسيرفر', defaultColor: '#60a5fa',
        items: [
            { id: 'event_create', title: 'إنشاء حدث', desc: 'عند إنشاء حدث مجدول', icon: '➕', isSpecial: true },
            { id: 'event_delete', title: 'حذف حدث', desc: 'عند حذف حدث', icon: '🗑️', isSpecial: true },
            { id: 'event_update', title: 'تعديل حدث', desc: 'عند تعديل حدث', icon: '✏️', isSpecial: true },
            { id: 'event_start', title: 'بدء حدث', desc: 'عند بدء حدث', icon: '⬇️', isSpecial: true },
            { id: 'event_end', title: 'انتهاء حدث', desc: 'عند انتهاء حدث', icon: '⬆️', isSpecial: true },
            { id: 'event_user_interested', title: 'اشتراك في حدث', desc: 'عند اشتراك عضو في حدث', icon: '⬇️', isSpecial: true }
        ]
    },
    integrations: {
        title: 'التكاملات', icon: '🔌', desc: 'أحداث التكاملات والويب هوك والبوتات', defaultColor: '#60a5fa',
        items: [
            { id: 'integration_create', title: 'إضافة تكامل', desc: 'عند إضافة تكامل جديد', icon: '➕' },
            { id: 'integration_delete', title: 'حذف تكامل', desc: 'عند حذف تكامل', icon: '🗑️' },
            { id: 'integration_update', title: 'تعديل تكامل', desc: 'عند تعديل تكامل', icon: '✏️' },
            { id: 'webhook_create', title: 'إنشاء ويب هوك', desc: 'عند إنشاء ويب هوك', icon: 'ℹ️' },
            { id: 'webhook_delete', title: 'حذف ويب هوك', desc: 'عند حذف ويب هوك', icon: '🗑️' },
            { id: 'webhook_update', title: 'تعديل ويب هوك', desc: 'عند تعديل ويب هوك', icon: '✏️' },
            { id: 'bot_add', title: 'إضافة بوت', desc: 'عند إضافة بوت للسيرفر', icon: 'ℹ️' },
            { id: 'bot_remove', title: 'إزالة بوت', desc: 'عند إزالة بوت من السيرفر', icon: '🗑️' }
        ]
    },
    automod: {
        title: 'الأوتو مود', icon: '🤖', desc: 'أحداث وقواعد الأوتو مود وحظر المحتوى والسبام', defaultColor: '#60a5fa',
        items: [
            { id: 'automod_rule_create', title: 'إنشاء قاعدة', desc: 'عند إنشاء قاعدة أوتو مود', icon: '➕' },
            { id: 'automod_rule_delete', title: 'حذف قاعدة', desc: 'عند حذف قاعدة أوتو مود', icon: '🗑️' },
            { id: 'automod_rule_update', title: 'تعديل قاعدة', desc: 'عند تعديل قاعدة أوتو مود', icon: '✏️' },
            { id: 'automod_action_trigger', title: 'إجراء أوتو مود', desc: 'عند تنفيذ إجراء أوتو مود', icon: 'ℹ️' },
            { id: 'automod_content_block', title: 'حظر محتوى', desc: 'عند حظر محتوى تلقائياً', icon: '🗑️' },
            { id: 'automod_timeout', title: 'عزل تلقائي', desc: 'عند عزل عضو تلقائياً', icon: '🔒' },
            { id: 'automod_spam_detect', title: 'رقابة السبام', desc: 'عند اكتشاف سبام أو رسائل مكررة أو نص متكرر', icon: 'ℹ️' }
        ]
    },
    stage: {
        title: 'المنصة', icon: '📢', desc: 'أحداث الرومات التفاعلية والمنصة والمتحدثين', defaultColor: '#60a5fa',
        items: [
            { id: 'stage_create', title: 'إنشاء منصة', desc: 'عند إنشاء منصة صوتية', icon: '➕', isSpecial: true },
            { id: 'stage_delete', title: 'حذف منصة', desc: 'عند حذف منصة', icon: '🗑️', isSpecial: true },
            { id: 'stage_update', title: 'تعديل منصة', desc: 'عند تعديل منصة', icon: '✏️', isSpecial: true },
            { id: 'stage_speaker_add', title: 'إضافة متحدث', desc: 'عند إضافة متحدث للمنصة', icon: 'ℹ️', isSpecial: true },
            { id: 'stage_speaker_remove', title: 'إزالة متحدث', desc: 'عند إزالة متحدث', icon: '⬆️', isSpecial: true },
            { id: 'stage_hand_raise', title: 'طلب التحدث', desc: 'عند طلب عضو التحدث', icon: '⬇️', isSpecial: true }
        ]
    }
};

// ================================================================
// HELPER FUNCTIONS
// ================================================================

function isLogEnabled(logId) {
    var s = logsState[logId];
    if (!s) return false;
    return s.enabled === true || s.enabled === 1 || s.enabled === '1';
}

function showToast(message, type) {
    var container = document.getElementById('logs-toast-container');
    if (!container) return;
    var bgMap = {
        success: 'bg-emerald-900/90 border-emerald-500/50 text-emerald-200',
        danger:  'bg-red-900/90 border-red-500/50 text-red-200',
        info:    'bg-blue-700/90 border-blue-400/50 text-blue-200'
    };
    var iconMap = {
        success: 'fa-circle-check',
        danger:  'fa-triangle-exclamation',
        info:    'fa-circle-info'
    };
    var t = type || 'success';
    var toast = document.createElement('div');
    toast.className = 'pointer-events-auto border rounded-xl p-4 shadow-2xl flex items-center justify-between gap-3 backdrop-blur-md transition-all duration-300 transform translate-y-2 opacity-0 ' + (bgMap[t] || bgMap.info);
    toast.innerHTML = '<div class="flex items-center gap-3"><i class="fa-solid ' + (iconMap[t] || 'fa-circle-info') + ' text-lg"></i><span class="text-xs font-bold">' + message + '</span></div><button type="button" class="text-xs opacity-70 hover:opacity-100 transition">✕</button>';
    container.appendChild(toast);
    setTimeout(function() { toast.classList.remove('translate-y-2', 'opacity-0'); }, 10);
    var removeToast = function() {
        toast.classList.add('translate-y-2', 'opacity-0');
        setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    };
    toast.querySelector('button').addEventListener('click', removeToast);
    setTimeout(removeToast, 3500);
}

function showSavedBanner(msg) {
    showToast(msg || '✓ حُفظت التغييرات في سيرفر الديسكورد بنجاح', 'success');
}

function saveToLogsHistory(action, data) {
    logsHistory.push({ action: action, data: data, timestamp: Date.now() });
    if (logsHistory.length > 20) logsHistory.shift();
    updateUndoBtn();
}

function updateUndoBtn() {
    var btn = document.getElementById('logs-btn-undo');
    if (btn) btn.disabled = logsHistory.length === 0;
}

function showLogsConfirm(message, callback) {
    var modal = document.getElementById('logs-confirm-modal');
    var msgEl = document.getElementById('logs-confirm-msg');
    if (!modal) { if (confirm(message)) callback(); return; }
    if (msgEl) msgEl.textContent = message;
    logsConfirmCallback = callback;
    modal.classList.remove('hidden');
}

function hideLogsConfirm() {
    var modal = document.getElementById('logs-confirm-modal');
    if (modal) modal.classList.add('hidden');
    logsConfirmCallback = null;
}

function syncHiddenInput() {
    var hiddenInp = document.getElementById('hidden_logs_config');
    if (hiddenInp) hiddenInp.value = JSON.stringify(logsState);
}

function saveLogsConfigToServer(extraPayload, successMsg) {
    syncHiddenInput();
    if (!_logsGuildId) return;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/guild/' + _logsGuildId + '/settings', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
        try { if (JSON.parse(xhr.responseText).success) showSavedBanner(successMsg); } catch(e) {}
    };
    var body = { logs_config: JSON.stringify(logsState) };
    if (extraPayload && typeof extraPayload === 'object') Object.assign(body, extraPayload);
    xhr.send(JSON.stringify(body));
}

function updateGlobalStats() {
    var total = 0, enabled = 0, channelsSet = [];
    var catKeys = Object.keys(LOG_CATEGORIES);
    for (var i = 0; i < catKeys.length; i++) {
        var items = LOG_CATEGORIES[catKeys[i]].items || [];
        total += items.length;
        for (var j = 0; j < items.length; j++) {
            var id = items[j].id;
            if (isLogEnabled(id)) enabled++;
            if (logsState[id] && logsState[id].channel_id && channelsSet.indexOf(logsState[id].channel_id) === -1) {
                channelsSet.push(logsState[id].channel_id);
            }
        }
    }
    var e1 = document.getElementById('statEnabledLogs');
    var e2 = document.getElementById('statChannelsUsed');
    if (e1) e1.textContent = enabled;
    if (e2) e2.textContent = channelsSet.length;
}

function renderCategoriesSidebar() {
    var container = document.getElementById('logsCategoriesList');
    if (!container) return;
    var catKeys = Object.keys(LOG_CATEGORIES);
    var html = '';
    var visibleCats = 0;
    for (var k = 0; k < catKeys.length; k++) {
        var key = catKeys[k];
        var cat = LOG_CATEGORIES[key];
        var isSel = (key === currentCategory);
        var totalItems = cat.items ? cat.items.length : 0;
        var enabledItems = 0;
        for (var j = 0; j < (cat.items || []).length; j++) {
            if (isLogEnabled(cat.items[j].id)) enabledItems++;
        }
        if (currentFilter === 'enabled' && enabledItems === 0) continue;
        if (currentFilter === 'disabled' && enabledItems === totalItems && totalItems > 0) continue;
        visibleCats++;
        var badgeClass = enabledItems === 0
            ? 'px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-[10px] font-mono'
            : (enabledItems === totalItems
                ? 'px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-mono'
                : 'px-2 py-0.5 bg-blue-400/10 text-blue-300 border border-blue-500/20 rounded-lg text-[10px] font-mono');
        html += '<button type="button" onclick="window.switchLogsCategory(\\'' + key + '\\')" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ' + (isSel ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white shadow-lg' : 'text-white hover:text-gray-300 hover:bg-[#13233c]') + '">';
        html += '<span class="' + badgeClass + '">' + enabledItems + '/' + totalItems + '</span>';
        html += '<span class="flex items-center gap-2"><span>' + cat.title + '</span><span>' + cat.icon + '</span></span>';
        html += '</button>';
    }
    if (visibleCats === 0) {
        html = '<div class="py-4 text-center text-xs text-gray-500 font-bold">لا توجد أقسام مطابقة للفلتر 🔍</div>';
    }
    container.innerHTML = html;
    updateGlobalStats();
}

function renderLogsGrid() {
    var container = document.getElementById('logsCardsGrid');
    if (!container) { console.warn('[LOGS] logsCardsGrid not found'); return; }
    var cat = LOG_CATEGORIES[currentCategory] || LOG_CATEGORIES.members;
    var titleEl = document.getElementById('activeCatTitle');
    var iconEl  = document.getElementById('activeCatIcon');
    var countEl = document.getElementById('activeCatCount');
    if (titleEl) titleEl.textContent = cat.title;
    if (iconEl)  iconEl.textContent  = cat.icon;
    if (countEl) countEl.textContent = (cat.items ? cat.items.length : 0) + ' سجل';
    var searchInp = document.getElementById('logSearchInput');
    var searchVal = (searchInp && searchInp.value) ? searchInp.value.toLowerCase().trim() : '';
    var itemsList = cat.items || [];
    var filtered = [];
    for (var fi = 0; fi < itemsList.length; fi++) {
        var itm = itemsList[fi];
        var en = isLogEnabled(itm.id);
        if (currentFilter === 'enabled' && !en) continue;
        if (currentFilter === 'disabled' && en) continue;
        if (searchVal) {
            var tMatch = itm.title && itm.title.toLowerCase().indexOf(searchVal) !== -1;
            var dMatch = itm.desc  && itm.desc.toLowerCase().indexOf(searchVal) !== -1;
            if (!tMatch && !dMatch) continue;
        }
        filtered.push(itm);
    }
    if (!filtered.length) {
        container.innerHTML = '<div class="col-span-full py-12 bg-[#070d1d] border border-blue-500/20 rounded-3xl text-center text-xs text-gray-500 font-bold">لا توجد سجلات مطابقة للبحث أو الفلتر 🔍</div>';
        return;
    }
    var html = '';
    for (var i = 0; i < filtered.length; i++) {
        var item = filtered[i];
        var enabled = isLogEnabled(item.id);
        var customCfg   = logsState[item.id] || {};
        var customChan  = customCfg.channel_id || '';
        var customColor = customCfg.color || cat.defaultColor || '#60a5fa';
        html += '<div class="bg-[#0c1526] border border-[#16345c] hover:border-blue-500/20 p-4 rounded-2xl flex items-center justify-between transition shadow-md ' + (enabled ? '' : 'opacity-40') + '" data-log-id="' + item.id + '">';
        html += '<div class="flex items-center gap-2.5">';
        html += '<label class="toggle"><input type="checkbox" data-log-checkbox="' + item.id + '" ' + (enabled ? 'checked' : '') + ' data-logid="' + item.id + '"><span class="slider"></span></label>';
        html += '<button type="button" data-action="editlog" data-logid="' + item.id + '" data-logtitle="' + encodeURIComponent(item.title || '') + '" data-logicon="' + encodeURIComponent(item.icon || '') + '" title="تخصيص القناة واللون" class="w-8 h-8 rounded-xl bg-[#16345c] hover:bg-blue-400/30 text-blue-400 border border-[#16345c] hover:border-blue-500/20 flex items-center justify-center text-xs font-bold transition shadow cursor-pointer"><i class="fa-solid fa-gear"></i></button>';
        html += '</div>';
        html += '<div class="flex items-center gap-3">';
        html += '<div class="text-right">';
        html += '<div class="flex items-center justify-end gap-2">';
        if (item.isSpecial) html += '<span class="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-[9px] font-bold flex items-center gap-1"><span>بوتات خاصة فقط</span><i class="fa-solid fa-lock text-[8px]"></i></span>';
        if (customChan)     html += '<span class="px-2 py-0.5 bg-blue-400/10 text-blue-400 border border-blue-500/20 rounded-lg text-[9px] font-bold flex items-center gap-1"><span>قناة مخصصة</span><i class="fa-solid fa-hashtag text-[8px]"></i></span>';
        html += '<span class="font-bold text-white text-xs">' + item.title + '</span>';
        html += '<span class="w-2.5 h-2.5 rounded-full shadow-sm" style="background-color:' + customColor + '" title="لون الإيمبد"></span>';
        html += '</div>';
        html += '<p class="text-[10px] text-white mt-0.5">' + item.desc + '</p>';
        html += '</div>';
        html += '<div class="w-10 h-10 rounded-xl bg-[#070d1d] border border-[#16345c] text-blue-100 flex items-center justify-center text-base shadow-inner flex-shrink-0">' + item.icon + '</div>';
        html += '</div>';
        html += '</div>';
    }
    container.innerHTML = html;
}

// ================================================================
// WINDOW FUNCTIONS (callable from onclick attributes)
// ================================================================

window.switchLogsCategory = function(catKey) {
    currentCategory = catKey;
    var chanSelect = document.getElementById('catDefaultChannel');
    if (chanSelect && categoryChannels[catKey] !== undefined) {
        chanSelect.value = categoryChannels[catKey];
    }
    var catDefColor = (LOG_CATEGORIES[catKey] && LOG_CATEGORIES[catKey].defaultColor) ? LOG_CATEGORIES[catKey].defaultColor : '#60a5fa';
    var hexEl   = document.getElementById('catColorHex');
    var pickEl  = document.getElementById('catColorPicker');
    var prevBox = document.getElementById('catColorPreviewBox');
    if (hexEl)   hexEl.value = catDefColor;
    if (pickEl)  pickEl.value = catDefColor;
    if (prevBox) prevBox.style.backgroundColor = catDefColor;
    renderCategoriesSidebar();
    renderLogsGrid();
};

window.toggleLogsCategoriesDropdown = function() {
    var list  = document.getElementById('logsCategoriesList');
    var arrow = document.getElementById('logsCategoriesDropdownArrow');
    if (!list) return;
    if (list.classList.contains('hidden')) {
        list.classList.remove('hidden');
        if (arrow) arrow.className = 'fa-solid fa-chevron-down text-blue-300 text-xs';
    } else {
        list.classList.add('hidden');
        if (arrow) arrow.className = 'fa-solid fa-chevron-left text-blue-300 text-xs';
    }
};

window.filterLogsByStatus = function(status) {
    currentFilter = status;
    var btnAll = document.getElementById('btnLogFilterAll');
    var btnEn  = document.getElementById('btnLogFilterEnabled');
    var btnDis = document.getElementById('btnLogFilterDisabled');
    var ac = 'filter-tab px-4 py-2 rounded-lg text-xs font-bold bg-gradient-to-l from-purple-600 to-blue-500 text-white shadow-md transition cursor-pointer';
    var ic = 'filter-tab px-4 py-2 rounded-lg text-xs font-bold text-blue-300 hover:text-white transition cursor-pointer';
    if (btnAll) btnAll.className = (status === 'all')      ? ac : ic;
    if (btnEn)  btnEn.className  = (status === 'enabled')  ? ac : ic;
    if (btnDis) btnDis.className = (status === 'disabled') ? ac : ic;
    renderCategoriesSidebar();
    renderLogsGrid();
};

window.searchLogsItems = function() {
    renderLogsGrid();
};

window.toggleSingleLogEvent = function(logId, enable) {
    var was = isLogEnabled(logId);
    saveToLogsHistory('toggleLog', { id: logId, was: was, is: enable });
    if (!logsState[logId]) logsState[logId] = {};
    logsState[logId].enabled = enable;
    var card = document.querySelector('div[data-log-id="' + logId + '"]');
    if (card) {
        if (enable) card.classList.remove('opacity-40');
        else        card.classList.add('opacity-40');
    }
    renderCategoriesSidebar();
    saveLogsConfigToServer();
};

window.toggleActiveCategoryLogs = function(enable) {
    var cat = LOG_CATEGORIES[currentCategory];
    if (!cat || !cat.items) return;
    saveToLogsHistory('toggleCat', { snapshot: JSON.parse(JSON.stringify(logsState)) });
    for (var i = 0; i < cat.items.length; i++) {
        var id = cat.items[i].id;
        if (!logsState[id]) logsState[id] = {};
        logsState[id].enabled = enable;
    }
    renderCategoriesSidebar();
    renderLogsGrid();
    saveLogsConfigToServer();
};

window.toggleAllLogsGlobally = function(enable) {
    saveToLogsHistory('toggleAll', { snapshot: JSON.parse(JSON.stringify(logsState)) });
    var catKeys = Object.keys(LOG_CATEGORIES);
    for (var i = 0; i < catKeys.length; i++) {
        var items = LOG_CATEGORIES[catKeys[i]].items || [];
        for (var j = 0; j < items.length; j++) {
            var id = items[j].id;
            if (!logsState[id]) logsState[id] = {};
            logsState[id].enabled = enable;
        }
    }
    renderCategoriesSidebar();
    renderLogsGrid();
    saveLogsConfigToServer();
};

window.applyCatSettingsToAll = function() {
    var cat = LOG_CATEGORIES[currentCategory];
    if (!cat || !cat.items) return;
    var colorInp = document.getElementById('catColorHex');
    var color = colorInp ? colorInp.value : '#60a5fa';
    var chanInp = document.getElementById('catDefaultChannel');
    var chan = chanInp ? chanInp.value : '';
    var appliedCount = 0;
    for (var i = 0; i < cat.items.length; i++) {
        var id = cat.items[i].id;
        if (!isLogEnabled(id)) continue;
        if (!logsState[id]) logsState[id] = { enabled: true };
        if (color) logsState[id].color = color;
        if (chan)  logsState[id].channel_id = chan;
        appliedCount++;
    }
    if (chan) categoryChannels[currentCategory] = chan;
    if (appliedCount === 0) {
        showToast('⚠️ لا توجد سجلات مفعلة في القسم الحالي لتطبيق الإعدادات عليها!', 'danger');
        return;
    }
    showToast('✨ تم تطبيق القناة واللون بنجاح على ' + appliedCount + ' سجل', 'success');
    renderCategoriesSidebar();
    renderLogsGrid();
    var extra = {};
    if (chan) extra['log_channel_' + currentCategory] = chan;
    saveLogsConfigToServer(extra);
};

window.openEditLogModal = function(logId, title, icon) {
    currentEditModalLogId = logId;
    var modal    = document.getElementById('editLogModal');
    var titleEl  = document.getElementById('modalLogTitle');
    var iconEl   = document.getElementById('modalLogIcon');
    var chanEl   = document.getElementById('modalLogChannel');
    var colorHex = document.getElementById('modalLogColorHex');
    var colorPkr = document.getElementById('modalLogColorPicker');
    var prevBox  = document.getElementById('modalColorPreviewBox');
    if (titleEl) titleEl.textContent = title || 'تخصيص السجل';
    if (iconEl)  iconEl.textContent  = icon  || '📜';
    var cfg = logsState[logId] || {};
    if (chanEl)   chanEl.value = cfg.channel_id || '';
    var col = cfg.color || '#60a5fa';
    if (colorHex) colorHex.value = col;
    if (colorPkr) colorPkr.value = col;
    if (prevBox)  prevBox.style.backgroundColor = col;
    if (modal) modal.classList.remove('hidden');
};

window.closeEditLogModal = function() {
    var modal = document.getElementById('editLogModal');
    if (modal) modal.classList.add('hidden');
    currentEditModalLogId = null;
};

window.saveModalLogConfig = function() {
    if (!currentEditModalLogId) return;
    var chanEl   = document.getElementById('modalLogChannel');
    var colorHex = document.getElementById('modalLogColorHex');
    if (!logsState[currentEditModalLogId]) logsState[currentEditModalLogId] = { enabled: true };
    logsState[currentEditModalLogId].channel_id = chanEl ? chanEl.value : '';
    logsState[currentEditModalLogId].color = colorHex ? colorHex.value : '#60a5fa';
    saveLogsConfigToServer(null, '✓ تم حفظ تخصيص السجل بنجاح');
    window.closeEditLogModal();
    renderCategoriesSidebar();
    renderLogsGrid();
};

window.saveLogsSetting = function(key, val) {
    if (!_logsGuildId) return;
    var body = {};
    body[key] = (typeof val === 'boolean') ? (val ? 1 : 0) : val;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/guild/' + _logsGuildId + '/settings', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
        try {
            if (JSON.parse(xhr.responseText).success) {
                showToast(val ? '✓ تم تفعيل السجلات بنجاح' : '✕ تم تعطيل السجلات', val ? 'success' : 'danger');
            }
        } catch(e) {}
    };
    xhr.send(JSON.stringify(body));
};

window.saveLogsConfigToServer = saveLogsConfigToServer;

window.autoSetupLogsChannels = function(mode) {
    var modeTitle = mode === 'grouped' ? 'القنوات العادية (قسم لكل قناة)' : 'القنوات المفصلة (قناة لكل نوع سجل)';
    showLogsConfirm('هل تريد إنشاء قنوات السجلات تلقائياً بالسيرفر بنظام: ' + modeTitle + '؟', function() {
        showToast('🚀 جاري إنشاء قنوات السجلات تلقائياً في السيرفر...', 'info');
        fetch('/api/guild/' + _logsGuildId + '/logs/auto-setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: mode })
        }).then(function(res) { return res.json(); }).then(function(d) {
            if (d.success) {
                showToast('✓ تم إنشاء وتوزيع قنوات السجلات بنجاح في السيرفر!', 'success');
                setTimeout(function() { location.reload(); }, 1200);
            } else {
                showToast('✕ ' + (d.error || 'فشل إنشاء القنوات'), 'danger');
            }
        }).catch(function() { showToast('✕ حدث خطأ في الاتصال بالخادم', 'danger'); });
    });
};

window.deleteLogsChannels = function() {
    showLogsConfirm('هل أنت متأكد من حذف كاتيجوري وقنوات سجلات Droplet نهائياً؟ هذه العملية لا يمكن التراجع عنها.', function() {
        showToast('🗑️ جاري حذف كاتيغوري وقنوات السجلات...', 'danger');
        fetch('/api/guild/' + _logsGuildId + '/logs/delete-channels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }).then(function(res) { return res.json(); }).then(function(d) {
            if (d.success) {
                showToast('✓ تم حذف قنوات السجلات بنجاح', 'success');
                setTimeout(function() { location.reload(); }, 1200);
            } else {
                showToast('✕ ' + (d.error || 'فشل الحذف'), 'danger');
            }
        }).catch(function() { showToast('✕ حدث خطأ في الاتصال', 'danger'); });
    });
};

// ================================================================
// EVENT LISTENERS (attached via JS, not onclick attributes)
// ================================================================

// Confirmation modal buttons
(function() {
    var ok     = document.getElementById('logs-confirm-ok');
    var cancel = document.getElementById('logs-confirm-cancel');
    if (ok)     ok.addEventListener('click', function() { if (logsConfirmCallback) logsConfirmCallback(); hideLogsConfirm(); });
    if (cancel) cancel.addEventListener('click', hideLogsConfirm);
})();

// Undo button
(function() {
    var undoBtn = document.getElementById('logs-btn-undo');
    if (undoBtn) {
        undoBtn.addEventListener('click', function() {
            if (logsHistory.length === 0) return;
            var last = logsHistory.pop();
            updateUndoBtn();
            if (last.action === 'toggleLog' && last.data) {
                var id = last.data.id;
                if (!logsState[id]) logsState[id] = {};
                logsState[id].enabled = last.data.was;
                var cb = document.querySelector('input[data-log-checkbox="' + id + '"]');
                if (cb) cb.checked = last.data.was;
                renderCategoriesSidebar();
                renderLogsGrid();
                saveLogsConfigToServer();
            } else if (last.action === 'toggleAll' || last.action === 'toggleCat') {
                if (last.data && last.data.snapshot) {
                    logsState = last.data.snapshot;
                    renderCategoriesSidebar();
                    renderLogsGrid();
                    saveLogsConfigToServer();
                }
            }
            showToast('↶ تم التراجع عن: ' + last.action, 'info');
        });
    }
})();

// Export button
(function() {
    var exportBtn = document.getElementById('logs-btn-export');
    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            try {
                var exportData = { timestamp: new Date().toISOString(), guildId: _logsGuildId, logsState: logsState, categoryChannels: categoryChannels };
                var dataStr = JSON.stringify(exportData, null, 2);
                var blob = new Blob([dataStr], { type: 'application/json' });
                var url = URL.createObjectURL(blob);
                var link = document.createElement('a');
                link.href = url;
                link.download = 'droplet-logs-settings-' + Date.now() + '.json';
                link.click();
                URL.revokeObjectURL(url);
                showToast('📥 تم تصدير إعدادات السجلات بنجاح', 'success');
            } catch(e) {
                showToast('خطأ في التصدير', 'danger');
            }
        });
    }
})();

// Channel select per category
(function() {
    var chanSelect = document.getElementById('catDefaultChannel');
    if (chanSelect) {
        chanSelect.addEventListener('change', function() {
            var val = this.value;
            categoryChannels[currentCategory] = val;
            window.saveLogsSetting('log_channel_' + currentCategory, val);
        });
    }
})();

// Color pickers sync
(function() {
    var catColorPicker = document.getElementById('catColorPicker');
    var catColorHex    = document.getElementById('catColorHex');
    var catColorPrev   = document.getElementById('catColorPreviewBox');
    if (catColorPicker) {
        catColorPicker.addEventListener('input', function() {
            if (catColorHex)  catColorHex.value = this.value;
            if (catColorPrev) catColorPrev.style.backgroundColor = this.value;
        });
    }
    if (catColorHex) {
        catColorHex.addEventListener('input', function() {
            if (catColorPicker) catColorPicker.value = this.value;
            if (catColorPrev)   catColorPrev.style.backgroundColor = this.value;
        });
    }
    var modalColorPicker = document.getElementById('modalLogColorPicker');
    var modalColorHex    = document.getElementById('modalLogColorHex');
    var modalColorPrev   = document.getElementById('modalColorPreviewBox');
    if (modalColorPicker) {
        modalColorPicker.addEventListener('input', function() {
            if (modalColorHex)  modalColorHex.value = this.value;
            if (modalColorPrev) modalColorPrev.style.backgroundColor = this.value;
        });
    }
    if (modalColorHex) {
        modalColorHex.addEventListener('input', function() {
            if (modalColorPicker) modalColorPicker.value = this.value;
            if (modalColorPrev)   modalColorPrev.style.backgroundColor = this.value;
        });
    }
})();

// ================================================================
// INITIAL RENDER
// ================================================================
syncHiddenInput();
window.switchLogsCategory('members');
console.log('[Droplet LOGS] Script loaded successfully. logsState keys:', Object.keys(logsState).length, '| LOG_CATEGORIES keys:', Object.keys(LOG_CATEGORIES).length);

// ---- BACKUP: Event Delegation System ----
(function() {
    // Attach named element listeners
    var searchInput = document.getElementById('logSearchInput');
    if (searchInput) { searchInput.removeAttribute('oninput'); searchInput.addEventListener('input', function() { renderLogsGrid(); }); }

    var masterToggle = document.getElementById('logsMasterToggle');
    if (masterToggle) {
        masterToggle.removeAttribute('onchange');
        masterToggle.addEventListener('change', function() { window.saveLogsSetting('logs_enabled', this.checked); });
    }
    var subLogsToggle = document.getElementById('sub-logs-switch');
    if (subLogsToggle) {
        subLogsToggle.removeAttribute('onchange');
        subLogsToggle.addEventListener('change', function() {
            window.saveLogsSetting('logs_enabled', this.checked);
            if (masterToggle) masterToggle.checked = this.checked;
        });
    }
    var saveBtn = document.getElementById('logs-btn-save');
    if (saveBtn) {
        saveBtn.removeAttribute('onclick');
        saveBtn.addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            window.saveLogsConfigToServer(null, 'تم حفظ جميع التغييرات في قاعدة البيانات');
        });
    }

    // Global click delegation (useCapture=true = runs before form submit)
    document.addEventListener('click', function(e) {
        var btn = e.target.tagName === 'BUTTON' ? e.target : e.target.closest('button');
        if (!btn) return;
        var oc = btn.getAttribute('onclick') || '';
        if (!oc) return;
        if (oc.indexOf('toggleAllLogsGlobally(false)') >= 0) { e.preventDefault(); e.stopPropagation(); window.toggleAllLogsGlobally(false); return; }
        if (oc.indexOf('toggleAllLogsGlobally(true)')  >= 0) { e.preventDefault(); e.stopPropagation(); window.toggleAllLogsGlobally(true);  return; }
        if (oc.indexOf('toggleActiveCategoryLogs(false)') >= 0) { e.preventDefault(); e.stopPropagation(); window.toggleActiveCategoryLogs(false); return; }
        if (oc.indexOf('toggleActiveCategoryLogs(true)')  >= 0) { e.preventDefault(); e.stopPropagation(); window.toggleActiveCategoryLogs(true);  return; }
        if (oc.indexOf('applyCatSettingsToAll') >= 0)      { e.preventDefault(); e.stopPropagation(); window.applyCatSettingsToAll(); return; }
        if (oc.indexOf('toggleLogsCategoriesDropdown') >= 0) { e.preventDefault(); e.stopPropagation(); window.toggleLogsCategoriesDropdown(); return; }
        if (oc.indexOf('autoSetupLogsChannels') >= 0 && oc.indexOf('grouped') >= 0)  { e.preventDefault(); e.stopPropagation(); window.autoSetupLogsChannels('grouped'); return; }
        if (oc.indexOf('autoSetupLogsChannels') >= 0 && oc.indexOf('detailed') >= 0) { e.preventDefault(); e.stopPropagation(); window.autoSetupLogsChannels('detailed'); return; }
        if (oc.indexOf('deleteLogsChannels') >= 0)         { e.preventDefault(); e.stopPropagation(); window.deleteLogsChannels(); return; }
        if (oc.indexOf('filterLogsByStatus') >= 0 && oc.indexOf('disabled') >= 0)    { e.preventDefault(); e.stopPropagation(); window.filterLogsByStatus('disabled'); return; }
        if (oc.indexOf('filterLogsByStatus') >= 0 && oc.indexOf('enabled') >= 0)     { e.preventDefault(); e.stopPropagation(); window.filterLogsByStatus('enabled'); return; }
        if (oc.indexOf('filterLogsByStatus') >= 0 && oc.indexOf('all') >= 0)         { e.preventDefault(); e.stopPropagation(); window.filterLogsByStatus('all'); return; }
        if (oc.indexOf('closeEditLogModal') >= 0)  { e.preventDefault(); e.stopPropagation(); window.closeEditLogModal(); return; }
        if (oc.indexOf('saveModalLogConfig') >= 0) { e.preventDefault(); e.stopPropagation(); window.saveModalLogConfig(); return; }
        if (oc.indexOf('saveLogsConfigToServer') >= 0) { e.preventDefault(); e.stopPropagation(); window.saveLogsConfigToServer(null, 'تم حفظ جميع التغييرات'); return; }
        if (oc.indexOf('switchLogsCategory') >= 0) {
            var m = oc.match(/switchLogsCategory\('([^']+)'\)/);
            if (m) { e.preventDefault(); e.stopPropagation(); window.switchLogsCategory(m[1]); return; }
        }
        if (oc.indexOf('openEditLogModal') >= 0) {
            var m2 = oc.match(/openEditLogModal\('([^']+)',\s*'([^']*)',\s*'([^']*)'\)/);
            if (m2) { e.preventDefault(); e.stopPropagation(); window.openEditLogModal(m2[1], m2[2], m2[3]); return; }
        }
        // data-action="editlog" buttons (no inline onclick needed)
        var editBtn = e.target.closest('[data-action="editlog"]');
        if (editBtn) {
            e.preventDefault(); e.stopPropagation();
            var lid = editBtn.getAttribute('data-logid') || '';
            var ltitle = decodeURIComponent(editBtn.getAttribute('data-logtitle') || '');
            var licon  = decodeURIComponent(editBtn.getAttribute('data-logicon')  || '');
            window.openEditLogModal(lid, ltitle, licon);
            return;
        }
    }, true);

    // Checkbox change delegation
    document.addEventListener('change', function(e) {
        var el = e.target;
        if (!el || el.tagName !== 'INPUT') return;
        // data-logid checkboxes (new approach)
        var lid = el.getAttribute('data-logid') || el.getAttribute('data-log-checkbox');
        if (lid) { e.stopPropagation(); window.toggleSingleLogEvent(lid, el.checked); return; }
        // Legacy onchange attribute approach
        var oc = el.getAttribute('onchange') || '';
        if (oc.indexOf('toggleSingleLogEvent') >= 0) {
            var m = oc.match(/toggleSingleLogEvent\('([^']+)',\s*this\.checked\)/);
            if (m) { e.stopPropagation(); window.toggleSingleLogEvent(m[1], el.checked); return; }
        }
        if (oc.indexOf('saveLogsSetting') >= 0) {
            var m2 = oc.match(/saveLogsSetting\('([^']+)',\s*this\.checked\)/);
            if (m2) { e.stopPropagation(); window.saveLogsSetting(m2[1], el.checked); return; }
        }
    }, true);

    console.log('[Droplet LOGS] Delegation READY. toggleAllLogsGlobally type:', typeof window.toggleAllLogsGlobally);
})();
// ===== END LOGS SECTION SCRIPT =====

                `;


            } else if (section === 'help') {
                title = 'قائمة الأوامر الكاملة 📚';
                // All commands data for the help page
                const helpCommands = [
                    // 🛡️ الإشراف والعقوبات
                    { name: 'ban',           cat: 'moderation', catLabel: '🔨 الإشراف',          desc: 'حظر عضو من السيرفر' },
                    { name: 'clear',         cat: 'moderation', catLabel: '🔨 الإشراف',          desc: 'حذف رسائل من القناة' },
                    { name: 'hide',          cat: 'moderation', catLabel: '🔨 الإشراف',          desc: 'إخفاء الروم الحالي عن الأعضاء' },
                    { name: 'jail',          cat: 'moderation', catLabel: '🔨 الإشراف',          desc: 'نظام سجن وعزل الأعضاء المخالفين' },
                    { name: 'kick',          cat: 'moderation', catLabel: '🔨 الإشراف',          desc: 'طرد عضو من السيرفر' },
                    { name: 'lock',          cat: 'moderation', catLabel: '🔨 الإشراف',          desc: 'قفل الروم الحالي' },
                    { name: 'mute',          cat: 'moderation', catLabel: '🔨 الإشراف',          desc: 'إسكات عضو كتابياً وصوتياً' },
                    { name: 'nickname',      cat: 'moderation', catLabel: '🔨 الإشراف',          desc: 'تغيير لقب عضو' },
                    { name: 'role',          cat: 'moderation', catLabel: '🔨 الإشراف',          desc: 'إدارة أدوار الأعضاء' },
                    { name: 'role-all',      cat: 'moderation', catLabel: '🔨 الإشراف',          desc: 'إعطاء رتبة لجميع الأعضاء أو إزالتها منهم' },
                    { name: 'slowmode',      cat: 'moderation', catLabel: '🔨 الإشراف',          desc: 'تحديد سرعة إرسال الرسائل بالثواني' },
                    { name: 'timeout',       cat: 'moderation', catLabel: '🔨 الإشراف',          desc: 'عزل / إسكات عضو مؤقتاً في السيرفر' },
                    { name: 'unban',         cat: 'moderation', catLabel: '🔨 الإشراف',          desc: 'إلغاء حظر عضو من السيرفر' },
                    { name: 'unhide',        cat: 'moderation', catLabel: '🔨 الإشراف',          desc: 'إظهار الروم الحالي وإلغاء إخفائه' },
                    { name: 'unlock',        cat: 'moderation', catLabel: '🔨 الإشراف',          desc: 'فتح الروم الحالي' },
                    { name: 'untimeout',     cat: 'moderation', catLabel: '🔨 الإشراف',          desc: 'فك العزل عن عضو في السيرفر' },
                    { name: 'warn',          cat: 'moderation', catLabel: '🔨 الإشراف',          desc: 'إدارة تحذيرات الأعضاء' },
                    // 🔐 الحماية والأمان
                    { name: 'anti-ban',          cat: 'protection', catLabel: '🔐 الحماية',   desc: 'تسطيب نظام الحماية من الباند' },
                    { name: 'anti-bots',         cat: 'protection', catLabel: '🔐 الحماية',   desc: 'تسطيب نظام الحماية من البوتات' },
                    { name: 'anti-delete-roles', cat: 'protection', catLabel: '🔐 الحماية',   desc: 'تسطيب نظام الحماية من حذف الرتب' },
                    { name: 'anti-delete-rooms', cat: 'protection', catLabel: '🔐 الحماية',   desc: 'تسطيب نظام الحماية من حذف الرومات' },
                    { name: 'protection-status', cat: 'protection', catLabel: '🔐 الحماية',   desc: 'عرض حالة أنظمة الحماية' },
                    { name: 'set-protect-logs',  cat: 'protection', catLabel: '🔐 الحماية',   desc: 'تعيين روم لسجلات الحماية والنوك' },
                    // 👋 الترحيب والمغادرة
                    { name: 'set-welcome', cat: 'welcome', catLabel: '👋 الترحيب', desc: 'إعداد نظام الترحيب' },
                    // 💬 الرد التلقائي
                    { name: 'auto-responder',   cat: 'autoresponder', catLabel: '💬 الرد التلقائي', desc: 'إدارة نظام الرد التلقائي' },
                    { name: 'autoreply-add',    cat: 'autoresponder', catLabel: '💬 الرد التلقائي', desc: 'لاضافة رد تلقائي' },
                    { name: 'autoreply-list',   cat: 'autoresponder', catLabel: '💬 الرد التلقائي', desc: 'لرؤية جميع الردود التلقائية' },
                    { name: 'autoreply-remove', cat: 'autoresponder', catLabel: '💬 الرد التلقائي', desc: 'لازالة رد تلقائي' },
                    // 🎫 نظام التذاكر
                    { name: 'add-ticket-button', cat: 'tickets', catLabel: '🎫 التذاكر', desc: 'إرسال زر التذكرة' },
                    { name: 'add-user',          cat: 'tickets', catLabel: '🎫 التذاكر', desc: 'إضافة عضو للتذكرة' },
                    { name: 'close',             cat: 'tickets', catLabel: '🎫 التذاكر', desc: 'اغلاق التذكرة الحالية' },
                    { name: 'delete',            cat: 'tickets', catLabel: '🎫 التذاكر', desc: 'حذف التذكرة فوراً' },
                    { name: 'remove-user',       cat: 'tickets', catLabel: '🎫 التذاكر', desc: 'إزالة عضو من التذكرة' },
                    { name: 'rename',            cat: 'tickets', catLabel: '🎫 التذاكر', desc: 'إعادة تسمية التذكرة' },
                    { name: 'set-ticket-log',    cat: 'tickets', catLabel: '🎫 التذاكر', desc: 'تحديد روم سجلات التذاكر' },
                    { name: 'setup-rating',      cat: 'tickets', catLabel: '🎫 التذاكر', desc: 'تفعيل نظام التقييم في التذاكر' },
                    { name: 'ticket',            cat: 'tickets', catLabel: '🎫 التذاكر', desc: 'أوامر إدارة التذاكر المتقدمة' },
                    { name: 'ticket-setup',      cat: 'tickets', catLabel: '🎫 التذاكر', desc: 'إعداد لوحة تذاكر مخصصة بالكامل' },
                    // 🏆 المستويات & XP
                    { name: 'leaderboard',  cat: 'levels', catLabel: '🏆 المستويات', desc: 'عرض قائمة المتصدرين' },
                    { name: 'profile',      cat: 'levels', catLabel: '🏆 المستويات', desc: 'عرض بطاقة البروفايل والهوية الشخصية' },
                    { name: 'rank',         cat: 'levels', catLabel: '🏆 المستويات', desc: 'عرض بطاقة المستوى ونقاط الخبرة' },
                    { name: 'setwallpaper', cat: 'levels', catLabel: '🏆 المستويات', desc: 'تعيين خلفية مخصصة لبطاقة البروفايل' },
                    // 💰 الاقتصاد والمال
                    { name: 'balance',      cat: 'economy', catLabel: '💰 الاقتصاد', desc: 'عرض رصيدك الحالي من العملات' },
                    { name: 'bank',         cat: 'economy', catLabel: '💰 الاقتصاد', desc: 'نظام البنك' },
                    { name: 'daily',        cat: 'economy', catLabel: '💰 الاقتصاد', desc: 'احصل على مكافأتك اليومية' },
                    { name: 'pay',          cat: 'economy', catLabel: '💰 الاقتصاد', desc: 'تحويل عملات الذهب إلى عضو آخر' },
                    { name: 'set-tax-line', cat: 'economy', catLabel: '💰 الاقتصاد', desc: 'تحديد خط لروم الضريبة' },
                    { name: 'set-tax-room', cat: 'economy', catLabel: '💰 الاقتصاد', desc: 'تحديد روم حساب الضريبة' },
                    { name: 'tax',          cat: 'economy', catLabel: '💰 الاقتصاد', desc: 'حساب ضريبة بروبوت' },
                    { name: 'tax-mode',     cat: 'economy', catLabel: '💰 الاقتصاد', desc: 'تحديد نمط الضريبة' },
                    { name: 'work',         cat: 'economy', catLabel: '💰 الاقتصاد', desc: 'اعمل لتكسب Star Coin' },
                    // 🎖️ الرتب التلقائية
                    { name: 'set-autorole',  cat: 'autoroles', catLabel: '🎖️ الرتب التلقائية', desc: 'تعيين الرتبة التلقائية للأعضاء الجدد' },
                    { name: 'reaction-role', cat: 'autoroles', catLabel: '🎖️ الرتب التلقائية', desc: 'إنشاء رسالة إعطاء رتبة بزر تفاعلي' },
                    { name: 'new-panel',     cat: 'autoroles', catLabel: '🎖️ الرتب التلقائية', desc: 'إنشاء بانل رتب جديد' },
                    { name: 'add-button',    cat: 'autoroles', catLabel: '🎖️ الرتب التلقائية', desc: 'إضافة زر (رتبة أو معلومات) لرسالة محددة' },
                    // 🎁 قيف اواي
                    { name: 'giveaway', cat: 'giveaways', catLabel: '🎁 قيف اواي', desc: 'إدارة سحوبات القيف أواي المتقدمة' },
                    // 🔗 Invite Tracker
                    { name: 'invites', cat: 'invites', catLabel: '🔗 Invite Tracker', desc: 'أوامر نظام متتبع الدعوات (Invite Tracker)' },
                    // 📝 التقديمات
                    { name: 'apply',        cat: 'applications', catLabel: '📝 التقديمات', desc: 'فتح قائمة التقديمات أو إرسال رسالة التقديمات في القناة' },
                    { name: 'applications', cat: 'applications', catLabel: '📝 التقديمات', desc: 'إدارة نظام التقديمات ومراجعة الطلبات' },
                    { name: 'dm-mode',      cat: 'applications', catLabel: '📝 التقديمات', desc: 'إشعار التقديم بالخاص' },
                    // 💡 الاقتراحات والشكاوي
                    { name: 'feedback-mode',        cat: 'suggestions', catLabel: '💡 الاقتراحات', desc: 'تحديد نمط الآراء' },
                    { name: 'set-feedback-line',    cat: 'suggestions', catLabel: '💡 الاقتراحات', desc: 'تحديد خط لروم الآراء' },
                    { name: 'set-feedback-room',    cat: 'suggestions', catLabel: '💡 الاقتراحات', desc: 'تحديد روم الآراء' },
                    { name: 'set-suggestions-line', cat: 'suggestions', catLabel: '💡 الاقتراحات', desc: 'تحديد خط لروم الاقتراحات' },
                    { name: 'set-suggestions-room', cat: 'suggestions', catLabel: '💡 الاقتراحات', desc: 'تحديد روم الاقتراحات' },
                    { name: 'suggest',              cat: 'suggestions', catLabel: '💡 الاقتراحات', desc: 'تقديم اقتراح أو فكرة لتطوير السيرفر' },
                    { name: 'suggestion-mode',      cat: 'suggestions', catLabel: '💡 الاقتراحات', desc: 'تحديد نمط الاقتراحات' },
                    // 🤖 الرقابة التلقائية
                    { name: 'automod', cat: 'automod', catLabel: '🤖 الرقابة التلقائية', desc: 'إدارة وتخصيص منظومة الرقابة التلقائية الذكية (Auto-Mod)' },
                    // 🕒 الرومات المؤقتة
                    { name: 'set-tempvoice', cat: 'tempvoice', catLabel: '🕒 الرومات المؤقتة', desc: 'تعيين روم الرومات الصوتية المؤقتة' },
                    // ⚙️ الإدارة والسجلات
                    { name: 'set',              cat: 'admin', catLabel: '⚙️ الإدارة', desc: 'إعدادات وتخصيص البوت ولوحات الإدارة' },
                    { name: 'set-jail',         cat: 'admin', catLabel: '⚙️ الإدارة', desc: 'إعداد وتخصيص رتبة وروم السجن' },
                    { name: 'set-logs',         cat: 'admin', catLabel: '⚙️ الإدارة', desc: 'تحديد روم السجلات الشتملة' },
                    { name: 'set-prefix',       cat: 'admin', catLabel: '⚙️ الإدارة', desc: 'تغيير رمز البرفكس الخاص بالسيرفر' },
                    { name: 'set-shortcut',     cat: 'admin', catLabel: '⚙️ الإدارة', desc: 'وضع اختصار لأمر معين' },
                    { name: 'set-verification', cat: 'admin', catLabel: '⚙️ الإدارة', desc: 'إعداد وتفعيل نظام التحقق التفاعلي في السيرفر' },
                    { name: 'logs',             cat: 'admin', catLabel: '⚙️ الإدارة', desc: 'نظام تتبع جميع الأحداث في السيرفر مع الفاعل والتفاصيل فورياً' },
                    { name: 'staff',            cat: 'admin', catLabel: '⚙️ الإدارة', desc: 'نظام متابعة نشاط طاقم الإدارة (Staff Activity)' },
                    { name: 'top-in',           cat: 'admin', catLabel: '⚙️ الإدارة', desc: 'لوحة شرف وترتيب ساعات ونقاط طاقم الإدارة' },
                    // ⚙️ الأوامر العامة
                    { name: 'add-autoline-channel',    cat: 'general', catLabel: '⚙️ عام', desc: 'اضافة روم خط تلقائي' },
                    { name: 'add-nadeko-room',         cat: 'general', catLabel: '⚙️ عام', desc: 'اضافة روم لتفعيل خاصية ناديكو' },
                    { name: 'ai',                      cat: 'general', catLabel: '⚙️ عام', desc: 'التحدث مع الذكاء الاصطناعي (Droplet AI)' },
                    { name: 'ask',                     cat: 'general', catLabel: '⚙️ عام', desc: 'اسأل ذكاء Droplet الاصطناعي أي سؤال!' },
                    { name: 'avatar',                  cat: 'general', catLabel: '⚙️ عام', desc: 'عرض صورة حسابك أو حساب عضو آخر' },
                    { name: 'banner',                  cat: 'general', catLabel: '⚙️ عام', desc: 'عرض بنر حسابك أو حساب عضو آخر' },
                    { name: 'copy-emoji',              cat: 'general', catLabel: '⚙️ عام', desc: 'نسخ إيموجي وإضافته للسيرفر' },
                    { name: 'embed',                   cat: 'general', catLabel: '⚙️ عام', desc: 'إرسال رسالة Embed منسقة' },
                    { name: 'help',                    cat: 'general', catLabel: '⚙️ عام', desc: 'عرض قائمة أوامر البوت الكاملة بشكل تفاعلي' },
                    { name: 'line-mode',               cat: 'general', catLabel: '⚙️ عام', desc: 'تحديد نمط الخط' },
                    { name: 'ping',                    cat: 'general', catLabel: '⚙️ عام', desc: 'عرض سرعة استجابة البوت (Ping)' },
                    { name: 'remove-autoline-channel', cat: 'general', catLabel: '⚙️ عام', desc: 'ازالة روم خط تلقائي' },
                    { name: 'remove-nadeko-room',      cat: 'general', catLabel: '⚙️ عام', desc: 'ازالة روم ناديكو' },
                    { name: 'roles',                   cat: 'general', catLabel: '⚙️ عام', desc: 'عرض رتب السيرفر' },
                    { name: 'say',                     cat: 'general', catLabel: '⚙️ عام', desc: 'ارسال رسالة عن طريق البوت' },
                    { name: 'send',                    cat: 'general', catLabel: '⚙️ عام', desc: 'ارسال رسالة لروم محدد' },
                    { name: 'server',                  cat: 'general', catLabel: '⚙️ عام', desc: 'عرض معلومات السيرفر وإحصائياته' },
                    { name: 'set-autoline-line',       cat: 'general', catLabel: '⚙️ عام', desc: 'تحديد خط لروم' },
                    { name: 'user',                    cat: 'general', catLabel: '⚙️ عام', desc: 'عرض معلومات العضو' },
                ];

                const catColors = {
                    moderation:    { bg: 'bg-red-950/40',     border: 'border-red-500/30',     text: 'text-red-400',     badge: 'bg-red-950/60 text-red-400' },
                    protection:    { bg: 'bg-orange-950/40',  border: 'border-orange-500/30',  text: 'text-orange-400',  badge: 'bg-orange-950/60 text-orange-400' },
                    welcome:       { bg: 'bg-green-950/40',   border: 'border-green-500/30',   text: 'text-green-400',   badge: 'bg-green-950/60 text-green-400' },
                    autoresponder: { bg: 'bg-cyan-950/40',    border: 'border-cyan-500/30',    text: 'text-cyan-400',    badge: 'bg-cyan-950/60 text-cyan-400' },
                    tickets:       { bg: 'bg-blue-800/40',  border: 'border-blue-500/20',  text: 'text-blue-400',  badge: 'bg-blue-800/60 text-blue-400' },
                    levels:        { bg: 'bg-yellow-950/40',  border: 'border-yellow-500/30',  text: 'text-yellow-400',  badge: 'bg-yellow-950/60 text-yellow-400' },
                    economy:       { bg: 'bg-amber-950/40',   border: 'border-amber-500/30',   text: 'text-amber-400',   badge: 'bg-amber-950/60 text-amber-400' },
                    autoroles:     { bg: 'bg-blue-800/40',    border: 'border-blue-500/20',    text: 'text-blue-400',    badge: 'bg-blue-800/60 text-blue-400' },
                    giveaways:     { bg: 'bg-pink-950/40',    border: 'border-pink-500/30',    text: 'text-pink-400',    badge: 'bg-pink-950/60 text-pink-400' },
                    invites:       { bg: 'bg-teal-950/40',    border: 'border-teal-500/30',    text: 'text-teal-400',    badge: 'bg-teal-950/60 text-teal-400' },
                    applications:  { bg: 'bg-emerald-950/40', border: 'border-emerald-500/30', text: 'text-emerald-400', badge: 'bg-emerald-950/60 text-emerald-400' },
                    suggestions:   { bg: 'bg-lime-950/40',    border: 'border-lime-500/30',    text: 'text-lime-400',    badge: 'bg-lime-950/60 text-lime-400' },
                    automod:       { bg: 'bg-rose-950/40',    border: 'border-rose-500/30',    text: 'text-rose-400',    badge: 'bg-rose-950/60 text-rose-400' },
                    tempvoice:     { bg: 'bg-sky-950/40',     border: 'border-sky-500/30',     text: 'text-sky-400',     badge: 'bg-sky-950/60 text-sky-400' },
                    admin:         { bg: 'bg-slate-950/40',   border: 'border-slate-500/30',   text: 'text-slate-300',   badge: 'bg-slate-800/60 text-slate-300' },
                    general:       { bg: 'bg-indigo-950/40',  border: 'border-indigo-500/30',  text: 'text-indigo-400',  badge: 'bg-indigo-950/60 text-indigo-400' },
                };

                const cmdCards = helpCommands.map(cmd => {
                    const c = catColors[cmd.cat] || catColors.general;
                    return '<div class="help-card border ' + c.border + ' ' + c.bg + ' rounded-2xl p-4 flex flex-col gap-2 hover:scale-[1.02] transition-transform cursor-default" data-cat="' + cmd.cat + '" data-name="' + cmd.name + '" data-desc="' + cmd.desc.replace(/"/g, '&quot;') + '">'
                        + '<div class="flex items-center justify-between gap-2">'
                        + '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full ' + c.badge + '">' + cmd.catLabel + '</span>'
                        + '<code class="' + c.text + ' font-bold text-sm font-mono">/' + cmd.name + '</code>'
                        + '</div>'
                        + '<p class="text-gray-300 text-xs leading-relaxed text-right">' + cmd.desc + '</p>'
                        + '</div>';
                }).join('');

                const totalCount = helpCommands.length;
                const catCounts = {};
                helpCommands.forEach(c => { catCounts[c.cat] = (catCounts[c.cat] || 0) + 1; });

                formFieldsHtml = '<div class="space-y-6 text-left" dir="ltr">'
                    + '<div class="bg-gradient-to-r from-[#0a1430] via-[#0b1322] to-[#0a1430] border border-blue-500/20 p-6 rounded-3xl shadow-2xl">'
                    + '<div class="flex items-center justify-between flex-wrap gap-4">'
                    + '<div class="flex items-center gap-3 flex-wrap">'
                    + '<span class="bg-blue-800/60 text-white text-xs font-bold px-3 py-1.5 rounded-full border border-blue-500/20">' + totalCount + ' أمر</span>'
                    + '<span class="bg-slate-900/60 text-gray-300 text-xs px-3 py-1.5 rounded-full border border-blue-500/20">16 قسم</span>'
                    + '</div><div>'
                    + '<h1 class="text-2xl font-black text-white">📚 قائمة الأوامر الكاملة</h1>'
                    + '<p class="text-white text-xs mt-1">جميع أوامر بوت Droplet مصنفة بالتفصيل</p>'
                    + '</div></div></div>'
                    + '<div class="flex flex-col sm:flex-row gap-3">'
                    + '<input id="help-search" type="text" placeholder="🔍 ابحث عن أمر..." dir="rtl" class="flex-1 bg-[#0c1a2e] border border-[#16345c] rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-blue-400 transition" />'
                    + '<select id="help-filter" dir="rtl" class="bg-[#0c1a2e] border border-[#16345c] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-400 transition">'
                    + '<option value="all">جميع الأقسام (' + totalCount + ')</option>'
                    + '<option value="moderation">🔨 الإشراف والعقوبات (' + (catCounts.moderation || 0) + ')</option>'
                    + '<option value="protection">🔐 الحماية والأمان (' + (catCounts.protection || 0) + ')</option>'
                    + '<option value="welcome">👋 الترحيب والمغادرة (' + (catCounts.welcome || 0) + ')</option>'
                    + '<option value="autoresponder">💬 الرد التلقائي (' + (catCounts.autoresponder || 0) + ')</option>'
                    + '<option value="tickets">🎫 نظام التذاكر (' + (catCounts.tickets || 0) + ')</option>'
                    + '<option value="levels">🏆 المستويات & XP (' + (catCounts.levels || 0) + ')</option>'
                    + '<option value="economy">💰 الاقتصاد والمال (' + (catCounts.economy || 0) + ')</option>'
                    + '<option value="autoroles">🎖️ الرتب التلقائية (' + (catCounts.autoroles || 0) + ')</option>'
                    + '<option value="giveaways">🎁 قيف اواي (' + (catCounts.giveaways || 0) + ')</option>'
                    + '<option value="invites">🔗 Invite Tracker (' + (catCounts.invites || 0) + ')</option>'
                    + '<option value="applications">📝 التقديمات (' + (catCounts.applications || 0) + ')</option>'
                    + '<option value="suggestions">💡 الاقتراحات والشكاوي (' + (catCounts.suggestions || 0) + ')</option>'
                    + '<option value="automod">🤖 الرقابة التلقائية (' + (catCounts.automod || 0) + ')</option>'
                    + '<option value="tempvoice">🕒 الرومات المؤقتة (' + (catCounts.tempvoice || 0) + ')</option>'
                    + '<option value="admin">⚙️ الإدارة والسجلات (' + (catCounts.admin || 0) + ')</option>'
                    + '<option value="general">⚙️ الأوامر العامة (' + (catCounts.general || 0) + ')</option>'
                    + '</select></div>'
                    + '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">'
                    + '<div class="bg-[#0c1526] border border-[#16345c] rounded-2xl p-3 text-center"><div class="text-2xl font-black text-white">' + totalCount + '</div><div class="text-white text-xs mt-0.5">أمر إجمالي</div></div>'
                    + '<div class="bg-red-950/30 border border-red-500/20 rounded-2xl p-3 text-center"><div class="text-2xl font-black text-red-400">' + (catCounts.moderation || 0) + '</div><div class="text-white text-xs mt-0.5">إشراف</div></div>'
                    + '<div class="bg-blue-800/30 border border-blue-500/20 rounded-2xl p-3 text-center"><div class="text-2xl font-black text-blue-400">' + (catCounts.tickets || 0) + '</div><div class="text-white text-xs mt-0.5">تذاكر</div></div>'
                    + '<div class="bg-slate-950/30 border border-slate-500/20 rounded-2xl p-3 text-center"><div class="text-2xl font-black text-slate-300">' + (catCounts.admin || 0) + '</div><div class="text-white text-xs mt-0.5">إدارة</div></div>'
                    + '</div>'
                    + '<div id="help-results-info" class="text-white text-xs text-right hidden"></div>'
                    + '<div id="help-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">' + cmdCards + '</div>'
                    + '<div id="help-empty" class="hidden text-center py-16 text-gray-500"><div class="text-4xl mb-3">🔍</div><p class="text-sm">لا توجد نتائج مطابقة للبحث</p></div>'
                    + '</div>';

                embedScriptHtml = '(function() {'
                    + 'var searchEl = document.getElementById("help-search");'
                    + 'var filterEl = document.getElementById("help-filter");'
                    + 'var grid = document.getElementById("help-grid");'
                    + 'var empty = document.getElementById("help-empty");'
                    + 'var info = document.getElementById("help-results-info");'
                    + 'var cards = Array.from(grid ? grid.querySelectorAll(".help-card") : []);'
                    + 'function filterCards() {'
                    + '  var q = (searchEl ? searchEl.value : "").trim().toLowerCase().replace(/^\\//, "");'
                    + '  var cat = filterEl ? filterEl.value : "all";'
                    + '  var shown = 0;'
                    + '  cards.forEach(function(card) {'
                    + '    var name = (card.dataset.name || "").toLowerCase();'
                    + '    var desc = (card.dataset.desc || "").toLowerCase();'
                    + '    var cardCat = card.dataset.cat || "";'
                    + '    var matchQ = !q || name.includes(q) || desc.includes(q);'
                    + '    var matchCat = cat === "all" || cardCat === cat;'
                    + '    if (matchQ && matchCat) { card.style.display = ""; shown++; }'
                    + '    else { card.style.display = "none"; }'
                    + '  });'
                    + '  if (empty) empty.classList.toggle("hidden", shown > 0);'
                    + '  if (grid) grid.classList.toggle("hidden", shown === 0);'
                    + '  if (info) {'
                    + '    if (q || cat !== "all") {'
                    + '      info.textContent = "عرض " + shown + " من " + cards.length + " أمر";'
                    + '      info.classList.remove("hidden");'
                    + '    } else { info.classList.add("hidden"); }'
                    + '  }'
                    + '}'
                    + 'if (searchEl) searchEl.addEventListener("input", filterCards);'
                    + 'if (filterEl) filterEl.addEventListener("change", filterCards);'
                    + '})();';
            } else if (section === 'analytics' || section === 'stats') {
                const totalMembers = guild.memberCount || 0;
                const textChCount = (guildTextChannels || []).length;
                const voiceChCount = (guildVoiceChannels || []).length;
                const rolesCount = (guildRoles || []).length;
                const suggestionsCount = (guildSuggestionsList || []).length;

                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <!-- Header -->
                        <div class="bg-gradient-to-r from-[#0a1430] via-[#0b1322] to-[#0a1430] border border-blue-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
                            <div class="flex items-center gap-2">
                                <a href="/dashboard/${guildId}/stat-channels" class="px-4 py-2 bg-gradient-to-l from-purple-600 to-blue-500 hover:bg-gradient-to-l from-purple-600 to-blue-500 text-white rounded-xl text-xs font-bold transition shadow">
                                    إدارة قنوات العدادات 📡
                                </a>
                            </div>
                            <div class="text-right">
                                <h4 class="font-black text-white text-xl flex items-center gap-2 justify-end"><span>لوحة الإحصائيات والتحليلات المتقدمة</span><span>📊</span></h4>
                                <p class="text-white text-xs mt-0.5">تحليل شامل لحركة السيرفر ونموه وتوزيع الأعضاء والقنوات</p>
                            </div>
                        </div>

                        <!-- Top Metric Cards -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div class="bg-[#0b1322] border border-blue-500/20 hover:border-blue-500/20 p-5 rounded-3xl text-center space-y-1 shadow-xl transition">
                                <div class="w-10 h-10 rounded-2xl bg-blue-400/20 text-blue-400 flex items-center justify-center text-lg mx-auto mb-2">👥</div>
                                <span class="text-3xl font-black text-white font-mono">${totalMembers}</span>
                                <span class="text-xs font-bold text-white block">إجمالي الأعضاء</span>
                            </div>
                            <div class="bg-[#0b1322] border border-blue-500/20 hover:border-blue-500/20 p-5 rounded-3xl text-center space-y-1 shadow-xl transition">
                                <div class="w-10 h-10 rounded-2xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center text-lg mx-auto mb-2">💬</div>
                                <span class="text-3xl font-black text-emerald-400 font-mono">${textChCount}</span>
                                <span class="text-xs font-bold text-white block">القنوات النصية</span>
                            </div>
                            <div class="bg-[#0b1322] border border-blue-500/20 hover:border-blue-500/20 p-5 rounded-3xl text-center space-y-1 shadow-xl transition">
                                <div class="w-10 h-10 rounded-2xl bg-blue-400/20 text-blue-400 flex items-center justify-center text-lg mx-auto mb-2">🔊</div>
                                <span class="text-3xl font-black text-blue-400 font-mono">${voiceChCount}</span>
                                <span class="text-xs font-bold text-white block">القنوات الصوتية</span>
                            </div>
                            <div class="bg-[#0b1322] border border-blue-500/20 hover:border-blue-500/20 p-5 rounded-3xl text-center space-y-1 shadow-xl transition">
                                <div class="w-10 h-10 rounded-2xl bg-amber-600/20 text-amber-400 flex items-center justify-center text-lg mx-auto mb-2">🎖️</div>
                                <span class="text-3xl font-black text-amber-400 font-mono">${rolesCount}</span>
                                <span class="text-xs font-bold text-white block">الرتب المسجلة</span>
                            </div>
                        </div>

                        <!-- Server Health and Activity Indicators -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl space-y-4 shadow-xl">
                                <h4 class="text-sm font-black text-white border-b border-blue-500/20 pb-3 flex items-center gap-2 justify-end">
                                    <span>مؤشرات تفاعل السيرفر</span>
                                    <span>⚡</span>
                                </h4>
                                <div class="space-y-3">
                                    <div>
                                        <div class="flex items-center justify-between text-xs mb-1">
                                            <span class="text-blue-400 font-bold">${suggestionsCount} اقتراح</span>
                                            <span class="text-gray-300 font-bold">الاقتراحات والشكاوى</span>
                                        </div>
                                        <div class="w-full bg-[#070d1d] h-2 rounded-full overflow-hidden">
                                            <div class="bg-gradient-to-l from-purple-600 to-blue-500 h-full rounded-full" style="width: ${Math.min(100, (suggestionsCount / 20) * 100)}%"></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div class="flex items-center justify-between text-xs mb-1">
                                            <span class="text-emerald-400 font-bold">${textChCount + voiceChCount} قناة</span>
                                            <span class="text-gray-300 font-bold">إجمالي قنوات السيرفر</span>
                                        </div>
                                        <div class="w-full bg-[#070d1d] h-2 rounded-full overflow-hidden">
                                            <div class="bg-emerald-500 h-full rounded-full" style="width: ${Math.min(100, ((textChCount + voiceChCount) / 50) * 100)}%"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl space-y-4 shadow-xl">
                                <h4 class="text-sm font-black text-white border-b border-blue-500/20 pb-3 flex items-center gap-2 justify-end">
                                    <span>الربط السريع للعدادات</span>
                                    <span>📡</span>
                                </h4>
                                <p class="text-xs text-white leading-relaxed">
                                    يمكنك الآن تفعيل **9 أنواع مختلفة** من قنوات الإحصائيات (أعضاء، بشر، بوتات، متصلين، صوتية، رتب...) تتحدث تلقائياً كل 10 دقائق من قسم قنوات الإحصائيات.
                                </p>
                                <a href="/dashboard/${guildId}/stat-channels" class="block text-center py-2.5 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg">
                                    فتح مدير قنوات الإحصائيات (9 أنواع) 🚀
                                </a>
                            </div>
                        </div>
                    </div>`;
            } else if (section === 'stat-channels') {
                // Load current stat channels for this guild
                let statChannelsRows = [];
                try {
                    rawDb.exec(`CREATE TABLE IF NOT EXISTS stat_channels (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        guild_id TEXT NOT NULL,
                        channel_id TEXT NOT NULL,
                        stat_type TEXT NOT NULL,
                        custom_prefix TEXT DEFAULT '',
                        enabled INTEGER DEFAULT 1,
                        UNIQUE(guild_id, channel_id)
                    )`);
                    statChannelsRows = rawDb.prepare('SELECT * FROM stat_channels WHERE guild_id = ?').all(guildId);
                } catch(e) {}

                const STAT_TYPES_DEF = {
                    total_members:  { label: 'إجمالي الأعضاء', icon: '👥', desc: 'عدد جميع الأعضاء في السيرفر' },
                    humans:         { label: 'البشر', icon: '👤', desc: 'عدد الأعضاء البشريين فقط' },
                    bots:           { label: 'البوتات', icon: '🤖', desc: 'عدد البوتات في السيرفر' },
                    online:         { label: 'الأعضاء الأونلاين', icon: '🟢', desc: 'عدد الأعضاء المتصلين حالياً' },
                    voice:          { label: 'المتصلين صوتياً', icon: '🎙️', desc: 'عدد الأعضاء في القنوات الصوتية' },
                    text_channels:  { label: 'القنوات النصية', icon: '#️⃣', desc: 'عدد القنوات النصية' },
                    voice_channels: { label: 'القنوات الصوتية', icon: '🔊', desc: 'عدد القنوات الصوتية' },
                    total_channels: { label: 'عدد القنوات الكلي', icon: '📂', desc: 'إجمالي عدد جميع القنوات' },
                    roles:          { label: 'الرتب الكلية', icon: '🏷️', desc: 'عدد الرتب في السيرفر' },
                    boosts:         { label: 'عدد البوستات', icon: '💎', desc: 'إجمالي عدد بوستات السيرفر الفعلية' },
                    boost_level:    { label: 'مستوى البوست', icon: '🚀', desc: 'مستوى تعزيز السيرفر الحالي (Tier)' },
                };

                const configuredMap = {};
                for (const row of statChannelsRows) {
                    configuredMap[row.stat_type] = row;
                }

                const statRowsHtml = Object.entries(STAT_TYPES_DEF).map(([type, def]) => {
                    const configured = configuredMap[type];
                    const hasChannel = !!configured;
                    return `
                    <div class="bg-[#0b1322] border ${hasChannel ? 'border-blue-500/20' : 'border-blue-500/20'} rounded-2xl p-4 flex items-center justify-between gap-4 hover:border-blue-500/20 transition" id="stat-row-${type}">
                        <div class="flex items-center gap-3">
                            ${hasChannel ? `
                            <form method="POST" action="/api/guild/${guildId}/stat-channels/${configured.id}/delete" class="inline">
                                <button type="submit" class="px-3 py-2 bg-rose-900/40 hover:bg-rose-700/50 text-rose-300 rounded-xl text-xs font-bold border border-rose-800/30 transition" title="حذف هذه القناة">🗑️</button>
                            </form>
                            ` : `
                            <button onclick="openAddStatChannel('${type}', '${def.label}')" class="px-4 py-2 bg-gradient-to-l from-purple-600 to-blue-500 hover:bg-gradient-to-l from-purple-600 to-blue-500 text-white rounded-xl text-xs font-bold shadow transition">إنشاء</button>
                            `}
                        </div>
                        <div class="flex-1 text-right">
                            <div class="flex items-center justify-end gap-2">
                                <span class="text-sm font-black text-white">${def.label}</span>
                                <div class="w-8 h-8 rounded-xl bg-blue-400/20 border border-blue-500/20 text-base flex items-center justify-center">${def.icon}</div>
                            </div>
                            <p class="text-[11px] text-white mt-0.5">${def.desc}</p>
                            ${hasChannel ? `<p class="text-[10px] text-blue-400 font-mono mt-1">📡 مربوطة بـ: <code class="bg-blue-800/40 px-1.5 py-0.5 rounded">${configured.channel_id}</code></p>` : ''}
                        </div>
                    </div>
                    `;
                }).join('');

formFieldsHtml = `<div class="space-y-6 text-right" dir="rtl">

    <!-- Header -->
    <div class="bg-gradient-to-r from-[#0a1430] via-[#0b1322] to-[#0a1430] border border-blue-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
        <div class="flex items-center gap-3">
            <div class="text-left">
                <div class="text-xs text-blue-400 font-bold font-mono">يتحدث كل 10 دقائق</div>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-blue-400/20 text-blue-400 border border-blue-500/20 flex items-center justify-center text-2xl shadow-lg">📈</div>
        </div>
        <div class="text-right">
            <h3 class="font-black text-white text-xl">قنوات الإحصائيات</h3>
            <p class="text-white text-xs mt-0.5">اعرض إحصائيات سيرفرك في قنوات صوتية مقفلة في الشريط الجانبي.</p>
            <p class="text-gray-500 text-[10px] mt-0.5">⚠️ تأكد أن البوت لديه صلاحية إدارة القنوات (Manage Channels)</p>
        </div>
    </div>

    <!-- Stats Counter -->
    <div class="grid grid-cols-3 gap-3">
        <div class="bg-[#0b1322] border border-blue-500/20 p-4 rounded-2xl text-center">
            <div class="text-2xl font-black text-white">${statChannelsRows.length}</div>
            <div class="text-xs text-white font-bold mt-1">قناة مُفعّلة</div>
        </div>
        <div class="bg-[#0b1322] border border-blue-500/20 p-4 rounded-2xl text-center">
            <div class="text-2xl font-black text-blue-400">${Object.keys(STAT_TYPES_DEF).length}</div>
            <div class="text-xs text-white font-bold mt-1">نوع متاح</div>
        </div>
        <div class="bg-[#0b1322] border border-blue-500/20 p-4 rounded-2xl text-center">
            <div class="text-2xl font-black text-emerald-400">10</div>
            <div class="text-xs text-white font-bold mt-1">دقيقة للتحديث</div>
        </div>
    </div>

    <!-- Stat Channels List -->
    <div class="bg-[#0b1322] border border-blue-500/20 rounded-3xl p-6 shadow-xl space-y-3">
        <div class="flex items-center justify-between pb-3 border-b border-blue-500/20">
            <span class="text-xs text-blue-400 font-bold">${statChannelsRows.length}/9 قنوات</span>
            <h4 class="text-sm font-black text-white">العدادات الأساسية</h4>
        </div>
        ${statRowsHtml}
    </div>

    <!-- Add Modal -->
    <div id="addStatChannelModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div class="bg-[#080e1c] border border-blue-500/20 rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl space-y-5">
            <div class="text-center">
                <h3 class="text-lg font-black text-white" id="addStatModalTitle">إنشاء قناة إحصائية</h3>
                <p class="text-white text-xs mt-1">سيقوم البوت بتحديث اسم هذه القناة تلقائياً كل 10 دقائق</p>
            </div>
            <form id="addStatChannelForm" class="space-y-4 text-right">
                <input type="hidden" id="addStatType" name="stat_type">
                <div>
                    <label class="text-xs font-bold text-gray-300 block mb-1.5">أيدي (ID) القناة الصوتية</label>
                    <input type="text" name="channel_id" id="addStatChannelId" placeholder="مثال: 123456789012345678" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-3 text-xs text-white outline-none font-mono text-right" required>
                    <p class="text-[10px] text-gray-500 mt-1">انسخ ID القناة الصوتية من ديسكورد (كليك يمين → نسخ المعرف)</p>
                </div>
                <div>
                    <label class="text-xs font-bold text-gray-300 block mb-1.5">نص مخصص للبادئة (اختياري)</label>
                    <input type="text" name="custom_prefix" id="addStatPrefix" placeholder="مثال: 👥 الأعضاء" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">
                    <p class="text-[10px] text-gray-500 mt-1">إذا تركته فارغاً سيستخدم البوت النص الافتراضي</p>
                </div>
                <div class="flex gap-3 pt-2">
                    <button type="button" onclick="closeAddStatChannel()" class="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-xs font-bold transition">إلغاء</button>
                    <button type="submit" class="flex-1 py-2.5 bg-gradient-to-l from-purple-600 to-blue-500 hover:bg-gradient-to-l from-purple-600 to-blue-500 text-white rounded-xl text-xs font-bold shadow transition">حفظ وإنشاء</button>
                </div>
            </form>
        </div>
    </div>

    <script>
    function openAddStatChannel(type, label) {
        document.getElementById('addStatType').value = type;
        document.getElementById('addStatModalTitle').textContent = 'إنشاء قناة: ' + label;
        document.getElementById('addStatChannelModal').classList.remove('hidden');
    }
    function closeAddStatChannel() {
        document.getElementById('addStatChannelModal').classList.add('hidden');
    }
    document.getElementById('addStatChannelForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const data = {
            stat_type: document.getElementById('addStatType').value,
            channel_id: document.getElementById('addStatChannelId').value.trim(),
            custom_prefix: document.getElementById('addStatPrefix').value.trim()
        };
        if (!data.channel_id) return alert('أدخل أيدي القناة أولاً');
        try {
            const res = await fetch('/api/guild/${guildId}/stat-channels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const json = await res.json();
            if (json.success) {
                alert('✅ تم إضافة قناة الإحصائيات! سيتم تحديثها خلال دقائق.');
                location.reload();
            } else {
                alert('❌ ' + (json.error || 'حدث خطأ'));
            }
        } catch(err) {
            alert('❌ خطأ في الاتصال');
        }
    });
    </script>

</div>`;
            } else if (section === 'appearance') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">
                        
                        <!-- Header Banner -->
                        <div class="bg-gradient-to-r from-[#0d1729] via-[#14233c] to-[#0d1729] border border-blue-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-2xl bg-blue-400/20 text-blue-400 border border-blue-500/20 flex items-center justify-center text-xl shadow-lg">⭐</div>
                                <div class="text-right">
                                    <h3 class="font-black text-white text-lg">تخصيص البوت</h3>
                                    <p class="text-white text-xs mt-0.5">غير اسم البوت وصورته وبنره لكل سيرفر</p>
                                </div>
                            </div>
                            <!-- Server selector pill (Exact to image) -->
                            <div class="bg-[#070d1d] border border-blue-500/20 px-4 py-2 rounded-2xl flex items-center gap-2.5 shadow-inner">
                                <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                                <span class="text-xs font-bold text-white">${guild.name || "Droplet'BOT"}</span>
                                <div class="w-6 h-6 rounded-lg bg-blue-800/60 text-white text-xs font-black flex items-center justify-center border border-blue-500/20">Z</div>
                            </div>
                        </div>

                        <!-- Live Preview Card (Exact to Image 1 & 2) -->
                        <div class="bg-[#0b1322] border border-blue-500/20 rounded-3xl overflow-hidden shadow-2xl">
                            <!-- Banner area -->
                            <div id="prevBannerBox" class="h-32 bg-cover bg-center relative transition-all flex items-center justify-center" style="background-image: url('${settings.bot_banner || ''}'); background-color: #14233c;">
                                ${!settings.bot_banner ? `
                                    <div class="text-center">
                                        <h2 class="text-2xl font-black text-amber-100 tracking-wider shadow-sm">Best System Bot</h2>
                                        <p class="text-xs text-amber-200/80 font-mono mt-0.5">discord.gg/droplet</p>
                                    </div>
                                ` : ''}
                                <!-- Avatar Overlap -->
                                <div class="absolute -bottom-6 right-8 flex items-center gap-3">
                                    <div class="relative group">
                                        <img id="prevAvatarImg" src="${settings.bot_avatar || (botGuild?.members?.me?.user?.displayAvatarURL() || userAvatar)}" class="w-16 h-16 rounded-2xl bg-[#070d1d] object-cover ring-4 ring-[#0b1322] shadow-xl">
                                        <span class="w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-[#0b1322] absolute -bottom-0.5 -right-0.5"></span>
                                    </div>
                                </div>
                            </div>
                            <div class="pt-8 pb-5 px-8 flex items-center justify-between">
                                <div class="text-left">
                                    <span class="text-[10px] text-gray-500 font-mono">ID: ${client?.user?.id || 'BOT_ID'}</span>
                                </div>
                                <div class="text-right">
                                    <h4 id="prevNickText" class="font-black text-white text-base">${settings.bot_nickname || client?.user?.username || 'Droplet'}</h4>
                                    <span class="text-[11px] text-white font-mono">@${client?.user?.username || 'droplet'}</span>
                                </div>
                            </div>
                        </div>

                        <!-- 1. اسم البوت في السيرفر (Bot Nickname) -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl space-y-3 shadow-xl">
                            <div class="flex items-center justify-between">
                                <div class="w-8 h-8 rounded-xl bg-blue-400/20 text-blue-400 flex items-center justify-center text-sm border border-blue-500/20">✏️</div>
                                <div class="text-right">
                                    <h4 class="font-black text-white text-sm">اسم البوت في السيرفر</h4>
                                    <p class="text-white text-xs mt-0.5">تغيير اسم البوت المعروض في هذا السيرفر فقط</p>
                                </div>
                            </div>
                            <input type="text" name="bot_nickname" id="inpBotNick" value="${settings.bot_nickname || ''}" placeholder="${client?.user?.username || 'Droplet'}" oninput="document.getElementById('prevNickText').innerText = this.value || '${client?.user?.username || 'Droplet'}'" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-2xl px-5 py-3.5 text-xs text-white outline-none text-right font-bold transition">
                        </div>

                        <!-- 2. وصف البوت في السيرفر (About Me) -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl space-y-3 shadow-xl">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <span id="aboutCount" class="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-lg">${(settings.bot_about || '').length}/190</span>
                                    <div class="w-8 h-8 rounded-xl bg-blue-400/20 text-blue-400 flex items-center justify-center text-sm border border-blue-500/20">💬</div>
                                </div>
                                <div class="text-right">
                                    <h4 class="font-black text-white text-sm">وصف البوت في السيرفر</h4>
                                    <p class="text-white text-xs mt-0.5">تغيير وصف البوت (About Me) المعروض في هذا السيرفر فقط</p>
                                </div>
                            </div>
                            <textarea name="bot_about" id="inpBotAbout" rows="3" maxlength="190" placeholder="اكتب وصفاً للبوت في هذا السيرفر..." oninput="document.getElementById('aboutCount').innerText = this.value.length + '/190'" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-2xl px-5 py-3.5 text-xs text-white outline-none text-right leading-relaxed transition">${settings.bot_about || ''}</textarea>
                        </div>

                        <!-- 3. صورة وبنر البوت في السيرفر (Avatar & Banner 2-Grid) -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            
                            <!-- صورة البوت في السيرفر -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl space-y-4 shadow-xl text-right">
                                <div class="flex items-center justify-between">
                                    <div class="w-8 h-8 rounded-xl bg-rose-600/20 text-rose-400 flex items-center justify-center text-sm border border-rose-500/30">🎯</div>
                                    <div>
                                        <h4 class="font-black text-white text-sm">صورة البوت في السيرفر</h4>
                                        <p class="text-white text-[11px] mt-0.5">تغيير صورة البوت المعروضة في هذا السيرفر فقط (Per-Server Avatar)</p>
                                    </div>
                                </div>

                                <div class="flex items-center justify-between p-4 bg-[#08060e] border border-[#7c3aed]/20 rounded-2xl">
                                    <label class="cursor-pointer px-4 py-2 bg-gradient-to-r from-[#7c3aed] to-[#2563eb] hover:from-[#8b5cf6] hover:to-[#3b82f6] text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5">
                                        <span>🖼️</span>
                                        <span id="btn_text_bot_avatar">اختر صورة</span>
                                        <input type="file" id="file_bot_avatar" accept="image/*" class="hidden" onchange="uploadImageFile(this, 'bot_avatar', function(url){ updateAvatarPreview(url); })">
                                    </label>
                                    <div class="flex items-center gap-3">
                                        <span class="text-[11px] text-white">اختر صورة مباشرة من جهازك</span>
                                        <img id="cardAvatarPreview" src="${settings.bot_avatar || (botGuild?.members?.me?.user?.displayAvatarURL() || userAvatar)}" class="w-10 h-10 rounded-xl object-cover ring-2 ring-blue-400/50">
                                    </div>
                                </div>
                                <input type="hidden" name="bot_avatar" id="input_bot_avatar" value="${settings.bot_avatar || ''}">
                            </div>

                            <!-- بنر البوت في السيرفر -->
                            <div class="bg-[#0c0916] border border-[#7c3aed]/20 p-6 rounded-3xl space-y-4 shadow-xl text-right">
                                <div class="flex items-center justify-between">
                                    <div class="w-8 h-8 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center text-sm border border-amber-500/30">🖼️</div>
                                    <div>
                                        <h4 class="font-black text-white text-sm">بنر البوت في السيرفر</h4>
                                        <p class="text-white text-[11px] mt-0.5">تغيير بنر البوت المعروض في هذا السيرفر فقط (Per-Server Banner)</p>
                                    </div>
                                </div>

                                <div class="flex items-center justify-between p-4 bg-[#08060e] border border-[#7c3aed]/20 rounded-2xl">
                                    <label class="cursor-pointer px-4 py-2 bg-gradient-to-r from-[#7c3aed] to-[#2563eb] hover:from-[#8b5cf6] hover:to-[#3b82f6] text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5">
                                        <span>🖼️</span>
                                        <span id="btn_text_bot_banner">اختر بنر</span>
                                        <input type="file" id="file_bot_banner" accept="image/*" class="hidden" onchange="uploadImageFile(this, 'bot_banner', function(url){ updateBannerPreview(url); })">
                                    </label>
                                    <span class="text-[11px] text-white">اختر صورة بنر مباشرة من جهازك</span>
                                </div>
                                <input type="hidden" name="bot_banner" id="input_bot_banner" value="${settings.bot_banner || ''}">
                            </div>

                        </div>

                        <!-- Important Notes Alert (Exact to Image 2) -->
                        <div class="bg-[#0c0916] border border-[#7c3aed]/20 p-5 rounded-3xl space-y-2 text-right shadow-lg">
                            <div class="flex items-center justify-end gap-2 text-amber-400 font-bold text-xs">
                                <span>ملاحظات مهمة</span>
                                <span>💬</span>
                            </div>
                            <ul class="text-[11px] text-white space-y-1 pr-2 list-none">
                                <li>• تغيير الاسم والصورة والبنر يؤثر فقط على السيرفر المحدد.</li>
                                <li>• قد يستغرق ظهور التغييرات بضع ثوانٍ في ديسكورد فور الضغط على حفظ.</li>
                                <li>• يدعم رفع صيغ PNG أو JPG أو WEBP أو GIF مباشرة من جهازك.</li>
                            </ul>
                        </div>

                    </div>

                    <script>
                    function updateAvatarPreview(url) {
                        if (url) {
                            document.getElementById('prevAvatarImg').src = url;
                            document.getElementById('cardAvatarPreview').src = url;
                        }
                    }
                    function updateBannerPreview(url) {
                        const box = document.getElementById('prevBannerBox');
                        if (url) {
                            box.style.backgroundImage = 'url(' + url + ')';
                        }
                    }
                    </script>`;
            } else if (section === 'settings') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">
                        
                        <!-- Top Header Title -->
                        <div class="bg-gradient-to-r from-[#0d1729] via-[#14233c] to-[#0d1729] border border-blue-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-2xl bg-blue-400/20 text-blue-400 border border-blue-500/20 flex items-center justify-center text-xl shadow-lg">⚙️</div>
                                <div class="text-right">
                                    <h3 class="font-black text-white text-lg">الإعدادات العامة</h3>
                                    <p class="text-white text-xs mt-0.5">إعدادات البوت لسيرفر ${guild.name || "Droplet'BOT"}</p>
                                </div>
                            </div>
                            <div class="bg-[#070d1d] border border-blue-500/20 px-4 py-2 rounded-2xl flex items-center gap-2.5 shadow-inner">
                                <span class="w-2 h-2 rounded-full bg-gradient-to-l from-purple-600 to-blue-500 animate-pulse"></span>
                                <span class="text-xs font-bold text-white">${guild.name || "Droplet'BOT"}</span>
                                <div class="w-6 h-6 rounded-lg bg-blue-800/60 text-white text-xs font-black flex items-center justify-center border border-blue-500/20">Z</div>
                            </div>
                        </div>

                        <!-- Top 2-Grid: البادئة (Prefix) & لغة البوت (Bot Language) - Exact to Image -->
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            
                            <!-- 1. البادئة (Prefix) Card -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl flex flex-col justify-between shadow-xl">
                                <div>
                                    <div class="flex items-center justify-between mb-4">
                                        <span class="text-[10px] text-gray-500">Command Prefix</span>
                                        <h4 class="font-black text-white text-sm">البادئة (Prefix)</h4>
                                    </div>
                                    <input type="text" name="prefix" id="inpPrefix" value="${settings.prefix || '!'}" placeholder="!" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-2xl px-6 py-4 text-center text-xl text-white font-mono font-black outline-none shadow-inner transition">
                                </div>
                                <p class="text-[11px] text-gray-500 text-right mt-4">الرمز المستخدم قبل الأوامر النصية</p>
                            </div>

                            <!-- 2. لغة البوت (Bot Language) Card with Flag Grid - Exact to Image -->
                            <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl shadow-xl space-y-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-[10px] text-blue-400 font-bold bg-blue-800/60 px-2 py-0.5 rounded-lg font-mono">LANG</span>
                                    <h4 class="font-black text-white text-sm">لغة البوت</h4>
                                </div>

                                <input type="hidden" name="bot_language" id="inpHiddenLang" value="${settings.bot_language || 'EN'}">

                                <div class="grid grid-cols-3 gap-2.5 text-center">
                                    <!-- IQ / AR -->
                                    <button type="button" onclick="selectBotLanguage('AR', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${(settings.bot_language || 'EN') === 'AR' ? 'bg-blue-700/30 border-blue-400 text-white font-black shadow-lg shadow-blue-800/50' : 'bg-[#070d1d] border-blue-500/20 text-white hover:text-gray-300 hover:border-blue-500/20'}">
                                        <span class="text-xs font-black">IQ</span>
                                        <span class="text-[10px] font-bold text-white">AR</span>
                                    </button>

                                    <!-- US / EN -->
                                    <button type="button" onclick="selectBotLanguage('EN', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${(settings.bot_language || 'EN') === 'EN' ? 'bg-blue-700/30 border-blue-400 text-white font-black shadow-lg shadow-blue-800/50' : 'bg-[#070d1d] border-blue-500/20 text-white hover:text-gray-300 hover:border-blue-500/20'}">
                                        <span class="text-xs font-black">US</span>
                                        <span class="text-[10px] font-bold text-white">EN</span>
                                    </button>

                                    <!-- TR -->
                                    <button type="button" onclick="selectBotLanguage('TR', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'TR' ? 'bg-blue-700/30 border-blue-400 text-white font-black shadow-lg shadow-blue-800/50' : 'bg-[#070d1d] border-blue-500/20 text-white hover:text-gray-300 hover:border-blue-500/20'}">
                                        <span class="text-xs font-black">TR</span>
                                        <span class="text-[10px] font-bold text-white">TR</span>
                                    </button>

                                    <!-- RU -->
                                    <button type="button" onclick="selectBotLanguage('RU', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'RU' ? 'bg-blue-700/30 border-blue-400 text-white font-black shadow-lg shadow-blue-800/50' : 'bg-[#070d1d] border-blue-500/20 text-white hover:text-gray-300 hover:border-blue-500/20'}">
                                        <span class="text-xs font-black">RU</span>
                                        <span class="text-[10px] font-bold text-white">RU</span>
                                    </button>

                                    <!-- ES -->
                                    <button type="button" onclick="selectBotLanguage('ES', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'ES' ? 'bg-blue-700/30 border-blue-400 text-white font-black shadow-lg shadow-blue-800/50' : 'bg-[#070d1d] border-blue-500/20 text-white hover:text-gray-300 hover:border-blue-500/20'}">
                                        <span class="text-xs font-black">ES</span>
                                        <span class="text-[10px] font-bold text-white">ES</span>
                                    </button>

                                    <!-- FR -->
                                    <button type="button" onclick="selectBotLanguage('FR', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'FR' ? 'bg-blue-700/30 border-blue-400 text-white font-black shadow-lg shadow-blue-800/50' : 'bg-[#070d1d] border-blue-500/20 text-white hover:text-gray-300 hover:border-blue-500/20'}">
                                        <span class="text-xs font-black">FR</span>
                                        <span class="text-[10px] font-bold text-white">FR</span>
                                    </button>

                                    <!-- DE -->
                                    <button type="button" onclick="selectBotLanguage('DE', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'DE' ? 'bg-blue-700/30 border-blue-400 text-white font-black shadow-lg shadow-blue-800/50' : 'bg-[#070d1d] border-blue-500/20 text-white hover:text-gray-300 hover:border-blue-500/20'}">
                                        <span class="text-xs font-black">DE</span>
                                        <span class="text-[10px] font-bold text-white">DE</span>
                                    </button>

                                    <!-- BR / PT -->
                                    <button type="button" onclick="selectBotLanguage('PT', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'PT' ? 'bg-blue-700/30 border-blue-400 text-white font-black shadow-lg shadow-blue-800/50' : 'bg-[#070d1d] border-blue-500/20 text-white hover:text-gray-300 hover:border-blue-500/20'}">
                                        <span class="text-xs font-black">BR</span>
                                        <span class="text-[10px] font-bold text-white">PT</span>
                                    </button>

                                    <!-- JP / JA -->
                                    <button type="button" onclick="selectBotLanguage('JA', this)" class="lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 ${settings.bot_language === 'JA' ? 'bg-blue-700/30 border-blue-400 text-white font-black shadow-lg shadow-blue-800/50' : 'bg-[#070d1d] border-blue-500/20 text-white hover:text-gray-300 hover:border-blue-500/20'}">
                                        <span class="text-xs font-black">JP</span>
                                        <span class="text-[10px] font-bold text-white">JA</span>
                                    </button>
                                </div>
                            </div>

                        </div>

                        <!-- 3. تصفير سجلات العقوبات التلقائي (Auto-Clear Infractions) - Exact to Image -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl space-y-5 shadow-xl">
                            
                            <!-- Master Header & Switch -->
                            <div class="flex items-center justify-between border-b border-blue-500/20 pb-4">
                                <label class="toggle">
                                    <input type="checkbox" name="auto_clear_punishments" value="1" ${settings.auto_clear_punishments ? 'checked' : ''} onchange="document.getElementById('autoClearContent').classList.toggle('opacity-40', !this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <h4 class="font-black text-white text-sm">تصفير سجلات العقوبات التلقائي</h4>
                                        <p class="text-white text-xs mt-0.5">حذف دوري لسجلات العقوبات المنتهية / المزالة – العقوبات النشطة لا تتأثر إطلاقاً.</p>
                                    </div>
                                    <div class="w-8 h-8 rounded-xl bg-blue-400/20 text-blue-400 flex items-center justify-center text-sm border border-blue-500/20">⏱️</div>
                                </div>
                            </div>

                            <div id="autoClearContent" class="space-y-4 ${settings.auto_clear_punishments ? '' : 'opacity-40'} transition-opacity">
                                <!-- فترة التصفير (Clear Period Buttons) -->
                                <div>
                                    <span class="block text-xs font-bold text-white mb-2.5 text-right">فترة التصفير</span>
                                    <input type="hidden" name="auto_clear_period" id="inpClearPeriod" value="${settings.auto_clear_period || 'week'}">
                                    
                                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <button type="button" onclick="selectClearPeriod('week', this)" class="period-btn py-3 px-4 rounded-2xl border text-xs font-bold transition ${(settings.auto_clear_period || 'week') === 'week' ? 'bg-blue-700/40 border-blue-400 text-white shadow-md' : 'bg-[#070d1d] border-blue-500/20 text-white hover:text-gray-300'}">
                                            كل أسبوع
                                        </button>
                                        <button type="button" onclick="selectClearPeriod('2weeks', this)" class="period-btn py-3 px-4 rounded-2xl border text-xs font-bold transition ${settings.auto_clear_period === '2weeks' ? 'bg-blue-700/40 border-blue-400 text-white shadow-md' : 'bg-[#070d1d] border-blue-500/20 text-white hover:text-gray-300'}">
                                            كل أسبوعين
                                        </button>
                                        <button type="button" onclick="selectClearPeriod('3weeks', this)" class="period-btn py-3 px-4 rounded-2xl border text-xs font-bold transition ${settings.auto_clear_period === '3weeks' ? 'bg-blue-700/40 border-blue-400 text-white shadow-md' : 'bg-[#070d1d] border-blue-500/20 text-white hover:text-gray-300'}">
                                            كل 3 أسابيع
                                        </button>
                                        <button type="button" onclick="selectClearPeriod('month', this)" class="period-btn py-3 px-4 rounded-2xl border text-xs font-bold transition ${settings.auto_clear_period === 'month' ? 'bg-blue-700/40 border-blue-400 text-white shadow-md' : 'bg-[#070d1d] border-blue-500/20 text-white hover:text-gray-300'}">
                                            كل شهر
                                        </button>
                                    </div>
                                </div>

                                <!-- أنواع العقوبات المشمولة (Punishment Types Pills) -->
                                <div>
                                    <span class="block text-xs font-bold text-white mb-2.5 text-right">أنواع العقوبات المشمولة</span>
                                    <div class="flex flex-wrap items-center gap-2 justify-end">
                                        <span class="px-3 py-1.5 rounded-xl bg-blue-400/30 text-white border border-blue-500/20 text-xs font-bold">كل الأنواع</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#070d1d] text-white border border-blue-500/20 text-xs font-medium">حظر</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#070d1d] text-white border border-blue-500/20 text-xs font-medium">حظر مؤقت</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#070d1d] text-white border border-blue-500/20 text-xs font-medium">ميوت</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#070d1d] text-white border border-blue-500/20 text-xs font-medium">ميوت صوتي</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#070d1d] text-white border border-blue-500/20 text-xs font-medium">سجن</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#070d1d] text-white border border-blue-500/20 text-xs font-medium">تحذير</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#070d1d] text-white border border-blue-500/20 text-xs font-medium">طرد</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#070d1d] text-white border border-blue-500/20 text-xs font-medium">داون</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#070d1d] text-white border border-blue-500/20 text-xs font-medium">بلوك</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#070d1d] text-white border border-blue-500/20 text-xs font-medium">بلاك لست</span>
                                        <span class="px-3 py-1.5 rounded-xl bg-[#070d1d] text-white border border-blue-500/20 text-xs font-medium">تايم اوت</span>
                                    </div>
                                </div>
                            </div>

                        </div>

                        <!-- 4. منطقة الخطر (Danger Zone) - Exact to Image -->
                        <div class="bg-rose-950/20 border border-rose-500/30 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
                            <button type="button" onclick="confirmResetGuildData()" class="px-6 py-3 bg-gradient-to-r from-rose-700 to-red-600 hover:from-rose-600 hover:to-red-500 text-white rounded-2xl text-xs font-black transition shadow-lg flex items-center gap-2 shrink-0">
                                <span>⚠️</span>
                                <span>تصفير قاعدة بيانات السيرفر</span>
                            </button>
                            <div class="text-right space-y-1">
                                <div class="flex items-center justify-end gap-2 text-rose-400 font-black text-sm">
                                    <span>منطقة الخطر</span>
                                    <span>🚫</span>
                                </div>
                                <p class="text-[11px] text-rose-300/80 leading-relaxed">
                                    أونر السيرفر حصراً. يمسح كل بيانات البوت لهذا السيرفر نهائياً – الإعدادات، الحماية، سجل العقوبات، كل شيء (عدا التوب الكتابي/الصوتي والدعوات، تُدار منفصلة عبر أمر reset).
                                </p>
                            </div>
                        </div>

                    </div>

                    <script>
                    function selectBotLanguage(lang, btn) {
                        document.getElementById('inpHiddenLang').value = lang;
                        document.querySelectorAll('.lang-btn').forEach(b => {
                            b.className = 'lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 bg-[#070d1d] border-blue-500/20 text-blue-300 hover:text-white hover:border-blue-500/20';
                        });
                        btn.className = 'lang-btn p-3 rounded-2xl border transition flex flex-col items-center justify-center gap-0.5 bg-blue-700/30 border-blue-400 text-white font-black shadow-lg shadow-blue-800/50';
                    }

                    function selectClearPeriod(period, btn) {
                        document.getElementById('inpClearPeriod').value = period;
                        document.querySelectorAll('.period-btn').forEach(b => {
                            b.className = 'period-btn py-3 px-4 rounded-2xl border text-xs font-bold transition bg-[#070d1d] border-blue-500/20 text-blue-300 hover:text-white';
                        });
                        btn.className = 'period-btn py-3 px-4 rounded-2xl border text-xs font-bold transition bg-blue-700/40 border-blue-400 text-white shadow-md';
                    }

                    async function confirmResetGuildData() {
                        if (!confirm('⚠️ تحذير شديد الخطورة:\\nهل أنت متأكد تماماً من تصفير كافة إعدادات وسجلات وحماية هذا السيرفر؟\\nلا يمكن التراجع عن هذا الإجراء!')) return;
                        try {
                            const res = await fetch('/api/guild/${guildId}/reset-data', { method: 'POST' });
                            const d = await res.json();
                            if (d.success) {
                                alert('✅ تم تصفير بيانات وإعدادات السيرفر بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ فشل التصفير: ' + (d.error || 'حدث خطأ'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
                    }
                    </script>`;

            } else if (section === 'backup') {
formFieldsHtml = `                    <div class="space-y-6 text-right" dir="rtl">
                        <div class="bg-[#0b1322] border border-blue-500/20 p-8 rounded-3xl text-center space-y-4 shadow-xl">
                            <div class="w-16 h-16 rounded-2xl bg-rose-600/20 text-rose-400 border border-rose-500/30 flex items-center justify-center text-3xl mx-auto shadow-lg">🚫</div>
                            <h3 class="font-black text-white text-lg">تم إيقاف وحذف نظام النسخ الاحتياطية</h3>
                            <p class="text-white text-xs max-w-md mx-auto leading-relaxed">تم إزالة هذا القسم بالكامل من البوت بناءً على طلبكم. يمكنك استخدام باقي أنظمة الحماية والإشراف لإدارة سيرفرك بأمان.</p>
                            <div class="pt-2">
                                <a href="/dashboard/${guildId}/protection" class="px-5 py-2.5 bg-gradient-to-l from-purple-600 to-blue-500 hover:bg-gradient-to-l from-purple-600 to-blue-500 text-white rounded-xl text-xs font-bold transition inline-block">الانتقال إلى نظام الحماية 🛡️</a>
                            </div>
                        </div>
                    </div>

<script>
(function() {
    var guildId = '${guildId}';
    function fetchStats() {
        fetch('/api/guild/' + guildId + '/online-count')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (!data.success) return;
                var elOnline = document.getElementById('onlineMembersCount');
                if (elOnline) elOnline.textContent = (data.online || 0).toLocaleString();
                var elBots = document.getElementById('botsCount');
                if (elBots) elBots.textContent = (data.bots || 0).toLocaleString();
                var elGw = document.getElementById('giveawaysCount');
                if (elGw) elGw.textContent = (data.giveaways || 0).toLocaleString();
            })
            .catch(function() {
                var elOnline = document.getElementById('onlineMembersCount');
                if (elOnline && elOnline.textContent === '\u2026') elOnline.textContent = '0';
                var elBots = document.getElementById('botsCount');
                if (elBots && elBots.textContent === '\u2026') elBots.textContent = '0';
            });
    }
    fetchStats();
    setInterval(fetchStats, 30000);
})();
</script>
`;
            } else if (section === 'staff-activity') {
                const staffList = (() => {
                    try {
                        return rawDb.prepare(`
                            SELECT s.user_id, s.tickets_closed, s.mod_actions, s.bans_count, s.kicks_count,
                                   s.mutes_count, s.warns_count, s.messages_count, s.voice_seconds,
                                   s.shift_seconds, s.total_shifts, s.points,
                                   p.username, p.display_name, p.avatar_url,
                                   (s.tickets_closed*10 + s.warns_count*3 + s.bans_count*5 + s.kicks_count*4 + 
                                    (s.voice_seconds/60) + s.messages_count + s.points) as total_points
                            FROM staff_activity s
                            LEFT JOIN user_profiles p ON s.user_id = p.user_id
                            WHERE s.guild_id = ?
                            ORDER BY s.shift_seconds DESC, total_points DESC LIMIT 50
                        `).all(guildId);
                    } catch(e) { return []; }
                })();

                const activeShifts = (() => {
                    try {
                        return rawDb.prepare("SELECT * FROM staff_shifts WHERE guild_id = ? AND status = 'active'").all(guildId);
                    } catch(e) { return []; }
                })();

                const totalShiftSeconds = staffList.reduce((s, x) => s + (x.shift_seconds || 0), 0);
                const totalShiftHours = (totalShiftSeconds / 3600).toFixed(1);
                const totalStaffActions = staffList.reduce((s, x) => s + (x.mod_actions || 0), 0);
                const totalStaffTickets = staffList.reduce((s, x) => s + (x.tickets_closed || 0), 0);
                const topPoints = staffList.reduce((m, x) => Math.max(m, x.points || 0), 0);

                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <!-- Header Banner -->
                        <div class="bg-gradient-to-r from-[#0a1430] via-[#0b1322] to-[#0a1430] border border-blue-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl flex-wrap gap-3">
                            <div class="flex items-center gap-2">
                                <button type="button" onclick="sendStaffPanelDirect()" class="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-emerald-950/40 flex items-center gap-1.5 cursor-pointer">
                                    <span>🚀 إرسال لوحة الحضور (Login/Logout)</span>
                                </button>
                                <button type="button" onclick="resetAllStaffStats()" class="px-4 py-2 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 rounded-xl text-xs font-bold transition cursor-pointer">
                                    🔄 تصفير الإحصائيات
                                </button>
                                <button type="button" onclick="location.reload()" class="px-4 py-2 bg-blue-400/20 hover:bg-blue-400/30 border border-blue-500/20 text-white rounded-xl text-xs font-bold transition cursor-pointer">
                                    ↻ تحديث
                                </button>
                            </div>
                            <div class="text-right">
                                <h4 class="font-black text-white text-xl flex items-center gap-2 justify-end"><span>نظام وإحصائيات طاقم الإدارة</span><span>👮</span></h4>
                                <p class="text-white text-xs mt-0.5">متابعة دقيقة لساعات العمل والشفتات، تسجيل الحضور والانصراف، تقييم الأداء، وتوزيع النقاط</p>
                            </div>
                        </div>

                        <!-- Shift Control & Settings Form Card -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-3xl space-y-4 shadow-xl">
                            <div class="flex items-center justify-between pb-3 border-b border-blue-500/20">
                                <span class="text-xs text-blue-400 font-bold">إعدادات الحضور والانصراف</span>
                                <h4 class="text-sm font-black text-white flex items-center gap-2"><span>ضبط قنوات ورتبة الإدارة</span><span>⚙️</span></h4>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-1">رتبة الإدارة المخولة بالتسجيل <span class="text-white font-normal">(اختياري - متاح لكل الإدارة تلقائياً)</span></label>
                                    <select name="staff_role" id="staff_role" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-3 text-xs text-white outline-none text-right cursor-pointer">
                                        <option value="">👑 جميع أفراد الإدارة والمشرفين (تلقائي)</option>
                                        ${guildRoles.map(r => `<option value="${r.id}" ${String(settings.staff_role) === String(r.id) ? 'selected' : ''}>@ ${r.name}</option>`).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-1">قناة لوحة تسجيل الحضور والانصراف</label>
                                    ${renderChannelSelect('staff_login_channel', settings.staff_login_channel)}
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-1">قناة إرسال سجلات الحضور (Logs)</label>
                                    ${renderChannelSelect('staff_log_channel', settings.staff_log_channel)}
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-1">الحد الأقصى للتواجد المتواصل (بالساعات)</label>
                                    <select name="staff_max_shift_hours" id="staff_max_shift_hours" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right cursor-pointer">
                                        <option value="1" ${Number(settings.staff_max_shift_hours) === 1 ? 'selected' : ''}>ساعة واحدة</option>
                                        <option value="2" ${Number(settings.staff_max_shift_hours) === 2 ? 'selected' : ''}>ساعتان</option>
                                        <option value="4" ${Number(settings.staff_max_shift_hours) === 4 ? 'selected' : ''}>4 ساعات</option>
                                        <option value="6" ${Number(settings.staff_max_shift_hours) === 6 ? 'selected' : ''}>6 ساعات</option>
                                        <option value="8" ${!settings.staff_max_shift_hours || Number(settings.staff_max_shift_hours) === 8 ? 'selected' : ''}>8 ساعات (افتراضي)</option>
                                        <option value="12" ${Number(settings.staff_max_shift_hours) === 12 ? 'selected' : ''}>12 ساعة</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-1">مهلة عدم التفاعل (شات/تذاكر)</label>
                                    <select name="staff_inactivity_minutes" id="staff_inactivity_minutes" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right cursor-pointer">
                                        <option value="15" ${Number(settings.staff_inactivity_minutes) === 15 ? 'selected' : ''}>15 دقيقة</option>
                                        <option value="30" ${!settings.staff_inactivity_minutes || Number(settings.staff_inactivity_minutes) === 30 ? 'selected' : ''}>30 دقيقة (مستحسن)</option>
                                        <option value="45" ${Number(settings.staff_inactivity_minutes) === 45 ? 'selected' : ''}>45 دقيقة</option>
                                        <option value="60" ${Number(settings.staff_inactivity_minutes) === 60 ? 'selected' : ''}>60 دقيقة (ساعة)</option>
                                        <option value="0" ${Number(settings.staff_inactivity_minutes) === 0 ? 'selected' : ''}>معطل (حسب الحد الأقصى فقط)</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-300 mb-1">رابط بانر لوحة الحضور (اختياري)</label>
                                    <input type="text" name="staff_banner_url" id="staff_banner_url" value="${settings.staff_banner_url || ''}" placeholder="https://..." class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-left font-mono">
                                </div>
                            </div>

                            <div class="pt-2">
                                <div class="flex items-center justify-between bg-[#070d1d] border border-blue-500/20 p-4 rounded-2xl">
                                    <div class="text-right">
                                        <h5 class="text-xs font-bold text-white flex items-center gap-2">
                                            <span>⚡ تسجيل الخروج التلقائي (Auto Logout)</span>
                                        </h5>
                                        <p class="text-[11px] text-white mt-0.5">يسجل خروج الإداري تلقائياً عند الخمول (AFK) أو انعدام التفاعل في الشات واستلام التذاكر أو انتهاء الحد الأقصى للمدة</p>
                                    </div>
                                    <label class="toggle flex-shrink-0 mr-4">
                                        <input type="checkbox" name="staff_auto_logout" value="1" ${settings.staff_auto_logout !== 0 ? 'checked' : ''} onchange="saveProtectionSetting('staff_auto_logout', this.checked)">
                                        <span class="slider"></span>
                                    </label>
                                </div>
                            </div>

                            <div class="flex justify-end pt-2">
                                <button type="button" onclick="saveStaffSettingsQuick()" class="px-6 py-2.5 bg-gradient-to-l from-purple-600 to-blue-500 hover:bg-gradient-to-l from-purple-600 to-blue-500 text-white rounded-xl text-xs font-black transition shadow-lg">
                                    حفظ إعدادات الإدارة 💾
                                </button>
                            </div>
                        </div>

                        <!-- Active Shifts Live Alert Card -->
                        ${activeShifts.length > 0 ? `
                        <div class="bg-gradient-to-r from-emerald-950/40 via-[#0b1322] to-emerald-950/40 border border-emerald-500/30 p-4 rounded-3xl flex items-center justify-between shadow-xl flex-wrap gap-3">
                            <div class="flex items-center gap-2 flex-wrap">
                                ${activeShifts.map(s => {
                                    const mObj = botGuild?.members?.cache?.get(s.user_id);
                                    const dName = mObj ? mObj.user.tag : s.user_id;
                                    return `<span class="px-2.5 py-1 bg-emerald-900/50 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-1">🟢 ${dName} (<t:${s.start_time}:R>)</span>`;
                                }).join('')}
                            </div>
                            <div class="text-right flex items-center gap-2">
                                <div>
                                    <h5 class="text-xs font-black text-emerald-400">في الخدمة حالياً (${activeShifts.length} إداري)</h5>
                                    <p class="text-[10px] text-white">إداريون مسجلون دخول ويستقبلون التذاكر وخدمة الأعضاء الآن</p>
                                </div>
                                <span class="w-3 h-3 rounded-full bg-emerald-400 animate-ping"></span>
                            </div>
                        </div>
                        ` : ''}

                        <!-- Stats Overview Cards -->
                        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-right">
                                <div class="text-2xl font-black text-blue-400">${staffList.length}</div>
                                <div class="text-xs text-white font-bold mt-1">إداريين مسجلين</div>
                            </div>
                            <div class="bg-[#0b1322] border border-emerald-500/20 p-5 rounded-2xl text-right">
                                <div class="text-2xl font-black text-emerald-400">${totalShiftHours} ساعة</div>
                                <div class="text-xs text-white font-bold mt-1">إجمالي ساعات تواجد الإداري</div>
                            </div>
                            <div class="bg-[#0b1322] border border-amber-500/20 p-5 rounded-2xl text-right">
                                <div class="text-2xl font-black text-amber-400">${totalStaffActions}</div>
                                <div class="text-xs text-white font-bold mt-1">إجراءات إدارية</div>
                            </div>
                            <div class="bg-[#0b1322] border border-cyan-500/20 p-5 rounded-2xl text-right">
                                <div class="text-2xl font-black text-cyan-400">${totalStaffTickets}</div>
                                <div class="text-xs text-white font-bold mt-1">تذاكر مغلقة</div>
                            </div>
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl text-right">
                                <div class="text-2xl font-black text-blue-400">${topPoints}</div>
                                <div class="text-xs text-white font-bold mt-1">أعلى نقاط بونص</div>
                            </div>
                        </div>

                        <!-- Staff Leaderboard Table -->
                        <div class="bg-[#0b1322] border border-blue-500/20 rounded-3xl p-6 shadow-xl space-y-4">
                            <div class="flex items-center justify-between pb-3 border-b border-blue-500/20">
                                <span class="text-xs text-blue-400 font-bold">${staffList.length} إداري مسجل</span>
                                <h4 class="text-sm font-black text-white flex items-center gap-2"><span>لوحة صدارة وتواجد المشرفين</span><span>🏆</span></h4>
                            </div>

                            ${staffList.length === 0 ? `
                                <div class="py-12 text-center space-y-3">
                                    <div class="text-5xl">👮</div>
                                    <p class="text-white text-sm font-bold">لا يوجد نشاط مسجل للمشرفين حتى الآن</p>
                                    <p class="text-gray-500 text-xs">أرسل لوحة الحضور عبر الزر بالأعلى وسيبدأ حساب الساعات فور تسجيل الإداريين</p>
                                </div>
                            ` : `
                                <div class="overflow-x-auto">
                                    <table class="w-full text-right text-xs min-w-[750px]">
                                        <thead>
                                            <tr class="text-gray-500 border-b border-blue-500/20">
                                                <th class="pb-3 pr-3 font-bold">#</th>
                                                <th class="pb-3 font-bold" data-i18n="المشرف">المشرف</th>
                                                <th class="pb-3 text-center font-bold text-emerald-400" data-i18n="⏱️ ساعات التواجد">⏱️ ساعات التواجد</th>
                                                <th class="pb-3 text-center font-bold" data-i18n="🔄 الجلسات">🔄 الجلسات</th>
                                                <th class="pb-3 text-center font-bold" data-i18n="🎫 تذاكر">🎫 تذاكر</th>
                                                <th class="pb-3 text-center font-bold" data-i18n="🔨 إجراءات">🔨 إجراءات</th>
                                                <th class="pb-3 text-center font-bold text-blue-400" data-i18n="⭐ نقاط البونص">⭐ نقاط البونص</th>
                                                <th class="pb-3 text-center font-bold" data-i18n="إجراءات">إجراءات</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-blue-500/15">
                                            ${staffList.map((st, i) => {
                                                const activeObj = activeShifts.find(as => as.user_id === st.user_id);
                                                const currentLiveSeconds = activeObj ? Math.max(0, Math.floor(Date.now() / 1000) - activeObj.start_time) : 0;
                                                const effectiveSeconds = (st.shift_seconds || 0) + currentLiveSeconds;
                                                const sHours = Math.floor(effectiveSeconds / 3600);
                                                const sMins = Math.floor((effectiveSeconds % 3600) / 60);
                                                const memberObj = botGuild?.members?.cache?.get(st.user_id);
                                                const staffAvatar = memberObj?.user?.displayAvatarURL?.({ size: 64 }) || st.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png';
                                                const staffDisplayName = memberObj?.displayName || st.display_name || memberObj?.user?.username || st.username || `المشرف (${st.user_id.slice(-4)})`;
                                                const staffHandle = memberObj?.user?.tag || (st.username ? `@${st.username}` : st.user_id);
                                                const badge = i === 0 ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : i === 1 ? 'bg-gray-300/20 text-blue-200 border-gray-400/30' : i === 2 ? 'bg-orange-700/20 text-orange-400 border-orange-600/30' : 'bg-blue-400/20 text-blue-300 border-blue-500/20';
                                                const isOnline = !!activeObj;
                                                return `
                                                <tr class="hover:bg-white/5 transition">
                                                    <td class="py-3.5 pr-3"><span class="w-7 h-7 rounded-lg border ${badge} flex items-center justify-center font-mono text-[11px] font-black">${i + 1}</span></td>
                                                    <td class="py-3.5 font-bold text-white text-xs">
                                                        <div class="flex items-center gap-2.5">
                                                            <div class="relative flex-shrink-0">
                                                                <img src="${staffAvatar}" alt="" class="w-8 h-8 rounded-full border border-blue-500/20 object-cover shadow" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                                                                ${isOnline ? '<span class="w-2.5 h-2.5 rounded-full bg-emerald-400 absolute -bottom-0.5 -right-0.5 ring-2 ring-[#0b1322]"></span>' : ''}
                                                            </div>
                                                            <div class="truncate max-w-[170px]">
                                                                <span class="block font-bold text-white leading-tight truncate">${staffDisplayName}</span>
                                                                <span class="text-[10px] text-white font-mono block leading-tight truncate">${staffHandle}</span>
                                                                ${isOnline ? '<span class="text-[9px] text-emerald-400 font-bold block mt-0.5" data-i18n="🟢 في الخدمة الآن">🟢 في الخدمة الآن</span>' : ''}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td class="py-3.5 text-center font-mono font-black text-emerald-400 text-sm">
                                                        <span>${sHours}</span><span class="lang-ar">س </span><span class="lang-en">h </span><span>${sMins}</span><span class="lang-ar">د</span><span class="lang-en">m</span>
                                                    </td>
                                                    <td class="py-3.5 text-center font-mono font-bold text-gray-300">${st.total_shifts || 0}</td>
                                                    <td class="py-3.5 text-center font-mono font-bold text-cyan-400">${st.tickets_closed || 0}</td>
                                                    <td class="py-3.5 text-center font-mono font-bold text-amber-400">${st.mod_actions || 0}</td>
                                                    <td class="py-3.5 text-center font-mono font-black text-blue-400 text-sm">${Number(st.points || 0).toLocaleString()}</td>
                                                    <td class="py-3.5 text-center">
                                                        <button type="button" onclick="modifyStaffPointsPrompt('${st.user_id}', '${staffDisplayName.replace(/'/g, "\\'")}')" class="px-2.5 py-1 bg-blue-400/30 hover:bg-gradient-to-l from-purple-600 to-blue-500 text-gray-300 rounded-lg text-[10px] font-bold transition" data-i18n="⭐ تعديل النقاط">
                                                            ⭐ تعديل النقاط
                                                        </button>
                                                    </td>
                                                </tr>
                                                `;
                                            }).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            `}
                        </div>
                    </div>

                    <script>
                    async function saveStaffSettingsQuick() {
                        const role = document.getElementById('staff_role')?.value;
                        const loginCh = document.getElementById('staff_login_channel')?.value;
                        const logCh = document.getElementById('staff_log_channel')?.value;
                        const bannerUrl = document.querySelector('input[name="staff_banner_url"]')?.value;

                        const maxHours = document.getElementById('staff_max_shift_hours')?.value;
                        const inactMins = document.getElementById('staff_inactivity_minutes')?.value;

                        try {
                            const r = await fetch('/api/guild/${guildId}/settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    staff_role: role,
                                    staff_login_channel: loginCh,
                                    staff_log_channel: logCh,
                                    staff_banner_url: bannerUrl,
                                    staff_max_shift_hours: parseInt(maxHours, 10) || 8,
                                    staff_inactivity_minutes: parseInt(inactMins, 10) ?? 30
                                })
                            });
                            const d = await r.json();
                            if (d.success) alert('✅ تم حفظ إعدادات طاقم الإدارة بنجاح!');
                            else alert('❌ ' + (d.error || 'فشل الحفظ'));
                        } catch(e) { alert('خطأ في الاتصال'); }
                    }

                    async function sendStaffPanelDirect() {
                        const loginCh = document.getElementById('staff_login_channel')?.value;
                        if (!loginCh) return alert('يرجى تحديد قناة لوحة تسجيل الحضور أولاً وحفظها.');
                        if (!confirm('هل تريد إرسال لوحة الحضور والانصراف الآن في القناة المحددة؟')) return;

                        try {
                            const r = await fetch('/api/guild/${guildId}/staff/send-panel', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ channelId: loginCh })
                            });
                            const d = await r.json();
                            if (d.success) alert('✅ تم إرسال لوحة الحضور والانصراف بنجاح في القناة!');
                            else alert('❌ ' + (d.error || 'فشل الإرسال'));
                        } catch(e) { alert('خطأ في الاتصال بالخادم'); }
                    }

                    async function modifyStaffPointsPrompt(userId, name) {
                        const pts = prompt('أدخل عدد النقاط الجديد للإداري ' + name + ':', '100');
                        if (pts === null || isNaN(pts)) return;

                        try {
                            const r = await fetch('/api/guild/${guildId}/staff/set-points', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId, points: parseInt(pts, 10) })
                            });
                            const d = await r.json();
                            if (d.success) { alert('✅ تم تحديث نقاط الإداري بنجاح'); location.reload(); }
                            else alert('❌ ' + (d.error || 'فشل التحديث'));
                        } catch(e) { alert('خطأ في الاتصال'); }
                    }

                    async function resetAllStaffStats() {
                        if (!confirm('هل أنت متأكد من تصفير جميع إحصائيات وساعات طاقم الإدارة؟ لا يمكن التراجع عن هذا الإجراء.')) return;
                        try {
                            const r = await fetch('/api/guild/${guildId}/staff/reset', { method: 'POST' });
                            const d = await r.json();
                            if (d.success) { alert('✅ تم تصفير إحصائيات النشاط والساعات بنجاح'); location.reload(); }
                            else alert('❌ ' + (d.error || 'فشل'));
                        } catch(e) { alert('خطأ في الاتصال بالسيرفر'); }
                    }
                    </script>
                `;
            } else if (section === 'applications') {
                const appsList = database.getApplications(guildId) || [];
                const pendingSubmissions = database.getPendingSubmissions(guildId) || [];

                const appsCardsHtml = appsList.length === 0 ? `
                    <div class="py-12 text-center space-y-3 bg-[#0b1322] border border-blue-500/20 rounded-3xl">
                        <div class="w-16 h-16 rounded-2xl bg-blue-400/10 text-blue-400 flex items-center justify-center text-3xl mx-auto border border-blue-500/20">📝</div>
                        <h4 class="text-white font-bold text-sm">لا توجد نماذج تقديم حالياً</h4>
                        <p class="text-white text-xs">اضغط على زر "إنشاء نموذج جديد" بالأعلى لإنشاء أول استمارة تقديم</p>
                    </div>
                ` : appsList.map(a => {
                    let questions = [];
                    try { questions = typeof a.questions === 'string' ? JSON.parse(a.questions) : a.questions; } catch(e) { questions = []; }
                    const logChanName = botGuild?.channels?.cache?.get(a.log_channel)?.name || 'غير محددة';
                    const roleName = botGuild?.roles?.cache?.get(a.accepted_role)?.name || 'بدون رتبة تلقائية';
                    const reviewerRoleName = botGuild?.roles?.cache?.get(a.reviewer_role)?.name || 'الإدارة (Manage Server)';

                    return `
                    <div class="bg-[#0b1322] border border-blue-500/20 hover:border-blue-500/20 rounded-3xl p-6 transition space-y-4 shadow-xl">
                        <div class="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-blue-500/20">
                            <div class="flex items-center gap-2">
                                <button type="button" onclick="sendAppPanel('${a.id}', this)" class="px-3.5 py-1.5 bg-gradient-to-l from-purple-600 to-blue-500 hover:bg-gradient-to-l from-purple-600 to-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow">
                                    <span>🚀 إرسال البانل في القناة</span>
                                </button>
                                <button type="button" onclick="editAppForm('${a.id}')" class="px-3 py-1.5 bg-[#102036] hover:bg-[#182c44] text-white border border-blue-500/20 rounded-xl text-xs font-bold transition">
                                    ✏️ تعديل
                                </button>
                                <button type="button" onclick="deleteAppForm('${a.id}')" class="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 rounded-xl text-xs font-bold transition">
                                    🗑️ حذف
                                </button>
                            </div>
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h4 class="font-black text-white text-base">${a.title}</h4>
                                    <p class="text-white text-xs mt-0.5">${a.description || 'بدون وصف'}</p>
                                </div>
                                <div class="w-10 h-10 rounded-2xl bg-blue-400/20 text-blue-400 flex items-center justify-center text-xl border border-blue-500/20">📝</div>
                            </div>
                        </div>

                        <!-- Meta Info Grid -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-right">
                            <div class="bg-[#070d1d] p-3 rounded-2xl border border-blue-500/20">
                                <span class="text-[10px] text-gray-500 block font-bold">قناة استقبال الطلبات</span>
                                <span class="text-xs font-black text-white">#${logChanName}</span>
                            </div>
                            <div class="bg-[#070d1d] p-3 rounded-2xl border border-blue-500/20">
                                <span class="text-[10px] text-gray-500 block font-bold">رتبة المقبولين التلقائية</span>
                                <span class="text-xs font-black text-emerald-400">@${roleName}</span>
                            </div>
                            <div class="bg-[#070d1d] p-3 rounded-2xl border border-blue-500/20">
                                <span class="text-[10px] text-gray-500 block font-bold">رتبة مسؤولي المراجعة</span>
                                <span class="text-xs font-black text-amber-400">@${reviewerRoleName}</span>
                            </div>
                        </div>

                        <!-- Questions List preview -->
                        <div class="space-y-1.5 pt-1">
                            <span class="text-[11px] font-bold text-white block text-right">الأسئلة المعينة (${questions.length}/5):</span>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                                ${questions.map((q, idx) => {
                                    const qText = typeof q === 'object' ? q.text : q;
                                    const qType = typeof q === 'object' && q.type === 'short' ? 'إجابة قصيرة' : 'فقرة';
                                    return `
                                    <div class="bg-[#070d1d]/70 p-2.5 rounded-xl border border-blue-500/20 text-right flex items-center justify-between">
                                        <span class="text-[10px] bg-blue-800/60 text-white px-2 py-0.5 rounded-lg border border-blue-500/20">${qType}</span>
                                        <span class="text-xs text-gray-300 font-bold truncate max-w-[200px]">${idx + 1}. ${qText}</span>
                                    </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                    `;
                }).join('');

                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <!-- Top Header Banner -->
                        <div class="bg-gradient-to-r from-[#0a1430] via-[#0b1322] to-[#0a1430] border border-blue-500/20 p-6 rounded-3xl flex items-center justify-between shadow-2xl flex-wrap gap-4">
                            <div class="flex items-center gap-3">
                                <button type="button" onclick="openCreateAppModal()" class="px-5 py-2.5 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-2">
                                    <span>+ إنشاء نموذج جديد</span>
                                </button>
                            </div>
                            <div class="text-right">
                                <h3 class="font-black text-white text-xl flex items-center gap-2 justify-end"><span>نظام التقديمات والتوظيف</span><span>📝</span></h3>
                                <p class="text-white text-xs mt-0.5">أنشئ نماذج تقديم مخصصة، حدد الأسئلة، واستقبل الطلبات في قناة مخصصة مع إمكانية القبول والرفض التفاعلية</p>
                            </div>
                        </div>

                        <!-- Quick Stats -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div class="bg-[#0b1322] border border-blue-500/20 p-4 rounded-2xl text-center">
                                <div class="text-2xl font-black text-white">${appsList.length}</div>
                                <div class="text-xs text-white font-bold mt-1">إجمالي النماذج</div>
                            </div>
                            <div class="bg-[#0b1322] border border-blue-500/20 p-4 rounded-2xl text-center">
                                <div class="text-2xl font-black text-blue-400">${pendingSubmissions.length}</div>
                                <div class="text-xs text-white font-bold mt-1">طلبات بانتظار المراجعة</div>
                            </div>
                            <div class="bg-[#0b1322] border border-blue-500/20 p-4 rounded-2xl text-center">
                                <div class="text-2xl font-black text-emerald-400">${appsList.filter(a => a.status === 'open').length}</div>
                                <div class="text-xs text-white font-bold mt-1">النماذج المفتوحة</div>
                            </div>
                        </div>

                        <!-- Application Forms List -->
                        <div class="space-y-4">
                            <div class="flex items-center justify-between">
                                <span class="text-xs text-blue-400 font-bold">${appsList.length} نموذج نشط</span>
                                <h4 class="text-sm font-black text-white">📋 نماذج التقديم الحالية</h4>
                            </div>
                            ${appsCardsHtml}
                        </div>

                        <!-- Create/Edit Form Modal Overlay -->
                        <div id="appModalOverlay" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
                            <div class="bg-[#0b1322] border border-blue-500/20 rounded-3xl w-full max-w-2xl p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto text-right" dir="rtl">
                                <div class="flex items-center justify-between pb-3 border-b border-blue-500/20">
                                    <button type="button" onclick="closeAppModal()" class="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-white hover:text-gray-300 flex items-center justify-center text-sm font-bold">✕</button>
                                    <h4 id="appModalTitle" class="text-base font-black text-white">إنشاء نموذج تقديم جديد 📝</h4>
                                </div>

                                <input type="hidden" id="modalAppId" value="">

                                <div class="space-y-3">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1">اسم النموذج (العنوان) <span class="text-blue-400">*</span></label>
                                        <input type="text" id="appTitleInput" placeholder="مثال: تقديم الإدارة / تقديم الدعم الفني" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right font-bold">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1">وصف النموذج (اختياري)</label>
                                        <input type="text" id="appDescInput" placeholder="شرح مختصر عن المنصب أو الشروط المطلوبة..." class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                    </div>
                                </div>

                                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1">قناة استقبال الطلبات <span class="text-blue-400">*</span></label>
                                        ${renderChannelSelect('appLogChannel', '')}
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1">رتبة القبول التلقائي</label>
                                        ${renderRoleSelect('appAcceptedRole', '')}
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1">رتبة مسؤولي المراجعة</label>
                                        ${renderRoleSelect('appReviewerRole', '')}
                                    </div>
                                </div>

                                <!-- صورة بانر التقديم (Wicks-Style) -->
                                <div class="bg-[#070d1d] border border-blue-500/20 rounded-2xl p-4 space-y-3">
                                    <div class="flex items-center justify-between">
                                        <button type="button" onclick="clearUploadedImageInDOM('app_panel_image')" class="text-[11px] text-rose-400 hover:text-rose-300 font-bold">🗑️ إزالة الصورة</button>
                                        <div class="flex items-center gap-1.5">
                                            <span class="text-xs font-bold text-white">صورة بانر رسالة التقديم (اختياري)</span>
                                            <span class="text-blue-400">🖼️</span>
                                        </div>
                                    </div>
                                    <div class="flex flex-col sm:flex-row items-center gap-3">
                                        <div class="w-full sm:w-44 h-20 rounded-xl border border-blue-500/20 bg-[#0b1322] overflow-hidden flex items-center justify-center relative">
                                            <img id="img_app_panel_image" src="" class="w-full h-full object-cover hidden">
                                            <div id="placeholder_app_panel_image" class="text-gray-500 text-xs flex flex-col items-center">
                                                <span class="text-xl">🖼️</span>
                                                <span class="text-[10px]">لا توجد صورة</span>
                                            </div>
                                        </div>
                                        <div class="flex-1 space-y-2 w-full">
                                            <input type="hidden" id="input_app_panel_image" value="">
                                            <input type="file" id="file_app_panel_image" accept="image/*" class="hidden" onchange="uploadImageFile(this, 'app_panel_image')">
                                            <button type="button" onclick="document.getElementById('file_app_panel_image').click()" class="w-full px-4 py-2 bg-blue-400/20 hover:bg-blue-400/30 border border-blue-500/20 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5">
                                                <span>📤</span>
                                                <span id="btn_text_app_panel_image">رفع بانر التقديم</span>
                                            </button>
                                            <p class="text-[10px] text-gray-500 text-right">تظهر كصورة رئيسية أعلى بنر التقديم في القناة</p>
                                        </div>
                                    </div>
                                </div>

                                <!-- Questions Builder (Up to 5) -->
                                <div class="space-y-3 pt-2">
                                    <div class="flex items-center justify-between">
                                        <button type="button" onclick="addQuestionField()" id="btnAddQ" class="px-3 py-1.5 bg-blue-400/20 hover:bg-blue-400/30 border border-blue-500/20 text-white rounded-xl text-xs font-bold transition">
                                            + إضافة سؤال (حتى 5)
                                        </button>
                                        <span class="text-xs font-bold text-white">أسئلة نموذج التقديم (Discord Modal)</span>
                                    </div>
                                    <div id="modalQuestionsContainer" class="space-y-2.5"></div>
                                </div>

                                <div class="flex items-center justify-end gap-3 pt-3 border-t border-blue-500/20">
                                    <button type="button" onclick="closeAppModal()" class="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition">إلغاء</button>
                                    <button type="button" onclick="saveAppForm()" id="btnSaveApp" class="px-6 py-2 bg-gradient-to-l from-purple-600 to-blue-500 hover:bg-gradient-to-l from-purple-600 to-blue-500 text-white rounded-xl text-xs font-bold transition shadow-lg">حفظ النموذج 💾</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <script>
                    let currentQuestions = [];
                    const allAppsData = ${JSON.stringify(appsList)};

                    function openCreateAppModal() {
                        document.getElementById('modalAppId').value = '';
                        document.getElementById('appModalTitle').textContent = 'إنشاء نموذج تقديم جديد 📝';
                        document.getElementById('appTitleInput').value = '';
                        document.getElementById('appDescInput').value = '';
                        document.getElementById('appLogChannel').value = '';
                        document.getElementById('appAcceptedRole').value = '';
                        document.getElementById('appReviewerRole').value = '';
                        clearUploadedImageInDOM('app_panel_image');
                        currentQuestions = [
                            { text: 'ما هو عمرك وتواجدك اليومي؟', type: 'short' },
                            { text: 'ما هي خبراتك السابقة في الإدارة أو المجال؟', type: 'paragraph' },
                            { text: 'لماذا ترغب بالانضمام إلى طاقم العمل؟', type: 'paragraph' }
                        ];
                        renderModalQuestions();
                        document.getElementById('appModalOverlay').classList.remove('hidden');
                    }

                    function editAppForm(id) {
                        const app = allAppsData.find(a => String(a.id) === String(id));
                        if (!app) return alert('النموذج غير موجود');

                        document.getElementById('modalAppId').value = app.id;
                        document.getElementById('appModalTitle').textContent = 'تعديل نموذج: ' + app.title;
                        document.getElementById('appTitleInput').value = app.title;
                        document.getElementById('appDescInput').value = app.description || '';
                        document.getElementById('appLogChannel').value = app.log_channel || '';
                        document.getElementById('appAcceptedRole').value = app.accepted_role || '';
                        document.getElementById('appReviewerRole').value = app.reviewer_role || '';

                        const panelImg = app.panel_image || '';
                        document.getElementById('input_app_panel_image').value = panelImg;
                        const imgEl = document.getElementById('img_app_panel_image');
                        const phEl = document.getElementById('placeholder_app_panel_image');
                        if (panelImg) {
                            if (imgEl) { imgEl.src = panelImg; imgEl.classList.remove('hidden'); }
                            if (phEl) phEl.classList.add('hidden');
                        } else {
                            if (imgEl) { imgEl.src = ''; imgEl.classList.add('hidden'); }
                            if (phEl) phEl.classList.remove('hidden');
                        }

                        try {
                            const parsed = typeof app.questions === 'string' ? JSON.parse(app.questions) : app.questions;
                            currentQuestions = parsed.map(q => typeof q === 'object' ? q : { text: String(q), type: 'paragraph' });
                        } catch(e) {
                            currentQuestions = [{ text: 'السؤال الأول', type: 'paragraph' }];
                        }

                        renderModalQuestions();
                        document.getElementById('appModalOverlay').classList.remove('hidden');
                    }

                    function closeAppModal() {
                        document.getElementById('appModalOverlay').classList.add('hidden');
                    }

                    function addQuestionField() {
                        if (currentQuestions.length >= 5) return alert('أقصى حد لأسئلة النافذة في ديسكورد هو 5 أسئلة');
                        currentQuestions.push({ text: '', type: 'paragraph' });
                        renderModalQuestions();
                    }

                    function removeQuestionField(idx) {
                        currentQuestions.splice(idx, 1);
                        renderModalQuestions();
                    }

                    function updateQuestionText(idx, val) {
                        if (currentQuestions[idx]) currentQuestions[idx].text = val;
                    }

                    function updateQuestionType(idx, val) {
                        if (currentQuestions[idx]) currentQuestions[idx].type = val;
                    }

                    function renderModalQuestions() {
                        const container = document.getElementById('modalQuestionsContainer');
                        if (currentQuestions.length === 0) {
                            container.innerHTML = '<p class="text-xs text-gray-500 text-center py-2">لا توجد أسئلة مضافة. اضغط على "+ إضافة سؤال"</p>';
                            return;
                        }

                        let html = '';
                        for (let i = 0; i < currentQuestions.length; i++) {
                            const q = currentQuestions[i];
                            html += '<div class="bg-[#070d1d] border border-blue-500/20 p-3 rounded-2xl space-y-2">' +
                                '<div class="flex items-center justify-between">' +
                                '<div class="flex items-center gap-2">' +
                                '<select onchange="updateQuestionType(' + i + ', this.value)" class="bg-[#0b1322] border border-blue-500/20 text-white text-[11px] font-bold rounded-xl px-2.5 py-1 outline-none">' +
                                '<option value="paragraph" ' + (q.type === 'paragraph' ? 'selected' : '') + '>فقرة طويلة (Paragraph)</option>' +
                                '<option value="short" ' + (q.type === 'short' ? 'selected' : '') + '>إجابة قصيرة (Short Answer)</option>' +
                                '</select>' +
                                '<button type="button" onclick="removeQuestionField(' + i + ')" class="text-rose-400 hover:text-rose-300 text-xs px-2 py-0.5 rounded bg-rose-950/40">✕ حذف</button>' +
                                '</div>' +
                                '<span class="text-xs font-bold text-gray-300">السؤال #' + (i + 1) + '</span>' +
                                '</div>' +
                                '<input type="text" placeholder="اكتب نص السؤال هنا..." value="' + (q.text || '') + '" oninput="updateQuestionText(' + i + ', this.value)" class="w-full bg-[#0b1322] border border-blue-500/20 focus:border-blue-400 rounded-xl px-3 py-2 text-xs text-white text-right outline-none">' +
                                '</div>';
                        }
                        container.innerHTML = html;
                    }

                    async function saveAppForm() {
                        const id = document.getElementById('modalAppId').value;
                        const title = document.getElementById('appTitleInput').value.trim();
                        const desc = document.getElementById('appDescInput').value.trim();
                        const logChannel = document.getElementById('appLogChannel').value;
                        const acceptedRole = document.getElementById('appAcceptedRole').value;
                        const reviewerRole = document.getElementById('appReviewerRole').value;
                        const panelImage = document.getElementById('input_app_panel_image') ? document.getElementById('input_app_panel_image').value : '';

                        if (!title) return alert('يرجى إدخال عنوان النموذج');
                        if (!logChannel) return alert('يرجى اختيار قناة استقبال الطلبات');
                        const validQuestions = currentQuestions.filter(q => q.text.trim());
                        if (validQuestions.length === 0) return alert('يرجى كتابة سؤال واحد على الأقل للنموذج');

                        const btn = document.getElementById('btnSaveApp');
                        btn.disabled = true; btn.textContent = 'جارٍ الحفظ...';

                        try {
                            const endpoint = id ? ('/api/guild/${guildId}/applications/' + id + '/update') : '/api/guild/${guildId}/applications/create';
                            const r = await fetch(endpoint, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    title, description: desc,
                                    log_channel: logChannel,
                                    accepted_role: acceptedRole,
                                    reviewer_role: reviewerRole,
                                    questions: validQuestions,
                                    panel_image: panelImage
                                })
                            });
                            const d = await r.json();
                            if (d.success) {
                                alert('✅ تم حفظ نموذج التقديم بنجاح!');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (d.error || 'فشل الحفظ'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال بالخادم');
                        } finally {
                            btn.disabled = false; btn.textContent = 'حفظ النموذج 💾';
                        }
                    }

                    async function deleteAppForm(id) {
                        if (!confirm('هل أنت متأكد من حذف نموذج التقديم هذا؟ سيتم حذف جميع الأسئلة المرتبطة به.')) return;
                        try {
                            const r = await fetch('/api/guild/${guildId}/applications/' + id + '/delete', { method: 'POST' });
                            const d = await r.json();
                            if (d.success) {
                                alert('✅ تم حذف النموذج بنجاح');
                                location.reload();
                            } else {
                                alert('❌ خطأ: ' + (d.error || 'فشل الحذف'));
                            }
                        } catch(e) {
                            alert('حدث خطأ في الاتصال');
                        }
                    }

                    async function sendAppPanel(id, btn) {
                        if (btn) {
                            btn.disabled = true;
                            btn.innerHTML = 'جاري الإرسال... ⏳';
                        }
                        try {
                            const r = await fetch('/api/guild/${guildId}/applications/' + id + '/send-panel', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({})
                            });
                            const d = await r.json();
                            if (d.success) {
                                if (btn) {
                                    btn.innerHTML = 'تم الإرسال للقناة بنجاح! ✅';
                                    btn.classList.remove('bg-gradient-to-l from-purple-600 to-blue-500', 'hover:bg-gradient-to-l from-purple-600 to-blue-500');
                                    btn.classList.add('bg-emerald-600');
                                    setTimeout(() => {
                                        btn.innerHTML = 'إرسال البنل في شات 🚀';
                                        btn.classList.remove('bg-emerald-600');
                                        btn.classList.add('bg-gradient-to-l from-purple-600 to-blue-500', 'hover:bg-gradient-to-l from-purple-600 to-blue-500');
                                        btn.disabled = false;
                                    }, 3000);
                                } else {
                                    alert('✅ تم إرسال رسالة وزر التقديم في القناة بنجاح فوراً!');
                                }
                            } else {
                                alert('❌ ' + (d.error || 'فشل الإرسال، تأكد من صحة القناة في النموذج'));
                                if (btn) {
                                    btn.innerHTML = 'إرسال البنل في شات 🚀';
                                    btn.disabled = false;
                                }
                            }
                        } catch(e) {
                            alert('خطأ في الاتصال بالسيرفر');
                            if (btn) {
                                btn.innerHTML = 'إرسال البنل في شات 🚀';
                                btn.disabled = false;
                            }
                        }
                    }
                    </script>
                `;
            } else if (section === 'embed') {
                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <!-- Top Toolbar & Status -->
                        <div class="bg-gradient-to-r from-[#0b1322] via-[#101c34] to-[#0b1322] border border-blue-500/20 p-4 sm:p-5 rounded-3xl shadow-xl flex flex-wrap items-center justify-between gap-4">
                            <div class="flex items-center gap-2.5 flex-wrap">
                                <button type="button" id="btnSendEmbed" onclick="if(window.sendEmbedDirect)window.sendEmbedDirect()"
                                    class="px-6 py-3 bg-gradient-to-r from-purple-500 via-blue-500 to-blue-400 hover:from-blue-400 hover:to-indigo-500 text-white font-black text-xs rounded-2xl shadow-lg shadow-blue-800/60 border border-blue-500/20 flex items-center gap-2 cursor-pointer transition active:scale-95">
                                    <span class="text-base">🚀</span>
                                    <span>إرسال للقناة الآن</span>
                                </button>
                                <button type="button" id="btnSaveEmbedDraft" onclick="if(window.saveEmbedDraft)window.saveEmbedDraft()"
                                    class="px-4 py-3 bg-[#070d1d] hover:bg-white/5 text-gray-300 hover:text-gray-300 font-bold text-xs rounded-2xl border border-blue-500/20 flex items-center gap-1.5 cursor-pointer transition active:scale-95">
                                    <span>💾</span>
                                    <span>حفظ مسودة</span>
                                </button>
                                <button type="button" id="btnClearEmbed" onclick="if(window.clearEmbedFields)window.clearEmbedFields()"
                                    class="px-4 py-3 bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 font-bold text-xs rounded-2xl border border-rose-800/40 flex items-center gap-1.5 cursor-pointer transition active:scale-95">
                                    <span>🗑️</span>
                                    <span>مسح الكل</span>
                                </button>
                            </div>

                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <h3 class="font-black text-white text-base sm:text-lg flex items-center gap-2 justify-end">
                                        <span>صانع رسائل الإيمبد المتطور</span>
                                        <span class="text-blue-400">✨</span>
                                    </h3>
                                    <p class="text-[11px] text-white">صمم رسائل إيمبد غنية مع معاينة ديسكورد فورية لحظة بلحظة</p>
                                </div>
                                <div class="w-11 h-11 rounded-2xl bg-blue-400/20 border border-blue-500/20 text-white flex items-center justify-center text-xl shadow-inner">
                                    📜
                                </div>
                            </div>
                        </div>

                        <!-- 2-Column Responsive Layout: Left Editor, Right Sticky Preview -->
                        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                            
                            <!-- Left: Editor Controls (7 Cols on desktop) -->
                            <div class="lg:col-span-7 space-y-5">

                                <!-- Target Channel Box -->
                                <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-3xl space-y-2 shadow-lg">
                                    <div class="flex items-center justify-between mb-1">
                                        <span class="text-[10px] text-blue-400 font-mono bg-blue-800/40 px-2.5 py-0.5 rounded-full border border-blue-500/20">مطلوب</span>
                                        <label class="block text-xs font-black text-white flex items-center gap-1.5">
                                            <span>أرسل إلى القناة</span>
                                            <span class="text-blue-400">#</span>
                                        </label>
                                    </div>
                                    ${renderChannelSelect('embedChannel', '')}
                                    <p class="text-[10px] text-gray-500">اختر الروم النصي الذي سيقوم البوت بإرسال الإيمبد داخله فوراً</p>
                                </div>

                                <!-- Color Palette Box -->
                                <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-3xl space-y-3 shadow-lg">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <input type="text" id="embHexInput" value="#60a5fa" oninput="if(window.setCustomHex)window.setCustomHex(this.value)" class="w-24 bg-[#070d1d] border border-blue-500/20 rounded-xl px-3 py-1.5 text-xs text-white text-center font-mono focus:border-blue-400 outline-none uppercase">
                                            <input type="color" id="embColor" value="#60a5fa" oninput="if(window.onColorPickerChange)window.onColorPickerChange(this.value)" class="w-9 h-9 rounded-xl border border-blue-500/20 bg-[#070d1d] cursor-pointer p-0.5">
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <span class="text-xs font-black text-white">لون شريط الإيمبد</span>
                                            <span class="text-blue-400 text-sm">🎨</span>
                                        </div>
                                    </div>

                                    <div class="flex items-center justify-end gap-2 flex-wrap pt-2 border-t border-blue-500/20">
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#10b981')" title="Emerald" class="w-7 h-7 rounded-full bg-[#10b981] hover:scale-110 transition border border-blue-500/20 shadow cursor-pointer"></button>
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#06b6d4')" title="Cyan" class="w-7 h-7 rounded-full bg-[#06b6d4] hover:scale-110 transition border border-blue-500/20 shadow cursor-pointer"></button>
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#93c5fd')" title="Blue" class="w-7 h-7 rounded-full bg-[#93c5fd] hover:scale-110 transition border border-blue-500/20 shadow cursor-pointer"></button>
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#93c5fd')" title="Violet" class="w-7 h-7 rounded-full bg-[#93c5fd] hover:scale-110 transition border border-blue-500/20 shadow cursor-pointer"></button>
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#60a5fa')" title="Purple" class="w-7 h-7 rounded-full bg-[#60a5fa] hover:scale-110 transition border-2 border-blue-500/25 shadow-lg ring-2 ring-blue-400/50 cursor-pointer"></button>
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#f97316')" title="Orange" class="w-7 h-7 rounded-full bg-[#f97316] hover:scale-110 transition border border-blue-500/20 shadow cursor-pointer"></button>
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#ef4444')" title="Red" class="w-7 h-7 rounded-full bg-[#ef4444] hover:scale-110 transition border border-blue-500/20 shadow cursor-pointer"></button>
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#ec4899')" title="Pink" class="w-7 h-7 rounded-full bg-[#ec4899] hover:scale-110 transition border border-blue-500/20 shadow cursor-pointer"></button>
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#eab308')" title="Yellow" class="w-7 h-7 rounded-full bg-[#eab308] hover:scale-110 transition border border-blue-500/20 shadow cursor-pointer"></button>
                                        <button type="button" onclick="if(window.selectColor)window.selectColor('#233f5e')" title="Dark" class="w-7 h-7 rounded-full bg-[#233f5e] hover:scale-110 transition border border-blue-500/20 shadow cursor-pointer"></button>
                                    </div>
                                </div>

                                <!-- Text Content Box -->
                                <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-3xl space-y-4 shadow-lg">
                                    <div class="flex items-center justify-between pb-3 border-b border-blue-500/20">
                                        <span class="text-[11px] text-gray-500 font-mono">Content</span>
                                        <h4 class="text-xs font-black text-white flex items-center gap-1.5">
                                            <span>محتوى الرسالة النصي</span>
                                            <span>✍️</span>
                                        </h4>
                                    </div>

                                    <!-- Author Name -->
                                    <div>
                                        <input type="hidden" id="embAuthorIcon" value="">
                                        <label class="block text-xs font-bold text-gray-300 mb-1">اسم الكاتب أو الهيدر (Author)</label>
                                        <input type="text" id="embAuthor" oninput="if(window.updateEmbedPreview)window.updateEmbedPreview()" placeholder="مثال: إدارة السيرفر / Droplet Support" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-3 text-xs text-white outline-none text-right">
                                        <p class="text-[10px] text-gray-500 mt-1">يظهر كعنوان صغير أعلى الإيمبد</p>
                                    </div>

                                    <!-- Main Title -->
                                    <input type="hidden" id="embTitleUrl" value="">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-300 mb-1">العنوان الرئيسي (Title)</label>
                                        <input type="text" id="embTitle" oninput="if(window.updateEmbedPreview)window.updateEmbedPreview()" placeholder="مثال: مرحباً بكم في مجتمعنا!" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-bold">
                                        <p class="text-[10px] text-gray-500 mt-1">عنوان بارز وواضح بخط عريض</p>
                                    </div>

                                    <!-- Description -->
                                    <div>
                                        <div class="flex items-center justify-between mb-1">
                                            <span class="text-[10px] text-gray-500 font-mono">Markdown Supported</span>
                                            <label class="block text-xs font-bold text-gray-300">
                                                الوصف والمحتوى الأساسي <span class="text-blue-400">*</span>
                                            </label>
                                        </div>
                                        <textarea id="embDesc" rows="5" oninput="if(window.updateEmbedPreview)window.updateEmbedPreview()" placeholder="اكتب نص الإيمبد هنا... يدعم ديسكورد ماركداون: **عريض**، *مائل*، __مسطر__، > اقتباس، وروابط [هنا](https://...)" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-3 text-xs text-white outline-none text-right leading-relaxed"></textarea>
                                    </div>
                                </div>

                                <!-- Images (Thumbnail & Main Banner) -->
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <!-- Thumbnail -->
                                    <div class="bg-[#0b1322] border border-blue-500/20 rounded-3xl p-4 space-y-3 shadow-lg">
                                        <div class="flex items-center justify-between">
                                            <button type="button" onclick="if(window.clearEmbedImageField)window.clearEmbedImageField('embThumbnail')" class="text-[11px] text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 cursor-pointer">
                                                <span>✕</span><span>حذف</span>
                                            </button>
                                            <span class="text-xs font-bold text-gray-300">الصورة المصغرة (Thumbnail)</span>
                                        </div>
                                        <div class="flex items-center gap-3">
                                            <div class="w-14 h-14 rounded-2xl border border-blue-500/20 bg-[#070d1d] overflow-hidden flex items-center justify-center shrink-0">
                                                <img id="prev_embThumbnail_box" src="" class="w-full h-full object-cover hidden">
                                                <span id="ph_embThumbnail" class="text-lg text-gray-600">🖼️</span>
                                            </div>
                                            <div class="flex-1 space-y-1">
                                                <input type="hidden" id="embThumbnail" value="">
                                                <input type="file" id="file_embThumbnail" accept="image/*" onchange="if(window.uploadEmbedImageFile)window.uploadEmbedImageFile(this,'embThumbnail')" class="hidden">
                                                <button type="button" onclick="document.getElementById('file_embThumbnail').click()" class="w-full px-3 py-2 bg-blue-400/20 hover:bg-blue-400/30 border border-blue-500/20 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95">
                                                    <span>📤</span><span id="btn_text_embThumbnail">رفع صورة مصغرة</span>
                                                </button>
                                                <p class="text-[9px] text-gray-500">تظهر في الزاوية العلوية للإيمبد</p>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Main Banner -->
                                    <div class="bg-[#0b1322] border border-blue-500/20 rounded-3xl p-4 space-y-3 shadow-lg">
                                        <div class="flex items-center justify-between">
                                            <button type="button" onclick="if(window.clearEmbedImageField)window.clearEmbedImageField('embImage')" class="text-[11px] text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 cursor-pointer">
                                                <span>✕</span><span>حذف</span>
                                            </button>
                                            <span class="text-xs font-bold text-gray-300">الصورة الكبيرة (Main Image)</span>
                                        </div>
                                        <div class="flex items-center gap-3">
                                            <div class="w-14 h-14 rounded-2xl border border-blue-500/20 bg-[#070d1d] overflow-hidden flex items-center justify-center shrink-0">
                                                <img id="prev_embImage_box" src="" class="w-full h-full object-cover hidden">
                                                <span id="ph_embImage" class="text-lg text-gray-600">🖼️</span>
                                            </div>
                                            <div class="flex-1 space-y-1">
                                                <input type="hidden" id="embImage" value="">
                                                <input type="file" id="file_embImage" accept="image/*" onchange="if(window.uploadEmbedImageFile)window.uploadEmbedImageFile(this,'embImage')" class="hidden">
                                                <button type="button" onclick="document.getElementById('file_embImage').click()" class="w-full px-3 py-2 bg-blue-400/20 hover:bg-blue-400/30 border border-blue-500/20 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95">
                                                    <span>📤</span><span id="btn_text_embImage">رفع بانر عريض</span>
                                                </button>
                                                <p class="text-[9px] text-gray-500">تظهر كصورة عريضة أسفل الإيمبد</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Custom Fields Container -->
                                <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-3xl space-y-3 shadow-lg">
                                    <div class="flex items-center justify-between pb-2 border-b border-blue-500/20">
                                        <button type="button" onclick="if(window.addEmbedField)window.addEmbedField()" class="px-3.5 py-1.5 bg-blue-400/20 hover:bg-blue-400/40 border border-blue-500/20 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer active:scale-95">
                                            <span>+</span><span>إضافة حقل جديد</span>
                                        </button>
                                        <h4 class="text-xs font-black text-white flex items-center gap-1.5">
                                            <span>حقول إضافية مخصصة (Fields)</span>
                                            <span>📑</span>
                                        </h4>
                                    </div>
                                    <div id="fieldsContainer" class="space-y-2.5"></div>
                                </div>

                                <!-- Footer & Timestamp Box -->
                                <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-3xl space-y-3 shadow-lg">
                                    <div class="flex items-center justify-between pb-2 border-b border-blue-500/20">
                                        <div class="flex items-center gap-2">
                                            <label class="relative inline-flex items-center cursor-pointer">
                                                <input type="checkbox" id="embTimestampToggle" checked onchange="if(window.updateEmbedPreview)window.updateEmbedPreview()" class="sr-only peer">
                                                <div class="w-10 h-5 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-blue-500/25 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-blue-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gradient-to-l from-purple-600 to-blue-500 cursor-pointer"></div>
                                            </label>
                                            <span class="text-[11px] text-white font-bold">إظهار الوقت</span>
                                        </div>
                                        <h4 class="text-xs font-black text-white flex items-center gap-1.5">
                                            <span>التذييل والوقت (Footer)</span>
                                            <span>⏰</span>
                                        </h4>
                                    </div>

                                    <div>
                                        <input type="hidden" id="embFooterIcon" value="">
                                        <label class="block text-xs font-bold text-gray-300 mb-1">نص التذييل (Footer Text)</label>
                                        <input type="text" id="embFooter" oninput="if(window.updateEmbedPreview)window.updateEmbedPreview()" placeholder="مثال: Droplet Bot • نظام الدعم التلقائي" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-right">
                                    </div>
                                </div>

                            </div>

                            <!-- Right: Sticky Discord Live Preview (5 Cols on desktop) -->
                            <div class="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
                                <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-3xl shadow-2xl space-y-3">
                                    <div class="flex items-center justify-between pb-3 border-b border-blue-500/20">
                                        <span class="text-[10px] bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-full font-bold border border-emerald-500/30 flex items-center gap-1.5">
                                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                            <span>معاينة حية ديسكورد</span>
                                        </span>
                                        <h4 class="text-xs font-black text-white flex items-center gap-1.5">
                                            <span>شكل الرسالة النهائي</span>
                                            <span>👁️</span>
                                        </h4>
                                    </div>

                                    <!-- Discord Bubble Simulation -->
                                    <div class="bg-[#313338] p-4 rounded-2xl text-right font-sans shadow-2xl border border-black/40 space-y-2 select-none">
                                        <!-- Header: Avatar + Bot tag -->
                                        <div class="flex items-center justify-end gap-2.5 pb-1">
                                            <div class="flex items-center gap-1.5">
                                                <span class="text-[10px] text-white font-medium">اليوم في 12:00 م</span>
                                                <span class="bg-[#60a5fa] text-white text-[9px] font-extrabold px-1 py-0.5 rounded leading-none">BOT</span>
                                                <span class="font-bold text-white text-xs">Droplet</span>
                                            </div>
                                            <img src="${botAvatarUrl}" class="w-8 h-8 rounded-full object-cover shadow">
                                        </div>

                                        <!-- Embed Card -->
                                        <div class="bg-[#233f5e] p-3.5 rounded-lg border-l-4 shadow transition-all text-right" id="previewEmbedBox" style="border-left-color: #60a5fa; border-right: none;">
                                            <div class="flex items-start gap-3">
                                                <!-- Thumbnail -->
                                                <div id="prevThumbnailWrap" class="hidden shrink-0 order-first">
                                                    <img id="prevThumbnailImg" class="w-16 h-16 rounded-lg object-cover shadow border border-blue-500/20" src="" alt="">
                                                </div>

                                                <!-- Body -->
                                                <div class="flex-1 min-w-0 space-y-1.5">
                                                    <!-- Author -->
                                                    <div id="prevAuthorRow" class="hidden items-center justify-end gap-1.5">
                                                        <span id="prevAuthorText" class="text-[11px] font-bold text-blue-100"></span>
                                                    </div>

                                                    <!-- Title -->
                                                    <div id="prevTitle" class="text-sm font-bold text-white leading-snug break-words"></div>

                                                    <!-- Desc -->
                                                    <div id="prevDesc" class="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed break-words">محتوى الإيمبد سيظهر هنا مباشرة...</div>

                                                    <!-- Fields -->
                                                    <div id="prevFieldsGrid" class="grid grid-cols-2 gap-2 pt-1 hidden"></div>
                                                </div>
                                            </div>

                                            <!-- Main Image -->
                                            <div id="prevImageRow" class="mt-2.5 hidden">
                                                <img id="prevMainImg" class="rounded-lg max-h-60 w-full object-cover shadow" src="" alt="">
                                            </div>

                                            <!-- Footer -->
                                            <div id="prevFooterRow" class="mt-2.5 pt-2 flex items-center justify-end gap-1.5 text-[10px] text-white">
                                                <span id="prevTimestamp" class="text-white"></span>
                                                <span id="prevFooterDot" class="hidden font-bold">•</span>
                                                <span id="prevFooterText"></span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                `;

            // Embed page script
            embedScriptHtml = `
                    let embedFields = [];

                    function showFixedToast(msg, isSuccess) {
                        if (isSuccess === undefined) isSuccess = true;
                        var toast = document.getElementById('embedFixedToast');
                        if (!toast) {
                            toast = document.createElement('div');
                            toast.id = 'embedFixedToast';
                            toast.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:999999;padding:12px 24px;border-radius:16px;font-size:13px;font-weight:bold;display:flex;align-items:center;gap:10px;box-shadow:0 12px 40px rgba(0,0,0,0.6);transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);min-width:280px;justify-content:center;text-align:center;direction:rtl;';
                            document.body.appendChild(toast);
                        }
                        toast.textContent = msg;
                        toast.style.background = isSuccess ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)';
                        toast.style.color = '#dbeafe';
                        toast.style.border = isSuccess ? '1px solid #34d399' : '1px solid #f87171';
                        toast.style.opacity = '1';
                        toast.style.display = 'flex';
                        clearTimeout(toast._t);
                        toast._t = setTimeout(function() {
                            toast.style.opacity = '0';
                            setTimeout(function() { toast.style.display = 'none'; }, 300);
                        }, 4000);
                    }

                    function selectColor(hex) {
                        var c = document.getElementById('embColor');
                        var h = document.getElementById('embHexInput');
                        if (c) c.value = hex;
                        if (h) h.value = hex.toUpperCase();
                        updateEmbedPreview();
                    }

                    function onColorPickerChange(hex) {
                        var h = document.getElementById('embHexInput');
                        if (h) h.value = hex.toUpperCase();
                        updateEmbedPreview();
                    }

                    function setCustomHex(hex) {
                        if (/^#[0-9A-F]{6}$/i.test(hex)) {
                            var c = document.getElementById('embColor');
                            if (c) c.value = hex;
                            updateEmbedPreview();
                        }
                    }

                    function addEmbedField() {
                        var id = 'f_' + Date.now();
                        embedFields.push({ id: id, name: '', value: '', inline: false });
                        renderFieldsEditor();
                        updateEmbedPreview();
                        showFixedToast('\u2705 \u062a\u0645 \u0625\u0636\u0627\u0641\u0629 \u062d\u0642\u0644 \u0645\u062e\u0635\u0635 \u062c\u062f\u064a\u062f', true);
                    }

                    function removeEmbedField(id) {
                        embedFields = embedFields.filter(function(f) { return f.id !== id; });
                        renderFieldsEditor();
                        updateEmbedPreview();
                        showFixedToast('\uD83D\uDDD1\uFE0F \u062a\u0645 \u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u062d\u0642\u0644', false);
                    }

                    function updateFieldData(id, key, val) {
                        var field = embedFields.find(function(f) { return f.id === id; });
                        if (field) {
                            field[key] = val;
                            updateEmbedPreview();
                        }
                    }

                    function renderFieldsEditor() {
                        var c = document.getElementById('fieldsContainer');
                        if (!c) return;
                        if (embedFields.length === 0) {
                            c.innerHTML = '<div class=\"text-[11px] text-gray-500 text-center py-3 bg-[#070d1d]/40 rounded-2xl border border-dashed border-blue-500/20\">' +
                                '\u0644\u0627 \u062a\u0648\u062c\u062f \u062d\u0642\u0648\u0644 \u0625\u0636\u0627\u0641\u064a\u0629 \u062d\u0627\u0644\u064a\u0627\u064b\u060c \u0627\u0636\u063a\u0637 \u0022+ \u0625\u0636\u0627\u0641\u0629 \u062d\u0642\u0644 \u062c\u062f\u064a\u062f\u0022 \u0644\u0625\u0636\u0627\u0641\u0629 \u062d\u0642\u0648\u0644 \u0645\u062e\u0635\u0635\u0629</div>';
                            return;
                        }
                        var html = '';
                        for (var i = 0; i < embedFields.length; i++) {
                            var f = embedFields[i];
                            html += '<div class=\"bg-[#070d1d] border border-blue-500/20 p-3.5 rounded-2xl space-y-2.5\">' +
                                '<div class=\"flex items-center justify-between\">' +
                                '<div class=\"flex items-center gap-2\">' +
                                '<label class=\"text-[11px] text-blue-200 font-bold flex items-center gap-1.5 cursor-pointer bg-[#0b1322] px-2.5 py-1 rounded-xl border border-blue-500/20\">' +
                                '<input type=\"checkbox\" ' + (f.inline ? 'checked' : '') + ' onchange=\"window.updateFieldData(\\\'' + f.id + '\\\', \\\'inline\\\', this.checked)\" class=\"rounded bg-[#151724] border-blue-500/20 text-blue-400 focus:ring-0 cursor-pointer\">' +
                                '<span>\u062c\u0646\u0628\u0627\u064b \u0644\u062c\u0646\u0628 (Inline)</span>' +
                                '</label>' +
                                '<button type=\"button\" onclick=\"window.removeEmbedField(\\\'' + f.id + '\\\');\" class=\"text-rose-400 hover:text-rose-300 text-xs px-2.5 py-1 rounded-xl bg-rose-950/40 border border-rose-800/40 font-bold cursor-pointer transition\">\u2715 \u062d\u0630\u0641</button>' +
                                '</div>' +
                                '<span class=\"text-xs font-black text-blue-400 font-mono\">\u0627\u0644\u062d\u0642\u0644 #' + (i + 1) + '</span>' +
                                '</div>' +
                                '<div class=\"grid grid-cols-1 md:grid-cols-2 gap-2\">' +
                                '<div><input type=\"text\" placeholder=\"\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062d\u0642\u0644...\" value=\"' + (f.name || '').replace(/"/g, '&quot;') + '\" oninput=\"window.updateFieldData(\\\'' + f.id + '\\\', \\\'name\\\', this.value)\" class=\"w-full bg-[#0b1322] border border-blue-500/20 focus:border-blue-400 rounded-xl px-3 py-2 text-xs text-white text-right outline-none font-bold\"></div>' +
                                '<div><input type=\"text\" placeholder=\"\u0645\u062d\u062a\u0648\u0649 \u0627\u0644\u062d\u0642\u0644...\" value=\"' + (f.value || '').replace(/"/g, '&quot;') + '\" oninput=\"window.updateFieldData(\\\'' + f.id + '\\\', \\\'value\\\', this.value)\" class=\"w-full bg-[#0b1322] border border-blue-500/20 focus:border-blue-400 rounded-xl px-3 py-2 text-xs text-white text-right outline-none\"></div>' +
                                '</div>' +
                                '</div>';
                        }
                        c.innerHTML = html;
                    }

                    function updateEmbedPreview() {
                        var embColor = document.getElementById('embColor');
                        var color = embColor ? embColor.value : '#60a5fa';
                        var embAuthor = document.getElementById('embAuthor');
                        var author = embAuthor ? (embAuthor.value || '').trim() : '';
                        var embTitle = document.getElementById('embTitle');
                        var title = embTitle ? (embTitle.value || '').trim() : '';
                        var embDesc = document.getElementById('embDesc');
                        var desc = embDesc ? (embDesc.value || '').trim() : '';
                        var embImage = document.getElementById('embImage');
                        var image = embImage ? (embImage.value || '').trim() : '';
                        var embThumbnail = document.getElementById('embThumbnail');
                        var thumbnail = embThumbnail ? (embThumbnail.value || '').trim() : '';
                        var embFooter = document.getElementById('embFooter');
                        var footer = embFooter ? (embFooter.value || '').trim() : '';
                        var embTimestampToggle = document.getElementById('embTimestampToggle');
                        var showTimestamp = embTimestampToggle ? embTimestampToggle.checked : false;

                        var previewBox = document.getElementById('previewEmbedBox');
                        if (previewBox) {
                            previewBox.style.borderLeftColor = color;
                            previewBox.style.borderRightColor = color;
                        }

                        var prevAuthorRow = document.getElementById('prevAuthorRow');
                        var prevAuthorText = document.getElementById('prevAuthorText');
                        if (prevAuthorRow) {
                            if (author) {
                                prevAuthorRow.classList.remove('hidden');
                                prevAuthorRow.classList.add('flex');
                                if (prevAuthorText) prevAuthorText.textContent = author;
                            } else {
                                prevAuthorRow.classList.add('hidden');
                                prevAuthorRow.classList.remove('flex');
                            }
                        }

                        var prevTitle = document.getElementById('prevTitle');
                        if (prevTitle) {
                            if (title) { prevTitle.style.display = 'block'; prevTitle.textContent = title; }
                            else { prevTitle.style.display = 'none'; prevTitle.textContent = ''; }
                        }

                        var prevThumbnailWrap = document.getElementById('prevThumbnailWrap');
                        var prevThumbnailImg = document.getElementById('prevThumbnailImg');
                        if (prevThumbnailWrap && prevThumbnailImg) {
                            if (thumbnail) { prevThumbnailImg.src = thumbnail; prevThumbnailWrap.classList.remove('hidden'); }
                            else { prevThumbnailImg.src = ''; prevThumbnailWrap.classList.add('hidden'); }
                        }

                        var prevDesc = document.getElementById('prevDesc');
                        if (prevDesc) prevDesc.textContent = desc || '\u0645\u062d\u062a\u0648\u0649 \u0627\u0644\u0625\u064a\u0645\u0628\u062f \u0633\u064a\u0638\u0647\u0631 \u0647\u0646\u0627 \u0645\u0628\u0627\u0634\u0631\u0629...';

                        var prevFieldsGrid = document.getElementById('prevFieldsGrid');
                        if (prevFieldsGrid) {
                            var validFields = embedFields.filter(function(f) { return f.name || f.value; });
                            if (validFields.length > 0) {
                                prevFieldsGrid.classList.remove('hidden');
                                var fieldsHtml = '';
                                for (var fi = 0; fi < validFields.length; fi++) {
                                    var ff = validFields[fi];
                                    fieldsHtml += '<div class=\"' + (ff.inline ? 'col-span-1' : 'col-span-2') + ' bg-black/20 p-2 rounded-lg text-right\">' +
                                        '<div class=\"text-[11px] font-bold text-blue-200\">' + (ff.name || '\u062d\u0642\u0644') + '</div>' +
                                        '<div class=\"text-[11px] text-blue-300\">' + (ff.value || '...') + '</div>' +
                                        '</div>';
                                }
                                prevFieldsGrid.innerHTML = fieldsHtml;
                            } else { prevFieldsGrid.classList.add('hidden'); }
                        }

                        var prevImageRow = document.getElementById('prevImageRow');
                        var prevMainImg = document.getElementById('prevMainImg');
                        if (prevImageRow && prevMainImg) {
                            if (image) { prevMainImg.src = image; prevImageRow.classList.remove('hidden'); }
                            else { prevImageRow.classList.add('hidden'); }
                        }

                        var prevFooterText = document.getElementById('prevFooterText');
                        var prevTimestamp = document.getElementById('prevTimestamp');
                        var prevFooterDot = document.getElementById('prevFooterDot');
                        if (prevFooterText) prevFooterText.textContent = footer || '';
                        if (prevTimestamp) {
                            if (showTimestamp) {
                                prevTimestamp.textContent = '\u0627\u0644\u064a\u0648\u0645 \u0641\u064a ' + new Date().toLocaleTimeString((window._dropletIsEn && window._dropletIsEn() ? 'en-US' : 'ar-SA'), { hour: '2-digit', minute: '2-digit' });
                                if (prevFooterDot) prevFooterDot.classList.toggle('hidden', !footer);
                            } else {
                                prevTimestamp.textContent = '';
                                if (prevFooterDot) prevFooterDot.classList.add('hidden');
                            }
                        }
                    }

                    function clearEmbedFields() {
                        ['embTitle','embDesc','embAuthor','embImage','embThumbnail','embFooter'].forEach(function(id) {
                            var el = document.getElementById(id); if (el) el.value = '';
                        });
                        var ts = document.getElementById('embTimestampToggle');
                        if (ts) ts.checked = true;
                        ['embThumbnail','embImage'].forEach(function(id) {
                            var boxImg = document.getElementById('prev_' + id + '_box');
                            var ph = document.getElementById('ph_' + id);
                            if (boxImg) { boxImg.src = ''; boxImg.classList.add('hidden'); }
                            if (ph) ph.classList.remove('hidden');
                            var fileInp = document.getElementById('file_' + id);
                            if (fileInp) fileInp.value = '';
                        });
                        embedFields = [];
                        renderFieldsEditor();
                        selectColor('#60a5fa');
                        updateEmbedPreview();
                        showFixedToast('\uD83D\uDDD1\uFE0F \u062a\u0645 \u0645\u0633\u062d \u062c\u0645\u064a\u0639 \u0645\u062d\u062a\u0648\u064a\u0627\u062a \u0627\u0644\u0625\u064a\u0645\u0628\u062f', true);
                    }

                    function saveEmbedDraft() {
                        var payload = getEmbedPayload();
                        try {
                            localStorage.setItem('droplet_embed_draft_${guildId}', JSON.stringify(payload));
                            showFixedToast('\uD83D\uDCBE \u062a\u0645 \u062d\u0641\u0638 \u0627\u0644\u0645\u0633\u0648\u062f\u0629 \u0641\u064a \u0627\u0644\u0645\u062a\u0635\u0641\u062d \u0628\u0646\u062c\u0627\u062d!', true);
                        } catch(e) {
                            showFixedToast('\u274C \u0641\u0634\u0644 \u062d\u0641\u0638 \u0627\u0644\u0645\u0633\u0648\u062f\u0629', false);
                        }
                    }

                    function getEmbedPayload() {
                        function g(id) { return document.getElementById(id); }
                        return {
                            channelId: (g('embedChannel') || {}).value || '',
                            color: (g('embColor') || {}).value || '#60a5fa',
                            title: ((g('embTitle') || {}).value || '').trim(),
                            titleUrl: '',
                            desc: ((g('embDesc') || {}).value || '').trim(),
                            author: ((g('embAuthor') || {}).value || '').trim(),
                            authorIcon: '',
                            image: ((g('embImage') || {}).value || '').trim(),
                            thumbnail: ((g('embThumbnail') || {}).value || '').trim(),
                            footer: ((g('embFooter') || {}).value || '').trim(),
                            footerIcon: '',
                            timestamp: (g('embTimestampToggle') || {}).checked !== false,
                            fields: embedFields.filter(function(f) { return f.name || f.value; })
                        };
                    }

                    async function sendEmbedDirect() {
                        var payload = getEmbedPayload();
                        if (!payload.channelId) {
                            showFixedToast('\u26A0\uFE0F \u064a\u0631\u062c\u0649 \u0627\u062e\u062a\u064a\u0627\u0631 \u0627\u0644\u0642\u0646\u0627\u0629 \u0627\u0644\u0645\u0633\u062a\u0647\u062f\u0641\u0629 \u0623\u0648\u0644\u0627\u064b \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629!', false);
                            return;
                        }
                        if (!payload.desc && !payload.title) {
                            showFixedToast('\u26A0\uFE0F \u064a\u0631\u062c\u0649 \u0643\u062a\u0627\u0628\u0629 \u0639\u0646\u0648\u0627\u0646 \u0623\u0648 \u0645\u062d\u062a\u0648\u0649 \u0642\u0628\u0644 \u0627\u0644\u0625\u0631\u0633\u0627\u0644!', false);
                            return;
                        }
                        var btn = document.getElementById('btnSendEmbed');
                        var origHtml = btn ? btn.innerHTML : '';
                        if (btn) { btn.disabled = true; btn.innerHTML = '<span>\u23F3</span><span>\u062c\u0627\u0631\u064a \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0625\u064a\u0645\u0628\u062f...</span>'; }
                        try {
                            var res = await fetch('/api/guild/${guildId}/send-embed', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                            var data = await res.json();
                            if (data.success) {
                                showFixedToast('\u2705 \u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0625\u064a\u0645\u0628\u062f \u0628\u0646\u062c\u0627\u062d!', true);
                            } else {
                                showFixedToast('\u274C ' + (data.error || '\u0641\u0634\u0644 \u0627\u0644\u0625\u0631\u0633\u0627\u0644'), false);
                            }
                        } catch(e) {
                            console.error('[sendEmbedDirect] error:', e);
                            showFixedToast('\u274C \u062e\u0637\u0623 \u0641\u064a \u0627\u0644\u0627\u062a\u0635\u0627\u0644', false);
                        } finally {
                            if (btn) { btn.disabled = false; btn.innerHTML = origHtml || '<span>\uD83D\uDE80</span><span>\u0625\u0631\u0633\u0627\u0644 \u0644\u0644\u0642\u0646\u0627\u0629 \u0627\u0644\u0622\u0646</span>'; }
                        }
                    }

                    async function uploadEmbedImageFile(input, targetId) {
                        var file = input.files && input.files[0];
                        if (!file) return;
                        if (!file.type.startsWith('image/')) {
                            showFixedToast('\u274C \u064a\u0631\u062c\u0649 \u0627\u062e\u062a\u064a\u0627\u0631 \u0645\u0644\u0641 \u0635\u0648\u0631\u0629 \u0635\u0627\u0644\u062d', false);
                            return;
                        }
                        if (file.size > 15 * 1024 * 1024) {
                            showFixedToast('\u274C \u062d\u062c\u0645 \u0627\u0644\u0635\u0648\u0631\u0629 \u0643\u0628\u064a\u0631 \u062c\u062f\u0627\u064b', false);
                            return;
                        }
                        // Instant local preview
                        var localUrl = URL.createObjectURL(file);
                        var boxImg = document.getElementById('prev_' + targetId + '_box');
                        var ph = document.getElementById('ph_' + targetId);
                        if (boxImg) { boxImg.src = localUrl; boxImg.classList.remove('hidden'); }
                        if (ph) ph.classList.add('hidden');
                        var hiddenInput = document.getElementById(targetId);
                        if (hiddenInput) hiddenInput.value = localUrl;
                        updateEmbedPreview();

                        var btnText = document.getElementById('btn_text_' + targetId);
                        var origText = btnText ? btnText.innerText : '\u0631\u0641\u0639';
                        if (btnText) btnText.innerText = '\u062c\u0627\u0631\u064a \u0627\u0644\u0631\u0641\u0639... \u23F3';

                        var reader = new FileReader();
                        reader.onload = async function(e) {
                            try {
                                var res = await fetch('/api/guild/${guildId}/upload-image', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ imageBase64: e.target.result, fieldName: targetId })
                                });
                                var data = await res.json();
                                if (data.success && data.url) {
                                    if (hiddenInput) hiddenInput.value = data.url;
                                    if (boxImg) boxImg.src = data.url;
                                    updateEmbedPreview();
                                    if (btnText) btnText.innerText = '\u2705 \u062a\u0645 \u0627\u0644\u0631\u0641\u0639';
                                    showFixedToast('\u2705 \u062a\u0645 \u0631\u0641\u0639 \u0627\u0644\u0635\u0648\u0631\u0629 \u0628\u0646\u062c\u0627\u062d!', true);
                                    setTimeout(function() { if (btnText) btnText.innerText = origText; }, 2000);
                                    URL.revokeObjectURL(localUrl);
                                } else {
                                    showFixedToast('\u26A0\uFE0F \u062a\u0639\u0630\u0651\u0631 \u0631\u0641\u0639 \u0627\u0644\u0635\u0648\u0631\u0629: ' + (data.error || '\u062e\u0637\u0623'), false);
                                    if (btnText) btnText.innerText = origText;
                                }
                            } catch(err) {
                                showFixedToast('\u26A0\uFE0F \u062e\u0637\u0623 \u0641\u064a \u0627\u0644\u0627\u062a\u0635\u0627\u0644 \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u0631\u0641\u0639', false);
                                if (btnText) btnText.innerText = origText;
                            }
                        };
                        reader.readAsDataURL(file);
                    }

                    function clearEmbedImageField(targetId) {
                        var el = document.getElementById(targetId);
                        if (el) el.value = '';
                        var fileInp = document.getElementById('file_' + targetId);
                        if (fileInp) fileInp.value = '';
                        var boxImg = document.getElementById('prev_' + targetId + '_box');
                        var ph = document.getElementById('ph_' + targetId);
                        if (boxImg) { boxImg.src = ''; boxImg.classList.add('hidden'); }
                        if (ph) ph.classList.remove('hidden');
                        updateEmbedPreview();
                        showFixedToast('\uD83D\uDDD1\uFE0F \u062a\u0645 \u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0635\u0648\u0631\u0629', true);
                    }

                    function initEmbedEditor() {
                        console.log('[Embed Editor] Initializing...');
                        renderFieldsEditor();
                        try {
                            var saved = localStorage.getItem('droplet_embed_draft_${guildId}');
                            if (saved) {
                                var d = JSON.parse(saved);
                                function setVal(id, val) { var el = document.getElementById(id); if (el && val !== undefined) el.value = val; }
                                setVal('embTitle', d.title);
                                setVal('embDesc', d.desc);
                                setVal('embAuthor', d.author);
                                setVal('embFooter', d.footer);
                                if (d.image) {
                                    setVal('embImage', d.image);
                                    var bi = document.getElementById('prev_embImage_box');
                                    var pi = document.getElementById('ph_embImage');
                                    if (bi) { bi.src = d.image; bi.classList.remove('hidden'); }
                                    if (pi) pi.classList.add('hidden');
                                }
                                if (d.thumbnail) {
                                    setVal('embThumbnail', d.thumbnail);
                                    var bt = document.getElementById('prev_embThumbnail_box');
                                    var pt = document.getElementById('ph_embThumbnail');
                                    if (bt) { bt.src = d.thumbnail; bt.classList.remove('hidden'); }
                                    if (pt) pt.classList.add('hidden');
                                }
                                if (d.color) selectColor(d.color);
                                if (Array.isArray(d.fields)) { embedFields = d.fields; renderFieldsEditor(); }
                            }
                        } catch(e) { console.warn('[Embed Editor] Draft load error:', e); }
                        updateEmbedPreview();

                        var btnSend = document.getElementById('btnSendEmbed');
                        var btnSave = document.getElementById('btnSaveEmbedDraft');
                        var btnClear = document.getElementById('btnClearEmbed');
                        if (btnSend) btnSend.onclick = function(ev) { ev.preventDefault(); ev.stopPropagation(); sendEmbedDirect(); return false; };
                        if (btnSave) btnSave.onclick = function(ev) { ev.preventDefault(); ev.stopPropagation(); saveEmbedDraft(); return false; };
                        if (btnClear) btnClear.onclick = function(ev) { ev.preventDefault(); ev.stopPropagation(); clearEmbedFields(); return false; };

                        ['embTitle','embDesc','embAuthor','embFooter'].forEach(function(id) {
                            var el = document.getElementById(id);
                            if (el) el.addEventListener('input', updateEmbedPreview);
                        });
                        var colorInput = document.getElementById('embColor');
                        if (colorInput) colorInput.addEventListener('input', function(ev) { onColorPickerChange(ev.target.value); });
                        var hexInput = document.getElementById('embHexInput');
                        if (hexInput) hexInput.addEventListener('input', function(ev) { setCustomHex(ev.target.value); });
                        var tsToggle = document.getElementById('embTimestampToggle');
                        if (tsToggle) tsToggle.addEventListener('change', updateEmbedPreview);
                        var fThumb = document.getElementById('file_embThumbnail');
                        if (fThumb) fThumb.addEventListener('change', function() { uploadEmbedImageFile(this, 'embThumbnail'); });
                        var fImg = document.getElementById('file_embImage');
                        if (fImg) fImg.addEventListener('change', function() { uploadEmbedImageFile(this, 'embImage'); });
                        console.log('[Embed Editor] Ready \u2705');
                    }

                    // ✅ CRITICAL: expose to window IMMEDIATELY
                    window.selectColor = selectColor;
                    window.onColorPickerChange = onColorPickerChange;
                    window.setCustomHex = setCustomHex;
                    window.addEmbedField = addEmbedField;
                    window.removeEmbedField = removeEmbedField;
                    window.updateFieldData = updateFieldData;
                    window.renderFieldsEditor = renderFieldsEditor;
                    window.updateEmbedPreview = updateEmbedPreview;
                    window.clearEmbedFields = clearEmbedFields;
                    window.saveEmbedDraft = saveEmbedDraft;
                    window.getEmbedPayload = getEmbedPayload;
                    window.sendEmbedDirect = sendEmbedDirect;
                    window.uploadEmbedImageFile = uploadEmbedImageFile;
                    window.clearEmbedImageField = clearEmbedImageField;
                    window.initEmbedEditor = initEmbedEditor;

                    if (document.readyState === 'loading') {
                        window.addEventListener('DOMContentLoaded', initEmbedEditor);
                    } else {
                        initEmbedEditor();
                    }
                `
            } else if (section === 'staff_system') {
                const ranks = database.getStaffRanks ? database.getStaffRanks(guildId) : [];
                const tasks = database.getStaffTasks ? database.getStaffTasks(guildId) : [];
                const leaderboard = database.getStaffLeaderboard ? database.getStaffLeaderboard(guildId, 10) : [];
                const enrichedLeaderboard = await Promise.all(leaderboard.map(async (s) => {
                    let member = botGuild?.members?.cache?.get(s.user_id);
                    if (!member && botGuild?.members?.fetch) {
                        try { member = await botGuild.members.fetch(s.user_id); } catch(e) {}
                    }
                    const profile = database.getUserProfile ? database.getUserProfile(s.user_id) : null;
                    const avatar = member?.user?.displayAvatarURL?.({ size: 64 }) || profile?.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png';
                    const displayName = member?.displayName || profile?.display_name || member?.user?.username || profile?.username || `مشرف (${String(s.user_id).slice(-4)})`;
                    const username = member?.user?.tag || profile?.username || s.user_id;
                    return { ...s, avatar, displayName, username };
                }));

                // ─── Fallback: إذا ما في نشاط مسجل، نعرض المدراء والأدمنز من السيرفر بـ 0 نقاط ───
                if (enrichedLeaderboard.length === 0 && botGuild?.members?.cache) {
                    const { PermissionsBitField } = require('discord.js');
                    const settings = database.getGuildSettings ? database.getGuildSettings(guildId) : null;
                    let staffRoleIds = [];
                    try { staffRoleIds = JSON.parse(settings?.staff_roles || '[]'); } catch(e) {}
                    const fallbackMembers = botGuild.members.cache
                        .filter(m => !m.user.bot && (
                            m.permissions.has(PermissionsBitField.Flags.Administrator) ||
                            m.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
                            staffRoleIds.some(rid => m.roles.cache.has(rid))
                        ))
                        .first(10);
                    const fbArr = Array.isArray(fallbackMembers) ? fallbackMembers : (fallbackMembers ? [fallbackMembers] : []);
                    for (const m of fbArr) {
                        enrichedLeaderboard.push({
                            user_id: m.user.id,
                            avatar: m.user.displayAvatarURL({ size: 64 }),
                            displayName: m.displayName || m.user.username,
                            username: m.user.tag || m.user.username,
                            tickets_closed: 0, mod_actions: 0, points: 0
                        });
                    }
                }

                const enrichedRanks = ranks.map(r => {
                    const role = botGuild?.roles?.cache?.get(r.role_id);
                    return { ...r, roleName: role ? `@${role.name}` : `@رتبة (${r.role_id.slice(-4)})`, roleColor: role?.hexColor && role.hexColor !== '#000000' ? role.hexColor : '#60a5fa' };
                });

                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">
                        <div class="bg-gradient-to-r from-blue-700/30 to-indigo-900/30 border border-blue-500/20 p-5 rounded-2xl">
                            <h3 class="text-lg font-black text-white">👮 نظام إدارة الستاف والترقيات التلقائية</h3>
                            <p class="text-xs text-white mt-1">متابعة نقاط الإداريين، رتب الترقية التلقائية، ومهام العمل الإداري.</p>
                        </div>

                        <!-- 1. Auto Promotion Ranks Form & List -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl">
                            <h4 class="text-sm font-black text-white mb-4 flex items-center gap-2">
                                <span>🎖️ سلم رتب الترقية التلقائية</span>
                            </h4>
                            
                            <!-- Add Rank Form -->
                            <div class="bg-[#070d1d] border border-blue-500/20 p-4 rounded-xl mb-4">
                                <h5 class="text-xs font-bold text-white mb-3">➕ إضافة رتبة ترقية تلقائية جديدة</h5>
                                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <label class="block text-[11px] text-white mb-1">الرتبة في السيرفر</label>
                                        <select id="new_rank_role" class="w-full bg-[#101c33] border border-blue-500/20 rounded-lg p-2 text-xs text-white">
                                            <option value="">...اختر الرتبة</option>
                                            ${guildRoles.map(r => `<option value="${r.id}">@ ${r.name}</option>`).join('')}
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-[11px] text-white mb-1">النقاط المطلوبة</label>
                                        <input type="number" id="new_rank_points" min="1" placeholder="مثال: 100" class="w-full bg-[#101c33] border border-blue-500/20 rounded-lg p-2 text-xs text-white">
                                    </div>
                                    <div>
                                        <label class="block text-[11px] text-white mb-1">اسم مخصص للرتبة</label>
                                        <input type="text" id="new_rank_name" placeholder="مثال: مشرف أول" class="w-full bg-[#101c33] border border-blue-500/20 rounded-lg p-2 text-xs text-white">
                                    </div>
                                </div>
                                <button type="button" onclick="handleAddStaffRank('${guildId}')" class="mt-3 px-4 py-2 bg-gradient-to-l from-purple-600 to-blue-500 hover:bg-gradient-to-l from-purple-600 to-blue-500 text-white rounded-lg text-xs font-bold transition">
                                    إضافة رتبة الترقية ✅
                                </button>
                            </div>

                            ${enrichedRanks.length === 0 ? `
                                <p class="text-xs text-gray-500">لا توجد رتب ترقية تلقائية مضبوطة بعد. استخدم النموذج أعلاه لإضافة أول رتبة.</p>
                            ` : `
                                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    ${enrichedRanks.map((r, i) => `
                                        <div class="bg-[#070d1d] border border-blue-500/20 p-3 rounded-xl flex flex-col justify-between">
                                            <div>
                                                <div class="flex items-center justify-between">
                                                    <span class="text-xs font-bold text-white">${r.rank_name || 'رتبة ترقية'}</span>
                                                    <span class="text-[10px] text-blue-400 font-mono font-bold">#${i + 1}</span>
                                                </div>
                                                <p class="text-xs text-emerald-400 font-bold mt-1">⭐ ${r.required_points} نقطة</p>
                                                <div class="mt-1 flex items-center gap-1.5">
                                                    <span class="text-[11px] font-bold px-2 py-0.5 rounded-lg border border-white/10" style="color: ${r.roleColor}; background-color: ${r.roleColor}15;">${r.roleName}</span>
                                                </div>
                                            </div>
                                            <button type="button" onclick="handleDeleteStaffRank('${guildId}', '${r.role_id}')" class="mt-2 text-left text-[11px] text-red-400 hover:text-red-300 font-bold">حذف 🗑️</button>
                                        </div>
                                    `).join('')}
                                </div>
                            `}
                        </div>

                        <!-- 2. Staff Leaderboard -->
                        <div class="bg-[#0b1322] border border-blue-500/20 p-6 rounded-2xl">
                            <h4 class="text-sm font-black text-amber-300 mb-4 flex items-center gap-2">
                                <span>🏆 متصدري طاقم الإدارة (Staff Leaderboard)</span>
                            </h4>
                            <div class="space-y-2">
                                ${enrichedLeaderboard.length === 0 ? '<p class="text-xs text-gray-500">لا يوجد نشاط مسجل للستاف بعد.</p>' : enrichedLeaderboard.map((s, idx) => `
                                    <div class="flex items-center justify-between p-3 bg-[#070d1d] border border-blue-500/20 rounded-xl text-xs hover:border-blue-400/30 transition">
                                        <div class="flex items-center gap-3">
                                            <span class="font-bold text-amber-400 font-mono w-5 text-center">#${idx + 1}</span>
                                            <img src="${s.avatar}" alt="${s.displayName}" class="w-8 h-8 rounded-full border border-blue-500/30 object-cover" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                                            <div class="text-right">
                                                <span class="text-white font-bold block">${s.displayName}</span>
                                                <span class="text-[10px] text-gray-400 font-mono block">@${s.username}</span>
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-4 text-white">
                                            <span class="bg-blue-950/40 border border-blue-500/20 px-2 py-1 rounded-lg">🎫 ${s.tickets_closed} تذكرة</span>
                                            <span class="bg-blue-950/40 border border-blue-500/20 px-2 py-1 rounded-lg">🔨 ${s.mod_actions} إجراء</span>
                                            <span class="text-amber-300 font-bold font-mono bg-amber-500/10 border border-amber-500/30 px-2 py-1 rounded-lg">⭐ ${s.points || 0} نقطة</span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    <script>
                        async function handleAddStaffRank(guildId) {
                            const roleId = document.getElementById('new_rank_role').value;
                            const points = parseInt(document.getElementById('new_rank_points').value, 10);
                            const name = document.getElementById('new_rank_name').value.trim();
                            if (!roleId || !points) return alert('يرجى اختيار الرتبة وتحديد النقاط');
                            try {
                                const res = await fetch('/api/staff/ranks', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ guildId, roleId, points, name })
                                });
                                const d = await res.json();
                                if (d.success) location.reload();
                                else alert(d.message || 'فشلت الإضافة');
                            } catch(e) { alert('خطأ في الاتصال'); }
                        }
                        async function handleDeleteStaffRank(guildId, roleId) {
                            if (!confirm('هل أنت متأكد من حذف هذه الرتبة؟')) return;
                            try {
                                const res = await fetch('/api/staff/ranks/delete', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ guildId, roleId })
                                });
                                const d = await res.json();
                                if (d.success) location.reload();
                            } catch(e) { alert('خطأ في الاتصال'); }
                        }
                    </script>
                `;
            } else if (section === 'custom_shop') {
                const customRoles = database.db.prepare('SELECT * FROM custom_roles WHERE guild_id = ?').all(guildId);
                const rentedChannels = database.db.prepare('SELECT * FROM rented_channels WHERE guild_id = ?').all(guildId);
                let shopSettings = { customRole: { enabled: true, price: 500, duration: 30 }, voiceRoom: { enabled: true, price: 800, duration: 30 }, textRoom: { enabled: true, price: 600, duration: 30 }, badge: { enabled: false, price: 200, duration: 0 } };
                try { if (settings.shop_items) shopSettings = JSON.parse(settings.shop_items); } catch(e) {}

                formFieldsHtml = `
                    <div class="space-y-6 text-right" dir="rtl">

                        <!-- Header -->
                        <div class="bg-gradient-to-r from-amber-900/30 to-orange-900/20 border border-amber-500/20 p-5 rounded-2xl flex items-center gap-4">
                            <span class="text-4xl">🏪</span>
                            <div>
                                <h3 class="text-lg font-black text-white">متجر السيرفر</h3>
                                <p class="text-xs text-white mt-1">تحكم في عناصر المتجر وأسعارها — الأعضاء يشترون بالـ Gold عبر أمر <code class="text-amber-300 bg-black/30 px-1 rounded">#shop view</code></p>
                            </div>
                        </div>

                        <!-- Shop Channel Selector -->
                        <div class="bg-[#0b0d14] border border-amber-500/20 p-5 rounded-2xl">
                            <div class="flex items-center gap-3 mb-4">
                                <span class="text-2xl">📢</span>
                                <div>
                                    <h4 class="text-sm font-black text-white">روم المتجر المخصص</h4>
                                    <p class="text-xs text-gray-400 mt-0.5">اختر القناة التي سيُرسل إليها embed المتجر ليتصفحه الأعضاء ويشتروا منه</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-3">
                                <select id="shop_channel_id" class="flex-1 bg-[#161824] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white">
                                    <option value="">...اختر القناة</option>
                                    ${guildTextChannels.map(c => `<option value="${c.id}" ${settings.shop_channel_id === c.id ? 'selected' : ''}>#${c.name}</option>`).join('')}
                                </select>
                                <button type="button" onclick="sendShopEmbed('${guildId}')" class="px-5 py-2.5 bg-gradient-to-l from-purple-600 to-blue-500 hover:opacity-90 text-white rounded-xl text-xs font-bold transition whitespace-nowrap shadow-md">
                                    📤 إرسال المتجر للروم
                                </button>
                            </div>
                            <p class="text-[11px] text-gray-400 mt-2">سيتم إرسال embed تفاعلي يعرض جميع عناصر المتجر وأسعارها في القناة المختارة</p>
                        </div>

                        <!-- Shop Items Config Grid -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

                            <!-- Custom Role Card -->
                            <div class="bg-[#0b1322] border border-blue-500/20 rounded-2xl overflow-hidden">
                                <div class="bg-gradient-to-r from-blue-700/40 to-indigo-900/30 px-5 py-4 flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <span class="text-2xl">👑</span>
                                        <div>
                                            <h4 class="text-sm font-black text-white">رتبة مخصصة</h4>
                                            <p class="text-[11px] text-white">Custom Role</p>
                                        </div>
                                    </div>
                                    <label class="toggle"><input type="checkbox" id="shop_role_enabled" ${shopSettings.customRole?.enabled ? 'checked' : ''}><span class="slider"></span></label>
                                </div>
                                <div class="p-5 space-y-3">
                                    <div class="flex items-center justify-between">
                                        <label class="text-xs text-white">السعر (Gold 🪙)</label>
                                        <input type="number" id="shop_role_price" value="${shopSettings.customRole?.price || 500}" min="1" class="w-28 bg-[#070d1d] border border-blue-500/20 rounded-lg px-3 py-1.5 text-xs text-amber-300 font-mono font-bold text-left">
                                    </div>
                                    <div class="flex items-center justify-between">
                                        <label class="text-xs text-white">المدة (أيام)</label>
                                        <input type="number" id="shop_role_days" value="${shopSettings.customRole?.duration || 30}" min="1" class="w-28 bg-[#070d1d] border border-blue-500/20 rounded-lg px-3 py-1.5 text-xs text-white font-mono text-left">
                                    </div>
                                    <p class="text-[11px] text-gray-500">يختار العضو الاسم واللون وتُنشأ الرتبة تلقائياً</p>
                                </div>
                            </div>


                            <!-- Badge/Cosmetic Card -->
                            <div class="bg-[#0b1322] border border-purple-500/20 rounded-2xl overflow-hidden">
                                <div class="bg-gradient-to-r from-purple-900/30 to-indigo-900/20 px-5 py-4 flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <span class="text-2xl">🎖️</span>
                                        <div>
                                            <h4 class="text-sm font-black text-white">شارة / لقب مخصص</h4>
                                            <p class="text-[11px] text-gray-400">Profile Badge / Title</p>
                                        </div>
                                    </div>
                                    <label class="toggle"><input type="checkbox" id="shop_badge_enabled" ${shopSettings.badge?.enabled ? 'checked' : ''}><span class="slider"></span></label>
                                </div>
                                <div class="p-5 space-y-3">
                                    <div class="flex items-center justify-between">
                                        <label class="text-xs text-white">السعر (Gold 🪙)</label>
                                        <input type="number" id="shop_badge_price" value="${shopSettings.badge?.price || 200}" min="1" class="w-28 bg-[#070d1d] border border-blue-500/20 rounded-lg px-3 py-1.5 text-xs text-amber-300 font-mono font-bold text-left">
                                    </div>
                                    <div class="flex items-center justify-between">
                                        <label class="text-xs text-white">المدة (0 = دائم)</label>
                                        <input type="number" id="shop_badge_days" value="${shopSettings.badge?.duration || 0}" min="0" class="w-28 bg-[#070d1d] border border-blue-500/20 rounded-lg px-3 py-1.5 text-xs text-white font-mono text-left">
                                    </div>
                                    <p class="text-[11px] text-gray-400">تظهر في بطاقة الهوية والبروفايل داخل الديسكورد</p>
                                </div>
                            </div>

                        </div>

                        <!-- Save Button -->
                        <button type="button" onclick="saveShopSettings('${guildId}')" class="w-full py-3.5 bg-gradient-to-l from-purple-600 to-blue-500 hover:opacity-95 text-white rounded-xl text-sm font-black transition shadow-lg shadow-purple-900/30">
                            💾 حفظ إعدادات المتجر
                        </button>

                        <!-- Manual Grant -->
                        <div class="bg-[#070d1d] border border-blue-500/20 p-5 rounded-2xl">
                            <h5 class="text-xs font-black text-white mb-4 flex items-center gap-2"><span>🎁</span> منح رتبة مخصصة لعضو يدوياً (بدون دفع)</h5>
                            <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
                                <div>
                                    <label class="block text-[11px] text-white mb-1">آيدي العضو</label>
                                    <input type="text" id="dash_role_user" placeholder="User ID" class="w-full bg-[#101c33] border border-blue-500/20 rounded-lg p-2 text-xs text-white font-mono">
                                </div>
                                <div>
                                    <label class="block text-[11px] text-white mb-1">اسم الرتبة</label>
                                    <input type="text" id="dash_role_name" placeholder="مثال: VIP King" class="w-full bg-[#101c33] border border-blue-500/20 rounded-lg p-2 text-xs text-white">
                                </div>
                                <div>
                                    <label class="block text-[11px] text-white mb-1">اللون HEX</label>
                                    <input type="color" id="dash_role_color" value="#60a5fa" class="w-full h-8 bg-[#101c33] border border-blue-500/20 rounded-lg cursor-pointer">
                                </div>
                                <div>
                                    <label class="block text-[11px] text-white mb-1">المدة (أيام)</label>
                                    <input type="number" id="dash_role_days" value="30" min="1" class="w-full bg-[#101c33] border border-blue-500/20 rounded-lg p-2 text-xs text-white">
                                </div>
                            </div>
                            <button type="button" onclick="handleCreateDashRole('${guildId}')" class="mt-3 px-5 py-2 bg-gradient-to-l from-purple-600 to-blue-500 hover:opacity-90 text-white rounded-lg text-xs font-bold transition shadow-md">
                                👑 منح الرتبة المخصصة
                            </button>
                        </div>

                        <!-- Active Items -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl">
                                <h4 class="text-sm font-black text-white mb-3">👑 الرتب الخاصة النشطة (${customRoles.length})</h4>
                                ${customRoles.length === 0 ? '<p class="text-xs text-gray-500">لا توجد رتب نشطة حالياً.</p>' : `
                                    <div class="space-y-2">
                                        ${customRoles.map(cr => `
                                            <div class="flex items-center justify-between p-3 bg-[#070d1d] border border-blue-500/20 rounded-xl text-xs">
                                                <div>
                                                    <span class="font-bold text-white block">${cr.role_name}</span>
                                                    <span class="text-[10px] text-white">&lt;@${cr.user_id}&gt;</span>
                                                </div>
                                                <div class="text-left">
                                                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold" style="background:${cr.role_color||'#60a5fa'};color:#ffffff;">${cr.role_color||'HEX'}</span>
                                                    <span class="text-[10px] text-gray-500 block mt-1">⏳ ${new Date(cr.expires_at * 1000).toLocaleDateString(dashDateLocale(req, 'ar-SA'))}</span>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                `}
                            </div>
                        <!-- Active Items -->
                        <div class="grid grid-cols-1 gap-4">
                            <div class="bg-[#0b1322] border border-blue-500/20 p-5 rounded-2xl">
                                <h4 class="text-sm font-black text-white mb-3">👑 الرتب الخاصة النشطة (${customRoles.length})</h4>
                                ${customRoles.length === 0 ? '<p class="text-xs text-gray-500">لا توجد رتب نشطة حالياً.</p>' : `
                                    <div class="space-y-2">
                                        ${customRoles.map(cr => `
                                            <div class="flex items-center justify-between p-3 bg-[#070d1d] border border-blue-500/20 rounded-xl text-xs">
                                                <div>
                                                    <span class="font-bold text-white block">${cr.role_name}</span>
                                                    <span class="text-[10px] text-white">&lt;@${cr.user_id}&gt;</span>
                                                </div>
                                                <div class="text-left">
                                                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold" style="background:${cr.role_color||'#60a5fa'};color:#ffffff;">${cr.role_color||'HEX'}</span>
                                                    <span class="text-[10px] text-gray-400 block mt-1">⏳ ${new Date(cr.expires_at * 1000).toLocaleDateString(dashDateLocale(req, 'ar-SA'))}</span>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                `}
                            </div>
                        </div>

                    </div>
                    <script>
                        async function sendShopEmbed(guildId) {
                            const channelId = document.getElementById('shop_channel_id').value;
                            if (!channelId) return alert('يرجى اختيار القناة أولاً');
                            if (!confirm('هل تريد إرسال embed المتجر إلى هذه القناة؟')) return;
                            try {
                                const res = await fetch('/api/shop/send-embed', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ guildId, channelId })
                                });
                                const d = await res.json();
                                if (d.success) {
                                    await fetch('/api/shop/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guildId, shopItems: null, shopChannelId: channelId }) });
                                    alert('✅ تم إرسال المتجر للقناة بنجاح!');
                                    location.reload();
                                } else alert(d.message || 'فشل الإرسال');
                            } catch(e) { alert('خطأ في الاتصال'); }
                        }
                        async function saveShopSettings(guildId) {
                            const data = {
                                guildId,
                                shopItems: {
                                    customRole: { enabled: document.getElementById('shop_role_enabled')?.checked || false, price: +(document.getElementById('shop_role_price')?.value || 500), duration: +(document.getElementById('shop_role_days')?.value || 30) },
                                    badge:      { enabled: document.getElementById('shop_badge_enabled')?.checked || false, price: +(document.getElementById('shop_badge_price')?.value || 200), duration: +(document.getElementById('shop_badge_days')?.value || 0) }
                                }
                            };
                            try {
                                const res = await fetch('/api/shop/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
                                const d = await res.json();
                                if (d.success) { alert('✅ تم حفظ إعدادات المتجر'); location.reload(); }
                                else alert(d.message || 'فشل الحفظ');
                            } catch(e) { alert('خطأ في الاتصال'); }
                        }
                        async function handleCreateDashRole(guildId) {
                            const userId = document.getElementById('dash_role_user').value.trim();
                            const roleName = document.getElementById('dash_role_name').value.trim();
                            const roleColor = document.getElementById('dash_role_color').value;
                            const days = parseInt(document.getElementById('dash_role_days').value, 10) || 30;
                            if (!userId || !roleName) return alert('يرجى كتابة آيدي العضو واسم الرتبة');
                            try {
                                const res = await fetch('/api/custom-roles/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guildId, userId, roleName, roleColor, days }) });
                                const d = await res.json();
                                if (d.success) location.reload();
                                else alert(d.message || 'فشل إنشاء الرتبة');
                            } catch(e) { alert('خطأ في الاتصال'); }
                        }
                    </script>
                `;
            } else {
                formFieldsHtml = `
                    <div class="space-y-5 text-right" dir="rtl">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2">برفكس الأوامر (Prefix)</label>
                                <input type="text" name="prefix" value="${settings.prefix || '#'}" class="w-full bg-[#070d1d] border border-blue-500/20 focus:border-blue-400 rounded-xl px-4 py-3 text-xs text-white outline-none text-right font-mono">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-300 mb-2">قناة السجلات (Log Channel)</label>
                                ${renderChannelSelect('log_channel', settings.log_channel || '')}
                            </div>
                        </div>
                    </div>
                `;
            }

            res.send(`
            <!DOCTYPE html>
            <html lang="en" dir="ltr" class="dark">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${guild.name} | Droplet Dashboard</title>
                <script src="https://cdn.tailwindcss.com"></script>

                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                <style>
                    :root {
                        --bg-main: #060c1d;
                        --bg-sidebar: #081026;
                        --bg-card: #0b1530;
                        --bg-card-hover: #101e44;
                        --primary: #2563eb;
                        --border: rgba(59, 130, 246, 0.28);
                    }
                    body { background-color: var(--bg-main) !important; color: #ffffff !important; font-family: 'Cairo', sans-serif !important; }
                    ::-webkit-scrollbar { width: 6px; height: 6px; }
                    ::-webkit-scrollbar-track { background: #060c1d; }
                    ::-webkit-scrollbar-thumb { background: #2563eb; border-radius: 10px; }
                    .probot-card { background: var(--bg-card) !important; border: 1px solid var(--border) !important; border-radius: 20px !important; }
                    .toggle { position: relative; display: inline-block; width: 44px; height: 24px; }
                    .toggle input { opacity: 0; width: 0; height: 0; }
                    .slider { position: absolute; cursor: pointer; inset: 0; background: #1e293b; border-radius: 24px; transition: .3s; border: 1px solid rgba(59, 130, 246, 0.3); }
                    .slider:before { content: ''; position: absolute; width: 18px; height: 18px; left: 2px; bottom: 2px; background: white; border-radius: 50%; transition: .3s; }
                    input:checked + .slider { background: linear-gradient(135deg, #a855f7, #2563eb); border-color: #3b82f6; }
                    input:checked + .slider:before { transform: translateX(20px); }
                /* Droplet blended headings */ h1[class*="text-white"]:not([style]), h2[class*="text-white"]:not([style]) { background:linear-gradient(90deg,#c084fc,#60a5fa); -webkit-background-clip:text; background-clip:text; color:transparent !important; }</style>
                <script src="/i18n.js"></script><script src="/i18n-dash.js"></script><script src="/i18n-dash2.js"></script>
            </head>
            <body data-droplet-manual-lang="true" class="min-h-screen flex flex-col bg-[#060c1d] text-white">
                <header class="h-16 bg-[#081026]/95 backdrop-blur-md border-b border-blue-500/20 px-6 flex items-center justify-between sticky top-0 z-40">
                    <div class="flex items-center gap-3">
                        <button type="button" onclick="window.dropletI18n.toggleLang()" class="droplet-lang-toggle-btn px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-blue-500/20 text-blue-100 rounded-xl transition flex items-center gap-1.5 cursor-pointer text-xs">
                            <span class="text-sm">🌐</span>
                            <span class="font-black text-xs uppercase tracking-wider">EN</span>
                        </button>
                        <span class="text-gray-700">|</span>
                        <a href="/dashboard/manage" data-i18n="back_to_dashboard" class="text-xs text-blue-400 font-bold hover:text-white transition">الرجوع للوحة التحكم</a>
                        <span class="text-gray-700">|</span>
                        <a href="https://discord.gg/zduGPYv7pE" target="_blank" data-i18n="support_server" class="text-xs text-white hover:text-blue-100 transition">الدعم الفني</a>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-black text-sm text-white tracking-wide">Droplet</span>
                        <img src="${botAvatarUrl}" class="w-8 h-8 rounded-xl object-cover ring-2 ring-blue-400/40 shadow-md shadow-blue-700/30">
                    </div>
                </header>

                <div class="flex-1 flex overflow-hidden">
                    
                    <!-- Main Content Form Area -->
                    <main class="flex-1 p-8 overflow-y-auto ${section === 'embed' ? 'max-w-7xl' : 'max-w-4xl'} mx-auto">
                        <div class="${section === 'logs' ? '' : 'probot-card border border-blue-500/20 rounded-3xl p-8 shadow-2xl mb-8'}">
                            <div class="flex items-center justify-between pb-6 mb-6 border-b border-blue-500/20${section === 'logs' ? ' hidden' : ''}">
                                <label class="toggle"><input type="checkbox" onchange="toggleModule('${guildId}', '${section === 'levels' ? 'leveling_enabled' : section + '_enabled'}', this.checked)" ${section === 'levels' ? (settings.leveling_enabled !== 0 ? 'checked' : '') : 'checked'}><span class="slider"></span></label>
                                <div class="text-right">
                                    <h2 class="text-2xl font-black text-white">${title}</h2>
                                    <p class="text-white text-xs mt-1">يتم تطبيق كل التعديلات وحفظها مباشرة في سيرفر الديسكورد لحظياً بدون إعادة تشغيل.</p>
                                </div>
                            </div>


                            ${(section === 'general' || section === 'commands' || section === 'store') ? `
                                <div id="settingsContainer" class="space-y-6">
                                    ${formFieldsHtml}
                                </div>
                            ` : `
                            <form id="settingsForm" class="space-y-6">
                                ${formFieldsHtml}

                                <div class="pt-6 border-t border-blue-500/20 flex items-center justify-between flex-row-reverse${(section === 'embed' || section === 'logs' || section === 'store') ? ' hidden' : ''}">
                                    <button type="submit" class="px-8 py-3 bg-gradient-to-r from-blue-400 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-black/20 flex items-center gap-2">
                                        <span>💾</span>
                                        <span>حفظ التغييرات</span>
                                    </button>
                                    <span id="saveStatus" class="text-xs text-emerald-400 font-bold hidden flex items-center gap-1.5">
                                        <span>✅</span>
                                        <span>تم الحفظ وتطبيق التغييرات في السيرفر بنجاح!</span>
                                    </span>
                                </div>
                            </form>
                            `}
                        </div>
                    </main>

                    <!-- Server Settings Navigation Sidebar (Novax Style) -->
                    <aside class="w-72 bg-[#060b16] border-l border-blue-500/20 flex flex-col shrink-0 h-full select-none">
                        
                        <!-- Server Card Top -->
                        <div class="p-3">
                            <div class="bg-[#0b1322] border border-blue-500/20 rounded-2xl p-3 flex items-center justify-between shadow-lg">
                                <div class="text-white text-xs">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/></svg>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="text-right">
                                        <h3 class="font-bold text-white text-xs truncate max-w-[130px]">${guild.name}</h3>
                                        <span class="text-[10px] text-white">الأعضاء: ${guild.memberCount || botGuild?.memberCount || 0}</span>
                                    </div>
                                    <div class="relative">
                                        <img src="${guildIcon}" class="w-10 h-10 rounded-xl bg-[#14233c] object-cover ring-2 ring-blue-400/50 shadow-md">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Categorized Scrollable Nav Menu -->
                        <div class="flex-1 overflow-y-auto px-3 py-2 space-y-4 text-xs text-right custom-scrollbar">

                            <!-- الأخيرة -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_recent')" class="w-full flex items-center justify-between text-white hover:text-gray-300 px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_recent" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>الأخيرة</span><span>🕒</span></span>
                                </button>
                                <div id="grp_sub_recent" class="space-y-1">
                                    <a href="/dashboard/${guildId}/welcome" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'welcome' ? 'bg-gradient-to-r from-[#a855f7] to-[#2563eb] text-white font-black shadow-md shadow-[#c084fc]/20' : 'text-gray-300 hover:text-white hover:bg-white/5'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الترحيب & المغادرة</span><span class="${section === 'welcome' ? 'text-white' : 'text-white group-hover:text-[#c084fc]'}">👋</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/autoresponder" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'autoresponder' ? 'bg-gradient-to-r from-[#a855f7] to-[#2563eb] text-white font-black shadow-md shadow-[#c084fc]/20' : 'text-gray-300 hover:text-white hover:bg-white/5'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الرد التلقائي</span><span class="${section === 'autoresponder' ? 'text-white' : 'text-white group-hover:text-[#c084fc]'}">💬</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/tickets" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'tickets' ? 'bg-gradient-to-r from-[#a855f7] to-[#2563eb] text-white font-black shadow-md shadow-[#c084fc]/20' : 'text-gray-300 hover:text-white hover:bg-white/5'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>نظام التذاكر</span><span class="${section === 'tickets' ? 'text-white' : 'text-white group-hover:text-[#c084fc]'}">🎫</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- عام -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_general')" class="w-full flex items-center justify-between text-white hover:text-gray-300 px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_general" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>عام</span></span>
                                </button>
                                <div id="grp_sub_general" class="space-y-1">
                                    <a href="/dashboard/${guildId}" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'overview' ? 'bg-gradient-to-r from-[#a855f7] to-[#2563eb] text-white font-black shadow-md shadow-[#c084fc]/20' : 'text-gray-300 hover:text-white hover:bg-white/5'} transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>نظرة عامة</span><span class="${section === 'overview' ? 'text-white' : 'text-white group-hover:text-[#c084fc]'}">🎛️</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/appearance" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'appearance' ? 'bg-gradient-to-r from-[#a855f7] to-[#2563eb] text-white font-black shadow-md shadow-[#c084fc]/20' : 'text-gray-300 hover:text-white hover:bg-white/5'} transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>مظهر البوت</span><span class="${section === 'appearance' ? 'text-white' : 'text-white group-hover:text-[#c084fc]'}">🎨</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/settings" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'settings' ? 'bg-gradient-to-r from-[#a855f7] to-[#2563eb] text-white font-black shadow-md shadow-[#c084fc]/20' : 'text-gray-300 hover:text-white hover:bg-white/5'} transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>الإعدادات</span><span class="${section === 'settings' ? 'text-white' : 'text-white group-hover:text-[#c084fc]'}">⚙️</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/analytics" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'analytics' || section === 'stats' ? 'bg-gradient-to-r from-[#a855f7] to-[#2563eb] text-white font-black shadow-md shadow-[#c084fc]/20' : 'text-gray-300 hover:text-white hover:bg-white/5'} transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>الإحصائيات</span><span class="${section === 'analytics' || section === 'stats' ? 'text-white' : 'text-white group-hover:text-[#c084fc]'}">📊</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/general" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'general' ? 'bg-gradient-to-r from-[#a855f7] to-[#2563eb] text-white font-black shadow-md shadow-[#c084fc]/20' : 'text-gray-300 hover:text-white hover:bg-white/5'} transition group">
                                        <span class="text-[9px] font-bold text-rose-400 bg-rose-950/60 px-1.5 py-0.2 rounded" data-i18n="جديد">جديد</span>
                                        <span class="flex items-center gap-2"><span>الأوامر</span><span class="${section === 'general' ? 'text-white' : 'text-white group-hover:text-[#c084fc]'}">⌨️</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/help" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'help' ? 'bg-gradient-to-r from-[#a855f7] to-[#2563eb] text-white font-black shadow-md shadow-[#c084fc]/20' : 'text-gray-300 hover:text-white hover:bg-white/5'} transition group">
                                        <span></span>
                                        <span class="flex items-center gap-2"><span>قائمة الأوامر</span><span class="${section === 'help' ? 'text-white' : 'text-white group-hover:text-[#c084fc]'}">📚</span></span>
                                    </a>

                                </div>
                            </div>

                            <!-- الرسائل والإمبد -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_messages')" class="w-full flex items-center justify-between text-white hover:text-gray-300 px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_messages" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>الرسائل والأمبد</span></span>
                                </button>
                                <div id="grp_sub_messages" class="space-y-1">
                                    <a href="/dashboard/${guildId}/embed" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'embed' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                         <span></span>
                                        <span class="flex items-center gap-2"><span>رسائل الأمبد</span><span class="text-white group-hover:text-blue-400">📄</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- الميزات الأساسية -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_core')" class="w-full flex items-center justify-between text-white hover:text-gray-300 px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_core" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>الميزات الأساسية</span></span>
                                </button>
                                <div id="grp_sub_core" class="space-y-1">
                                    <a href="/dashboard/${guildId}/moderation" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'moderation' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded" data-i18n="تحديث">تحديث</span>
                                        <span class="flex items-center gap-2"><span>الإشراف</span><span class="text-white group-hover:text-blue-400">🔨</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/levels" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'levels' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>المستويات & XP</span><span class="text-white group-hover:text-blue-400">🏆</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/welcome" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'welcome' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الترحيب & المغادرة</span><span class="text-white group-hover:text-blue-400">👋</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/autoroles" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'autoroles' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الرتب التلقائية</span><span class="text-white group-hover:text-blue-400">🎖️</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/giveaways" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'giveaways' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>قيف اواي</span><span class="text-white group-hover:text-blue-400">🎁</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/invites" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'invites' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>Invite Tracker</span><span class="text-white group-hover:text-blue-400">🔗</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- الإجراءات الآلية -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_automations')" class="w-full flex items-center justify-between text-white hover:text-gray-300 px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_automations" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>الإجراءات الآلية</span></span>
                                </button>
                                <div id="grp_sub_automations" class="space-y-1">
                                    <a href="/dashboard/${guildId}/autoresponder" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'autoresponder' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الرد التلقائي</span><span class="text-white group-hover:text-blue-400">💬</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/applications" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'applications' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-rose-400 bg-rose-950/60 px-1.5 py-0.2 rounded" data-i18n="جديد">جديد</span>
                                        <span class="flex items-center gap-2"><span>التقديمات</span><span class="text-white group-hover:text-blue-400">📝</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/suggestions" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'suggestions' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded" data-i18n="جديد">جديد</span>
                                        <span class="flex items-center gap-2"><span>الاقتراحات والشكاوي</span><span class="text-white group-hover:text-blue-400">💡</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- الأمان والحماية -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_security')" class="w-full flex items-center justify-between text-white hover:text-gray-300 px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_security" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>الحماية والأمان</span><span class="text-blue-400">🛡️</span></span>
                                </button>
                                <div id="grp_sub_security" class="space-y-1">
                                    <a href="/dashboard/${guildId}/protection" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'protection' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="flex items-center gap-1">
                                            <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                            <span class="text-amber-400 text-xs">👑</span>
                                        </span>
                                        <span class="flex items-center gap-2"><span>Anti Nuke (الحماية)</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/whitelist" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'whitelist' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>القائمة البيضاء</span><span class="text-white group-hover:text-blue-400">⚪</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/protection-logs" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'protection-logs' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded">سجلات</span>
                                        <span class="flex items-center gap-2"><span>سجلات الأمان والإشراف</span><span class="text-white group-hover:text-blue-400">📋</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/automod" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'automod' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الرقابة التلقائية</span><span class="text-white group-hover:text-blue-400">🤖</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/antiraid" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'antiraid' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>مكافحة الغزو</span><span class="text-white group-hover:text-blue-400">🚨</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/staff-activity" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'staff-activity' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>نشاط الإدارة</span><span class="text-white group-hover:text-blue-400">👮</span></span>
                                    </a>
                                </div>
                            </div>

                            <!-- إدارة السيرفر -->
                            <div class="space-y-1">
                                <button type="button" onclick="toggleNavGroup('grp_sub_management')" class="w-full flex items-center justify-between text-white hover:text-gray-300 px-2 py-1 font-bold text-[11px] transition">
                                    <svg id="arrow_grp_sub_management" class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                    <span class="flex items-center gap-1.5"><span>إدارة السيرفر</span></span>
                                </button>
                                <div id="grp_sub_management" class="space-y-1">
                                    <a href="/dashboard/${guildId}/tempvoice" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'tempvoice' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الرومات المؤقتة</span><span class="text-white group-hover:text-blue-400">🕒</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/boost" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'boost' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>البوستات</span><span class="text-white group-hover:text-blue-400">💎</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/colors" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'colors' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                        <span class="flex items-center gap-2"><span>الألوان</span><span class="text-white group-hover:text-blue-400">🎨</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/logs" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'logs' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded" data-i18n="تحديث">تحديث</span>
                                        <span class="flex items-center gap-2"><span>السجلات</span><span class="text-white group-hover:text-blue-400">📜</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/tickets" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'tickets' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="flex items-center gap-1">
                                            <span class="w-4 h-4 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] font-black">✓</span>
                                            <span class="text-amber-400 text-xs">👑</span>
                                        </span>
                                        <span class="flex items-center gap-2"><span>التذاكر</span><span class="text-white group-hover:text-blue-400">🎫</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/staff_system" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'staff_system' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-blue-400 bg-blue-800/60 px-1.5 py-0.2 rounded">جديد</span>
                                        <span class="flex items-center gap-2"><span>نظام الإدارة والترقيات</span><span class="text-white group-hover:text-blue-400">👮</span></span>
                                    </a>
                                    <a href="/dashboard/${guildId}/custom_shop" class="flex items-center justify-between px-3 py-2 rounded-xl ${section === 'custom_shop' ? 'bg-gradient-to-l from-purple-600 to-blue-500 text-white font-bold shadow-md' : 'text-gray-300 hover:text-gray-300 hover:bg-[#151724]'} transition group">
                                        <span class="text-[9px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.2 rounded">جديد</span>
                                        <span class="flex items-center gap-2"><span>المتجر والرتب والرومات</span><span class="text-white group-hover:text-blue-400">🛒</span></span>
                                    </a>
                                </div>
                            </div>





                        <!-- User Profile Bottom Bar -->
                        <div class="p-3 border-t border-blue-500/20">
                            <div class="bg-gradient-to-r from-blue-500 to-indigo-700 rounded-2xl p-2.5 flex items-center justify-between shadow-lg shadow-blue-800/40">
                                <div class="text-white/80 hover:text-gray-300 cursor-pointer px-1">
                                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z"/></svg>
                                </div>
                                <div class="flex items-center gap-2.5">
                                    <div class="text-right">
                                        <span class="text-xs font-black text-white block leading-tight truncate max-w-[110px]">${user.username}</span>
                                    </div>
                                    <img src="${userAvatar}" class="w-8 h-8 rounded-xl object-cover ring-2 ring-blue-300/20 shadow-md">
                                </div>
                            </div>
                        </div>

                    </aside>

                    <!-- Server Rail (Far Right - Novax Style) -->
                    <div class="w-18 bg-[#040810] border-l border-blue-500/20 py-4 px-2 flex flex-col items-center gap-3 shrink-0 overflow-y-auto select-none">
                        <!-- Home Icon Button -->
                        <a href="/dashboard" title="الصفحة الرئيسية" class="w-12 h-12 rounded-2xl bg-[#0b1322] hover:bg-blue-400/30 border border-blue-500/20 hover:border-blue-400/50 flex items-center justify-center text-gray-300 hover:text-gray-300 transition shadow-lg mb-1 group">
                            <svg class="w-6 h-6 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                        </a>
                        <div class="w-8 h-[1px] bg-white/5"></div>
                        <!-- Active Server List Icons -->
                        ${serverRailHtml}
                    </div>

                </div>

                <script>
                function toggleNavGroup(groupId) {
                    const el = document.getElementById(groupId);
                    const arrow = document.getElementById('arrow_' + groupId);
                    if (!el) return;
                    el.classList.toggle('hidden');
                    if (arrow) arrow.classList.toggle('rotate-180');
                }

                async function toggleModule(gId, key, isEnabled) {
                    try {
                        await fetch('/api/guild/' + gId + '/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ [key]: isEnabled ? 1 : 0 })
                        });
                        showSaveStatus();
                    } catch (e) {
                        console.error('Error updating module toggle:', e);
                    }
                }

                function showSaveStatus() {
                    const status = document.getElementById('saveStatus');
                    if (status) {
                        status.classList.remove('hidden');
                        setTimeout(() => status.classList.add('hidden'), 4000);
                    }
                }

                document.getElementById('settingsForm')?.addEventListener('submit', async function(e) {
                    e.preventDefault();
                    const formData = new FormData(this);
                    const payload = {};
                    
                    for (let [k, v] of formData.entries()) {
                        if (payload[k]) {
                            if (Array.isArray(payload[k])) {
                                payload[k].push(v);
                            } else {
                                payload[k] = [payload[k], v];
                            }
                        } else {
                            payload[k] = v;
                        }
                    }

                    this.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                        if (cb.name) {
                            payload[cb.name] = cb.checked ? 1 : 0;
                        }
                    });

                    try {
                        const btn = this.querySelector('button[type="submit"]');
                        if (btn) {
                            btn.disabled = true;
                            btn.innerHTML = '<span>⏳</span><span>جاري الحفظ...</span>';
                        }

                        const targetGuildId = window.location.pathname.split('/')[2];
                        const res = await fetch('/api/guild/' + targetGuildId + '/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        const data = await res.json();
                        if (data.success) {
                            showSaveStatus();
                        } else {
                            alert('❌ خطأ أثناء الحفظ: ' + (data.error || 'حدث خطأ غير متوقع'));
                        }

                        if (btn) {
                            btn.disabled = false;
                            btn.innerHTML = '<span>💾</span><span>حفظ التغييرات</span>';
                        }
                    } catch (err) {
                        alert('حدث خطأ في الاتصال بالخادم');
                    }
                });

                // ✅ FIX: منع أي زر ليس submit من إطلاق الـ form
                document.addEventListener('DOMContentLoaded', () => {
                    const form = document.getElementById('settingsForm');
                    if (form) {
                        form.querySelectorAll('button:not([type="submit"])').forEach(btn => {
                            if (!btn.hasAttribute('type')) {
                                btn.setAttribute('type', 'button');
                            }
                        });
                    }
                });

                // تشغيل الإصلاح فوراً أيضاً (للـ buttons الموجودة بالفعل)
                setTimeout(() => {
                    const form = document.getElementById('settingsForm');
                    if (form) {
                        form.querySelectorAll('button:not([type="submit"])').forEach(btn => {
                            if (!btn.getAttribute('type') || btn.getAttribute('type') !== 'submit') {
                                btn.type = 'button';
                            }
                        });
                    }
                }, 100);

                window.toggleModule = async function(guildId, key, enabled) {
                    try {
                        const res = await fetch('/api/guild/' + guildId + '/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ [key]: enabled ? 1 : 0 })
                        });
                        const data = await res.json();
                        if (data && data.success) {
                            if (typeof showSaveStatus === 'function') showSaveStatus();
                        }
                    } catch (err) {
                        console.error('toggleModule error:', err);
                    }
                };
                // وظائف رفع وحذف الصور الموحدة بنمط Wicks لجميع الأقسام
                // ✅ دوال الحفظ العالمية (تعمل في جميع الأقسام)
                const _dashGuildId = window.location.pathname.split('/')[2];
                async function saveProtectionSetting(key, value) {
                    if (typeof updateProtectionBadges === 'function') updateProtectionBadges();
                    try {
                        await fetch('/api/guild/' + _dashGuildId + '/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ [key]: value ? 1 : 0 })
                        });
                        showSaveStatus();
                    } catch(e) { console.error('saveProtectionSetting error', e); }
                }
                async function saveAutomodSetting(key, value) {
                    try {
                        await fetch('/api/guild/' + _dashGuildId + '/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ [key]: value ? 1 : 0 })
                        });
                        showSaveStatus();
                    } catch(e) { console.error('saveAutomodSetting error', e); }
                }
                async function uploadImageFile(input, fieldName, onDone) {
                    const file = input.files && input.files[0];
                    if (!file) return;

                    if (!file.type.startsWith('image/')) {
                        alert('❌ يرجى اختيار ملف صورة صالح (PNG, JPG, WEBP, GIF)');
                        return;
                    }

                    if (file.size > 15 * 1024 * 1024) {
                        alert('❌ حجم الصورة يتجاوز 15 ميجابايت. يرجى اختيار صورة أصغر.');
                        return;
                    }

                    const btnText = document.getElementById('btn_text_' + fieldName);
                    const origText = btnText ? btnText.innerText : 'رفع الصورة';
                    if (btnText) btnText.innerText = 'جاري الرفع... ⏳';

                    const reader = new FileReader();
                    reader.onload = async function(e) {
                        try {
                            const res = await fetch('/api/guild/${guildId}/upload-image', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    imageBase64: e.target.result,
                                    fieldName: fieldName
                                })
                            });
                            const data = await res.json();
                            if (data.success && data.url) {
                                const hiddenInput = document.getElementById('input_' + fieldName);
                                if (hiddenInput) hiddenInput.value = data.url;

                                const imgElem = document.getElementById('img_' + fieldName);
                                const placeholderElem = document.getElementById('placeholder_' + fieldName);
                                if (imgElem) {
                                    imgElem.src = data.url;
                                    imgElem.classList.remove('hidden');
                                }
                                if (placeholderElem) {
                                    placeholderElem.classList.add('hidden');
                                }
                                if (btnText) btnText.innerText = '✅ تم الرفع';
                                setTimeout(() => { if (btnText) btnText.innerText = origText; }, 2500);
                                if (typeof onDone === 'function') onDone(data.url);
                            } else {
                                alert('❌ فشل رفع الصورة: ' + (data.error || 'خطأ غير معروف'));
                                if (btnText) btnText.innerText = origText;
                            }
                        } catch(err) {
                            alert('❌ حدث خطأ في الاتصال أثناء رفع الصورة');
                            if (btnText) btnText.innerText = origText;
                        }
                    };
                    reader.readAsDataURL(file);
                }

                function clearUploadedImageInDOM(fieldName, onDone) {
                    const hiddenInput = document.getElementById('input_' + fieldName);
                    if (hiddenInput) hiddenInput.value = '';

                    const imgElem = document.getElementById('img_' + fieldName);
                    const placeholderElem = document.getElementById('placeholder_' + fieldName);
                    if (imgElem) {
                        imgElem.src = '';
                        imgElem.classList.add('hidden');
                    }
                    if (placeholderElem) {
                        placeholderElem.classList.remove('hidden');
                    }
                    const fileInput = document.getElementById('file_' + fieldName);
                    if (fileInput) fileInput.value = '';
                    if (typeof onDone === 'function') onDone();
                }
                </script>
                ${embedScriptHtml ? `<script>
${embedScriptHtml}
</script>` : ''}

            </body>
            </html>
            `);
        } catch (error) {
            console.error("Guild dashboard error:", error);
            res.status(500).send(`<pre style="color:red;background:#111;padding:20px;font-family:monospace">${error.stack || error.message || error}</pre>`);
        }
    });

    // 5. REST APIs - Protected by Real-Time Guild Permission Check
    app.use('/api/guild/:guildId', requireGuildPermission);

    app.post('/api/guild/:guildId/upload-image', express.json({ limit: '20mb' }), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { imageBase64, fieldName } = req.body;
            if (!imageBase64) return res.status(400).json({ success: false, error: 'لم يتم إرسال أي صورة' });

            // Base64 regex parsing
            const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            let ext = 'png';
            let dataBuffer = null;

            if (matches && matches.length === 3) {
                const mime = matches[1];
                if (mime === 'image/jpeg' || mime === 'image/jpg') ext = 'jpg';
                else if (mime === 'image/gif') ext = 'gif';
                else if (mime === 'image/webp') ext = 'webp';
                else ext = 'png';
                dataBuffer = Buffer.from(matches[2], 'base64');
            } else {
                dataBuffer = Buffer.from(imageBase64, 'base64');
            }

            if (dataBuffer.length > 15 * 1024 * 1024) {
                return res.status(400).json({ success: false, error: 'حجم الصورة كبير جداً (الحد الأقصى 15 ميجابايت)' });
            }

            const fs = require('fs');
            const path = require('path');
            const uploadDir = path.join(__dirname, 'public', 'uploads');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            const cleanField = (fieldName || 'img').replace(/[^a-zA-Z0-9_-]/g, '_');
            const fileName = `${cleanField}_${req.params.guildId}_${Date.now()}.${ext}`;
            const filePath = path.join(uploadDir, fileName);
            fs.writeFileSync(filePath, dataBuffer);

            const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
            const host = req.get('host');
            const fullUrl = `${protocol}://${host}/uploads/${fileName}`;

            res.json({ success: true, url: fullUrl });
        } catch (e) {
            console.error('Upload image error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/settings', express.json(), validate(settingsSchema), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const settings = req.body;
            if (database.updateGuildSettings) {
                database.updateGuildSettings(guildId, settings);
            }
            // تطبيق اسم البوت في السيرفر في ديسكورد فوراً
            if (settings.bot_nickname !== undefined && client?.guilds?.cache) {
                const targetGuild = client.guilds.cache.get(guildId);
                if (targetGuild?.members?.me) {
                    targetGuild.members.me.setNickname(settings.bot_nickname || null).catch(() => {});
                }
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // Logs Auto-Setup & Delete-Channels API
    // =============================================
    app.post('/api/guild/:guildId/logs/auto-setup', express.json(), sensitiveActionLimiter, async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { mode } = req.body;
            if (!['grouped', 'detailed'].includes(mode)) {
                return res.status(400).json({ success: false, error: 'Invalid mode. Use grouped or detailed.' });
            }
            const guild = client?.guilds?.cache?.get(guildId);
            if (!guild) return res.status(404).json({ success: false, error: 'السيرفر غير متصل بالبوت حالياً' });
            const logsCmd = require('../commands/admin/logs');
            const runSetupFn = logsCmd._runSetup;
            if (typeof runSetupFn !== 'function') return res.status(500).json({ success: false, error: 'تعذر تحميل وظيفة الإعداد' });
            const created = await runSetupFn(guild, mode);
            res.json({ success: true, created: created.length, message: 'تم إنشاء ' + created.length + ' قناة سجلات بنجاح' });
        } catch (e) {
            console.error('Logs auto-setup error:', e);
            res.status(500).json({ success: false, error: e.message || 'حدث خطأ أثناء الإنشاء' });
        }
    });

    app.post('/api/guild/:guildId/logs/delete-channels', express.json(), sensitiveActionLimiter, async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const guild = client?.guilds?.cache?.get(guildId);
            if (!guild) return res.status(404).json({ success: false, error: 'السيرفر غير متصل بالبوت حالياً' });
            const logsCmd = require('../commands/admin/logs');
            const deleteFn = logsCmd._deleteLogsChannels;
            if (typeof deleteFn !== 'function') return res.status(500).json({ success: false, error: 'تعذر تحميل وظيفة الحذف' });
            const deleted = await deleteFn(guild);
            res.json({ success: true, deleted, message: 'تم حذف ' + deleted + ' قناة وتعطيل السجلات' });
        } catch (e) {
            console.error('Logs delete-channels error:', e);
            res.status(500).json({ success: false, error: e.message || 'حدث خطأ أثناء الحذف' });
        }
    });

    // =============================================
    // Whitelist & AntiMod API
    // =============================================
    app.post('/api/guild/:guildId/whitelist', express.json(), validate(whitelistSchema), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { userId, type } = req.body;

            if (database.addProtectionWhitelist) {
                database.addProtectionWhitelist(guildId, String(userId).trim(), type || 'whitelist', req.session.user.id);
            } else {
                rawDb.prepare(`
                    INSERT OR REPLACE INTO protection_whitelist (guild_id, user_id, type, added_by, created_at)
                    VALUES (?, ?, ?, ?, strftime('%s','now'))
                `).run(guildId, String(userId).trim(), type || 'whitelist', req.session.user.id);
            }

            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.delete('/api/guild/:guildId/whitelist', express.json(), validate(whitelistSchema), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { userId, type } = req.body;

            if (database.removeProtectionWhitelist) {
                database.removeProtectionWhitelist(guildId, String(userId).trim(), type || 'whitelist');
            } else {
                rawDb.prepare(`
                    DELETE FROM protection_whitelist 
                    WHERE guild_id = ? AND user_id = ? AND type = ?
                `).run(guildId, String(userId).trim(), type || 'whitelist');
            }

            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // Autoresponder API
    // =============================================
    app.post('/api/guild/:guildId/autoresponder', express.json(), validate(autoresponderSchema), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const payload = req.body;

            if (database.addAutoResponder) {
                const inserted = database.addAutoResponder(guildId, payload);
                return res.json({ success: true, item: inserted });
            }

            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.delete('/api/guild/:guildId/autoresponder/:id', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, id } = req.params;

            if (database.deleteAutoResponder) {
                database.deleteAutoResponder(guildId, id);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // Warn Punishments API
    // =============================================
    app.post('/api/guild/:guildId/warn-punishments', express.json(), validate(warnPunishmentSchema), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { warnCount, actionType } = req.body;

            if (database.addWarnPunishment) {
                const inserted = database.addWarnPunishment(guildId, parseInt(warnCount), actionType);
                return res.json({ success: true, item: inserted });
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.delete('/api/guild/:guildId/warn-punishments/:id', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, id } = req.params;

            if (database.deleteWarnPunishment) {
                database.deleteWarnPunishment(id, guildId);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // Level Rewards API
    // =============================================
    app.post('/api/guild/:guildId/level-reward', express.json(), validate(levelRewardSchema), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { level, roleId, rewardType, voiceLevel } = req.body;
            if (!level || !roleId) return res.status(400).json({ success: false, error: 'المستوى والرتبة مطلوبان' });

            if (database.addLevelReward) {
                const inserted = database.addLevelReward(guildId, parseInt(level), String(roleId).trim(), rewardType || 'text', parseInt(voiceLevel) || 0);
                return res.json({ success: true, item: inserted });
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.delete('/api/guild/:guildId/level-reward/:id', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, id } = req.params;

            if (database.removeLevelReward) {
                database.removeLevelReward(guildId, id);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/clear-all-warnings', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            rawDb.prepare('DELETE FROM warnings WHERE guild_id = ?').run(guildId);
            rawDb.prepare('UPDATE users SET warnings = 0 WHERE guild_id = ?').run(guildId);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/reset-data', sensitiveActionLimiter, async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            rawDb.prepare('DELETE FROM guild_settings WHERE guild_id = ?').run(guildId);
            rawDb.prepare('DELETE FROM warnings WHERE guild_id = ?').run(guildId);
            rawDb.prepare('DELETE FROM autoresponders WHERE guild_id = ?').run(guildId);
            rawDb.prepare('DELETE FROM tickets WHERE guild_id = ?').run(guildId);
            rawDb.prepare('DELETE FROM giveaways WHERE guild_id = ?').run(guildId);
            rawDb.prepare('DELETE FROM suggestions WHERE guild_id = ?').run(guildId);
            rawDb.prepare('DELETE FROM security_logs WHERE guild_id = ?').run(guildId);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/send-embed', express.json(), sensitiveActionLimiter, validate(sendEmbedSchema), async (req, res) => {
        try {
            console.log('[send-embed] session user:', req.session?.user?.id, 'guildId:', req.params.guildId);
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'غير مسجل دخول، يرجى تسجيل الدخول مجدداً' });
            const { guildId } = req.params;
            const { channelId, color, title, titleUrl, desc, author, authorIcon, image, thumbnail, footer, footerIcon, timestamp, fields } = req.body;

            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch((e) => {
                console.error('[send-embed] fetch channel error:', e.message);
                return null;
            });

            if (!channel) return res.status(404).json({ success: false, error: 'لم يتم العثور على القناة — تأكد أن البوت موجود في السيرفر' });
            if (!channel.isTextBased()) return res.status(400).json({ success: false, error: 'القناة المختارة ليست قناة نصية' });

            const { EmbedBuilder, PermissionsBitField } = require('discord.js');

            // التحقق من صلاحية الإرسال
            const botMember = channel.guild?.members?.me;
            if (botMember) {
                const perms = channel.permissionsFor(botMember);
                if (!perms?.has(PermissionsBitField.Flags.SendMessages)) {
                    return res.status(403).json({ success: false, error: 'البوت لا يملك صلاحية الإرسال في هذه القناة' });
                }
                if (!perms?.has(PermissionsBitField.Flags.EmbedLinks)) {
                    return res.status(403).json({ success: false, error: 'البوت لا يملك صلاحية إرسال Embed في هذه القناة — يلزم صلاحية Embed Links' });
                }
            }

            const embed = new EmbedBuilder();

            if (color) embed.setColor(color);
            if (title) embed.setTitle(title);
            if (titleUrl) embed.setURL(titleUrl);
            if (desc) embed.setDescription(desc);
            if (author) embed.setAuthor({ name: author, iconURL: authorIcon || undefined });
            if (image) embed.setImage(image);
            if (thumbnail) embed.setThumbnail(thumbnail);
            if (footer) embed.setFooter({ text: footer, iconURL: footerIcon || undefined });
            if (timestamp) embed.setTimestamp();
            if (Array.isArray(fields) && fields.length > 0) {
                embed.addFields(fields.map(f => ({ name: f.name || '\u200b', value: f.value || '\u200b', inline: !!f.inline })));
            }

            await channel.send({ embeds: [embed] });
            console.log('[send-embed] ✅ sent successfully to', channelId);
            res.json({ success: true });
        } catch (e) {
            console.error('[send-embed] Error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/giveaways', express.json(), sensitiveActionLimiter, validate(giveawaySchema), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { prize, channelId, duration, winners, desc, color, image, emoji, reqRole } = req.body;

            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return res.status(404).json({ success: false, error: 'Channel not found' });

            let durationMs = 24 * 60 * 60 * 1000;
            if (duration === '10m') durationMs = 10 * 60 * 1000;
            else if (duration === '1h') durationMs = 60 * 60 * 1000;
            else if (duration === '6h') durationMs = 6 * 60 * 60 * 1000;
            else if (duration === '12h') durationMs = 12 * 60 * 60 * 1000;
            else if (duration === '3d') durationMs = 3 * 24 * 60 * 60 * 1000;
            else if (duration === '7d') durationMs = 7 * 24 * 60 * 60 * 1000;

            const endTime = Date.now() + durationMs;
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

            let descText = '**الجائزة:** ' + prize + (desc ? ('\n\n' + desc) : '') + '\n\n**عدد الفائزين:** ' + (winners || 1) + '\n**ينتهي في:** <t:' + Math.floor(endTime / 1000) + ':R>';
            if (reqRole) {
                descText += '\n\n🛡️ **الرتبة المسموح لها بالمشاركة فقط:** <@&' + reqRole + '>';
            }

            const gwEmbed = new EmbedBuilder()
                .setTitle('🎉 سحب قيف اواي جديد!')
                .setDescription(descText)
                .setColor(color || '#ef5700')
                .setFooter({ text: reqRole ? 'مخصص لرتبة معينة • اضغط للمشاركة' : 'اضغط على الزر أدناه للمشاركة!' })
                .setTimestamp(endTime);

            if (image) gwEmbed.setImage(image);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('gw_enter_btn')
                    .setLabel('مشاركة في القيف اواي')
                    .setEmoji(emoji || '🎉')
                    .setStyle(ButtonStyle.Primary)
            );

            const msg = await channel.send({ embeds: [gwEmbed], components: [row] });

            if (database.createGiveaway) {
                // الترتيب الصحيح: (messageId, channelId, guildId, prize, winnersCount, endTime, hostId, reqRole)
                database.createGiveaway(msg.id, channel.id, guildId, prize, winners || 1, endTime, req.session.user.id, reqRole);
            }

            res.json({ success: true, messageId: msg.id });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/suggestions', express.json(), validate(suggestionSchema), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { title, category, content } = req.body;
            if (!content) return res.status(400).json({ success: false, error: 'Content is required' });

            const settings = database.getGuildSettings(guildId);
            const channelId = settings.suggestions_channel;
            let msgId = null;

            if (channelId) {
                const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
                if (channel && channel.isTextBased()) {
                    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                    const avatarURL = req.session.user.avatar
                        ? `https://cdn.discordapp.com/avatars/${req.session.user.id}/${req.session.user.avatar}.png`
                        : `https://cdn.discordapp.com/embed/avatars/0.png`;

                    const suggEmbed = new EmbedBuilder()
                        .setColor(0x9333ea)
                        .setAuthor({ name: req.session.user.username + ' • اقتراح جديد', iconURL: avatarURL })
                        .setTitle(title ? ('💡 ' + title) : '💡 اقتراح جديد')
                        .setDescription(content)
                        .addFields(
                            { name: '📂 التصنيف', value: category || 'عام', inline: true },
                            { name: '⏳ الحالة', value: 'قيد المراجعة', inline: true },
                            { name: '📊 التصويت | 0%', value: '░░░░░░░░░░\n👍 0  |  👎 0', inline: false }
                        )
                        .setFooter({ text: 'صاحب الاقتراح: ' + req.session.user.username + ' • من الداشبورد' })
                        .setTimestamp();

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('sugg_upvote').setLabel('0').setEmoji('👍').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('sugg_downvote').setLabel('0').setEmoji('👎').setStyle(ButtonStyle.Danger)
                    );

                    const sentMsg = await channel.send({ embeds: [suggEmbed], components: [row] });
                    msgId = sentMsg.id;

                    if (settings.suggestions_auto_thread !== 0) {
                        sentMsg.startThread({
                            name: title ? ('مناقشة: ' + title).slice(0, 95) : 'مناقشة الاقتراح',
                            autoArchiveDuration: 1440
                        }).catch(() => {});
                    }
                }
            }

            const newSugg = database.createSuggestion({
                guild_id: guildId,
                channel_id: channelId,
                message_id: msgId,
                user_id: req.session.user.id,
                title: title,
                content: content,
                category: category || 'عام'
            });

            res.json({ success: true, suggestion: newSugg });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.patch('/api/guild/:guildId/suggestions/:id/status', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, id } = req.params;
            const { status, reason } = req.body;

            const updated = database.updateSuggestionStatus(id, status, reason, req.session.user.id);

            // ✅ تحديث embed ديسكورد إذا كانت الرسالة موجودة
            if (updated && updated.message_id && updated.channel_id) {
                try {
                    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                    const ch = client.channels.cache.get(updated.channel_id) || await client.channels.fetch(updated.channel_id).catch(() => null);
                    if (ch && ch.isTextBased()) {
                        const msg = await ch.messages.fetch(updated.message_id).catch(() => null);
                        if (msg) {
                            let upCount = 0, downCount = 0;
                            try { upCount = JSON.parse(updated.upvotes || '[]').length; } catch(e) {}
                            try { downCount = JSON.parse(updated.downvotes || '[]').length; } catch(e) {}
                            const total = upCount + downCount || 1;
                            const pct = Math.round((upCount / total) * 100);
                            const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));

                            const statusMap = {
                                pending: { label: '⏳ قيد المراجعة', color: 0xf59e0b },
                                accepted: { label: '✅ مقبول', color: 0x22c55e },
                                rejected: { label: '❌ مرفوض', color: 0xef4444 },
                                implemented: { label: '🚀 تم التنفيذ', color: 0x6366f1 }
                            };
                            const sm = statusMap[status] || statusMap.pending;

                            const newEmbed = new EmbedBuilder()
                                .setColor(sm.color)
                                .setTitle(updated.title ? ('💡 ' + updated.title) : '💡 اقتراح')
                                .setDescription(updated.content)
                                .addFields(
                                    { name: '📂 التصنيف', value: updated.category || 'عام', inline: true },
                                    { name: '📊 الحالة', value: sm.label, inline: true },
                                    { name: `📊 التصويت | ${pct}%`, value: `${bar}\n👍 ${upCount}  |  👎 ${downCount}`, inline: false }
                                )
                                .setFooter({ text: `صاحب الاقتراح: ${updated.user_id} • راجعه: ${req.session.user.username}` })
                                .setTimestamp();

                            if (reason) newEmbed.addFields({ name: '💬 رد الإدارة', value: reason });

                            const row = new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId('sugg_upvote').setLabel(String(upCount)).setEmoji('👍').setStyle(ButtonStyle.Success),
                                new ButtonBuilder().setCustomId('sugg_downvote').setLabel(String(downCount)).setEmoji('👎').setStyle(ButtonStyle.Danger)
                            );

                            await msg.edit({ embeds: [newEmbed], components: [row] });
                        }
                    }
                } catch(embedErr) {
                    console.error('[Suggestions] Failed to update Discord embed:', embedErr.message);
                }
            }

            res.json({ success: true, updated });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    
    // =============================================
    // Tickets Panel API (إرسال لوحة التذاكر للشات مباشرة)
    // =============================================
    app.post('/api/guild/:guildId/tickets/send-panel', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const settings = database.getGuildSettings(guildId);
            const channelId = req.body.channelId || settings.ticket_panel_channel;

            if (!channelId) return res.status(400).json({ success: false, error: 'لم يتم تحديد روم إرسال لوحة التذاكر' });

            const channel = client?.channels?.cache?.get(channelId) || await client?.channels?.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return res.status(400).json({ success: false, error: 'القناة غير موجودة أو ليست نصية' });

            const guildObj = client?.guilds?.cache?.get(guildId);
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

            const title = req.body.ticket_panel_title || settings.ticket_panel_title || '🎫 تذاكر الدعم الفني';
            const bannerUrl = req.body.ticket_panel_banner || settings.ticket_panel_banner || null;
            const desc = req.body.ticket_panel_desc || settings.ticket_panel_desc || 'لطلب المساعدة أو الاستفسار أو تقديم الشكاوى، اضغط على الزر أدناه لفتح تذكرة خاصة مع فريق الدعم.';

            const embed = new EmbedBuilder()
                .setColor('#60a5fa')
                .setTitle(title)
                .setDescription(desc)
                .setFooter({ text: guildObj?.name || 'Droplet Tickets', iconURL: guildObj?.iconURL({ dynamic: true }) || undefined })
                .setTimestamp();

            if (bannerUrl) {
                try {
                    embed.setImage(bannerUrl);
                } catch(e) {}
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('open_ticket')
                    .setLabel('فتح تذكرة | Open Ticket')
                    .setEmoji('🎫')
                    .setStyle(ButtonStyle.Primary)
            );

            await channel.send({ embeds: [embed], components: [row] });

            res.json({ success: true });
        } catch(e) {
            console.error('Error sending ticket panel:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // Staff Activity & Shift API (نظام الإدارة والحضور)
    // =============================================
    app.post('/api/guild/:guildId/staff/send-panel', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const settings = database.getGuildSettings(guildId);
            const channelId = req.body.channelId || settings.staff_login_channel;

            if (!channelId) return res.status(400).json({ success: false, error: 'لم يتم تحديد قناة لوحة الحضور والانصراف' });

            const channel = client?.channels?.cache?.get(channelId) || await client?.channels?.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return res.status(400).json({ success: false, error: 'القناة غير موجودة أو ليست نصية' });

            const guildObj = client?.guilds?.cache?.get(guildId);
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

            const bannerImg = settings.staff_banner_url && settings.staff_banner_url.trim() !== '' ? settings.staff_banner_url.trim() : null;
            const embed = new EmbedBuilder()
                .setColor('#60a5fa')
                .setTitle('📋 لوحة تسجيل حضور وانصراف الإدارة | Staff Shift')
                .setDescription(
                    'مرحباً بكم يا أعضاء طاقم الإدارة 🫡\n\n' +
                    '• لبدء تسجيل تواجدك في السيرفر واستقبال تذاكر ورومات الدعم، اضغط على زر **تسجيل الدخول (Login)** 🟢\n' +
                    '• عند انتهاء فترة تواجدك، اضغط على زر **تسجيل الخروج (Logout)** 🔴 لحفظ ساعاتك ونقاطك بدقة.\n\n' +
                    '⚠️ **ملاحظة:** يتم تسجيل خروجك تلقائياً إذا خرجت من الديسكورد لمنع الساعات الوهمية.'
                )
                .setFooter({ text: guildObj?.name || 'Droplet Bot', iconURL: guildObj?.iconURL({ dynamic: true }) || undefined })
                .setTimestamp();

            if (bannerImg) {
                embed.setImage(bannerImg);
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('staff_login_btn')
                    .setLabel('تسجيل الدخول | Login')
                    .setEmoji('🟢')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('staff_logout_btn')
                    .setLabel('تسجيل الخروج | Logout')
                    .setEmoji('🔴')
                    .setStyle(ButtonStyle.Danger)
            );

            await channel.send({ embeds: [embed], components: [row] });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.post('/api/guild/:guildId/staff/set-points', express.json(), validate(staffPointsSchema), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { userId, points } = req.body;

            if (database.setStaffPoints) {
                database.setStaffPoints(guildId, userId, points);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/staff/add-points', express.json(), validate(staffPointsSchema), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { userId, points } = req.body;

            if (database.addStaffPoints) {
                database.addStaffPoints(guildId, userId, points);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/staff/reset', sensitiveActionLimiter, (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            if (database.resetStaffStats) {
                database.resetStaffStats(guildId);
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // Backup System API
    // Backup API endpoints removed

    // =============================================
    // Stat Channels API
    // =============================================
    app.post('/api/guild/:guildId/stat-channels', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { stat_type, channel_id, custom_prefix } = req.body;

            if (!stat_type || !channel_id) return res.status(400).json({ success: false, error: 'stat_type and channel_id are required' });

            const VALID_TYPES = ['total_members','humans','bots','online','voice','text_channels','voice_channels','total_channels','roles','boosts','boost_level'];
            if (!VALID_TYPES.includes(stat_type)) return res.status(400).json({ success: false, error: 'Invalid stat_type' });

            rawDb.exec(`CREATE TABLE IF NOT EXISTS stat_channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                stat_type TEXT NOT NULL,
                custom_prefix TEXT DEFAULT '',
                enabled INTEGER DEFAULT 1,
                UNIQUE(guild_id, channel_id)
            )`);

            rawDb.prepare('INSERT OR REPLACE INTO stat_channels (guild_id, channel_id, stat_type, custom_prefix, enabled) VALUES (?, ?, ?, ?, 1)')
                .run(guildId, channel_id.trim(), stat_type, custom_prefix || '');

            // Trigger immediate update
            try {
                const StatChannelsService = require('./services/statChannels');
                // Force update by running the service tick
                const tempSvc = new StatChannelsService(client);
                tempSvc._updateChannel({ guild_id: guildId, channel_id: channel_id.trim(), stat_type, custom_prefix: custom_prefix || '', enabled: 1 }).catch(() => {});
            } catch(e) {}

            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/stat-channels/:id/delete', (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, id } = req.params;
            rawDb.prepare('DELETE FROM stat_channels WHERE id = ? AND guild_id = ?').run(id, guildId);
            // Redirect back to stat-channels page
            res.redirect('/dashboard/' + guildId + '/stat-channels');
        } catch(e) {
            res.status(500).send('Error: ' + e.message);
        }
    });

    app.get('/api/guild/:guildId/stat-channels', (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const rows = rawDb.prepare('SELECT * FROM stat_channels WHERE guild_id = ?').all(guildId);
            res.json({ success: true, data: rows });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/stat-channels/update-now', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const StatChannelsService = require('./services/statChannels');
            const svc = new StatChannelsService(client);
            await svc.forceUpdateGuild(guildId);
            res.json({ success: true, message: 'تم تحديث قنوات الإحصائيات الآن!' });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // Real-time Stats API (online members, bots, giveaways)
    app.get('/api/guild/:guildId/online-count', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const botGuild = client.guilds.cache.get(guildId);
            if (!botGuild) return res.json({ success: true, online: 0, bots: 0, giveaways: 0 });

            // --- Online Members: use presences.cache directly (most accurate) ---
            let onlineCount = botGuild.presences.cache.filter(p =>
                p.status === 'online' || p.status === 'idle' || p.status === 'dnd'
            ).size;

            // Fallback: fetch members with presences if cache is empty
            if (onlineCount === 0) {
                try {
                    await botGuild.members.fetch({ withPresences: true });
                    onlineCount = botGuild.presences.cache.filter(p =>
                        p.status === 'online' || p.status === 'idle' || p.status === 'dnd'
                    ).size;
                } catch(e) {
                    onlineCount = 0;
                }
            }

            // --- Bots count: use REST to get accurate count ---
            let botsCount = botGuild.members.cache.filter(m => m.user.bot).size;
            // If members cache is not fully populated, fetch all members
            if (botGuild.members.cache.size < botGuild.memberCount) {
                try {
                    await botGuild.members.fetch();
                    botsCount = botGuild.members.cache.filter(m => m.user.bot).size;
                } catch(e) {
                    // keep whatever we have
                }
            }

            // --- Giveaways count: query DB directly ---
            let giveawaysCount = 0;
            try {
                const gwRows = rawDb.prepare('SELECT COUNT(*) as cnt FROM giveaways WHERE guild_id = ?').get(guildId);
                giveawaysCount = gwRows?.cnt || 0;
            } catch(e) {
                try {
                    giveawaysCount = (database.getGuildGiveaways ? database.getGuildGiveaways(guildId) : []).length;
                } catch(e2) {}
            }

            res.json({
                success: true,
                online: onlineCount,
                bots: botsCount,
                giveaways: giveawaysCount,
                total: botGuild.memberCount || 0
            });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message, online: 0, bots: 0, giveaways: 0 });
        }
    });



    // User Economy API
    app.post('/api/user/daily', (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'يجب تسجيل الدخول أولاً' });
            const userId = req.session.user.id;
            const now = Date.now();
            
            const userRow = rawDb.prepare('SELECT SUM(coins) as coins, MAX(last_daily) as last_daily FROM users WHERE user_id = ?').get(userId);
            const lastDaily = userRow?.last_daily || 0;
            
            if ((now - lastDaily) < 24 * 60 * 60 * 1000) {
                const remaining = Math.ceil((24 * 60 * 60 * 1000 - (now - lastDaily)) / (1000 * 60));
                return res.status(400).json({ success: false, error: 'لقد استلمت راتبك بالفعل، يرجى المحاولة لاحقاً بعد ' + remaining + ' دقيقة' });
            }

            // Random reward between 500 and 1000 Gold
            const reward = Math.floor(Math.random() * (1000 - 500 + 1)) + 500;
            const guilds = req.session.guilds || [];
            const primaryGuildId = guilds.length > 0 ? guilds[0].id : 'global';

            rawDb.prepare('INSERT OR IGNORE INTO users (user_id, guild_id, coins, last_daily) VALUES (?, ?, 0, 0)').run(userId, primaryGuildId);
            rawDb.prepare('UPDATE users SET coins = coins + ?, last_daily = ? WHERE user_id = ? AND guild_id = ?').run(reward, now, userId, primaryGuildId);

            const updatedRow = rawDb.prepare('SELECT SUM(coins) as coins FROM users WHERE user_id = ?').get(userId);
            res.json({ success: true, amount: reward, newBalance: updatedRow?.coins || reward });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/user/buy', express.json(), (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'يجب تسجيل الدخول أولاً' });
            const userId = req.session.user.id;
            const { type, name, price } = req.body;

            const userRow = rawDb.prepare('SELECT SUM(coins) as coins FROM users WHERE user_id = ?').get(userId);
            const coins = userRow?.coins || 0;

            if (coins < price) {
                return res.status(400).json({ success: false, error: 'رصيدك الحالي (' + coins.toLocaleString() + ') لا يكفي لشراء هذا العنصر (' + price.toLocaleString() + ' 🪙)' });
            }

            const guilds = req.session.guilds || [];
            const primaryGuildId = guilds.length > 0 ? guilds[0].id : 'global';

            rawDb.prepare('INSERT OR IGNORE INTO users (user_id, guild_id, coins) VALUES (?, ?, 0)').run(userId, primaryGuildId);
            rawDb.prepare('UPDATE users SET coins = MAX(0, coins - ?) WHERE user_id = ? AND guild_id = ?').run(price, userId, primaryGuildId);
            rawDb.prepare('UPDATE users SET wallpaper = ? WHERE user_id = ?').run(name, userId);
            
            const afterBuy = rawDb.prepare('SELECT SUM(coins) as coins FROM users WHERE user_id = ?').get(userId);
            res.json({ success: true, newBalance: afterBuy?.coins || 0 });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });


    // =============================================
    // Applications & Hiring System API
    // =============================================
    app.post('/api/guild/:guildId/applications/create', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { title, description, log_channel, accepted_role, reviewer_role, questions, panel_image } = req.body;

            if (!title) return res.status(400).json({ success: false, error: 'عنوان النموذج مطلوب' });
            if (!log_channel) return res.status(400).json({ success: false, error: 'قناة استقبال الطلبات مطلوبة' });

            const newApp = database.createApplication(guildId, title, description, questions || [], log_channel, accepted_role, reviewer_role, panel_image || null);
            res.json({ success: true, app: newApp });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/applications/:appId/update', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { appId } = req.params;
            const { title, description, log_channel, accepted_role, reviewer_role, questions, status, panel_image } = req.body;

            const updated = database.updateApplication(appId, title, description, questions || [], log_channel, accepted_role, reviewer_role, status || 'open', panel_image || null);
            res.json({ success: true, app: updated });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/applications/:appId/delete', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { appId } = req.params;
            database.deleteApplication(appId);
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/applications/:appId/send-panel', express.json(), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId, appId } = req.params;
            let { channelId } = req.body;

            const appData = database.getApplication(appId);
            if (!appData) return res.status(404).json({ success: false, error: 'النموذج غير موجود' });

            if (!channelId) channelId = appData.log_channel;
            const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return res.status(404).json({ success: false, error: 'لم يتم العثور على القناة المحددة' });

            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const panelEmbed = new EmbedBuilder()
                .setColor('#60a5fa')
                .setTitle(`📝 تقديم: ${appData.title}`)
                .setDescription(appData.description || 'اضغط على الزر بالأسفل لتعبئة استمارة التقديم والالتحاق بطاقم العمل.')
                .setFooter({ text: channel.guild.name, iconURL: channel.guild.iconURL({ dynamic: true }) || undefined })
                .setTimestamp();

            if (appData.panel_image) {
                panelEmbed.setImage(appData.panel_image);
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`btn_apply_${appData.id}`)
                    .setLabel('تقديم الآن 📝')
                    .setStyle(ButtonStyle.Primary)
            );

            await channel.send({ embeds: [panelEmbed], components: [row] });
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });



    // =============================================
    // Staff Activity Reset API
    // =============================================
    app.post('/api/guild/:guildId/staff/reset', async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            if (database.resetStaffStats) database.resetStaffStats(guildId);
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // Invites API (Add Bonus & Reset)
    // =============================================
    app.post('/api/guild/:guildId/invites/add-bonus', express.json(), validate(inviteBonusSchema), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            const { userId, amount } = req.body;

            if (database.addBonusInvites) {
                database.addBonusInvites(guildId, userId, amount);
            }
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/guild/:guildId/invites/reset', express.json(), sensitiveActionLimiter, async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
            const { guildId } = req.params;
            if (database.resetInvites) {
                database.resetInvites(guildId);
            }
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =============================================
    // Droplet AI Live Chat API for Dashboard
    // =============================================
    app.post('/api/guild/:guildId/ai/chat', express.json(), aiLimiter, validate(aiChatSchema), async (req, res) => {
        try {
            if (!req.session?.user) return res.status(401).json({ success: false, error: 'يجب تسجيل الدخول أولاً' });
            const { prompt } = req.body;
            const aiResponse = await askAI(prompt.trim());
            res.json({ success: true, response: aiResponse });
        } catch (e) {
            console.error('[Dashboard AI API Error]:', e);
            res.status(500).json({ success: false, error: e.message || 'حدث خطأ أثناء معالجة الطلب' });
        }
    });

    // Global Dashboard & API Error Handler
    app.use(errorHandler);
};

