const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

// بنك الأسئلة الغني للألعاب
const CAPITALS_DATA = [
  { country: 'السعودية 🇸🇦', capital: 'الرياض' },
  { country: 'مصر 🇪🇬', capital: 'القاهرة' },
  { country: 'الإمارات 🇦🇪', capital: 'أبوظبي' },
  { country: 'قطر 🇶🇦', capital: 'الدوحة' },
  { country: 'الكويت 🇰🇼', capital: 'الكويت' },
  { country: 'العراق 🇮🇶', capital: 'بغداد' },
  { country: 'المغرب 🇲🇦', capital: 'الرباط' },
  { country: 'الجزائر 🇩🇿', capital: 'الجزائر' },
  { country: 'تونس 🇹🇳', capital: 'تونس' },
  { country: 'الأردن 🇯🇴', capital: 'عمان' },
  { country: 'عُمان 🇴🇲', capital: 'مسقط' },
  { country: 'فلسطين 🇵🇸', capital: 'القدس' },
  { country: 'اليابان 🇯🇵', capital: 'طوكيو' },
  { country: 'فرنسا 🇫🇷', capital: 'باريس' },
  { country: 'ألمانيا 🇩🇪', capital: 'برلين' },
  { country: 'بريطانيا 🇬🇧', capital: 'لندن' },
  { country: 'إسبانيا 🇪🇸', capital: 'مدريد' },
  { country: 'إيطاليا 🇮🇹', capital: 'روما' },
  { country: 'روسيا 🇷🇺', capital: 'موسكو' },
  { country: 'الصين 🇨🇳', capital: 'بكين' },
  { country: 'تركيا 🇹🇷', capital: 'أنقرة' },
  { country: 'البرازيل 🇧🇷', capital: 'برازيليا' },
  { country: 'كندا 🇨🇦', capital: 'أوتاوا' },
  { country: 'كوريا الجنوبية 🇰🇷', capital: 'سول' }
];

const WORDS_DATA = [
  'كمبيوتر', 'ديسكورد', 'سفينة', 'طائرة', 'مستشفى', 'مدرسة', 'صاروخ', 'فضاء',
  'برمجة', 'إنترنت', 'مملكة', 'عاصفة', 'شمسية', 'محيط', 'جزيرة', 'تلفزيون',
  'قهوة', 'سيارة', 'شاحنة', 'طبيعة', 'حديقة', 'كتاب', 'مكتبة', 'سماء'
];

const FAST_TYPING_DATA = [
  'سبحان الله وبحمده سبحان الله العظيم',
  'لا إله إلا الله وحده لا شريك له',
  'العلم نور والجهل ظلام',
  'الوقت كالسيف إن لم تقطعه قطعك',
  'خير الكلام ما قل ودل',
  'من جد وجد ومن زرع حصد',
  'الصبر مفتاح الفرج',
  'قطرة ماء تثقب الحجر ليس بالعنف بل بالتكرار'
];

// تتبع الألعاب النشطة لمنع تداخل الجولات في نفس القناة
const activeGames = new Set();

// تنظيف النصوص لمقارنة إجابات اللاعبين بدقة ومرونة (همزات، تاء مربوطة، مسافات)
function normalizeArabicText(text) {
  if (!text) return '';
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[\u064B-\u0652]/g, '') // إزالة التشكيل
    .replace(/\s+/g, ' ');
}

// 🧩 دوال مشتركة لأوامر الألعاب الجديدة (game-capitals / game-words / game-fast)
function getGamesSettings(guildId) {
  return db.getGuildSettings ? (db.getGuildSettings(guildId) || {}) : {};
}

// يرجع نص رسالة الحجب أو null إذا كله تمام
function preflightGamesError(channelId, guildId, settings = {}, opts = {}) {
  if (!opts.skipActive && activeGames.has(channelId)) {
    return '⚠️ هناك لعبة جارية بالفعل في هذه القناة! انتظر حتى تنتهي.';
  }
  if (settings.games_enabled === 0 || settings.games_enabled === '0' || settings.games_enabled === false) {
    return '🔒 نظام الألعاب معطل حالياً في هذا السيرفر من لوحة التحكم.';
  }
  if (settings.games_channel && settings.games_channel !== channelId) {
    return `⚠️ تم تخصيص الألعاب لتعمل فقط في روم: <#${settings.games_channel}>!`;
  }
  return null;
}

