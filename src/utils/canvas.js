const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

// تسجيل الخطوط لضمان وضوح النصوص في ديسكورد وCanvas
try {
  const fontsDir = process.env.WINDIR ? path.join(process.env.WINDIR, 'Fonts') : 'C:\\Windows\\Fonts';
  if (fs.existsSync(path.join(fontsDir, 'arial.ttf'))) {
    GlobalFonts.registerFromPath(path.join(fontsDir, 'arial.ttf'), 'MainFont');
  }
  if (fs.existsSync(path.join(fontsDir, 'arialbd.ttf'))) {
    GlobalFonts.registerFromPath(path.join(fontsDir, 'arialbd.ttf'), 'MainFontBold');
  }
  if (fs.existsSync(path.join(fontsDir, 'segoeuib.ttf'))) {
    GlobalFonts.registerFromPath(path.join(fontsDir, 'segoeuib.ttf'), 'SegoeUIBold');
  }
} catch (e) {}

const numFmt = new Intl.NumberFormat('en-US');

// رسم شارة فيكتور دائرية احترافية ذات إطار نيون
function drawEmblemBadge(ctx, x, y, size, type, active = true) {
  ctx.save();
  ctx.translate(x, y);

  if (!active) {
    ctx.globalAlpha = 0.22;
  }

  // إطار الكبسولة الزجاجية للشارة
  ctx.fillStyle = active ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)';
  ctx.strokeStyle = active ? 'rgba(255, 255, 255, 0.28)' : 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (active) {
    ctx.shadowBlur = 8;
  }

  if (type === 'diamond') {
    if (active) ctx.shadowColor = '#00f2fe';
    const grad = ctx.createLinearGradient(-size/2, -size/2, size/2, size/2);
    grad.addColorStop(0, '#00f2fe');
    grad.addColorStop(1, '#4facfe');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.55);
    ctx.lineTo(size * 0.55, 0);
    ctx.lineTo(0, size * 0.55);
    ctx.lineTo(-size * 0.55, 0);
    ctx.closePath();
    ctx.fill();
  } else if (type === 'crown') {
    if (active) ctx.shadowColor = '#FFE600';
    const grad = ctx.createLinearGradient(0, -size/2, 0, size/2);
    grad.addColorStop(0, '#FFE600');
    grad.addColorStop(1, '#FF8A00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, size * 0.3);
    ctx.lineTo(-size * 0.5, -size * 0.2);
    ctx.lineTo(-size * 0.2, 0);
    ctx.lineTo(0, -size * 0.4);
    ctx.lineTo(size * 0.2, 0);
    ctx.lineTo(size * 0.5, -size * 0.2);
    ctx.lineTo(size * 0.5, size * 0.3);
    ctx.closePath();
    ctx.fill();
  } else if (type === 'bolt') {
    if (active) ctx.shadowColor = '#ff007f';
    const grad = ctx.createLinearGradient(0, -size/2, 0, size/2);
    grad.addColorStop(0, '#ff007f');
    grad.addColorStop(1, '#7928ca');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(size * 0.1, -size * 0.5);
    ctx.lineTo(-size * 0.35, 0.05);
    ctx.lineTo(-size * 0.05, 0.05);
    ctx.lineTo(-size * 0.15, size * 0.5);
    ctx.lineTo(size * 0.4, -0.05);
    ctx.lineTo(size * 0.1, -0.05);
    ctx.closePath();
    ctx.fill();
  } else if (type === 'shield') {
    if (active) ctx.shadowColor = '#2ed573';
    const grad = ctx.createLinearGradient(0, -size/2, 0, size/2);
    grad.addColorStop(0, '#2ed573');
    grad.addColorStop(1, '#10ac84');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.45);
    ctx.lineTo(size * 0.4, -size * 0.25);
    ctx.lineTo(size * 0.4, size * 0.1);
    ctx.quadraticCurveTo(size * 0.35, size * 0.4, 0, size * 0.5);
    ctx.quadraticCurveTo(-size * 0.35, size * 0.4, -size * 0.4, size * 0.1);
    ctx.lineTo(-size * 0.4, -size * 0.25);
    ctx.closePath();
    ctx.fill();
  } else if (type === 'star') {
    if (active) ctx.shadowColor = '#a55eea';
    const grad = ctx.createLinearGradient(0, -size/2, 0, size/2);
    grad.addColorStop(0, '#a55eea');
    grad.addColorStop(1, '#8854d0');
    ctx.fillStyle = grad;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const r = (size * 0.5);
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

const canvasUtil = {
  /**
   * إنشاء بطاقة ترحيب عصرية
   */
  async createWelcomeCard(member) {
    const width = 800;
    const height = 350;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#0f172a');
    bgGradient.addColorStop(0.5, '#1e1b4b');
    bgGradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    const centerX = width / 2;
    const avatarY = 110;
    const avatarRadius = 60;

    try {
      const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
      const avatar = await loadImage(avatarURL);

      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, avatarY, avatarRadius, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, centerX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
      ctx.restore();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(centerX, avatarY, avatarRadius, 0, Math.PI * 2);
      ctx.stroke();
    } catch {}

    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('WELCOME TO THE SERVER', centerX, 210);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    const tag = member.user.username;
    ctx.fillText(tag.length > 20 ? tag.substring(0, 18) + '...' : tag, centerX, 255);

    ctx.fillStyle = '#818cf8';
    ctx.font = '18px sans-serif';
    ctx.fillText(`Member #${member.guild.memberCount}`, centerX, 295);

    return canvas.toBuffer('image/png');
  },

  /**
   * إنشاء بطاقة المستوى (Rank Card)
   */
  async createRankCard(member, xpData) {
    const width = 800;
    const height = 240;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#111827';
    ctx.roundRect(20, 20, width - 40, height - 40, 20);
    ctx.fill();

    const avatarX = 60;
    const avatarY = 60;
    const avatarRadius = 60;

    try {
      const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
      const avatar = await loadImage(avatarURL);

      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarRadius, avatarY + avatarRadius, avatarRadius, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarRadius * 2, avatarRadius * 2);
      ctx.restore();

      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(avatarX + avatarRadius, avatarY + avatarRadius, avatarRadius, 0, Math.PI * 2);
      ctx.stroke();
    } catch {}

    const textStartX = 210;

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(member.user.username, textStartX, 80);

    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#6366f1';
    ctx.textAlign = 'right';
    ctx.fillText(`RANK #${numFmt.format(xpData.rank || 1)}`, width - 60, 80);
    ctx.fillText(`LEVEL ${numFmt.format(xpData.level || 0)}`, width - 200, 80);

    // الخبرة المخزنة هي التقدم داخل اللفل الحالي، والمطلوب = لفل * 150 + 100 (نفس معادلة addXp)
    const currentLevel = xpData.level || 1;
    const neededXp = Math.max(1, Math.floor(currentLevel * 150 + 100));
    const progressXp = Math.max(0, xpData.xp || 0);
    const progressPercent = Math.min(1, progressXp / neededXp);

    const barX = textStartX;
    const barY = 135;
    const barWidth = width - textStartX - 60;
    const barHeight = 24;

    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, 12);
    ctx.fill();

    const fillGradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
    fillGradient.addColorStop(0, '#4f46e5');
    fillGradient.addColorStop(1, '#06b6d4');
    ctx.fillStyle = fillGradient;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth * progressPercent, barHeight, 12);
    ctx.fill();

    ctx.fillStyle = '#9ca3af';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${numFmt.format(xpData.xp || 0)} / ${numFmt.format(neededXp)} XP`, width - 60, 125);

    return canvas.toBuffer('image/png');
  },

  /**
   * إنشاء بطاقة بروفايل وهوية أسطورية بستايل البانر الواقعي الاحترافي (ProBot Banner Style)
   */
  async createProfileCard(member, userData = {}, rankData = {}) {
    const width = 920;
    const height = 430;
    const bannerHeight = 175;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const wallpaperUrl = userData.wallpaper_url || 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=960&q=80';

    // 1. قص الكرت بزوايا دائرية فاخرة (Card Outer Clip)
    const cardRadius = 26;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, cardRadius);
    ctx.clip();

    // 2. خلفية جسم الكرت السفلي الداكن الفخم
    ctx.fillStyle = '#0d111d';
    ctx.fillRect(0, 0, width, height);

    // 3. رسم بانر الخلفية العلوي الكامل (Top Banner) بدون أي تشويش
    try {
      const bgImg = await loadImage(wallpaperUrl);
      ctx.drawImage(bgImg, 0, 0, width, bannerHeight);
    } catch {
      const grad = ctx.createLinearGradient(0, 0, width, bannerHeight);
      grad.addColorStop(0, '#1e1b4b');
      grad.addColorStop(0.5, '#312e81');
      grad.addColorStop(1, '#0f172a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, bannerHeight);
    }

    // تدرج ظل سفلي خفيف جداً على حافة البانر ليدمج بسلاسة مع الجسم
    const bannerFade = ctx.createLinearGradient(0, bannerHeight - 45, 0, bannerHeight);
    bannerFade.addColorStop(0, 'rgba(13, 17, 29, 0)');
    bannerFade.addColorStop(1, 'rgba(13, 17, 29, 0.95)');
    ctx.fillStyle = bannerFade;
    ctx.fillRect(0, bannerHeight - 45, width, 45);

    // 4. خط فاصل نيون متدرج خفيف أسفل البانر
    const sepGrad = ctx.createLinearGradient(0, bannerHeight, width, bannerHeight);
    sepGrad.addColorStop(0, 'rgba(88, 101, 242, 0.6)');
    sepGrad.addColorStop(0.5, 'rgba(0, 242, 254, 0.8)');
    sepGrad.addColorStop(1, 'rgba(255, 215, 0, 0.6)');
    ctx.fillStyle = sepGrad;
    ctx.fillRect(0, bannerHeight - 1, width, 2);

    // 5. الأفاتار المتداخل الأيقوني (Overlapping Avatar)
    const avatarRadius = 58;
    const avatarX = 55;
    const avatarY = bannerHeight - 60;

    // هالة نيون مشعة خلف الأفاتار
    const glowGrad = ctx.createRadialGradient(avatarX + avatarRadius, avatarY + avatarRadius, 30, avatarX + avatarRadius, avatarY + avatarRadius, 90);
    glowGrad.addColorStop(0, 'rgba(88, 101, 242, 0.55)');
    glowGrad.addColorStop(0.6, 'rgba(0, 242, 254, 0.25)');
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(avatarX + avatarRadius, avatarY + avatarRadius, 90, 0, Math.PI * 2);
    ctx.fill();

    // إطار قص الأفاتار مع حافة سميكة
    ctx.save();
    // دائرة خارجية سميكة بلون الخلفية
    ctx.fillStyle = '#0d111d';
    ctx.beginPath();
    ctx.arc(avatarX + avatarRadius, avatarY + avatarRadius, avatarRadius + 6, 0, Math.PI * 2);
    ctx.fill();

    try {
      const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
      const avatar = await loadImage(avatarURL);

      ctx.beginPath();
      ctx.arc(avatarX + avatarRadius, avatarY + avatarRadius, avatarRadius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarRadius * 2, avatarRadius * 2);
    } catch {}
    ctx.restore();

    // إطار الأفاتار النيون المضيء
    const avatarRing = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarRadius * 2, avatarY + avatarRadius * 2);
    avatarRing.addColorStop(0, '#00f2fe');
    avatarRing.addColorStop(0.5, '#5865F2');
    avatarRing.addColorStop(1, '#ff007f');
    ctx.strokeStyle = avatarRing;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(avatarX + avatarRadius, avatarY + avatarRadius, avatarRadius, 0, Math.PI * 2);
    ctx.stroke();

    // نقطة الحالة الخضراء المضيئة (Online Dot)
    const dotX = avatarX + avatarRadius * 1.65;
    const dotY = avatarY + avatarRadius * 1.65;
    ctx.fillStyle = '#2ed573';
    ctx.beginPath();
    ctx.arc(dotX, dotY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0d111d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 9, 0, Math.PI * 2);
    ctx.stroke();

    // 6. كبسولة المستوى (LVL Badge)
    const levelPillX = avatarX + avatarRadius;
    const levelPillY = avatarY + avatarRadius * 2 + 18;
    const lvlGrad = ctx.createLinearGradient(levelPillX - 42, levelPillY, levelPillX + 42, levelPillY);
    lvlGrad.addColorStop(0, '#5865F2');
    lvlGrad.addColorStop(1, '#4752c4');
    ctx.fillStyle = lvlGrad;
    ctx.beginPath();
    ctx.roundRect(levelPillX - 42, levelPillY - 13, 84, 26, 13);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`LVL ${numFmt.format(rankData.level || 1)}`, levelPillX, levelPillY + 4);

    // 7. بيانات المستخدم (الاسم، المعرف، والشارات)
    const infoStartX = 195;

    // اسم المستخدم
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'left';
    const username = member.user.username;
    ctx.fillText(username.length > 16 ? username.substring(0, 14) + '..' : username, infoStartX, 215);

    // وسم المستخدم أو الحالة
    ctx.fillStyle = '#8c96ab';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`@${username} • Droplet MEMBER`, infoStartX, 238);

    // كبسولة الشارات المعتمدة الديناميكية
    const badgesStartX = width - 235;
    const badgesY = 205;
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(badgesStartX - 10, badgesY - 16, 190, 34, 17);
    ctx.fill();
    ctx.stroke();

    const memberBadges = userData.badges || {};
    const hasOwner = Boolean(memberBadges.owner ?? (member.guild?.ownerId === member.id));
    const hasAdmin = Boolean(memberBadges.admin ?? (member.permissions?.has('Administrator') || member.permissions?.has('ManageGuild')));
    const hasBooster = Boolean(memberBadges.booster ?? Boolean(member.premiumSince));
    const hasActive = Boolean(memberBadges.active ?? ((rankData.level || 1) >= 5 || (userData.streak || 0) >= 3));
    const hasVip = Boolean(memberBadges.vip ?? ((userData.coins || 0) >= 10000 || (rankData.level || 1) >= 15));

    drawEmblemBadge(ctx, badgesStartX + 10, badgesY, 13, 'crown', hasOwner);
    drawEmblemBadge(ctx, badgesStartX + 46, badgesY, 13, 'shield', hasAdmin);
    drawEmblemBadge(ctx, badgesStartX + 82, badgesY, 13, 'bolt', hasBooster);
    drawEmblemBadge(ctx, badgesStartX + 118, badgesY, 13, 'star', hasActive);
    drawEmblemBadge(ctx, badgesStartX + 154, badgesY, 13, 'diamond', hasVip);

    // 8. صناديق الإحصائيات الأنيقة (Stat Cards)
    const statsY = 262;
    const statBoxWidth = 210;
    const statBoxHeight = 62;
    const statGap = 16;
    const statsStartX = infoStartX;

    const coinsAmount = Number(userData.coins ?? userData.credits ?? 0);
    const coinText = coinsAmount >= 999999999999999 ? 'UNLIMITED' : numFmt.format(coinsAmount);

    const repAmount = Number(userData.reputation ?? userData.rep ?? 0);

    const stats = [
      { label: 'GOLD COINS', val: coinText, color: '#F59E0B', isCoin: true },
      { label: 'RANK', val: `#${numFmt.format(rankData.rank || 1)}`, color: '#2ed573' },
      { label: 'REPUTATION', val: `+${numFmt.format(repAmount)} REP`, color: '#a55eea' }
    ];

    function drawVectorCoin(targetCtx, cx, cy, r) {
      targetCtx.save();
      // عملة ذهبية مع حلقة داخلية وحرف G
      const coinGrad = targetCtx.createRadialGradient(cx - r*0.3, cy - r*0.3, 1, cx, cy, r);
      coinGrad.addColorStop(0, '#FFE259');
      coinGrad.addColorStop(1, '#FFA751');
      targetCtx.fillStyle = coinGrad;
      targetCtx.beginPath();
      targetCtx.arc(cx, cy, r, 0, Math.PI * 2);
      targetCtx.fill();

      targetCtx.strokeStyle = '#D97706';
      targetCtx.lineWidth = 1.2;
      targetCtx.stroke();

      // حافة داخلية
      targetCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      targetCtx.lineWidth = 0.8;
      targetCtx.beginPath();
      targetCtx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
      targetCtx.stroke();

      // حرف G ذهبي أنيق في المنتصف
      targetCtx.fillStyle = '#78350F';
      targetCtx.font = `bold ${Math.round(r * 1.05)}px sans-serif`;
      targetCtx.textAlign = 'center';
      targetCtx.textBaseline = 'middle';
      targetCtx.fillText('🪙', cx, cy);
      targetCtx.restore();
    }

    stats.forEach((s, idx) => {
      const bx = statsStartX + (idx * (statBoxWidth + statGap));
      
      // خلفية الصندوق الزجاجي
      ctx.fillStyle = 'rgba(20, 26, 44, 0.65)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, statsY, statBoxWidth, statBoxHeight, 14);
      ctx.fill();
      ctx.stroke();

      // شريط أيسر ملون
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.roundRect(bx + 2, statsY + 10, 3.5, statBoxHeight - 20, 2);
      ctx.fill();

      // العنوان
      ctx.fillStyle = '#8c96ab';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(s.label, bx + 16, statsY + 24);

      // القيمة
      ctx.fillStyle = s.color;
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText(s.val, bx + 16, statsY + 48);

      // أيقونة العملة الذهبية لخانة GOLD
      if (s.isCoin) {
        const textWidth = ctx.measureText(s.val).width;
        drawVectorCoin(ctx, bx + 16 + textWidth + 14, statsY + 42, 8.5);
      }
    });

    // 9. شريط تقدم الخبرة الفاخر (XP Bar)
    const barX = 55;
    const barY = 352;
    const barWidth = width - 110;
    const barHeight = 24;

    // الخبرة المخزنة هي التقدم داخل اللفل الحالي، والمطلوب = لفل * 150 + 100 (نفس معادلة addXp)
    const currentLevel = rankData.level || 1;
    const neededXp = Math.max(1, Math.floor(currentLevel * 150 + 100));
    const progressXp = Math.max(0, rankData.xp || 0);
    const progressPercent = Math.min(1, progressXp / neededXp);

    // خلفية الشريط
    ctx.fillStyle = 'rgba(20, 26, 44, 0.85)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, 12);
    ctx.fill();
    ctx.stroke();

    // تعبئة الشريط بتدرج نيون متناسق
    const fillGrad = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
    fillGrad.addColorStop(0, '#5865F2');
    fillGrad.addColorStop(0.5, '#00f2fe');
    fillGrad.addColorStop(1, '#2ed573');
    
    ctx.fillStyle = fillGrad;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth * progressPercent, barHeight, 12);
    ctx.fill();

    // لمسة إضاءة علوية
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.roundRect(barX + 2, barY + 2, (barWidth * progressPercent) - 4, (barHeight / 2) - 2, 8);
    ctx.fill();

    // نصوص الـ XP والنسبة
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`XP: ${numFmt.format(rankData.xp || 0)} / ${numFmt.format(neededXp)}`, barX + 14, barY + 16);

    ctx.textAlign = 'right';
    const percentText = `${Math.round(progressPercent * 100)}%`;
    ctx.fillText(percentText, barX + barWidth - 14, barY + 16);

    // 10. إطار الكرت الخارجي الفاخر
    ctx.restore(); // استعادة بعد القص الدائري
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, cardRadius);
    ctx.stroke();

    return canvas.toBuffer('image/png');
  },

  /**
   * إنشاء بطاقة لعبة أسرع كتابة (Fast Type Card)
   */
  async createFastTypeCard(word, seconds = 20) {
    const width = 800;
    const height = 260;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. خلفية زجاجية متدرجة فخمة
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#0a0a14');
    bgGrad.addColorStop(0.5, '#18122B');
    bgGrad.addColorStop(1, '#0a0a14');
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 20);
    ctx.fill();

    // 2. إطار نيون أرجواني متوهج
    ctx.strokeStyle = '#9333ea';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 20);
    ctx.stroke();

    // 3. توهج خلف الكلمة
    const glowGrad = ctx.createRadialGradient(width / 2, height / 2 + 10, 10, width / 2, height / 2 + 10, 260);
    glowGrad.addColorStop(0, 'rgba(147, 51, 234, 0.35)');
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, width, height);

    // 4. العنوان العلوي
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c084fc';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('⚡ تحدي أسرع كتابة | FAST TYPE ⚡', width / 2, 45);

    // 5. صندوق الكلمة النيون
    const boxW = 600;
    const boxH = 90;
    const boxX = (width - boxW) / 2;
    const boxY = 70;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 16);
    ctx.fill();
    ctx.stroke();

    // 6. نص الكلمة داخل الصندوق
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(word, width / 2, boxY + 58);

    // 7. التذييل
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`⏱️ لديك ${seconds} ثانية — اكتب الكلمة في الشات الآن لتفوز بالجوائز!`, width / 2, 205);

    return canvas.toBuffer('image/png');
  },

  /**
   * إنشاء بطاقة سؤال وجواب (Trivia Card)
   */
  async createTriviaCard(question, seconds = 20) {
    const width = 800;
    const height = 280;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // خلفية
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#0c0e17');
    bgGrad.addColorStop(0.5, '#1e1633');
    bgGrad.addColorStop(1, '#0c0e17');
    ctx.fillStyle = bgGrad;
    ctx.roundRect(0, 0, width, height, 24);
    ctx.fill();

    // إطار نيون
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
    ctx.lineWidth = 3;
    ctx.roundRect(0, 0, width, height, 24);
    ctx.stroke();

    // عنوان
    ctx.textAlign = 'center';
    ctx.fillStyle = '#818cf8';
    ctx.font = 'bold 22px MainFontBold, sans-serif';
    ctx.fillText('❓ سؤال وجواب | TRIVIA QUIZ', width / 2, 55);

    // صندوق السؤال
    const boxW = 680;
    const boxH = 90;
    const boxX = (width - boxW) / 2;
    const boxY = 85;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 20);
    ctx.fill();
    ctx.stroke();

    // نص السؤال
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px MainFontBold, sans-serif';
    ctx.fillText(question, width / 2, boxY + 54);

    // الإرشادات
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 15px MainFont, sans-serif';
    ctx.fillText(`⏱️ اضغط على زر الإجابة الصحيحة بالأسفل خلال ${seconds} ثانية`, width / 2, 225);

    return canvas.toBuffer('image/png');
  }
};

module.exports = canvasUtil;
