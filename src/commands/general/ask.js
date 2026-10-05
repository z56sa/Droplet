const { SlashCommandBuilder } = require('discord.js');
const { askAI } = require('../../utils/ai');

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
        console.error('[Ask Command Error]:', error);
        const errMsg = '❌ عذراً، حدث خطأ أثناء محاولة الاتصال بالذكاء الاصطناعي.';
        if (isInteraction) {
            await target.editReply({ content: errMsg }).catch(() => {});
        } else {
            await target.edit({ content: errMsg }).catch(() => {});
        }
    }
}

module.exports = {
    name: 'ask',
    description: 'اسأل ذكاء ZENO الاصطناعي أي سؤال!',
    aliases: ['اسال', 'سؤال'],
    category: 'general',
    data: new SlashCommandBuilder()
        .setName('ask')
        .setDescription('اسأل ذكاء ZENO الاصطناعي أي سؤال!')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('السؤال الذي تريد طرحه على البوت')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();
        const question = interaction.options.getString('question');
        await sendFormattedAIResponse(interaction, question, true);
    },

    async executePrefix(message, args) {
        const question = args.join(' ');
        if (!question) {
            return message.reply('❌ يرجى كتابة السؤال بعد الأمر، مثال: `#ask كيف يعمل الذكاء الاصطناعي؟`');
        }

        const waiting = await message.reply('⏳ جاري التفكير ومعالجة الطلب...');
        await sendFormattedAIResponse(waiting, question, false);
    }
};
