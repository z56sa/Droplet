const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config.json');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'avatar',
  description: 'عرض صورة حساب المستخدم أو سيرفر',
  aliases: ['av', 'افتار'],
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('عرض صورة حسابك أو حساب عضو آخر')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('العضو المراد عرض صورته')
        .setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const avatarURL = user.displayAvatarURL({ dynamic: true, size: 1024 });

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(t(interaction.guild.id, 'general.avatar.title', { user: user.username }))
      .setImage(avatarURL)
      .setFooter({ text: t(interaction.guild.id, 'general.avatar.footer', { tag: interaction.user.tag }) })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(t(interaction.guild.id, 'general.avatar.button'))
        .setURL(avatarURL)
        .setStyle(ButtonStyle.Link)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  },

  async executePrefix(message, args) {
    const user = message.mentions.users.first() ||
                 (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null) ||
                 message.author;

    const avatarURL = user.displayAvatarURL({ dynamic: true, size: 1024 });

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(t(message.guild.id, 'general.avatar.title', { user: user.username }))
      .setImage(avatarURL)
      .setFooter({ text: t(message.guild.id, 'general.avatar.footer', { tag: message.author.tag }) })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(t(message.guild.id, 'general.avatar.button'))
        .setURL(avatarURL)
        .setStyle(ButtonStyle.Link)
    );

    await message.reply({ embeds: [embed], components: [row] });
  }
};
