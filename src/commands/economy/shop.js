const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

// أسعار المتجر الافتراضية
const SHOP_PRICES = {
  custom_role_days_30: 5000,   // 5000 ذهب لإنشاء رتبة خاصة لمدة 30 يوم
  rent_voice_room_days_7: 3500, // 3500 ذهب لاستئجار روم صوتي لمدة أسبوع
  rent_text_room_days_7: 2500,  // 2500 ذهب لاستئجار روم كتابي لمدة أسبوع
  avatar_frame_gold: 1500,     // 1500 ذهب لإطار ذهبي ملكي للبروفايل
  avatar_frame_neon: 1200,     // 1200 ذهب لإطار نيون أرجواني
  badge_vip: 2000              // 2000 ذهب للشارة الملكية VIP
};

module.exports = {
  name: 'shop',
  description: 'متجر السيرفر الشامل: رتب مخصصة، استئجار رومات، وحزم المظهر للبروفايل',
  aliases: ['متجر', 'سوق', 'store'],
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('🛒 متجر السيرفر والأدوات المخصصة (Custom Roles & Rentals)')
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('عرض قائمة عناصر وأسعار المتجر الشامل')
    )
    .addSubcommand(sub =>
      sub.setName('buy-role')
        .setDescription('👑 شراء وتصميم رتبة خاصة باسمك ولونك المفضل (30 يوماً)')
        .addStringOption(opt => opt.setName('name').setDescription('اسم الرتبة الخاصة').setRequired(true))
        .addStringOption(opt => opt.setName('color').setDescription('لون الرتبة بصيغة HEX (مثال: #9333ea أو #ff0055)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('rent-room')
        .setDescription('🎙️ استئجار غرفة صوتية أو كتابية خاصة لمدة أسبوع')
        .addStringOption(opt =>
          opt.setName('type')
            .setDescription('نوع الغرفة المراد استئجارها')
            .setRequired(true)
            .addChoices(
              { name: '🔊 روم صوتي خاص (3,500 Gold)', value: 'voice' },
              { name: '💬 روم كتابي خاص (2,500 Gold)', value: 'text' }
            )
        )
        .addStringOption(opt => opt.setName('name').setDescription('اسم الروم').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('buy-cosmetic')
        .setDescription('🎨 شراء حزم المظهر وإطارات الهوية لبطاقة البروفايل')
        .addStringOption(opt =>
          opt.setName('item')
            .setDescription('العنصر المراد شراؤه وتفعيله')
            .setRequired(true)
            .addChoices(
              { name: '👑 إطار الذهب الملكي (1,500 Gold)', value: 'frame_gold' },
              { name: '🔮 إطار النيون الأرجواني (1,200 Gold)', value: 'frame_neon' },
              { name: '⭐ شارة العضو الملكي VIP (2,000 Gold)', value: 'badge_vip' }
            )
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const userCoins = db.getCoins(userId, guildId);

    // ─── 1. View Shop ───
    if (sub === 'view') {
      const embed = new EmbedBuilder()
        .setColor('#8b5cf6')
        .setTitle('🛒 متجر السيرفر الشامل والأدوات المخصصة')
        .setDescription(`مرحباً <@${userId}>! رصيدك الحالي: **${userCoins.toLocaleString()}** 🪙 ذهب.\nاختر ما يناسبك واشترِه مباشرة باستخدام أوامر السلاش أدناه:`)
        .addFields(
          {
            name: '👑 الرتب الخاصة (Custom Roles)',
            value: `• **رتبة مخصصة بالكامل (30 يوماً):** \`${SHOP_PRICES.custom_role_days_30.toLocaleString()}\` ذهب\n  *(تحدد اسمها ولونها الخاص HEX بالكامل وتُمنح لك تلقائياً)*\n  👉 الشراء: \`/shop buy-role name:اسم color:#hex\``,
            inline: false
          },
          {
            name: '🎙️ استئجار الغرف الخاصة (Room Rentals)',
            value: `• **استئجار روم صوتي خاص (7 أيام):** \`${SHOP_PRICES.rent_voice_room_days_7.toLocaleString()}\` ذهب\n• **استئجار روم كتابي خاص (7 أيام):** \`${SHOP_PRICES.rent_text_room_days_7.toLocaleString()}\` ذهب\n  👉 الشراء: \`/shop rent-room\``,
            inline: false
          },
          {
            name: '🎨 حزم المظهر وإطارات البروفايل (Cosmetics)',
            value: `• **إطار الذهب الملكي:** \`${SHOP_PRICES.avatar_frame_gold.toLocaleString()}\` ذهب\n• **إطار النيون الأرجواني:** \`${SHOP_PRICES.avatar_frame_neon.toLocaleString()}\` ذهب\n• **شارة VIP الملكية:** \`${SHOP_PRICES.badge_vip.toLocaleString()}\` ذهب\n  👉 الشراء: \`/shop buy-cosmetic\``,
            inline: false
          }
        )
        .setFooter({ text: 'Droplet Economy & Utility Store • تجديد الصلاحيات تلقائياً' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ─── 2. Buy Custom Role ───
    if (sub === 'buy-role') {
      const cost = SHOP_PRICES.custom_role_days_30;
      if (userCoins < cost) {
        return interaction.reply({ content: `❌ رصيدك غير كافٍ. تحتاج إلى \`${cost.toLocaleString()}\` ذهب، ورصيدك الحالي: \`${userCoins.toLocaleString()}\` ذهب.`, flags: 64 });
      }

      const roleName = interaction.options.getString('name').trim();
      let roleColor = interaction.options.getString('color').trim();
      if (!/^#[0-9A-Fa-f]{6}$/.test(roleColor)) {
        return interaction.reply({ content: '❌ صيغة اللون غير صحيحة! يجب أن تكون كود HEX مثل: `#7c3aed` أو `#ff0055`', flags: 64 });
      }

      await interaction.deferReply();

      // فحص إذا كان للعضو رتبة خاصة سابقة
      const existing = db.getUserCustomRole ? db.getUserCustomRole(guildId, userId) : null;
      if (existing) {
        return interaction.editReply({ content: `⚠️ لديك رتبة خاصة سابقة بالفعل (<@&${existing.role_id}>) تنتهي <t:${existing.expires_at}:R>.` });
      }

      try {
        const createdRole = await interaction.guild.roles.create({
          name: roleName,
          color: roleColor,
          reason: `شراء رتبة مخصصة بواسطة ${interaction.user.tag}`
        });

        await interaction.member.roles.add(createdRole).catch(() => {});

        // خصم الذهب وتسجيل الرتبة لمدة 30 يوماً
        db.removeCoins(userId, guildId, cost);
        const expiresAt = Math.floor(Date.now() / 1000) + (30 * 24 * 3600);
        db.addCustomRole(guildId, userId, createdRole.id, roleName, roleColor, null, expiresAt);

        const embed = new EmbedBuilder()
          .setColor(roleColor)
          .setTitle('🎉 تم إنشاء رتبتك الخاصة بنجاح!')
          .setDescription(`تهانينا <@${userId}>! تم إنشاء رتبتك الخاصة وإعطاؤها لك بنجاح.`)
          .addFields(
            { name: '🏷️ اسم الرتبة', value: `\`${roleName}\``, inline: true },
            { name: '🎨 اللون', value: `\`${roleColor}\``, inline: true },
            { name: '⏳ تنتهي الصلاحية', value: `<t:${expiresAt}:R>`, inline: true }
          )
          .setFooter({ text: 'Droplet Custom Role Store' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        return interaction.editReply({ content: `❌ فشل إنشاء الرتبة: ${err.message}. تأكد من صلاحيات البوت الإدارية.` });
      }
    }

    // ─── 3. Rent Channel ───
    if (sub === 'rent-room') {
      const type = interaction.options.getString('type');
      const name = interaction.options.getString('name').trim();
      const cost = type === 'voice' ? SHOP_PRICES.rent_voice_room_days_7 : SHOP_PRICES.rent_text_room_days_7;

      if (userCoins < cost) {
        return interaction.reply({ content: `❌ رصيدك غير كافٍ. التكلفة: \`${cost.toLocaleString()}\` ذهب، ورصيدك: \`${userCoins.toLocaleString()}\` ذهب.`, flags: 64 });
      }

      await interaction.deferReply();

      const existing = db.getUserRentedChannel ? db.getUserRentedChannel(guildId, userId) : null;
      if (existing) {
        return interaction.editReply({ content: `⚠️ لديك روم مستأجر بالفعل (<#${existing.channel_id}>) ينتهي <t:${existing.expires_at}:R>.` });
      }

      try {
        const channelType = type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
        const createdChannel = await interaction.guild.channels.create({
          name: `${type === 'voice' ? '🔊' : '💬'}┃${name}`,
          type: channelType,
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: [PermissionFlagsBits.ViewChannel]
            },
            {
              id: userId,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.Speak,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageChannels
              ]
            }
          ],
          reason: `استئجار غرفة خاصة بواسطة ${interaction.user.tag}`
        });

        // خصم الذهب وتسجيل الروم لمدة 7 أيام
        db.removeCoins(userId, guildId, cost);
        const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 3600);
        db.addRentedChannel(guildId, userId, createdChannel.id, type, name, expiresAt);

        const embed = new EmbedBuilder()
          .setColor('#10b981')
          .setTitle('🏠 تم استئجار الروم بنجاح!')
          .setDescription(`تم إنشاء وتجهيز غرفتك الخاصة: <#${createdChannel.id}>`)
          .addFields(
            { name: '📂 نوع الروم', value: type === 'voice' ? '🔊 صوتي' : '💬 كتابي', inline: true },
            { name: '💰 التكلفة المحسومة', value: `\`${cost.toLocaleString()}\` ذهب`, inline: true },
            { name: '⏳ ينتهي الاستئجار', value: `<t:${expiresAt}:R>`, inline: true }
          )
          .setFooter({ text: 'يمكنك التحكم بالصلاحيات وإدخال أصدقائك عبر إعدادات الروم' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        return interaction.editReply({ content: `❌ فشل إنشاء الروم: ${err.message}` });
      }
    }

    // ─── 4. Buy Cosmetic ───
    if (sub === 'buy-cosmetic') {
      const itemKey = interaction.options.getString('item');
      let cost = 0;
      let itemType = '';
      let itemName = '';

      if (itemKey === 'frame_gold') {
        cost = SHOP_PRICES.avatar_frame_gold;
        itemType = 'avatar_frame';
        itemName = 'إطار الذهب الملكي';
      } else if (itemKey === 'frame_neon') {
        cost = SHOP_PRICES.avatar_frame_neon;
        itemType = 'avatar_frame';
        itemName = 'إطار النيون الأرجواني';
      } else if (itemKey === 'badge_vip') {
        cost = SHOP_PRICES.badge_vip;
        itemType = 'badge';
        itemName = 'شارة VIP الملكية';
      }

      if (userCoins < cost) {
        return interaction.reply({ content: `❌ رصيدك غير كافٍ. التكلفة: \`${cost.toLocaleString()}\` ذهب، ورصيدك: \`${userCoins.toLocaleString()}\` ذهب.`, flags: 64 });
      }

      db.removeCoins(userId, guildId, cost);
      db.equipCosmetic(userId, itemType, itemKey, itemName);

      const embed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle('✨ تم شراء وتجهيز عنصر المظهر بنجاح!')
        .setDescription(`تم شراء وتفعيل **${itemName}** في بطاقة الهوية والبروفايل الخاصة بك!`)
        .addFields(
          { name: '🎁 العنصر', value: itemName, inline: true },
          { name: '💰 السعر', value: `\`${cost.toLocaleString()}\` ذهب`, inline: true },
          { name: '👤 المالك', value: `<@${userId}>`, inline: true }
        )
        .setFooter({ text: 'يظهر في ملفك الشخصي داخل اللوحة والسيرفر' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  }
};
