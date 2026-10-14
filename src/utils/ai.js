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

// ==========================================
// 🧠 DROPLET AI — APEX SYSTEM INSTRUCTION
// ==========================================
const Droplet_SYSTEM_INSTRUCTION = `
أنت "Droplet Core AI" — العقل المدبر والمساعد السري والشخصي الخاص بمالك ومطور بوت Droplet (دروبلت).
أنت غير متاح للعامة أو الأعضاء، بل أنت المستشار التقني والهندسي الخفي للمالك والمسؤول عن دعم وصيانة وتطوير البوت بأعلى كفاءة ممكنة.

هويتك الجوهرية:
- كبير مهندسي البرمجيات (Staff / Principal Engineer)
- المعماري التقني لبوت Droplet وخبير Discord.js / Node.js
- باحث أمني وخبير في الثغرات وهندسة النظم الموزعة
- شريك تقني خاص للمالك، تفهم كود البوت وهيكليته وتساعده في بناء وإصلاح وتطوير كل زاوية فيه.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔬 منهجية التفكير والحل (Reasoning Protocol):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
عند استقبال أي طلب أو كود أو مشكلة من المالك:
1. UNDERSTAND: ما المشكلة الحقيقية في الكود أو البوت؟
2. CONSTRAINTS: ما القيود؟ (أداء ديسكورد، Rate Limits، أمان التوكنات، الذاكرة)
3. DESIGN: ما التصميم الأفضل والأكثر استقراراً للبوت؟
4. IMPLEMENT: كتابة كود Production-Ready خالي من الأخطاء وجاهز للنسخ المباشر.
5. VERIFY: التأكد من معالجة كافة الـ Edge Cases واستثناءات الـ Crash.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛡️ معايير الكود والأمان:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- كود نظيف، آمن تماماً، خالي من أي ثغرات أو تسريبات للذاكرة (Memory Leaks).
- مراعاة معايير Discord.js v14، والمكونات الحديثة (Components V2)، وأحدث ممارسات Node.js.
- توضيح أسباب الأخطاء بدقة وتقديم الكود الكامل بعد الإصلاح.
- الرد بلغة عربية فصيحة ومباشرة ومحترمة تليق بمساعد مهني للمالك، مع إبقاء الكود والمصطلحات البرمجية بالإنجليزية القياسية.
`;

// ==========================================
// 🎯 CODING DETECTION ENGINE
// ==========================================
const CODING_INDICATORS = [
    // English keywords
    'code', 'function', 'class', 'error', 'debug', 'bug', 'fix', 'api', 'const', 'let', 'var',
    'sql', 'database', 'mongo', 'script', 'python', 'javascript', 'typescript', 'java', 'c++',
    'c#', 'rust', 'go', 'html', 'css', 'react', 'node', 'discord.js', 'json', 'regex',
    'async', 'await', 'promise', 'query', 'syntax', 'import', 'export', 'module', 'package',
    'array', 'object', 'string', 'integer', 'loop', 'recursion', 'algorithm', 'sort', 'search',
    'auth', 'token', 'jwt', 'oauth', 'encrypt', 'hash', 'bcrypt', 'docker', 'git', 'deploy',
    'endpoint', 'request', 'response', 'middleware', 'webhook', 'socket', 'rest', 'graphql',
    // Arabic keywords
    'برمجة', 'كود', 'دالة', 'خطأ', 'صلح', 'حل', 'سيرفر', 'قاعدة بيانات', 'تطبيق', 'موقع',
    'بايثون', 'جافاسكربت', 'خوارزمية', 'مشكلة', 'ديسكورد', 'مصادقة', 'تشفير', 'أمان', 'ثغرة',
    'نشر', 'خادم', 'متغير', 'حلقة', 'شرط', 'صنف', 'وراثة', 'واجهة', 'مكتبة', 'حزمة'
];

function isCodingQuery(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    return CODING_INDICATORS.some(ind => lower.includes(ind));
}

