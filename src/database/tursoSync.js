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
      // 1.7 Create staff_activity and staff_ranks tables in Turso
      await this.client.execute(`
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
      `);

      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS staff_ranks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          role_id TEXT NOT NULL,
          required_points INTEGER NOT NULL,
          rank_name TEXT,
          created_at INTEGER DEFAULT (strftime('%s','now')),
          UNIQUE(guild_id, role_id)
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

      // 5. Restore staff_activity from Turso
      try {
        const staffRes = await this.client.execute('SELECT * FROM staff_activity');
        if (staffRes?.rows?.length > 0) {
          console.log(`[TURSO] 🔄 Restoring ${staffRes.rows.length} staff activity records from Turso into local SQLite...`);
          const insStaff = localDb.prepare(`
            INSERT INTO staff_activity (guild_id, user_id, tickets_closed, mod_actions, bans_count, kicks_count, mutes_count, warns_count, messages_count, voice_seconds, streak_days, last_active_day, points, shift_seconds, total_shifts)
            VALUES (@guild_id, @user_id, @tickets_closed, @mod_actions, @bans_count, @kicks_count, @mutes_count, @warns_count, @messages_count, @voice_seconds, @streak_days, @last_active_day, @points, @shift_seconds, @total_shifts)
            ON CONFLICT(guild_id, user_id) DO UPDATE SET
              tickets_closed = MAX(staff_activity.tickets_closed, excluded.tickets_closed),
              mod_actions = MAX(staff_activity.mod_actions, excluded.mod_actions),
              points = MAX(staff_activity.points, excluded.points),
              shift_seconds = MAX(staff_activity.shift_seconds, excluded.shift_seconds),
              total_shifts = MAX(staff_activity.total_shifts, excluded.total_shifts);
          `);
          const tx = localDb.transaction((rows) => {
            for (const r of rows) {
              insStaff.run({
                guild_id: String(r.guild_id),
                user_id: String(r.user_id),
                tickets_closed: Number(r.tickets_closed || 0),
                mod_actions: Number(r.mod_actions || 0),
                bans_count: Number(r.bans_count || 0),
                kicks_count: Number(r.kicks_count || 0),
                mutes_count: Number(r.mutes_count || 0),
                warns_count: Number(r.warns_count || 0),
                messages_count: Number(r.messages_count || 0),
                voice_seconds: Number(r.voice_seconds || 0),
                streak_days: Number(r.streak_days || 0),
                last_active_day: r.last_active_day ? String(r.last_active_day) : null,
                points: Number(r.points || 0),
                shift_seconds: Number(r.shift_seconds || 0),
                total_shifts: Number(r.total_shifts || 0)
              });
            }
          });
          tx(staffRes.rows);
          console.log('[TURSO] ✅ Staff activity successfully restored from Turso!');
        } else {
          this.backupAllLocalStaffActivity(localDb);
        }
      } catch (staffErr) {
        console.error('[TURSO] ⚠️ Error restoring staff activity:', staffErr.message);
      }

      // 6. Restore staff_ranks from Turso
      try {
        const ranksRes = await this.client.execute('SELECT * FROM staff_ranks');
        if (ranksRes?.rows?.length > 0) {
          const insRank = localDb.prepare(`
            INSERT INTO staff_ranks (guild_id, role_id, required_points, rank_name)
            VALUES (@guild_id, @role_id, @required_points, @rank_name)
            ON CONFLICT(guild_id, role_id) DO UPDATE SET
              required_points = excluded.required_points,
              rank_name = excluded.rank_name;
          `);
          const rTx = localDb.transaction((rows) => {
            for (const r of rows) {
              insRank.run({
                guild_id: String(r.guild_id),
                role_id: String(r.role_id),
                required_points: Number(r.required_points || 0),
                rank_name: r.rank_name ? String(r.rank_name) : null
              });
            }
          });
          rTx(ranksRes.rows);
          console.log('[TURSO] ✅ Staff ranks successfully restored from Turso!');
        } else {
          this.backupAllLocalStaffRanks(localDb);
        }
      } catch (rankErr) {
        console.error('[TURSO] ⚠️ Error restoring staff ranks:', rankErr.message);
      }


      // ✅ بعد انتهاء كل الاستعادة — مسح cache الداشبورد حتى يظهر الـ leaderboard بالبيانات الصحيحة
      if (typeof global._dropletDashboardClearCaches === 'function') {
        setTimeout(() => {
          try { global._dropletDashboardClearCaches(); } catch(e) {}
        }, 1000);
      }

      // 🔄 جدولة مزامنة دورية خفيفة لسحب أحدث الرصيد والبروفايلات من Turso كل دقيقتين
      if (!this._periodicSyncStarted) {
        this._periodicSyncStarted = true;
        setInterval(() => {
          this.pullLatestFromTurso(localDb).catch(e => console.error('[TURSO] Periodic pull error:', e.message));
        }, 2 * 60 * 1000);
      }

    } catch (err) {
      console.error('[TURSO] ⚠️ Error during initAndRestore:', err.message);
    }
  }

  /**
   * 🔄 يسحب أحدث العملات والبيانات من Turso لتحديث SQLite المحلي باستمرار
   */
  async pullLatestFromTurso(localDb) {
    if (!this.enabled || !this.client) return;
    try {
      const res = await this.client.execute('SELECT user_id, guild_id, coins, bank_balance, xp, level, streak, last_daily, wallpaper FROM users');
      if (res?.rows?.length > 0) {
        const updateStmt = localDb.prepare(`
          INSERT INTO users (user_id, guild_id, xp, level, coins, bank_balance, last_daily, wallpaper, streak)
          VALUES (@user_id, @guild_id, @xp, @level, @coins, @bank_balance, @last_daily, @wallpaper, @streak)
          ON CONFLICT(user_id, guild_id) DO UPDATE SET
            coins = excluded.coins,
            bank_balance = excluded.bank_balance,
            xp = MAX(users.xp, excluded.xp),
            level = MAX(users.level, excluded.level),
            last_daily = MAX(users.last_daily, excluded.last_daily),
            streak = MAX(users.streak, excluded.streak);
        `);
        const tx = localDb.transaction((rows) => {
          for (const row of rows) {
            updateStmt.run({
              user_id: String(row.user_id),
              guild_id: String(row.guild_id || 'global'),
              xp: Number(row.xp || 0),
              level: Number(row.level || 1),
              coins: Number(row.coins || 0),
              bank_balance: Number(row.bank_balance || 0),
              last_daily: Number(row.last_daily || 0),
              wallpaper: String(row.wallpaper || 'default'),
              streak: Number(row.streak || 0)
            });
          }
        });
        tx(res.rows);
      }

      // أيضا سحب user_profiles
      const profRes = await this.client.execute('SELECT user_id, username, display_name, avatar, avatar_url, updated_at FROM user_profiles');
      if (profRes?.rows?.length > 0) {
        const profStmt = localDb.prepare(`
          INSERT INTO user_profiles (user_id, username, display_name, avatar, avatar_url, updated_at)
          VALUES (@user_id, @username, @display_name, @avatar, @avatar_url, @updated_at)
          ON CONFLICT(user_id) DO UPDATE SET
            username = COALESCE(excluded.username, user_profiles.username),
            display_name = COALESCE(excluded.display_name, user_profiles.display_name),
            avatar = COALESCE(excluded.avatar, user_profiles.avatar),
            avatar_url = COALESCE(excluded.avatar_url, user_profiles.avatar_url),
            updated_at = excluded.updated_at
        `);
        const profTx = localDb.transaction((rows) => {
          for (const r of rows) {
            profStmt.run({
              user_id: String(r.user_id),
              username: r.username ? String(r.username) : null,
              display_name: r.display_name ? String(r.display_name) : null,
              avatar: r.avatar ? String(r.avatar) : null,
              avatar_url: r.avatar_url ? String(r.avatar_url) : null,
              updated_at: Number(r.updated_at || 0)
            });
          }
        });
        profTx(profRes.rows);
      }
    } catch (e) {
      // ignore transient pull errors
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

  /**
   * Syncs a single staff_activity row to Turso immediately
   */
  queueStaffActivitySync(guildId, userId, data) {
    if (!this.enabled || !this.client || !guildId || !userId) return;
    const sql = `
      INSERT INTO staff_activity (guild_id, user_id, tickets_closed, mod_actions, bans_count, kicks_count, mutes_count, warns_count, messages_count, voice_seconds, streak_days, last_active_day, points, shift_seconds, total_shifts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET
        tickets_closed = MAX(staff_activity.tickets_closed, excluded.tickets_closed),
        mod_actions = MAX(staff_activity.mod_actions, excluded.mod_actions),
        bans_count = MAX(staff_activity.bans_count, excluded.bans_count),
        kicks_count = MAX(staff_activity.kicks_count, excluded.kicks_count),
        mutes_count = MAX(staff_activity.mutes_count, excluded.mutes_count),
        warns_count = MAX(staff_activity.warns_count, excluded.warns_count),
        messages_count = MAX(staff_activity.messages_count, excluded.messages_count),
        voice_seconds = MAX(staff_activity.voice_seconds, excluded.voice_seconds),
        points = MAX(staff_activity.points, excluded.points),
        shift_seconds = MAX(staff_activity.shift_seconds, excluded.shift_seconds),
        total_shifts = MAX(staff_activity.total_shifts, excluded.total_shifts),
        last_active_day = COALESCE(excluded.last_active_day, staff_activity.last_active_day);
    `;
    const args = [
      String(guildId), String(userId),
      Number(data.tickets_closed || 0), Number(data.mod_actions || 0),
      Number(data.bans_count || 0), Number(data.kicks_count || 0),
      Number(data.mutes_count || 0), Number(data.warns_count || 0),
      Number(data.messages_count || 0), Number(data.voice_seconds || 0),
      Number(data.streak_days || 0), data.last_active_day ? String(data.last_active_day) : null,
      Number(data.points || 0), Number(data.shift_seconds || 0), Number(data.total_shifts || 0)
    ];
    this.enqueue({ sql, args });
  }

  /**
   * Pushes all local staff_activity rows to Turso
   */
  async backupAllLocalStaffActivity(localDb) {
    if (!this.enabled || !this.client) return;
    try {
      const rows = localDb.prepare('SELECT * FROM staff_activity').all();
      for (const row of rows) {
        if (row && row.guild_id && row.user_id) {
          this.queueStaffActivitySync(row.guild_id, row.user_id, row);
        }
      }
      console.log(`[TURSO] 📤 Pushed ${rows.length} staff activity rows to Turso.`);
    } catch (e) {
      console.error('[TURSO] ⚠️ Failed to backup staff activity:', e.message);
    }
  }

  /**
   * Pushes all local staff_ranks rows to Turso
   */
  async backupAllLocalStaffRanks(localDb) {
    if (!this.enabled || !this.client) return;
    try {
      const rows = localDb.prepare('SELECT * FROM staff_ranks').all();
      for (const row of rows) {
        if (row && row.guild_id && row.role_id) {
          const sql = `
            INSERT INTO staff_ranks (guild_id, role_id, required_points, rank_name)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(guild_id, role_id) DO UPDATE SET
              required_points = excluded.required_points,
              rank_name = excluded.rank_name;
          `;
          this.enqueue({ sql, args: [String(row.guild_id), String(row.role_id), Number(row.required_points || 0), row.rank_name ? String(row.rank_name) : null] });
        }
      }
      console.log(`[TURSO] 📤 Pushed ${rows.length} staff ranks to Turso.`);
    } catch (e) {
      console.error('[TURSO] ⚠️ Failed to backup staff ranks:', e.message);
    }
  }

  enqueue(statement) {
    this.syncQueue.push(statement);
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  /**
   * Flushes all pending queued writes to Turso and resolves when done.
   * Use before responding to settings saves and before process shutdown
   * so dashboard changes (aliases, prefixes, ...) are never lost on restart.
   */
  async flush(timeoutMs = 10000) {
    if (!this.enabled || !this.client) return;
    try {
      if (!this.isProcessingQueue && this.syncQueue.length > 0) {
        this.processQueue().catch(() => {});
      }
      const start = Date.now();
      while ((this.isProcessingQueue || this.syncQueue.length > 0) && Date.now() - start < timeoutMs) {
        await new Promise(r => setTimeout(r, 100));
      }
    } catch (e) {}
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
