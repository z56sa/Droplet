const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'banner',
  description: 'عرض بنر حساب المستخدم',
  aliases: ['بنر'],
  data: new SlashCommandBuilder()
    .setName('banner')
    .setDescription('عرض بنر حسابك أو حساب عضو آخر')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('العضو المراد عرض بنره')
        .setRequired(false)
    ),

  async execute(interaction, client) {
    const user = interaction.options.getUser('user') || interaction.user;
    const fetchedUser = await client.users.fetch(user.id, { force: true });
    const bannerURL = fetchedUser.bannerURL({ dynamic: true, size: 1024 });

    if (!bannerURL) {
      return interaction.reply({
        content: t(interaction.guild.id, 'general.banner.no_banner', { user: user.username }),
        flags: 64
      });
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(t(interaction.guild.id, 'general.banner.title', { user: user.username }))
      .setImage(bannerURL)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  async executePrefix(message, args, client) {
    const user = message.mentions.users.first() ||
                 (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null) ||
                 message.author;

    const fetchedUser = await client.users.fetch(user.id, { force: true });
    const bannerURL = fetchedUser.bannerURL({ dynamic: true, size: 1024 });

    if (!bannerURL) {
      return message.reply(t(message.guild.id, 'general.banner.no_banner', { user: user.username }));
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(t(message.guild.id, 'general.banner.title', { user: user.username }))
      .setImage(bannerURL)
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
};
