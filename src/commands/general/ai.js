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

async function sendFormattedAIResponse(target, query, isInteraction = false, langOrGuildId = 'EN', options = {}) {
    try {
        const response = await askAI(query, options);

        if (response.length <= 2000) {
            if (isInteraction) {
                return await target.editReply({ content: response });
            } else {
                return await target.edit({ content: response });
            }
        }

        // If the reply exceeds 2000 chars, split it smartly preserving code blocks
        const chunks = splitMessageSmart(response, 1950);
        if (isInteraction) {
            await target.editReply({ content: chunks[0] });
            for (let i = 1; i < chunks.length; i++) {
                await target.followUp({ content: chunks[i] }).catch(() => {});
            }
        } else {
            await target.edit({ content: chunks[0] });
            for (let i = 1; i < chunks.length; i++) {
                await target.channel.send({ content: chunks[i] }).catch(() => {});
            }
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

module.exports = {
    name: 'ai',
    description: 'التحدث مع الذكاء الاصطناعي البرمجي المتقدم (Droplet AI)',
    aliases: ['bot-ai', 'gpt', 'code', 'debug'],
    category: 'general',
    data: new SlashCommandBuilder()
        .setName('ai')
        .setDescription('Chat with Droplet Advanced AI (Coding Architect & General Assistant)')
        .addStringOption(option =>
            option.setName('prompt')
                .setDescription('The question, code, or instruction to send to the AI')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Specialized mode (Default: Auto-detect)')
                .setRequired(false)
                .addChoices(
                    { name: '🤖 Auto / كشف تلقائي ذكي', value: 'auto' },
                    { name: '💻 Code Generation / كتابة كود', value: 'code' },
                    { name: '🐞 Debug & Fix / فحص وإصلاح الأخطاء', value: 'debug' },
                    { name: '📖 Explain Code / شرح الكود والتعقيد', value: 'explain' },
                    { name: '⚡ Refactor & Optimize / تحسين الأداء والهيكلة', value: 'refactor' },
                    { name: '🏗️ System Architecture / هندسة ومعمارية الأنظمة', value: 'arch' },
                    { name: '💬 General Chat / محادثة عامة', value: 'chat' }
                )
        )
        .addStringOption(option =>
            option.setName('language')
                .setDescription('Programming language (e.g., JavaScript, Python, C++, SQL, Rust)')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('reset')
                .setDescription('Reset your conversation history before asking')
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
        if (message.author.id !== ownerId) {
            return; // Ignore non-owners
        }

        if (args[0] === 'reset' || args[0] === 'clear') {
            const { clearUserConversation } = require('../../utils/ai');
            clearUserConversation(message.author.id);
            return message.reply('🧹 تم مسح سجل المحادثة والبدء بجلسة برمجية جديدة.');
        }

        const query = args.join(' ');
        if (!query) {
            return message.reply(t(message.guild.id, 'general.ai.need_query'));
        }

        const waiting = await message.reply(t(message.guild.id, 'general.ai.processing'));
        await sendFormattedAIResponse(waiting, query, false, message.guild.id, {
            mode: 'auto',
            userId: message.author.id
        });
    }
};
