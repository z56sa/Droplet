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

    const cardBuffer = await canvasUtil.createProfileCard(member, userData, rankData);
    const attachment = new AttachmentBuilder(cardBuffer, { name: 'profile.png' });

    await loading.edit({ content: null, files: [attachment] });
  }
};