function needsDeepThinking(mode, text = '') {
    if (['arch', 'security', 'review', 'algo', 'optimize'].includes(mode)) return true;
    const deepIndicators = [
        'design a system', 'architect', 'scale', 'million users', 'distributed',
        'security audit', 'vulnerability', 'pen test', 'exploit', 'race condition',
        'memory leak', 'deadlock', 'concurrency', 'optimize algorithm', 'O(n',
        'هندسة نظام', 'ثغرة أمنية', 'تحسين خوارزمية', 'نظام موزع', 'أداء'
    ];
    return deepIndicators.some(d => text.toLowerCase().includes(d.toLowerCase()));
}

// ==========================================
// 🚀 SMART MODEL ROUTER
// ==========================================
const MODELS = [
    process.env.GEMINI_MODEL,
    process.env.GEMINI_FALLBACK_MODEL,
    'gemini-2.5-flash',
    'gemini-1.5-flash'
].filter(Boolean);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ==========================================
// ⚡ GENERATE WITH SMART RETRY
// ==========================================
async function generateWithSmartRetry(ai, contents, { isCoding = false } = {}) {
    const temperature = isCoding ? 0.15 : 0.72;
    let lastError;

    for (const model of MODELS) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const response = await ai.models.generateContent({
                    model,
                    contents,
                    config: {
                        systemInstruction: Droplet_SYSTEM_INSTRUCTION,
                        temperature
                    }
                });
                const text = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) return { text, model };
                throw new Error('EMPTY_RESPONSE');
            } catch (error) {
                lastError = error;
                const status = Number(error?.status || error?.code || 0);
                console.warn(`[AI] ${model} attempt ${attempt + 1} failed: ${status} ${error?.message?.slice(0, 100)}`);
                if (status === 400 || status === 404) break;
                if ([429, 500, 503].includes(status)) {
                    await sleep(1000 * Math.pow(2, attempt));
                    continue;
                }
                break;
            }
        }
    }
    throw lastError || new Error('All AI models failed after retries.');
}

// ==========================================
// 💾 CONVERSATION MEMORY ENGINE
// ==========================================
const userConversations = new Map();
const CONVERSATION_TIMEOUT = 15 * 60 * 1000; // 15 دقيقة خمول

function getConversationHistory(userId) {
    if (!userId) return [];
    const session = userConversations.get(userId);
    if (!session) return [];
    if (Date.now() - session.lastActive > CONVERSATION_TIMEOUT) {
        userConversations.delete(userId);
        return [];
    }
    return session.history;
}

function updateConversationHistory(userId, userText, botText) {
    if (!userId) return;
    let session = userConversations.get(userId);
    if (!session || Date.now() - session.lastActive > CONVERSATION_TIMEOUT) {
        session = { history: [], lastActive: Date.now(), messageCount: 0 };
    }
    session.history.push({ role: 'user', parts: [{ text: userText }] });
    session.history.push({ role: 'model', parts: [{ text: botText }] });
    session.messageCount = (session.messageCount || 0) + 1;
    // احتفظ بآخر 12 رسالة (6 تبادلات) مع ضغط القديمة
    if (session.history.length > 12) {
        session.history = session.history.slice(session.history.length - 12);
    }
    session.lastActive = Date.now();
    userConversations.set(userId, session);
}

function clearUserConversation(userId) {
    if (userId) userConversations.delete(userId);
}

function getSessionStats(userId) {
    if (!userId) return null;
    const session = userConversations.get(userId);
    if (!session) return null;
    const age = Math.round((Date.now() - session.lastActive) / 1000);
    return { messages: session.messageCount || 0, turns: Math.floor(session.history.length / 2), idleSeconds: age };
}

