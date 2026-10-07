const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const db = require('../../database');
const canvasUtil = require('../../utils/canvas');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'profile',
  description: 'عرض بطاقة البروفايل والهوية الشخصية المخصصة (ProBot Profile Card)',
  aliases: ['pr', 'id', 'بروفايل', 'هوية', 'بطاقة'],
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('عرض بطاقة البروفايل والهوية الشخصية')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('العضو المراد عرض بروفايله (اختياري)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return interaction.editReply(t(interaction.guild.id, 'common.member_not_found'));

    const userData = db.getUser(targetUser.id, interaction.guild.id);
    userData.wallpaper_url = db.getWallpaper(targetUser.id);
    const rankData = db.getUserRank(targetUser.id, interaction.guild.id) || { xp: 0, level: 0, rank: 1 };

    // التأكد من جلب رصيد الذهب الفعلي للمستخدم (سواء من السيرفر الحالي أو محفظته المجمعة)
    try {
      const rawDb = db.getDb?.();
      if (rawDb) {
        const sumRow = rawDb.prepare('SELECT SUM(coins) as total_coins, MAX(streak) as max_streak, MAX(reputation) as max_rep FROM users WHERE user_id = ?').get(targetUser.id);
        if (sumRow) {
          if (sumRow.total_coins !== null && sumRow.total_coins > (userData.coins || 0)) {
            userData.coins = sumRow.total_coins;
          }
          if (sumRow.max_streak !== null && sumRow.max_streak > (userData.streak || 0)) {
            userData.streak = sumRow.max_streak;
          }
          if (sumRow.max_rep !== null && sumRow.max_rep > (userData.reputation || 0)) {
            userData.reputation = sumRow.max_rep;
          }
        }
      }
    } catch (e) {}

    // بناء شارات العضو الفعلية
    userData.badges = {
      owner: interaction.guild.ownerId === member.id,
      admin: member.permissions.has('Administrator') || member.permissions.has('ManageGuild'),
      booster: Boolean(member.premiumSince),
      active: (rankData.level || 1) >= 5 || (userData.streak || 0) >= 3,
      vip: (userData.coins || 0) >= 10000 || (rankData.level || 1) >= 15
    };

    const cardBuffer = await canvasUtil.createProfileCard(member, userData, rankData);
    const attachment = new AttachmentBuilder(cardBuffer, { name: 'profile.png' });

    await interaction.editReply({
      files: [attachment]
    });
  },

  async executePrefix(message, args) {
    const targetUser = message.mentions.users.first() ||
                       (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null) ||
                       message.author;

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply(t(message.guild.id, 'common.member_not_found'));

    const loading = await message.reply(t(message.guild.id, 'economy.profile.loading'));
    const userData = db.getUser(targetUser.id, message.guild.id);
    userData.wallpaper_url = db.getWallpaper(targetUser.id);
    const rankData = db.getUserRank(targetUser.id, message.guild.id) || { xp: 0, level: 0, rank: 1 };

    // التأكد من جلب رصيد الذهب الفعلي للمستخدم (سواء من السيرفر الحالي أو محفظته المجمعة)
    try {
      const rawDb = db.getDb?.();
      if (rawDb) {
        const sumRow = rawDb.prepare('SELECT SUM(coins) as total_coins, MAX(streak) as max_streak, MAX(reputation) as max_rep FROM users WHERE user_id = ?').get(targetUser.id);
        if (sumRow) {
          if (sumRow.total_coins !== null && sumRow.total_coins > (userData.coins || 0)) {
            userData.coins = sumRow.total_coins;
          }
          if (sumRow.max_streak !== null && sumRow.max_streak > (userData.streak || 0)) {
            userData.streak = sumRow.max_streak;
          }
          if (sumRow.max_rep !== null && sumRow.max_rep > (userData.reputation || 0)) {
            userData.reputation = sumRow.max_rep;
          }
        }
      }
    } catch (e) {}

    // بناء شارات العضو الفعلية
    userData.badges = {
      owner: message.guild.ownerId === member.id,
      admin: member.permissions.has('Administrator') || member.permissions.has('ManageGuild'),
      booster: Boolean(member.premiumSince),
      active: (rankData.level || 1) >= 5 || (userData.streak || 0) >= 3,
      vip: (userData.coins || 0) >= 10000 || (rankData.level || 1) >= 15
    };

    const cardBuffer = await canvasUtil.createProfileCard(member, userData, rankData);
    const attachment = new AttachmentBuilder(cardBuffer, { name: 'profile.png' });

    await loading.edit({ content: null, files: [attachment] });
  }
};
