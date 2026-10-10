const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');
const { isEnabled } = require('../../utils/isEnabled');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('تقديم اقتراح أو فكرة لتطوير السيرفر 💡')
    .addStringOption(option =>
      option.setName('content')
        .setDescription('محتوى وتفاصيل الاقتراح')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('title')
        .setDescription('عنوان مختصر للاقتراح (اختياري)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('category')
        .setDescription('تصنيف الاقتراح')
        .setRequired(false)
        .addChoices(
          { name: '💡 General', value: 'عام' },
          { name: '🎉 Events', value: 'فعاليات' },
          { name: '🎖️ Roles', value: 'رتب' },
          { name: '💬 Channels', value: 'رومات' },
          { name: '🤖 Bot features', value: 'بوت' },
          { name: '⚠️ Complaint', value: 'شكوى' }
        )),

  name: 'suggest',
  description: 'تقديم اقتراح أو فكرة لتطوير السيرفر 💡',
  aliases: ['اقتراح', 'suggestion'],

  async execute(interactionOrMessage, args) {
    const isSlash = !!interactionOrMessage.isChatInputCommand;
    const guild = interactionOrMessage.guild;
    const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;

    // فوراً تأجيل الرد لأمر السلاش لتجنب انتهاء مهلة الـ 3 ثواني أو خطأ 40060
    if (isSlash) {
      await interactionOrMessage.deferReply({ flags: 64 }).catch(() => {});
    }

    const safeReply = async (msg) => {
      if (isSlash) {
        if (interactionOrMessage.deferred || interactionOrMessage.replied) {
          return interactionOrMessage.editReply({ content: msg }).catch(() => {});
        }
        return interactionOrMessage.reply({ content: msg, flags: 64 }).catch(() => {});
      }
      return interactionOrMessage.reply(msg).catch(() => {});
    };

    const settings = db.getGuildSettings(guild.id);
    if (!isEnabled(settings.suggestions_enabled, true)) {
      return safeReply(t(guild.id, 'general.suggest.disabled'));
    }

    let content = '';
    let title = null;
    let category = 'عام';

    if (isSlash) {
      content = interactionOrMessage.options.getString('content');
      title = interactionOrMessage.options.getString('title') || null;
      category = interactionOrMessage.options.getString('category') || 'عام';
    } else {
      if (!args || args.length === 0) {
        return safeReply(t(guild.id, 'general.suggest.no_content'));
      }
      content = args.join(' ');
    }

    const channelId = settings.suggestions_channel || interactionOrMessage.channel.id;
    const targetChannel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);

    if (!targetChannel || !targetChannel.isTextBased()) {
      return safeReply(t(guild.id, 'general.suggest.no_channel'));
    }

    const { buildSuggestionEmbed, buildSuggestionComponents } = require('../../utils/suggestionBuilder');
    const suggCode = Math.random().toString(36).substring(2, 11);
    const lang = getGuildLang(guild.id);

    const suggEmbed = buildSuggestionEmbed({
      user,
      content,
      title,
      code: suggCode,
      status: 'pending',
      upvotes: 0,
      downvotes: 0,
      createdAt: Date.now(),
      lang
    });

    const components = buildSuggestionComponents({
      upvotes: 0,
      downvotes: 0,
      lang
    });

    try {
      const _m = String(settings.suggestion_mode || 'embed').toLowerCase();
      const _line = settings.suggestions_line || '';
      const sentMsg = _m === 'text'
        ? await targetChannel.send({ content: `💡 **${title ? title + '\n' : ''}**${content}${_line ? `\n${_line}` : ''}` })
        : await targetChannel.send({ embeds: [suggEmbed], components });

      if (isEnabled(settings.suggestions_auto_thread, false)) {
        sentMsg.startThread({
          name: title ? t(guild.id, 'general.suggest.thread_title', { title: title.slice(0, 90) }) : t(guild.id, 'general.suggest.thread_default', { user: user.username }),
          autoArchiveDuration: 1440
        }).catch(() => {});
      }
      if (_m !== 'text' && _line) targetChannel.send({ content: _line }).catch(() => {});

      db.createSuggestion({
        guild_id: guild.id,
        channel_id: targetChannel.id,
        message_id: sentMsg.id,
        user_id: user.id,
        title: title,
        content: content,
        category: category
      });

      return safeReply(t(guild.id, 'general.suggest.sent', { channel: targetChannel.id }));
    } catch (err) {
      console.error('Error posting suggestion:', err);
      return safeReply(t(guild.id, 'general.suggest.error'));
    }
  }
};
