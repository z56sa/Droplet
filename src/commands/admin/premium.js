const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'premium',
  description: 'إدارة وتفعيل اشتراك البريميوم للسيرفر',
  aliases: ['بريميوم', 'vip'],
  data: new SlashCommandBuilder()
    .setName('premium')
    .setDescription('View status or redeem a Droplet Premium key')
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Check server premium status and features')
    )
    .addSubcommand(sub =>
      sub.setName('redeem')
        .setDescription('Redeem a Droplet Premium activation key')
        .addStringOption(opt =>
          opt.setName('key')
            .setDescription('Enter your premium key code (e.g. DROPLET-PRO-XXXX-XXXX)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('generate')
        .setDescription('Generate a premium key (Bot Owner Only)')
        .addIntegerOption(opt =>
          opt.setName('days')
            .setDescription('Duration in days (0 for lifetime)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('tier')
            .setDescription('Tier: pro or elite')
            .setRequired(false)
            .addChoices(
              { name: 'Pro Tier', value: 'pro' },
              { name: 'Elite Tier', value: 'elite' }
            )
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const ownerId = process.env.OWNER_ID || config.ownerId || '1178342841882267744';

    if (sub === 'status') {
      const isPrem = db.isGuildPremium(guild.id);
      const info = db.getPremiumGuildInfo(guild.id);

      const embed = new EmbedBuilder()
        .setColor(isPrem ? '#f1c40f' : '#34495e')
        .setTitle(isPrem ? '👑 اشتراك السيرفر: بريميوم نَشِط' : '🛡️ اشتراك السيرفر: الخطة المجانية')
        .setDescription(
          isPrem
            ? `✨ **هذا السيرفر مُميز ويتمتع بجميع ميزات Droplet Premium!**\n\n` +
              `> 🌟 **الباقة:** \`${(info?.tier || 'pro').toUpperCase()}\`\n` +
              `> ⏳ **ينتهي في:** ${info?.expires_at ? `<t:${info.expires_at}:R> (<t:${info.expires_at}:f>)` : '**مدى الحياة (Lifetime) ♾️**'}\n` +
              `> 👤 **تم التفعيل بواسطة:** <@${info?.activated_by || 'Unknown'}>\n\n` +
              `**الميزات المتاحة لسيرفرك:**\n` +
              `• تذاكر بأقسام غير محدودة مع حفظ سجلات الـ Transcripts\n` +
              `• ردود تلقائية موسعة\n` +
              `• كروت مستوى وخبرة (XP) مخصصة\n` +
              `• حماية ضد الغزو (Anti-Raid) متقدمة\n` +
              `• تقارير وشيفتات الإدارة وترقيات الستاف\n` +
              `• سجلات أمان وإشراف كاملة وفورية`
            : `هذا السيرفر يستخدم حالياً **الخطة المجانية (Free Tier)**.\n\n` +
              `**لترقية السيرفر والاستفادة من الميزات المتقدمة:**\n` +
              `1. احصل على مفتاح تفعيل من مالك البوت أو متجر الدعم.\n` +
              `2. استخدم الأمر \`/premium redeem key:YOUR_KEY\` لتفعيل الاشتراك فوراً!`
        )
        .setFooter({ text: 'Droplet Premium System • نظام الاشتراك المميز' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'redeem') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && interaction.user.id !== ownerId) {
        return interaction.reply({ content: '❌ تحتاج إلى صلاحية **إدارة السيرفر (Manage Server)** لتفعيل مفتاح البريميوم.', flags: 64 });
      }

      const key = interaction.options.getString('key');
      const res = db.redeemPremiumKey(key, guild.id, interaction.user.id);

      if (!res.success) {
        if (res.reason === 'INVALID_KEY') {
          return interaction.reply({ content: '❌ مفتاح التفعيل غير صحيح! تأكد من نسخه بشكل سليم.', flags: 64 });
        }
        if (res.reason === 'ALREADY_USED') {
          return interaction.reply({ content: '⚠️ تم استخدام هذا المفتاح مسبقاً في سيرفر آخر.', flags: 64 });
        }
        return interaction.reply({ content: '❌ حدث خطأ أثناء محاولة التفعيل، يرجى المحاولة لاحقاً.', flags: 64 });
      }

      const expiryText = res.durationDays > 0 ? `لمدة **${res.durationDays} يوم** (<t:${res.expiresAt}:R>)` : '**مدى الحياة (Lifetime) ♾️**';

      const successEmbed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle('🎉 تم تفعيل Droplet Premium بنجاح!')
        .setDescription(
          `تهانينا! أصبح سيرفر **${guild.name}** مفعّلاً بباقة **${res.tier.toUpperCase()}** ${expiryText}.\n\n` +
          `تم فتح جميع الميزات المتقدمة لك ولوحة التحكم فوراً.`
        )
        .setThumbnail(guild.iconURL({ dynamic: true }) || null)
        .setFooter({ text: 'Droplet Premium • شكرًا لدعمكم' })
        .setTimestamp();

      return interaction.reply({ embeds: [successEmbed] });
    }

    if (sub === 'generate') {
      if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '⛔ هذا الأمر مخصص لمالك البوت فقط.', flags: 64 });
      }

      const days = interaction.options.getInteger('days');
      const tier = interaction.options.getString('tier') || 'pro';
      const keyCode = db.createPremiumKey(days, interaction.user.id, tier);

      if (!keyCode) {
        return interaction.reply({ content: '❌ فشل في إنشاء مفتاح البريميوم.', flags: 64 });
      }

      const durationStr = days === 0 ? 'مدى الحياة (Lifetime)' : `${days} يوم`;
      return interaction.reply({
        content: `✅ **تم إنشاء مفتاح بريميوم جديد بنجاح:**\n\`\`\`${keyCode}\`\`\`\n• **الباقة:** \`${tier.toUpperCase()}\`\n• **المدة:** ${durationStr}\n> شارك هذا الكود مع العميل لتفعيله عبر الأمر \`/premium redeem\`.`,
        flags: 64
      });
    }
  }
};
