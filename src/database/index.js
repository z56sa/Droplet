// ========================================================
// FILE: src/database/index.js
// قاعدة بيانات SQLite متزامنة (Synchronous) باستخدام better-sqlite3
// ========================================================
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const tursoSync = require('./tursoSync');

// مجلد البيانات (يدعم Persistent Volume في Railway أو أي استضافة عبر متغير البيئة DATA_DIR أو DATABASE_PATH)
const customDbPath = process.env.DATABASE_PATH;
let dbPath;

if (customDbPath) {
  const dir = path.dirname(customDbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  dbPath = customDbPath;
} else {
  const customDataDir = process.env.DATA_DIR || path.join(__dirname, '../../data');
  if (!fs.existsSync(customDataDir)) fs.mkdirSync(customDataDir, { recursive: true });
  dbPath = path.join(customDataDir, 'zeno.db');
}

const db = new Database(dbPath);

// تحسين الأمان واستقرار حفظ البيانات لضمان عدم ضياع العملات أو البيانات عند إطفاء البوت
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');   // FULL كان يجعل كل write تنتظر disk flush - NORMAL آمن مع WAL وأسرع بكثير
db.pragma('wal_autocheckpoint = 100');
db.pragma('foreign_keys = ON');
db.pragma('cache_size = -32000');    // 32MB cache للقراءة السريعة
db.pragma('temp_store = MEMORY');    // العمليات المؤقتة في الذاكرة
db.pragma('mmap_size = 134217728'); // 128MB memory-mapped I/O

// حفظ نسخة احتياطية فورية تلقائية كل 5 دقائق
setInterval(() => {
  try {
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, 'zeno_auto_backup.db');
    db.backup(backupFile).catch(err => console.error('[DB-BACKUP] Error:', err.message));
  } catch (e) {}
}, 5 * 60 * 1000);

// حفظ البيانات فوراً عند إيقاف تشغيل البوت أو إعادة تشغيل السيرفر
function safeExit() {
  try {
    console.log('[DB] 💾 Flushing and closing database safely...');
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
  } catch (e) {}
  process.exit(0);
}

process.on('SIGINT', safeExit);
process.on('SIGTERM', safeExit);

// ==========================================
// إنشاء الجداول
// ==========================================
db.exec(`
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    prefix TEXT DEFAULT '#',
    welcome_channel TEXT,
    welcome_message TEXT,
    welcome_image INTEGER DEFAULT 1,
    log_channel TEXT,
    ticket_category TEXT,
    ticket_log_channel TEXT,
    support_role TEXT,
    auto_role TEXT,
    leveling_enabled INTEGER DEFAULT 1,
    level_message TEXT,
    level_channel TEXT DEFAULT 'current',
    level_multiplier REAL DEFAULT 1.0,
    anti_link INTEGER DEFAULT 0,
    anti_spam INTEGER DEFAULT 0,
    anti_caps INTEGER DEFAULT 0,
    anti_emoji_spam INTEGER DEFAULT 0,
    anti_line_spam INTEGER DEFAULT 0,
    anti_mass_mention INTEGER DEFAULT 0,
    max_mentions INTEGER DEFAULT 4,
    max_emojis INTEGER DEFAULT 5,
    max_lines INTEGER DEFAULT 8,
    bad_words_enabled INTEGER DEFAULT 0,
    bad_words_list TEXT DEFAULT '',
    automod_action TEXT DEFAULT 'warn',
    automod_whitelist_role TEXT,
    automod_whitelist_channel TEXT,
    anti_alt_days INTEGER DEFAULT 0,
    verification_enabled INTEGER DEFAULT 0,
    verification_type TEXT DEFAULT 'button',
    verification_role TEXT,
    anti_nuke_enabled INTEGER DEFAULT 0,
    anti_nuke_action TEXT DEFAULT 'kick',
    temp_voice_enabled INTEGER DEFAULT 0,
    temp_voice_category TEXT,
    temp_voice_channel TEXT,
    boost_enabled INTEGER DEFAULT 1,
    boost_channel TEXT,
    boost_message TEXT DEFAULT '🎉 شكراً [user] لدعمك السيرفر بالبوست! أصبح عدد البوستات الآن [totalBoosts] بوست!',
    boost_dm_enabled INTEGER DEFAULT 0,
    boost_dm_message TEXT DEFAULT 'شكراً جزيلاً لدعمك سيرفر [serverName] بالبوست! 🚀',
    boost_embed_enabled INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    coins INTEGER DEFAULT 0,
    reputation INTEGER DEFAULT 0,
    last_daily INTEGER DEFAULT 0,
    last_message_xp INTEGER DEFAULT 0,
    wallpaper TEXT DEFAULT 'default',
    warnings INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, guild_id)
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    status TEXT DEFAULT 'open',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    closed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS reaction_roles (
    custom_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    message_id TEXT,
    channel_id TEXT
  );

  CREATE TABLE IF NOT EXISTS auto_responders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    trigger_word TEXT NOT NULL,
    reply_text TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS level_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    level INTEGER NOT NULL,
    role_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT UNIQUE,
    prize TEXT NOT NULL,
    winners_count INTEGER DEFAULT 1,
    host_id TEXT NOT NULL,
    end_time INTEGER NOT NULL,
    status TEXT DEFAULT 'active',
    entries TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS temp_voices (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    questions TEXT NOT NULL,
    log_channel TEXT,
    accepted_role TEXT,
    status TEXT DEFAULT 'open',
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS application_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    app_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    answers TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    reviewed_by TEXT,
    submitted_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS application_points (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    points INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS stars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    giver_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    message_id TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS staff_activity (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    tickets_closed INTEGER DEFAULT 0,
    mod_actions INTEGER DEFAULT 0,
    bans_count INTEGER DEFAULT 0,
    kicks_count INTEGER DEFAULT 0,
    mutes_count INTEGER DEFAULT 0,
    warns_count INTEGER DEFAULT 0,
    messages_count INTEGER DEFAULT 0,
    voice_seconds INTEGER DEFAULT 0,
    streak_days INTEGER DEFAULT 0,
    last_active_day TEXT,
    points INTEGER DEFAULT 0,
    shift_seconds INTEGER DEFAULT 0,
    total_shifts INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS staff_shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    status TEXT DEFAULT 'active', -- 'active', 'ended', 'auto_logged_out'
    end_time INTEGER,
    duration_seconds INTEGER DEFAULT 0,
    ended_by TEXT DEFAULT 'user', -- 'user', 'auto_afk', 'auto_offline', 'admin'
    UNIQUE(guild_id, user_id, status)
  );

  CREATE TABLE IF NOT EXISTS staff_shift_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL,
    ended_by TEXT DEFAULT 'user',
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS staff_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    staff_id TEXT NOT NULL,
    action_type TEXT NOT NULL, -- ticket_close, ban, kick, mute, warn, unban, unmute
    target_id TEXT,
    reason TEXT,
    details TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS staff_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    title TEXT NOT NULL,
    target_type TEXT NOT NULL, -- tickets, mod_actions, messages, voice_hours
    target_value INTEGER NOT NULL,
    reward_points INTEGER DEFAULT 100,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  -- 🎫 Ticket Panels (لوحات التذاكر المخصصة)
  CREATE TABLE IF NOT EXISTS ticket_panels (
    panel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT,
    message_id TEXT,
    title TEXT,
    description TEXT,
    button_label TEXT,
    button_emoji TEXT,
    button_style TEXT,
    welcome_msg TEXT,
    support_role TEXT,
    category_id TEXT,
    naming_scheme TEXT,
    logs_channel TEXT,
    categories_json TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  -- ⭐ Ticket Ratings (تقييمات موظفي الدعم)
  CREATE TABLE IF NOT EXISTS ticket_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    ticket_channel_id TEXT,
    user_id TEXT NOT NULL,
    staff_id TEXT NOT NULL,
    stars INTEGER NOT NULL,
    feedback TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  -- 📜 Ticket Transcripts (سجلات التذاكر)
  CREATE TABLE IF NOT EXISTS ticket_transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    closed_by TEXT,
    reason TEXT,
    html_content TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  -- 🔗 Invites System (نظام تتبع الدعوات)
  CREATE TABLE IF NOT EXISTS invites (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    regular INTEGER DEFAULT 0,
    leaves INTEGER DEFAULT 0,
    fake INTEGER DEFAULT 0,
    bonus INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS invite_members (
    guild_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    inviter_id TEXT,
    code TEXT,
    is_fake INTEGER DEFAULT 0,
    is_left INTEGER DEFAULT 0,
    joined_at INTEGER DEFAULT (strftime('%s','now')),
    PRIMARY KEY (guild_id, member_id)
  );

  -- 📢 Broadcasts System (نظام الإعلانات والمذيع الآلي المتقدم)
  CREATE TABLE IF NOT EXISTS broadcasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_ids TEXT NOT NULL,
    title TEXT,
    message TEXT NOT NULL,
    color TEXT DEFAULT '#9333ea',
    image_url TEXT,
    interval_minutes INTEGER DEFAULT 0,
    scheduled_time INTEGER DEFAULT 0,
    last_sent INTEGER DEFAULT 0,
    is_recurring INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_by TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  -- 🛡️ Whitelist & Anti Mod System (القائمة البيضاء ونظام الحماية من العقوبات)
  CREATE TABLE IF NOT EXISTS protection_whitelist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT DEFAULT 'whitelist', -- 'whitelist' (عضو موثوق) or 'antimod' (محمي من العقوبات)
    added_by TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    UNIQUE(guild_id, user_id, type)
  );

  -- 📋 Security & Moderation Logs System (سجلات الأمان والإشراف)
  CREATE TABLE IF NOT EXISTS security_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    category TEXT NOT NULL, -- 'security' or 'moderation'
    action_type TEXT NOT NULL, -- 'mass_destroy', 'auto_punish', 'limit_exceeded', 'suspicious_activity', 'scam_links', 'ban_kick', 'timeout', 'warn', 'msg_delete', 'channel_lock'
    executor_id TEXT,
    target_id TEXT,
    reason TEXT,
    details TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);

// Migrations - إضافة الأعمدة الجديدة بشكل آمن
try { db.exec("ALTER TABLE guild_settings ADD COLUMN staff_activity_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN staff_role TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN staff_log_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN staff_login_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN staff_banner_url TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN staff_banner_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN staff_auto_logout INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE staff_activity ADD COLUMN shift_seconds INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE staff_activity ADD COLUMN total_shifts INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE users ADD COLUMN streak INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE users ADD COLUMN bank_balance INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE users ADD COLUMN last_work INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN boost_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN boost_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN boost_message TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN boost_dm_enabled INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN boost_dm_message TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN boost_embed_enabled INTEGER DEFAULT 0;"); } catch(e) {}

try { db.exec("ALTER TABLE guild_settings ADD COLUMN leave_enabled INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN leave_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN leave_message TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN welcome_dm_enabled INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN welcome_dm_message TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN welcome_embed_enabled INTEGER DEFAULT 0;"); } catch(e) {}

try { db.exec("ALTER TABLE guild_settings ADD COLUMN verify_enabled INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN verify_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN verify_role TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN verify_message TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN verification_enabled INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN verification_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN verification_role TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN verification_type TEXT DEFAULT 'button';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN unverified_role TEXT;"); } catch(e) {}

try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_max_open INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_welcome_msg TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_panel_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_panel_title TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_panel_desc TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_role TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_rating_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_feedback_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_rating_channel TEXT;"); } catch(e) {}

try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_panel_banner TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_welcome_image TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_counter INTEGER DEFAULT 0;"); } catch(e) {}

try { db.exec("ALTER TABLE tickets ADD COLUMN ticket_number INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE tickets ADD COLUMN claimed_by TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE tickets ADD COLUMN claimed_at INTEGER;"); } catch(e) {}
try { db.exec("ALTER TABLE tickets ADD COLUMN closed_by TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE tickets ADD COLUMN close_reason TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE tickets ADD COLUMN transcript_url TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE applications ADD COLUMN panel_image TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN welcome_banner_image TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN level_up_image TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN broadcast_image TEXT;"); } catch(e) {}

try { db.exec("ALTER TABLE giveaways ADD COLUMN required_role TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE giveaways ADD COLUMN min_level INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE giveaways ADD COLUMN min_account_age INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE giveaways ADD COLUMN extra_role TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE giveaways ADD COLUMN hosted_by TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE giveaways ADD COLUMN guild_id TEXT;"); } catch(e) {}

try { db.exec("ALTER TABLE guild_settings ADD COLUMN economy_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN daily_amount INTEGER DEFAULT 500;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN work_cooldown INTEGER DEFAULT 4;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN transfer_tax REAL DEFAULT 5.0;"); } catch(e) {}

try { db.exec("ALTER TABLE guild_settings ADD COLUMN automod_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN anti_spoilers INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN anti_zalgo INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN anti_emoji INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN anti_text_repeat INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN anti_repeat_messages INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN anti_stickers INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN anti_long_messages INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN strict_bad_words_enabled INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN whitelist_words_list TEXT DEFAULT '';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN automod_exempt_users TEXT DEFAULT '';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN automod_log_channel TEXT;"); } catch(e) {}

// إنشاء جدول العقوبات التلقائية للتحذيرات (Warn Punishments)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS warn_punishments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      warn_count INTEGER NOT NULL,
      action_type TEXT NOT NULL, -- 'timeout_5m', 'timeout_1h', 'timeout_24h', 'kick', 'ban'
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
  `);
} catch(e) {}

