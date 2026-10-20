/**
 * ✅ مُهذّب الروابط الخارجية (Defense-in-depth للـ SSRF)
 *
 * نفس قواعد isSafeWallpaperUrl في أمر setwallpaper — مستخدمة وقت الرندر
 * (canvas.js) حتى لو أتى الرابط من صف قديم في قاعدة البيانات قُبل صفّ الأوامر:
 * https فقط، حد طول، بلا كوين، بلا localhost/.local/.internal،
 * بلا IPv6 literal، وبلا مجالات خاصة (127/0/10/192.168/169.254/172.16-31).
 */
function isSafeExternalUrl(raw) {
  try {
    if (!raw || typeof raw !== 'string' || raw.length > 500) return false;
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    if (!u.hostname) return false;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
    if (h.startsWith('[')) return false; // IPv6 literal
    if (/^(127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(h)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    return true;
  } catch {
    return false;
  }
}

module.exports = { isSafeExternalUrl };
