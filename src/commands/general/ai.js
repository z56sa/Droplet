const { SlashCommandBuilder } = require('discord.js');
const config = require('../../config.json');

const OWNER_ID = config.ownerID || '1178342841882267744';

module.exports = {
    name: 'ai',
    description: 'مخصص للمالك فقط',
    aliases: ['bot-ai', 'gpt'],
    category: 'general',
    data: new SlashCommandBuilder()
        .setName('ai')
        .setDescription('مخصص للمالك فقط')
        .addStringOption(option =>
            option.setName('prompt')
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
            const prompt = interaction.options.getString('prompt');
            const response = await askAI(prompt);
            await interaction.editReply({ content: response?.slice(0, 2000) || 'لا يوجد رد.' });
        } catch (e) {
            await interaction.editReply({ content: '❌ خطأ: ' + e.message });
        }
    },

    async executePrefix(message, args) {
        if (message.author.id !== OWNER_ID) return;
        const query = args.join(' ');
        if (!query) return message.reply('❌ اكتب السؤال بعد الأمر.');
        try {
            const { askAI } = require('../../utils/ai');
            const waiting = await message.reply('⏳ جاري المعالجة...');
            const response = await askAI(query);
            await waiting.edit({ content: response?.slice(0, 2000) || 'لا يوجد رد.' });
        } catch (e) {
            message.reply('❌ خطأ: ' + e.message).catch(() => {});
        }
    }
};