// إعدادات الرتب التلقائية واللفل المتقدمة (Autoroles & Leveling Settings)
try { db.exec("ALTER TABLE guild_settings ADD COLUMN autorole_bot_id TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN level_text_xp_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN level_voice_xp_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN level_cooldown_seconds INTEGER DEFAULT 120;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN level_voice_xp_rate INTEGER DEFAULT 3;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN level_voice_min_members INTEGER DEFAULT 2;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN level_ignore_deafened INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN level_ignore_muted INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN level_ignore_afk INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN level_up_msg_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN level_voice_msg TEXT DEFAULT 'مبروك {user}! وصلت للمستوى الصوتي **{level}**! 🎤';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN level_dm_msg_enabled INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN level_stack_roles INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN level_exempt_channels TEXT DEFAULT '';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN level_exempt_voice_channels TEXT DEFAULT '';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN level_exempt_roles TEXT DEFAULT '';"); } catch(e) {}

// ترقية جدول مكافآت اللفل لدعم الرتب الصوتية والمشتركة
try { db.exec("ALTER TABLE level_rewards ADD COLUMN reward_type TEXT DEFAULT 'text';"); } catch(e) {}
try { db.exec("ALTER TABLE level_rewards ADD COLUMN voice_level INTEGER DEFAULT 0;"); } catch(e) {}

// ترقية جدول الإشراف والعقوبات الشاملة (Moderation System Settings)
try { db.exec("ALTER TABLE guild_settings ADD COLUMN mod_warn_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN mod_mute_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN mod_badwords_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN mod_caps_enabled INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN mod_mention_spam_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN mod_emoji_spam_enabled INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN mod_staff_roles TEXT DEFAULT '';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN mod_exempt_roles TEXT DEFAULT '';"); } catch(e) {}

// نظام الاقتراحات والشكاوي المتقدم (Suggestions System)
try { db.exec("ALTER TABLE guild_settings ADD COLUMN suggestions_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN suggestions_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN suggestions_log_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN suggestions_staff_roles TEXT DEFAULT '';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN suggestions_dm_notify INTEGER DEFAULT 1;"); } catch(e) {}
// إعدادات الأوامر المعطلة وتحكم لوحة الداشبورد (Commands Toggle Control)
try { db.exec("ALTER TABLE guild_settings ADD COLUMN disabled_commands TEXT DEFAULT '[]';"); } catch(e) {}
// نظام مكافحة الغزو والأعضاء الوهميين (Anti-Raid)
try { db.exec("ALTER TABLE guild_settings ADD COLUMN antiraid_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN raid_threshold INTEGER DEFAULT 5;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN anti_bot INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN antiraid_dm_notify INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN antiraid_action TEXT DEFAULT 'kick';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN antiraid_log_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN antiraid_whitelist_roles TEXT DEFAULT '';"); } catch(e) {}
// نظام الإعلانات والمذيع الآلي (Auto-Broadcaster)
try { db.exec("ALTER TABLE guild_settings ADD COLUMN broadcast_enabled INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN broadcast_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN broadcast_interval INTEGER DEFAULT 60;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN broadcast_messages TEXT DEFAULT '[]';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN broadcast_mention_role TEXT;"); } catch(e) {}

// تخصيص مظهر البوت لكل سيرفر (Per-Server Bot Appearance)
try { db.exec("ALTER TABLE guild_settings ADD COLUMN bot_nickname TEXT DEFAULT '';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN bot_about TEXT DEFAULT '';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN bot_avatar TEXT DEFAULT '';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN bot_banner TEXT DEFAULT '';"); } catch(e) {}
// إعدادات البوت العامة وتصفير السجلات (General Settings & Punishment Auto-Clear)
try { db.exec("ALTER TABLE guild_settings ADD COLUMN bot_language TEXT DEFAULT 'AR';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN auto_clear_punishments INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN auto_clear_period TEXT DEFAULT 'week';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN auto_clear_types TEXT DEFAULT 'all';"); } catch(e) {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT,
      message_id TEXT UNIQUE,
      user_id TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'عام',
      status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'rejected', 'implemented', 'considered'
      status_reason TEXT,
      reviewed_by TEXT,
      reviewed_at INTEGER,
      upvotes TEXT DEFAULT '[]',
      downvotes TEXT DEFAULT '[]',
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
  `);
} catch(e) {}

// قنوات الإحصائيات (Stat Channels System)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stat_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      stat_type TEXT NOT NULL,
      custom_prefix TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1,
      UNIQUE(guild_id, channel_id)
    );
  `);
} catch(e) {}

// تحديث جدول التقديمات (Applications reviewer_role migration)
try {
  db.exec(`ALTER TABLE applications ADD COLUMN reviewer_role TEXT;`);
} catch(e) {}

// 🔒 جدول المسجونين (Jail System)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jail_users (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      reason TEXT,
      old_roles TEXT DEFAULT '[]',
      jailed_at INTEGER DEFAULT (strftime('%s','now')),
      jail_until INTEGER,
      PRIMARY KEY (guild_id, user_id)
    );
  `);
} catch(e) {}

// 🔇 جدول الإسكات والرتب المؤقتة (Temp Mutes)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS temp_mutes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      reason TEXT,
      unmute_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
  `);
} catch(e) {}

// إعدادات السجن والرول في guild_settings
try { db.exec("ALTER TABLE guild_settings ADD COLUMN jail_role TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN jail_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN mute_role TEXT;"); } catch(e) {}

// أنظمة الخط التلقائي والاقتراحات والضريبة وناديكو (Autoline, Suggestions, Tax, Nadeko)
try { db.exec("ALTER TABLE guild_settings ADD COLUMN autoline_channels TEXT DEFAULT '[]';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN autoline_line TEXT DEFAULT '';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN autoline_mode TEXT DEFAULT 'line';"); } catch(e) {}

try { db.exec("ALTER TABLE guild_settings ADD COLUMN feedback_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN feedback_line TEXT DEFAULT '';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN feedback_mode TEXT DEFAULT 'embed';"); } catch(e) {}

try { db.exec("ALTER TABLE guild_settings ADD COLUMN suggestions_line TEXT DEFAULT '';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN suggestion_mode TEXT DEFAULT 'embed';"); } catch(e) {}

try { db.exec("ALTER TABLE guild_settings ADD COLUMN tax_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN tax_line TEXT DEFAULT '';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN tax_mode TEXT DEFAULT 'all';"); } catch(e) {}

try { db.exec("ALTER TABLE guild_settings ADD COLUMN nadeko_channels TEXT DEFAULT '[]';"); } catch(e) {}

