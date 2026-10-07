const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'setwallpaper',
  description: 'تعيين خلفية مخصصة لبطاقة البروفايل والهوية من رابط مباشر',
  aliases: ['setbg', 'خلفية', 'تعيين_خلفية'],
  data: new SlashCommandBuilder()
    .setName('setwallpaper')
    .setDescription('تعيين خلفية مخصصة لبطاقة البروفايل')
    .addStringOption(opt =>
      opt.setName('url')
        .setDescription('رابط الصورة المباشر (https://...)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const url = interaction.options.getString('url').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return interaction.reply({ content: t(interaction.guild.id, 'economy.setwallpaper.invalid_url'), flags: 64 });
    }

    db.setWallpaper(interaction.user.id, interaction.guild.id, url);

    await interaction.reply({
      content: t(interaction.guild.id, 'economy.setwallpaper.success', { name: interaction.user.username })
    });
  },

  async executePrefix(message, args) {
    let url = args[0];
    if (message.attachments.size > 0) {
      url = message.attachments.first().url;
    }

    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      return message.reply(t(message.guild.id, 'economy.setwallpaper.prefix_invalid'));
    }

    db.setWallpaper(message.author.id, message.guild.id, url);

    await message.reply({
      content: t(message.guild.id, 'economy.setwallpaper.success', { name: message.author.username })
    });
  }
};
