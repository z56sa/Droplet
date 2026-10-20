/**
 * 🌍 لعبة عواصم الدول — أمر مستقل /game-capitals
 * (المنطق المشترك بنك الأسئلة والجولة كله في game.js — هنا نقطة دخول مستقلة)
 */
const { SlashCommandBuilder } = require('discord.js');
const game = require('./game');

module.exports = {
  name: 'game-capitals',
  description: 'لعبة عواصم ودول: ما هي عاصمة الدولة؟ (Capitals) 🌍',
  aliases: ['capitals', 'عواصم', 'عاصمة'],
  data: new SlashCommandBuilder()
    .setName('game-capitals')
    .setDescription('🌍 لعبة عواصم الدول: أول إجابة صحيحة في الشات تفوز!'),

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
      try { await interaction.reply({ content: '⚠️ تعذر بدء اللعبة الآن (تأخير بالشبكة) — جرّب مرة ثانية!', ephemeral: true }); } catch {}
      return;
    }
    await game.startGame(interaction.channel, interaction.user, interaction.guild.id, 'capitals', (opts) => interaction.editReply(opts), settings);
  },

  async executePrefix(message, args, client) {
    const settings = game.getGamesSettings(message.guild.id);
    if (game.activeGames.has(message.channel.id)) {
      return message.reply('⚠️ هناك لعبة جارية بالفعل في هذه القناة! انتظر حتى تنتهي.').catch(() => {});
    }
    const err = game.preflightGamesError(message.channel.id, message.guild.id, settings, { skipActive: true });
    if (err) return message.reply(err).catch(() => {});

    await game.startGame(message.channel, message.author, message.guild.id, 'capitals', (opts) => message.channel.send(opts), settings);
  }
};
