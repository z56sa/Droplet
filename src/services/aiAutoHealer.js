/**
 * AI Error Monitor & Owner Consultant for ZENO (v2)
 *
 * - يرصد الأخطاء في الوقت الفعلي (Discord / Process / فحص صحة دوري)
 * - يحجب الأسرار (التوكنات والمفاتيح) قبل إرسالها للذكاء الاصطناعي أو للمالك
 * - يشخّص الأخطاء المعروفة محلياً بدون استهلاك حصة Gemini
 * - يحلل الأخطاء الجديدة بـ Gemini مع إعادة محاولة ونموذج احتياطي
 * - يرسل تقريراً للمالك (خاص، أو قناة احتياطية) بدون أي إجراء تلقائي
 */

const crypto = require('crypto');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const config = require('../config.json');

// ───────────────────────── الإعدادات ─────────────────────────
const COOLDOWN_MS = 5 * 60 * 1000;          // نفس الخطأ مرة كل 5 دقائق
const IGNORE_MS = 60 * 60 * 1000;           // مدة زر "تجاهل"
const MAX_REPORTS_PER_HOUR = 10;            // حد أقصى للتقارير في الساعة (منع الإزعاج)
const AI_TIMEOUT_MS = 15000;
const HEALTH_INTERVAL_MS = 5 * 60 * 1000;
const MEM_LIMIT_MB = Number(process.env.HEALER_MEM_MB) || 420;
const PING_LIMIT_MS = Number(process.env.HEALER_PING_MS) || 1500;
const MAX_CACHE_ENTRIES = 500;

const SEVERITY = {
    critical: { color: 0xef4444, label: '🔴 حرج' },
    high: { color: 0xf97316, label: '🟠 عالٍ' },
    medium: { color: 0xf59e0b, label: '🟡 متوسط' },
    low: { color: 0x3b82f6, label: '🔵 منخفض' }
};

// أخطاء معروفة: تشخيص محلي فوري بدون ذكاء اصطناعي
const KNOWN_ISSUES = [
    {
        pattern: /TokenInvalid|An invalid token was provided/i,
        severity: 'critical',
        title: 'توكن البوت غير صالح',
        advice: 'تحقق من متغير التوكن في Render (Environment) وأعد توليده من Discord Developer Portal إن لزم.'
    },
    {
        pattern: /models\/.+(not found|not supported)|NOT_FOUND/i,
        severity: 'high',
        title: 'اسم نموذج Gemini غير صحيح',
        advice: 'اضبط `GEMINI_MODEL` في Render باسم نموذج موجود في Google AI Studio (مثل gemini-2.5-flash).'
    },
    {
        pattern: /RESOURCE_EXHAUSTED|\b429\b|quota/i,
        severity: 'medium',
        title: 'تجاوز حد طلبات Gemini',
        advice: 'الحصة المجانية انتهت مؤقتاً. قلّل الاستخدام أو انتظر تجديد الحصة أو فعّل الفوترة.'
    },
    {
        pattern: /UNAVAILABLE|high demand|\b503\b/i,
        severity: 'low',
        title: 'ازدحام مؤقت في خوادم Gemini',
        advice: 'خطأ مؤقت من Google، ويعالجه كود `ai.js` بإعادة المحاولة. لا يحتاج تدخلاً.'
    },
    {
        pattern: /Unknown interaction|\b10062\b/i,
        severity: 'low',
        title: 'انتهت صلاحية التفاعل (3 ثوانٍ)',
        advice: 'استدعِ `interaction.deferReply()` في أول سطر من الأمر قبل أي عملية بطيئة (قاعدة بيانات / AI).'
    },
    {
        pattern: /Unknown Message|\b10008\b/i,
        severity: 'low',
        title: 'رسالة محذوفة أثناء التعديل',
        advice: 'الرسالة حُذفت قبل أن يعدّلها البوت. غلّف التعديل بـ `.catch(() => {})`.'
    },
    {
        pattern: /Missing Permissions|Missing Access|\b5001[3]?\b/i,
        severity: 'medium',
        title: 'نقص صلاحيات البوت',
        advice: 'تحقق من صلاحيات رتبة البوت وترتيبها في السيرفر، ومن صلاحيات القناة المعنية.'
    },
    {
        pattern: /Cannot send messages to this user|\b50007\b/i,
        severity: 'low',
        title: 'الخاص مغلق عند المستخدم',
        advice: 'المستخدم مغلق رسائله الخاصة. تجاهله أو أرسل في القناة بدلاً من ذلك.'
    },
    {
        pattern: /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i,
        severity: 'low',
        title: 'مشكلة اتصال شبكي مؤقتة',
        advice: 'انقطاع شبكي عابر. إن تكرر كثيراً فتحقق من حالة Render و Turso.'
    },
    {
        pattern: /SQLITE_BUSY|database is locked/i,
        severity: 'medium',
        title: 'قاعدة SQLite مشغولة',
        advice: 'عمليات كتابة متزامنة كثيرة. جمّع الكتابات أو أضف إعادة محاولة قصيرة.'
    },
    {
        pattern: /turso|libsql/i,
        severity: 'high',
        title: 'مشكلة في مزامنة Turso',
        advice: 'تحقق من `TURSO_DATABASE_URL` و `TURSO_AUTH_TOKEN` وحالة قاعدة Turso.'
    }
];