// نظام السجلات الشامل (Server Logs System)
try { db.exec("ALTER TABLE guild_settings ADD COLUMN logs_enabled INTEGER DEFAULT 1;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN logs_config TEXT DEFAULT '{}';"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN log_channel TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN log_channel_members TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN log_channel_roles TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN log_channel_channels TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN log_channel_messages TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN log_channel_voice TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN log_channel_moderation TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN log_channel_server TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN log_channel_invites TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN log_channel_emojis TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN log_channel_events TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN log_channel_integrations TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN log_channel_automod TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN log_channel_stage TEXT;"); } catch(e) {}

// جدول حفظ بيانات السيرفرات لضمان عدم ضياع الاسم والأعضاء والأونر ورابط الدعوة
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracked_guilds (
      guild_id TEXT PRIMARY KEY,
      name TEXT,
      owner_id TEXT,
      owner_tag TEXT,
      member_count INTEGER DEFAULT 0,
      invite_url TEXT,
      icon_url TEXT,
      updated_at INTEGER DEFAULT 0
    );
  `);
} catch(e) {}

// ✅ Performance Indexes - تسريع استعلامات الداشبورد
try { db.exec('CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_users_guild_id ON users(guild_id);'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_users_coins ON users(coins DESC);'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_guild_settings_guild_id ON guild_settings(guild_id);'); } catch(e) {}

function trackGuildInfo(data) {
  if (!data || !data.guildId) return;
  try {
    db.prepare(`
      INSERT INTO tracked_guilds (guild_id, name, owner_id, owner_tag, member_count, invite_url, icon_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        name = COALESCE(excluded.name, tracked_guilds.name),
        owner_id = COALESCE(excluded.owner_id, tracked_guilds.owner_id),
        owner_tag = COALESCE(excluded.owner_tag, tracked_guilds.owner_tag),
        member_count = CASE WHEN excluded.member_count > 0 THEN excluded.member_count ELSE tracked_guilds.member_count END,
        invite_url = COALESCE(excluded.invite_url, tracked_guilds.invite_url),
        icon_url = COALESCE(excluded.icon_url, tracked_guilds.icon_url),
        updated_at = excluded.updated_at
    `).run(
      data.guildId,
      data.name || null,
      data.ownerId || null,
      data.ownerTag || null,
      data.memberCount || 0,
      data.inviteUrl || null,
      data.iconURL || null,
      data.updatedAt || Date.now()
    );
  } catch (e) {}
}

function getTrackedGuildInfo(guildId) {
  if (!guildId) return null;
  try {
    const row = db.prepare('SELECT * FROM tracked_guilds WHERE guild_id = ?').get(guildId);
    if (!row) return null;
    return {
      guildId: row.guild_id,
      name: row.name,
      ownerId: row.owner_id,
      ownerTag: row.owner_tag,
      memberCount: row.member_count,
      inviteUrl: row.invite_url,
      iconURL: row.icon_url,
      updatedAt: row.updated_at
    };
  } catch (e) {
    return null;
  }
}

// جدول كاش بيانات المستخدمين (الاسم والصورة والمعرف) لحفظها في Turso وعرضها في لوحات الصدارة
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY,
      username TEXT,
      display_name TEXT,
      avatar TEXT,
      avatar_url TEXT,
      updated_at INTEGER DEFAULT 0
    );
  `);
} catch(e) {}

function trackUserProfile(data) {
  if (!data || !data.userId) return;
  const userId = String(data.userId);
  const username = data.username ? String(data.username) : null;
  const displayName = data.displayName ? String(data.displayName) : (username || null);
  const avatar = data.avatar ? String(data.avatar) : null;
  const avatarUrl = data.avatarUrl ? String(data.avatarUrl) : (avatar ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png` : null);
  const updatedAt = data.updatedAt || Date.now();

  try {
    db.prepare(`
      INSERT INTO user_profiles (user_id, username, display_name, avatar, avatar_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        username = COALESCE(excluded.username, user_profiles.username),
        display_name = COALESCE(excluded.display_name, user_profiles.display_name),
        avatar = COALESCE(excluded.avatar, user_profiles.avatar),
        avatar_url = COALESCE(excluded.avatar_url, user_profiles.avatar_url),
        updated_at = excluded.updated_at
    `).run(userId, username, displayName, avatar, avatarUrl, updatedAt);

    // مزامنة فورية إلى قاعدة بيانات Turso السحابية
    if (tursoSync && tursoSync.queueProfileSync) {
      tursoSync.queueProfileSync({
        user_id: userId,
        username,
        display_name: displayName,
        avatar,
        avatar_url: avatarUrl,
        updated_at: updatedAt
      });
    }
  } catch (e) {}
}

function getUserProfile(userId) {
  if (!userId) return null;
  try {
    return db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(String(userId)) || null;
  } catch (e) {
    return null;
  }
}

function getTrackedUserProfiles(userIds = []) {
  if (!userIds || userIds.length === 0) return {};
  try {
    const placeholders = userIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM user_profiles WHERE user_id IN (${placeholders})`).all(...userIds.map(String));
    const map = {};
    for (const r of rows) {
      map[r.user_id] = r;
    }
    return map;
  } catch (e) {
    return {};
  }
}

console.log('[DB] ✅ SQLite database initialized successfully');
tursoSync.initAndRestore(db).catch(e => console.error('[TURSO] Init error:', e.message));


// ==========================================
// Guild Settings
// ==========================================
function getGuildSettings(guildId) {
  let row = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
  }
  return row || { guild_id: guildId, prefix: '#' };
}

function setGuildSetting(guildId, key, value) {
  // تأكد السجل موجود
  db.prepare('INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)').run(guildId);
  
  // تأكد أن العمود موجود في الجدول، وإذا لم يكن موجوداً يتم إنشاؤه تلقائياً
  try {
    db.prepare(`UPDATE guild_settings SET ${key} = ? WHERE guild_id = ?`).run(value, guildId);
  } catch (err) {
    if (err.message && err.message.includes('no such column')) {
      try {
        const colType = typeof value === 'number' ? 'INTEGER' : 'TEXT';
        db.exec(`ALTER TABLE guild_settings ADD COLUMN ${key} ${colType};`);
        db.prepare(`UPDATE guild_settings SET ${key} = ? WHERE guild_id = ?`).run(value, guildId);
      } catch (addErr) {
        console.error(`Failed to add column ${key}:`, addErr);
      }
    } else {
      console.error(`Failed to update setting ${key}:`, err);
    }
  }
}

function updateGuildSettings(guildId, settingsObj) {
  if (!settingsObj || typeof settingsObj !== 'object') return;
  for (const [key, value] of Object.entries(settingsObj)) {
    setGuildSetting(guildId, key, value);
  }
  // ✅ Sync full guild settings to Turso once after all keys are saved (bot reads aliases/configs from here)
  try {
    const updatedRow = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
    if (updatedRow) tursoSync.queueGuildSettingsSync(guildId, updatedRow);
  } catch (e) {}
}

// alias
function updateGuildSetting(guildId, key, value) {
  return setGuildSetting(guildId, key, value);
}

// ==========================================
// Users / XP / Economy
// ==========================================
function getUser(userId, guildId) {
  let row = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO users (user_id, guild_id) VALUES (?, ?)').run(userId, guildId);
    row = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
  }
  return row || { user_id: userId, guild_id: guildId, xp: 0, level: 1, coins: 0, reputation: 0, last_daily: 0, last_message_xp: 0, wallpaper: 'default', warnings: 0 };
}

function addXp(userId, guildId, amount) {
  const user = getUser(userId, guildId);
  let xp = (user.xp || 0) + amount;
  let level = user.level || 1;
  let leveledUp = false;

  // معادلة احترافية لحساب الخبرة المطلوبة لكل لفل
  const getRequiredXp = (lvl) => Math.floor(lvl * 150 + 100);

  while (xp >= getRequiredXp(level)) {
    xp -= getRequiredXp(level);
    level += 1;
    leveledUp = true;
  }

  db.prepare(`
    UPDATE users SET xp = ?, level = ?, last_message_xp = ?
    WHERE user_id = ? AND guild_id = ?
  `).run(xp, level, Date.now(), userId, guildId);

  const updatedUser = getUser(userId, guildId);
  tursoSync.queueUserSync(updatedUser);

  return { level, leveledUp, xp };
}

function getCoins(userId, guildId) {
  const user = getUser(userId, guildId);
  return user.coins || 0;
}

function getBank(userId, guildId) {
  const user = getUser(userId, guildId);
  return user.bank_balance || 0;
}

function setLastWork(userId, guildId, timestamp) {
  getUser(userId, guildId);
  db.prepare('UPDATE users SET last_work = ? WHERE user_id = ? AND guild_id = ?').run(timestamp, userId, guildId);
  const u = getUser(userId, guildId);
  tursoSync.queueUserSync(u);
}

function depositBank(userId, guildId, amount) {
  const user = getUser(userId, guildId);
  const coins = user.coins || 0;
  if (coins < amount) throw new Error('INSUFFICIENT_WALLET');
  db.prepare('UPDATE users SET coins = coins - ?, bank_balance = COALESCE(bank_balance, 0) + ? WHERE user_id = ? AND guild_id = ?')
    .run(amount, amount, userId, guildId);
  const u = getUser(userId, guildId);
  tursoSync.queueUserSync(u);
  return { wallet: u.coins || 0, bank: u.bank_balance || 0 };
}

function withdrawBank(userId, guildId, amount) {
  const user = getUser(userId, guildId);
  const bank = user.bank_balance || 0;
  if (bank < amount) throw new Error('INSUFFICIENT_BANK');
  db.prepare('UPDATE users SET bank_balance = bank_balance - ?, coins = coins + ? WHERE user_id = ? AND guild_id = ?')
    .run(amount, amount, userId, guildId);
  const u = getUser(userId, guildId);
  tursoSync.queueUserSync(u);
  return { wallet: u.coins || 0, bank: u.bank_balance || 0 };
}

function addCoins(userId, guildId, amount) {
  getUser(userId, guildId);
  db.prepare('UPDATE users SET coins = coins + ? WHERE user_id = ? AND guild_id = ?').run(amount, userId, guildId);
  const u = getUser(userId, guildId);
  tursoSync.queueUserSync(u);
  return u.coins || 0;
}

function removeCoins(userId, guildId, amount) {
  getUser(userId, guildId);
  db.prepare('UPDATE users SET coins = MAX(0, coins - ?) WHERE user_id = ? AND guild_id = ?').run(amount, userId, guildId);
  const u = getUser(userId, guildId);
  tursoSync.queueUserSync(u);
  return u.coins || 0;
}

