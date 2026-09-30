const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database');

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
          { name: '💡 عام', value: 'عام' },
          { name: '🎉 فعاليات ومسابقات', value: 'فعاليات' },
          { name: '🎖️ رتب وأدوار', value: 'رتب' },
          { name: '💬 قنوات ورومات', value: 'رومات' },
          { name: '🤖 ميزات البوت', value: 'بوت' },
          { name: '⚠️ شكوى أو بلاغ', value: 'شكوى' }
        )),

  name: 'suggest',
  description: 'تقديم اقتراح أو فكرة لتطوير السيرفر 💡',
  aliases: ['اقتراح', 'suggestion'],

  async execute(interactionOrMessage, args) {
    const isSlash = !!interactionOrMessage.isChatInputCommand;
    const guild = interactionOrMessage.guild;
    const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;

    const settings = db.getGuildSettings(guild.id);
    if (settings.suggestions_enabled === 0) {
      const msg = '❌ نظام الاقتراحات معطل حالياً في هذا السيرفر.';
      if (isSlash) return interactionOrMessage.reply({ content: msg, flags: [64] });
      return interactionOrMessage.reply(msg);
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
        return interactionOrMessage.reply('❌ يرجى كتابة محتوى الاقتراح بعد الأمر! مثال: `#suggest إضافة روم للألعاب`');
      }
      content = args.join(' ');
    }

    const channelId = settings.suggestions_channel || interactionOrMessage.channel.id;
    const targetChannel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);

    if (!targetChannel || !targetChannel.isTextBased()) {
      const msg = '❌ لم يتم تعيين قناة صالحة لنشر الاقتراحات في إعدادات الداشبورد.';
      if (isSlash) return interactionOrMessage.reply({ content: msg, flags: [64] });
      return interactionOrMessage.reply(msg);
    }

    const { buildSuggestionEmbed, buildSuggestionComponents } = require('../../utils/suggestionBuilder');
    const suggCode = Math.random().toString(36).substring(2, 11);

    const suggEmbed = buildSuggestionEmbed({
      user,
      content,
      title,
      code: suggCode,
      status: 'pending',
      upvotes: 0,
      downvotes: 0,
      createdAt: Date.now()
    });

    const components = buildSuggestionComponents({
      upvotes: 0,
      downvotes: 0
    });

    try {
      const sentMsg = await targetChannel.send({ embeds: [suggEmbed], components });

      if (settings.suggestions_auto_thread !== 0) {
        sentMsg.startThread({
          name: title ? `مناقشة: ${title}`.slice(0, 95) : `مناقشة اقتراح #${user.username}`.slice(0, 95),
          autoArchiveDuration: 1440
        }).catch(() => {});
      }

      db.createSuggestion({
        guild_id: guild.id,
        channel_id: targetChannel.id,
        message_id: sentMsg.id,
        user_id: user.id,
        title: title,
        content: content,
        category: category
      });

      const successReply = `✅ تم إرسال اقتراحك بنجاح ونشره في <#${targetChannel.id}>!`;
      if (isSlash) {
        await interactionOrMessage.reply({ content: successReply, flags: [64] });
      } else {
        await interactionOrMessage.reply(successReply);
      }
    } catch (err) {
      console.error('Error posting suggestion:', err);
      const errMsg = '❌ حدث خطأ أثناء إرسال الاقتراح، يرجى التأكد من صلاحيات البوت في القناة.';
      if (isSlash) return interactionOrMessage.reply({ content: errMsg, flags: [64] });
      return interactionOrMessage.reply(errMsg);
    }
  }
};