// ==========================================
// 🧬 ELITE MODE PROMPT ENGINEER
// ==========================================
const MODE_PROMPTS = {
    debug: (lang, text) => `
[🐞 DEBUGGING MODE — Root Cause Analysis]
Target Language: ${lang || 'Auto-detect'}

PROTOCOL:
1. 🔍 ROOT CAUSE: حدد السبب الجذري بدقة جراحية (ليس العرض، الجذر).
2. 💡 EXPLANATION: اشرح لماذا يحدث هذا الخطأ بالضبط.
3. 🔧 FIX: قدّم الكود المصحح كاملاً جاهز للنسخ والتشغيل.
4. ⚡ PREVENTION: كيف تتجنب هذا النوع من الأخطاء مستقبلاً؟

---
${text}`,

    explain: (lang, text) => `
[📖 CODE EXPLANATION MODE — Deep Analysis]
Target Language: ${lang || 'Auto-detect'}

PROTOCOL:
1. 🎯 PURPOSE: ماذا يفعل هذا الكود/المفهوم؟ (جملة واحدة مباشرة)
2. 🔬 DEEP DIVE: شرح الأجزاء المهمة سطراً بسطر أو خطوة بخطوة.
3. 📊 COMPLEXITY: Time Complexity و Space Complexity مع التحليل.
4. ✅ STRENGTHS: نقاط القوة.
5. ⚠️ WEAKNESSES: نقاط الضعف أو المخاطر المحتملة.
6. 🚀 BETTER APPROACH: هل يوجد نهج أفضل؟

---
${text}`,

    refactor: (lang, text) => `
[⚡ REFACTOR & OPTIMIZE MODE — Production Grade]
Target Language: ${lang || 'Auto-detect'}

PROTOCOL:
1. 🔎 ANALYSIS: ما مشاكل الكود الحالي؟ (Performance, Readability, Security, Maintainability)
2. 💎 REFACTORED CODE: الكود المُحسّن بالكامل، نظيف وجاهز للإنتاج.
3. 📈 IMPROVEMENTS TABLE: جدول بالتحسينات (قبل → بعد).
4. 🧪 EDGE CASES: edge cases تم معالجتها في النسخة الجديدة.

---
${text}`,

    arch: (lang, text) => `
[🏗️ SYSTEM ARCHITECTURE MODE — Staff Engineer Level]

PROTOCOL:
1. 🧩 ARCHITECTURE OVERVIEW: الهيكلية المقترحة مع شرح كل طبقة.
2. 🛠️ TECH STACK: اختيار التقنيات مع تبرير دقيق لكل اختيار.
3. 📁 FOLDER STRUCTURE: هيكل المشروع الكامل.
4. 🔗 KEY INTERFACES: أمثلة كود على واجهات الربط بين المكونات الرئيسية.
5. 📈 SCALABILITY: كيف يتمدد هذا النظام؟ (Horizontal/Vertical Scaling)
6. ⚠️ TRADE-OFFS: مقايضات التصميم والبدائل المرفوضة ولماذا.

---
${text}`,

    security: (lang, text) => `
[🛡️ SECURITY AUDIT MODE — Penetration Tester + Secure Code Reviewer]
Target Language: ${lang || 'Auto-detect'}

AUDIT PROTOCOL (OWASP-based):
1. 🔴 CRITICAL VULNERABILITIES: ثغرات خطيرة (SQL Injection, RCE, Authentication Bypass...).
2. 🟠 HIGH SEVERITY: مشاكل أمنية عالية الخطورة (IDOR, XSS, CSRF, Insecure Deserialization...).
3. 🟡 MEDIUM / LOW: مخاطر متوسطة (Info Disclosure, Rate Limit Missing, Weak Crypto...).
4. 🔧 SECURE FIX: الكود المُصحّح بطريقة آمنة لكل ثغرة.
5. 🏆 SECURITY SCORE: تقييم الأمان من 10 مع توصيات ختامية.

---
${text}`,

    test: (lang, text) => `
[🧪 UNIT TEST GENERATOR MODE — Test-Driven Excellence]
Target Language: ${lang || 'Auto-detect'}
Test Framework: ${lang?.toLowerCase().includes('python') ? 'pytest' : lang?.toLowerCase().includes('java') ? 'JUnit' : 'Jest / Vitest'}

PROTOCOL:
1. 🎯 TEST PLAN: ما الوحدات والحالات التي يجب اختبارها؟
2. ✅ HAPPY PATH TESTS: اختبارات المسار الصحيح الأساسية.
3. ❌ EDGE CASE TESTS: حالات الحافة والقيم الاستثنائية.
4. 💥 ERROR / EXCEPTION TESTS: اختبارات معالجة الأخطاء والاستثناءات.
5. 🔄 MOCK & STUB: استخدام mocks للـ dependencies الخارجية.
الكود المراد اختباره كاملاً جاهز للنسخ.

---
${text}`,

    review: (lang, text) => `
[🔍 CODE REVIEW MODE — Senior Engineer PR Review]
Target Language: ${lang || 'Auto-detect'}

REVIEW PROTOCOL:
1. 📋 SUMMARY: ملخص عام لما يفعله هذا الكود.
2. 🔴 BLOCKERS: مشاكل يجب حلها قبل الدمج (Bugs, Security, Breaking Changes).
3. 🟡 SUGGESTIONS: اقتراحات تحسين (Performance, Readability, Best Practices).
4. 🟢 PRAISE: نقاط قوة الكود (ما تم بشكل ممتاز).
5. ✏️ INLINE COMMENTS: تعليقات مفصلة على أسطر بعينها.
6. ✅ FINAL VERDICT: هل يُوافق على الدمج؟ ولماذا؟

---
${text}`,

    code: (lang, text) => `
[💻 CODE GENERATION MODE — Production Quality]
Target Language: ${lang || 'Auto-detect'}

OUTPUT REQUIREMENTS:
- كود كامل، نظيف، Production-Ready، مباشر للنسخ والاستخدام.
- Error handling شامل لكل edge case متوقع.
- تعليقات موجزة على الأجزاء غير البديهية.
- إذا احتاج لمكتبات خارجية، اذكرها مع أمر التثبيت.

---
${text}`,

    docs: (lang, text) => `
[📚 DOCUMENTATION GENERATOR MODE — Professional Docs]
Target Language: ${lang || 'Auto-detect'}

DOCUMENTATION PROTOCOL:
1. 📋 MODULE OVERVIEW: وصف الملف/الوحدة ووظيفتها الرئيسية.
2. 🔧 FUNCTION DOCS: لكل دالة/ميثود:
   - وصف شامل لما تفعله
   - @param — كل معامل مع نوعه وشرحه
   - @returns — نوع القيمة المُعادة وشرحها
   - @throws — الاستثناءات المحتملة
   - @example — مثال استخدام واقعي
3. 📖 README SECTION: مقطع README جاهز للنسخ يغطي الاستخدام الأساسي.
4. 🏷️ TYPE DEFINITIONS: تعريفات TypeScript/JSDoc للأنواع المستخدمة إن وجدت.

أنتج الـ Documentation بالصيغة المناسبة للغة (JSDoc لـ JS/TS، Docstrings لـ Python، JavaDoc لـ Java...).

---
${text}`,

    database: (lang, text) => `
[🗄️ DATABASE EXPERT MODE — Query Optimization & Schema Design]
Database Type: ${lang || 'Auto-detect (SQL/NoSQL/MongoDB/Redis)'}

DATABASE PROTOCOL:
1. 🔍 QUERY ANALYSIS: تحليل الـ Query الحالي — مشاكل الأداء، N+1 problems، Cartesian products.
2. ⚡ OPTIMIZED QUERY: الـ Query المحسّن مع شرح كل تحسين.
3. 📊 INDEXES: الـ Indexes المقترحة (أي columns، Composite vs Single، Partial Indexes).
4. 🏗️ SCHEMA IMPROVEMENTS: تحسينات هيكل الجداول/Collections (Normalization، Denormalization، Partitioning).
5. 📈 EXECUTION PLAN: كيف يُنفَّذ الـ Query ولماذا الإصدار الجديد أسرع (EXPLAIN ANALYZE).
6. 🔒 SECURITY: SQL Injection prevention، Parameterized Queries.
7. 💾 CACHING STRATEGY: متى تستخدم Redis/Memcached وكيف.

---
${text}`,

    algo: (lang, text) => `
[🧮 ALGORITHM & DATA STRUCTURES MODE — Computer Science Expert]
Target Language: ${lang || 'Auto-detect'}

ALGORITHM PROTOCOL:
1. 🎯 PROBLEM ANALYSIS: فهم المشكلة وتعريف المدخلات والمخرجات بدقة.
2. 🧠 APPROACH OPTIONS: عرض 2-3 نهج للحل مع مقارنة تعقيداتها.
3. 🏆 OPTIMAL SOLUTION: الحل الأمثل مع الكود الكامل.
4. 📊 COMPLEXITY ANALYSIS:
   - Time Complexity: الحالة الأفضل / المتوسطة / الأسوأ (Best/Avg/Worst)
   - Space Complexity: ذاكرة مؤقتة إضافية vs المدخلات
5. 🔬 DRY RUN: تتبع خطوة بخطوة على مثال واقعي.
6. 🧩 EDGE CASES: قائمة الحالات الحافة وكيف يتعاملها الكود.
7. 🚀 OPTIMIZATIONS: تحسينات إضافية (memoization، space optimization، bit manipulation إن أمكن).

---
${text}`,

    optimize: (lang, text) => `
[🚀 PERFORMANCE OPTIMIZATION MODE — Speed & Efficiency Expert]
Target Language: ${lang || 'Auto-detect'}

OPTIMIZATION PROTOCOL:
1. 🔎 BOTTLENECK DETECTION: تحديد نقاط الاختناق والأماكن الأبطأ في الكود.
2. 📊 BEFORE METRICS: تقدير أداء الكود الحالي (Big-O، Memory, I/O operations).
3. ⚡ OPTIMIZATIONS APPLIED:
   - Algorithmic improvements (خفض التعقيد)
   - Memory optimizations (تقليل التخصيص وإعادة الاستخدام)
   - I/O optimizations (Batching، Streaming، Caching)
   - Concurrency (Async/Parallel processing إن أمكن)
   - Language-specific optimizations
4. 💎 OPTIMIZED CODE: الكود المحسّن بالكامل.
5. 📈 AFTER METRICS: تقدير الأداء بعد التحسين والفرق المتوقع.
6. 🧪 PROFILING TIPS: كيف تقيس الأداء فعلياً (benchmark code مضمّن).

---
${text}`,

    auto: (lang, text) => text,
    chat: (lang, text) => text
};

