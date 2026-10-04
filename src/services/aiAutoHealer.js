/**
 * AI Error Monitor & Owner Consultant for ZENO.
 *
 * يرصد الأخطاء والمشاكل في البوت والداشبورد في الوقت الفعلي،
 * يحلل المشكلة بالذكاء الاصطناعي، ثم يرسل تقريراً فورياً للمالك
 * ويطلب موافقته قبل اتخاذ أي إجراء.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const config = require('../config.json');

let aiClient = null;
function getAI() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return null;
    if (!aiClient) {
        aiClient = new GoogleGenAI({ apiKey });
    }
    return aiClient;
}

// منع تكرار نفس الخطأ أكثر من مرة كل 5 دقائق
const errorCache = new Map();
const COOLDOWN_MS = 5 * 60 * 1000;

class AIAutoHealer {
    constructor() {
        this.client = null;
        this.ownerId = process.env.OWNER_ID || config.ownerId || '1178342841882267744';
        this.initialized = false;
        this.listenersAttached = false;
    }

    init(client) {
        if (client) {
            this.client = client;
            this.initialized = true;
            client.on('error', (err) => {
                this.handleError(err, 'DiscordClientError');
            });
        }

        if (this.listenersAttached) return;
        this.listenersAttached = true;

        console.log('[AI AutoHealer] Initialized and monitoring for errors 🛡️');

        // رصد الأخطاء غير المعالجة بدون إيقاف البوت
        process.on('uncaughtException', (err) => {
            console.error('[AI AutoHealer] Uncaught Exception caught:', err);
            this.handleError(err, 'uncaughtException');
        });

        process.on('unhandledRejection', (reason) => {
            console.error('[AI AutoHealer] Unhandled Rejection caught:', reason);
            const err = reason instanceof Error ? reason : new Error(String(reason));
            this.handleError(err, 'unhandledRejection');
        });
    }

    /**
     * مسار رصد الأخطاء الرئيسي — يحلل ويستشير المالك
     */
    async handleError(error, context = 'Runtime') {
        try {
            const errMessage = error?.message || String(error);
            const errStack = error?.stack || '';
            const cacheKey = `${context}:${errMessage.slice(0, 100)}`;

            const isTest = context && context.startsWith('Test');
            const lastReported = errorCache.get(cacheKey) || 0;
            if (!isTest && Date.now() - lastReported < COOLDOWN_MS) {
                return; // منع الإزعاج بتكرار نفس الخطأ
            }
            errorCache.set(cacheKey, Date.now());

            // تحليل المشكلة بالذكاء الاصطناعي
            const analysis = await this.analyzeWithAI(errMessage, errStack, context);

            // إرسال تقرير للمالك مع اقتراح الحل والسؤال عن الموافقة
            await this.sendOwnerReport({
                context,
                errMessage,
                errStack,
                analysis
            });
        } catch (fatalInternalErr) {
            console.error('[AI AutoHealer Internal Error]:', fatalInternalErr);
        }
    }

    /**
     * تحليل المشكلة بـ Gemini AI
     */
    async analyzeWithAI(errMessage, errStack, context) {
        const ai = getAI();
        if (!ai) {
            return '⚠️ لم يتم ضبط `GEMINI_API_KEY` — تم رصد الخطأ لكن لا يوجد تحليل ذكاء اصطناعي متاح.';
        }

        try {
            const prompt = `أنت مستشار برمجي لبوت Discord اسمه ZENO مكتوب بـ Node.js وdiscord.js.
حدث خطأ أثناء التشغيل، حلله واقترح حلاً دقيقاً باللغة العربية:

نوع الخطأ: ${context}
الرسالة: ${errMessage}
Stack Trace (جزء):
${errStack.slice(0, 800)}

المطلوب:
1. ما سبب المشكلة بجملتين فقط؟
2. ما الحل المقترح بالضبط؟ (خطوة واحدة واضحة)
3. هل هي خطيرة وتحتاج تدخلاً فورياً أم يمكن تجاهلها مؤقتاً؟`;

            const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
            const response = await ai.models.generateContent({
                model: model,
                contents: prompt,
                config: { temperature: 0.2 }
            });

            return response?.text || 'تعذر استخراج تحليل من الذكاء الاصطناعي.';
        } catch (e) {
            return `تعذر استدعاء الذكاء الاصطناعي: ${e.message}`;
        }
    }

    /**
     * إرسال تقرير للمالك مع اقتراح الحل والسؤال عن الموافقة
     */
    async sendOwnerReport({ context, errMessage, errStack, analysis }) {
        if (!this.client || !this.client.isReady()) {
            console.warn('[AI AutoHealer] Discord client not ready to send DM report yet.');
            return;
        }

        try {
            const owner = await this.client.users.fetch(this.ownerId).catch(() => null);
            if (!owner) {
                console.warn(`[AI AutoHealer] Could not fetch owner with ID: ${this.ownerId}`);
                return;
            }

            const cleanStack = (errStack || '').split('\n').slice(0, 5).join('\n') || errMessage;

            const embed = new EmbedBuilder()
                .setColor(0xf59e0b) // أصفر/برتقالي = تحذير يحتاج مراجعة
                .setTitle('🔍 رصد مشكلة في البوت/الداشبورد — يحتاج مراجعتك')
                .setDescription(`تم رصد خطأ في بوت **ZENO**. تم تحليله بالذكاء الاصطناعي.\n**لم يتم اتخاذ أي إجراء تلقائي — القرار بيدك.**`)
                .addFields(
                    { name: '📍 مصدر الخطأ', value: `\`${context}\``, inline: true },
                    { name: '📄 رسالة الخطأ', value: `\`\`\`${errMessage.slice(0, 200)}\`\`\`` },
                    { name: '🧠 تحليل الذكاء الاصطناعي واقتراح الحل', value: analysis.slice(0, 1000) },
                    { name: '📑 Stack Trace', value: `\`\`\`js\n${cleanStack.slice(0, 500)}\n\`\`\`` }
                )
                .setFooter({ text: 'ZENO Error Monitor • انتظار موافقة المالك', iconURL: this.client.user?.displayAvatarURL() })
                .setTimestamp();

            // أزرار للمالك ليقرر
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('healer_ack')
                    .setLabel('✅ تم الاطلاع، شكراً')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('healer_ignore')
                    .setLabel('🚫 تجاهل هذا النوع مؤقتاً')
                    .setStyle(ButtonStyle.Secondary)
            );

            await owner.send({ embeds: [embed], components: [row] }).catch(err => {
                console.error('[AI AutoHealer] Failed to send DM to owner:', err.message);
            });

            console.log('[AI AutoHealer] Instant DM report sent to owner ✅');
        } catch (e) {
            console.error('[AI AutoHealer] Error dispatching report to owner:', e);
        }
    }
}

const autoHealer = new AIAutoHealer();

module.exports = autoHealer;
