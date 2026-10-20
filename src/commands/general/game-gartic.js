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

// ─── بنك الكلمات (107 رسمة): كلمة + بدائل + تلميح + دالة رسم (بالمنسق 720x560) ───
const GARTIC_ITEMS = [
  { word: 'بيت', hint: 'سقف مثلث فوق وربع مربع تحته باب وشباك.', draw: (d) => { d.rect(220, 330, 280, 190); d.tri(190, 340, 530, 340, 360, 190); d.rect(330, 400, 70, 120); d.rect(420, 370, 60, 60); } },
  { word: 'شمس', hint: 'دائرة تطلع منها خطوط بكل الاتجاهات.', draw: (d) => { d.circle(360, 280, 90); for (let i = 0; i < 10; i++) { const a = i * (Math.PI / 5); d.line(360 + Math.cos(a) * 110, 280 + Math.sin(a) * 110, 360 + Math.cos(a) * 185, 280 + Math.sin(a) * 185); } } },
  { word: 'قمر', hint: 'قوسان متقابلون يشتكلون هلالاً بالليل.', draw: (d) => { d.arc(360, 280, 130, Math.PI * 0.25, Math.PI * 1.75); d.arc(360, 280, 60, Math.PI * 1.75, Math.PI * 0.25); d.circle(540, 430, 6); d.circle(580, 400, 5); } },
  { word: 'نجمة', hint: 'خمس رؤوس حادة وتلمع بالسماء.', draw: (d) => { d.star(360, 280, 150, 60); } },
  { word: 'سيارة', hint: 'ربع منخفض عليه قوس وعليه أربع دواليب.', draw: (d) => { d.rect(200, 300, 330, 80); d.rect(280, 240, 160, 60); d.circle(230, 400, 40); d.circle(430, 400, 40); } },
  { word: 'شجرة', hint: 'جذع رفيع وتحته ثلاث دوائر ورقية.', draw: (d) => { d.rect(340, 330, 40, 190); d.circle(360, 240, 85); d.circle(310, 290, 70); d.circle(410, 290, 70); } },
  { word: 'زهرة', hint: 'ساق طويلة وحول قلبها بتلات دائرية.', draw: (d) => { d.line(360, 350, 360, 500); for (let i = 0; i < 6; i++) { const a = i * (Math.PI / 3); d.circle(360 + Math.cos(a) * 55, 140 + Math.sin(a) * 55 + 140, 38); } d.circle(360, 280, 30); } },
  { word: 'قارب', hint: 'قوس سفلي وشراع مثلث وصاري بوسطه.', draw: (d) => { d.arc(360, 380, 140, 0, Math.PI); d.line(360, 380, 360, 180); d.tri(360, 210, 360, 360, 250, 360); d.line(200, 400, 520, 400); } },
  { word: 'صاروخ', hint: 'جسم أنبوبي طرفه نصف دائرة وزعانف مثلثية.', draw: (d) => { d.line(330, 190, 330, 470); d.line(390, 470, 390, 190); d.arc(360, 190, 30, Math.PI, Math.PI * 2); d.tri(390, 260, 470, 360, 390, 360); d.tri(330, 260, 250, 360, 330, 360); d.line(340, 510, 380, 510); } },
  { word: 'سمكة', hint: 'بيضة أفقية وذيل مثلث وعين صغيرة.', draw: (d) => { d.ellipse(360, 300, 140, 75); d.tri(500, 300, 580, 250, 580, 350); d.circle(430, 280, 12); } },
  { word: 'قلب', hint: 'دائرتان متلاصقتان وتضيّق للأسفل.', draw: (d) => { d.circle(305, 280, 66); d.circle(415, 280, 66); d.tri(240, 316, 480, 316, 360, 480); } },
  { word: 'مظلة', hint: 'نصف دائرة فوق وخطوط تتدلى من حافتها وعصا بوسطها.', draw: (d) => { d.arc(360, 310, 140, Math.PI, Math.PI * 2); d.line(220, 310, 220, 330); d.line(290, 310, 290, 330); d.line(360, 310, 360, 330); d.line(430, 310, 430, 330); d.line(500, 310, 500, 330); d.line(360, 450, 360, 310); d.arc(360, 460, 25, 0, Math.PI); } },
  { word: 'ساعة', hint: 'دائرة وداخلها عقربان يوضحان الوقت.', draw: (d) => { d.circle(360, 290, 140); d.line(360, 290, 360, 185); d.line(360, 290, 440, 290); } },
  { word: 'فنجان', hint: 'ربع فيه شراب بخاره يطلع من فمه.', draw: (d) => { d.rect(260, 270, 200, 190); d.arc(480, 350, 45, -Math.PI / 2, Math.PI * 1.5); d.line(320, 230, 320, 195); d.line(380, 230, 380, 195); } },
  { word: 'طائرة', hint: 'بيضة طويلة وأجنحة مثلثة تحت طرفها.', draw: (d) => { d.ellipse(380, 300, 140, 32); d.tri(300, 295, 360, 205, 400, 295); d.tri(300, 310, 480, 375, 480, 305); d.line(240, 320, 260, 340); } },
  { word: 'مفتاح', hint: 'دائرة كبيرة وسيخ طويل وله سنّان في نهايته.', draw: (d) => { d.circle(260, 290, 88); d.line(348, 310, 540, 310); d.line(490, 310, 490, 375); d.line(540, 310, 540, 375); } },
  { word: 'تلفزيون', hint: 'ربع عريض وخطان يطلعان من فوقه كالهوائي.', draw: (d) => { d.rect(220, 260, 280, 210); d.line(360, 255, 410, 185); d.line(365, 255, 310, 185); } },
  { word: 'بيتزا', hint: 'مقطعة مثلثات وعليها نقاط دائرية.', draw: (d) => { d.tri(250, 190, 250, 460, 540, 330); d.arc(250, 325, 135, -Math.PI / 3, Math.PI / 3); d.circle(390, 305, 20); d.circle(440, 325, 18); d.circle(455, 295, 16); } },
  { word: 'قبعة', hint: 'قوس نصف دائرة فوق حافة بيضاوية عريضة.', draw: (d) => { d.ellipse(360, 340, 175, 45); d.arc(360, 345, 95, Math.PI, Math.PI * 2); } },
  { word: 'كتاب', hint: 'صفحتان مفتوحتان بينهما خط وسطي.', draw: (d) => { d.rect(230, 240, 90, 180); d.rect(410, 240, 90, 180); d.line(410, 240, 360, 260); d.line(410, 420, 360, 440); d.line(360, 260, 360, 440); d.line(230, 240, 280, 260); d.line(230, 420, 280, 440); d.line(280, 260, 280, 440); d.line(500, 240, 500, 420); } },
  { word: 'قطة', hint: 'رأس دائري بأذنين مثلثتين وخطوط شرايات.', alt: ['سمورة', 'بس'], draw: (d) => { d.circle(430, 225, 52); d.tri(372, 200, 398, 152, 415, 196); d.tri(447, 196, 464, 152, 488, 200); d.ellipse(400, 400, 110, 85); d.line(508, 448, 566, 402); d.circle(412, 218, 8); d.circle(450, 218, 8); d.tri(424, 240, 440, 240, 432, 252); d.line(378, 236, 320, 228); d.line(378, 252, 322, 258); d.line(482, 236, 540, 228); d.line(482, 252, 538, 258); } },
  { word: 'كلب', hint: 'رأس دائري وأذنان مثلثيتان وجسم بيضاوي وذيل مرفوع.', alt: ['حوشة'], draw: (d) => { d.circle(310, 235, 50); d.tri(270, 205, 285, 158, 300, 205); d.tri(340, 205, 355, 158, 370, 205); d.ellipse(445, 345, 105, 75); d.line(362, 412, 352, 480); d.line(528, 410, 520, 480); d.line(548, 318, 594, 286); d.circle(292, 228, 6); d.circle(332, 228, 6); d.circle(310, 252, 7); } },
  { word: 'أرنب', hint: 'أذنان بيضاويتان طويلتان وذيل دائري صغير.', draw: (d) => { d.circle(320, 260, 48); d.ellipse(292, 160, 22, 60); d.ellipse(348, 160, 22, 60); d.ellipse(440, 380, 115, 85); d.circle(555, 390, 24); d.circle(305, 255, 7); d.circle(335, 255, 7); } },
  { word: 'جمل', hint: 'جسم عريض أسفله أربع أرجل طويلة وفوقه سنامتان ورقبه رفيع.', draw: (d) => { d.ellipse(370, 360, 140, 70); d.arc(330, 350, 45, Math.PI, Math.PI * 2); d.arc(430, 350, 45, Math.PI, Math.PI * 2); d.line(285, 425, 280, 495); d.line(330, 428, 330, 495); d.line(410, 428, 410, 495); d.line(455, 425, 460, 495); d.line(505, 350, 548, 250); d.circle(552, 235, 26); } },
  { word: 'عصفور', hint: 'جسم بيضاوي صغير ورأس دائري بمنقار مثلث ورفارف قصيرة.', draw: (d) => { d.ellipse(360, 300, 85, 55); d.circle(452, 255, 30); d.tri(482, 250, 518, 252, 480, 264); d.arc(340, 295, 50, Math.PI * 0.9, Math.PI * 1.8); d.line(330, 350, 330, 395); d.line(385, 350, 385, 395); d.circle(455, 250, 5); } },
  { word: 'فراشة', hint: 'جسم رفيع طويل وحوله أربع دوائر كبيرة وقرون استشعار.', draw: (d) => { d.ellipse(360, 300, 20, 70); d.circle(285, 235, 58); d.circle(435, 235, 58); d.circle(300, 365, 52); d.circle(420, 365, 52); d.line(352, 230, 330, 185); d.line(368, 230, 390, 185); } },
  { word: 'نحلة', hint: 'جسم مخطط بخطوط عمودية وجناحان صغيران وذبابة بحادة.', draw: (d) => { d.ellipse(370, 300, 90, 50); d.line(330, 262, 330, 340); d.line(370, 252, 370, 350); d.line(410, 262, 410, 340); d.ellipse(355, 240, 40, 20); d.ellipse(395, 245, 36, 18); d.tri(280, 296, 280, 308, 248, 302); d.line(430, 270, 460, 240); } },
  { word: 'سلحفاة', hint: 'قبة نصف دائرة فوق خط أفقي ورأس صغير بجبهة.', draw: (d) => { d.arc(360, 350, 110, Math.PI, Math.PI * 2); d.line(250, 350, 470, 350); d.line(285, 352, 280, 405); d.line(445, 352, 450, 405); d.circle(508, 345, 26); d.circle(515, 338, 5); } },
  { word: 'فأر', hint: 'جسم بيضاوي صغير وذيل طويل وشرايات من وجنتيه.', draw: (d) => { d.ellipse(380, 320, 95, 60); d.circle(305, 255, 18); d.circle(340, 243, 16); d.line(472, 325, 565, 385); d.line(315, 335, 240, 325); d.line(315, 345, 240, 350); d.circle(310, 300, 6); d.circle(345, 295, 6); } },
  { word: 'فيل', hint: 'جسم ضخم وخرطوم معقوف وأذن دائرية جانبية.', draw: (d) => { d.ellipse(380, 330, 130, 88); d.circle(505, 265, 55); d.circle(462, 262, 38); d.line(530, 300, 550, 360); d.line(550, 360, 522, 398); d.line(300, 412, 300, 470); d.line(465, 415, 465, 470); d.line(255, 340, 228, 378); } },
  { word: 'ديك', hint: 'جسم عريض وعرف ثلاثي فوق رأسه وذيل مفترش بالقوس.', draw: (d) => { d.ellipse(355, 330, 105, 72); d.circle(470, 225, 36); d.circle(458, 185, 10); d.circle(472, 183, 10); d.circle(464, 172, 8); d.tri(506, 222, 538, 228, 504, 236); d.arc(265, 310, 80, -Math.PI * 1.2, Math.PI * 0.2); d.arc(275, 310, 55, -Math.PI * 1.2, Math.PI * 0.2); d.line(320, 400, 320, 465); d.line(390, 400, 390, 465); } },
  { word: 'بط', hint: 'رقبة قائمة قصيرة ورأس صغير بمنقار عريض.', draw: (d) => { d.ellipse(380, 345, 100, 62); d.line(468, 320, 492, 255); d.circle(497, 240, 26); d.arc(520, 242, 16, -Math.PI / 2, Math.PI / 2); d.arc(355, 335, 42, 0.4, 2.2); d.line(350, 405, 348, 445); d.line(410, 405, 412, 445); } },
  { word: 'إنسان', hint: 'رأس دائري وذراعان ورجلان ممدودتان.', alt: ['انسان', 'رجل'], draw: (d) => { d.circle(360, 190, 45); d.line(360, 235, 360, 365); d.line(360, 275, 280, 340); d.line(360, 275, 440, 340); d.line(360, 365, 298, 455); d.line(360, 365, 422, 455); } },
  { word: 'روبوت', hint: 'رأس مربع بسنون دائرية وهواية فوقه وبطن مربع.', draw: (d) => { d.rect(305, 155, 110, 85); d.circle(335, 195, 11); d.circle(385, 195, 11); d.line(335, 225, 385, 225); d.line(360, 155, 360, 120); d.circle(360, 112, 7); d.rect(312, 245, 96, 120); d.line(312, 275, 258, 320); d.line(408, 275, 462, 320); d.line(345, 365, 345, 415); d.line(375, 365, 375, 415); } },
  { word: 'حوت', hint: 'جسم هائل بذيل مثلثين ومنخرات بخار ماء من فوهته.', draw: (d) => { d.ellipse(340, 310, 150, 68); d.tri(485, 300, 565, 262, 565, 345); d.circle(410, 290, 7); d.tri(320, 348, 375, 395, 415, 348); d.line(305, 238, 295, 190); d.line(320, 238, 325, 185); } },
  { word: 'ملعقة', hint: 'بيضة صغيرة وسيخها طويل مائل.', draw: (d) => { d.ellipse(360, 285, 55, 36); d.line(395, 320, 525, 455); } },
  { word: 'شوكة', hint: 'سيخ طويل وثلاث أسنان رفيعة برأسه.', draw: (d) => { d.line(360, 230, 450, 470); d.line(320, 225, 315, 120); d.line(360, 218, 360, 112); d.line(400, 225, 408, 128); d.line(320, 225, 400, 225); } },
  { word: 'سكين', hint: 'قبضة مستطيلة ونصل طويل ينتهي بسن.', draw: (d) => { d.rect(230, 298, 70, 26); d.rect(300, 298, 225, 26); d.tri(525, 298, 525, 324, 552, 311); } },
  { word: 'قلم', hint: 'جسم رفيع طويل ويرنقه مثلث حاد.', draw: (d) => { d.rect(280, 280, 255, 22); d.tri(535, 280, 535, 302, 585, 291); d.line(280, 291, 535, 291); } },
  { word: 'مسطرة', hint: 'شريط طويل وعليه شرخ قصيرة متكررة.', draw: (d) => { d.rect(240, 280, 280, 32); for (let i = 0; i < 7; i++) { d.line(270 + i * 38, 280, 270 + i * 38, 294); } } },
  { word: 'مشط', hint: 'شريحة عريضة وأسنان رفيعة متجاورة تحته.', alt: ['مشط الشعر'], draw: (d) => { d.rect(250, 265, 240, 22); for (let i = 0; i < 12; i++) { d.line(258 + i * 20, 287, 258 + i * 20, 345); } } },
  { word: 'نظارة', hint: 'دائرتان متجاورتان وعلبة جسر بينهما وذراعان جانبيتان.', draw: (d) => { d.circle(302, 300, 46); d.circle(428, 300, 46); d.line(348, 300, 382, 300); d.line(256, 300, 218, 278); d.line(474, 300, 512, 278); } },
  { word: 'منبه', hint: 'دائرة كبيرة وعقاربها وجرسان فوقها ورجلان.', draw: (d) => { d.circle(360, 300, 82); d.arc(312, 222, 24, Math.PI * 1.15, Math.PI * 1.95); d.arc(408, 222, 24, Math.PI * 1.05, Math.PI * 1.85); d.line(312, 372, 300, 405); d.line(408, 372, 420, 405); d.line(360, 300, 360, 232); d.line(360, 300, 414, 300); } },
  { word: 'شمعة', hint: 'عمود رفيع طويل ولهب بيضاوي فوقه.', draw: (d) => { d.rect(335, 255, 50, 195); d.ellipse(360, 216, 13, 25); d.line(360, 238, 360, 255); d.line(320, 450, 400, 450); } },
  { word: 'كرة', hint: 'دائرة كبيرة وخطاها منحنيان يسار ويمين.', draw: (d) => { d.circle(360, 300, 108); d.arc(300, 300, 55, -Math.PI / 2, Math.PI / 2); d.arc(420, 300, 55, Math.PI / 2, Math.PI * 1.5); } },
  { word: 'كرة قدم', hint: 'دائرة كبيرة تحيط بها خطوط شعاعية من مركز صغير.', draw: (d) => { d.circle(360, 300, 105); d.circle(360, 300, 32); d.line(340, 270, 300, 210); d.line(380, 270, 420, 210); d.line(328, 300, 255, 295); d.line(392, 300, 465, 295); d.line(346, 330, 310, 385); d.line(374, 330, 410, 385); } },
  { word: 'كرة سلة', hint: 'دائرة بخط أفقي وسطها وقوسان جانبيان.', draw: (d) => { d.circle(360, 300, 105); d.line(255, 300, 465, 300); d.arc(310, 300, 45, -Math.PI / 2, Math.PI / 2); d.arc(410, 300, 45, Math.PI / 2, Math.PI * 1.5); } },
  { word: 'سلة', hint: 'شبه منحرف مقلوب وخطوط نسجه الأفقية وقوس يد.', draw: (d) => { d.line(262, 248, 298, 418); d.line(458, 248, 422, 418); d.line(298, 418, 422, 418); d.line(275, 300, 445, 300); d.line(288, 352, 432, 352); d.line(300, 395, 420, 395); d.arc(360, 248, 98, Math.PI, Math.PI * 2); } },
  { word: 'دلو', hint: 'شبه منحرف عريض فمه وعمته قوس فوقه.', draw: (d) => { d.line(300, 255, 282, 418); d.line(420, 255, 438, 418); d.line(282, 418, 438, 418); d.ellipse(360, 255, 60, 16); d.arc(360, 245, 82, Math.PI, Math.PI * 2); } },
  { word: 'صحن', hint: 'بيضتان متحدتا المركز مسطحتان.', draw: (d) => { d.ellipse(360, 325, 150, 42); d.ellipse(360, 325, 95, 26); } },
  { word: 'مكنسة', hint: 'عصا مائلة ورأس عريض تحته سنّان متفاوتة.', draw: (d) => { d.line(305, 145, 415, 415); d.rect(372, 405, 150, 28); d.line(388, 433, 388, 468); d.line(418, 433, 418, 468); d.line(448, 433, 448, 468); d.line(478, 433, 478, 468); d.line(505, 433, 505, 468); } },
  { word: 'خاتم', hint: 'دائرة صغيرة وفوقها معين حاد.', draw: (d) => { d.circle(360, 330, 58); d.tri(340, 272, 380, 272, 360, 236); d.line(340, 272, 382, 272); } },
  { word: 'تاج', hint: 'قاعدة عريضة تحمل ثلاث نقاط مثلثية.', draw: (d) => { d.rect(272, 330, 176, 38); d.tri(272, 330, 302, 252, 332, 330); d.tri(332, 330, 360, 228, 388, 330); d.tri(388, 330, 418, 252, 448, 330); d.circle(360, 346, 7); } },
  { word: 'مرساة', hint: 'حلقة علوية وسيخ طويل عريض وخط عرضي وقوسان أسفل.', draw: (d) => { d.circle(360, 182, 20); d.line(360, 202, 360, 415); d.line(300, 258, 420, 258); d.arc(305, 378, 52, -0.4, Math.PI / 2); d.arc(415, 378, 52, Math.PI / 2, Math.PI + 0.4); } },
  { word: 'مرآة', hint: 'بيضة كبيرة طويلة داخل إطار وعمود لعاب أسفلها.', alt: ['مرايا'], draw: (d) => { d.ellipse(360, 295, 118, 152); d.ellipse(360, 295, 92, 126); d.line(360, 447, 360, 508); d.circle(360, 515, 8); } },
  { word: 'سرير', hint: 'فرش عريض وعليه مخدة صغيرة ورجلان قصيرتان.', draw: (d) => { d.rect(175, 320, 370, 55); d.rect(190, 292, 110, 36); d.line(200, 375, 200, 418); d.line(520, 375, 520, 418); } },
  { word: 'كرسي', hint: 'ظهر رفيع ومقعد أفقي ورجلان مقلوبتان.', draw: (d) => { d.rect(290, 235, 30, 150); d.rect(285, 385, 140, 25); d.line(298, 410, 298, 470); d.line(410, 410, 410, 470); } },
  { word: 'طاولة', hint: 'سطح أفقي عريض وعليه رجلان مستقيمتان.', draw: (d) => { d.rect(235, 318, 250, 16); d.line(262, 334, 262, 445); d.line(458, 334, 458, 445); } },
  { word: 'باب', hint: 'مستطيل طويل وبه مقبض دائري جانبي.', draw: (d) => { d.rect(278, 215, 174, 295); d.circle(418, 368, 10); } },
  { word: 'شباك', hint: 'مربع مقسوم بخطين واحد عمودي وواحد أفقي.', draw: (d) => { d.rect(278, 215, 174, 205); d.line(365, 215, 365, 420); d.line(278, 318, 452, 318); } },
  { word: 'درج', hint: 'خطوات متدرجة الارتفاع حادة القمم.', alt: ['سلم', 'سلالم'], draw: (d) => { d.line(250, 430, 250, 380); d.line(250, 380, 300, 380); d.line(300, 380, 300, 330); d.line(300, 330, 350, 330); d.line(350, 330, 350, 280); d.line(350, 280, 400, 280); d.line(400, 280, 400, 230); d.line(400, 230, 450, 230); } },
  { word: 'هاتف', hint: 'مستطيل طويل بظل داخلي وزر صغير بأسفله.', alt: ['موبايل', 'تلفون'], draw: (d) => { d.rect(318, 185, 134, 268); d.rect(333, 215, 104, 205); d.circle(385, 455, 9); } },
  { word: 'كاميرا', hint: 'جسم عريض وعليه عدسة دائرية داخلية ومربع عظيم.', draw: (d) => { d.rect(268, 258, 224, 142); d.circle(345, 328, 45); d.circle(345, 328, 26); d.rect(400, 272, 62, 42); d.circle(474, 288, 10); } },
  { word: 'راديو', hint: 'صندوق فيه دائرة كبيرة ودائرة صغيرة وهواية مائلة.', draw: (d) => { d.rect(258, 258, 224, 132); d.line(482, 258, 548, 180); d.circle(300, 325, 34); d.circle(432, 325, 28); d.line(432, 300, 432, 325); } },
  { word: 'تلسكوب', hint: 'أنبوب طويل مائل واقف على ثلاثية أحجار.', draw: (d) => { d.line(250, 388, 445, 238); d.line(268, 404, 462, 254); d.line(445, 238, 462, 254); d.rect(226, 364, 44, 40); d.line(330, 396, 288, 478); d.line(330, 396, 378, 478); } },
  { word: 'بوصلة', hint: 'دائرة بها إبرة مائلة ونقاط على أطرافها.', draw: (d) => { d.circle(360, 300, 88); d.line(340, 258, 392, 342); d.circle(366, 300, 6); d.circle(360, 225, 5); d.circle(360, 375, 5); d.circle(285, 300, 5); d.circle(435, 300, 5); } },
  { word: 'سلة مهملات', hint: 'غطاء عريض وجسم مستطيل يضيق أسفله وخطوط عمودية عليه.', draw: (d) => { d.rect(278, 205, 182, 18); d.line(290, 225, 302, 418); d.line(430, 225, 418, 418); d.line(302, 418, 418, 418); d.line(335, 228, 338, 412); d.line(395, 228, 392, 412); } },
  { word: 'زجاجة', hint: 'بعنق رفيع وجسم عريض وطوق علوي.', draw: (d) => { d.rect(330, 300, 90, 180); d.rect(345, 220, 60, 80); d.line(345, 220, 405, 220); d.ellipse(375, 215, 32, 10); } },
  { word: 'ورقة', hint: 'مربع رفيع بزاوية مطوية وخطوط كتابة داخله.', draw: (d) => { d.rect(280, 220, 180, 240); d.tri(400, 220, 460, 280, 400, 280); d.line(310, 320, 430, 320); d.line(310, 360, 430, 360); d.line(310, 400, 390, 400); } },
  { word: 'نخلة', hint: 'جذع مقوس وسنه رفشات منحنية على كل اتجاه.', draw: (d) => { d.line(348, 470, 355, 230); d.line(370, 470, 362, 230); d.line(352, 420, 368, 420); d.line(350, 350, 370, 350); d.arc(360, 215, 85, Math.PI * 0.9, Math.PI * 1.5); d.arc(360, 215, 85, Math.PI * 1.6, Math.PI * 2.2); d.arc(360, 225, 70, -0.4, 0.9); d.arc(360, 225, 70, 2.2, 3.6); } },
  { word: 'عنب', hint: 'حبات دائرية متكدسة على قضيب رفيع.', draw: (d) => { d.line(360, 235, 360, 200); d.circle(345, 270, 24); d.circle(405, 270, 24); d.circle(320, 330, 28); d.circle(385, 330, 28); d.circle(450, 330, 24); d.circle(350, 390, 28); d.circle(420, 390, 28); d.circle(385, 440, 26); } },
  { word: 'خيار', hint: 'بيضة طويلة مائلة عليه نقاط صغيرة وعمود قصير برأسه.', draw: (d) => { d.ellipse(360, 320, 125, 48); d.circle(310, 310, 4); d.circle(350, 335, 4); d.circle(395, 305, 4); d.circle(430, 335, 4); d.rect(470, 270, 30, 18); } },
  { word: 'جزر', hint: 'مخروط طويل وفوقه رفشات خضراء منشقة.', draw: (d) => { d.tri(280, 420, 470, 290, 520, 365); d.line(470, 270, 470, 215); d.line(445, 275, 430, 225); d.line(495, 275, 510, 225); } },
  { word: 'فراولة', hint: 'مثلث مقلوب حاد الأسفل وعليه نقاط وفوقه رفشات.', draw: (d) => { d.tri(300, 290, 420, 290, 360, 430); d.tri(330, 270, 390, 270, 360, 240); d.line(360, 240, 360, 205); d.circle(350, 330, 4); d.circle(385, 335, 4); d.circle(365, 370, 4); d.circle(335, 360, 4); d.circle(395, 300, 4); } },
  { word: 'بطيخ', hint: 'دائرة ضخمة بعمود قصير وعليه نقاط داكنة.', alt: ['بطيخة'], draw: (d) => { d.circle(360, 320, 120); d.line(360, 200, 375, 170); d.circle(330, 290, 5); d.circle(390, 320, 5); d.circle(340, 360, 5); d.circle(410, 270, 5); } },
  { word: 'ذرة', hint: 'بيضة طويلة مغطاة بشبكة خطوط ومحاطة برفشات جانبية.', draw: (d) => { d.ellipse(360, 320, 75, 120); d.line(330, 215, 330, 425); d.line(360, 200, 360, 438); d.line(390, 215, 390, 425); d.line(310, 270, 410, 270); d.line(305, 350, 415, 350); d.line(360, 440, 360, 470); } },
  { word: 'سحابة', hint: 'ثلاث دوائر متراكبة تحددا خطاً سفلياً مستقيماً.', draw: (d) => { d.circle(300, 300, 55); d.circle(380, 270, 70); d.circle(460, 300, 55); d.line(250, 340, 500, 340); } },
  { word: 'مطر', hint: 'سحابة عالية وتحتها خطوط مائلة قصيرة تتساقط.', draw: (d) => { d.circle(300, 220, 45); d.circle(380, 195, 60); d.circle(450, 215, 45); d.line(260, 255, 490, 255); d.line(300, 300, 290, 345); d.line(360, 300, 350, 345); d.line(420, 300, 410, 345); d.line(330, 380, 320, 425); d.line(390, 380, 380, 425); } },
  { word: 'برق', hint: 'خط حاد يتنقطع وسط الشاشة بعد انكسارين — سبَق الرعد.', draw: (d) => { d.line(370, 170, 310, 330); d.line(310, 330, 380, 330); d.line(380, 330, 330, 500); } },
  { word: 'قوس قزح', hint: 'قوسان متحدا المركز يعلوان أرضية هادئة.', alt: ['قوس'], draw: (d) => { d.arc(360, 420, 200, Math.PI, Math.PI * 2); d.arc(360, 420, 150, Math.PI, Math.PI * 2); } },
  { word: 'ثلج', hint: 'نجم حاد تعترضه خطان متقاطعان وسطه.', draw: (d) => { d.star(360, 290, 120, 55); d.line(360, 170, 360, 410); d.line(240, 290, 480, 290); } },
  { word: 'جبل', hint: 'مثلث ضخم وقمته بيضاء وله قرين أصغر يخونه.', draw: (d) => { d.tri(180, 450, 340, 220, 500, 450); d.line(310, 270, 340, 220); d.line(340, 220, 370, 270); d.tri(410, 450, 520, 310, 610, 450); } },
  { word: 'بركان', hint: 'شبه منحرف بفوهة فاضعة وحمم تنصب من الجانبين.', draw: (d) => { d.line(280, 460, 340, 280); d.line(440, 460, 380, 280); d.line(340, 280, 380, 280); d.ellipse(360, 285, 25, 8); d.line(345, 290, 290, 390); d.line(375, 290, 430, 390); d.circle(360, 240, 15); d.circle(382, 213, 12); } },
  { word: 'جزيرة', hint: 'قبة أرضية وسط بحر خطي وعليها نخلة صغيرة.', draw: (d) => { d.arc(360, 420, 120, Math.PI, Math.PI * 2); d.line(180, 440, 560, 440); d.line(400, 340, 415, 270); d.arc(415, 265, 35, Math.PI * 0.85, Math.PI * 1.7); } },
  { word: 'موجة', hint: 'قوسان هائجان متتاليان على خط بحري.', draw: (d) => { d.arc(300, 360, 80, -Math.PI * 0.85, -Math.PI * 0.15); d.arc(420, 360, 80, -Math.PI * 0.85, -Math.PI * 0.15); d.line(170, 420, 560, 420); } },
  { word: 'قطرة ماء', hint: 'مغزل مدبب رأسه وإلى أسفل منتفخ.', draw: (d) => { d.arc(360, 335, 65, 0, Math.PI); d.line(296, 330, 360, 205); d.line(424, 330, 360, 205); } },
  { word: 'طائرة ورقية', hint: 'معين أرباعي مقسوم بخطي متقاطعين وذيله طويل يعقّب.', draw: (d) => { d.line(360, 200, 470, 320); d.line(470, 320, 360, 440); d.line(360, 440, 250, 320); d.line(250, 320, 360, 200); d.line(360, 200, 360, 440); d.line(250, 320, 470, 320); d.line(250, 320, 190, 400); d.line(200, 360, 230, 355); d.line(185, 395, 215, 390); } },
  { word: 'جيتار', hint: 'ثمانية أجسام دوائر متصلة وعنقها طويل وترنتاتها ممدودة.', draw: (d) => { d.circle(360, 380, 85); d.circle(360, 295, 55); d.rect(340, 150, 40, 100); d.rect(335, 120, 50, 35); d.line(350, 150, 350, 420); d.line(372, 150, 372, 420); } },
  { word: 'طبلة', hint: 'أسطوانة عريضة بيضاوية ولها عصوان ضرب', alt: ['دف'], draw: (d) => { d.ellipse(360, 330, 120, 45); d.ellipse(360, 330, 90, 30); d.line(430, 230, 500, 170); d.line(455, 250, 540, 220); } },
  { word: 'ريشة', hint: 'محور رفيع طويل يحيط به بروق منحنية كالورقة.', alt: ['ريشة طائر'], draw: (d) => { d.line(280, 460, 420, 180); d.arc(340, 320, 75, -1.1, 0.5); d.arc(380, 260, 75, Math.PI - 0.5, Math.PI + 1.1); d.tri(280, 460, 300, 470, 310, 440); } },
  { word: 'مبراة', hint: 'صندوق صغير فيه دويلة دائرية وبجبه فتحة مستطيلة.', draw: (d) => { d.rect(300, 280, 180, 90); d.circle(310, 330, 30); d.rect(430, 300, 40, 24); d.tri(480, 360, 540, 340, 520, 400); } },
  { word: 'محفظة', hint: 'ربع مستطيل بغطاء علوي مشدود وقفلته دائرية صغيرة.', draw: (d) => { d.rect(280, 300, 200, 110); d.line(280, 300, 360, 258); d.line(360, 258, 480, 258); d.line(480, 258, 480, 300); d.circle(430, 355, 10); } },
  { word: 'قفص', hint: 'قوس هندي فوق خط قاعدة وعليه قضبان رأسية.', draw: (d) => { d.arc(360, 300, 140, Math.PI, Math.PI * 2); d.line(220, 300, 500, 300); d.line(220, 300, 220, 440); d.line(500, 300, 500, 440); d.line(220, 440, 500, 440); d.line(270, 300, 270, 440); d.line(330, 300, 330, 440); d.line(390, 300, 390, 440); d.line(450, 300, 450, 440); } },
  { word: 'ميكروفون', hint: 'قفص بيضاوي رأسه وساق طويلة أعلاه وعقدة قارة بأسفله.', draw: (d) => { d.ellipse(360, 250, 40, 70); d.line(320, 250, 400, 250); d.line(360, 320, 360, 400); d.line(300, 440, 420, 440); d.line(360, 400, 360, 440); } },
  { word: 'سماعات', hint: 'قوس علوي منها كوبان مكتوم على الجانبين.', draw: (d) => { d.arc(360, 310, 105, Math.PI * 1.15, Math.PI * 1.85); d.rect(235, 285, 50, 85); d.rect(435, 285, 50, 85); } },
  { word: 'بطارية', hint: 'جسم مستطيل بنسميته شرطة وزائدة صغيرة وعليه زائد.', draw: (d) => { d.rect(300, 280, 180, 90); d.rect(480, 300, 25, 45); d.line(390, 280, 390, 370); d.line(330, 325, 370, 325); d.line(350, 305, 350, 345); } },
  { word: 'مطرقة', hint: 'رأس عريض معدني وعمود طويل من عينها.', draw: (d) => { d.rect(400, 240, 110, 55); d.line(410, 295, 250, 440); } },
  { word: 'ميزان', hint: 'عمود أوسط وذراع أفقي منه كلفتان معلقتان بقوس.', draw: (d) => { d.line(360, 180, 360, 430); d.line(240, 220, 480, 220); d.line(240, 220, 200, 245); d.line(240, 220, 280, 245); d.arc(240, 250, 40, 0, Math.PI); d.line(480, 220, 440, 245); d.line(480, 220, 520, 245); d.arc(480, 250, 40, 0, Math.PI); d.line(360, 430, 310, 455); d.line(360, 430, 410, 455); } },
  { word: 'عين', hint: 'لوز مفتوح بالقوسين إبرة داخلية — ورمشها تشمل.', alt: ['عيون'], draw: (d) => { d.arc(360, 330, 130, -Math.PI * 0.85, -Math.PI * 0.15); d.arc(360, 270, 130, Math.PI * 0.15, Math.PI * 0.85); d.circle(360, 300, 40); d.circle(360, 300, 18); d.line(280, 230, 255, 200); d.line(360, 215, 360, 185); d.line(440, 230, 465, 200); } },
  { word: 'قلعة', hint: 'برجان بتنشرفات وجدار أوسط وبوابة قوسية وسطه.', alt: ['حصن'], draw: (d) => { d.rect(235, 250, 75, 200); d.rect(410, 250, 75, 200); d.rect(310, 320, 100, 130); d.rect(235, 225, 30, 25); d.rect(280, 225, 30, 25); d.rect(410, 225, 30, 25); d.rect(455, 225, 30, 25); d.arc(360, 450, 38, Math.PI, Math.PI * 2); } },
  { word: 'جسر', hint: 'سطح أفقي طويل تحته قوس هائل وسندان بعيدان.', draw: (d) => { d.rect(160, 330, 420, 18); d.arc(370, 445, 170, Math.PI * 1.05, Math.PI * 1.95); d.line(230, 348, 230, 470); d.line(450, 348, 450, 470); } },
  { word: 'شاشة', hint: 'ربع عريض الوجه وقاعدته عمودية وقاعدة عريضة تحتها.', draw: (d) => { d.rect(250, 230, 260, 180); d.line(380, 410, 380, 450); d.rect(320, 450, 120, 18); d.rect(240, 480, 280, 25); } },
  { word: 'فكرة', hint: 'دائرة عائمة تحيط بها شرارات تتوهج من حولها.', alt: ['لمبة', 'مصباح'], draw: (d) => { d.circle(360, 270, 80); d.rect(335, 350, 50, 12); d.line(345, 290, 345, 330); d.line(375, 290, 375, 330); d.line(345, 330, 375, 330); d.line(360, 150, 360, 120); d.line(450, 180, 475, 155); d.line(270, 180, 245, 155); d.line(480, 270, 515, 270); d.line(240, 270, 205, 270); } },
  { word: 'بصمة', hint: 'أقواس متحدة المركز متقطعة لا يتشابه اثنان منها.', draw: (d) => { d.arc(360, 300, 35, 0.4, 2.4); d.arc(360, 300, 55, 2.6, 5.0); d.arc(360, 300, 75, 0.2, 2.6); d.arc(360, 300, 95, 2.2, 5.2); d.line(320, 385, 340, 400); } },
  { word: 'شبكة عنكبوت', hint: 'خطوط شعاعية من مركز تقطعها أقواس متجمعة.', alt: ['شبكة'], draw: (d) => { d.line(360, 180, 360, 420); d.line(240, 240, 480, 360); d.line(480, 240, 240, 360); d.arc(360, 300, 60, 0.35, 1.9); d.arc(360, 300, 60, 2.45, 4.0); d.arc(360, 300, 110, 0.35, 1.9); d.arc(360, 300, 110, 2.45, 4.0); d.arc(360, 300, 160, 0.35, 1.9); d.arc(360, 300, 160, 2.45, 4.0); } },
  { word: 'عنكبوت', hint: 'جسم دائري وسوطه رئيسي وثمانية أرجل منشقة.', draw: (d) => { d.circle(360, 300, 45); d.circle(360, 250, 28); d.line(320, 280, 260, 240); d.line(315, 300, 250, 300); d.line(320, 320, 260, 380); d.line(340, 335, 300, 400); d.line(400, 280, 460, 240); d.line(405, 300, 470, 300); d.line(400, 320, 460, 380); d.line(380, 335, 420, 400); } },
  { word: 'صحراء', hint: 'تلال رملية متدحرجة وشمس نصف ظاهرة فوقها.', alt: ['رمال'], draw: (d) => { d.arc(300, 430, 120, Math.PI, Math.PI * 2); d.arc(460, 445, 90, Math.PI, Math.PI * 2); d.arc(360, 180, 45, 0, Math.PI * 2); } },
];

