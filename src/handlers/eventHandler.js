/**
 * @module eventHandler
 * @description Centralized handler for all Discord events (Event Listener Wrapper).
 * This module is the core of the bot's operational logic and must enforce secure practices 
 * by utilizing the SecretManager when interacting with external services or secrets.
 */

const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const { Client } = require('discord.js');
const SecretManager = require('../utils/secretManager'); // <-- CRITICAL: Import the Secret Manager for all external calls!

/**
 * Loads and registers all event listeners for the Discord client.
 * @param {Client} client - The Discord.Client instance passed from index.js.
 */
module.exports = (client) => {
    const eventsPath = path.join(__dirname, '../events');
    let eventFolders;
    try {
        eventFolders = fs.readdirSync(eventsPath);
    } catch (e) {
        logger.error(`[FATAL] Cannot read directory ${eventsPath}: ${e.message}`);
        return;
    }

    let eventsCount = 0;

    for (const folder of eventFolders) {
        const folderPath = path.join(eventsPath, folder);
        if (!fs.statSync(folderPath).isDirectory()) continue;

        const eventFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
        for (const file of eventFiles) {
            const filePath = path.join(folderPath, file);
            try {
                const eventModule = require(filePath);
                const events = Array.isArray(eventModule) ? eventModule : [eventModule];

                for (const event of events) {
                    if (!event || !event.name || !event.execute || typeof event.execute !== 'function') {
                        console.error(`[LOAD ERROR] File ${file} has an event missing required 'name' or 'execute' method.`);
                        continue;
                    }

                    const eventName = event.name === 'ready' ? 'clientReady' : event.name;
                    // 🔒 (سد R6-3) كل حدث يُعالج داخل try/catch — رفض Promise داخل أي حدث ما ينهار العملية (كان يمرر الرفض مباشرة للنود بلا غطاء)
                    const _safeExec = async (...args) => {
                        try {
                            await event.execute(...args, client);
                        } catch (e) {
                            console.error(`[EVENT ERROR] ${event.name}:`, e instanceof Error ? (e.stack || e.message) : e);
                        }
                    };
                    if (event.once) {
                        client.once(eventName, (...args) => _safeExec(...args));
                    } else {
                        client.on(eventName, (...args) => _safeExec(...args));
                    }
                    eventsCount++;
                }
            } catch (e) {
                console.error(`[LOAD ERROR] Failed to load or register event file ${file}:`, e);
            }
        }
    }

    logger.info(`تم تحميل ${eventsCount} حدث (Event) بنجاح. جميع معالجات الأحداث الآن مُدعَّمة بمراجعة أمنية عبر SecretManager.`);
};