module.exports = {
  name: 'game',
  description: 'ألعاب التحدي والذكاء الجماعية في الشات 🎮',
  aliases: ['لعبة', 'العاب', 'ألعاب', 'games', 'play'],
  data: new SlashCommandBuilder()
    .setName('game')
    .setDescription('🎲 لعبة عشوائية: عواصم أو كلمات أو سرعة — أول إجابة صحيحة تفوز!'),

  async execute(interaction) {
    const settings = getGamesSettings(interaction.guild.id);
    const err = preflightGamesError(interaction.channelId, interaction.guild.id, settings);
    if (err) return interaction.reply({ content: err, ephemeral: true });

    // ✅ إغلاق سباق البدء: القفل يفتح ملاصقاً للفحص قبل أي await — نافذة defer ما تسمح بلقطة مزدوجة
    activeGames.add(interaction.channel.id);
    try {
      await interaction.deferReply();
    } catch (e) {
      activeGames.delete(interaction.channel.id);
      try { await interaction.reply({ content: '⚠️ تعذر بدء اللعبة الآن (تأخير بالشبكة) — جرّب مرة ثانية!', ephemeral: true }); } catch {}
      return;
    }
    await this.startGame(interaction.channel, interaction.user, interaction.guild.id, 'random', (opts) => interaction.editReply(opts), settings);
  },

  async executePrefix(message, args) {
    const settings = getGamesSettings(message.guild.id);
    // البريفكس: /game لعبة عشوائية فقط — تحديد النوع متاح عبر الأوامر المنفصلة (#عواصم #كلمات #سرعة)
    if (activeGames.has(message.channel.id)) {
      return message.reply('⚠️ هناك لعبة جارية بالفعل في هذه القناة! انتظر حتى تنتهي.').catch(() => {});
    }
    const err = preflightGamesError(message.channel.id, message.guild.id, settings, { skipActive: true });
    if (err) return message.reply(err).catch(() => {});

    // ✅ القفل هنا أيضاً — قبل أول await (إرسال رسالة البدء)
    activeGames.add(message.channel.id);

    let initialMsg = null;
    try {
      initialMsg = await message.channel.send('🎮 جارٍ بدء اللعبة العشوائية...');
    } catch {}

    const replyMethod = async (opts) => {
      if (initialMsg) {
        return initialMsg.edit(opts).catch(() => message.channel.send(opts));
      }
      return message.channel.send(opts);
    };

    await this.startGame(message.channel, message.author, message.guild.id, 'random', replyMethod, settings);
  },

  async startGame(channel, starter, guildId, type, replyMethod, settings = {}) {
    if (type === 'random') {
      const types = ['capitals', 'words', 'fast'];
      type = types[Math.floor(Math.random() * types.length)];
    }

    activeGames.add(channel.id);

    try {
      if (type === 'capitals') {
        await this.runCapitalsGame(channel, starter, guildId, replyMethod, settings);
      } else if (type === 'words') {
        await this.runWordsGame(channel, starter, guildId, replyMethod, settings);
      } else if (type === 'fast') {
        await this.runFastGame(channel, starter, guildId, replyMethod, settings);
      }
    } catch (err) {
      console.error('Game error:', err);
      channel.send('❌ حدث خطأ غير متوقع أثناء تشغيل اللعبة.').catch(() => {});
    } finally {
      activeGames.delete(channel.id);
    }
  },

  // 1. لعبة العواصم
  async runCapitalsGame(channel, starter, guildId, replyMethod, settings = {}) {
    const item = CAPITALS_DATA[Math.floor(Math.random() * CAPITALS_DATA.length)];
    const expected = normalizeArabicText(item.capital);
    const rewardCoins = Number(settings.game_reward_capitals) || 75;

    const embed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('🌍 لعبة عواصم الدول')
      .setDescription(`ما هي عاصمة **${item.country}**؟\n\n⏱️ معك **20 ثانية** للإجابة أول شخص في الشات!`)
      .setFooter({ text: `الجائزة: ${rewardCoins} 🪙 | بدأها: ${starter.username}` })
      .setTimestamp();

    await replyMethod({ embeds: [embed] });

    const filter = m => !m.author.bot;
    const collector = channel.createMessageCollector({ filter, time: 20000 });

    let answered = false;

    collector.on('collect', async msg => {
      const cleanMsg = normalizeArabicText(msg.content);
      if (cleanMsg === expected || cleanMsg.includes(expected)) {
        answered = true;
        collector.stop('answered');

        // 🎮 مكافأة الفائز — مرة وحدة باليوم عبر كل الألعاب
        let claim = { paid: true };
        try {
          if (db.claimGameReward) claim = db.claimGameReward(msg.author.id, guildId, rewardCoins, 'game:capitals');
          else if (db.addCoins) db.addCoins(msg.author.id, guildId, rewardCoins);
        } catch (e) { claim = { paid: false, failed: true }; }

        // 🧾 نص المكافأة الواضح: صرف فعلي / استُنزفت اليومية / جرح تقني / جوائز مقفلة (0)
        const rewardLine =
          rewardCoins <= 0 ? '🏆 فوز بلا عملات (الجوائز مقفلة من الإدارة)' :
          claim.paid ? `💰 حصلت على **+${rewardCoins} 🪙** عملة!` :
          claim.failed ? '⚠️ صار خلل تقني بالصرف — هالجولة بلا مكافأة 🛠️' :
          '🎁 جائزتك اليوم صرفت… **الألعاب تدفع مرة وحدة باليوم** 🎮 رجع بكره!';

        const winEmbed = new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('🎉 إجابة صحيحة!')
          .setDescription(`كفو يا بطل ${msg.author}! 🏆\nعاصمة **${item.country}** هي بالفعل **${item.capital}**.\n\n${rewardLine}`)
          .setTimestamp();

        return msg.reply({ embeds: [winEmbed] });
      }
    });

    collector.on('end', (collected, reason) => {
      if (!answered && reason !== 'answered') {
        const timeoutEmbed = new EmbedBuilder()
          .setColor('#e74c3c')
          .setTitle('⌛ انتهى الوقت!')
          .setDescription(`للأسف لم يعرف أحد الإجابة بالوقت المحدد!\nعاصمة **${item.country}** هي: **${item.capital}** ✨`)
          .setTimestamp();

        channel.send({ embeds: [timeoutEmbed] });
      }
    });
  },

  // 2. لعبة تفكيك وتركيب الكلمات
  async runWordsGame(channel, starter, guildId, replyMethod, settings = {}) {
    const word = WORDS_DATA[Math.floor(Math.random() * WORDS_DATA.length)];
    const isUnscramble = Math.random() > 0.5; // تركيب أو تفكيك
    const rewardCoins = Number(settings.game_reward_words) || 60;

    let title, question, targetAnswer;

    if (isUnscramble) {
      // تركيب الحروف المبعثرة
      const shuffled = word.split('').sort(() => Math.random() - 0.5).join(' - ');
      title = '🧩 لعبة تركيب الكلمة';
      question = `قم بترتيب الحروف التالية لتكوين كلمة صحيحة:\n\n# \`[ ${shuffled} ]\``;
      targetAnswer = normalizeArabicText(word);
    } else {
      // تفكيك الكلمة
      const spaced = word.split('').join(' ');
      title = '🧩 لعبة تفكيك الكلمة';
      question = `قم بتفكيك الكلمة التالية بوضع مسافات بين كل حرف:\n\n# \`[ ${word} ]\`\n*(مثال: ك ت ا ب)*`;
      targetAnswer = normalizeArabicText(spaced);
    }

    const embed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle(title)
      .setDescription(`${question}\n\n⏱️ معك **20 ثانية** للكتابة في الشات!`)
      .setFooter({ text: `الجائزة: ${rewardCoins} 🪙 | بدأها: ${starter.username}` })
      .setTimestamp();

    await replyMethod({ embeds: [embed] });

    const filter = m => !m.author.bot;
    const collector = channel.createMessageCollector({ filter, time: 20000 });

    let answered = false;

    collector.on('collect', async msg => {
      const cleanMsg = normalizeArabicText(msg.content);
      if (cleanMsg === targetAnswer) {
        answered = true;
        collector.stop('answered');

        // 🎮 جائزة مرة وحدة باليوم
        let claim = { paid: true };
        try {
          if (db.claimGameReward) claim = db.claimGameReward(msg.author.id, guildId, rewardCoins, 'game:words');
          else if (db.addCoins) db.addCoins(msg.author.id, guildId, rewardCoins);
        } catch (e) { claim = { paid: false, failed: true }; }

        // 🧾 نص المكافأة الواضح: صرف فعلي / استُنزفت اليومية / جرح تقني / جوائز مقفلة (0)
        const rewardLine =
          rewardCoins <= 0 ? '🏆 فوز بلا عملات (الجوائز مقفلة من الإدارة)' :
          claim.paid ? `💰 تمت إضافة **+${rewardCoins} 🪙** إلى رصيدك!` :
          claim.failed ? '⚠️ صار خلل تقني بالصرف — هالجولة بلا مكافأة 🛠️' :
          '🎁 جائزتك اليوم صرفت… **الألعاب تدفع مرة وحدة باليوم** 🎮 رجع بكره!';

        const winEmbed = new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('🎉 إجابة عبقرية وسريعة!')
          .setDescription(`مبروك ${msg.author}! 👏\nالجواب الصحيح هو: **${word}**\n\n${rewardLine}`)
          .setTimestamp();

        return msg.reply({ embeds: [winEmbed] });
      }
    });

    collector.on('end', (collected, reason) => {
      if (!answered && reason !== 'answered') {
        const timeoutEmbed = new EmbedBuilder()
          .setColor('#e74c3c')
          .setTitle('⌛ انتهى الوقت!')
          .setDescription(`انتهت المهلة ولم يتم حل الكلمة في الوقت المحدد!\nالكلمة المطلوبة كانت: **${word}**`)
          .setTimestamp();

        channel.send({ embeds: [timeoutEmbed] });
      }
    });
  },

  // 3. لعبة أسرع واحد يكتب
  async runFastGame(channel, starter, guildId, replyMethod, settings = {}) {
    const textTarget = FAST_TYPING_DATA[Math.floor(Math.random() * FAST_TYPING_DATA.length)];
    const normalizedTarget = normalizeArabicText(textTarget);
    const rewardCoins = Number(settings.game_reward_fast) || 85;
    const startTime = Date.now();

    const embed = new EmbedBuilder()
      .setColor('#e67e22')
      .setTitle('⚡ تحدي أسرع كاتب (Fast Typing)')
      .setDescription(`أول شخص يكتب هذه العبارة كاملة وبدون أخطاء يفوز:\n\n>>> **${textTarget}**\n\n⏱️ لديك **25 ثانية** للانطلاق!`)
      .setFooter({ text: `الجائزة: ${rewardCoins} 🪙 | بدأها: ${starter.username}` })
      .setTimestamp();

    await replyMethod({ embeds: [embed] });

    const filter = m => !m.author.bot;
    const collector = channel.createMessageCollector({ filter, time: 25000 });

    let answered = false;

    collector.on('collect', async msg => {
      const cleanMsg = normalizeArabicText(msg.content);
      if (cleanMsg === normalizedTarget) {
        answered = true;
        collector.stop('answered');

        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);

        // 🎮 جائزة مرة وحدة باليوم
        let claim = { paid: true };
        try {
          if (db.claimGameReward) claim = db.claimGameReward(msg.author.id, guildId, rewardCoins, 'game:fast');
          else if (db.addCoins) db.addCoins(msg.author.id, guildId, rewardCoins);
        } catch (e) { claim = { paid: false, failed: true }; }

        // 🧾 نص المكافأة الواضح: صرف فعلي / استُنزفت اليومية / جرح تقني / جوائز مقفلة (0)
        const rewardLine =
          rewardCoins <= 0 ? '🏆 فوز بلا عملات (الجوائز مقفلة من الإدارة)' :
          claim.paid ? `💰 جائزتك: **+${rewardCoins} 🪙** عملة!` :
          claim.failed ? '⚠️ صار خلل تقني بالصرف — هالجولة بلا مكافأة 🛠️' :
          '🎁 جائزتك اليوم صرفت… **الألعاب تدفع مرة وحدة باليوم** 🎮 رجع بكره!';

        const winEmbed = new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('🚀 سرعة خارقة!')
          .setDescription(`ما شاء الله ${msg.author}! ⚡\nأنهيت الكتابة في زمن قدره: **${elapsedSec} ثانية** فقط!\n\n${rewardLine}`)
          .setTimestamp();

        return msg.reply({ embeds: [winEmbed] });
      }
    });

    collector.on('end', (collected, reason) => {
      if (!answered && reason !== 'answered') {
        const timeoutEmbed = new EmbedBuilder()
          .setColor('#e74c3c')
          .setTitle('⌛ انتهى الوقت!')
          .setDescription(`انتهت الـ 25 ثانية ولم يكتبها أحد بالدقة المطلوبة!\nحظاً أوفر في الجولة القادمة 🎮`)
          .setTimestamp();

        channel.send({ embeds: [timeoutEmbed] });
      }
    });
  }
};

// 🧩 تصدير مشترك: الأوامر المنفصلة (game-capitals / game-words / game-fast) تستخدم هذه
module.exports.getGamesSettings = getGamesSettings;
module.exports.preflightGamesError = preflightGamesError;
module.exports.normalizeArabicText = normalizeArabicText;
module.exports.activeGames = activeGames;