// ───────────────────────── أدوات مساعدة ─────────────────────────
let aiClient = null;
function getAI() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return null;
    if (!aiClient) aiClient = new GoogleGenAI({ apiKey });
    return aiClient;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('AI_TIMEOUT')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const SENSITIVE_ENV_RE = /(TOKEN|KEY|SECRET|PASSWORD|PGPASS|AUTH|DATABASE_URL)/i;

/** يحجب أي سر (قيم متغيرات البيئة الحساسة + أنماط التوكنات) من النص */
function redact(text) {
    if (!text) return '';
    let out = String(text);

    const secrets = Object.entries(process.env)
        .filter(([k, v]) => v && v.length >= 8 && SENSITIVE_ENV_RE.test(k))
        .map(([, v]) => v)
        .sort((a, b) => b.length - a.length);

    for (const s of secrets) {
        if (out.includes(s)) out = out.split(s).join('[REDACTED]');
    }

    return out
        .replace(/[MNO][A-Za-z\d_-]{23,25}\.[\w-]{6}\.[\w-]{27,}/g, '[DISCORD_TOKEN]')
        .replace(/AIza[0-9A-Za-z_-]{35}/g, '[GOOGLE_KEY]')
        .replace(/Bearer\s+[\w.~+/-]+=*/gi, 'Bearer [REDACTED]');
}

function normalizeError(e) {
    if (e instanceof Error) return e;
    let msg;
    try {
        msg = typeof e === 'string' ? e : JSON.stringify(e);
    } catch {
        msg = String(e);
    }
    return new Error(msg);
}

/** بصمة ثابتة للخطأ (تتجاهل الأرقام الطويلة مثل IDs) */
function fingerprint(context, message) {
    const norm = message.replace(/\d{5,}/g, '#').replace(/0x[0-9a-f]+/gi, '0x#').slice(0, 120);
    return crypto.createHash('md5').update(`${context}|${norm}`).digest('hex').slice(0, 10);
}

