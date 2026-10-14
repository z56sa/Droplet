const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { askAI } = require('../../utils/ai');
const config = require('../../config.json');
const { t } = require('../../utils/lang');

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
    const forbidden = ['require', 'process', 'global', 'import', 'child_process', 'fs', 'net', 'http'];
    if (forbidden.some(f => code.includes(f))) {
        return '⚠️ تشغيل الكود مقيد لحماية الأمان (تم اكتشاف دوال نظام).';
    }

    try {
        const logs = [];
        const customConsole = {
            log: (...args) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
            error: (...args) => logs.push('[Error] ' + args.join(' ')),
            warn: (...args) => logs.push('[Warn] ' + args.join(' '))
        };

        const vm = require('vm');
        const context = vm.createContext({ console: customConsole, Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, parseInt, parseFloat });
        const script = new vm.Script(code);
        const result = script.runInContext(context, { timeout: 1500 });

        let output = logs.join('\n');
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

module.exports = {
    name: 'ai',
    description: 'Droplet AI — مهندس برمجيات ذكي متخصص وعلى مستوى عالمي',
    aliases: ['bot-ai', 'gpt', 'code', 'debug', 'audit'],
    category: 'general',
    data: new SlashCommandBuilder()
        .setName('ai')
        .setDescription('Droplet AI — Staff Engineer Level: Code, Debug, Security, Architecture & More')
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
                    { name: '⚡ Refactor — تحسين الأداء والهيكلة', value: 'refactor' },
                    { name: '🛡️ Security — تدقيق أمني شامل OWASP', value: 'security' },
                    { name: '🧪 Test — توليد Unit Tests احترافية', value: 'test' },
                    { name: '🔍 Review — مراجعة PR كمهندس كبير', value: 'review' },
                    { name: '🏗️ Architecture — تصميم أنظمة وهندسة معمارية', value: 'arch' },
                    { name: '💬 Chat — محادثة عامة', value: 'chat' }
                )
        )
        .addStringOption(option =>
            option.setName('language')
                .setDescription('لغة البرمجة (مثال: JavaScript, Python, C++, Rust, SQL)')
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

        await sendFormattedAIResponse(interaction, prompt, true, interaction.guild.id, {
            mode,
            language,
            userId: interaction.user.id
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

        // تحليل الوضع والأعلام من الـ args
        const { mode, language, query } = parsePrefixArgs(args);

        if (!query) {
            const helpText = [
                '**🤖 Droplet AI — أوضاع الاستخدام:**',
                '`#ai <سؤال>` — وضع تلقائي',
                '`#ai --debug <الكود>` — تشخيص وإصلاح أخطاء',
                '`#ai --explain <الكود>` — شرح الكود',
                '`#ai --refactor <الكود>` — تحسين الكود',
                '`#ai --security <الكود>` — تدقيق أمني',
                '`#ai --test <الكود>` — توليد Unit Tests',
                '`#ai --review <الكود>` — مراجعة PR',
                '`#ai --arch <المتطلبات>` — تصميم معماري',
                '`#ai --lang python <السؤال>` — تحديد لغة',
                '`#ai reset` — مسح الجلسة',
                '`#ai stats` — إحصائيات الجلسة',
            ].join('\n');
            return message.reply(helpText);
        }

        const waiting = await message.reply(t(message.guild.id, 'general.ai.processing'));
        await sendFormattedAIResponse(waiting, query, false, message.guild.id, {
            mode,
            language,
            userId: message.author.id
        });
    }
};
