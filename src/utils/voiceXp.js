// محرك XP الصوتي — يمنح XP كل دقيقة للأعضاء المؤهلين في الرومات الصوتية
const { EmbedBuilder } = require('discord.js');
const db = require('../database');
const config = require('../../config.json');
const { isEnabled } = require('./isEnabled');

let _started = false;

function parseList(v) {
  return String(v || '').split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
}

async function awardVoiceTick(client) {
  try {
    for (const guild of client.guilds.cache.values()) {
      let settings;
      try { settings = db.getGuildSettings(guild.id); } catch { continue; }
      if (!settings) continue;
      if (!isEnabled(settings.leveling_enabled, true)) continue;
      if (!isEnabled(settings.level_voice_xp_enabled, true)) continue;

      const rate = Math.max(1, Math.min(100, parseInt(settings.level_voice_xp_rate) || 3));
      const minMembers = Math.max(1, Math.min(10, parseInt(settings.level_voice_min_members) || 2));
      const ignoreDeaf = isEnabled(settings.level_ignore_deafened, true);
      const ignoreMute = isEnabled(settings.level_ignore_muted, true);
      const ignoreAfk = isEnabled(settings.level_ignore_afk, true);
      const exemptRoles = parseList(settings.level_exempt_roles);
      const exemptVoice = parseList(settings.level_exempt_voice_channels);
      const mult = Number(settings.level_multiplier) || 1;
      const afkId = guild.afkChannelId || guild.afkChannel?.id;

      const voiceStates = guild.voiceStates?.cache;
      if (!voiceStates) continue;

      for (const vs of voiceStates.values()) {
        try {
          const member = vs.member;
          if (!member || member.user.bot) continue;
          if (!vs.channelId) continue;
          const channel = guild.channels.cache.get(vs.channelId);
          if (!channel) continue;
          if (exemptVoice.includes(vs.channelId)) continue;
          if (exemptRoles.some(rid => member.roles.cache.has(rid))) continue;
          if (ignoreAfk && afkId && vs.channelId === afkId) continue;
          if (ignoreDeaf && (vs.deaf || vs.selfDeaf || vs.serverDeaf)) continue;
          if (ignoreMute && (vs.mute || vs.selfMute || vs.serverMute)) continue;
          const humans = channel.members.filter(m => !m.user.bot).size;
          if (humans < minMembers) continue;

          const gained = Math.max(1, Math.round(rate * mult));
          const { level, leveledUp } = db.addXp(member.id, guild.id, gained);
          if (!leveledUp) continue;

          // منح رتب الصوت/المشتركة المؤهلة
          try {
            const all = db.getLevelRewards ? db.getLevelRewards(guild.id) : [];
            const eligible = all.filter(r => ['voice', 'shared'].includes(r.reward_type || 'text') && Number(r.voice_level || 0) <= level);
            const stackOn = isEnabled(settings.level_stack_roles, false);
            for (const rew of eligible) {
              const roleObj = guild.roles.cache.get(rew.role_id) || await guild.roles.fetch(rew.role_id).catch(() => null);
              if (roleObj && !member.roles.cache.has(roleObj.id)) {
                await member.roles.add(roleObj).catch(() => {});
              }
            }
            if (!stackOn) {
              const okIds = new Set(eligible.map(r => String(r.role_id)));
              for (const r of all.filter(x => ['voice', 'shared'].includes(x.reward_type || 'text') && !okIds.has(String(x.role_id)))) {
                if (member.roles.cache.has(r.role_id)) await member.roles.remove(r.role_id).catch(() => {});
              }
            }
          } catch {}

          // رسالة المستوى الصوتي
          try {
            const raw = settings.level_voice_msg || 'مبروك {user}! وصلت للمستوى الصوتي **{level}**! 🎤';
            const text = String(raw)
              .replace(/[\[{](user|mention)[\]}]/gi, `<@${member.id}>`)
              .replace(/[\[{]userName[\]}]/gi, member.user.username)
              .replace(/[\[{]level[\]}]/gi, String(level))
              .replace(/[\[{]server[\]}]/gi, guild.name);
            const embed = new EmbedBuilder()
              .setColor(config.colors?.primary || '#9333ea')
              .setDescription(text)
              .setTimestamp();
            const chMode = settings.level_channel || 'current';
            if (chMode && chMode !== 'current' && chMode !== 'disabled' && chMode !== 'dm') {
              const tc = guild.channels.cache.get(chMode) || await guild.channels.fetch(chMode).catch(() => null);
              if (tc && tc.isTextBased()) await tc.send({ embeds: [embed] }).catch(() => {});
            } else if (chMode === 'dm' || isEnabled(settings.level_dm_msg_enabled, false)) {
              await member.send({ embeds: [embed] }).catch(() => {});
            }
          } catch {}
        } catch {}
      }
    }
  } catch (e) {}
}

function ensureVoiceXp(client) {
  if (_started || !client) return;
  _started = true;
  setInterval(() => { awardVoiceTick(client).catch(() => {}); }, 60 * 1000);
  // أول دورة بعد 60 ثانية (تجنب منح فوري عند الإقلاع)
}

module.exports = { ensureVoiceXp, awardVoiceTick };
