/**
 * Lightweight bilingual helper for Discord responses.
 * - Guild language comes from guild_settings.bot_language (dashboard setting).
 * - Default is EN; unknown/missing values fall back to EN.
 * - t() falls back to EN, then to the key itself.
 *
 * Usage in commands:
 *   const { getGuildLang, t } = require('../../utils/lang');
 *   const lang = getGuildLang(interaction.guildId);
 *   ... t(lang, 'economy.balance.author', { name: user.username })
 */
const db = require('../database');

// Category dictionaries are merged here. Each category owns its file
// (edited by different workers), so there are never merge conflicts.
function loadPart(path) {
  try {
    const part = require(path);
    return { en: part.en || {}, ar: part.ar || {} };
  } catch {
    return { en: {}, ar: {} };
  }
}

const PARTS = [
  '../lang/dictionary', // economy + common + suggest (core)
  '../lang/dict-general',
  '../lang/dict-moderation',
  '../lang/dict-tickets',
  '../lang/dict-admin',
  '../lang/dict-events',
];

const dict = { EN: {}, AR: {} };
for (const partPath of PARTS) {
  const part = loadPart(partPath);
  Object.assign(dict.EN, part.en);
  Object.assign(dict.AR, part.ar);
}
dict.en = dict.EN;
dict.ar = dict.AR;

const SUPPORTED = ['AR', 'EN', 'TR', 'RU', 'ES', 'FR', 'DE', 'PT', 'JA'];

function normalizeLang(value) {
  const s = String(value || 'EN').toUpperCase();
  // Only EN/AR have full dictionaries for now; others fall back to EN.
  if (s === 'AR') return 'AR';
  return 'EN';
}

function getGuildLang(guildId) {
  try {
    if (!guildId) return 'EN';
    if (!db.getGuildSettings) return 'EN';
    const settings = db.getGuildSettings(guildId);
    const raw = settings && settings.bot_language ? settings.bot_language : 'EN';
    return normalizeLang(raw);
  } catch {
    return 'EN';
  }
}

function t(langOrGuildId, key, vars) {
  let lang = 'EN';
  const raw = String(langOrGuildId || '');
  if (/^\d{5,}$/.test(raw)) {
    lang = getGuildLang(raw);
  } else {
    lang = normalizeLang(raw);
  }
  const table = dict[lang] || {};
  let text = table[key];
  if (text == null) text = (dict.EN || {})[key];
  if (text == null) text = key;
  if (vars && typeof vars === 'object') {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split('{' + name + '}').join(String(value));
    }
  }
  return text;
}

module.exports = { getGuildLang, t, normalizeLang, SUPPORTED };
