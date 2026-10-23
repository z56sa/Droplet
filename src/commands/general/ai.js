const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { askAI, detectLanguage } = require('../../utils/ai');
const https = require('https');
const config = require('../../config.json');
const { t } = require('../../utils/lang');

// ==========================================
// 📎 FILE ATTACHMENT READER
// ==========================================
// الامتدادات المدعومة للقراءة
const SUPPORTED_EXTENSIONS = new Set([
    'js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs',
    'py', 'pyw',
    'java', 'kt',
    'cpp', 'cc', 'cxx', 'c', 'h', 'hpp',
    'cs',
    'rs',
    'go',
    'rb',
    'php',
    'swift',
    'sql', 'psql',
    'sh', 'bash', 'zsh',
    'json', 'yaml', 'yml', 'toml',
    'html', 'htm', 'css', 'scss', 'sass',
    'xml', 'graphql', 'gql',
    'md', 'txt', 'log'
]);

const MAX_FILE_SIZE = 150_000; // 150KB max

/**
 * يقرأ محتوى ملف مرفق من Discord
 * @param {import('discord.js').Attachment} attachment
 * @returns {Promise<{content: string, name: string, ext: string}|null>}
 */
function readAttachment(attachment) {
    return new Promise((resolve) => {
        try {
            const name = attachment.name || 'file';
            const ext = name.split('.').pop()?.toLowerCase() || '';

            if (!SUPPORTED_EXTENSIONS.has(ext)) {
                return resolve(null);
            }
            if (attachment.size > MAX_FILE_SIZE) {
                return resolve({ content: null, name, ext, tooLarge: true });
            }

            const url = new URL(attachment.url);
            const lib = url.protocol === 'https:' ? https : require('http');

            lib.get(attachment.url, (res) => {
                let data = '';
                res.on('data', chunk => { if (data.length < MAX_FILE_SIZE) data += chunk; });
                res.on('end', () => resolve({ content: data, name, ext }));
                res.on('error', () => resolve(null));
            }).on('error', () => resolve(null));
        } catch {
            resolve(null);
        }
    });
}

/**
 * تقسيم الردود الطويلة بذكاء مع الحفاظ على كتل الأكواد (Code Blocks) دون تشويه
 */
function splitMessageSmart(text, maxLength = 1950) {
    if (text.length <= maxLength) return [text];

    const chunks = [];
    let currentChunk = '';
    let inCodeBlock = false;
    let codeLanguage = '';

    const lines = text.split('\n');

    for (const line of lines) {
        // فحص بداية أو نهاية كتلة كود
        const codeBlockMatch = line.match(/^```(\w+)?/);
        
        // التحقق من تجاوز الحجم
        if ((currentChunk + '\n' + line).length > maxLength) {
            if (inCodeBlock) {
                // إغلاق كتلة الكود الحالية في الجزء الحالي
                currentChunk += '\n```';
                chunks.push(currentChunk);
                // فتح كتلة كود جديدة بنفس اللغة في الجزء التالي
                currentChunk = '```' + codeLanguage + '\n' + line;
            } else {
                chunks.push(currentChunk);
                currentChunk = line;
            }
        } else {
            currentChunk = currentChunk ? (currentChunk + '\n' + line) : line;
        }

        if (codeBlockMatch) {
            if (!inCodeBlock) {
                inCodeBlock = true;
                codeLanguage = codeBlockMatch[1] || '';
            } else {
                inCodeBlock = false;
                codeLanguage = '';
            }
        }
    }

    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk);
    }

    return chunks.length > 0 ? chunks : [text];
}

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');

/**
 * محاكي تشغيل الكود السريع للغات المدعومة (JavaScript Sandbox / Eval Safe Sandbox)
 */
