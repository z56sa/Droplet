const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');
const { isEnabled } = require('../../utils/isEnabled');

module.exports = {
  name: 'leaderboard',
  description: 'عرض قائمة المتصدرين في السيرفر (المستويات أو Star Coin)',
  aliases: ['top', 'توب', 'متصدرين'],
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('عرض قائمة المتصدرين')
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('نوع الترتيب')
        .setRequired(false)
        .addChoices(
          { name: '🏆 المستويات (XP)', value: 'xp' },
          { name: '⭐ نجوم (Star Coin)', value: 'credits' }
        )
    ),

  async execute(interaction) {
    const type = interaction.options.getString('type') || 'xp';
    const settings = db.getGuildSettings(interaction.guild.id);
    if (type === 'xp' && !isEnabled(settings.leveling_enabled, true)) {
      return interaction.reply({ content: t(interaction.guild.id, 'economy.leaderboard.disabled'), ephemeral: true });
    }
    const embed = await this.buildEmbed(interaction.guild, type);
    await interaction.reply({ embeds: [embed] });
  },

  async executePrefix(message, args) {
    const type = args[0]?.toLowerCase() === 'credits' || args[0]?.toLowerCase() === 'credit' || args[0]?.toLowerCase() === 'star' || args[0]?.toLowerCase() === 'coins' ? 'credits' : 'xp';
    const settings = db.getGuildSettings(message.guild.id);
    if (type === 'xp' && !isEnabled(settings.leveling_enabled, true)) {
      return message.reply(t(message.guild.id, 'economy.leaderboard.disabled'));
    }
    const embed = await this.buildEmbed(message.guild, type);
    await message.reply({ embeds: [embed] });
  },

  async buildEmbed(guild, type) {
    const lang = getGuildLang(guild.id);
    const embed = new EmbedBuilder().setColor(config.colors?.primary || '#5865F2').setTimestamp();

    if (type === 'xp') {
      const topUsers = db.getLeaderboard(guild.id, 10);
      embed.setTitle(t(lang, 'economy.leaderboard.title_xp', { guild: guild.name }));

      if (!topUsers || topUsers.length === 0) {
        embed.setDescription(t(lang, 'economy.leaderboard.empty_xp'));
        return embed;
      }

      const list = topUsers.map((u, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**#${i + 1}**`;
        return `${medal} <@${u.user_id}> • ` + t(lang, 'economy.leaderboard.row_xp', { level: u.level || 1, xp: (u.xp || 0).toLocaleString() });
      }).join('\n');

      embed.setDescription(list);
    } else {
      const topUsers = db.getCoinsLeaderboard(guild.id, 10);
      embed.setTitle(t(lang, 'economy.leaderboard.title_coins', { guild: guild.name }));

      if (!topUsers || topUsers.length === 0) {
        embed.setDescription(t(lang, 'economy.leaderboard.empty_coins'));
        return embed;
      }

      const list = topUsers.map((u, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**#${i + 1}**`;
        const coins = u.coins || u.credits || 0;
        return `${medal} <@${u.user_id}> • ` + t(lang, 'economy.leaderboard.row_coins', { coins: coins.toLocaleString() });
      }).join('\n');

      embed.setDescription(list);
    }

    return embed;
  }
};
