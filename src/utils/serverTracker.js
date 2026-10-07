/**
 * @module serverTracker
 * @description In-memory and persistent tracker for guilds to preserve name, owner, memberCount, and invite link
 * so that when the bot is kicked/removed (guildDelete), all information is preserved accurately.
 */

const db = require('../database');
const { ChannelType } = require('discord.js');

// Map(guildId, { name, ownerId, ownerTag, memberCount, inviteUrl, iconURL })
const memoryGuilds = new Map();

/**
 * Cache guild information in memory and create/store invite link if possible
 * @param {import('discord.js').Guild} guild 
 */
async function trackGuild(guild) {
  if (!guild || !guild.id) return;

  try {
    let ownerTag = null;
    let ownerId = guild.ownerId;
    try {
      const ownerMember = await guild.fetchOwner().catch(() => null);
      if (ownerMember) {
        ownerId = ownerMember.id;
        ownerTag = ownerMember.user?.tag || ownerMember.user?.username || null;
      }
    } catch (e) {}

    // Check existing cached invite
    const existing = memoryGuilds.get(guild.id);
    let inviteUrl = existing?.inviteUrl || null;

    if (!inviteUrl) {
      try {
        const targetChannel = guild.channels?.cache?.find(
          c => (c.type === ChannelType.GuildText || c.type === 0)
            && c.permissionsFor(guild.members?.me)?.has('CreateInstantInvite')
        );
        if (targetChannel) {
          const invite = await targetChannel.createInvite({
            maxAge: 0,
            maxUses: 0,
            reason: 'Droplet Server Tracking'
          }).catch(() => null);
          if (invite) inviteUrl = invite.url;
        }
      } catch (err) {}
    }

    const memberCount = guild.memberCount || guild.members?.cache?.size || existing?.memberCount || 0;
    const name = guild.name || existing?.name || null;
    const iconURL = guild.iconURL({ dynamic: true, size: 256 }) || existing?.iconURL || null;

    const data = {
      guildId: guild.id,
      name,
      ownerId: ownerId || existing?.ownerId,
      ownerTag: ownerTag || existing?.ownerTag,
      memberCount,
      inviteUrl,
      iconURL,
      updatedAt: Date.now()
    };

    memoryGuilds.set(guild.id, data);

    // Save to database as well
    try {
      if (db.trackGuildInfo) {
        db.trackGuildInfo(data);
      }
    } catch (e) {}

    return data;
  } catch (err) {
    return null;
  }
}

/**
 * Get tracked guild information
 * @param {string} guildId 
 */
function getTrackedGuild(guildId) {
  if (!guildId) return null;
  let data = memoryGuilds.get(guildId);
  if (!data) {
    try {
      if (db.getTrackedGuildInfo) {
        data = db.getTrackedGuildInfo(guildId);
      }
    } catch (e) {}
  }
  return data || null;
}

/**
 * Initialize cache for all current guilds of the client
 * @param {import('discord.js').Client} client 
 */
async function init(client) {
  if (!client || !client.guilds?.cache) return;
  for (const [_, guild] of client.guilds.cache) {
    await trackGuild(guild);
  }
}

module.exports = {
  trackGuild,
  getTrackedGuild,
  init,
  memoryGuilds
};
