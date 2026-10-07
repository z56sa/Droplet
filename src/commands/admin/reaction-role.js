const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'reaction-role',
  description: 'إنشاء رسالة لاختيار الرتب بالضغط على الزر (Button Role)',
  aliases: ['زر_رتبة'],
  data: new SlashCommandBuilder()
    .setName('reaction-role')
    .setDescription('Create an interactive button role message')

    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('The channel to send the message in')

        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addRoleOption(opt =>
      opt.setName('role')
        .setDescription('The role the member will receive')

        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('title')
        .setDescription('The message title (Embed Title)')

        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('description')
        .setDescription('Message details and explanation')

        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('button_label')
        .setDescription('The text shown on the button')

        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'admin.common.no_admin'), flags: 64 });
    }

    const channel = interaction.options.getChannel('channel');
    const role = interaction.options.getRole('role');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const buttonLabel = interaction.options.getString('button_label');

    const customId = `rr_${role.id}_${Date.now()}`;

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(title)
      .setDescription(description)
      .setFooter({ text: t(lang, 'admin.reactionrole.footer') });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(buttonLabel)
        .setEmoji('🎭')
        .setStyle(ButtonStyle.Secondary)
    );

    const sentMessage = await channel.send({ embeds: [embed], components: [row] });
    db.addReactionRole(interaction.guild.id, sentMessage.id, role.id, customId, buttonLabel, '🎭');

    await interaction.reply({ content: t(lang, 'admin.reactionrole.created', { channel: channel.id }), flags: 64 });
  }
};
