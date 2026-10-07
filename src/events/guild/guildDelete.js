const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AuditLogEvent } = require('discord.js');
const logger = require('../../utils/logger');
const config = require('../../config.json');
const serverTracker = require('../../utils/serverTracker');

module.exports = {
  name: 'guildDelete',
  async execute(guild, client) {
    const guildId = guild?.id;
    const tracked = serverTracker.getTrackedGuild(guildId) || {};
    const guildName = guild?.name || tracked.name || 'Unknown Server';

    logger.info(`📤 تم إزالة البوت من سيرفر: ${guildName} (${guildId})`);

    try {
      const botClient = client || guild?.client;
      if (!botClient) return;

      const ownerId = config.ownerId
        || process.env.OWNER_ID
        || process.env.BOT_OWNER_ID
        || botClient.application?.owner?.id
        || null;

      if (!ownerId) return;

      const botOwner = await botClient.users.fetch(ownerId).catch(() => null);
      if (!botOwner) return;

      const botName = botClient.user.username || 'Droplet';
      const botAvatar = botClient.user.displayAvatarURL({ dynamic: true });
      const guildIcon = (guild?.iconURL ? guild.iconURL({ dynamic: true, size: 256 }) : null) || tracked.iconURL || botAvatar;

      // 1. عدد الأعضاء الفعلي والحقيقي
      const realMemberCount = (guild?.memberCount && guild.memberCount > 0)
        ? guild.memberCount
        : (tracked.memberCount || 0);

      // 2. مالك السيرفر الحقيقي (اسمه والمنشن والأيدي)
      const serverOwnerId = guild?.ownerId || tracked.ownerId || null;
      let serverOwnerObj = null;
      if (serverOwnerId) {
        serverOwnerObj = await botClient.users.fetch(serverOwnerId).catch(() => null);
      }
      const ownerUsername = serverOwnerObj ? serverOwnerObj.username : (tracked.ownerTag || 'Unknown');
      const ownerDisplay = serverOwnerId
        ? `<@${serverOwnerId}>\n${ownerUsername} (\`${serverOwnerId}\`)`
        : 'Unknown';

      // 3. رابط دعوة السيرفر
      const inviteUrl = tracked.inviteUrl || null;

      // 4. من قام بطرد البوت (Kicked by / Removed by)
      let removedByUser = null;
      try {
        if (guild?.fetchAuditLogs) {
          const auditLogs = await guild.fetchAuditLogs({
            limit: 5,
            type: AuditLogEvent.MemberKick
          }).catch(() => null);

          if (auditLogs && auditLogs.entries.size > 0) {
            for (const [, entry] of auditLogs.entries) {
              if (entry.target && entry.target.id === botClient.user.id) {
                removedByUser = entry.executor;
                break;
              }
            }
          }
        }
      } catch (err) {}

      const removedByDisplay = removedByUser
        ? `<@${removedByUser.id}>\n${removedByUser.username} (\`${removedByUser.id}\`)`
        : (serverOwnerObj
            ? `<@${serverOwnerId}>\n${ownerUsername} (\`${serverOwnerId}\`) *(رجّح أنه الأونر)*`
            : 'غير معروف / تعذر جلب السجل');

      const embed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle(`❌ ${botName} left a server`)
        .setDescription(`The bot has been removed from **${guildName}**.`)
        .setThumbnail(guildIcon)
        .addFields(
          {
            name: '🏠 Server',
            value: `**${guildName}**\n\`${guildId}\``,
            inline: false
          },
          {
            name: '👥 Members',
            value: `${realMemberCount > 0 ? realMemberCount.toLocaleString() : '1+ (غير مسجل)'}`,
            inline: false
          },
          {
            name: '👢 Removed by',
            value: removedByDisplay,
            inline: false
          },
          {
            name: '👑 Owner',
            value: ownerDisplay,
            inline: false
          },
          {
            name: '🔗 Server link',
            value: inviteUrl ? `[Open invite](${inviteUrl})` : 'لا يوجد رابط دعوة متوفر',
            inline: false
          }
        )
        .setFooter({ text: `${botName} • Server tracking`, iconURL: botAvatar })
        .setTimestamp();

      const components = [];
      if (inviteUrl) {
        components.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel('Open server invite')
              .setStyle(ButtonStyle.Link)
              .setURL(inviteUrl)
              .setEmoji('🔗')
          )
        );
      }

      await botOwner.send({ embeds: [embed], components }).catch(err => {
        logger.warn(`⚠️ تعذر إرسال إشعار guildDelete لمالك البوت: ${err.message}`);
      });
    } catch (e) {
      logger.error(`[guildDelete Notification Error]: ${e.stack || e.message}`);
    }
  }
};

