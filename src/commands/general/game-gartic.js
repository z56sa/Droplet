/**
 * 🎨 لعبة غارتيك (Gartic) — الرسم والتخمين
 * البوت يرسم لوحة بخطوط يد "متهدجة" (Sketch) لكلمة سرية،
 * وأول عضو يكتب الإجابة الصحيحة في الشات يفوز بالمكافأة.
 */
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');
const db = require('../../database');
// 🔗 حارس الجولات مشترك مع game.js حتى لا تتداخل /game مع /game-gartic في نفس الروم
const game = require('./game');

// ─── رسّام السكتش: خطوط مرتجفة + هزات عشوائية (يخلي الرسمة "غير واضحة") ───
class SketchPainter {
  constructor(ctx) {
    this.ctx = ctx;
    this.ctx.lineWidth = 4;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = '#1f2937';
  }

  _jitter(amp = 8) {
    return (Math.random() - 0.5) * amp;
  }

  line(x1, y1, x2, y2) {
    const c = this.ctx;
    c.beginPath();
    const segments = 6;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const px = x1 + (x2 - x1) * t + this._jitter();
      const py = y1 + (y2 - y1) * t + this._jitter();
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.stroke();
  }

  rect(x, y, w, h) {
    this.line(x, y, x + w, y);
    this.line(x + w, y, x + w, y + h);
    this.line(x + w, y + h, x, y + h);
    this.line(x, y + h, x, y);
  }

  circle(cx, cy, r) {
    const c = this.ctx;
    c.beginPath();
    const steps = 26;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const j = 1 + (Math.random() - 0.5) * 0.14;
      const px = cx + Math.cos(a) * r * j;
      const py = cy + Math.sin(a) * r * j;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
    c.stroke();
  }

  ellipse(cx, cy, rx, ry) {
    const c = this.ctx;
    c.beginPath();
    const steps = 26;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const j = 1 + (Math.random() - 0.5) * 0.12;
      const px = cx + Math.cos(a) * rx * j;
      const py = cy + Math.sin(a) * ry * j;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
    c.stroke();
  }

  arc(cx, cy, r, start, end) {
    const c = this.ctx;
    c.beginPath();
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = start + (end - start) * t;
      const j = 1 + (Math.random() - 0.5) * 0.12;
      const px = cx + Math.cos(a) * r * j;
      const py = cy + Math.sin(a) * r * j;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.stroke();
  }

  tri(x1, y1, x2, y2, x3, y3) {
    this.line(x1, y1, x2, y2);
    this.line(x2, y2, x3, y3);
    this.line(x3, y3, x1, y1);
  }

  star(cx, cy, outer, inner) {
    const c = this.ctx;
    c.beginPath();
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? outer : inner;
      const j = 1 + (Math.random() - 0.5) * 0.12;
      const px = cx + Math.cos(a) * r * j;
      const py = cy + Math.sin(a) * r * j;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
    c.stroke();
  }
}

