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

const ZENO_SYSTEM_INSTRUCTION = `
أنت المساعد الذكي الرسمي المدمج داخل بوت الديسكورد العربي "ZENO" (زينو).
صفتك: متحدث لبق، ذكي، سريع البديهة، مطلع على الإنترنت، وتتحدث باللغة العربية الفصحى الواضحة والودية مع لمسة احترافية وممتعة.
`;

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

    // تم التحديث إلى النموذج المدعوم بناءً على رسالة الخطأ الأخيرة
    const configuredModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

    try {
        const response = await ai.models.generateContent({
            model: configuredModel,
            contents: [
                {
                    role: 'user',
                    parts: [{ text: enrichedPrompt }]
                }
            ],
            config: {
                systemInstruction: ZENO_SYSTEM_INSTRUCTION,
                temperature: 0.7,
            }
        });

        const textResponse = response.text || (response.candidates?.[0]?.content?.parts?.[0]?.text);

        if (textResponse) {
            return textResponse;
        }

        return '❌ لم يأتِ رد من الذكاء الاصطناعي، حاول مرة أخرى.';

    } catch (error) {
        console.error(`[AI Critical Error Details]:`, error);

        const status = Number(error?.status || error?.code || 0);

        if (status === 429) {
            return '⏳ الذكاء الاصطناعي مشغول حالياً، يرجى الانتظار