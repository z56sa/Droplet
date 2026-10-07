const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const ms = require('ms');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'giveaway',
  description: 'إنشاء وإدارة سحوبات القيف أواي المتقدمة (Giveaways Pro)',
  aliases: ['قيف_اواي', 'سحب', 'giveaways'],
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('إدارة سحوبات القيف أواي المتقدمة')
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('بدء قيف أواي جديد مع شروط ومكافآت اختيارية')
        .addStringOption(opt => opt.setName('duration').setDescription('مدة القيف أواي (مثال: 10m, 1h, 1d)').setRequired(true))
        .addStringOption(opt => opt.setName('prize').setDescription('الجائزة').setRequired(true))
        .addIntegerOption(opt => opt.setName('winners').setDescription('عدد الفائزين (افتراضي: 1)').setMinValue(1).setMaxValue(20).setRequired(false))
        .addChannelOption(opt => opt.setName('channel').setDescription('روم القيف أواي').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addRoleOption(opt => opt.setName('required_role').setDescription('رتبة إجبارية للمشاركة').setRequired(false))
        .addIntegerOption(opt => opt.setName('min_level').setDescription('أدنى مستوى مطلوب للاشتراك').setMinValue(1).setRequired(false))
        .addIntegerOption(opt => opt.setName('min_account_age').setDescription('الحد الأدنى لعمر الحساب بالأيام (Anti-Alt)').setMinValue(1).setRequired(false))
        .addRoleOption(opt => opt.setName('extra_role').setDescription('رتبة مميزة تمنح فرصة فوز مضاعفة (x2)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('end')
        .setDescription('إنهاء قيف أواي حالي واختيار الفائز فوراً')
        .addStringOption(opt => opt.setName('message_id').setDescription('أيدي رسالة القيف أواي').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('reroll')
        .setDescription('إعادة السحب واختيار فائز جديد')
        .addStringOption(opt => opt.setName('message_id').setDescription('أيدي رسالة القيف أواي').setRequired(true))
        .addIntegerOption(opt => opt.setName('winners').setDescription('عدد الفائزين الجدد المراد سحبهم').setMinValue(1).setRequired(false))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة السيرفر (Manage Server).', flags: 64 });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      const durationStr = interaction.options.getString('duration');
      const prize = interaction.options.getString('prize');
      const winnersCount = interaction.options.getInteger('winners') || 1;
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const requiredRole = interaction.options.getRole('required_role');
      const minLevel = interaction.options.getInteger('min_level') || 0;
      const minAccountAge = interaction.options.getInteger('min_account_age') || 0;
      const extraRole = interaction.options.getRole('extra_role');

      const durationMs = ms(durationStr);
      if (!durationMs || durationMs < 5000) {
        return interaction.reply({ content: '❌ المدة المحددة غير صحيحة. استخدم صيغة مثل: `10m`, `1h`, `2d`.', flags: 64 });
      }

      const endsAt = Date.now() + durationMs;
      const endsTimestamp = Math.floor(endsAt / 1000);

      // بناء الشروط في الوصف
      const reqList = [];
      if (requiredRole) reqList.push(`• 🛡️ **الرتبة المطلوبة:** <@&${requiredRole.id}>`);
      if (minLevel > 0) reqList.push(`• ⭐ **المستوى الأدنى:** \`Lv.${minLevel}\``);
      if (minAccountAge > 0) reqList.push(`• 📅 **عمر الحساب:** \`${minAccountAge} يوم أو أكثر\``);
      if (extraRole) reqList.push(`• 🔥 **فرصة مضاعفة (x2):** <@&${extraRole.id}>`);

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`🎉 **سحب قيف أواي: ${prize}** 🎉`)
        .setDescription([
          `اضغط على زر **🎉 اشتراك** للدخول في السحب فورياً!`,
          `\n🏆 **عدد الفائزين:** \`${winnersCount}\``,
          `⏰ **ينتهي في:** <t:${endsTimestamp}:R> (<t:${endsTimestamp}:F>)`,
          `👤 **مستضاف بواسطة:** ${interaction.user}`,
          reqList.length > 0 ? `\n📌 **شروط ومميزات الاشتراك:**\n${reqList.join('\n')}` : ''
        ].filter(Boolean).join('\n'))
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/3112/3112946.png')
        .setFooter({ text: 'Droplet Giveaways • انقر للاشتراك أو المغادرة' })
        .setTimestamp(endsAt);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('join_giveaway')
          .setLabel('🎉 اشتراك (0)')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('view_giveaway_entries')
          .setLabel('👥 المشتركين')
          .setStyle(ButtonStyle.Secondary)
      );

      const sent = await channel.send({ embeds: [embed], components: [row] });
      db.createGiveaway(
        sent.id,
        channel.id,
        interaction.guild.id,
        prize,
        winnersCount,
        endsAt,
        interaction.user.id,
        requiredRole ? requiredRole.id : null,
        minLevel,
        minAccountAge,
        extraRole ? extraRole.id : null
      );

      await interaction.reply({ content: `✅ **تم إطلاق القيف أواي بنجاح في:** <#${channel.id}>`, flags: 64 });

      // تشغيل المؤقت
      setTimeout(() => {
        this.finishGiveaway(sent.id, client);
      }, durationMs);

    } else if (sub === 'end') {
      const messageId = interaction.options.getString('message_id');
      const giveaway = db.getGiveaway(messageId);

      if (!giveaway || giveaway.ended) {
        return interaction.reply({ content: '❌ هذا القيف أواي غير موجود أو انتهى مسبقاً.', flags: 64 });
      }

      await this.finishGiveaway(messageId, client);
      await interaction.reply({ content: '✅ تم إنهاء القيف أواي واختيار الفائزين بنجاح.', flags: 64 });

    } else if (sub === 'reroll') {
      const messageId = interaction.options.getString('message_id');
      const customWinnersCount = interaction.options.getInteger('winners');
      const giveaway = db.getGiveaway(messageId);

      if (!giveaway) {
        return interaction.reply({ content: '❌ لم يتم العثور على القيف أواي المطلوب.', flags: 64 });
      }

      const count = customWinnersCount || giveaway.winners_count || 1;
      const winners = await this.pickWinners(giveaway, count, client);
      const channel = client.channels.cache.get(giveaway.channel_id);

      if (!winners || winners.length === 0) {
        return interaction.reply({ content: '❌ لا يوجد مشتركون مؤهلون متاحون لإعادة السحب.', flags: 64 });
      }

      const winnersText = winners.map(w => `<@${w}>`).join(', ');
      if (channel) {
        await channel.send({
          content: `🎲 **إعادة السحب (Reroll)!**\n🎉 الفائز الجديد بالجائزة **${giveaway.prize}** هو: ${winnersText}! 🥳\nمبارك لك! تواصل مع <@${giveaway.hosted_by}> لاستلام جائزتك.`
        });
      }
      await interaction.reply({ content: `✅ تم إعادة السحب واختيار الفائز: ${winnersText}`, flags: 64 });
    }
  },

  async finishGiveaway(messageId, client) {
    const giveaway = db.getGiveaway(messageId);
    if (!giveaway || giveaway.status === 'ended') return;

    db.endGiveaway(messageId);
    const channel = client.channels.cache.get(giveaway.channel_id);
    if (!channel) return;

    const message = await channel.messages.fetch(messageId).catch(() => null);
    const winners = await this.pickWinners(giveaway, giveaway.winners_count, client);

    const hostId = giveaway.host_id || giveaway.hosted_by;

    if (!winners || winners.length === 0) {
      const endedEmbed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle(`🎉 **انتهى السحب: ${giveaway.prize}**`)
        .setDescription('❌ **لم يشترك عدد كافٍ من الأعضاء المؤهلين، تم إلغاء السحب.**')
        .setFooter({ text: 'Droplet Giveaways • انتهى السحب' })
        .setTimestamp();

      if (message) {
        await message.edit({ embeds: [endedEmbed], components: [] }).catch(() => { });
      }
      return channel.send(`⚠️ انتهى وقت القيف أواي على **${giveaway.prize}** دون وجود مشتركين مؤهلين.`);
    }

    const winnersMention = winners.map(w => `<@${w}>`).join(', ');

    const endedEmbed = new EmbedBuilder()
      .setColor('#2ECC71')
      .setTitle(`🎊 **انتهى القيف أواي: ${giveaway.prize}** 🎊`)
      .setDescription([
        `🏆 **الفائزون بالجائزة:** ${winnersMention}`,
        `👤 **مستضاف بواسطة:** <@${hostId}>`
      ].join('\n'))
      .setThumbnail('https://cdn-icons-png.flaticon.com/512/3112/3112946.png')
      .setFooter({ text: 'مبروك للفائزين! 🎉' })
      .setTimestamp();

    if (message) {
      await message.edit({ embeds: [endedEmbed], components: [] }).catch(() => { });
    }

    // إرسال إعلان الفوز
    await channel.send({
      content: `🥳 **ألف مبروك ${winnersMention}!** لقد فزتم بسحب **${giveaway.prize}**! 🎁\nتواصلوا مع المستضيف <@${hostId}> لتستلم الجائزة.`
    });

    // إرسال رسالة خاصة DMs للفائزين
    for (const winnerId of winners) {
      try {
        const user = await client.users.fetch(winnerId).catch(() => null);
        if (user) {
          const dmEmbed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('🎁 مبروك! لقد فزت في سحب القيف أواي!')
            .setDescription(`🎉 تهانينا يا **${user.username}**! لقد فزت بـ **${giveaway.prize}** في سيرفر **${channel.guild.name}**!\n\n👑 **المستضيف:** <@${hostId}>\n💬 **القناة:** <#${channel.id}>`)
            .setTimestamp();
          await user.send({ embeds: [dmEmbed] }).catch(() => { });
        }
      } catch { }
    }
  },


  async pickWinners(giveaway, count, client) {
    const rawEntries = db.getGiveawayEntries(giveaway.message_id);
    if (!rawEntries || rawEntries.length === 0) return [];

    const guild = client.guilds.cache.get(giveaway.guild_id);
    const pool = [];

    for (const userId of rawEntries) {
      let weight = 1;

      // تحقق من الشروط إن وجدت
      if (guild) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) continue; // العضو غادر السيرفر

        if (giveaway.required_role && !member.roles.cache.has(giveaway.required_role)) {
          continue; // لا يملك الرتبة المطلوبة
        }

        if (giveaway.min_account_age > 0) {
          const ageDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
          if (ageDays < giveaway.min_account_age) continue;
        }

        if (giveaway.min_level > 0) {
          const userDb = db.getUser(userId, guild.id);
          if ((userDb.level || 0) < giveaway.min_level) continue;
        }

        // رتبة الفرصة المضاعفة
        if (giveaway.extra_role && member.roles.cache.has(giveaway.extra_role)) {
          weight = 2; // فرصة x2
        }
      }

      for (let i = 0; i < weight; i++) {
        pool.push(userId);
      }
    }

    if (pool.length === 0) return [];

    const selectedWinners = new Set();
    const shuffled = pool.sort(() => 0.5 - Math.random());

    for (const uid of shuffled) {
      selectedWinners.add(uid);
      if (selectedWinners.size >= count) break;
    }

    return Array.from(selectedWinners);
  }
};
