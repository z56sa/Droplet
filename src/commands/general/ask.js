const { GoogleGenAI } = require('@google/genai');
const { SlashCommandBuilder } = require('discord.js');
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
                    contents: prompt,
                    config: { systemInstruction: ZENO_SYSTEM_INSTRUCTION }
                });
                const text = response && response.text;
                if (text && text.trim()) return text.trim();
                throw new Error('Empty response');
            } catch (err) {
                lastError = err;
                const status = err && (err.status || err.code);
                // أخطاء مؤقتة (ضغط/تحميل زائد): أعد المحاولة بتأخير متزايد
                if ([429, 500, 503].includes(Number(status))) {
                    await sleep(1000 * (attempt + 1));
                    continue;
                }
                // خطأ دائم لهذا النموذج (مثل اسم غير صحيح): انتقل للنموذج التالي
                break;
            }
        }
    }
    throw lastError || new Error('All models failed');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ask')
        .setDescription('اسأل زينو أي سؤال')
        .addStringOption(opt =>
            opt.setName('question')
                .setDescription('سؤالك')
                .setRequired(true)),

    async execute(interaction) {
        const question = interaction.options.getString('question');
        const ai = getClient();
        if (!ai) {
            return interaction.reply({ content: '❌ مفتاح Gemini غير مضبوط في ملف .env', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            let prompt = question;
            if (needsLiveBrowsing(question)) {
                const results = await searchWeb(question);
                if (results) {
                    prompt = `معلومات حديثة من الإنترنت:\n- ${results}\n\nاستعن بها للإجابة على السؤال التالي:\n${question}`;
                }
            }

            const answer = await generateWithRetry(ai, prompt);
            // حد رسالة ديسكورد 2000 حرف
            await interaction.editReply(answer.length > 2000 ? answer.slice(0, 1997) + '...' : answer);
        } catch (err) {
            console.error('[ask] error:', err);
            await interaction.editReply('⚠️ تعذّر الحصول على إجابة الآن، حاول مرة أخرى بعد قليل.');
        }
    },

    // للاستخدام من ملفات أخرى (مثل ai.js)
    searchWeb,
    needsLiveBrowsing,
    generateWithRetry,
    getClient
};