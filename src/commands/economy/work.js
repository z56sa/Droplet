const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');
const JOB_LISTS = require('../../lang/jobs');

const WORK_COOLDOWN = 4 * 60 * 60 * 1000; // 4 ساعات

module.exports = {
  name: 'work',
  description: 'اعمل لتكسب Star Coin (كل 4 ساعات)',
  aliases: ['اشتغل', 'شغل'],
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('اعمل لتكسب Star Coin ⭐ 💼'),

  async execute(interaction) {
    await interaction.deferReply();
    await this.handleWork(interaction.user, interaction.guild.id, (opts) => interaction.editReply(opts));
  },

  async executePrefix(message) {
    await this.handleWork(message.author, message.guild.id, (opts) => message.reply(opts));
  },

  async handleWork(user, guildId, reply) {
    const lang = getGuildLang(guildId);
    const settings = db.getGuildSettings ? db.getGuildSettings(guildId) : {};
    const WORK_CD = Math.max(1, Math.min(24, parseInt(settings.work_cooldown) || 4)) * 60 * 60 * 1000;
    const JOBS = JOB_LISTS[lang] || JOB_LISTS.EN;
    const userData = db.getUser(user.id, guildId);
    const lastWork = userData.last_work || 0;
    const now = Date.now();

    if (now - lastWork < WORK_CD) {
      const remaining = WORK_CD - (now - lastWork);
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const embed = new EmbedBuilder().setColor('#e74c3c')
        .setTitle(t(lang, 'economy.work.cooldown_title'))
        .setDescription(t(lang, 'economy.work.cooldown_desc', { h, m }))
        .setTimestamp();
      return reply({ embeds: [embed] });
    }

    const job = JOBS[Math.floor(Math.random() * JOBS.length)];
    let reward = Math.floor(Math.random() * 151) + 50; // 50-200
    let bonusText = '';

    // 10% فرصة مضاعفة الراتب
    if (Math.random() < 0.1) {
      reward *= 2;
      bonusText = t(lang, 'economy.work.bonus');
    }

    db.addCoins(user.id, guildId, reward);
    db.setLastWork(user.id, guildId, now);

    const newUserData = db.getUser(user.id, guildId);
    const embed = new EmbedBuilder()
      .setColor('#27ae60')
      .setTitle(job.title)
      .setDescription(`${job.msg}${bonusText}`)
      .addFields(
        { name: t(lang, 'economy.work.field_salary'), value: `\`+${reward.toLocaleString()}\` ⭐ Star Coin`, inline: true },
        { name: t(lang, 'economy.work.field_balance'), value: `\`${(newUserData.coins || newUserData.credits || 0).toLocaleString()}\` ⭐`, inline: true }
      )
      .setFooter({ text: t(lang, 'economy.work.footer') })
      .setTimestamp();

    await reply({ embeds: [embed] });
  }
};
