/**
 * @module tursoSync
 * @description Background synchronization between local SQLite (better-sqlite3) and remote Turso database.
 * Ensures that coins, XP, daily streak, and essential settings persist across Render redeploys and crashes.
 */

const { createClient } = require('@libsql/client');

class TursoSync {
  constructor() {
    this.client = null;
    this.enabled = false;
    this.syncQueue = [];
    this.isProcessingQueue = false;

    // Support the normal Turso names plus common aliases used by hosting panels.
    // Never log the actual URL/token values.
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
        console.log('[TURSO] 🌐 Turso Cloud Database Sync initialized successfully.');
        console.log('[TURSO] 🔐 URL configured: yes | Auth token configured: ' + (authToken ? 'yes' : 'no'));
      } catch (err) {
        console.error('[TURSO] ⚠️ Failed to initialize Turso client:', err.message);
      }
    } else {
      console.log('[TURSO] ℹ️ Turso credentials not detected. Expected TURSO_DATABASE_URL/TURSO_URL/LIBSQL_URL and TURSO_AUTH_TOKEN/TURSO_TOKEN/LIBSQL_AUTH_TOKEN. Running on local SQLite only.');
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
          economy_enabled INTEGER DEFAULT 1
        );
      `);

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