/** يستخرج أول موضع في كود المشروع (يتجاوز node_modules) */
function extractSource(stack) {
    for (const line of String(stack || '').split('\n')) {
        if (line.includes('node_modules') || line.includes('node:internal')) continue;
        const m = line.match(/([^\s()]+[\\/]src[\\/][^\s():]+\.[cm]?js):(\d+)/);
        if (m) {
            const clean = m[1].replace(/\\/g, '/').replace(/^.*\/src\//, '');
            return `src/${clean}:${m[2]}`;
        }
    }
    return null;
}

function formatUptime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h} س ${m} د` : `${m} د`;
}

// ───────────────────────── الكلاس الرئيسي ─────────────────────────
class AIAutoHealer {
    constructor() {
        this.client = null;
        this.hookedClient = null;
        this.ownerId = process.env.OWNER_ID || config.ownerId || '1178342841882267744';
        this.initialized = false;
        this.listenersAttached = false;

        this.stats = new Map();   // key -> { count, sinceReport, firstSeen, lastSeen, lastReported, ignoredUntil }
        this.reportTimes = [];
        this.fatalTimes = [];
        this.pingStrikes = 0;
        this.healthTimer = null;
    }

    init(client) {
        if (client && this.hookedClient !== client) {
            this.client = client;
            this.hookedClient = client;
            this.initialized = true;

            client.on('error', (err) => this.handleError(err, 'DiscordClientError'));
            client.on('shardError', (err) => this.handleError(err, 'DiscordShardError'));
            this.startHealthMonitor();
        }

        if (this.listenersAttached) return;
        this.listenersAttached = true;

        console.log('[AI AutoHealer] Initialized and monitoring for errors 🛡️');

        process.on('uncaughtException', (err) => {
            console.error('[AI AutoHealer] Uncaught Exception caught:', err);
            this.handleError(err, 'uncaughtException');

            // إذا تكرر الانهيار بسرعة، أعد تشغيل العملية (Render يعيد تشغيلها تلقائياً)
            const now = Date.now();
            this.fatalTimes = this.fatalTimes.filter((t) => now - t < 60 * 1000);
            this.fatalTimes.push(now);
            if (this.fatalTimes.length >= 5) {
                console.error('[AI AutoHealer] Too many uncaught exceptions in 1 minute — exiting for restart.');
                setTimeout(() => process.exit(1), 3000);
            }
        });

        process.on('unhandledRejection', (reason) => {
            console.error('[AI AutoHealer] Unhandled Rejection caught:', reason);
            this.handleError(normalizeError(reason), 'unhandledRejection');
        });
    }

    // ───────── فحص الصحة الدوري ─────────
    startHealthMonitor() {
        if (this.healthTimer) return;
        this.healthTimer = setInterval(() => this.checkHealth(), HEALTH_INTERVAL_MS);
        if (this.healthTimer.unref) this.healthTimer.unref();
    }

    checkHealth() {
        try {
            const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
            if (rssMb > MEM_LIMIT_MB) {
                const e = new Error('High memory usage: RSS above limit');
                e.severity = 'high';
                e.title = 'استهلاك ذاكرة مرتفع';
                e.advice = 'الذاكرة تقترب من حد الخادم وقد يعيد Render تشغيل البوت. ابحث عن تسريب (كاشات كبيرة، Collectors لم تُغلق).';
                e.extra = `RSS = ${rssMb}MB (الحد ${MEM_LIMIT_MB}MB)`;
                this.handleError(e, 'HealthCheck:Memory');
            }

            const ping = this.client?.ws?.ping;
            if (typeof ping === 'number' && ping > PING_LIMIT_MS) {
                this.pingStrikes++;
                if (this.pingStrikes >= 3) {
                    const e = new Error('High gateway latency for 3 consecutive checks');
                    e.severity = 'medium';
                    e.title = 'بطء مستمر في اتصال Discord';
                    e.advice = 'تأخر الاتصال بـ Discord. تحقق من حالة Render و discordstatus.com.';
                    e.extra = `Ping = ${ping}ms (الحد ${PING_LIMIT_MS}ms)`;
                    this.pingStrikes = 0;
                    this.handleError(e, 'HealthCheck:Ping');
                }
            } else {
                this.pingStrikes = 0;
            }
        } catch (e) {
            console.error('[AI AutoHealer] Health check failed:', e);
        }
    }

    // ───────── التحكم في الإزعاج ─────────
    allowReport(now) {
        this.reportTimes = this.reportTimes.filter((t) => now - t < 60 * 60 * 1000);
        if (this.reportTimes.length >= MAX_REPORTS_PER_HOUR) return false;
        this.reportTimes.push(now);
        return true;
    }

    pruneStats() {
        if (this.stats.size <= MAX_CACHE_ENTRIES) return;
        const sorted = [...this.stats.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
        for (const [key] of sorted.slice(0, Math.floor(MAX_CACHE_ENTRIES / 2))) {
            this.stats.delete(key);
        }
    }

    // ───────── المسار الرئيسي ─────────
    async handleError(error, context = 'Runtime') {
        try {
            const err = normalizeError(error);
            const message = redact(err.message || String(err));
            const stack = redact(err.stack || '');
            const key = fingerprint(context, message);
            const now = Date.now();
            const isTest = typeof context === 'string' && context.startsWith('Test');

            let entry = this.stats.get(key);
            if (!entry) {
                entry = { count: 0, sinceReport: 0, firstSeen: now, lastSeen: now, lastReported: 0, ignoredUntil: 0 };
                this.stats.set(key, entry);
                this.pruneStats();
            }
            entry.count++;
            entry.sinceReport++;
            entry.lastSeen = now;

            if (!isTest) {
                if (now < entry.ignoredUntil) return;
                if (now - entry.lastReported < COOLDOWN_MS) return;
                if (!this.allowReport(now)) {
                    console.warn('[AI AutoHealer] Report rate limit reached — suppressed:', message.slice(0, 80));
                    return;
                }
            }

            const repeats = entry.sinceReport;
            entry.lastReported = now;
            entry.sinceReport = 0;

            // 1) تشخيص محلي، وإلا تحليل بالذكاء الاصطناعي
            let known = null;
            if (err.advice) {
                known = { severity: err.severity || 'medium', title: err.title || 'تنبيه', advice: err.advice };
            } else {
                known = KNOWN_ISSUES.find((i) => i.pattern.test(`${message}\n${stack.slice(0, 300)}`)) || null;
            }

            let analysis;
            let severity;
            if (known) {
                severity = known.severity;
                analysis = `**${known.title}**\n${known.advice}`;
            } else {
                severity = 'medium';
                analysis = await this.analyzeWithAI(message, stack, context);
            }

            await this.sendOwnerReport({
                key,
                context,
                message,
                stack,
                analysis,
                severity,
                repeats,
                source: extractSource(stack),
                extra: err.extra ? redact(err.extra) : null
            });
        } catch (fatalInternalErr) {
            console.error('[AI AutoHealer Internal Error]:', fatalInternalErr);
        }
    }

    /** واجهة بسيطة للاستخدام اليدوي داخل الأوامر: autoHealer.report(err, 'Command:ping') */
    report(error, context = 'Manual') {
        return this.handleError(error, context);
    }

    // ───────── التحليل بـ Gemini ─────────
    async analyzeWithAI(message, stack, context) {
        const ai = getAI();
        if (!ai) {
            return '⚠️ لم يتم ضبط `GEMINI_API_KEY` — تم رصد الخطأ لكن لا يوجد تحليل ذكاء اصطناعي متاح.';
        }

        const prompt = `أنت مستشار برمجي لبوت Discord اسمه ZENO مكتوب بـ Node.js وdiscord.js ويعمل على Render.
