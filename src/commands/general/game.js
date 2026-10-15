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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('game')
    .setDescription('ألعاب التحدي والذكاء الجماعية في الشات 🎮')
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('اختر اللعبة')
        .setRequired(false)
        .addChoices(
          { name: '🌍 عواصم ودول (Capitals)', value: 'capitals' },
          { name: '🧩 تفكيك وتركيب الكلمات (Words)', value: 'words' },
          { name: '⚡ أسرع واحد يكتب (Fast Typing)', value: 'fast' },
          { name: '🎲 لعبة عشوائية (Random Game)', value: 'random' }
        )
    ),

  async execute(interaction) {
    const channelId = interaction.channelId;
    if (activeGames.has(channelId)) {
      return interaction.reply({ content: '⚠️ هناك لعبة جارية بالفعل في هذه القناة! انتظر حتى تنتهي.', ephemeral: true });
    }

    // فحص إعدادات الداشبورد
    const settings = db.getGuildSettings ? (db.getGuildSettings(interaction.guildId) || {}) : {};
    if (settings.games_enabled === 0 || settings.games_enabled === '0' || settings.games_enabled === false) {
      return interaction.reply({ content: '🔒 نظام الألعاب معطل حالياً في هذا السيرفر من لوحة التحكم.', ephemeral: true });
    }

    if (settings.games_channel && settings.games_channel !== channelId) {
      return interaction.reply({ content: `⚠️ تم تخصيص الألعاب لتعمل فقط في روم: <#${settings.games_channel}>!`, ephemeral: true });
    }

    const chosenType = interaction.options.getString('type') || 'random';
    await interaction.deferReply();
    await this.startGame(interaction.channel, interaction.user, interaction.guild.id, chosenType, (opts) => interaction.editReply(opts), settings);
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
      channel.send('❌ حدث خطأ غير متوقع أثناء تشغيل اللعبة.');
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

        // مكافأة الفائز
        try {
          if (db.addCoins) db.addCoins(msg.author.id, guildId, rewardCoins);
        } catch (e) {}

        const winEmbed = new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('🎉 إجابة صحيحة!')
          .setDescription(`كفو يا بطل ${msg.author}! 🏆\nعاصمة **${item.country}** هي بالفعل **${item.capital}**.\n\n💰 حصلت على **+${rewardCoins} 🪙** عملة!`)
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

        try {
          if (db.addCoins) db.addCoins(msg.author.id, guildId, rewardCoins);
        } catch (e) {}

        const winEmbed = new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('🎉 إجابة عبقرية وسريعة!')
          .setDescription(`مبروك ${msg.author}! 👏\nالجواب الصحيح هو: **${word}**\n\n💰 تمت إضافة **+${rewardCoins} 🪙** إلى رصيدك!`)
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

        try {
          if (db.addCoins) db.addCoins(msg.author.id, guildId, rewardCoins);
        } catch (e) {}

        const winEmbed = new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('🚀 سرعة خارقة!')
          .setDescription(`ما شاء الله ${msg.author}! ⚡\nأنهيت الكتابة في زمن قدره: **${elapsedSec} ثانية** فقط!\n\n💰 جائزتك: **+${rewardCoins} 🪙** عملة!`)
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
