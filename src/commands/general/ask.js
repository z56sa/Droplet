const { SlashCommandBuilder } = require('discord.js');
const config = require('../../config.json');

const OWNER_ID = config.ownerID || '1178342841882267744';

module.exports = {
    name: 'ask',
    description: 'مخصص للمالك فقط',
    aliases: ['اسال', 'سؤال'],
    category: 'general',
    data: new SlashCommandBuilder()
        .setName('ask')
        .setDescription('مخصص للمالك فقط')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('السؤال')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: '❌ هذا الأمر مخصص للمالك فقط.', ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });
        try {
            const { askAI } = require('../../utils/ai');
            const question = interaction.options.getString('question');
            const response = await askAI(question);
            await interaction.editReply({ content: response?.slice(0, 2000) || 'لا يوجد رد.' });
        } catch (e) {
            await interaction.editReply({ content: '❌ خطأ: ' + e.message });
        }
    },

    async executePrefix(message, args) {
        if (message.author.id !== OWNER_ID) return;
        const question = args.join(' ');
        if (!question) return message.reply('❌ اكتب السؤال بعد الأمر.');
        try {
            const { askAI } = require('../../utils/ai');
            const waiting = await message.reply('⏳ جاري المعالجة...');
            const response = await askAI(question);
            await waiting.edit({ content: response?.slice(0, 2000) || 'لا يوجد رد.' });
        } catch (e) {
            message.reply('❌ خطأ: ' + e.message).catch(() => {});
        }
    }
};
