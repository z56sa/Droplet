/**
 * 🧩 لعبة تفكيك وتركيب الكلمات — أمر مستقل /game-words
 * (المنطق المشترك بنك الكلمات والجولة كله في game.js — هنا نقطة دخول مستقلة)
 */
const { SlashCommandBuilder } = require('discord.js');
const game = require('./game');

module.exports = {
  name: 'game-words',
  description: 'لعبة تفكيك وتركيب الكلمات الحروف المبعثرة (Words) 🧩',
  aliases: ['words', 'كلمات', 'تفكيك', 'تركيب'],
  data: new SlashCommandBuilder()
    .setName('game-words')
    .setDescription('🧩 لعبة تفكيك وتركيب الكلمات: أول إجابة صحيحة في الشات تفوز!'),

  async execute(interaction) {
    const settings = game.getGamesSettings(interaction.guild.id);
    if (game.activeGames.has(interaction.channelId)) {
      return interaction.reply({ content: '⚠️ هناك لعبة جارية بالفعل في هذه القناة! انتظر حتى تنتهي.', ephemeral: true });
    }
    const err = game.preflightGamesError(interaction.channelId, interaction.guild.id, settings, { skipActive: true });
    if (err) return interaction.reply({ content: err, ephemeral: true });

    // ✅ إغلاق سباق البدء: القفل يفتح ملاصقاً للفحص قبل أي await — نافذة defer ما تسمح بلقطة مزدوجة
    game.activeGames.add(interaction.channelId);
    try {
      await interaction.deferReply();
    } catch (e) {
      game.activeGames.delete(interaction.channelId);
      return;
    }
    await game.startGame(interaction.channel, interaction.user, interaction.guild.id, 'words', (opts) => interaction.editReply(opts), settings);
  },

  async executePrefix(message, args, client) {
    const settings = game.getGamesSettings(message.guild.id);
    if (game.activeGames.has(message.channel.id)) {
      return message.reply('⚠️ هناك لعبة جارية بالفعل في هذه القناة! انتظر حتى تنتهي.').catch(() => {});
    }
    const err = game.preflightGamesError(message.channel.id, message.guild.id, settings, { skipActive: true });
    if (err) return message.reply(err).catch(() => {});

    await game.startGame(message.channel, message.author, message.guild.id, 'words', (opts) => message.channel.send(opts), settings);
  }
};
