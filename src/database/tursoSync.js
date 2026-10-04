/**
 * @module tursoSync
 * @description Background synchronization between local SQLite (better-sqlite3) and remote Turso database.
 * Ensures that coins, XP, daily streak, and essential settings persist across Render redeploys and restarts.
 *
 * Designed for Render:
 * - TURSO_DATABASE_URL / TURSO_URL
 * - TURSO_AUTH_TOKEN / TURSO_TOKEN
 */

const { createClient } = require('@libsql/client');

class TursoSync {
  constructor() {
    this.client = null;
    this.enabled = false;
    this.syncQueue = [];
    this.isProcessingQueue = false;

    // Support Turso environment variables configured in Render Dashboard
    const cleanEnv = (value) => String(value || '').trim().replace(/^['"]|['"]$/g, '');
    const url = cleanEnv(
      process.env.TURSO_DATABASE_URL ||
      process.env.TURSO_URL ||
      process.env.LIBSQL_URL ||
      process.env.TURSO_DATABASE_UR
    );
    const authToken = cleanEnv(
      process.env.TURSO_AUTH_TOKEN ||
      process.env.TURSO_TOKEN ||
      process.env.LIBSQL_AUTH_TOKEN
    );

    if (url && (url.startsWith('libsql://') || url.startsWith('https://'))) {
      try {
        this.client = createClient({
          url,
          authToken: authToken || undefined,
        });
        this.enabled = true;
        console.log('[TURSO] 🌐 Turso Cloud Database Sync initialized on Render successfully.');
        console.log('[TURSO] 🔐 URL configured: yes | Auth token configured: ' + (authToken ? 'yes' : 'no'));
      } catch (err) {
        console.error('[TURSO] ⚠️ Failed to initialize Turso client on Render:', err.message);
      }
    } else {
      console.log('[TURSO] ℹ️ Turso credentials not detected on Render. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Render Environment Variables.');
    }
  }

  /**
   * Initializes tables on Turso and restores data into local SQLite at startup
   */
  async initAndRestore(localDb) {
    if (!this.enabled || !this.client) return;

    try {
      // 1. Create essential persistent tables in Turso
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS users (
          user_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          xp INTEGER DEFAULT 0,
          level INTEGER DEFAULT 1,
          coins INTEGER DEFAULT 0,
          bank_balance INTEGER DEFAULT 0,
          reputation INTEGER DEFAULT 0,
          last_daily INTEGER DEFAULT 0,
          last_work INTEGER DEFAULT 0,
          last_message_xp INTEGER DEFAULT 0,
          wallpaper TEXT DEFAULT 'default',
          warnings INTEGER DEFAULT 0,
          streak INTEGER DEFAULT 0,
          PRIMARY KEY (user_id, guild_id)
        );
      `);

      // Add columns safely if table already existed
      try { await this.client.execute("ALTER TABLE users ADD COLUMN bank_balance INTEGER DEFAULT 0;"); } catch (e) {}
      try { await this.client.execute("ALTER TABLE users ADD COLUMN last_work INTEGER DEFAULT 0;"); } catch (e) {}

      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS guild_settings (
          guild_id TEXT PRIMARY KEY,
          prefix TEXT DEFAULT '#',
          welcome_channel TEXT,
          log_channel TEXT,
          economy_enabled INTEGER DEFAULT 1,
          settings_json TEXT DEFAULT '{}'
        );
      `);

      // Add settings_json column to existing guild_settings table if missing
      try { await this.client.execute("ALTER TABLE guild_settings ADD COLUMN settings_json TEXT DEFAULT '{}';"); } catch (e) {}

      // 1.5 Create user_profiles table in Turso for persistent usernames & avatars
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS user_profiles (
          user_id TEXT PRIMARY KEY,
          username TEXT,
          display_name TEXT,
          avatar TEXT,
          avatar_url TEXT,
          updated_at INTEGER DEFAULT 0
        );
      `);

      // 1.6 Create auto_responders table in Turso
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS auto_responders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          trigger_word TEXT NOT NULL,
          reply_text TEXT NOT NULL,
          match_mode TEXT DEFAULT 'contains',
          reply_type TEXT DEFAULT 'text',
          case_sensitive INTEGER DEFAULT 0,
          delete_trigger INTEGER DEFAULT 0,
          cooldown_seconds INTEGER DEFAULT 0,
          allowed_channels TEXT DEFAULT '',
          allowed_roles TEXT DEFAULT '',
          exempt_channels TEXT DEFAULT '',
          exempt_roles TEXT DEFAULT '',
          is_active INTEGER DEFAULT 1,
          uses_count INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s','now'))
        );
      `);
      try { await this.client.execute("ALTER TABLE auto_responders ADD COLUMN match_mode TEXT DEFAULT 'contains';"); } catch(e) {}
      try { await this.client.execute("ALTER TABLE auto_responders ADD COLUMN reply_type TEXT DEFAULT 'text';"); } catch(e) {}
      try { await this.client.execute("ALTER TABLE auto_responders ADD COLUMN case_sensitive INTEGER DEFAULT 0;"); } catch(e) {}
      try { await this.client.execute("ALTER TABLE auto_responders ADD COLUMN delete_trigger INTEGER DEFAULT 0;"); } catch(e) {}
      try { await this.client.execute("ALTER TABLE auto_responders ADD COLUMN cooldown_seconds INTEGER DEFAULT 0;"); } catch(e) {}
      try { await this.client.execute("ALTER TABLE auto_responders ADD COLUMN allowed_channels TEXT DEFAULT '';"); } catch(e) {}
      try { await this.client.execute("ALTER TABLE auto_responders ADD COLUMN allowed_roles TEXT DEFAULT '';"); } catch(e) {}
      try { await this.client.execute("ALTER TABLE auto_responders ADD COLUMN exempt_channels TEXT DEFAULT '';"); } catch(e) {}
      try { await this.client.execute("ALTER TABLE auto_responders ADD COLUMN exempt_roles TEXT DEFAULT '';"); } catch(e) {}
      try { await this.client.execute("ALTER TABLE auto_responders ADD COLUMN is_active INTEGER DEFAULT 1;"); } catch(e) {}
      try { await this.client.execute("ALTER TABLE auto_responders ADD COLUMN uses_count INTEGER DEFAULT 0;"); } catch(e) {}
      try { await this.client.execute("ALTER TABLE auto_responders ADD COLUMN created_at INTEGER DEFAULT (strftime('%s','now'));"); } catch(e) {}

      // 1.7 Create store_items and inventory tables in Turso
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS store_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT DEFAULT '',
          item_type TEXT NOT NULL DEFAULT 'role',
          icon TEXT DEFAULT '🎁',
          image_url TEXT DEFAULT '',
          price INTEGER NOT NULL DEFAULT 100,
          original_price INTEGER DEFAULT 0,
          stock INTEGER DEFAULT -1,
          role_id TEXT DEFAULT '',
          booster_multiplier REAL DEFAULT 1.5,
          booster_duration INTEGER DEFAULT 3600,
          cooldown_seconds INTEGER DEFAULT 0,
          is_featured INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          badge_label TEXT DEFAULT '',
          total_sold INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s','now')),
          updated_at INTEGER DEFAULT (strftime('%s','now'))
        );
      `);

      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS user_inventory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          item_id INTEGER NOT NULL,
          quantity INTEGER DEFAULT 1,
          is_active INTEGER DEFAULT 1,
          expires_at INTEGER DEFAULT 0,
          purchased_at INTEGER DEFAULT (strftime('%s','now'))
        );
      `);

      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS store_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          item_id INTEGER NOT NULL,
          item_name TEXT NOT NULL,
          amount INTEGER NOT NULL,
          price_paid INTEGER NOT NULL,
          status TEXT DEFAULT 'success',
          notes TEXT DEFAULT '',
          created_at INTEGER DEFAULT (strftime('%s','now'))
        );
      `);

      console.log('[TURSO] ✅ Turso remote tables verified.');

      // 2. Restore users data from Turso to local SQLite (Restoring coins/streak/XP after container restart)
      const usersResult = await this.client.execute('SELECT * FROM users');
      if (usersResult.rows && usersResult.rows.length > 0) {
        console.log(`[TURSO] 🔄 Restoring ${usersResult.rows.length} users from Turso into local SQLite...`);
        const insertOrReplace = localDb.prepare(`
          INSERT INTO users (user_id, guild_id, xp, level, coins, bank_balance, reputation, last_daily, last_work, last_message_xp, wallpaper, warnings, streak)
          VALUES (@user_id, @guild_id, @xp, @level, @coins, @bank_balance, @reputation, @last_daily, @last_work, @last_message_xp, @wallpaper, @warnings, @streak)
          ON CONFLICT(user_id, guild_id) DO UPDATE SET
            coins = MAX(users.coins, excluded.coins),
            bank_balance = MAX(users.bank_balance, excluded.bank_balance),
            xp = MAX(users.xp, excluded.xp),
            level = MAX(users.level, excluded.level),
            last_daily = MAX(users.last_daily, excluded.last_daily),
            last_work = MAX(users.last_work, excluded.last_work),
            streak = MAX(users.streak, excluded.streak);
        `);

        const restoreTransaction = localDb.transaction((rows) => {
          for (const row of rows) {
            insertOrReplace.run({
              user_id: String(row.user_id),
              guild_id: String(row.guild_id),
              xp: Number(row.xp || 0),
              level: Number(row.level || 1),
              coins: Number(row.coins || 0),
              bank_balance: Number(row.bank_balance || 0),
              reputation: Number(row.reputation || 0),
              last_daily: Number(row.last_daily || 0),
              last_work: Number(row.last_work || 0),
              last_message_xp: Number(row.last_message_xp || 0),
              wallpaper: String(row.wallpaper || 'default'),
              warnings: Number(row.warnings || 0),
              streak: Number(row.streak || 0)
            });
          }
        });

        restoreTransaction(usersResult.rows);
        console.log('[TURSO] 🎉 Data restoration complete! All gold and users successfully preserved.');
      } else {
        // If Turso is currently empty, push existing local users to Turso
        console.log('[TURSO] ℹ️ Turso is currently empty. Initializing remote database with local data...');
        this.backupAllLocalUsers(localDb);
      }

      // 3. Restore user_profiles from Turso into local SQLite
      try {
        const profilesResult = await this.client.execute('SELECT * FROM user_profiles');
        if (profilesResult.rows && profilesResult.rows.length > 0) {
          console.log(`[TURSO] 🔄 Restoring ${profilesResult.rows.length} user profiles from Turso into local SQLite...`);
          const insertProfile = localDb.prepare(`
            INSERT INTO user_profiles (user_id, username, display_name, avatar, avatar_url, updated_at)
            VALUES (@user_id, @username, @display_name, @avatar, @avatar_url, @updated_at)
            ON CONFLICT(user_id) DO UPDATE SET
              username = COALESCE(excluded.username, user_profiles.username),
              display_name = COALESCE(excluded.display_name, user_profiles.display_name),
              avatar = COALESCE(excluded.avatar, user_profiles.avatar),
              avatar_url = COALESCE(excluded.avatar_url, user_profiles.avatar_url),
              updated_at = excluded.updated_at
          `);

          const restoreProfilesTx = localDb.transaction((rows) => {
            for (const row of rows) {
              insertProfile.run({
                user_id: String(row.user_id),
                username: row.username ? String(row.username) : null,
                display_name: row.display_name ? String(row.display_name) : null,
                avatar: row.avatar ? String(row.avatar) : null,
                avatar_url: row.avatar_url ? String(row.avatar_url) : null,
                updated_at: Number(row.updated_at || 0)
              });
            }
          });

          restoreProfilesTx(profilesResult.rows);
          console.log('[TURSO] 🎉 User profiles successfully restored from Turso!');
        } else {
          this.backupAllLocalProfiles(localDb);
        }
      } catch (profErr) {
        console.error('[TURSO] ⚠️ Error restoring user profiles:', profErr.message);
      }

      // 4. ✅ Restore guild_settings (including command_configs/aliases) from Turso into local SQLite
      try {
        const guildSettingsResult = await this.client.execute(
          "SELECT guild_id, settings_json FROM guild_settings WHERE settings_json IS NOT NULL AND settings_json != '{}'"
        );
        if (guildSettingsResult.rows && guildSettingsResult.rows.length > 0) {
          console.log(`[TURSO] 🔄 Restoring ${guildSettingsResult.rows.length} guild settings from Turso into local SQLite...`);
          const restoreSettingsTx = localDb.transaction((rows) => {
            for (const row of rows) {
              try {
                const settingsObj = JSON.parse(row.settings_json || '{}');
                if (!settingsObj || typeof settingsObj !== 'object') continue;
                // Ensure guild row exists
                localDb.prepare('INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)').run(String(row.guild_id));
                // Apply each setting key
                for (const [key, value] of Object.entries(settingsObj)) {
                  try {
                    localDb.prepare(`UPDATE guild_settings SET ${key} = ? WHERE guild_id = ?`).run(
                      typeof value === 'object' ? JSON.stringify(value) : value,
                      String(row.guild_id)
                    );
                  } catch (colErr) {
                    if (colErr.message && colErr.message.includes('no such column')) {
                      try {
                        const colType = typeof value === 'number' ? 'INTEGER' : 'TEXT';
                        localDb.exec(`ALTER TABLE guild_settings ADD COLUMN ${key} ${colType};`);
                        localDb.prepare(`UPDATE guild_settings SET ${key} = ? WHERE guild_id = ?`).run(
                          typeof value === 'object' ? JSON.stringify(value) : value,
                          String(row.guild_id)
                        );
                      } catch (addErr) {}
                    }
                  }
                }
              } catch (parseErr) {
                console.error(`[TURSO] ⚠️ Failed to parse settings_json for guild ${row.guild_id}:`, parseErr.message);
              }
            }
          });
          restoreSettingsTx(guildSettingsResult.rows);
          console.log('[TURSO] ✅ Guild settings (including command aliases) restored from Turso!');
        } else {
          // Turso has no guild settings yet — push local ones to Turso
          console.log('[TURSO] ℹ️ No guild settings in Turso yet. Pushing local guild settings to Turso...');
          this.backupAllLocalGuildSettings(localDb);
        }
      } catch (gsErr) {
        console.error('[TURSO] ⚠️ Error restoring guild settings:', gsErr.message);
      }

      // 5. ✅ Restore store_items from Turso into local SQLite
      try {
        const storeItemsResult = await this.client.execute('SELECT * FROM store_items WHERE is_active = 1');
        if (storeItemsResult.rows && storeItemsResult.rows.length > 0) {
          console.log(`[TURSO] 🔄 Restoring ${storeItemsResult.rows.length} store items from Turso into local SQLite...`);
          const insertItem = localDb.prepare(`
            INSERT INTO store_items (id, guild_id, name, description, item_type, icon, image_url, price, original_price, stock, role_id, booster_multiplier, booster_duration, cooldown_seconds, is_featured, badge_label, is_active, total_sold, created_at, updated_at)
            VALUES (@id, @guild_id, @name, @description, @item_type, @icon, @image_url, @price, @original_price, @stock, @role_id, @booster_multiplier, @booster_duration, @cooldown_seconds, @is_featured, @badge_label, @is_active, @total_sold, @created_at, @updated_at)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              description = excluded.description,
              price = excluded.price,
              original_price = excluded.original_price,
              stock = excluded.stock,
              is_featured = excluded.is_featured,
              badge_label = excluded.badge_label,
              is_active = excluded.is_active,
              total_sold = excluded.total_sold,
              updated_at = excluded.updated_at
          `);
          const restoreItemsTx = localDb.transaction((rows) => {
            for (const row of rows) {
              try {
                insertItem.run({
                  id: Number(row.id),
                  guild_id: String(row.guild_id),
                  name: String(row.name || ''),
                  description: String(row.description || ''),
                  item_type: String(row.item_type || 'role'),
                  icon: String(row.icon || '🎁'),
                  image_url: String(row.image_url || ''),
                  price: Number(row.price || 100),
                  original_price: Number(row.original_price || 0),
                  stock: Number(row.stock ?? -1),
                  role_id: String(row.role_id || ''),
                  booster_multiplier: Number(row.booster_multiplier || 1.5),
                  booster_duration: Number(row.booster_duration || 3600),
                  cooldown_seconds: Number(row.cooldown_seconds || 0),
                  is_featured: Number(row.is_featured || 0),
                  badge_label: String(row.badge_label || ''),
                  is_active: Number(row.is_active ?? 1),
                  total_sold: Number(row.total_sold || 0),
                  created_at: Number(row.created_at || 0),
                  updated_at: Number(row.updated_at || 0)
                });
              } catch (rowErr) {}
            }
          });
          restoreItemsTx(storeItemsResult.rows);
          console.log('[TURSO] ✅ Store items successfully restored from Turso!');
        }
      } catch (storeErr) {
        console.error('[TURSO] ⚠️ Error restoring store items:', storeErr.message);
      }

      // ✅ بعد انتهاء كل الاستعادة — مسح cache الداشبورد حتى يظهر الـ leaderboard بالبيانات الصحيحة

      if (typeof global._zenoDashboardClearCaches === 'function') {
        setTimeout(() => {
          try { global._zenoDashboardClearCaches(); } catch(e) {}
        }, 1000); // نتأخر ثانية إضافية للتأكد من انتهاء كل العمليات
      }

    } catch (err) {
      console.error('[TURSO] ⚠️ Error during initAndRestore:', err.message);
    }
  }

  /**
   * Syncs a specific user's latest coins, streak, and daily state immediately to Turso
   */
  queueUserSync(userData) {
    if (!this.enabled || !this.client || !userData || !userData.user_id) return;

    const sql = `
      INSERT INTO users (user_id, guild_id, xp, level, coins, bank_balance, reputation, last_daily, last_work, last_message_xp, wallpaper, warnings, streak)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, guild_id) DO UPDATE SET
        coins = excluded.coins,
        bank_balance = excluded.bank_balance,
        xp = excluded.xp,
        level = excluded.level,
        last_daily = excluded.last_daily,
        last_work = excluded.last_work,
        streak = excluded.streak;
    `;
    const args = [
      String(userData.user_id),
      String(userData.guild_id || 'global'),
      Number(userData.xp || 0),
      Number(userData.level || 1),
      Number(userData.coins || 0),
      Number(userData.bank_balance || 0),
      Number(userData.reputation || 0),
      Number(userData.last_daily || 0),
      Number(userData.last_work || 0),
      Number(userData.last_message_xp || 0),
      String(userData.wallpaper || 'default'),
      Number(userData.warnings || 0),
      Number(userData.streak || 0)
    ];

    this.enqueue({ sql, args });
  }

  /**
   * ✅ Syncs a guild's full settings (as JSON) to Turso immediately.
   * Call this whenever guild settings are updated (e.g., from the dashboard).
   */
  queueGuildSettingsSync(guildId, settingsRow) {
    if (!this.enabled || !this.client || !guildId || !settingsRow) return;

    // Store the full settings row as JSON (excluding guild_id itself)
    const { guild_id, ...rest } = settingsRow;
    const settingsJson = JSON.stringify(rest);

    const sql = `
      INSERT INTO guild_settings (guild_id, settings_json)
      VALUES (?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        settings_json = excluded.settings_json;
    `;
    this.enqueue({ sql, args: [String(guildId), settingsJson] });
  }

  /**
   * Pushes all local users to Turso
   */
  async backupAllLocalUsers(localDb) {
    if (!this.enabled || !this.client) return;
    try {
      const rows = localDb.prepare('SELECT * FROM users').all();
      for (const row of rows) {
        this.queueUserSync(row);
      }
    } catch (e) {}
  }

  /**
   * ✅ Pushes all local guild settings to Turso
   */
  async backupAllLocalGuildSettings(localDb) {
    if (!this.enabled || !this.client) return;
    try {
      const rows = localDb.prepare('SELECT * FROM guild_settings').all();
      for (const row of rows) {
        if (row && row.guild_id) {
          this.queueGuildSettingsSync(row.guild_id, row);
        }
      }
      console.log(`[TURSO] 📤 Pushed ${rows.length} guild settings to Turso.`);
    } catch (e) {
      console.error('[TURSO] ⚠️ Failed to backup guild settings:', e.message);
    }
  }

  /**
   * Syncs a specific user's profile (username, avatar, display name) immediately to Turso
   */
  queueProfileSync(profileData) {
    if (!this.enabled || !this.client || !profileData || !profileData.user_id) return;

    const sql = `
      INSERT INTO user_profiles (user_id, username, display_name, avatar, avatar_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        username = COALESCE(excluded.username, user_profiles.username),
        display_name = COALESCE(excluded.display_name, user_profiles.display_name),
        avatar = COALESCE(excluded.avatar, user_profiles.avatar),
        avatar_url = COALESCE(excluded.avatar_url, user_profiles.avatar_url),
        updated_at = excluded.updated_at;
    `;
    const args = [
      String(profileData.user_id),
      profileData.username ? String(profileData.username) : null,
      profileData.display_name ? String(profileData.display_name) : null,
      profileData.avatar ? String(profileData.avatar) : null,
      profileData.avatar_url ? String(profileData.avatar_url) : null,
      Number(profileData.updated_at || Date.now())
    ];

    this.enqueue({ sql, args });
  }

  /**
   * Pushes all local user profiles to Turso
   */
  async backupAllLocalProfiles(localDb) {
    if (!this.enabled || !this.client) return;
    try {
      const rows = localDb.prepare('SELECT * FROM user_profiles').all();
      for (const row of rows) {
        this.queueProfileSync(row);
      }
    } catch (e) {}
  }

  enqueue(statement) {
    this.syncQueue.push(statement);
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.isProcessingQueue || this.syncQueue.length === 0) return;
    this.isProcessingQueue = true;

    while (this.syncQueue.length > 0) {
      const batch = this.syncQueue.splice(0, 20); // Process up to 20 statements in a batch
      try {
        await this.client.batch(batch, 'write');
      } catch (err) {
        console.error('[TURSO] Sync batch failed:', err.message);
      }
    }

    this.isProcessingQueue = false;
  }
}

module.exports = new TursoSync();