function tryRunCodeSnippet(codeText) {
    // استخراج أول كود جافاسكريبت داخل الكود بلوك
    const jsMatch = codeText.match(/```(?:javascript|js)\s*([\s\S]*?)```/i);
    if (!jsMatch || !jsMatch[1]) return null;

    const code = jsMatch[1].trim();
    // حماية أمنية لمنع الوصول لنظام الملفات أو الشبكة داخل الـ sandbox
    const forbidden = ['require', 'process', 'global', 'import', 'child_process', 'fs', 'net', 'http',
        // vm ليست حماية أمنية حسب توثيق Node — سلسلة الاختراق الكلاسيكية:
        // JSON.parse.constructor('return process')() — كل كائن مُمرَّر من الـ host يكشف Function الأصلي.
        // نمنع 'constructor' لتقطيع السلسلة، ونمنع أدوات بناء النصوص التي تهرب من فحص السلاسل الحرفي:
        'constructor', 'prototype', '__proto__', 'Function', 'eval',
        'fromCharCode', 'fromCodePoint', 'unescape', 'atob', 'Proxy', 'Buffer'];
    if (forbidden.some(f => code.includes(f))) {
        return '⚠️ تشغيل الكود مقيد لحماية الأمان (تم اكتشاف دوال نظام).';
    }

    try {
        // 🔒 سياق خالص: لا نمرر أي كائن/dالة من الـ host — كل الجواهر (Math/JSON/Date...) تأتي من عالم الـ context نفسه.
        // أي مرجع host (حتى console) يكشف Function الأصلي عبر constructor.constructor = RCE كامل خارج الـ sandbox.
        // + (سد M13) سقف ذاكرة للسياق — كود شاطر قد يبلع/OOM العملية كلها (بوت + داشبورد) خلال مهلة الـ timeout اللي تقبل CPU حداً
        const vm = require('vm');
        const context = vm.createContext({}, {
            resourceLimits: {
                maxYoungGenerationSizeMb: 16,
                maxOldGenerationSizeMb: 64,
                codeRangeSizeMb: 16,
                stackSizeMb: 4
            }
        });
        vm.runInContext(`this.__out = []; this.console = { log: (...a) => this.__out.push(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')), error: (...a) => this.__out.push('[Error] ' + a.join(' ')), warn: (...a) => this.__out.push('[Warn] ' + a.join(' ')) };`, context, { timeout: 500 });

        const script = new vm.Script(code);
        const result = script.runInContext(context, { timeout: 1500 });

        // قراءة المخرجات: Array.from داخل السياق تُرجع مصفوفة نصوص آمنة (لا مراجع host)
        const _out = vm.runInContext('Array.from(this.__out || [])', context, { timeout: 500 });
        let output = Array.isArray(_out) ? _out.join('\n') : '';
        if (result !== undefined) {
            output += (output ? '\n' : '') + `=> ${typeof result === 'object' ? JSON.stringify(result) : result}`;
        }
        return output.trim() || '✅ تم التنفيذ بنجاح (لا يوجد مخرجات console.log).';
    } catch (err) {
        return `❌ خطأ أثناء التشغيل:\n${err.message}`;
    }
}

// Mode emoji map for the response header
const MODE_EMOJI = {
    auto: '🤖', code: '💻', debug: '🐞', explain: '📖',
    refactor: '⚡', security: '🛡️', test: '🧪', review: '🔍',
    arch: '🏗️', chat: '💬'
};

async function sendFormattedAIResponse(target, query, isInteraction = false, langOrGuildId = 'EN', options = {}) {
    try {
        const response = await askAI(query, options);
        const { mode = 'auto', userId } = options;
        const isJsCode = /```(?:javascript|js)/i.test(response);

        // ── صف أزرار الرد (Interactive Button Row) ──
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ai_clear_${userId || 'anon'}`)
                .setLabel('🧹 مسح الجلسة')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`ai_stats_${userId || 'anon'}`)
                .setLabel('📊 إحصائيات')
                .setStyle(ButtonStyle.Secondary)
        );

        // زر تشغيل Sandbox — يظهر فقط إذا كان الرد يحتوي كود JS
        if (isJsCode) {
            row1.addComponents(
                new ButtonBuilder()
                    .setCustomId(`ai_run_${Date.now()}`)
                    .setLabel('▶️ تشغيل Sandbox')
                    .setStyle(ButtonStyle.Success)
            );
        }

        const components = [row1];

        if (response.length <= 2000) {
            let msg;
            if (isInteraction) {
                msg = await target.editReply({ content: response, components });
            } else {
                msg = await target.edit({ content: response, components });
            }
            setupButtonCollector(msg, target, response, userId);
            return;
        }

        // إذا تجاوزت الإجابة 2000 حرف — تقسيم ذكي مع الأزرار على الجزء الأخير
        const chunks = splitMessageSmart(response, 1950);
        if (isInteraction) {
            await target.editReply({ content: chunks[0] });
            for (let i = 1; i < chunks.length - 1; i++) {
                await target.followUp({ content: chunks[i] }).catch(() => {});
            }
            const lastMsg = await target.followUp({ content: chunks[chunks.length - 1], components });
            setupButtonCollector(lastMsg, target, response, userId);
        } else {
            await target.edit({ content: chunks[0] });
            for (let i = 1; i < chunks.length - 1; i++) {
                await target.channel.send({ content: chunks[i] }).catch(() => {});
            }
            const lastMsg = await target.channel.send({ content: chunks[chunks.length - 1], components });
            setupButtonCollector(lastMsg, target, response, userId);
        }
    } catch (error) {
        console.error('[AI Command Error]:', error);
        const errMsg = t(langOrGuildId, 'general.ai.error');
        if (isInteraction) {
            await target.editReply({ content: errMsg }).catch(() => {});
        } else {
            await target.edit({ content: errMsg }).catch(() => {});
        }
    }
}

