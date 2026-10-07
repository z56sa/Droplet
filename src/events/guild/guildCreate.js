const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AuditLogEvent, ChannelType } = require('discord.js');
const logger = require('../../utils/logger');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'guildCreate',
  async execute(guild, client) {
    logger.info(`🎉 تم إضافة البوت إلى سيرفر جديد: ${guild.name} (${guild.id}) - عدد الأعضاء: ${guild.memberCount}`);
    
    // تسجيل إعدادات السيرفر الافتراضية وحفظ بيانات السيرفر
    try {
      db.getGuildSettings(guild.id);
      await guild.members.fetch().catch(() => null);
      const serverTracker = require('../../utils/serverTracker');
      await serverTracker.trackGuild(guild).catch(() => {});
    } catch (e) {}

    // إرسال إشعار السيرفر الجديد إلى مالك البوت في الخاص (DM)
    try {
      const botClient = client || guild.client;
      if (!botClient) return;

      // 1. تحديد أيدي مالك البوت — الأولوية: config.json → env vars → تطبيق Discord
      const ownerId = config.ownerId
        || process.env.OWNER_ID
        || process.env.BOT_OWNER_ID
        || (() => {
          try {
            return botClient.application?.owner?.id
              || botClient.application?.owner?.ownerId
              || null;
          } catch { return null; }
        })();

      if (!ownerId) {
        logger.warn('⚠️ لم يتم تحديد أيدي مالك البوت. أضف ownerId في config.json أو OWNER_ID في المتغيرات.');
        return;
      }

      const botOwner = await botClient.users.fetch(ownerId).catch(() => null);
      if (!botOwner) {
        logger.warn(`⚠️ تعذر جلب مالك البوت بالأيدي: ${ownerId}`);
        return;
      }

      // 2. من قام بإضافة البوت (Audit Logs)
      let addedByUser = null;
      try {
        await new Promise(r => setTimeout(r, 1500)); // انتظار ثانية ونص حتى تُسجَّل الـ audit log
        const auditLogs = await guild.fetchAuditLogs({
          type: AuditLogEvent.BotAdd,
          limit: 5
        }).catch(() => null);

        if (auditLogs && auditLogs.entries.size > 0) {
          for (const [, entry] of auditLogs.entries) {
            if (entry.target && entry.target.id === botClient.user.id) {
              addedByUser = entry.executor;
              break;
            }
          }
        }
      } catch (err) {
        logger.warn(`[guildCreate] Audit log fetch failed: ${err.message}`);
      }

      // 3. مالك السيرفر
      let guildOwner = null;
      try {
        guildOwner = await guild.fetchOwner().catch(() => null);
      } catch (err) {}

      // 4. إنشاء رابط دعوة
      let inviteUrl = null;
      try {
        const targetChannel = guild.channels.cache.find(
          c => (c.type === ChannelType.GuildText || c.type === 0)
            && c.permissionsFor(guild.members.me)?.has('CreateInstantInvite')
        );
        if (targetChannel) {
          const invite = await targetChannel.createInvite({
            maxAge: 0,
            maxUses: 0,
            reason: 'Droplet Bot Owner Tracking'
          }).catch(() => null);
          if (invite) inviteUrl = invite.url;
        }
      } catch (err) {}

      // 5. بناء الإمبد
      const botName = botClient.user.username || 'Droplet';
      const botAvatar = botClient.user.displayAvatarURL({ dynamic: true });
      const guildIcon = guild.iconURL({ dynamic: true, size: 256 }) || botAvatar;

      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle(`✅ ${botName} joined a new server`)
        .setDescription(`The bot has been added to **${guild.name}**.`)
        .setThumbnail(guildIcon)
        .addFields(
          {
            name: '🏠 Server',
            value: `**${guild.name}**\n\`${guild.id}\``,
            inline: false
          },
          {
            name: '👥 Members',
            value: `${guild.memberCount.toLocaleString()}`,
            inline: false
          },
          {
            name: '👤 Added by',
            value: addedByUser
              ? `<@${addedByUser.id}>\n${addedByUser.username} (\`${addedByUser.id}\`)`
              : (guildOwner
                  ? `<@${guildOwner.id}>\n${guildOwner.user.username} (\`${guildOwner.id}\`)`
                  : `<@${guild.ownerId}> (\`${guild.ownerId}\`)`),
            inline: false
          },
          {
            name: '👑 Owner',
            value: guildOwner
              ? `<@${guildOwner.id}>\n${guildOwner.user.username} (\`${guildOwner.id}\`)`
              : `<@${guild.ownerId}> (\`${guild.ownerId}\`)`,
            inline: false
          },
          {
            name: '🔗 Server link',
            value: inviteUrl ? `[Open invite](${inviteUrl})` : 'No invite (Missing permissions)',
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
        logger.warn(`⚠️ تعذر إرسال DM لمالك البوت (${botOwner.tag}): ${err.message}`);
      });

    } catch (e) {
      logger.error(`[guildCreate Notification Error]: ${e.stack || e.message}`);
    }
  }
};
