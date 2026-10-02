const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelType } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'ticket-setup',
  description: 'إعداد لوحة تذاكر مخصصة بالكامل (العنوان، الوصف، الأزرار، الأقسام المخصصة، والترحيب)',
  aliases: ['تذاكر', 'تكت_مخصص'],
  data: new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('إعداد لوحة تذاكر مخصصة بالكامل')
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('الروم المراد إرسال لوحة التذاكر فيه')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('نوع اللوحة: بزر تفاعلي أم قائمة أقسام منسدلة (Dropdown)')
        .setRequired(true)
        .addChoices(
          { name: '🔘 زر تفاعلي عادي (Button Panel)', value: 'button' },
          { name: '📑 قائمة أقسام متعددة مخصصة (Dropdown Categories)', value: 'dropdown' }
        )
    )
    .addStringOption(opt => opt.setName('title').setDescription('عنوان لوحة التذاكر').setRequired(false))
    .addStringOption(opt => opt.setName('description').setDescription('وصف وشرح لوحة التذاكر').setRequired(false))
    .addStringOption(opt => opt.setName('button_label').setDescription('النص الظاهر على زر فتح التذكرة').setRequired(false))
    .addStringOption(opt => opt.setName('button_emoji').setDescription('إيموجي الزر (مثال: 📩 أو 🎫 أو 🛒)').setRequired(false))
    .addStringOption(opt =>
      opt.setName('button_color')
        .setDescription('لون الزر')
        .setRequired(false)
        .addChoices(
          { name: '🔵 أزرق (Primary)', value: 'Primary' },
          { name: '🟢 أخضر (Success)', value: 'Success' },
          { name: '🔴 أحمر (Danger)', value: 'Danger' },
          { name: '⚪ رمادي (Secondary)', value: 'Secondary' }
        )
    )
    .addStringOption(opt => opt.setName('welcome_message').setDescription('الرسالة الترحيبية داخل التذكرة (استخدم {user} لمنشن العضو)').setRequired(false))
    .addRoleOption(opt => opt.setName('support_role').setDescription('رتبة مسؤولي الدعم الفني للتذكرة').setRequired(false))
    .addChannelOption(opt => opt.setName('category').setDescription('تصنيف الرومات (Category) لتنظيم التذاكر تحته').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
    .addChannelOption(opt => opt.setName('logs_channel').setDescription('روم حفظ سجلات وإغلاق التذاكر (Logs)').addChannelTypes(ChannelType.GuildText).setRequired(false))
    .addStringOption(opt => opt.setName('naming_scheme').setDescription('نمط اسم روم التذكرة (افتراضي: ticket-{username})').setRequired(false))
    // أقسام مخصصة للقائمة المنسدلة
    .addStringOption(opt => opt.setName('cat1_name').setDescription('اسم القسم الأول (افتراضي: الدعم الفني العام)').setRequired(false))
    .addStringOption(opt => opt.setName('cat1_desc').setDescription('وصف القسم الأول').setRequired(false))
    .addStringOption(opt => opt.setName('cat1_emoji').setDescription('إيموجي القسم الأول').setRequired(false))
    .addStringOption(opt => opt.setName('cat2_name').setDescription('اسم القسم الثاني (افتراضي: قسم الشراء والمتجر)').setRequired(false))
    .addStringOption(opt => opt.setName('cat2_desc').setDescription('وصف القسم الثاني').setRequired(false))
    .addStringOption(opt => opt.setName('cat2_emoji').setDescription('إيموجي القسم الثاني').setRequired(false))
    .addStringOption(opt => opt.setName('cat3_name').setDescription('اسم القسم الثالث (افتراضي: الشكاوى والاقتراحات)').setRequired(false))
    .addStringOption(opt => opt.setName('cat3_desc').setDescription('وصف القسم الثالث').setRequired(false))
    .addStringOption(opt => opt.setName('cat3_emoji').setDescription('إيموجي القسم الثالث').setRequired(false))
    .addStringOption(opt => opt.setName('cat4_name').setDescription('اسم القسم الرابع (افتراضي: التقديم والإدارة)').setRequired(false))
    .addStringOption(opt => opt.setName('cat4_desc').setDescription('وصف القسم الرابع').setRequired(false))
    .addStringOption(opt => opt.setName('banner_url').setDescription('رابط صورة بانر لوحة التذاكر (Image Banner)').setRequired(false))
    .addStringOption(opt => opt.setName('welcome_image').setDescription('رابط صورة البانر داخل التذكرة المفتوحة').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية الأدمن لتنفيذ هذا الأمر.', flags: 64 });
    }

    const channel = interaction.options.getChannel('channel');
    const panelType = interaction.options.getString('type');
    const title = interaction.options.getString('title') || 'التذاكر';
    const description = interaction.options.getString('description') || 'قم باختيار قسم التذكرة المناسب لك ❤️';
    const buttonLabel = interaction.options.getString('button_label') || 'فتح تذكرة | Open Ticket';
    const buttonEmoji = interaction.options.getString('button_emoji') || '📩';
    const buttonColor = interaction.options.getString('button_color') || 'Primary';
    const welcomeMsg = interaction.options.getString('welcome_message') || 'مرحباً بك {user} في تذكرتك! يرجى كتابة استفسارك أو مشكلتك بالتفصيل وسيقوم فريق الدعم بالرد عليك قريباً.';
    const supportRole = interaction.options.getRole('support_role');
    const category = interaction.options.getChannel('category');
    const logsChannel = interaction.options.getChannel('logs_channel');
    const namingScheme = interaction.options.getString('naming_scheme') || 'ticket-{username}';

    const cat1Name = interaction.options.getString('cat1_name') || 'الدعم الفني العام';
    const cat1Desc = interaction.options.getString('cat1_desc') || 'للاستفسارات والمشاكل العامة';
    const cat1Emoji = interaction.options.getString('cat1_emoji') || '🛠️';

    const cat2Name = interaction.options.getString('cat2_name') || 'قسم الشراء والمتجر';
    const cat2Desc = interaction.options.getString('cat2_desc') || 'لشراء الرتب والخدمات والمنتجات';
    const cat2Emoji = interaction.options.getString('cat2_emoji') || '🛒';

    const cat3Name = interaction.options.getString('cat3_name') || 'الشكاوى والاقتراحات';
    const cat3Desc = interaction.options.getString('cat3_desc') || 'لتقديم شكوى أو اقتراح للإدارة';
    const cat3Emoji = interaction.options.getString('cat3_emoji') || '📝';

    const cat4Name = interaction.options.getString('cat4_name') || 'التقديم والإدارة';
    const cat4Desc = interaction.options.getString('cat4_desc') || 'للتقديم على رتبة أو طلب شراكة';
    const cat4Emoji = interaction.options.getString('cat4_emoji') || '👑';

    const bannerUrl = interaction.options.getString('banner_url');
    const welcomeImage = interaction.options.getString('welcome_image');

    const panelId = `panel_${interaction.guild.id}_${Date.now()}`;

    const embed = new EmbedBuilder()
      .setColor('#2b2d31')
      .setTitle(title)
      .setDescription(description.replace(/\\n/g, '\n'));

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
          .setPlaceholder('اختر نوع التذكرة')
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

    await interaction.reply({ content: `✅ تم إرسال لوحة التذاكر المخصصة بنجاح في القناة: <#${channel.id}>`, flags: 64 });
  }
};
