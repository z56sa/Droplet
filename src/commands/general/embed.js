const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const config = require('../../config.json');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'embed',
  description: 'إرسال رسالة Embed منسقة واحترافية في روم محدد',
  aliases: ['امبد'],
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('إرسال رسالة Embed منسقة')
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('الروم المراد إرسال الرسالة فيه')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('description')
        .setDescription('نص ومحتوى الرسالة')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('title')
        .setDescription('عنوان الرسالة (اختياري)')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('color')
        .setDescription('لون الرسالة (HEX مثل: #5865F2 أو #FF0000)')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('image')
        .setDescription('رابط صورة داخل الرسالة (اختياري)')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('thumbnail')
        .setDescription('رابط صورة مصغرة (Thumbnail اختياري)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.say.no_perm'), flags: 64 });
    }

    const channel = interaction.options.getChannel('channel');
    const description = interaction.options.getString('description').replace(/\\n/g, '\n');
    const title = interaction.options.getString('title');
    const color = interaction.options.getString('color') || config.colors.primary;
    const image = interaction.options.getString('image');
    const thumbnail = interaction.options.getString('thumbnail');

    const embed = new EmbedBuilder()
      .setDescription(description)
      .setTimestamp();

    try {
      embed.setColor(color);
    } catch {
      embed.setColor(config.colors.primary);
    }

    if (title) embed.setTitle(title);
    if (image) embed.setImage(image);
    if (thumbnail) embed.setThumbnail(thumbnail);

    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: t(interaction.guild.id, 'general.embed.sent', { channel: channel.id }), flags: 64 });
  }
};