function setupButtonCollector(msg, target, fullResponse, userId) {
    if (!msg || !msg.createMessageComponentCollector) return;

    const collector = msg.createMessageComponentCollector({ time: 180000 }); // 3 دقائق

    collector.on('collect', async (btnInteraction) => {
        if (userId && btnInteraction.user.id !== userId) {
            return btnInteraction.reply({ content: '❌ هذه الأزرار مخصصة لصاحب الطلب فقط.', flags: 64 });
        }

        if (btnInteraction.customId.startsWith('ai_clear_')) {
            const { clearUserConversation } = require('../../utils/ai');
            clearUserConversation(userId);
            return btnInteraction.reply({ content: '🧹 تم مسح جلسة المحادثة البرمجية بالكامل. ابدأ جلسة جديدة متى شئت.', flags: 64 });
        }

        if (btnInteraction.customId.startsWith('ai_stats_')) {
            const { getSessionStats } = require('../../utils/ai');
            const stats = getSessionStats(userId);
            if (!stats) return btnInteraction.reply({ content: '📭 لا توجد جلسة نشطة حالياً.', flags: 64 });
            const idleMin = Math.floor(stats.idleSeconds / 60);
            const idleSec = stats.idleSeconds % 60;
            return btnInteraction.reply({
                content: `📊 **إحصائيات الجلسة الحالية:**\n> 💬 رسائل المستخدم: **${stats.messages}**\n> 🔄 تبادلات في السياق: **${stats.turns}**\n> ⏱️ آخر نشاط: منذ **${idleMin}د ${idleSec}ث**`,
                flags: 64
            });
        }

        if (btnInteraction.customId.startsWith('ai_run_')) {
            await btnInteraction.deferReply({ flags: 64 });
            const executionResult = tryRunCodeSnippet(fullResponse);
            if (!executionResult) {
                return btnInteraction.editReply({ content: '⚠️ لم يتم العثور على كود JavaScript قابل للتشغيل في هذا الرد.' });
            }
            const formattedOutput = `💻 **نتائج تشغيل الكود — Sandbox:**\n\`\`\`javascript\n${executionResult.slice(0, 1850)}\n\`\`\``;
            return btnInteraction.editReply({ content: formattedOutput });
        }
    });

    collector.on('end', () => {
        msg.edit({ components: [] }).catch(() => {});
    });
}

// ==========================================
// 📟 PREFIX MODE PARSER
// ==========================================
const PREFIX_MODES = {
    '--debug': 'debug', '-d': 'debug',
    '--explain': 'explain', '-e': 'explain',
    '--refactor': 'refactor', '-r': 'refactor',
    '--arch': 'arch', '-a': 'arch',
    '--security': 'security', '-s': 'security',
    '--test': 'test', '-t': 'test',
    '--review': 'review', '--pr': 'review',
    '--code': 'code', '-c': 'code',
    '--docs': 'docs', '--doc': 'docs',
    '--database': 'database', '--db': 'database', '--sql': 'database',
    '--algo': 'algo', '--algorithm': 'algo', '--dsa': 'algo',
    '--optimize': 'optimize', '--perf': 'optimize', '-o': 'optimize',
    '--chat': 'chat',
};

