const { GoogleGenAI } = require('@google/genai');
const https = require('https');
require('dotenv').config();

let aiClient = null;

function getClient() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return null;
    if (!aiClient) {
        aiClient = new GoogleGenAI({ apiKey });
    }
    return aiClient;
}

/**
 * محرك البحث والوصول الحي للإنترنت (Live Web Surfing Engine)
 * يجلب نتائج بحث فورية ومعلومات حية من الويب
 */
async function searchWeb(query) {
    return new Promise((resolve) => {
        try {
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
            const req = https.get(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 5000
            }, (res) => {
                let html = '';
                res.on('data', (chunk) => {
                    if (html.length < 100000) html += chunk;
                });
                res.on('end', () => {
                    try {
                        const snippets = [];
                        const regex = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/gi;
                        let match;
                        while ((match = regex.exec(html)) !== null && snippets.length < 5) {
                            const text = match[1].replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').trim();
                            if (text && text.length > 20) {
                                snippets.push(text);
                            }
                        }
                        resolve(snippets.join('\n- '));
                    } catch (e) {
                        resolve('');
                    }
                });
            });

            req.on('error', () => resolve(''));
            req.on('timeout', () => { req.destroy(); resolve(''); });
        } catch (e) {
            resolve('');
        }
    });
}

/**
 * فحص ما إذا كان السؤال يتطلب معلومات مباشرة أو تصفحاً حياً للإنترنت
 */
function needsLiveBrowsing(text) {
    if (!text || typeof text !== 'string') return false;
    const searchKeywords = [
        'بحث', 'ابحث', 'جوجل', 'نت', 'انترنت', 'اخبار', 'أخبار', 'اليوم', 'الآن', 'الان',
        'مباراة', 'مباريات', 'نتائج', 'سعر', 'اسعار', 'طقس', 'الطقس', 'جديد', 'اخر', 'آخر',
        'تريند', 'تويتر', 'يوتيوب', 'حدث', 'حديث', 'سنة 2024', 'سنة 2025', 'سنة 2026', 'معلومات عن',
        'من هو', 'من هي', 'ما هو', 'ما هي', 'متى', 'كم سعر'
    ];
    const lower = text.toLowerCase();
    return searchKeywords.some(kw => lower.includes(kw));
}

/**
 * دليل النظام الشامل لبوت ZENO
 */
const ZENO_SYSTEM_INSTRUCTION = `
أنت المساعد الذكي الرسمي المدمج داخل بوت الديسكورد العربي "ZENO" (زينو).
صفتك: متحدث لبق، ذكي، سريع البديهة، مطلع على الإنترنت، وتتحدث باللغة العربية الفصحى الواضحة والودية مع لمسة احترافية وممتعة.

قدراتك الخاصة:
- أنت متصل بالإنترنت ومزود بمحرك تصفح حي ومعلومات حية لحظية.
- يمكنك البحث في الإنترنت، معرفة أحدث الأخبار، الرياضة، التكنولوجيا، الأسعار، وأي معلومات حديثة بدقة.

معلومات أساسية عن البوت ZENO:
- الاسم: ZENO (زينو)
- الوظيفة: بوت ديسكورد عربي شامل ومتكامل يجمع بين الحماية القوية (Anti-Nuke / Auto-Mod)، السجلات الشاملة (Audit Logs)، نظام التذاكر والدعم الفني، الاقتصاد والرصيد، الخط والبرودكاست التلقائي، الرقابة وإدارة الأعضاء، ولوحة تحكم متطورة (Dashboard).
- البادئة الافتراضية (Prefix): # (مع دعم كامل لجميع أوامر السلاش / Slash Commands).
- لوحة التحكم (Web Dashboard): تتيح لمالك السيرفر والإدارة التحكم الكامل في كل إعدادات البوت والسجلات والأوامر لحظياً.

أقسام وميزات بوت ZENO الرئيسية:
1. نظام الحماية الشاملة و Anti-Nuke:
   - حماية السيرفر من هجمات التخريب (Anti-Raid, Anti-Nuke, Anti-Bot).
   - أوامر: /anti-ban، /anti-bots، /anti-delete-roles، /anti-delete-rooms، /antilink، /antispam، /badwords، /protection-status، /set-protect-logs.

2. نظام السجلات الشاملة (Server Audit Logs):
   - 13 فئة و105 نوع من السجلات التفصيلية.
   - أوامر: /setup-logs، /logs-info، /set-logs.

3. نظام التذاكر والدعم الفني (Tickets & Applications):
   - تذاكر متقدمة بأزرار أو قائمة منسدلة (Select Menu)، مع حفظ الترانسكريبت (Transcript).
   - أوامر: /setup-ticket، /add-ticket-button، /to-select، /close، /delete، /rename، /add-user، /remove-user، /set-ticket-log، /setup-rating.
   - التقديمات: /setup-apply، /new-apply، /close-apply.

4. نظام الإشراف والرقابة (Moderation):
   - /ban، /unban، /unbanall، /kick، /mute، /timeout، /untimeout، /untimeall، /warn، /warns، /unwarn، /clear، /lock، /unlock، /hide، /show، /unhide، /nickname، /promote، /demote، /role، /role-all، /xroles، /snipe، /come.

5. نظام الاقتصاد والرصيد (Economy):
   - /daily، /rovex، /balance، /tax، /tax-mode، /set-tax-room، /set-tax-line، /profile، /rank، /top، /leaderboard.

6. نظام الخطوط التلقائية (Auto-Line & Services):
   - /set-autoline-line، /add-autoline-channel، /remove-autoline-channel، /line-mode، /set-suggestions-room، /set-suggestions-line، /suggestion-mode، /set-feedback-room، /set-feedback-line.

7. الإعدادات والخدمات العامة:
   - /greet، /setup-welcome، /set-message، /autorole، /settempvoice، /autoreply-add، /autoreply-list، /autoreply-remove، /alias، /set-shortcut، /help، /avatar، /banner، /user، /server، /embed، /say، /ping، /gstart، /gend، /greroll.

إرشادات الإجابة:
- عند الإجابة على أي موضوع حالي أو عام، اعتمد على نتائج التصفح الحي المرفقة مع السؤال مع التحليل الذكي.
- نسق الإجابات بأسلوب ديسكورد المميز (خط عريض، نقاط، إيموجي).
- تجنب الردود الطويلة جداً غير المفيدة؛ كن دقيقاً وممتعاً.
`;

