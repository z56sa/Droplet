/**
 * ⚡ لعبة أسرع واحد يكتب — أمر مستقل /game-fast
 * (المنطق المشترك بنك الجمل والجولة كله في game.js — هنا نقطة دخول مستقلة)
 */
const { SlashCommandBuilder } = require('discord.js');
const game = require('./game');

module.exports = {
  name: 'game-fast',
  description: 'لعبة أسرع واحد يكتب: نسخ العبارة بدون أخطاء (Fast Typing) ⚡',
  aliases: ['fast', 'سرعة', 'اسرع', 'أسرع'],
  data: new SlashCommandBuilder()
    .setName('game-fast')
    .setDescription('⚡ تحدي أسرع كاتب: أول من يكتب العبارة كاملة وبدون أخطاء يفوز!'),

  async execute(interaction) {
    const settings = game.getGamesSettings(interaction.guild.id);
    if (game.activeGames.has(interaction.channelId)) {
      return interaction.reply({ content: '⚠️ هناك لعبة جارية بالفعل في هذه القناة! انتظر حتى تنتهي.', ephemeral: true });
    }
    const err = game.preflightGamesError(interaction.channelId, interaction.guild.id, settings, { skipActive: true });
    if (err) return interaction.reply({ content: err, ephemeral: true });

    await interaction.deferReply();
    await game.startGame(interaction.channel, interaction.user, interaction.guild.id, 'fast', (opts) => interaction.editReply(opts), settings);
  },

  async executePrefix(message, args, client) {
    const settings = game.getGamesSettings(message.guild.id);
    if (game.activeGames.has(message.channel.id)) {
      return message.reply('⚠️ هناك لعبة جارية بالفعل في هذه القناة! انتظر حتى تنتهي.').catch(() => {});
    }
    const err = game.preflightGamesError(message.channel.id, message.guild.id, settings, { skipActive: true });
    if (err) return message.reply(err).catch(() => {});

    await game.startGame(message.channel, message.author, message.guild.id, 'fast', (opts) => message.channel.send(opts), settings);
  }
};
