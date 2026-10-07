const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

const clearCooldowns = new Map();
const CLEAR_COOLDOWN_MS = 3000;

module.exports = {
  name: 'clear',
  description: 'حذف رسائل متعددة مع فلاتر متقدمة',
  aliases: ['purge', 'حذف'],
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete messages from the channel')

    .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
    .addUserOption(opt => opt.setName('target').setDescription('Delete messages from a specific member only').setRequired(false))
    .addStringOption(opt => opt.setName('filter').setDescription('Message type filter').setRequired(false)
      .addChoices(
        { name: '🤖 Bot messages only', value: 'bots' },
        { name: '🔗 Messages with links', value: 'links' },
        { name: '🖼️ Messages with images/files', value: 'images' }
      ))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild?.id);
    // تأكد أن الأمر يُستخدم داخل سيرفر
    if (!interaction.guild || !interaction.member)
      return interaction.reply({ content: t(lang, 'moderation.clear.guild_only'), flags: 64 });

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return interaction.reply({ content: t(lang, 'moderation.clear.no_perm'), flags: 64 });

    // وقت انتظار (Cooldown) 3 ثواني
    const userId = interaction.user.id;
    const now = Date.now();
    const lastUsed = clearCooldowns.get(userId) || 0;
    if (now - lastUsed < CLEAR_COOLDOWN_MS) {
      const remaining = ((CLEAR_COOLDOWN_MS - (now - lastUsed)) / 1000).toFixed(1);
      return interaction.reply({ content: t(lang, 'moderation.clear.cooldown', { remaining }), flags: 64 });
    }
    clearCooldowns.set(userId, now);

    await interaction.deferReply({ flags: 64 }).catch(() => {});

    const amount = interaction.options.getInteger('amount');
    const targetUser = interaction.options.getUser('target');
    const filter = interaction.options.getString('filter');

    try {
      let messages = await interaction.channel.messages.fetch({ limit: 100 });
      // فلترة حسب الخيارات
      if (targetUser) messages = messages.filter(m => m.author.id === targetUser.id);
      if (filter === 'bots') messages = messages.filter(m => m.author.bot);
      if (filter === 'links') messages = messages.filter(m => /(https?:\/\/[^\s]+)/.test(m.content));
      if (filter === 'images') messages = messages.filter(m => m.attachments.size > 0);

      const toDelete = [...messages.values()].slice(0, amount);

      if (!toDelete.length)
        return interaction.editReply({ content: t(lang, 'moderation.clear.no_match') });

      const deleted = await interaction.channel.bulkDelete(toDelete, true);
      const resultEmbed = new EmbedBuilder()
        .setColor(config.colors?.success || '#2ecc71')
        .setTitle(t(lang, 'moderation.clear.title'))
        .addFields(
          { name: t(lang, 'moderation.clear.field_count'), value: `${deleted.size}`, inline: true },
          { name: t(lang, 'moderation.clear.field_channel'), value: `<#${interaction.channel.id}>`, inline: true },
          { name: t(lang, 'moderation.clear.field_by'), value: interaction.user.tag, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [resultEmbed] });
    } catch (err) {
      await interaction.editReply({ content: t(lang, 'moderation.clear.error') });
    }
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild?.id);
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply(t(lang, 'moderation.clear.prefix_no_perm'));

    const amount = parseInt(args[0], 10);
    if (isNaN(amount) || amount < 1 || amount > 100)
      return message.reply(t(lang, 'moderation.clear.prefix_usage'));

    const targetUser = message.mentions.users.first();
    await message.delete().catch(() => {});

    let messages = await message.channel.messages.fetch({ limit: 100 });
    if (targetUser) messages = messages.filter(m => m.author.id === targetUser.id);

    const toDelete = [...messages.values()].slice(0, amount);
    if (!toDelete.length) {
      const reply = await message.channel.send(t(lang, 'moderation.clear.prefix_empty'));
      setTimeout(() => reply.delete().catch(() => {}), 3000);
      return;
    }

    const deleted = await message.channel.bulkDelete(toDelete, true).catch(() => null);
    const reply = await message.channel.send(t(lang, 'moderation.clear.prefix_done', { count: deleted?.size || 0 }));
    setTimeout(() => reply.delete().catch(() => {}), 3000);
  }
};
