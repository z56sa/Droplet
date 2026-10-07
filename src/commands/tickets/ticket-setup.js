const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelType } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'ticket-setup',
  description: 'إعداد لوحة تذاكر مخصصة بالكامل (العنوان، الوصف، الأزرار، الأقسام المخصصة، والترحيب)',
  aliases: ['تذاكر', 'تكت_مخصص'],
  data: new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('Set up a fully custom ticket panel')

    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('The channel to send the ticket panel in')

        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('Panel type: interactive button or dropdown category list')

        .setRequired(true)
        .addChoices(
          { name: '🔘 Normal interactive button (Button Panel)', value: 'button' },
          { name: '📑 Custom multi-category list (Dropdown Categories)', value: 'dropdown' }
        )
    )
    .addStringOption(opt => opt.setName('title').setDescription('Ticket panel title').setRequired(false))
    .addStringOption(opt => opt.setName('description').setDescription('Ticket panel description').setRequired(false))
    .addStringOption(opt => opt.setName('button_label').setDescription('Text shown on the ticket open button').setRequired(false))
    .addStringOption(opt => opt.setName('button_emoji').setDescription('Button emoji (e.g. 📩, 🎫, 🛒)').setRequired(false))
    .addStringOption(opt =>
      opt.setName('button_color')
        .setDescription('Button color')

        .setRequired(false)
        .addChoices(
          { name: '🔵 Blue (Primary)', value: 'Primary' },
          { name: '🟢 Green (Success)', value: 'Success' },
          { name: '🔴 Red (Danger)', value: 'Danger' },
          { name: '⚪ Gray (Secondary)', value: 'Secondary' }
        )
    )
    .addStringOption(opt => opt.setName('welcome_message').setDescription('Welcome message inside the ticket (use {user} to mention the member)').setRequired(false))
    .addRoleOption(opt => opt.setName('support_role').setDescription('Support staff role for the ticket').setRequired(false))
    .addChannelOption(opt => opt.setName('category').setDescription('Room category to organize tickets under').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
    .addChannelOption(opt => opt.setName('logs_channel').setDescription('Ticket close logs channel (Logs)').addChannelTypes(ChannelType.GuildText).setRequired(false))
    .addStringOption(opt => opt.setName('naming_scheme').setDescription('Ticket channel name pattern (default: ticket-{username})').setRequired(false))
    // أقسام مخصصة للقائمة المنسدلة
    .addStringOption(opt => opt.setName('cat1_name').setDescription('First section name').setRequired(false))
    .addStringOption(opt => opt.setName('cat1_desc').setDescription('First section description').setRequired(false))
    .addStringOption(opt => opt.setName('cat1_emoji').setDescription('First section emoji').setRequired(false))
    .addStringOption(opt => opt.setName('cat2_name').setDescription('Second section name').setRequired(false))
    .addStringOption(opt => opt.setName('cat2_desc').setDescription('Second section description').setRequired(false))
    .addStringOption(opt => opt.setName('cat2_emoji').setDescription('Second section emoji').setRequired(false))
    .addStringOption(opt => opt.setName('cat3_name').setDescription('Third section name').setRequired(false))
    .addStringOption(opt => opt.setName('cat3_desc').setDescription('Third section description').setRequired(false))
    .addStringOption(opt => opt.setName('cat3_emoji').setDescription('Third section emoji').setRequired(false))
    .addStringOption(opt => opt.setName('cat4_name').setDescription('Fourth section name').setRequired(false))
    .addStringOption(opt => opt.setName('cat4_desc').setDescription('Fourth section description').setRequired(false))
    .addStringOption(opt => opt.setName('banner_url').setDescription('Ticket panel banner image URL').setRequired(false))
    .addStringOption(opt => opt.setName('welcome_image').setDescription('Banner image URL inside the opened ticket').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'tickets.ticketsetup.no_admin'), flags: 64 });
    }

    const channel = interaction.options.getChannel('channel');
    const panelType = interaction.options.getString('type');
    const title = interaction.options.getString('title') || t(lang, 'tickets.ticketsetup.def_title');
    const description = interaction.options.getString('description') || t(lang, 'tickets.ticketsetup.def_description');
    const buttonLabel = interaction.options.getString('button_label') || t(lang, 'tickets.ticketsetup.def_button_label');
    const buttonEmoji = interaction.options.getString('button_emoji') || '📩';
    const buttonColor = interaction.options.getString('button_color') || 'Primary';
    const welcomeMsg = interaction.options.getString('welcome_message') || t(lang, 'tickets.ticketsetup.def_welcome');
    const supportRole = interaction.options.getRole('support_role');
    const category = interaction.options.getChannel('category');
    const logsChannel = interaction.options.getChannel('logs_channel');
    const namingScheme = interaction.options.getString('naming_scheme') || 'ticket-{username}';

    const cat1Name = interaction.options.getString('cat1_name') || t(lang, 'tickets.ticketsetup.def_cat1_name');
    const cat1Desc = interaction.options.getString('cat1_desc') || t(lang, 'tickets.ticketsetup.def_cat1_desc');
    const cat1Emoji = interaction.options.getString('cat1_emoji') || '🛠️';

    const cat2Name = interaction.options.getString('cat2_name') || t(lang, 'tickets.ticketsetup.def_cat2_name');
    const cat2Desc = interaction.options.getString('cat2_desc') || t(lang, 'tickets.ticketsetup.def_cat2_desc');
    const cat2Emoji = interaction.options.getString('cat2_emoji') || '🛒';

    const cat3Name = interaction.options.getString('cat3_name') || t(lang, 'tickets.ticketsetup.def_cat3_name');
    const cat3Desc = interaction.options.getString('cat3_desc') || t(lang, 'tickets.ticketsetup.def_cat3_desc');
    const cat3Emoji = interaction.options.getString('cat3_emoji') || '📝';

    const cat4Name = interaction.options.getString('cat4_name') || t(lang, 'tickets.ticketsetup.def_cat4_name');
    const cat4Desc = interaction.options.getString('cat4_desc') || t(lang, 'tickets.ticketsetup.def_cat4_desc');
    const cat4Emoji = interaction.options.getString('cat4_emoji') || '👑';

    const bannerUrl = interaction.options.getString('banner_url');
    const welcomeImage = interaction.options.getString('welcome_image');

    const panelId = `panel_${interaction.guild.id}_${Date.now()}`;

    const embed = new EmbedBuilder()
      .setColor('#2b2d31')
      .setDescription(
        `# **${title}**\n\n` +
        `─── ─── ─── ─── ─── ─── ─── ───\n\n` +
        `### **${description.replace(/\\n/g, '\n')}**`
      );

    if (bannerUrl) {
      embed.setImage(bannerUrl);
    }

    let components = [];

    if (panelType === 'dropdown') {
      const options = [
        { label: cat1Name, value: `cat_1`, description: cat1Desc.slice(0, 99), emoji: cat1Emoji },
        { label: cat2Name, value: `cat_2`, description: cat2Desc.slice(0, 99), emoji: cat2Emoji },
        { label: cat3Name, value: `cat_3`, description: cat3Desc.slice(0, 99), emoji: cat3Emoji },
        { label: cat4Name, value: `cat_4`, description: cat4Desc.slice(0, 99), emoji: '👑' }
      ];

      const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ticket_select_${panelId}`)
          .setPlaceholder(t(lang, 'tickets.ticketsetup.select_placeholder'))
          .addOptions(options)
      );
      components.push(selectMenu);
    } else {
      const buttonStyleEnum = ButtonStyle[buttonColor] || ButtonStyle.Primary;
      const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_open_${panelId}`)
          .setLabel(buttonLabel)
          .setEmoji(buttonEmoji)
          .setStyle(buttonStyleEnum)
      );
      components.push(button);
    }

    const sentMessage = await channel.send({ embeds: [embed], components });

    db.saveTicketPanel({
      panel_id: panelId,
      guild_id: interaction.guild.id,
      channel_id: channel.id,
      message_id: sentMessage.id,
      title,
      description,
      button_label: buttonLabel,
      button_emoji: buttonEmoji,
      button_style: buttonColor,
      welcome_msg: welcomeMsg,
      support_role: supportRole ? supportRole.id : null,
      category_id: category ? category.id : null,
      naming_scheme: namingScheme,
      logs_channel: logsChannel ? logsChannel.id : null,
      banner_url: bannerUrl || null,
      welcome_image: welcomeImage || null
    });

    await interaction.reply({ content: t(lang, 'tickets.ticketsetup.panel_sent', { channel: channel.id }), flags: 64 });
  }
};