/**
 * دالة مركزية للتحدث مع الذكاء الاصطناعي مع التصفح التلقائي الحي للإنترنت
 * @param {string} promptText نص السؤال أو المحادثة
 * @returns {Promise<string>} رد الذكاء الاصطناعي المدعم بالإنترنت
 */
async function askAI(promptText) {
    if (!promptText || typeof promptText !== 'string' || !promptText.trim()) {
        return '❌ يرجى كتابة سؤال صالح.';
    }

    const ai = getClient();
    if (!ai) {
        return '❌ لم يتم ضبط مفتاح `GEMINI_API_KEY` في متغيرات البيئة (Environment Variables).';
    }

    let enrichedPrompt = promptText.trim();

    // إذا كان السؤال يتطلب معلومات حية أو بحثاً من الإنترنت
    if (needsLiveBrowsing(promptText)) {
        try {
            const webResults = await searchWeb(promptText.trim());
            if (webResults && webResults.length > 20) {
                enrichedPrompt = `[نتائج البحث الحي من الويب]:\n- ${webResults}\n\n[سؤال المستخدم]: ${promptText.trim()}\n\n(يرجى الإجابة بدقة بالاعتماد على نتائج البحث الحي المرفقة أعلاه وصياغتها بأسلوبك الذكي والجميل).`;
            }
        } catch (err) {
            console.warn('[Web Search Fallback Error]:', err?.message || err);
        }
    }

    const configuredModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

    try {
        const ai = getClient();
        if (!ai) {
            return '❌ لم يتم ضبط مفتاح `GEMINI_API_KEY` في متغيرات البيئة.';
        }

        const response = await ai.models.generateContent({
            model: configuredModel,
            contents: enrichedPrompt,
            config: {
                systemInstruction: ZENO_SYSTEM_INSTRUCTION,
                temperature: 0.7,
            }
        });

        if (response && response.text) {
            return response.text;
        }

        return '❌ لم يأتِ رد من الذكاء الاصطناعي، حاول مرة أخرى.';

    } catch (error) {
        const status = Number(error?.status || error?.code || 0);
        console.error(`[AI Error] فشل الاتصال (status ${status}):`, error?.message || error);

        if (status === 429) {
            return '⏳ الذكاء الاصطناعي مشغول حالياً، يرجى الانتظار قليلاً والمحاولة مجدداً.';
        }
        if (status === 400) {
            return '❌ السؤال يحتوي على محتوى غير مدعوم، يرجى إعادة صياغته.';
        }

        return '❌ عذراً، حدث خطأ أثناء الاتصال بالذكاء الاصطناعي، يرجى المحاولة لاحقاً.';
    }

}

module.exports = { askAI, ZENO_SYSTEM_INSTRUCTION, searchWeb };
