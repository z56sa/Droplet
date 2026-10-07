const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const db = require('../../database');
const canvasUtil = require('../../utils/canvas');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'rank',
  description: 'عرض بطاقة مستواك ورتبتك ونقاط خبرتك (Rank Card)',
  aliases: ['level', 'لفل', 'بروفايل', 'رتبة'],
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('عرض بطاقة المستوى ونقاط الخبرة')
    .addUserOption(opt => opt.setName('user').setDescription('العضو المراد فحص مستواه').setRequired(false)),

  async execute(interaction) {
    const settings = db.getGuildSettings(interaction.guild.id);
    if (settings.leveling_enabled === 0) {
      return interaction.reply({ content: t(interaction.guild.id, 'economy.leaderboard.disabled'), ephemeral: true });
    }
    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return interaction.editReply(t(interaction.guild.id, 'economy.rank.not_found'));

    const xpData = db.getUserRank(targetUser.id, interaction.guild.id);
    const cardBuffer = await canvasUtil.createRankCard(member, xpData || { xp: 0, level: 0, rank: 1 });
    const attachment = new AttachmentBuilder(cardBuffer, { name: 'rank.png' });

    await interaction.editReply({ files: [attachment] });
  },

  async executePrefix(message, args) {
    const settings = db.getGuildSettings(message.guild.id);
    if (settings.leveling_enabled === 0) {
      return message.reply(t(message.guild.id, 'economy.leaderboard.disabled'));
    }
    const targetUser = message.mentions.users.first() ||
                       (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null) ||
                       message.author;

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply(t(message.guild.id, 'economy.rank.not_found'));

    const loading = await message.reply(t(message.guild.id, 'economy.rank.loading'));
    const xpData = db.getUserRank(targetUser.id, message.guild.id);
    const cardBuffer = await canvasUtil.createRankCard(member, xpData || { xp: 0, level: 0, rank: 1 });
    const attachment = new AttachmentBuilder(cardBuffer, { name: 'rank.png' });

    await loading.edit({ content: null, files: [attachment] });
  }
};