function setCoins(userId, guildId, amount) {
  getUser(userId, guildId);
  db.prepare('UPDATE users SET coins = ? WHERE user_id = ? AND guild_id = ?').run(Math.max(0, amount), userId, guildId);
  const u = getUser(userId, guildId);
  tursoSync.queueUserSync(u);
  return u.coins || 0;
}

const transferCoins = db.transaction((guildId, senderId, receiverId, amount) => {
  const sender = getUser(senderId, guildId);
  const currentCoins = sender.coins || 0;
  if (currentCoins < amount) {
    throw new Error('INSUFFICIENT_FUNDS');
  }

  db.prepare('UPDATE users SET coins = coins - ? WHERE user_id = ? AND guild_id = ?').run(amount, senderId, guildId);
  getUser(receiverId, guildId);
  db.prepare('UPDATE users SET coins = coins + ? WHERE user_id = ? AND guild_id = ?').run(amount, receiverId, guildId);

  const newSender = getUser(senderId, guildId);
  const newReceiver = getUser(receiverId, guildId);
  tursoSync.queueUserSync(newSender);
  tursoSync.queueUserSync(newReceiver);
  return {
    senderBalance: newSender.coins || 0,
    receiverBalance: newReceiver.coins || 0
  };
});

function getLastDaily(userId) {
  const row = db.prepare('SELECT MAX(last_daily) as last_daily FROM users WHERE user_id = ?').get(userId);
  return row?.last_daily || 0;
}

function setLastDaily(userId, guildId, timestamp, streak = null) {
  getUser(userId, guildId);
  if (streak !== null && streak !== undefined) {
    db.prepare('UPDATE users SET last_daily = ?, streak = ? WHERE user_id = ?').run(timestamp, streak, userId);
  } else {
    db.prepare('UPDATE users SET last_daily = ? WHERE user_id = ?').run(timestamp, userId);
  }
  const u = getUser(userId, guildId);
  tursoSync.queueUserSync(u);
}

function getWallpaper(userId) {
  const row = db.prepare('SELECT MAX(wallpaper) as wallpaper FROM users WHERE user_id = ?').get(userId);
  return row?.wallpaper || 'default';
}

function setWallpaper(userId, guildId, wallpaper) {
  getUser(userId, guildId);
  db.prepare('UPDATE users SET wallpaper = ? WHERE user_id = ?').run(wallpaper, userId);
}

function getLeaderboard(guildId, limit = 10) {
  return db.prepare(`
    SELECT u.*, p.username, p.display_name, p.avatar, p.avatar_url
    FROM users u
    LEFT JOIN user_profiles p ON u.user_id = p.user_id
    WHERE u.guild_id = ?
    ORDER BY u.xp DESC, u.level DESC
    LIMIT ?
  `).all(guildId, limit);
}

// قراءة الـ leaderboard مباشرة من Turso (للداشبورد على Render)
async function getLeaderboardFromTurso(guildId, limit = 20) {
  if (!tursoSync?.client || !tursoSync?.enabled) {
    // fallback للـ local SQLite إذا ما كان Turso متاح
    return getLeaderboard(guildId, limit);
  }
  try {
    const result = await tursoSync.client.execute({
      sql: `
        SELECT u.user_id, u.xp, u.level, u.coins, u.reputation,
               p.username, p.display_name, p.avatar, p.avatar_url
        FROM users u
        LEFT JOIN user_profiles p ON u.user_id = p.user_id
        WHERE u.guild_id = ?
        ORDER BY u.xp DESC, u.level DESC
        LIMIT ?
      `,
      args: [guildId, limit]
    });
    if (!result?.rows?.length) return getLeaderboard(guildId, limit);
    return result.rows.map(r => ({
      user_id: String(r.user_id || ''),
      xp: Number(r.xp || 0),
      total_xp: Number(r.xp || 0),
      level: Number(r.level || 1),
      coins: Number(r.coins || 0),
      reputation: Number(r.reputation || 0),
      username: r.username ? String(r.username) : null,
      display_name: r.display_name ? String(r.display_name) : null,
      avatar: r.avatar ? String(r.avatar) : null,
      avatar_url: r.avatar_url ? String(r.avatar_url) : null,
    }));
  } catch(e) {
    console.error('[TURSO] getLeaderboardFromTurso error:', e.message);
    return getLeaderboard(guildId, limit);
  }
}


function getCoinsLeaderboard(guildId, limit = 10) {
  return db.prepare(`
    SELECT u.*, p.username, p.display_name, p.avatar, p.avatar_url
    FROM users u
    LEFT JOIN user_profiles p ON u.user_id = p.user_id
    WHERE u.guild_id = ?
    ORDER BY u.coins DESC
    LIMIT ?
  `).all(guildId, limit);
}

// ==========================================
// Warnings
// ==========================================
function addWarning(guildId, userId, moderatorId, reason = 'لا يوجد سبب') {
  db.prepare('INSERT INTO warnings (guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?)').run(guildId, userId, moderatorId, reason);
  const count = db.prepare('SELECT COUNT(*) as count FROM warnings WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  db.prepare('UPDATE users SET warnings = ? WHERE user_id = ? AND guild_id = ?').run(count.count, userId, guildId);
  return count.count;
}

function getWarnings(guildId, userId) {
  return db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC').all(guildId, userId);
}

function clearWarnings(guildId, userId) {
  db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  db.prepare('UPDATE users SET warnings = 0 WHERE user_id = ? AND guild_id = ?').run(userId, guildId);
}

// ==========================================
// Tickets (نظام التذاكر المتقدم)
// ==========================================
function createTicket(guildId, channelId, userId, category = 'General') {
  let ticketNumber = 1;
  try {
    const settings = db.prepare('SELECT ticket_counter FROM guild_settings WHERE guild_id = ?').get(guildId);
    ticketNumber = (settings?.ticket_counter || 0) + 1;
    db.prepare('UPDATE guild_settings SET ticket_counter = ? WHERE guild_id = ?').run(ticketNumber, guildId);
  } catch (e) {}

  db.prepare('INSERT OR IGNORE INTO tickets (guild_id, channel_id, user_id, category, status, ticket_number) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, channelId, userId, category, 'open', ticketNumber);
  return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);
}

function closeTicket(channelId, closedBy = null, reason = null) {
  db.prepare("UPDATE tickets SET status = 'closed', closed_at = strftime('%s','now'), closed_by = ?, close_reason = ? WHERE channel_id = ?")
    .run(closedBy, reason, channelId);
  return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);
}

function deleteTicket(channelId) {
  return db.prepare('DELETE FROM tickets WHERE channel_id = ?').run(channelId);
}

function getTicketByChannel(channelId) {
  return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);
}

function getUserActiveTickets(guildId, userId) {
  return db.prepare("SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'").all(guildId, userId);
}

function getGuildTickets(guildId, limit = 50) {
  return db.prepare('SELECT * FROM tickets WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?').all(guildId, limit);
}

function claimTicket(channelId, staffId) {
  db.prepare("UPDATE tickets SET claimed_by = ?, claimed_at = strftime('%s','now') WHERE channel_id = ?").run(staffId, channelId);
  return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);
}

function unclaimTicket(channelId) {
  db.prepare("UPDATE tickets SET claimed_by = NULL, claimed_at = NULL WHERE channel_id = ?").run(channelId);
  return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);
}

function transferTicket(channelId, targetStaffOrRoleId) {
  db.prepare("UPDATE tickets SET claimed_by = ? WHERE channel_id = ?").run(targetStaffOrRoleId, channelId);
  return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);
}

// 🎫 Ticket Panels (لوحات التذاكر)
function saveTicketPanel(p) {
  return db.prepare(`
    INSERT OR REPLACE INTO ticket_panels 
    (panel_id, guild_id, channel_id, message_id, title, description, button_label, button_emoji, button_style, welcome_msg, support_role, category_id, naming_scheme, logs_channel, categories_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    p.panel_id, p.guild_id, p.channel_id || null, p.message_id || null, 
    p.title || '🎫 نظام الدعم الفني', p.description || '', p.button_label || 'فتح تذكرة', 
    p.button_emoji || '📩', p.button_style || 'Primary', p.welcome_msg || '', 
    p.support_role || null, p.category_id || null, p.naming_scheme || 'ticket-{username}', 
    p.logs_channel || null, p.categories_json ? (typeof p.categories_json === 'string' ? p.categories_json : JSON.stringify(p.categories_json)) : null
  );
}

function getTicketPanel(panelId) {
  return db.prepare('SELECT * FROM ticket_panels WHERE panel_id = ?').get(panelId);
}

function getGuildTicketPanels(guildId) {
  return db.prepare('SELECT * FROM ticket_panels WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
}

function deleteTicketPanel(panelId) {
  return db.prepare('DELETE FROM ticket_panels WHERE panel_id = ?').run(panelId);
}

// ⭐ Ticket Ratings (تقييمات الموظفين)
function addTicketRating(guildId, ticketChannelId, userId, staffId, stars, feedback = '') {
  const res = db.prepare(`
    INSERT INTO ticket_ratings (guild_id, ticket_channel_id, user_id, staff_id, stars, feedback)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, ticketChannelId, userId, staffId, stars, feedback);

  // تحديث نقاط الموظف بناء على التقييم
  try {
    const pointsBonus = stars >= 4 ? (stars * 5) : 0;
    if (pointsBonus > 0) {
      getStaffMember(guildId, staffId);
      db.prepare('UPDATE staff_activity SET points = points + ? WHERE guild_id = ? AND user_id = ?').run(pointsBonus, guildId, staffId);
    }
  } catch (e) {}

  return res.lastInsertRowid;
}

function getStaffRatings(guildId, staffId) {
  return db.prepare('SELECT * FROM ticket_ratings WHERE guild_id = ? AND staff_id = ? ORDER BY created_at DESC').all(guildId, staffId);
}

function getStaffAverageRating(guildId, staffId) {
  const row = db.prepare('SELECT COUNT(*) as count, AVG(stars) as avg_stars FROM ticket_ratings WHERE guild_id = ? AND staff_id = ?').get(guildId, staffId);
  return {
    count: row?.count || 0,
    average: row?.avg_stars ? parseFloat(row.avg_stars.toFixed(1)) : 5.0
  };
}

