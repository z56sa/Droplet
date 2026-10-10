const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ms = require('ms');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'ban',
  description: 'حظر عضو من السيرفر مع خيارات متقدمة',
  aliases: ['حظر', 'ban'],
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')

    .addUserOption(opt => opt.setName('target').setDescription('The member to ban').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Ban reason').setRequired(false))
    .addStringOption(opt => opt.setName('duration').setDescription('Temporary ban duration (e.g. 1h, 1d, 7d) — leave empty for permanent').setRequired(false))
    .addIntegerOption(opt => opt.setName('delete_days').setDescription('Delete member messages (in days)').setRequired(false)
      .addChoices({ name: "Don't delete", value: 0 }, { name: 'Last day', value: 1 }, { name: 'Last 7 days', value: 7 }))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild?.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers))
      return interaction.reply({ content: t(lang, 'moderation.ban.no_perm'), flags: 64 });

    await interaction.deferReply({ flags: 64 }).catch(() => {});

    const targetUser  = interaction.options.getUser('target');
    const reason      = interaction.options.getString('reason') || t(lang, 'moderation.ban.default_reason');
    const durationStr = interaction.options.getString('duration');
    const deleteDays  = interaction.options.getInteger('delete_days') ?? 0;

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (member && !member.bannable)
      return interaction.editReply({ content: t(lang, 'moderation.ban.not_bannable') });

    if (member && member.id === interaction.user.id)
      return interaction.editReply({ content: t(lang, 'moderation.ban.self') });

    // إرسال DM قبل الحظر مع رابط تقديم الاستئناف
    const durationMs = durationStr ? ms(durationStr) : null;
    const baseUrl = process.env.DASHBOARD_URL || config.dashboardUrl || 'https://zeno-dashboard.onrender.com';
    const appealUrl = `${baseUrl}/appeal`;

    const dmEmbed = new EmbedBuilder()
      .setColor(config.colors?.danger || '#e74c3c')
      .setTitle(t(lang, 'moderation.ban.dm_title', { guild: interaction.guild.name }))
      .setDescription(t(lang, 'moderation.ban.dm_desc', { appealUrl }))
      .addFields(
        { name: t(lang, 'moderation.ban.field_reason'), value: reason, inline: false },
        { name: t(lang, 'moderation.ban.field_duration'), value: durationStr ? durationStr : t(lang, 'moderation.ban.permanent'), inline: true },
        { name: t(lang, 'moderation.ban.field_by'), value: interaction.user.tag, inline: true }
      )
      .setFooter({ text: 'Droplet Security & Unban Appeal System' })
      .setTimestamp();

    if (member) await member.send({ embeds: [dmEmbed] }).catch(() => {});

    try {
      await interaction.guild.bans.create(targetUser.id, {
        reason: t(lang, 'moderation.ban.audit_by', { reason, tag: interaction.user.tag }),
        deleteMessageSeconds: deleteDays * 86400
      });
    } catch {
      return interaction.editReply({ content: t(lang, 'moderation.ban.no_perm') }).catch(() => {});
    }

    if (db.recordStaffAction) {
      db.recordStaffAction(interaction.guild.id, interaction.user.id, 'ban', targetUser.id, reason, durationStr || 'دائم');
    }

    const banEmbed = new EmbedBuilder()
      .setColor(config.colors?.danger || '#e74c3c')
      .setTitle(t(lang, durationMs ? 'moderation.ban.title_temp' : 'moderation.ban.title_perm'))
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: t(lang, 'moderation.ban.field_member'), value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
        { name: t(lang, 'moderation.ban.field_mod'), value: interaction.user.tag, inline: true },
        { name: t(lang, 'moderation.ban.field_duration'), value: durationStr || t(lang, 'moderation.ban.permanent'), inline: true },
        { name: t(lang, 'moderation.ban.field_reason'), value: reason, inline: false }
      )
      .setTimestamp();

    await interaction.deleteReply().catch(() => {});
    await interaction.channel.send({ embeds: [banEmbed] }).catch(async () => {
      await interaction.editReply({ embeds: [banEmbed] }).catch(() => {});
    });
    this.sendToLog(interaction.guild, banEmbed);

    // رفع الحظر المؤقت بعد المدة
    if (durationMs) {
      const guildId = interaction.guild.id;
      setTimeout(async () => {
        await interaction.guild.bans.remove(targetUser.id, t(guildId, 'moderation.ban.unban_audit')).catch(() => {});
        const unbanEmbed = new EmbedBuilder()
          .setColor(config.colors?.success || '#2ecc71')
          .setTitle(t(guildId, 'moderation.ban.unban_title'))
          .setDescription(t(guildId, 'moderation.ban.unban_desc', { tag: targetUser.tag }))
          .setTimestamp();
        const logSettings = db.getGuildSettings(interaction.guild.id);
        if (logSettings?.log_channel) {
          const logCh = interaction.guild.channels.cache.get(logSettings.log_channel);
          if (logCh) logCh.send({ embeds: [unbanEmbed] }).catch(() => {});
        }
      }, durationMs);
    }
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild?.id);
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply(t(lang, 'moderation.ban.no_perm'));

    const targetUser = message.mentions.users.first() ||
      (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    if (!targetUser) return message.reply(t(lang, 'moderation.ban.prefix_target'));

    const reason = args.slice(1).join(' ') || t(lang, 'moderation.ban.default_reason');
    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);

    if (member && !member.bannable) return message.reply(t(lang, 'moderation.ban.prefix_not_bannable'));

    if (member) await member.send(t(lang, 'moderation.ban.prefix_dm', { guild: message.guild.name, reason })).catch(() => {});

    await message.guild.bans.create(targetUser.id, { reason: t(lang, 'moderation.ban.audit_by', { reason, tag: message.author.tag }) });

    const embed = new EmbedBuilder()
      .setColor(config.colors?.danger || '#e74c3c')
      .setTitle(t(lang, 'moderation.ban.prefix_title'))
      .addFields(
        { name: t(lang, 'moderation.ban.field_member'), value: `${targetUser.tag}`, inline: true },
        { name: t(lang, 'moderation.ban.field_by'), value: message.author.tag, inline: true },
        { name: t(lang, 'moderation.ban.field_reason'), value: reason, inline: false }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    this.sendToLog(message.guild, embed);
  },

  sendToLog(guild, embed) {
    const settings = db.getGuildSettings(guild.id);
    if (settings?.log_channel) {
      const ch = guild.channels.cache.get(settings.log_channel);
      if (ch) ch.send({ embeds: [embed] }).catch(() => {});
    }
  }
};
