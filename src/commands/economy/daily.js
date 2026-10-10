const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

const COOLDOWNS = new Map();

module.exports = {
  name: 'daily',
  description: 'احصل على مكافأتك اليومية مع نظام الـ Streak',
  aliases: ['يومي', 'كريدت'],
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('احصل على مكافأتك اليومية'),

  async execute(interaction) {
    await interaction.deferReply();
    await this.handleDaily(interaction.user, interaction.guild.id, (opts) => interaction.editReply(opts));
  },

  async executePrefix(message) {
    await this.handleDaily(message.author, message.guild.id, (opts) => message.reply(opts));
  },

  async handleDaily(user, guildId, reply) {
    const lang = getGuildLang(guildId);
    const settings = db.getGuildSettings ? db.getGuildSettings(guildId) : {};
    const userData = db.getUser(user.id, guildId);
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;
    const lastDaily = db.getLastDaily(user.id, guildId);

    if (now - lastDaily < cooldown) {
      const remaining = cooldown - (now - lastDaily);
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle(t(lang, 'economy.daily.cooldown_title'))
        .setDescription(t(lang, 'economy.daily.cooldown_desc', { h, m }))
        .setFooter({ text: t(lang, 'economy.daily.cooldown_footer') })
        .setTimestamp();
      return reply({ embeds: [embed] });
    }

    // حساب الـ Streak
    const oneDayMs = 24 * 60 * 60 * 1000;
    const twoDaysMs = 48 * 60 * 60 * 1000;
    let streak = userData.streak || 0;
    if (now - lastDaily <= twoDaysMs && lastDaily > 0) {
      streak += 1;
    } else {
      streak = 1;
    }

    // حساب المكافأة (daily_amount من الإعدادات كمضاعف للأساس، افتراضي 500)
    const _base = Math.max(50, Math.min(5000, parseInt(settings.daily_amount) || 500));
    const _scale = _base / 500;
    let reward = Math.round(200 * _scale);
    let bonusText = '';
    if (streak >= 100) { reward = Math.round(1200 * _scale); bonusText = t(lang, 'economy.daily.bonus_100'); }
    else if (streak >= 30) { reward = Math.round(700 * _scale); bonusText = t(lang, 'economy.daily.bonus_30'); }
    else if (streak >= 7) { reward = Math.round(500 * _scale); bonusText = t(lang, 'economy.daily.bonus_7'); }
    else if (streak >= 3) { reward = Math.round(300 * _scale); bonusText = t(lang, 'economy.daily.bonus_3'); }

    // تحديث قاعدة البيانات
    db.addCoins(user.id, guildId, reward);
    db.setLastDaily(user.id, guildId, now, streak);

    const newUserData = db.getUser(user.id, guildId);
    const nextStreakTarget = streak < 3 ? 3 : streak < 7 ? 7 : streak < 30 ? 30 : streak < 100 ? 100 : null;
    const streakBar = '🔥'.repeat(Math.min(streak, 10)) + (streak > 10 ? ` +${streak - 10}` : '');

    const embed = new EmbedBuilder()
      .setColor('#f1c40f')
      .setTitle(t(lang, 'economy.daily.title'))
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: t(lang, 'economy.daily.field_reward'), value: `\`+${reward}\` ⭐ Star Coin`, inline: true },
        { name: t(lang, 'economy.daily.field_new_balance'), value: `\`${(newUserData.coins || newUserData.credits || 0).toLocaleString()}\` ⭐`, inline: true },
        { name: t(lang, 'economy.daily.field_streak', { streak }), value: streakBar, inline: false }
      )
      .setFooter({ text: nextStreakTarget ? t(lang, 'economy.daily.footer_next', { left: nextStreakTarget - streak }) : t(lang, 'economy.daily.footer_top') })
      .setTimestamp();

    if (bonusText) embed.setDescription(bonusText);

    await reply({ embeds: [embed] });
  }
};