// منع تداخل الجولات في نفس القناة — نفس حارس game.js المشترك (يجمع /game والأوامر المنفصلة وغارتيك)
const activeGartic = game.activeGames;
const preflightGamesError = game.preflightGamesError;

// سجل التكرار القريب لكل قناة — النص يقفل آخر 25 رسمة معروضة بالقناة حتى لا تتكرر
const recentByChannel = new Map();

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

  // مخربشات عشوائية أكثر (تزيد صعوبة التخمين)
  ctx.strokeStyle = 'rgba(150,150,150,0.30)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 13; i++) {
    const x1 = Math.random() * W;
    const y1 = Math.random() * H;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + (Math.random() - 0.5) * 220, y1 + (Math.random() - 0.5) * 220);
    ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, 8 + Math.random() * 20, 0, Math.PI * 2);
    ctx.stroke();
  }

  // الرسمة نفسها — تدوير عشوائي ±10 درجات وانعكاس أفقي أحياناً (صعوبة إضافية عادلة)
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate((Math.random() - 0.5) * 0.35);
  if (Math.random() < 0.5) ctx.scale(-1, 1);
  ctx.translate(-W / 2, -H / 2);
  const painter = new SketchPainter(ctx);
  item.draw(painter);
  ctx.restore();

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
    // ✅ الحجب قبل الـ defer — الرد الظوري يعمل قبل ما تتحول الرسالة لغير مؤقّتة
    // ✅ إغلاق سباق البدء: القفل يفتح ملاصقاً للفحص قبل أي await — نافذة defer ما تسمح بلقطة مزدوجة
    const settings = db.getGuildSettings ? (db.getGuildSettings(interaction.guild.id) || {}) : {};
    const err = preflightGamesError(interaction.channelId, interaction.guild.id, settings);
    if (err) return interaction.reply({ content: err, ephemeral: true });
    activeGartic.add(interaction.channel.id);
    try {
      await interaction.deferReply();
    } catch (e) {
      activeGartic.delete(interaction.channel.id);
      try { await interaction.reply({ content: '⚠️ تعذر بدء اللعبة الآن (تأخير بالشبكة) — جرّب مرة ثانية!', ephemeral: true }); } catch {}
      return;
    }
    return this.startGarticRound(interaction.channel, interaction.user, interaction.guild.id, (opts) => interaction.editReply(opts));
  },

  async executePrefix(message, args, client) {
    const settings = db.getGuildSettings ? (db.getGuildSettings(message.guild.id) || {}) : {};
    const err = preflightGamesError(message.channel.id, message.guild.id, settings);
    if (err) return message.reply({ content: err }).catch(() => {});
    return this.startGarticRound(message.channel, message.author, message.guild.id, async (opts) => {
      return message.reply(opts).catch(() => message.channel.send(opts));
    });
  },

  async startGarticRound(channel, starter, guildId, replyMethod) {
    // 🔒 الحجب (اللعبة الفعالة/تعطيل/الروم المخصص) مرت مسبقاً في execute/executePrefix — preflightGamesError
    const settings = db.getGuildSettings ? (db.getGuildSettings(guildId) || {}) : {};

    // اختيار عشوائي مع تجنّب التكرار القريب — آخر 25 رسمة معروضة بهذه القناة تُستبعد
    const pool = GARTIC_ITEMS.length;
    if (recentByChannel.size > 500) recentByChannel.clear();
    const recents = recentByChannel.get(channel.id) || [];
    const avoid = new Set(recents.slice(-Math.min(25, Math.floor(pool * 0.25))));
    let idx;
    do { idx = Math.floor(Math.random() * pool); } while (avoid.has(idx));

    const item = GARTIC_ITEMS[idx];
    // بدائل مقبولة: الكلمة الأساسية + بدائلها الاختيارية (مع/بدون مسافات)
    const answers = [item.word, ...(item.alt || [])].map(normalizeArabicText);
    const answersTight = answers.map(a => a.replace(/\s+/g, ''));
    const rewardCoins = Number(settings.game_reward_gartic) || 90;

    let buffer = null;
    try {
      buffer = renderSketch(item);
    } catch (e) {
      console.error('[Gartic] sketch render failed:', e);
      // ✅ فكّ القفل المسبق (السلقة يضيفه قبل defer) — مشوار فشل التوليد ما يخلي القناة مغلقة
      activeGartic.delete(channel.id);
      return replyMethod({ content: '❌ تعذر توليد الرسمة (خطأ داخلي). جرب مرة أخرى!' });
    }
    // ✅ سجل الرسمة بسجل التكرار فقط بعد نجاح التوليد — الفشل ما يحرق فرصة الرسمة
    recents.push(idx);
    recentByChannel.set(channel.id, recents.slice(-25));

    activeGartic.add(channel.id);
    let answered = false;
    let hintSent = false;
    let hintTimer = null;

    // 🛡️ حماية القفل: أي خطأ أثناء تجهيز الجولة يحرر القناة فوراً — ما تبقى مغلقة إلى رست البوت
    try {
      const attachment = new AttachmentBuilder(buffer, { name: 'gartic.png' });
      const embed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle('🎨 لعبة غارتيك — خمّن الرسمة!')
        .setDescription('**البوت رسم لوحة مشوشة لكلمة سرية…**\nشنو هذه الرسمة؟ اكتب الإجابة في الشات!\n\n⏱️ معك **30 ثانية فقط** — أول إجابة صحيحة تفوز.\n💡 تلميح بعد الـ 18 ثانية.')
        .setImage('attachment://gartic.png')
        .setFooter({ text: `الجائزة: ${rewardCoins} 🪙 | بدأها: ${starter.username}` })
        .setTimestamp();

      await replyMethod({ embeds: [embed], files: [attachment] });

      const filter = m => !m.author.bot;
      const collector = channel.createMessageCollector({ filter, time: 30000 });

      // تلميح بعد 18 ثانية (عدد الحروف بهمزات المسافات المستبعدة)
      hintTimer = setTimeout(() => {
        if (answered || hintSent) return;
        hintSent = true;
        const letters = item.word.replace(/\s+/g, '').length;
        channel.send(`💡 **تلميح:** ${item.hint}\n📝 الكلمة تتكون من **${letters} حروف**`).catch(() => {});
      }, 18000);

      collector.on('collect', async msg => {
        const guess = normalizeArabicText(msg.content);
        if (answers.includes(guess) || answersTight.includes(guess.replace(/\s+/g, ''))) {
          answered = true;
          hintSent = true;
          collector.stop('answered');
          clearTimeout(hintTimer);

          // 🎮 جائزة مرة وحدة باليوم عبر كل الألعاب
          let claim = { paid: true };
          try {
            if (db.claimGameReward) claim = db.claimGameReward(msg.author.id, guildId, rewardCoins);
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
            .setDescription(`عين صقر 🎯 مبروك يا ${msg.author}!\nالرسمة كانت: **${item.word}**\n\n${rewardLine}`)
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
    } catch (setupErr) {
      console.error('[Gartic] round setup failed:', setupErr);
      activeGartic.delete(channel.id);
      if (hintTimer) clearTimeout(hintTimer);
    }
  }
};