function parsePrefixArgs(args) {
    let mode = 'auto';
    let language = null;
    const cleanArgs = [];

    for (let i = 0; i < args.length; i++) {
        const arg = args[i].toLowerCase();
        if (PREFIX_MODES[arg]) {
            mode = PREFIX_MODES[arg];
        } else if (arg === '--lang' || arg === '-l') {
            language = args[++i] || null;
        } else {
            cleanArgs.push(args[i]);
        }
    }
    return { mode, language, query: cleanArgs.join(' ') };
}

const HELP_TEXT = [
    '**🤖 Droplet AI — أوضاع الاستخدام الكاملة:**',
    '',
    '**📝 الأساسية:**',
    '`#ai <سؤال>` — كشف تلقائي ذكي',
    '`#ai --code <طلب>` — توليد كود احترافي',
    '`#ai --chat <رسالة>` — محادثة عامة',
    '',
    '**🔧 تحليل الكود:**',
    '`#ai --debug <الكود أو الخطأ>` — تشخيص وإصلاح الأخطاء',
    '`#ai --explain <الكود>` — شرح عميق + تحليل التعقيد',
    '`#ai --refactor <الكود>` — تحسين الكود وإعادة هيكلته',
    '`#ai --optimize <الكود>` — تحسين الأداء والسرعة',
    '`#ai --review <الكود>` — مراجعة PR كمهندس كبير',
    '',
    '**🏗️ التصميم والهندسة:**',
    '`#ai --arch <المتطلبات>` — هندسة الأنظمة والمعمارية',
    '`#ai --database <الـ Query>` — تحسين قواعد البيانات + Schema',
    '`#ai --algo <المشكلة>` — خوارزميات وهياكل البيانات',
    '',
    '**📚 التوثيق والاختبار:**',
    '`#ai --docs <الكود>` — توليد Documentation/JSDoc/Docstrings',
    '`#ai --test <الكود>` — توليد Unit Tests احترافية',
    '`#ai --security <الكود>` — تدقيق أمني شامل (OWASP)',
    '',
    '**⚙️ خيارات إضافية:**',
    '`#ai --lang python <السؤال>` — تحديد لغة البرمجة',
    '`#ai reset` — مسح الجلسة',
    '`#ai stats` — إحصائيات الجلسة',
    '',
    '**📎 إرفاق ملف:** أرفق أي ملف كود مع الأمر وسيقرأه الـ AI تلقائياً!',
].join('\n');

