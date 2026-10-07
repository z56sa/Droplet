const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'set-verification',
  description: 'إعداد ونشر نظام وبانر التحقق التفاعلي من الأعضاء (Verification System)',
  aliases: ['تحقق', 'توثيق', 'verification', 'verify-setup'],
  data: new SlashCommandBuilder()
    .setName('set-verification')
    .setDescription('إعداد وتفعيل نظام التحقق التفاعلي في السيرفر')
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('روم التحقق الذي ستظهر به رسالة وبانر التوثيق')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addRoleOption(opt =>
      opt.setName('role')
        .setDescription('الرتبة التي ستعطى للعضو تلقائياً بعد إتمام التحقق')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('نوع التحقق المطلوب')
        .addChoices(
          { name: '🔘 زر فوري بنقرة واحدة (Instant Button)', value: 'button' },
          { name: '🔢 عملية حسابية لمنع البوتات (Math Captcha)', value: 'captcha' },
          { name: '🔤 كود نصي عشوائي (Text Code Captcha)', value: 'code' }
        )
        .setRequired(false)
    )
    .addRoleOption(opt =>
      opt.setName('unverified_role')
        .setDescription('رتبة غير الموثق لإخفاء الرومات (تُسحب بعد التوثيق - اختياري)')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('رسالة الترحيب والشروط داخل بانر التحقق')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ هذا الأمر مخصص لإدارة السيرفر فقط.', flags: 64 });
    }

    const channel = interaction.options.getChannel('channel');
    const verifiedRole = interaction.options.getRole('role');
    const unverifiedRole = interaction.options.getRole('unverified_role');
    const type = interaction.options.getString('type') || 'button';
    const customMessage = interaction.options.getString('message') || 'أهلاً بك في سيرفرنا! 🛡️\n\nللوصول إلى جميع القنوات والفعاليات والتحدث مع الأعضاء، يرجى الضغط على الزر أدناه لتأكيد هويتك وتفعيل حسابك فوراً.';

    // حفظ الإعدادات في قاعدة البيانات
    db.updateGuildSetting(interaction.guild.id, 'verification_enabled', 1);
    db.updateGuildSetting(interaction.guild.id, 'verification_channel', channel.id);
    db.updateGuildSetting(interaction.guild.id, 'verification_role', verifiedRole.id);
    if (unverifiedRole) {
      db.updateGuildSetting(interaction.guild.id, 'unverified_role', unverifiedRole.id);
    }
    db.updateGuildSetting(interaction.guild.id, 'verification_type', type);
    db.updateGuildSetting(interaction.guild.id, 'verification_message', customMessage);

    // بناء بانر التحقق الفخم
    const embed = new EmbedBuilder()
      .setColor('#2ed573')
      .setTitle(`🛡️ نظام التحقق والأمان | ${interaction.guild.name}`)
      .setDescription(customMessage)
      .addFields(
        { name: '✨ الرتبة الممنوحة', value: `<@&${verifiedRole.id}>`, inline: true },
        { name: '🔒 نوع الحماية', value: type === 'captcha' ? '🔢 كود كابتشا أمني' : '⚡ توثيق فوري بنقرة واحدة', inline: true }
      )
      .setImage('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=960&q=80')
      .setFooter({ text: 'Droplet Security & Verification Gate' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_start_verification')
        .setLabel('✅ اضغط هنا للتحقق | Verify')
        .setStyle(ButtonStyle.Success)
    );

    try {
      await channel.send({ embeds: [embed], components: [row] });
      await interaction.reply({
        content: `✅ تم إعداد وتفعيل نظام التحقق بنجاح وإرسال البانر إلى القناة <#${channel.id}>!\n🎯 الرتبة المفعلة: **${verifiedRole.name}**\n⚙️ نوع الفحص: **${type === 'captcha' ? 'كود كابتشا رقمي' : 'زر فوري'}**`,
        flags: 64
      });
    } catch (err) {
      console.error('فشل إرسال رسالة التحقق:', err);
      await interaction.reply({
        content: `❌ حدث خطأ أثناء إرسال البانر إلى القناة. تأكد من أن البوت يملك صلاحيات إرسال الرسائل وتضمين الروابط في <#${channel.id}>.`,
        flags: 64
      });
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ هذا الأمر مخصص لإدارة السيرفر فقط.');
    }

    const channel = message.mentions.channels.first() || message.channel;
    const role = message.mentions.roles.first();

    if (!role) {
      return message.reply('❌ يرجى منشن الرتبة الممنوحة للموثقين. مثال:\n`#set-verification #قناة-التحقق @Member` أو استخدم أمر السلاش `/set-verification`.');
    }

    db.updateGuildSetting(message.guild.id, 'verification_enabled', 1);
    db.updateGuildSetting(message.guild.id, 'verification_channel', channel.id);
    db.updateGuildSetting(message.guild.id, 'verification_role', role.id);
    db.updateGuildSetting(message.guild.id, 'verification_type', 'button');

    const embed = new EmbedBuilder()
      .setColor('#2ed573')
      .setTitle(`🛡️ نظام التحقق والأمان | ${message.guild.name}`)
      .setDescription('أهلاً بك في سيرفرنا! 🛡️\n\nللوصول إلى جميع القنوات والفعاليات والتحدث مع الأعضاء، يرجى الضغط على الزر أدناه لتأكيد هويتك وتفعيل حسابك فوراً.')
      .addFields(
        { name: '✨ الرتبة الممنوحة', value: `<@&${role.id}>`, inline: true },
        { name: '🔒 حالة الحماية', value: '🟢 نشطة ومفعلة', inline: true }
      )
      .setImage('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=960&q=80')
      .setFooter({ text: 'Droplet Security & Verification Gate' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_start_verification')
        .setLabel('✅ اضغط هنا للتحقق | Verify')
        .setStyle(ButtonStyle.Success)
    );

    await channel.send({ embeds: [embed], components: [row] });
    await message.reply(`✅ تم تفعيل وإرسال بانر التحقق إلى القناة <#${channel.id}> برتبة **${role.name}**!`);
  }
};
