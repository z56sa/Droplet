// مسّاح العقوبات التلقائي — يمسح التحذيرات القديمة حسب إعدادات كل سيرفر
const db = require('../database');
const { isEnabled } = require('./isEnabled');

let _started = false;
const PERIOD_MS = { day: 24 * 3600 * 1000, week: 7 * 24 * 3600 * 1000, '2weeks': 14 * 24 * 3600 * 1000, '3weeks': 21 * 24 * 3600 * 1000, month: 30 * 24 * 3600 * 1000 };

function sweepOnce() {
  try {
    const raw = db.db;
    if (!raw) return;
    let rows = [];
    try { rows = raw.prepare("SELECT guild_id, auto_clear_punishments, auto_clear_period, auto_clear_types FROM guild_settings WHERE auto_clear_punishments = 1").all(); } catch { return; }
    const nowSec = Math.floor(Date.now() / 1000);
    for (const r of rows) {
      try {
        if (!isEnabled(r.auto_clear_punishments, false)) continue;
        const periodMs = PERIOD_MS[String(r.auto_clear_period || 'week')] || PERIOD_MS.week;
        const cutoff = nowSec - Math.floor(periodMs / 1000);
        const types = String(r.auto_clear_types || 'all').toLowerCase();
        if (types === 'all' || types.includes('warn')) {
          try {
            const stale = raw.prepare('SELECT DISTINCT user_id FROM warnings WHERE guild_id = ? AND created_at < ?').all(r.guild_id, cutoff);
            raw.prepare('DELETE FROM warnings WHERE guild_id = ? AND created_at < ?').run(r.guild_id, cutoff);
            for (const s of stale) {
              try {
                const c = raw.prepare('SELECT COUNT(*) as n FROM warnings WHERE guild_id = ? AND user_id = ?').get(r.guild_id, s.user_id);
                raw.prepare('UPDATE users SET warnings = ? WHERE user_id = ? AND guild_id = ?').run(c.n || 0, s.user_id, r.guild_id);
              } catch {}
            }
          } catch {}
        }
      } catch {}
    }
  } catch {}
}

function ensureAutoClear() {
  if (_started) return;
  _started = true;
  setTimeout(sweepOnce, 60 * 1000); // أول مسح بعد دقيقة من الإقلاع
  setInterval(sweepOnce, 6 * 60 * 60 * 1000); // ثم كل 6 ساعات
}

module.exports = { ensureAutoClear, sweepOnce };