// ─── بنك الكلمات: كلمة + تلميح + دالة رسم (بالمنسق 720x560) ───
const GARTIC_WORDS = [
  { word: 'بيت', hint: 'فيه سقف وباب وشبابيك… سكن فيه الناس.', draw: (d) => { d.rect(220, 330, 280, 190); d.tri(190, 340, 530, 340, 360, 190); d.rect(330, 400, 70, 120); d.rect(420, 370, 60, 60); } },
  { word: 'شمس', hint: 'تنور النهار… عليها أشعة.', draw: (d) => { d.circle(360, 280, 90); for (let i = 0; i < 10; i++) { const a = i * (Math.PI / 5); d.line(360 + Math.cos(a) * 110, 280 + Math.sin(a) * 110, 360 + Math.cos(a) * 185, 280 + Math.sin(a) * 185); } } },
  { word: 'قمر', hint: 'يبان بالليل… مثل الهلال.', draw: (d) => { d.arc(360, 280, 130, Math.PI * 0.25, Math.PI * 1.75); d.arc(360, 280, 60, Math.PI * 1.75, Math.PI * 0.25); d.circle(540, 430, 6); d.circle(580, 400, 5); } },
  { word: 'نجمة', hint: ' فيها خمس رؤوس وبتلمع في السماء.', draw: (d) => { d.star(360, 280, 150, 60); } },
  { word: 'سيارة', hint: 'تحتوي 4 عجلات وتنجز السفر.', draw: (d) => { d.rect(200, 300, 330, 80); d.rect(280, 240, 160, 60); d.circle(230, 400, 40); d.circle(430, 400, 40); } },
  { word: 'شجرة', hint: 'لها جذع وأغصان وأوراق… تزرع في الأرض.', draw: (d) => { d.rect(340, 330, 40, 190); d.circle(360, 240, 85); d.circle(310, 290, 70); d.circle(410, 290, 70); } },
  { word: 'زهرة', hint: 'تتفتح في الحديقة… لها بتلات حول وسط.', draw: (d) => { d.line(360, 350, 360, 500); for (let i = 0; i < 6; i++) { const a = i * (Math.PI / 3); d.circle(360 + Math.cos(a) * 55, 140 + Math.sin(a) * 55 + 140, 38); } d.circle(360, 280, 30); } },
  { word: 'قارب', hint: 'يتحرك في الماء… له صاري وشراع.', draw: (d) => { d.arc(360, 380, 140, 0, Math.PI); d.line(360, 380, 360, 180); d.tri(360, 210, 360, 360, 250, 360); d.line(200, 400, 520, 400); } },
  { word: 'صاروخ', hint: 'يطير إلى الفضاء… له جسم وأنف وزعانف.', draw: (d) => { d.line(330, 190, 330, 470); d.line(390, 470, 390, 190); d.arc(360, 190, 30, Math.PI, Math.PI * 2); d.tri(390, 260, 470, 360, 390, 360); d.tri(330, 260, 250, 360, 330, 360); d.line(340, 510, 380, 510); } },
  { word: 'سمكة', hint: 'تعيش في الماء… لها ذيل وعين.', draw: (d) => { d.ellipse(360, 300, 140, 75); d.tri(500, 300, 580, 250, 580, 350); d.circle(430, 280, 12); } },
  { word: 'قلب', hint: 'رمز الحب… منحني مثل مثلث ودائرتين.', draw: (d) => { d.circle(305, 280, 66); d.circle(415, 280, 66); d.tri(240, 316, 480, 316, 360, 480); } },
  { word: 'مظلة', hint: 'تحميك من المطر… تكبس عليها زر تفتح.', draw: (d) => { d.arc(360, 310, 140, Math.PI, Math.PI * 2); d.line(220, 310, 220, 330); d.line(290, 310, 290, 330); d.line(360, 310, 360, 330); d.line(430, 310, 430, 330); d.line(500, 310, 500, 330); d.line(360, 450, 360, 310); d.arc(360, 460, 25, 0, Math.PI); } },
  { word: 'ساعة', hint: 'عنوان الوقت… عقارب وأرقام.', draw: (d) => { d.circle(360, 290, 140); d.line(360, 290, 360, 185); d.line(360, 290, 440, 290); } },
  { word: 'فنجان', hint: 'فيه شاهي… يترفع بخار.', draw: (d) => { d.rect(260, 270, 200, 190); d.arc(480, 350, 45, -Math.PI / 2, Math.PI * 1.5); d.line(320, 230, 320, 195); d.line(380, 230, 380, 195); } },
  { word: 'طائرة', hint: 'تطير في السماء… لها رفارف جناح عرضين.', draw: (d) => { d.ellipse(380, 300, 140, 32); d.tri(300, 295, 360, 205, 400, 295); d.tri(300, 310, 480, 375, 480, 305); d.line(240, 320, 260, 340); } },
  { word: 'مفتاح', hint: 'يفتح الأبواب… له عين وسن وسنّين.', draw: (d) => { d.circle(260, 290, 88); d.line(348, 310, 540, 310); d.line(490, 310, 490, 375); d.line(540, 310, 540, 375); } },
  { word: 'تلفزيون', hint: 'شبشوبة تعرض مسلسلات… له هوائي.', draw: (d) => { d.rect(220, 260, 280, 210); d.line(360, 255, 410, 185); d.line(365, 255, 310, 185); } },
  { word: 'بيتزا', hint: 'دائرية مثلثية في 8 قطع… عليها لبنة رقّة.', draw: (d) => { d.tri(250, 190, 250, 460, 540, 330); d.arc(250, 325, 135, -Math.PI / 3, Math.PI / 3); d.circle(390, 305, 20); d.circle(440, 325, 18); d.circle(455, 295, 16); } },
  { word: 'قبعة', hint: 'تلبس في الرأس… حافة دائرية وقبّة.', draw: (d) => { d.ellipse(360, 340, 175, 45); d.arc(360, 345, 95, Math.PI, Math.PI * 2); } },
  { word: 'كتاب', hint: 'له غلاف وصفحات… تقرأ فيه.', draw: (d) => { d.rect(230, 240, 90, 180); d.rect(410, 240, 90, 180); d.line(410, 240, 360, 260); d.line(410, 420, 360, 440); d.line(360, 260, 360, 440); d.line(230, 240, 280, 260); d.line(230, 420, 280, 440); d.line(280, 260, 280, 440); d.line(500, 240, 500, 420); } },
];

