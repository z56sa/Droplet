const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { t } = require('../../utils/lang');

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
    .setDescription('🛒 Server shop & custom tools')

    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View shop items and prices')

    )
    .addSubcommand(sub =>
      sub.setName('buy-role')
        .setDescription('👑 Buy a custom role (30 days)')

        .addStringOption(opt => opt.setName('name').setDescription('Custom role name').setRequired(true))
        .addStringOption(opt => opt.setName('color').setDescription('Role color as HEX (e.g. #9333ea)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('buy-cosmetic')
        .setDescription('🎨 Buy profile cosmetics')

        .addStringOption(opt =>
          opt.setName('item')
            .setDescription('Item to buy')

            .setRequired(true)
            .addChoices(
              { name: '👑 Royal gold frame (1,500 Gold)', value: 'frame_gold' },
              { name: '🔮 Neon frame (1,200 Gold)', value: 'frame_neon' },
              { name: '⭐ Royal VIP member badge (2,000 Gold)', value: 'badge_vip' }
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
      const settings = db.getGuildSettings ? db.getGuildSettings(guildId) : {};
      let customProducts = [];
      try {
        if (settings?.custom_products) {
          customProducts = typeof settings.custom_products === 'string' ? JSON.parse(settings.custom_products) : settings.custom_products;
        }
      } catch(e) {}
      if (!Array.isArray(customProducts)) customProducts = [];

      const fields = [
        {
          name: t(guildId, 'economy.shop.view_roles_title'),
          value: t(guildId, 'economy.shop.view_roles_value', { price: SHOP_PRICES.custom_role_days_30.toLocaleString() }),
          inline: false
        },
        {
          name: t(guildId, 'economy.shop.view_cos_title'),
          value: t(guildId, 'economy.shop.view_cos_value', { gold: SHOP_PRICES.avatar_frame_gold.toLocaleString(), neon: SHOP_PRICES.avatar_frame_neon.toLocaleString(), vip: SHOP_PRICES.badge_vip.toLocaleString() }),
          inline: false
        }
      ];

      if (customProducts.length > 0) {
        const prodLines = customProducts.map((p, idx) => {
          const emoji = p.emoji || '🛍️';
          const name = p.name || `منتج #${idx + 1}`;
          const price = Number(p.price || 0).toLocaleString();
          const desc = p.description || p.desc ? ` - *${p.description || p.desc}*` : '';
          return `${emoji} **${name}**: **${price}** Gold 🪙${desc}`;
        });
        fields.push({
          name: '🎁 منتجات السيرفر المخصصة',
          value: prodLines.join('\n').slice(0, 1024),
          inline: false
        });
      }

      const embed = new EmbedBuilder()
        .setColor('#8b5cf6')
        .setTitle(t(guildId, 'economy.shop.view_title'))
        .setDescription(t(guildId, 'economy.shop.view_desc', { user: userId, coins: userCoins.toLocaleString() }))
        .addFields(fields)
        .setFooter({ text: t(guildId, 'economy.shop.footer') })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ─── 2. Buy Custom Role ───
    if (sub === 'buy-role') {
      const cost = SHOP_PRICES.custom_role_days_30;
      if (userCoins < cost) {
        return interaction.reply({ content: t(guildId, 'economy.shop.role_insufficient', { cost: cost.toLocaleString(), coins: userCoins.toLocaleString() }), flags: 64 });
      }

      const roleName = interaction.options.getString('name').trim();
      let roleColor = interaction.options.getString('color').trim();
      if (!/^#[0-9A-Fa-f]{6}$/.test(roleColor)) {
        return interaction.reply({ content: t(guildId, 'economy.shop.role_badcolor'), flags: 64 });
      }

      await interaction.deferReply();

      // فحص إذا كان للعضو رتبة خاصة سابقة
      const existing = db.getUserCustomRole ? db.getUserCustomRole(guildId, userId) : null;
      if (existing) {
        return interaction.editReply({ content: t(guildId, 'economy.shop.role_existing', { role: existing.role_id, expiry: `<t:${existing.expires_at}:R>` }) });
      }

      try {
        const createdRole = await interaction.guild.roles.create({
          name: roleName,
          color: roleColor,
          reason: t(guildId, 'economy.shop.role_reason', { tag: interaction.user.tag })
        });

        await interaction.member.roles.add(createdRole).catch(() => {});

        // خصم الذهب وتسجيل الرتبة لمدة 30 يوماً
        db.removeCoins(userId, guildId, cost);
        const expiresAt = Math.floor(Date.now() / 1000) + (30 * 24 * 3600);
        db.addCustomRole(guildId, userId, createdRole.id, roleName, roleColor, null, expiresAt);

        const embed = new EmbedBuilder()
          .setColor(roleColor)
          .setTitle(t(guildId, 'economy.shop.role_created_title'))
          .setDescription(t(guildId, 'economy.shop.role_created_desc', { user: userId }))
          .addFields(
            { name: t(guildId, 'economy.shop.role_name_field'), value: `\`${roleName}\``, inline: true },
            { name: t(guildId, 'economy.shop.role_color_field'), value: `\`${roleColor}\``, inline: true },
            { name: t(guildId, 'economy.shop.role_expires_field'), value: `<t:${expiresAt}:R>`, inline: true }
          )
          .setFooter({ text: t(guildId, 'economy.shop.role_footer') })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        return interaction.editReply({ content: t(guildId, 'economy.shop.role_fail', { err: err.message }) });
      }
    }

    // ─── 3. Buy Cosmetic ───
    if (sub === 'buy-cosmetic') {
      const itemKey = interaction.options.getString('item');
      let cost = 0;
      let itemType = '';
      let itemName = '';

      if (itemKey === 'frame_gold') {
        cost = SHOP_PRICES.avatar_frame_gold;
        itemType = 'avatar_frame';
        itemName = t(guildId, 'economy.shop.item_frame_gold');
      } else if (itemKey === 'frame_neon') {
        cost = SHOP_PRICES.avatar_frame_neon;
        itemType = 'avatar_frame';
        itemName = t(guildId, 'economy.shop.item_frame_neon');
      } else if (itemKey === 'badge_vip') {
        cost = SHOP_PRICES.badge_vip;
        itemType = 'badge';
        itemName = t(guildId, 'economy.shop.item_badge_vip');
      }

      if (userCoins < cost) {
        return interaction.reply({ content: t(guildId, 'economy.shop.cosmetic_insufficient', { cost: cost.toLocaleString(), coins: userCoins.toLocaleString() }), flags: 64 });
      }

      db.removeCoins(userId, guildId, cost);
      db.equipCosmetic(userId, itemType, itemKey, itemName);

      const embed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle(t(guildId, 'economy.shop.cosmetic_title'))
        .setDescription(t(guildId, 'economy.shop.cosmetic_desc', { item: itemName }))
        .addFields(
          { name: t(guildId, 'economy.shop.cosmetic_item_field'), value: itemName, inline: true },
          { name: t(guildId, 'economy.shop.cosmetic_price_field'), value: `\`${cost.toLocaleString()}\` ذهب`, inline: true },
          { name: t(guildId, 'economy.shop.cosmetic_owner_field'), value: `<@${userId}>`, inline: true }
        )
        .setFooter({ text: t(guildId, 'economy.shop.cosmetic_footer') })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  }
};
