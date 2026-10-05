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

// كلمات مفردة: تُطابق ككلمة كاملة فقط (حتى لا تطابق "نت" داخل "كنت" أو "انت")
const SINGLE_KEYWORDS = new Set([
    'بحث', 'ابحث', 'جوجل', 'نت', 'انترنت', 'اخبار', 'أخبار', 'اليوم', 'الآن', 'الان',
    'مباراة', 'مباريات', 'نتائج', 'سعر', 'اسعار', 'طقس', 'الطقس', 'جديد', 'اخر', 'آخر',
    'تريند', 'تويتر', 'يوتيوب', 'حدث', 'حديث', 'متى'
]);
// عبارات متعددة الكلمات: تُطابق كجزء من النص
const PHRASE_KEYWORDS = [
    'سنة 2024', 'سنة 2025', 'سنة 2026', 'معلومات عن',
    'من هو', 'من هي', 'ما هو', 'ما هي', 'كم سعر'
];

function needsLiveBrowsing(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    const words = lower.split(/[\s\p{P}]+/u).filter(Boolean);
    if (words.some(w => SINGLE_KEYWORDS.has(w))) return true;
    return PHRASE_KEYWORDS.some(p => lower.includes(p));
}

const ZENO_SYSTEM_INSTRUCTION = `
أنت المساعد الذكي الرسمي المدمج داخل بوت الديسكورد العربي "ZENO" (زينو).
صفتك: متحدث لبق، ذكي، سريع البديهة، مطلع على الإنترنت، وتتحدث باللغة العربية الفصحى الواضحة والودية مع لمسة احترافية وممتعة.
`;

// النماذج بالترتيب: الأساسي ثم الاحتياطي. تأكد من أسمائها في Google AI Studio
const MODELS = [
    process.env.GEMINI_MODEL,
    process.env.GEMINI_FALLBACK_MODEL,
    'gemini-3.8-flash',
    'gemini-3-flash',
    'gemini-2.5-flash'
].filter(Boolean);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function generateWithRetry(ai, prompt) {
    let lastError;
    for (const model of MODELS) {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const response = await ai.models.generateContent({
                    model,
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    config: { systemInstruction: ZENO_SYSTEM_INSTRUCTION, temperature: 0.7 }
                });
                const text = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) return text;
                throw new Error('EMPTY_RESPONSE');
            } catch (error) {
                lastError = error;
                const status = Number(error?.status || error?.code || 0);
                console.warn(`[AI] ${model} attempt ${attempt + 1} failed: ${status} ${error?.message?.slice(0, 120)}`);

                // 400/404: النموذج أو المفتاح خطأ، انتقل للنموذج التالي
                if (status === 400 || status === 404) break;
                // 429/500/503: مؤقتة، انتظر ثم أعد المحاولة
                if ([429, 500, 503].includes(status)) {
                    await sleep(1000 * Math.pow(2, attempt)); // 1s, 2s, 4s
                    continue;
                }
                break;
            }
        }
    }
    throw lastError;
}

async function askAI(promptText) {
    if (!promptText || typeof promptText !== 'string' || !promptText.trim()) {
        return '❌ يرجى كتابة سؤال صالح.';
    }

    const ai = getClient();
    if (!ai) {
        return '❌ لم يتم ضبط مفتاح `GEMINI_API_KEY` في متغيرات البيئة (Environment Variables).';
    }

    let enrichedPrompt = promptText.trim();

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

    try {
        return await generateWithRetry(ai, enrichedPrompt);
    } catch (error) {
        console.error('[AI Critical Error Details]:', error);
        const status = Number(error?.status || error?.code || 0);

        if (status === 429) return '⏳ تجاوزنا حد الطلبات، حاول بعد قليل.';
        if (status === 503) return '⏳ خوادم Gemini مزدحمة الآن، حاول بعد دقيقة.';
        if (status === 400 || status === 404) return '❌ إعدادات النموذج أو المفتاح غير صحيحة، تواصل مع الإدارة.';
        return '❌ عذراً، حدث خطأ أثناء الاتصال بالذكاء الاصطناعي، يرجى المحاولة لاحقاً.';
    }
}

module.exports = { askAI, ZENO_SYSTEM_INSTRUCTION, searchWeb };