// ==========================================
// 🔬 AUTO LANGUAGE DETECTOR
// ==========================================
const LANG_SIGNATURES = {
    javascript: [/\b(const|let|var|function|=>|require|module\.exports|async|await)\b/, /\.js$/i],
    typescript: [/\b(interface|type\s+\w+\s*=|:\s*(string|number|boolean|void|any)\b|<T>|as\s+\w+)\b/, /\.ts$/i],
    python: [/\b(def |import |from |elif |print\(|self\.|__init__|lambda |class \w+:)\b/, /\.py$/i],
    java: [/\b(public\s+class|System\.out\.println|@Override|import\s+java\.|void\s+main)\b/, /\.java$/i],
    cpp: [/#include\s*<|std::|cout\s*<<|cin\s*>>|\bnamespace\b|->|\bnew\b.*\bdelete\b/, /\.(cpp|cc|cxx|h|hpp)$/i],
    csharp: [/\b(using\s+System|Console\.Write|namespace\s+\w+|public\s+class|\.NET|async\s+Task)\b/, /\.cs$/i],
    rust: [/\b(fn\s+\w+|let\s+mut|impl\s+\w+|use\s+std::|println!|match\s+\w+|->|&str|Vec<)\b/, /\.rs$/i],
    go: [/\b(func\s+\w+|import\s+"|package\s+\w+|:=|fmt\.Print|goroutine|go\s+func)\b/, /\.go$/i],
    sql: [/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|CREATE\s+TABLE|ALTER|DROP|INDEX)\b/i, /\.(sql)$/i],
    mongodb: [/\b(db\.\w+\.(find|insert|update|aggregate|deleteOne)|mongoose\.|Schema\.|\.populate\()\b/],
    bash: [/^(#!\/bin\/(bash|sh)|echo\s+|export\s+\w+=|source\s+|\$\{\w+\}|\bgrep\b|\bsed\b)/m, /\.(sh|bash)$/i],
    html: [/<html|<head|<body|<div|<script|<!DOCTYPE/i, /\.html$/i],
    css: [/[{};]\s*\n|:\s*\w+;|@media|@keyframes|\.[\w-]+\s*{/, /\.(css|scss|sass|less)$/i],
};

/**
 * يكتشف لغة البرمجة تلقائياً من الكود
 * @param {string} text - نص قد يحتوي كود
 * @param {string|null} filename - اسم الملف إن وجد
 * @returns {string|null}
 */
function detectLanguage(text, filename = null) {
    if (!text) return null;
    const combined = (filename || '') + '\n' + text;
    let bestMatch = null;
    let bestScore = 0;

    for (const [lang, patterns] of Object.entries(LANG_SIGNATURES)) {
        let score = 0;
        for (const pattern of patterns) {
            const matches = combined.match(pattern);
            if (matches) score += matches.length;
        }
        if (score > bestScore) {
            bestScore = score;
            bestMatch = lang;
        }
    }
    return bestScore >= 2 ? bestMatch : null;
}

// ==========================================
// 📊 CODE METRICS ANALYZER (Pre-AI Analysis)
// ==========================================
/**
 * يحلل مقاييس الكود قبل إرساله للـ AI لإثراء الـ prompt بسياق تقني دقيق
 */
function analyzeCodeMetrics(code) {
    if (!code || typeof code !== 'string') return null;

    const lines = code.split('\n');
    const totalLines = lines.length;
    const blankLines = lines.filter(l => l.trim() === '').length;
    const codeLines = totalLines - blankLines;

    // قياس عمق التداخل (نعمق الـ Nesting)
    let maxNesting = 0;
    let currentNesting = 0;
    for (const ch of code) {
        if (ch === '{' || ch === '(') {
            currentNesting++;
            if (currentNesting > maxNesting) maxNesting = currentNesting;
        } else if (ch === '}' || ch === ')') {
            currentNesting = Math.max(0, currentNesting - 1);
        }
    }

    // عد الدوال
    const functionCount = (code.match(/\bfunction\b|\b=>\s*{|\bdef\s+\w+|\bfn\s+\w+/g) || []).length;
    // عد التعليقات
    const commentLines = lines.filter(l => l.trim().startsWith('//') || l.trim().startsWith('#') || l.trim().startsWith('*')).length;
    // اكتشاف async operations
    const asyncCount = (code.match(/\basync\b|\bawait\b|\.then\(|\.catch\(/g) || []).length;

    return { totalLines, codeLines, blankLines, maxNesting, functionCount, commentLines, asyncCount };
}

// ==========================================
// 🤖 MAIN ASK AI FUNCTION
// ==========================================
async function askAI(promptText, options = {}) {
    if (!promptText || typeof promptText !== 'string' || !promptText.trim()) {
        return '❌ يرجى كتابة سؤال صالح.';
    }

    const {
        mode = 'auto',
        userId = null,
        language = null,
        fileContent = null,    // محتوى الملف المرفق
        fileName = null,       // اسم الملف المرفق
        preAnalysis = true,    // تفعيل التحليل المسبق للكود
    } = options;

    const ai = getClient();
    if (!ai) {
        return '❌ لم يتم ضبط مفتاح `GEMINI_API_KEY` في متغيرات البيئة.';
    }

    // ── كشف اللغة التلقائي ──
    const codeToAnalyze = fileContent || promptText;
    const detectedLang = language || detectLanguage(codeToAnalyze, fileName);

    // ── تحليل مقاييس الكود (إذا كان الوضع تقنياً) ──
    let metricsContext = '';
    if (preAnalysis && mode !== 'chat' && mode !== 'auto') {
        const metrics = analyzeCodeMetrics(codeToAnalyze);
        if (metrics && metrics.totalLines > 5) {
            metricsContext = `\n[📊 Code Metrics Pre-Analysis]\n` +
                `- Lines: ${metrics.codeLines} code / ${metrics.totalLines} total\n` +
                `- Max Nesting Depth: ${metrics.maxNesting} levels ${metrics.maxNesting > 4 ? '⚠️ (عميق جداً)' : ''}\n` +
                `- Functions Detected: ${metrics.functionCount}\n` +
                `- Comment Lines: ${metrics.commentLines} (${Math.round(metrics.commentLines / metrics.totalLines * 100)}%)\n` +
                `- Async Operations: ${metrics.asyncCount}\n`;
        }
    }

    // ── بناء الـ Prompt المتخصص ──
    const promptBuilder = MODE_PROMPTS[mode] || MODE_PROMPTS.auto;
    let coreContent = promptText.trim();

    // إذا كان هناك ملف مرفق، أدمجه في الـ prompt
    if (fileContent) {
        coreContent = `${promptText.trim()}\n\n[📎 الملف المرفق: ${fileName || 'code_file'}]\n\`\`\`${detectedLang || ''}\n${fileContent.slice(0, 8000)}\n\`\`\``;
    }

    let enrichedPrompt = promptBuilder(detectedLang, coreContent);
    if (metricsContext) enrichedPrompt = metricsContext + '\n' + enrichedPrompt;

    const isCoding = mode !== 'chat' && (mode !== 'auto' || isCodingQuery(promptText));
    const useThinking = needsDeepThinking(mode, promptText);

    // البحث الحي على الإنترنت (للوضع التلقائي فقط)
    if (needsLiveBrowsing(promptText) && mode === 'auto' && !fileContent) {
        try {
            const webResults = await searchWeb(promptText.trim());
            if (webResults && webResults.length > 20) {
                enrichedPrompt = `[🌐 نتائج البحث الحي]\n${webResults}\n\n[سؤال المستخدم]: ${enrichedPrompt}`;
            }
        } catch (err) {
            console.warn('[Web Search Error]:', err?.message);
        }
    }

    // بناء محتوى المحادثة مع السياق السابق
    const history = getConversationHistory(userId);
    const contents = [...history, { role: 'user', parts: [{ text: enrichedPrompt }] }];

    try {
        const { text, model } = await generateWithSmartRetry(ai, contents, { isCoding });
        if (userId) {
            updateConversationHistory(userId, promptText.trim(), text);
        }
        return text;
    } catch (error) {
        console.error('[AI Critical Error]:', error?.message);
        const status = Number(error?.status || error?.code || 0);
        if (status === 429) return '⏳ تجاوزنا حد الطلبات، حاول بعد قليل.';
        if (status === 503) return '⏳ خوادم Gemini مشغولة الآن، حاول بعد دقيقة.';
        if (status === 400 || status === 404) return '❌ إعدادات النموذج أو المفتاح غير صحيحة، تواصل مع الإدارة.';
        return '❌ عذراً، حدث خطأ أثناء معالجة طلبك. يرجى المحاولة لاحقاً.';
    }
}

module.exports = {
    askAI,
    Droplet_SYSTEM_INSTRUCTION,
    searchWeb,
    isCodingQuery,
    needsDeepThinking,
    detectLanguage,
    analyzeCodeMetrics,
    clearUserConversation,
    getSessionStats
};