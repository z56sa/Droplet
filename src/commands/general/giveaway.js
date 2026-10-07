const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const ms = require('ms');
const db = require('../../database');
const config = require('../../config.json');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'giveaway',
  description: 'إنشاء وإدارة سحوبات القيف أواي المتقدمة (Giveaways Pro)',
  aliases: ['قيف_اواي', 'سحب', 'giveaways'],
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Manage advanced giveaways')
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('Start a new giveaway with optional requirements and perks')
        .addStringOption(opt => opt.setName('duration').setDescription('Giveaway duration (e.g. 10m, 1h, 1d)').setRequired(true))
        .addStringOption(opt => opt.setName('prize').setDescription('The prize').setRequired(true))
        .addIntegerOption(opt => opt.setName('winners').setDescription('Number of winners (default: 1)').setMinValue(1).setMaxValue(20).setRequired(false))
        .addChannelOption(opt => opt.setName('channel').setDescription('Giveaway channel').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addRoleOption(opt => opt.setName('required_role').setDescription('Role required to enter').setRequired(false))
        .addIntegerOption(opt => opt.setName('min_level').setDescription('Minimum level required to enter').setMinValue(1).setRequired(false))
        .addIntegerOption(opt => opt.setName('min_account_age').setDescription('Minimum account age in days (Anti-Alt)').setMinValue(1).setRequired(false))
        .addRoleOption(opt => opt.setName('extra_role').setDescription('Bonus role that grants double winning chance (x2)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('end')
        .setDescription('End a running giveaway and pick a winner instantly')
        .addStringOption(opt => opt.setName('message_id').setDescription('Giveaway message ID').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('reroll')
        .setDescription('Reroll and pick a new winner')
        .addStringOption(opt => opt.setName('message_id').setDescription('Giveaway message ID').setRequired(true))
        .addIntegerOption(opt => opt.setName('winners').setDescription('Number of new winners to draw').setMinValue(1).setRequired(false))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    const gid = interaction.guild.id;
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(gid, 'general.giveaway.no_perm'), flags: 64 });
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
        return interaction.reply({ content: t(gid, 'general.giveaway.invalid_duration'), flags: 64 });
      }

      const endsAt = Date.now() + durationMs;
      const endsTimestamp = Math.floor(endsAt / 1000);

      // بناء الشروط في الوصف
      const reqList = [];
      if (requiredRole) reqList.push(t(gid, 'general.giveaway.req_role', { role: `<@&${requiredRole.id}>` }));
      if (minLevel > 0) reqList.push(t(gid, 'general.giveaway.req_level', { level: minLevel }));
      if (minAccountAge > 0) reqList.push(t(gid, 'general.giveaway.req_age', { days: minAccountAge }));
      if (extraRole) reqList.push(t(gid, 'general.giveaway.req_extra', { role: `<@&${extraRole.id}>` }));

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(t(gid, 'general.giveaway.embed_title', { prize }))
        .setDescription([
          t(gid, 'general.giveaway.embed_line_join'),
          t(gid, 'general.giveaway.embed_line_winners', { count: winnersCount }),
          t(gid, 'general.giveaway.embed_line_ends', { ts: endsTimestamp }),
          t(gid, 'general.giveaway.embed_line_host', { user: `${interaction.user}` }),
          reqList.length > 0 ? t(gid, 'general.giveaway.embed_req_header', { reqs: reqList.join('\n') }) : ''
        ].filter(Boolean).join('\n'))
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/3112/3112946.png')
        .setFooter({ text: t(gid, 'general.giveaway.embed_footer') })
        .setTimestamp(endsAt);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('join_giveaway')
          .setLabel(t(gid, 'general.giveaway.btn_join', { count: 0 }))
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('view_giveaway_entries')
          .setLabel(t(gid, 'general.giveaway.btn_entries'))
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

      await interaction.reply({ content: t(gid, 'general.giveaway.launched', { channel: `<#${channel.id}>` }), flags: 64 });

      // تشغيل المؤقت
      setTimeout(() => {
        this.finishGiveaway(sent.id, client);
      }, durationMs);

    } else if (sub === 'end') {
      const messageId = interaction.options.getString('message_id');
      const giveaway = db.getGiveaway(messageId);

      if (!giveaway || giveaway.ended) {
        return interaction.reply({ content: t(gid, 'general.giveaway.end_not_found'), flags: 64 });
      }

      await this.finishGiveaway(messageId, client);
      await interaction.reply({ content: t(gid, 'general.giveaway.end_done'), flags: 64 });

    } else if (sub === 'reroll') {
      const messageId = interaction.options.getString('message_id');
      const customWinnersCount = interaction.options.getInteger('winners');
      const giveaway = db.getGiveaway(messageId);

      if (!giveaway) {
        return interaction.reply({ content: t(gid, 'general.giveaway.reroll_not_found'), flags: 64 });
      }

      const count = customWinnersCount || giveaway.winners_count || 1;
      const winners = await this.pickWinners(giveaway, count, client);
      const channel = client.channels.cache.get(giveaway.channel_id);

      if (!winners || winners.length === 0) {
        return interaction.reply({ content: t(gid, 'general.giveaway.reroll_empty'), flags: 64 });
      }

      const winnersText = winners.map(w => `<@${w}>`).join(', ');
      if (channel) {
        await channel.send({
          content: t(giveaway.guild_id, 'general.giveaway.reroll_announce', { prize: giveaway.prize, winners: winnersText, host: `<@${giveaway.hosted_by}>` })
        });
      }
      await interaction.reply({ content: t(gid, 'general.giveaway.reroll_done', { winners: winnersText }), flags: 64 });
    }
  },

  async finishGiveaway(messageId, client) {
    const giveaway = db.getGiveaway(messageId);
    if (!giveaway || giveaway.status === 'ended') return;

    db.endGiveaway(messageId);
    const gid = giveaway.guild_id;
    const channel = client.channels.cache.get(giveaway.channel_id);
    if (!channel) return;

    const message = await channel.messages.fetch(messageId).catch(() => null);
    const winners = await this.pickWinners(giveaway, giveaway.winners_count, client);

    const hostId = giveaway.host_id || giveaway.hosted_by;

    if (!winners || winners.length === 0) {
      const endedEmbed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle(t(gid, 'general.giveaway.finish_ended_title', { prize: giveaway.prize }))
        .setDescription(t(gid, 'general.giveaway.finish_ended_cancelled'))
        .setFooter({ text: t(gid, 'general.giveaway.finish_ended_footer') })
        .setTimestamp();

      if (message) {
        await message.edit({ embeds: [endedEmbed], components: [] }).catch(() => { });
      }
      return channel.send(t(gid, 'general.giveaway.finish_no_entries', { prize: giveaway.prize }));
    }

    const winnersMention = winners.map(w => `<@${w}>`).join(', ');

    const endedEmbed = new EmbedBuilder()
      .setColor('#2ECC71')
      .setTitle(t(gid, 'general.giveaway.finish_win_title', { prize: giveaway.prize }))
      .setDescription([
        t(gid, 'general.giveaway.finish_winners_line', { winners: winnersMention }),
        t(gid, 'general.giveaway.finish_host_line', { host: `<@${hostId}>` })
      ].join('\n'))
      .setThumbnail('https://cdn-icons-png.flaticon.com/512/3112/3112946.png')
      .setFooter({ text: t(gid, 'general.giveaway.finish_congrats_footer') })
      .setTimestamp();

    if (message) {
      await message.edit({ embeds: [endedEmbed], components: [] }).catch(() => { });
    }

    // إرسال إعلان الفوز
    await channel.send({
      content: t(gid, 'general.giveaway.finish_announce', { winners: winnersMention, prize: giveaway.prize, host: `<@${hostId}>` })
    });

    // إرسال رسالة خاصة DMs للفائزين
    for (const winnerId of winners) {
      try {
        const user = await client.users.fetch(winnerId).catch(() => null);
        if (user) {
          const dmEmbed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle(t(gid, 'general.giveaway.dm_title'))
            .setDescription(t(gid, 'general.giveaway.dm_desc', { user: user.username, prize: giveaway.prize, guild: channel.guild.name, host: `<@${hostId}>`, channel: `<#${channel.id}>` }))
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
