const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { askAI } = require('../../utils/ai');
const config = require('../../config.json');

async function sendFormattedAIResponse(target, query, isInteraction = false) {
    try {
        const response = await askAI(query);

        if (response.length <= 2000) {
            if (isInteraction) {
                return await target.editReply({ content: response });
            } else {
                return await target.edit({ content: response });
            }
        }

        // إذا كان الرد طويلاً يتجاوز 2000 حرف
        const chunks = response.match(/[\s\S]{1,1950}/g) || [response];
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
        const errMsg = '❌ حدث خطأ غير متوقع أثناء معالجة رد الذكاء الاصطناعي.';
        if (isInteraction) {
            await target.editReply({ content: errMsg }).catch(() => {});
        } else {
            await target.edit({ content: errMsg }).catch(() => {});
        }
    }
}

module.exports = {
    name: 'ai',
    description: 'التحدث مع الذكاء الاصطناعي (ZENO AI)',
    aliases: ['bot-ai', 'gpt'],
    category: 'general',
    data: new SlashCommandBuilder()
        .setName('ai')
        .setDescription('التحدث مع الذكاء الاصطناعي (ZENO AI)')
        .addStringOption(option =>
            option.setName('prompt')
                .setDescription('السؤال أو النص الذي تريد إرساله للذكاء الاصطناعي')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();
        const prompt = interaction.options.getString('prompt');
        await sendFormattedAIResponse(interaction, prompt, true);
    },

    async executePrefix(message, args) {
        const query = args.join(' ');
        if (!query) {
            return message.reply('❌ يرجى كتابة السؤال أو النص بعد الأمر، مثال: `#ai ما هي عاصمة فرنسا؟`');
        }

        const waiting = await message.reply('⏳ جاري التفكير ومعالجة الطلب...');
        await sendFormattedAIResponse(waiting, query, false);
    }
};
