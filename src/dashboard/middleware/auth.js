const { PermissionFlagsBits } = require('discord.js');

/**
 * Authentication & Authorization Middleware for Droplet Dashboard
 */

/**
 * Ensure user is logged in
 */
function requireAuth(req, res, next) {
    if (!req.session || !req.session.user || !req.session.user.id) {
        if (req.originalUrl.startsWith('/api/')) {
            return res.status(401).json({ success: false, error: 'Unauthorized: يرجى تسجيل الدخول أولاً' });
        }
        return res.redirect('/auth/discord');
    }
    next();
}

/**
 * Real-time Guild Permission Verification
 * Checks if the logged-in user is the owner of the guild or has Administrator / ManageGuild permissions.
 * Verifies live against Discord cache/fetch at the time of each request, not just at login.
 */
function createGuildAuthMiddleware(client) {
    return async function requireGuildPermission(req, res, next) {
        if (!req.session || !req.session.user || !req.session.user.id) {
            if (req.originalUrl.startsWith('/api/')) {
                return res.status(401).json({ success: false, error: 'Unauthorized: يرجى تسجيل الدخول أولاً' });
            }
            return res.redirect('/auth/discord');
        }

        const guildId = req.params.guildId || req.body?.guildId || req.query?.guildId;
        if (!guildId) {
            if (req.originalUrl.startsWith('/api/')) {
                return res.status(400).json({ success: false, error: 'Bad Request: معرف السيرفر مطلوب' });
            }
            return res.redirect('/dashboard/manage');
        }

        const userId = req.session.user.id;

        try {
            // 1. Check if bot is in the guild
            let guild = client?.guilds?.cache?.get(guildId);
            if (!guild && client?.guilds?.fetch) {
                guild = await client.guilds.fetch(guildId).catch(() => null);
            }

            if (!guild) {
                if (req.originalUrl.startsWith('/api/')) {
                    return res.status(404).json({ success: false, error: 'البوت غير متواجد في هذا السيرفر أو السيرفر غير موجود' });
                }
                return res.status(404).send(`
                    <div style="background:#0b0d14;color:#fff;font-family:sans-serif;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
                        <h2>البوت غير موجود في هذا السيرفر</h2>
                        <a href="/dashboard/manage" style="color:#a855f7;margin-top:10px;">العودة للوحة التحكم</a>
                    </div>
                `);
            }

            // 2. Real-time Member Permission check
            // Owner of the guild always has full access
            if (guild.ownerId === userId) {
                req.guild = guild;
                req.isGuildOwner = true;
                return next();
            }

            // 🔒 fail-closed: جلب العضو حياً — التفرقة بين "موب عضو" و"فشل تقني بالجلب"
            let member = null;
            let _liveVerified = false;   // قدرنا نجيب صلاحيات العضو الحية
            let _fetchFailed = false;    // فشل تقني (خصوصية/انقطاع) — مو "موب موجود"
            try {
                member = guild.members.cache.get(userId) || null;
                if (member) {
                    _liveVerified = true;
                }
                if (!_liveVerified) {
                    member = await guild.members.fetch(userId);
                    _liveVerified = true;
                }
            } catch (err) {
                member = null;
                // 10007 = Unknown Member (العضو مو بالسيرفر أصلاً) — هذا إثبات حي بالرفض مو فشل تقني
                _fetchFailed = !(err && (err.code === 10007 || (err.rawError && err.rawError.code === 10007)));
            }

            if (member) {
                const hasAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
                const hasManageGuild = member.permissions.has(PermissionFlagsBits.ManageGuild);

                if (hasAdmin || hasManageGuild) {
                    req.guild = guild;
                    req.guildMember = member;
                    return next();
                }
                // ✅ العضو مؤكد حضورياً وبلا صلاحيات إدارة — رفض نهائي (بلا أي fallback)
            } else if (_fetchFailed) {
                // Fallback: فقط إذا تعذر التحقق الحي تقنياً (إعدادات خصوصية بالمثل)،
                // ويجب تكون snapshot الجلسة يدل فعلياً على مالك أو Administrator أو ManageGuild
                const sessionGuilds = req.session.guilds || [];
                const cachedGuild = sessionGuilds.find(g => g.id === guildId);
                if (cachedGuild && (cachedGuild.isOwner || (Number(cachedGuild.permissions || 0) & 0x8) || (Number(cachedGuild.permissions || 0) & 0x20))) {
                    req.guild = guild;
                    return next();
                }
            }

            // User does not have permission
            if (req.originalUrl.startsWith('/api/')) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'Forbidden: لا تملك صلاحيات إدارة (Administrator أو Manage Server) في هذا السيرفر' 
                });
            }

            return res.status(403).send(`
                <div style="background:#0b0d14;color:#fff;font-family:sans-serif;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
                    <h2>ليس لديك صلاحيات إدارة في هذا السيرفر</h2>
                    <p style="color:#888;">يجب أن تكون مالك السيرفر أو تمتلك صلاحية Manage Server / Administrator</p>
                    <a href="/dashboard/manage" style="color:#a855f7;margin-top:10px;">العودة لخوادمك المتاحة</a>
                </div>
            `);

        } catch (err) {
            console.error('[AUTH MIDDLEWARE ERROR]', err);
            if (req.originalUrl.startsWith('/api/')) {
                return res.status(500).json({ success: false, error: 'حدث خطأ أثناء التحقق من الصلاحيات' });
            }
            return res.status(500).send('حدث خطأ أثناء فحص الصلاحيات');
        }
    };
}

module.exports = {
    requireAuth,
    createGuildAuthMiddleware
};
