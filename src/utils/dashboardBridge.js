/**
 * 🌉 dashboardBridge — جسر مزامنة البيانات من البوت إلى الداشبورد
 *
 * على Render كل خدمة إلها قرص مؤقت خاص، فلا يمكن تقاسم ملف SQLite.
 * عن طريق Turso غير مشغّل على الخدمتين، هذا الجسر يوصل البيانات تلقائياً:
 *   خدمة البوت (worker) تدفع كل مستخدمينها عبر HTTP إلى خدمة الداشبورد
 *   كل 3 دقائق + دفعة أولى بعد الإقلاع بـ 25 ثانية.
 *
 * الإعداد المطلوب (بدون أي سر جديد):
 *   - DASHBOARD_SYNC_URL  (على خدمة البوت فقط) — رابط الداشبورد
 *   - BOT_TOKEN           (موجود على الخدمتين أصلاً) — يُستخدم كتوكن مصادقة عبر هيدر x-sync-token
 */

const https = require('https');

const PUSH_INTERVAL_MS = 3 * 60 * 1000;   // كل 3 دقائق
const FIRST_PUSH_DELAY_MS = 25000;        // أول دفعة بعد الإقلاع
const MAX_ROWS_PER_PUSH = 3000;
const MAX_PROFILES_PER_PUSH = 2000;

let _pushing = false;
let _lastPush = { at: 0, ok: null, rows: 0, err: null };

function getDb(getLocalDb) {
  try {
    const db = getLocalDb ? getLocalDb() : require('../database').db;
    return db && db.prepare ? db : null;
  } catch (e) {
    return null;
  }
}

function collectRows(db) {
  const users = [];
  try {
    const rows = db.prepare(`
      SELECT user_id, guild_id, xp, level, coins, bank_balance, reputation,
             last_daily, last_work, last_message_xp, wallpaper, warnings, streak
      FROM users
      WHERE coins > 0 OR xp > 0 OR reputation > 0 OR streak > 0
      LIMIT ${MAX_ROWS_PER_PUSH}
    `).all();
    const ids = rows.map(r => String(r.user_id));
    let profiles = [];
    if (ids.length) {
      // نجيب البروفايلات للهوية المؤهلة فقط (INchunks لتفادي حدود SQL)
      const profilesMap = new Map();
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const ph = chunk.map(() => '?').join(', ');
        try {
          const pRows = db.prepare(`SELECT user_id, username, display_name, avatar, avatar_url, updated_at FROM user_profiles WHERE user_id IN (${ph})`).all(...chunk);
          for (const p of pRows) profilesMap.set(String(p.user_id), p);
        } catch (e) {}
      }
      profiles = [...profilesMap.values()].slice(0, MAX_PROFILES_PER_PUSH);
    }
    return { users: rows, profiles };
  } catch (e) {
    return { users: [], profiles: [] };
  }
}

// https core (بدل fetch — مضمون بأنه يعمل بكل نسخ Node التي يدعمها البوت)
function postJson(urlString, payload, token, timeoutMs = 12000) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlString);
      const body = JSON.stringify(payload);
      const options = {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + (u.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'x-sync-token': token || '',
          'User-Agent': 'Droplet-Bot-Bridge'
        },
        timeout: timeoutMs
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch (e) {}
          resolve({ status: res.statusCode, json });
        });
      });
      req.on('timeout', () => { req.destroy(new Error('timeout')); });
      req.on('error', (e) => resolve({ status: 0, json: null, err: e.message }));
      req.write(body);
      req.end();
    } catch (e) {
      resolve({ status: 0, json: null, err: e.message });
    }
  });
}

async function pushOnce(getLocalDb) {
  if (_pushing) return;
  const token = process.env.BOT_TOKEN;
  const target = String(process.env.DASHBOARD_SYNC_URL || '').trim();
  if (!target || !token) return;
  const db = getDb(getLocalDb);
  if (!db) return;

  // لا تدفع شي لو الجدول فارغ
  try {
    const count = db.prepare('SELECT COUNT(*) as n FROM users').get()?.n || 0;
    if (count === 0) return;
  } catch (e) { return; }

  _pushing = true;
  try {
    const { users, profiles } = collectRows(db);
    if (!users.length) { _lastPush = { at: Date.now(), ok: true, rows: 0, err: null }; return; }
    const res = await postJson(target + '/internal/sync/users', { users, profiles }, token);
    const ok = res.status === 200;
    _lastPush = { at: Date.now(), ok, rows: ok ? (res.json?.inserted || 0) : 0, err: ok ? null : `HTTP ${res.status}${res.err ? ' ' + res.err : ''}` };
    if (ok) {
      console.log(`[BRIDGE] 📤 Pushed ${users.length} users + ${profiles.length} profiles to dashboard.`);
    } else {
      console.error('[BRIDGE] ⚠️ Push failed:', _lastPush.err);
    }
  } catch (e) {
    _lastPush = { at: Date.now(), ok: false, rows: 0, err: e.message };
    console.error('[BRIDGE] ⚠️ Push error:', e.message);
  } finally {
    _pushing = false;
  }
}

function start(getLocalDb) {
  const target = String(process.env.DASHBOARD_SYNC_URL || '').trim();
  if (!target) {
    console.log('[BRIDGE] ℹ️ DASHBOARD_SYNC_URL not set — bot→dashboard bridge disabled.');
    return;
  }
  console.log(`[BRIDGE] ✅ Bot→Dashboard bridge enabled → ${target} (every 3 minutes).`);
  const loop = () => pushOnce(getLocalDb);
  setTimeout(loop, FIRST_PUSH_DELAY_MS);
  setInterval(loop, PUSH_INTERVAL_MS);
  // بعد الإقلاع بشوي نبوش مرة ثانية إذا أول دفعة فشلت (بعد ما discord ready)
  setTimeout(loop, FIRST_PUSH_DELAY_MS + 45000);
}

module.exports = { start, pushOnce, getState: () => _lastPush };