// 📜 Ticket Transcripts
function saveTranscript(guildId, channelId, userId, closedBy = null, reason = null, htmlContent = '') {
  return db.prepare(`
    INSERT INTO ticket_transcripts (guild_id, channel_id, user_id, closed_by, reason, html_content)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, channelId, userId, closedBy, reason, htmlContent);
}

function getTranscript(channelId) {
  return db.prepare('SELECT * FROM ticket_transcripts WHERE channel_id = ? ORDER BY id DESC LIMIT 1').get(channelId);
}

// ==========================================
// 🔗 Invites System (متتبع الدعوات)
// ==========================================
function getInvites(guildId, userId) {
  let row = db.prepare('SELECT * FROM invites WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO invites (guild_id, user_id, regular, leaves, fake, bonus) VALUES (?, ?, 0, 0, 0, 0)').run(guildId, userId);
    row = db.prepare('SELECT * FROM invites WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  }
  const regular = row?.regular || 0;
  const leaves = row?.leaves || 0;
  const fake = row?.fake || 0;
  const bonus = row?.bonus || 0;
  const total = (regular + bonus) - (leaves + fake);
  return { ...row, regular, leaves, fake, bonus, total: Math.max(0, total) };
}

function addInviteRecord(guildId, inviterId, memberId, code = null, isFake = 0) {
  // حفظ سجل العضو المدعو
  db.prepare(`
    INSERT OR REPLACE INTO invite_members (guild_id, member_id, inviter_id, code, is_fake, is_left)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(guildId, memberId, inviterId, code, isFake ? 1 : 0);

  if (inviterId) {
    getInvites(guildId, inviterId);
    if (isFake) {
      db.prepare('UPDATE invites SET fake = fake + 1 WHERE guild_id = ? AND user_id = ?').run(guildId, inviterId);
    } else {
      db.prepare('UPDATE invites SET regular = regular + 1 WHERE guild_id = ? AND user_id = ?').run(guildId, inviterId);
    }
  }
}

function removeInviteMember(guildId, memberId) {
  const memberRecord = db.prepare('SELECT * FROM invite_members WHERE guild_id = ? AND member_id = ?').get(guildId, memberId);
  if (memberRecord && !memberRecord.is_left) {
    db.prepare('UPDATE invite_members SET is_left = 1 WHERE guild_id = ? AND member_id = ?').run(guildId, memberId);
    if (memberRecord.inviter_id) {
      getInvites(guildId, memberRecord.inviter_id);
      db.prepare('UPDATE invites SET leaves = leaves + 1 WHERE guild_id = ? AND user_id = ?').run(guildId, memberRecord.inviter_id);
    }
    return memberRecord.inviter_id;
  }
  return null;
}

function addBonusInvites(guildId, userId, amount) {
  getInvites(guildId, userId);
  db.prepare('UPDATE invites SET bonus = bonus + ? WHERE guild_id = ? AND user_id = ?').run(amount, guildId, userId);
  return getInvites(guildId, userId);
}

function getInvitesLeaderboard(guildId, limit = 15) {
  const rows = db.prepare('SELECT * FROM invites WHERE guild_id = ?').all(guildId);
  return rows
    .map(r => ({
      ...r,
      total: Math.max(0, ((r.regular || 0) + (r.bonus || 0)) - ((r.leaves || 0) + (r.fake || 0)))
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

function getMemberInviter(guildId, memberId) {
  return db.prepare('SELECT * FROM invite_members WHERE guild_id = ? AND member_id = ?').get(guildId, memberId);
}

function resetInvites(guildId, userId = null) {
  if (userId) {
    db.prepare('DELETE FROM invites WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
    db.prepare('DELETE FROM invite_members WHERE guild_id = ? AND inviter_id = ?').run(guildId, userId);
  } else {
    db.prepare('DELETE FROM invites WHERE guild_id = ?').run(guildId);
    db.prepare('DELETE FROM invite_members WHERE guild_id = ?').run(guildId);
  }
}

// ==========================================
// 📢 Broadcasts (نظام الإعلانات والمذيع الآلي)
// ==========================================
function createBroadcast(data) {
  const channelIdsStr = Array.isArray(data.channel_ids) ? data.channel_ids.join(',') : String(data.channel_ids || '');
  const res = db.prepare(`
    INSERT INTO broadcasts (guild_id, channel_ids, title, message, color, image_url, interval_minutes, scheduled_time, is_recurring, created_by, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.guild_id,
    channelIdsStr,
    data.title || null,
    data.message,
    data.color || '#9333ea',
    data.image_url || null,
    data.interval_minutes || 0,
    data.scheduled_time || 0,
    data.is_recurring ? 1 : 0,
    data.created_by || null,
    data.status || 'active'
  );
  return db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(res.lastInsertRowid);
}

function getGuildBroadcasts(guildId) {
  return db.prepare('SELECT * FROM broadcasts WHERE guild_id = ? ORDER BY id DESC').all(guildId);
}

function getBroadcast(id) {
  return db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);
}

function deleteBroadcast(id, guildId = null) {
  if (guildId) {
    return db.prepare('DELETE FROM broadcasts WHERE id = ? AND guild_id = ?').run(id, guildId);
  }
  return db.prepare('DELETE FROM broadcasts WHERE id = ?').run(id);
}

function getAllActiveBroadcasts() {
  return db.prepare("SELECT * FROM broadcasts WHERE status = 'active'").all();
}

function updateBroadcastLastSent(id, timestamp = Date.now()) {
  return db.prepare('UPDATE broadcasts SET last_sent = ? WHERE id = ?').run(timestamp, id);
}

function updateBroadcastStatus(id, status) {
  return db.prepare('UPDATE broadcasts SET status = ? WHERE id = ?').run(status, id);
}

// ==========================================
// Temp Voice Channels
// ==========================================
function createTempVoice(channelId, guildId, userId) {
  return db.prepare('INSERT OR REPLACE INTO temp_voices (channel_id, guild_id, user_id) VALUES (?, ?, ?)').run(channelId, guildId, userId);
}

function isTempVoice(channelId) {
  const row = db.prepare('SELECT 1 FROM temp_voices WHERE channel_id = ?').get(channelId);
  return !!row;
}

function getTempVoice(channelId) {
  return db.prepare('SELECT * FROM temp_voices WHERE channel_id = ?').get(channelId);
}

function deleteTempVoice(channelId) {
  return db.prepare('DELETE FROM temp_voices WHERE channel_id = ?').run(channelId);
}

// ==========================================
// Applications (نظام التقديمات)
// ==========================================
function createApplication(guildId, title, description, questions, logChannel, acceptedRole, reviewerRole = null, panelImage = null) {
  const qStr = typeof questions === 'string' ? questions : JSON.stringify(questions);
  const result = db.prepare(`
    INSERT INTO applications (guild_id, title, description, questions, log_channel, accepted_role, reviewer_role, panel_image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(guildId, title, description, qStr, logChannel, acceptedRole, reviewerRole, panelImage);
  return db.prepare('SELECT * FROM applications WHERE id = ?').get(result.lastInsertRowid);
}

function updateApplication(id, title, description, questions, logChannel, acceptedRole, reviewerRole = null, status = 'open', panelImage = null) {
  const qStr = typeof questions === 'string' ? questions : JSON.stringify(questions);
  db.prepare(`
    UPDATE applications
    SET title = ?, description = ?, questions = ?, log_channel = ?, accepted_role = ?, reviewer_role = ?, status = ?, panel_image = COALESCE(?, panel_image)
    WHERE id = ?
  `).run(title, description, qStr, logChannel, acceptedRole, reviewerRole, status, panelImage, id);
  return db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
}

function getApplications(guildId) {
  return db.prepare('SELECT * FROM applications WHERE guild_id = ? ORDER BY id DESC').all(guildId);
}

function getApplication(id) {
  return db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
}

function deleteApplication(id) {
  return db.prepare('DELETE FROM applications WHERE id = ?').run(id);
}

function createSubmission(guildId, appId, userId, answers) {
  const aStr = typeof answers === 'string' ? answers : JSON.stringify(answers);
  const result = db.prepare(`
    INSERT INTO application_submissions (guild_id, app_id, user_id, answers)
    VALUES (?, ?, ?, ?)
  `).run(guildId, appId, userId, aStr);
  return db.prepare('SELECT * FROM application_submissions WHERE id = ?').get(result.lastInsertRowid);
}

function getSubmission(id) {
  return db.prepare('SELECT * FROM application_submissions WHERE id = ?').get(id);
}

function getPendingSubmissions(guildId) {
  return db.prepare("SELECT * FROM application_submissions WHERE guild_id = ? AND status = 'pending' ORDER BY id DESC").all(guildId);
}

function updateSubmissionStatus(id, status, reviewedBy) {
  return db.prepare('UPDATE application_submissions SET status = ?, reviewed_by = ? WHERE id = ?').run(status, reviewedBy, id);
}

function getUserApplicationPoints(guildId, userId) {
  const row = db.prepare('SELECT points FROM application_points WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  return row ? row.points : 0;
}

function setUserApplicationPoints(guildId, userId, points) {
  return db.prepare('INSERT OR REPLACE INTO application_points (guild_id, user_id, points) VALUES (?, ?, ?)').run(guildId, userId, points);
}

function addApplicationPoint(guildId, userId, amount = 1) {
  const current = getUserApplicationPoints(guildId, userId);
  return setUserApplicationPoints(guildId, userId, current + amount);
}

function resetApplicationPoints(guildId, userId = null) {
  if (userId) {
    return db.prepare('DELETE FROM application_points WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  }
  return db.prepare('DELETE FROM application_points WHERE guild_id = ?').run(guildId);
}

// ==========================================
// Reaction Roles
// ==========================================
function setReactionRole(customId, guildId, roleId, messageId, channelId) {
  db.prepare('INSERT OR REPLACE INTO reaction_roles (custom_id, guild_id, role_id, message_id, channel_id) VALUES (?, ?, ?, ?, ?)').run(customId, guildId, roleId, messageId, channelId);
}

function getReactionRole(customId) {
  return db.prepare('SELECT * FROM reaction_roles WHERE custom_id = ?').get(customId);
}

function getGuildReactionRoles(guildId) {
  return db.prepare('SELECT * FROM reaction_roles WHERE guild_id = ?').all(guildId);
}

function deleteReactionRole(customId) {
  db.prepare('DELETE FROM reaction_roles WHERE custom_id = ?').run(customId);
}

// ==========================================
// Auto Responders
// ==========================================
function addAutoResponder(guildId, data) {
  if (typeof data === 'string') {
    const triggerWord = data;
    const replyText = arguments[2] || '';
    return db.prepare('INSERT INTO auto_responders (guild_id, trigger_word, reply_text) VALUES (?, ?, ?)').run(guildId, triggerWord.trim(), replyText);
  }
  return db.prepare(`
    INSERT INTO auto_responders (
      guild_id, trigger_word, reply_text, match_mode, reply_type, 
      case_sensitive, delete_trigger, cooldown_seconds, 
      allowed_channels, allowed_roles, exempt_channels, exempt_roles, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    guildId,
    data.trigger_word || data.triggerWord,
    data.reply_text || data.replyText,
    data.match_mode || data.matchMode || 'contains',
    data.reply_type || data.replyType || 'text',
    data.case_sensitive || data.caseSensitive ? 1 : 0,
    data.delete_trigger || data.deleteTrigger ? 1 : 0,
    data.cooldown_seconds || data.cooldownSeconds || 0,
    data.allowed_channels || data.allowedChannels || '',
    data.allowed_roles || data.allowedRoles || '',
    data.exempt_channels || data.exemptChannels || '',
    data.exempt_roles || data.exemptRoles || '',
    data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1
  );
}

function getAutoResponders(guildId) {
  return db.prepare('SELECT * FROM auto_responders WHERE guild_id = ? ORDER BY id DESC').all(guildId);
}

function deleteAutoResponder(guildId, idOrTrigger) {
  if (typeof idOrTrigger === 'number' || !isNaN(idOrTrigger)) {
    db.prepare('DELETE FROM auto_responders WHERE guild_id = ? AND id = ?').run(guildId, Number(idOrTrigger));
  } else {
    db.prepare('DELETE FROM auto_responders WHERE guild_id = ? AND trigger_word = ?').run(guildId, String(idOrTrigger).trim());
  }
}

function incrementAutoResponderUse(id) {
  db.prepare('UPDATE auto_responders SET uses_count = uses_count + 1 WHERE id = ?').run(id);
}

// ==========================================
// Level Rewards
// ==========================================
function addLevelReward(guildId, level, roleId, rewardType = 'text', voiceLevel = 0) {
  db.prepare(`
    INSERT INTO level_rewards (guild_id, level, role_id, reward_type, voice_level) 
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, level, roleId, rewardType, voiceLevel);
}

function getLevelRewards(guildId, rewardType = null) {
  if (rewardType) {
    return db.prepare('SELECT * FROM level_rewards WHERE guild_id = ? AND reward_type = ? ORDER BY level ASC, voice_level ASC').all(guildId, rewardType);
  }
  return db.prepare('SELECT * FROM level_rewards WHERE guild_id = ? ORDER BY level ASC, voice_level ASC').all(guildId);
}

function removeLevelReward(guildId, idOrLevel) {
  if (typeof idOrLevel === 'number' || !isNaN(idOrLevel)) {
    db.prepare('DELETE FROM level_rewards WHERE guild_id = ? AND (id = ? OR level = ?)').run(guildId, Number(idOrLevel), Number(idOrLevel));
  } else {
    db.prepare('DELETE FROM level_rewards WHERE guild_id = ? AND id = ?').run(guildId, idOrLevel);
  }
}

// ==========================================
// Stars
// ==========================================
function addStar(guildId, giverId, receiverId, messageId) {
  // منع التقييم المزدوج
  const exists = db.prepare('SELECT id FROM stars WHERE guild_id = ? AND giver_id = ? AND message_id = ?').get(guildId, giverId, messageId);
  if (exists) return false;
  db.prepare('INSERT INTO stars (guild_id, giver_id, receiver_id, message_id) VALUES (?, ?, ?, ?)').run(guildId, giverId, receiverId, messageId);
  return true;
}

function getStars(guildId, userId) {
  const row = db.prepare('SELECT COUNT(*) as count FROM stars WHERE guild_id = ? AND receiver_id = ?').get(guildId, userId);
  return row ? row.count : 0;
}

// ==========================================
// Giveaways (نظام السحوبات المتقدم)
// ==========================================
function createGiveaway(messageId, channelId, guildId, prize, winnersCount, endTime, hostId, requiredRole = null, minLevel = 0, minAccountAge = 0, extraRole = null) {
  db.prepare(`
    INSERT OR REPLACE INTO giveaways 
    (message_id, channel_id, guild_id, prize, winners_count, host_id, end_time, required_role, min_level, min_account_age, extra_role, status, entries)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', '[]')
  `).run(messageId, channelId, guildId, prize, winnersCount || 1, hostId, endTime, requiredRole, minLevel || 0, minAccountAge || 0, extraRole);

  return db.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(messageId);
}


function getGiveaway(messageId) {
  return db.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(messageId);
}

function getActiveGiveaways() {
  return db.prepare("SELECT * FROM giveaways WHERE status = 'active' AND end_time <= ?").all(Date.now());
}

function getGiveawayEntries(messageId) {
  const row = db.prepare('SELECT entries FROM giveaways WHERE message_id = ?').get(messageId);
  if (!row || !row.entries) return [];
  try {
    return JSON.parse(row.entries);
  } catch (e) {
    return [];
  }
}

function updateGiveawayEntries(messageId, entries) {
  const jsonStr = typeof entries === 'string' ? entries : JSON.stringify(entries);
  db.prepare('UPDATE giveaways SET entries = ? WHERE message_id = ?').run(jsonStr, messageId);
}

function addGiveawayEntry(messageId, userId) {
  const entries = getGiveawayEntries(messageId);
  if (!entries.includes(userId)) {
    entries.push(userId);
    updateGiveawayEntries(messageId, entries);
    return { added: true, count: entries.length };
  }
  return { added: false, count: entries.length };
}

function removeGiveawayEntry(messageId, userId) {
  let entries = getGiveawayEntries(messageId);
  if (entries.includes(userId)) {
    entries = entries.filter(id => id !== userId);
    updateGiveawayEntries(messageId, entries);
    return { removed: true, count: entries.length };
  }
  return { removed: false, count: entries.length };
}

function toggleGiveawayEntry(messageId, userId) {
  const entries = getGiveawayEntries(messageId);
  if (entries.includes(userId)) {
    const updated = entries.filter(id => id !== userId);
    updateGiveawayEntries(messageId, updated);
    return { joined: false, count: updated.length };
  } else {
    entries.push(userId);
    updateGiveawayEntries(messageId, entries);
    return { joined: true, count: entries.length };
  }
}

function endGiveaway(messageId) {
  db.prepare("UPDATE giveaways SET status = 'ended' WHERE message_id = ?").run(messageId);
}

function getGuildGiveaways(guildId) {
  return db.prepare('SELECT * FROM giveaways WHERE guild_id = ? ORDER BY id DESC').all(guildId);
}

// ==========================================
// 👮 Staff Activity System
// ==========================================
function getStaffMember(guildId, userId) {
  let member = db.prepare('SELECT * FROM staff_activity WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!member) {
    db.prepare(`
      INSERT INTO staff_activity (guild_id, user_id, tickets_closed, mod_actions, bans_count, kicks_count, mutes_count, warns_count, messages_count, voice_seconds, streak_days, points)
      VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
    `).run(guildId, userId);
    member = db.prepare('SELECT * FROM staff_activity WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  }
  return member;
}

function updateStaffActivityStreak(guildId, userId) {
  const today = new Date().toISOString().slice(0, 10);
  const staff = getStaffMember(guildId, userId);
  if (staff.last_active_day === today) return;

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let newStreak = (staff.last_active_day === yesterday) ? (staff.streak_days + 1) : 1;

  db.prepare('UPDATE staff_activity SET streak_days = ?, last_active_day = ? WHERE guild_id = ? AND user_id = ?')
    .run(newStreak, today, guildId, userId);
}

function recordStaffAction(guildId, staffId, actionType, targetId = null, reason = null, details = null) {
  try {
    getStaffMember(guildId, staffId);
    updateStaffActivityStreak(guildId, staffId);

    // تسجيل الحدث في سجل الإجراءات
    db.prepare(`
      INSERT INTO staff_actions (guild_id, staff_id, action_type, target_id, reason, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(guildId, staffId, actionType, targetId, reason, details);

    // تحديث العدادات والنقاط
    let pointsToAdd = 10;
    let colToIncrement = 'mod_actions';

    if (actionType === 'ticket_close') {
      colToIncrement = 'tickets_closed';
      pointsToAdd = 25;
    } else if (actionType === 'ticket_claim') {
      colToIncrement = 'mod_actions';
      pointsToAdd = 10;
    } else if (actionType === 'ban') {
      colToIncrement = 'bans_count';
      pointsToAdd = 20;
    } else if (actionType === 'kick') {
      colToIncrement = 'kicks_count';
      pointsToAdd = 15;
    } else if (actionType === 'mute') {
      colToIncrement = 'mutes_count';
      pointsToAdd = 10;
    } else if (actionType === 'warn') {
      colToIncrement = 'warns_count';
      pointsToAdd = 5;
    }

    if (colToIncrement === 'tickets_closed') {
      db.prepare(`
        UPDATE staff_activity 
        SET tickets_closed = tickets_closed + 1, points = points + ? 
        WHERE guild_id = ? AND user_id = ?
      `).run(pointsToAdd, guildId, staffId);
    } else {
      db.prepare(`
        UPDATE staff_activity 
        SET mod_actions = mod_actions + 1, ${colToIncrement} = ${colToIncrement} + 1, points = points + ? 
        WHERE guild_id = ? AND user_id = ?
      `).run(pointsToAdd, guildId, staffId);
    }
  } catch (err) {
    console.error('[DB] recordStaffAction error:', err);
  }
}

function addStaffMessages(guildId, staffId, count = 1) {
  try {
    getStaffMember(guildId, staffId);
    updateStaffActivityStreak(guildId, staffId);
    db.prepare('UPDATE staff_activity SET messages_count = messages_count + ?, points = points + 1 WHERE guild_id = ? AND user_id = ?')
      .run(count, guildId, staffId);
  } catch (e) {}
}

function addStaffVoiceTime(guildId, staffId, seconds) {
  try {
    getStaffMember(guildId, staffId);
    updateStaffActivityStreak(guildId, staffId);
    const points = Math.floor(seconds / 300); // 1 point per 5 mins
    db.prepare('UPDATE staff_activity SET voice_seconds = voice_seconds + ?, points = points + ? WHERE guild_id = ? AND user_id = ?')
      .run(seconds, points, guildId, staffId);
  } catch (e) {}
}

function getStaffLeaderboard(guildId, limit = 25) {
  return db.prepare(`
    SELECT *, 
      (tickets_closed * 25 + mod_actions * 10 + messages_count * 1 + (voice_seconds / 300) * 1) as performance_score
    FROM staff_activity 
    WHERE guild_id = ? 
    ORDER BY performance_score DESC, points DESC
    LIMIT ?
  `).all(guildId, limit);
}

function getStaffActionLogs(guildId, limit = 50) {
  return db.prepare('SELECT * FROM staff_actions WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?').all(guildId, limit);
}

function getStaffGoals(guildId) {
  return db.prepare('SELECT * FROM staff_goals WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
}

function addStaffGoal(guildId, title, targetType, targetValue, rewardPoints = 100) {
  const stmt = db.prepare('INSERT INTO staff_goals (guild_id, title, target_type, target_value, reward_points) VALUES (?, ?, ?, ?, ?)');
  return stmt.run(guildId, title, targetType, targetValue, rewardPoints);
}

function deleteStaffGoal(id, guildId) {
  return db.prepare('DELETE FROM staff_goals WHERE id = ? AND guild_id = ?').run(id, guildId);
}

function resetStaffStats(guildId, userId = null) {
  if (userId) {
    return db.prepare('UPDATE staff_activity SET tickets_closed = 0, mod_actions = 0, bans_count = 0, kicks_count = 0, mutes_count = 0, warns_count = 0, messages_count = 0, voice_seconds = 0, streak_days = 0, points = 0, shift_seconds = 0, total_shifts = 0 WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  }
  return db.prepare('UPDATE staff_activity SET tickets_closed = 0, mod_actions = 0, bans_count = 0, kicks_count = 0, mutes_count = 0, warns_count = 0, messages_count = 0, voice_seconds = 0, streak_days = 0, points = 0, shift_seconds = 0, total_shifts = 0 WHERE guild_id = ?').run(guildId);
}

// 🕒 Staff Shifts & Attendance (تسجيل الحضور والانصراف والساعات)
function startStaffShift(guildId, userId) {
  try {
    getStaffMember(guildId, userId);
    const existing = db.prepare("SELECT * FROM staff_shifts WHERE guild_id = ? AND user_id = ? AND status = 'active'").get(guildId, userId);
    if (existing) return { success: false, error: 'already_active', shift: existing };

    const now = Math.floor(Date.now() / 1000);
    const res = db.prepare("INSERT INTO staff_shifts (guild_id, user_id, start_time, status) VALUES (?, ?, ?, 'active')").run(guildId, userId, now);
    const shift = db.prepare("SELECT * FROM staff_shifts WHERE id = ?").get(res.lastInsertRowid);
    return { success: true, shift };
  } catch (err) {
    console.error('[DB] startStaffShift error:', err);
    return { success: false, error: err.message };
  }
}

function endStaffShift(guildId, userId, endedBy = 'user') {
  try {
    const shift = db.prepare("SELECT * FROM staff_shifts WHERE guild_id = ? AND user_id = ? AND status = 'active'").get(guildId, userId);
    if (!shift) return { success: false, error: 'not_active' };

    const now = Math.floor(Date.now() / 1000);
    const duration = Math.max(1, now - shift.start_time);

    // إنهاء الشفت وحفظه في السجل
    db.prepare("DELETE FROM staff_shifts WHERE id = ?").run(shift.id);
    db.prepare(`
      INSERT INTO staff_shift_logs (guild_id, user_id, start_time, end_time, duration_seconds, ended_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(guildId, userId, shift.start_time, now, duration, endedBy);

    // احتساب النقاط بناءً على الساعات (نقطة لكل 10 دقائق عمل)
    const pointsEarned = Math.max(1, Math.floor(duration / 600));

    // تحديث إحصائيات الإداري
    getStaffMember(guildId, userId);
    updateStaffActivityStreak(guildId, userId);
    db.prepare(`
      UPDATE staff_activity 
      SET shift_seconds = shift_seconds + ?, total_shifts = total_shifts + 1, points = points + ?
      WHERE guild_id = ? AND user_id = ?
    `).run(duration, pointsEarned, guildId, userId);

    return {
      success: true,
      duration,
      pointsEarned,
      startTime: shift.start_time,
      endTime: now,
      endedBy
    };
  } catch (err) {
    console.error('[DB] endStaffShift error:', err);
    return { success: false, error: err.message };
  }
}

function getActiveStaffShift(guildId, userId) {
  try {
    return db.prepare("SELECT * FROM staff_shifts WHERE guild_id = ? AND user_id = ? AND status = 'active'").get(guildId, userId);
  } catch (e) {
    return null;
  }
}

function getAllActiveShifts(guildId = null) {
  try {
    if (guildId) {
      return db.prepare("SELECT * FROM staff_shifts WHERE guild_id = ? AND status = 'active'").all(guildId);
    }
    return db.prepare("SELECT * FROM staff_shifts WHERE status = 'active'").all();
  } catch (e) {
    return [];
  }
}

function touchStaffShiftAction(guildId, userId) {
  try {
    const now = Math.floor(Date.now() / 1000);
    db.prepare("UPDATE staff_shifts SET last_action_time = ? WHERE guild_id = ? AND user_id = ? AND status = 'active'")
      .run(now, guildId, userId);
  } catch (e) {}
}

function getStaffHoursLeaderboard(guildId, limit = 25) {
  try {
    return db.prepare(`
      SELECT user_id, shift_seconds, total_shifts, points,
             ROUND(CAST(shift_seconds AS REAL) / 3600, 2) as total_hours
      FROM staff_activity
      WHERE guild_id = ?
      ORDER BY shift_seconds DESC, total_shifts DESC
      LIMIT ?
    `).all(guildId, limit);
  } catch (e) {
    return [];
  }
}

function getStaffPointsLeaderboard(guildId, limit = 25) {
  try {
    return db.prepare(`
      SELECT user_id, points, shift_seconds, total_shifts, tickets_closed, mod_actions,
             ROUND(CAST(shift_seconds AS REAL) / 3600, 2) as total_hours
      FROM staff_activity
      WHERE guild_id = ?
      ORDER BY points DESC, shift_seconds DESC
      LIMIT ?
    `).all(guildId, limit);
  } catch (e) {
    return [];
  }
}

function setStaffPoints(guildId, userId, points) {
  try {
    getStaffMember(guildId, userId);
    return db.prepare("UPDATE staff_activity SET points = ? WHERE guild_id = ? AND user_id = ?").run(points, guildId, userId);
  } catch (e) {
    return null;
  }
}

function addStaffPoints(guildId, userId, points) {
  try {
    getStaffMember(guildId, userId);
    return db.prepare("UPDATE staff_activity SET points = points + ? WHERE guild_id = ? AND user_id = ?").run(points, guildId, userId);
  } catch (e) {
    return null;
  }
}

// ==========================================
// 🛡️ Whitelist & Anti Mod Helpers
// ==========================================
function getProtectionWhitelist(guildId, type = null) {
  if (type) {
    return db.prepare('SELECT * FROM protection_whitelist WHERE guild_id = ? AND type = ? ORDER BY created_at DESC').all(guildId, type);
  }
  return db.prepare('SELECT * FROM protection_whitelist WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
}

function addProtectionWhitelist(guildId, userId, type = 'whitelist', addedBy = null) {
  try {
    const stmt = db.prepare('INSERT OR IGNORE INTO protection_whitelist (guild_id, user_id, type, added_by) VALUES (?, ?, ?, ?)');
    return stmt.run(guildId, userId, type, addedBy);
  } catch (err) {
    console.error('Error adding to protection whitelist:', err);
    return null;
  }
}

function removeProtectionWhitelist(guildId, userId, type = 'whitelist') {
  return db.prepare('DELETE FROM protection_whitelist WHERE guild_id = ? AND user_id = ? AND type = ?').run(guildId, userId, type);
}

function isUserWhitelisted(guildId, userId, type = 'whitelist') {
  try {
    const row = db.prepare("SELECT id FROM protection_whitelist WHERE guild_id = ? AND user_id = ? AND (type = ? OR type = 'antimod')").get(guildId, userId, type);
    return !!row;
  } catch(e) {
    return false;
  }
}

// ==========================================
// 📋 Security & Moderation Logs Helpers
// ==========================================
function logSecurityEvent(guildId, category, actionType, executorId = null, targetId = null, reason = '', details = '') {
  try {
    const stmt = db.prepare(`
      INSERT INTO security_logs (guild_id, category, action_type, executor_id, target_id, reason, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(guildId, category, actionType, executorId, targetId, reason, details);
  } catch (err) {
    console.error('Error logging security event:', err);
    return null;
  }
}

function getSecurityLogs(guildId, category = null, limit = 50) {
  if (category) {
    return db.prepare('SELECT * FROM security_logs WHERE guild_id = ? AND category = ? ORDER BY created_at DESC LIMIT ?').all(guildId, category, limit);
  }
  return db.prepare('SELECT * FROM security_logs WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?').all(guildId, limit);
}

// ==========================================
// ⚠️ Warn Punishments Helpers
// ==========================================
function getWarnPunishments(guildId) {
  return db.prepare('SELECT * FROM warn_punishments WHERE guild_id = ? ORDER BY warn_count ASC').all(guildId);
}

function addWarnPunishment(guildId, warnCount, actionType) {
  const stmt = db.prepare('INSERT INTO warn_punishments (guild_id, warn_count, action_type) VALUES (?, ?, ?)');
  return stmt.run(guildId, warnCount, actionType);
}

function deleteWarnPunishment(id, guildId) {
  return db.prepare('DELETE FROM warn_punishments WHERE id = ? AND guild_id = ?').run(id, guildId);
}

// ==========================================
// Stats
// ==========================================
function getSystemStats() {
  const users = db.prepare('SELECT COUNT(DISTINCT user_id) as count FROM users').get();
  const guilds = db.prepare('SELECT COUNT(*) as count FROM guild_settings').get();
  const tickets = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'open'").get();
  return {
    totalUsers: users?.count || 0,
    totalGuilds: guilds?.count || 0,
    openTickets: tickets?.count || 0
  };
}

// ==========================================
// Export
// ==========================================
module.exports = {
  db,
  getGuildSettings,
  setGuildSetting,
  updateGuildSetting,
  updateGuildSettings,
  getUser,
  addXp,
  addCoins,
  removeCoins,
  setCoins,
  getLastDaily,
  setLastDaily,
  setWallpaper,
  getLeaderboard,
  getLeaderboardFromTurso,
  getCoinsLeaderboard,
  addWarning,
  getWarnings,
  clearWarnings,
  // 🎫 Tickets
  createTicket,
  closeTicket,
  deleteTicket,
  getTicket: getTicketByChannel,
  getTicketByChannel,
  getUserActiveTickets,
  getGuildTickets,
  claimTicket,
  unclaimTicket,
  transferTicket,
  saveTicketPanel,
  getTicketPanel,
  getGuildTicketPanels,
  deleteTicketPanel,
  addTicketRating,
  getStaffRatings,
  getStaffAverageRating,
  saveTranscript,
  getTranscript,
  // 🔗 Invites
  getInvites,
  addInviteRecord,
  removeInviteMember,
  addBonusInvites,
  getInvitesLeaderboard,
  getMemberInviter,
  resetInvites,
  // 🎁 Giveaways
  createGiveaway,
  getGiveaway,
  getActiveGiveaways,
  getGiveawayEntries,
  updateGiveawayEntries,
  addGiveawayEntry,
  removeGiveawayEntry,
  toggleGiveawayEntry,
  endGiveaway,
  // 📢 Broadcasts
  createBroadcast,
  getGuildBroadcasts,
  getBroadcast,
  deleteBroadcast,
  getAllActiveBroadcasts,
  updateBroadcastLastSent,
  updateBroadcastStatus,
  // Temp Voice
  createTempVoice,
  isTempVoice,
  getTempVoice,
  deleteTempVoice,
  setReactionRole,
  getReactionRole,
  getGuildReactionRoles,
  deleteReactionRole,
  addAutoResponder,
  getAutoResponders,
  deleteAutoResponder,
  addLevelReward,
  getLevelRewards,
  removeLevelReward,
  addStar,
  getStars,
  createApplication,
  updateApplication,
  getApplications,
  getApplication,
  deleteApplication,
  createSubmission,
  getSubmission,
  getPendingSubmissions,
  updateSubmissionStatus,
  getUserApplicationPoints,
  setUserApplicationPoints,
  addApplicationPoint,
  resetApplicationPoints,
  // 👮 Staff Activity Exports
  getStaffMember,
  recordStaffAction,
  addStaffMessages,
  addStaffVoiceTime,
  getStaffLeaderboard,
  getStaffActionLogs,
  getStaffGoals,
  addStaffGoal,
  deleteStaffGoal,
  resetStaffStats,
  startStaffShift,
  endStaffShift,
  getActiveStaffShift,
  getAllActiveShifts,
  touchStaffShiftAction,
  getStaffHoursLeaderboard,
  getStaffPointsLeaderboard,
  setStaffPoints,
  addStaffPoints,
  // 🛡️ Protection Whitelist & Logs Exports
  getProtectionWhitelist,
  addProtectionWhitelist,
  removeProtectionWhitelist,
  isUserWhitelisted,
  logSecurityEvent,
  getSecurityLogs,
  getWarnPunishments,
  addWarnPunishment,
  deleteWarnPunishment,
  // 🎁 Giveaway Exports
  createGiveaway,
  getGiveaway,
  getActiveGiveaways,
  getGiveawayEntries,
  updateGiveawayEntries,
  addGiveawayEntry,
  removeGiveawayEntry,
  toggleGiveawayEntry,
  endGiveaway,
  getGuildGiveaways: (guildId) => db.prepare('SELECT * FROM giveaways WHERE guild_id = ? ORDER BY end_time DESC LIMIT 50').all(guildId),
  // 💡 Suggestions Exports
  createSuggestion: (data) => {
    const res = db.prepare(`
      INSERT INTO suggestions (guild_id, channel_id, message_id, user_id, title, content, category, status, upvotes, downvotes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]')
    `).run(
      data.guild_id, data.channel_id || null, data.message_id || null, 
      data.user_id, data.title || null, data.content, 
      data.category || 'عام', data.status || 'pending'
    );
    return db.prepare('SELECT * FROM suggestions WHERE id = ?').get(res.lastInsertRowid);
  },
  getGuildSuggestions: (guildId, status = null) => {
    if (status) {
      return db.prepare('SELECT * FROM suggestions WHERE guild_id = ? AND status = ? ORDER BY id DESC').all(guildId, status);
    }
    return db.prepare('SELECT * FROM suggestions WHERE guild_id = ? ORDER BY id DESC').all(guildId);
  },
  getSuggestion: (idOrMsgId) => {
    if (!isNaN(idOrMsgId)) {
      return db.prepare('SELECT * FROM suggestions WHERE id = ? OR message_id = ?').get(Number(idOrMsgId), String(idOrMsgId));
    }
    return db.prepare('SELECT * FROM suggestions WHERE message_id = ?').get(String(idOrMsgId));
  },
  updateSuggestionStatus: (id, status, statusReason = null, reviewerId = null) => {
    db.prepare(`
      UPDATE suggestions 
      SET status = ?, status_reason = ?, reviewed_by = ?, reviewed_at = strftime('%s','now')
      WHERE id = ? OR message_id = ?
    `).run(status, statusReason, reviewerId, id, id);
    return db.prepare('SELECT * FROM suggestions WHERE id = ? OR message_id = ?').get(id, id);
  },
  voteSuggestion: (id, userId, voteType = 'up') => {
    const row = db.prepare('SELECT * FROM suggestions WHERE id = ? OR message_id = ?').get(id, id);
    if (!row) return null;
    let upvotes = [];
    let downvotes = [];
    try { upvotes = JSON.parse(row.upvotes || '[]'); } catch(e) {}
    try { downvotes = JSON.parse(row.downvotes || '[]'); } catch(e) {}

    const wasUp = upvotes.includes(userId);
    const wasDown = downvotes.includes(userId);

    upvotes = upvotes.filter(u => u !== userId);
    downvotes = downvotes.filter(u => u !== userId);

    let action = 'voted';
    if (voteType === 'up') {
      if (wasUp) {
        action = 'removed';
      } else {
        upvotes.push(userId);
      }
    } else if (voteType === 'down') {
      if (wasDown) {
        action = 'removed';
      } else {
        downvotes.push(userId);
      }
    }

    db.prepare('UPDATE suggestions SET upvotes = ?, downvotes = ? WHERE id = ?').run(
      JSON.stringify(upvotes), JSON.stringify(downvotes), row.id
    );
    return {
      upvotesCount: upvotes.length,
      downvotesCount: downvotes.length,
      action,
      voteType
    };
  },
  deleteSuggestion: (id) => db.prepare('DELETE FROM suggestions WHERE id = ? OR message_id = ?').run(id, id),
  // 🔒 Jail System Exports
  jailUser: (guildId, userId, moderatorId, reason, oldRoles = [], jailUntil = null) => {
    try {
      db.prepare(`
        INSERT OR REPLACE INTO jail_users (guild_id, user_id, moderator_id, reason, old_roles, jailed_at, jail_until)
        VALUES (?, ?, ?, ?, ?, strftime('%s','now'), ?)
      `).run(guildId, userId, moderatorId, reason, JSON.stringify(oldRoles), jailUntil);
      return true;
    } catch(e) {
      console.error('Error jailing user:', e);
      return false;
    }
  },
  unjailUser: (guildId, userId) => {
    try {
      const row = db.prepare('SELECT * FROM jail_users WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
      db.prepare('DELETE FROM jail_users WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
      return row;
    } catch(e) {
      return null;
    }
  },
  getJailUser: (guildId, userId) => {
    return db.prepare('SELECT * FROM jail_users WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  },
  getGuildJailedUsers: (guildId) => {
    return db.prepare('SELECT * FROM jail_users WHERE guild_id = ?').all(guildId);
  },
  getExpiredJails: () => {
    const now = Math.floor(Date.now() / 1000);
    return db.prepare('SELECT * FROM jail_users WHERE jail_until IS NOT NULL AND jail_until <= ?').all(now);
  },
  // 🔇 Temp Mutes System Exports
  addTempMute: (guildId, userId, moderatorId, reason, unmuteAt) => {
    try {
      return db.prepare(`
        INSERT INTO temp_mutes (guild_id, user_id, moderator_id, reason, unmute_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(guildId, userId, moderatorId, reason, unmuteAt);
    } catch(e) { return null; }
  },
  removeTempMute: (guildId, userId) => {
    return db.prepare('DELETE FROM temp_mutes WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  },
  getExpiredTempMutes: () => {
    const now = Math.floor(Date.now() / 1000);
    return db.prepare('SELECT * FROM temp_mutes WHERE unmute_at <= ?').all(now);
  },
  // Compatibility aliases
  getTopXp: getLeaderboard,
  getTopCredits: getCoinsLeaderboard,
  addCredits: addCoins,
  getUser,
  getCoins,
  getBank,
  depositBank,
  withdrawBank,
  setLastWork,
  addCoins,
  removeCoins,
  setCoins,
  transferCoins,
  getLastDaily,
  setLastDaily,
  getCoinsLeaderboard,
  getLeaderboard,
  getUserRank: (userId, guildId) => {
    const user = getUser(userId, guildId);
    return { xp: user.xp || 0, level: user.level || 1, rank: 1 };
  },
  getWallpaper,
  setWallpaper,
  setDaily: (userId, guildId, now, amount) => {
    addCoins(userId, guildId, amount);
    setLastDaily(userId, guildId, now);
    const u = getUser(userId, guildId);
    return u.coins || 0;
  },
  trackGuildInfo,
  getTrackedGuildInfo,
  trackUserProfile,
  getUserProfile,
  getTrackedUserProfiles,
  db
};