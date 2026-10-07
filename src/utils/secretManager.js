/**
 * @module SecretManager
 * @description A dedicated service layer for securely accessing and managing sensitive configuration values (Secrets) for the droplet bot.
 * 
 * This manager provides an abstraction layer over environment variables. In a production setting, this module would be updated 
 * to fetch secrets from a secure vault system (e.g., AWS Secrets Manager, Azure Key Vault) rather than relying on process.env.
 * 
 * All modules must use the methods provided here instead of accessing 'process.env' directly.
 */

class SecretManager {
    constructor() {
        // Private internal cache to prevent excessive read calls if needed later
        this._cache = {};
    }

    /**
     * Retrieves a required secret value by its key name.
     * @param {string} key - The environment variable key (e.g., 'DISCORD_BOT_TOKEN').
     * @returns {string | null} The secret value, or null if not found.
     */
    getSecret(key) {
        if (!this._cache[key]) {
            const secret = process.env[key];
            if (!secret) {
                console.error(`[SECRET ERROR] Critical secret missing: ${key}. The bot might fail to initialize.`);
            }
            this._cache[key] = secret;
        }
        return this._cache[key];
    }

    /**
     * Retrieves a set of multiple related secrets (e.g., database credentials).
     * @param {string[]} keys - Array of environment variable keys.
     * @returns {Object<string, string | null>} An object mapping keys to their values or null if missing.
     */
    getMultipleSecrets(keys) {
        const secrets = {};
        for (const key of keys) {
            if (!this._cache[key]) {
                secrets[key] = process.env[key];
                this._cache[key] = process.env[key]; // Cache the result immediately
            } else {
                secrets[key] = this._cache[key];
            }
        }
        return secrets;
    }

    /**
     * Checks if a required secret is set and throws an informative error if it's missing.
     * This should be called during the bot initialization sequence (e.g., in index.js).
     * @param {string[]} keys - Array of essential environment variable keys.
     */
    checkAllRequiredSecrets(keys) {
        const missing = keys.filter(key => !process.env[key]);
        if (missing.length > 0) {
            throw new Error(`Initialization Failed: The following critical secrets are missing and must be configured in the environment variables: ${missing.join(', ')}. Check your Railway/Cloud Dashboard.`);
        }
    }

    /**
     * [FUTURE UPGRADE] Placeholder for connecting to a dedicated vault service (e.g., Vault Client).
     * This method will replace the direct process.env calls in future versions.
     */
    async fetchFromVault(secretName, vaultClient) {
        console.warn(`[SECURITY WARNING]: Falling back to deprecated process.env for ${secretName}. Please upgrade this module to use a dedicated Vault client.`);
        return process.env[`VULKAN_${secretName}`] || null; // Example fallback mechanism
    }
}

// Export a singleton instance of the SecretManager
module.exports = new SecretManager();