module.exports = {
    name: 'ai',
    description: 'Droplet AI — مساعد برمجي سري وخاص للمالك',
    aliases: ['bot-ai', 'gpt', 'code', 'debug', 'audit'],
    category: 'general',
    ownerOnly: true,
    hidden: true, // مخفي عن الأعضاء العاديين
    data: new SlashCommandBuilder()
        .setName('ai')
        .setDescription('Droplet AI — Private Owner Assistant (Hidden)')
        .setDefaultMemberPermissions(0) // 0 = مخفي ولا يمكن لأي عضو أو أدمن عادي رؤيته إلا صاحب البوت
        .addStringOption(option =>
            option.setName('prompt')
                .setDescription('السؤال، الكود، أو التعليمة التي تريد إرسالها')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('وضع متخصص (الافتراضي: كشف تلقائي ذكي)')
                .setRequired(false)
                .addChoices(
                    { name: '🤖 Auto — كشف تلقائي ذكي', value: 'auto' },
                    { name: '💻 Code — توليد كود احترافي', value: 'code' },
                    { name: '🐞 Debug — تشخيص وإصلاح الأخطاء', value: 'debug' },
                    { name: '📖 Explain — شرح عميق وتحليل التعقيد', value: 'explain' },
                    { name: '⚡ Refactor — تحسين الكود وإعادة الهيكلة', value: 'refactor' },
                    { name: '🚀 Optimize — تحسين الأداء والسرعة', value: 'optimize' },
                    { name: '🛡️ Security — تدقيق أمني شامل OWASP', value: 'security' },
                    { name: '🧪 Test — توليد Unit Tests احترافية', value: 'test' },
                    { name: '🔍 Review — مراجعة PR كمهندس كبير', value: 'review' },
                    { name: '🏗️ Architecture — تصميم أنظمة وهندسة معمارية', value: 'arch' },
                    { name: '📚 Docs — توليد Documentation شاملة', value: 'docs' },
                    { name: '🗄️ Database — تحسين Queries وتصميم Schema', value: 'database' },
                    { name: '🧮 Algorithm — خوارزميات وهياكل البيانات', value: 'algo' },
                    { name: '💬 Chat — محادثة عامة', value: 'chat' }
                )
        )
        .addStringOption(option =>
            option.setName('language')
                .setDescription('لغة البرمجة — إذا فارغ يكتشف تلقائياً (مثال: JavaScript, Python, Rust, SQL)')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option.setName('file')
                .setDescription('📎 ارفق ملف كود ليقرأه ويحلله الـ AI (js, py, ts, sql, json...)')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('reset')
                .setDescription('مسح سجل المحادثة والبدء بجلسة جديدة')
                .setRequired(false)
        ),

    async execute(interaction) {
        const ownerId = process.env.OWNER_ID || config.ownerId || '1178342841882267744';
        if (interaction.user.id !== ownerId) {
            return interaction.reply({ content: t(interaction.guild.id, 'general.ai.owner_only'), flags: 64 });
        }

        const reset = interaction.options.getBoolean('reset');
        if (reset) {
            const { clearUserConversation } = require('../../utils/ai');
            clearUserConversation(interaction.user.id);
        }

        await interaction.deferReply();

        const prompt = interaction.options.getString('prompt');
        const mode = interaction.options.getString('mode') || 'auto';
        const language = interaction.options.getString('language') || null;
        const attachment = interaction.options.getAttachment('file');

        // قراءة الملف المرفق إن وجد
        let fileContent = null;
        let fileName = null;
        if (attachment) {
            const fileData = await readAttachment(attachment);
            if (fileData?.tooLarge) {
                return interaction.editReply({ content: `⚠️ الملف \`${fileData.name}\` كبير جداً (الحد الأقصى 150KB).` });
            }
            if (fileData?.content) {
                fileContent = fileData.content;
                fileName = fileData.name;
            } else if (fileData === null) {
                return interaction.editReply({ content: `⚠️ نوع الملف غير مدعوم. الأنواع المدعومة: JS, TS, PY, SQL, JSON, GO, RS, C++...` });
            }
        }

        await sendFormattedAIResponse(interaction, prompt, true, interaction.guild.id, {
            mode,
            language,
            userId: interaction.user.id,
            fileContent,
            fileName
        });
    },

    async executePrefix(message, args) {
        const ownerId = process.env.OWNER_ID || config.ownerId || '1178342841882267744';
        if (message.author.id !== ownerId) return;

        // أوامر الإدارة
        if (args[0] === 'reset' || args[0] === 'clear') {
            const { clearUserConversation } = require('../../utils/ai');
            clearUserConversation(message.author.id);
            return message.reply('🧹 تم مسح جلسة المحادثة. ابدأ من جديد.');
        }

        if (args[0] === 'stats') {
            const { getSessionStats } = require('../../utils/ai');
            const stats = getSessionStats(message.author.id);
            if (!stats) return message.reply('📭 لا توجد جلسة نشطة حالياً.');
            return message.reply(`📊 الجلسة: **${stats.messages}** رسائل | **${stats.turns}** تبادلات في السياق`);
        }

        if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h' || !args.length) {
            return message.reply(HELP_TEXT);
        }

        // تحليل الأعلام من الـ args
        const { mode, language, query } = parsePrefixArgs(args);

        // قراءة الملف المرفق إن وجد
        let fileContent = null;
        let fileName = null;
        if (message.attachments.size > 0) {
            const att = message.attachments.first();
            const fileData = await readAttachment(att);
            if (fileData?.tooLarge) {
                return message.reply(`⚠️ الملف \`${fileData.name}\` كبير جداً (الحد الأقصى 150KB).`);
            }
            if (fileData?.content) {
                fileContent = fileData.content;
                fileName = fileData.name;
            }
        }

        if (!query && !fileContent) {
            return message.reply(HELP_TEXT);
        }

        const finalQuery = query || `حلل هذا الملف: ${fileName}`;
        const waiting = await message.reply(t(message.guild.id, 'general.ai.processing'));
        await sendFormattedAIResponse(waiting, finalQuery, false, message.guild.id, {
            mode,
            language,
            userId: message.author.id,
            fileContent,
            fileName
        });
    }
};