حدث خطأ أثناء التشغيل، حلله واقترح حلاً دقيقاً باللغة العربية.

نوع الخطأ: ${context}
الرسالة: ${message.slice(0, 500)}
Stack Trace (جزء):
${stack.slice(0, 800)}

أجب بهذا الشكل المختصر فقط:
السبب: (جملتان كحد أقصى)
الحل: (خطوة واحدة واضحة)
الخطورة: (حرجة / متوسطة / يمكن تجاهلها مؤقتاً) مع سبب قصير`;

        const models = [...new Set([
            process.env.GEMINI_MODEL,
            process.env.GEMINI_FALLBACK_MODEL,
            'gemini-3.8-flash',
            'gemini-3-flash',
            'gemini-2.5-flash'
        ].filter(Boolean))];

        for (const model of models) {
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const response = await withTimeout(
                        ai.models.generateContent({ model, contents: prompt, config: { temperature: 0.2 } }),
                        AI_TIMEOUT_MS
                    );
                    if (response?.text) return response.text;
                    break;
                } catch (e) {
                    const status = Number(e?.status || e?.code || 0);
                    if (status === 400 || status === 404) break; // نموذج/مفتاح خطأ: انتقل للتالي
                    if ([429, 500, 503].includes(status) || e.message === 'AI_TIMEOUT') {
                        await sleep(1000 * Math.pow(2, attempt));
                        continue;
                    }
                    break;
                }
            }
        }

        return 'تعذر الحصول على تحليل من الذكاء الاصطناعي حالياً. راجع الـ Stack Trace يدوياً.';
    }

    // ───────── إرسال التقرير ─────────
    async sendOwnerReport({ key, context, message, stack, analysis, severity, repeats, source, extra }) {
        if (!this.client || !this.client.isReady()) {
            console.warn('[AI AutoHealer] Discord client not ready to send report yet.');
            return;
        }

        const sev = SEVERITY[severity] || SEVERITY.medium;
        const cleanStack = stack.split('\n').slice(0, 5).join('\n') || message;

        const fields = [
            { name: '⚠️ الخطورة', value: sev.label, inline: true },
            { name: '📍 المصدر', value: `\`${context}\``, inline: true },
            { name: '🔁 التكرار', value: `${repeats} مرة منذ آخر تقرير`, inline: true }
        ];
        if (source) fields.push({ name: '📂 الملف المشتبه', value: `\`${source}\``, inline: false });
        if (extra) fields.push({ name: 'ℹ️ تفاصيل', value: extra.slice(0, 300), inline: false });
        fields.push(
            { name: '📄 رسالة الخطأ', value: `\`\`\`${message.slice(0, 300)}\`\`\`` },
            { name: '🧠 التشخيص واقتراح الحل', value: analysis.slice(0, 1000) },
            { name: '📑 Stack Trace', value: `\`\`\`js\n${cleanStack.slice(0, 500)}\n\`\`\`` }
        );

        const embed = new EmbedBuilder()
            .setColor(sev.color)
            .setTitle('🔍 رصد مشكلة في البوت/الداشبورد — يحتاج مراجعتك')
            .setDescription('تم رصد خطأ في بوت **ZENO**.\n**لم يتم اتخاذ أي إجراء تلقائي — القرار بيدك.**')
            .addFields(fields)
            .setFooter({
                text: `ZENO Error Monitor • تشغيل: ${formatUptime(process.uptime())}`,
                iconURL: this.client.user?.displayAvatarURL()
            })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`healer_ack:${key}`)
                .setLabel('✅ تم الاطلاع، شكراً')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`healer_ignore:${key}`)
                .setLabel('🚫 تجاهل هذا النوع ساعة')
                .setStyle(ButtonStyle.Secondary)
        );

        const payload = { embeds: [embed], components: [row] };
        let sent = false;

        try {
            const owner = await this.client.users.fetch(this.ownerId);
            await owner.send(payload);
            sent = true;
        } catch (err) {
            console.error('[AI AutoHealer] Failed to DM owner:', err.message);
        }

        // قناة احتياطية إذا كان الخاص مغلقاً
        if (!sent && process.env.HEALER_LOG_CHANNEL_ID) {
            try {
                const channel = await this.client.channels.fetch(process.env.HEALER_LOG_CHANNEL_ID);
                await channel.send(payload);
                sent = true;
            } catch (err) {
                console.error('[AI AutoHealer] Failed to send to log channel:', err.message);
            }
        }

        if (sent) console.log('[AI AutoHealer] Report sent to owner ✅');
    }

    // ───────── معالج الأزرار ─────────
    /**
     * استدعِه من interactionCreate. يرجع true إذا كان التفاعل يخص الـ Healer.
     */
    async handleInteraction(interaction) {
        try {
            if (!interaction.isButton() || !interaction.customId.startsWith('healer_')) return false;

            if (interaction.user.id !== this.ownerId) {
                await interaction.reply({ content: '❌ هذا الزر للمالك فقط.', flags: 64 }).catch(() => {});
                return true;
            }

            const [action, key] = interaction.customId.split(':');
            const entry = this.stats.get(key);
            let note;

            if (action === 'healer_ignore') {
                if (entry) entry.ignoredUntil = Date.now() + IGNORE_MS;
                note = 'تم التجاهل لمدة ساعة 🚫';
            } else {
                note = 'تم الاطلاع ✅';
            }

            const base = interaction.message.embeds[0];
            const updated = base
                ? EmbedBuilder.from(base).setColor(0x6b7280).setFooter({ text: `ZENO Error Monitor • ${note}` })
                : null;

            await interaction.update({ embeds: updated ? [updated] : [], components: [] });
            return true;
        } catch (e) {
            console.error('[AI AutoHealer] Button handler error:', e);
            return true;
        }
    }
}

const autoHealer = new AIAutoHealer();

module.exports = autoHealer;