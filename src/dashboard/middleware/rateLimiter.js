const rateLimit = require('express-rate-limit');

/**
 * Standard API Rate Limiter
 * 120 requests per minute per IP for general dashboard browsing and stats
 */
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too Many Requests: تم تجاوز حد الطلبات المسموح به. يرجى الانتظار قليلاً.'
    }
});

/**
 * Sensitive Actions Rate Limiter
 * 20 requests per minute for operations like resetting data, auto-setup, clear warnings, panel creation
 */
const sensitiveActionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too Many Requests: عدد كبير من العمليات الحساسة في وقت قصير. يرجى المحاولة بعد قليل.'
    }
});

/**
 * AI Chat Limiter
 * 15 requests per minute for AI interactions
 */
const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too Many Requests: تم تجاوز حد رسائل الذكاء الاصطناعي للدقيقة. انتظر قليلاً.'
    }
});

// ==========================================
// Appeal Form Limiter
// 3 submissions per 10 minutes per IP — prevents appeal spam
// ==========================================
const appealLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).type('html').send('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>مهلة | Droplet</title></head><body style="background:#070d1d;color:#e2e8f0;font-family:\'Segoe UI\',Tahoma,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;"><div style="text-align:center;"><h1 style="color:#f59e0b;">⏳ طلبات كثيرة</h1><p style="color:#94a3b8;">حاول تقديم استئنافك بعد 10 دقائق.</p></div></body></html>');
    }
});

// ==========================================
// Auth Limiter (OAuth / تسجيل الدخول)
// 15 محاولة كل 10 دقائق لكل IP على /auth/discord{,/callback} و /logout —
// يمنع زراعة جلسات شبح (فيلود جلسات قاعدة البيانات) وضرب نقطة OAuth
// ==========================================
const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).type('html').send('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>مهلة | Droplet</title></head><body style="background:#070d1d;color:#e2e8f0;font-family:\'Segoe UI\',Tahoma,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;"><div style="text-align:center;"><h1 style="color:#f59e0b;">⏳ محاولات كثيرة</h1><p style="color:#94a3b8;">عدد كبير من محاولات الدخول من هذا العنوان — حاول بعد 10 دقائق.</p></div></body></html>');
    }
});

/**
 * Internal Sync Limiter
 * 30 requests per minute on /internal/sync/users — the bot pushes once per 3 min,
 * this only exists to blunt credential-guessing / payload flooding attempts.
 */
const syncLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too Many Requests: sync rate limit exceeded.'
    }
});

module.exports = {
    apiLimiter,
    sensitiveActionLimiter,
    aiLimiter,
    appealLimiter,
    syncLimiter,
    authLimiter
};