// منع تداخل الجولات في نفس القناة — نفس حارس game.js المشترك (يجمع /game والأوامر المنفصلة وغارتيك)
const activeGartic = game.activeGames;

// تنظيف نصوص المقارنة (همزات، تاء مربوطة، تشكيل، مسافات) — نفس منطق game.js
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
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/\s+/g, ' ');
}

// توليد اللوحة المشوشة
function renderSketch(item) {
  const W = 720, H = 560;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ورقة بيضاء بحد رمادي
  ctx.fillStyle = '#fdfdf8';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#d6d3ce';
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, W - 20, H - 20);

  // مخربشات خفيفة عشوائية (تزيد صعوبة التخمين)
  ctx.strokeStyle = 'rgba(150,150,150,0.30)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const x1 = Math.random() * W;
    const y1 = Math.random() * H;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + (Math.random() - 0.5) * 220, y1 + (Math.random() - 0.5) * 220);
    ctx.stroke();
  }

  // الرسمة نفسها
  const painter = new SketchPainter(ctx);
  item.draw(painter);

  return canvas.toBuffer('image/png');
}

module.exports = {
  name: 'game-gartic',
  description: 'لعبة غارتيك: البوت يرسم رسمة غير واضحة والأعضاء يخمّنونها (Gartic) 🎨',
  aliases: ['gartic', 'قراتيك', 'غارتيك', 'رسمة'],
  data: new SlashCommandBuilder()
    .setName('game-gartic')
    .setDescription('🎨 لعبة غارتيك: رسمة مشوشة يرسمها البوت وأول إجابة صحيحة تفوز!'),

  async execute(interaction) {
    await interaction.deferReply();
    return this.startGarticRound(interaction.channel, interaction.user, interaction.guild.id, (opts) => interaction.editReply(opts));
  },

  async executePrefix(message, args, client) {
    return this.startGarticRound(message.channel, message.author, message.guild.id, async (opts) => {
      return message.reply(opts).catch(() => message.channel.send(opts));
    });
  },

  async startGarticRound(channel, starter, guildId, replyMethod) {
    if (activeGartic.has(channel.id)) {
      return replyMethod({ content: '⚠️ هناك لعبة جارية بالفعل في هذه القناة! انتظر حتى تنتهي.', flags: 64 });
    }

    const settings = db.getGuildSettings ? (db.getGuildSettings(guildId) || {}) : {};
    if (settings.games_enabled === 0 || settings.games_enabled === '0' || settings.games_enabled === false) {
      return replyMethod({ content: '🔒 نظام الألعاب معطل حالياً في هذا السيرفر من لوحة التحكم.', flags: 64 });
    }
    if (settings.games_channel && settings.games_channel !== channel.id) {
      return replyMethod({ content: `⚠️ تم تخصيص الألعاب لتعمل فقط في روم: <#${settings.games_channel}>!`, flags: 64 });
    }

    const item = GARTIC_WORDS[Math.floor(Math.random() * GARTIC_WORDS.length)];
    const expected = normalizeArabicText(item.word);
    const rewardCoins = Number(settings.game_reward_gartic) || 90;

    let buffer = null;
    try {
      buffer = renderSketch(item);
    } catch (e) {
      console.error('[Gartic] sketch render failed:', e);
      return replyMethod({ content: '❌ تعذر توليد الرسمة (خطأ داخلي). جرب مرة أخرى!', flags: 64 });
    }

    activeGartic.add(channel.id);
    let answered = false;
    let hintSent = false;

    const attachment = new AttachmentBuilder(buffer, { name: 'gartic.png' });
    const embed = new EmbedBuilder()
      .setColor('#e67e22')
      .setTitle('🎨 لعبة غارتيك — خمّن الرسمة!')
      .setDescription('**البوت رسم لوحة مشوشة لكلمة سرية…**\nشنو هذه الرسمة؟ اكتب الإجابة في الشات!\n\n⏱️ معك **35 ثانية** — أول إجابة صحيحة تفوز.\n💡 تلميح بعد الـ 20 ثانية.')
      .setImage('attachment://gartic.png')
      .setFooter({ text: `الجائزة: ${rewardCoins} 🪙 | بدأها: ${starter.username}` })
      .setTimestamp();

    try {
      await replyMethod({ embeds: [embed], files: [attachment] });
    } catch (e) {
      activeGartic.delete(channel.id);
      return;
    }

    const filter = m => !m.author.bot;
    const collector = channel.createMessageCollector({ filter, time: 35000 });

    // تلميح بعد 20 ثانية
    const hintTimer = setTimeout(() => {
      if (answered || hintSent) return;
      hintSent = true;
      channel.send(`💡 **تلميح:** ${item.hint}\n📝 الكلمة تتكون من **${item.word.length} حروف**`).catch(() => {});
    }, 20000);

    collector.on('collect', async msg => {
      if (normalizeArabicText(msg.content) === expected) {
        answered = true;
        hintSent = true;
        collector.stop('answered');
        clearTimeout(hintTimer);

        try {
          if (db.addCoins) db.addCoins(msg.author.id, guildId, rewardCoins);
        } catch (e) {}

        const winEmbed = new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('🎉 إجابة صحيحة!')
          .setDescription(`عين صقر 🎯 مبروك يا ${msg.author}!\nالرسمة كانت: **${item.word}**\n\n💰 حصلت على **+${rewardCoins} 🪙** عملة!`)
          .setTimestamp();

        return msg.reply({ embeds: [winEmbed] }).catch(() => {});
      }
    });

    collector.on('end', (_collected, reason) => {
      clearTimeout(hintTimer);
      activeGartic.delete(channel.id);
      if (!answered && reason !== 'answered') {
        const timeoutEmbed = new EmbedBuilder()
          .setColor('#e74c3c')
          .setTitle('⌛ انتهى الوقت!')
          .setDescription(`لم يخمّن أحد الرسمة بالوقت المحدد!\nالإجابة كانت: **${item.word}** ✨\nجربوا مرة ثانية 🎮`)
          .setTimestamp();

        channel.send({ embeds: [timeoutEmbed] }).catch(() => {});
      }
    });
  }
};
