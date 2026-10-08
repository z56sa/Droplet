const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const embedUtil = require('../../utils/embed');
const config = require('../../config.json');
const { askAI } = require('../../utils/ai');
const { getGuildLang, t } = require('../../utils/lang');

const spamMap = new Map();

const DEBUG = false;
const dlog = (...a) => { if (DEBUG) console.log(...a); };

function normalizePayload(payload) {
  const data = typeof payload === 'string' ? { content: payload } : { ...(payload || {}) };
  delete data.ephemeral;
  delete data.flags;
  delete data.fetchReply;
  delete data.withResponse;
  return data;
}

function createInteractionShim(message, args, client, commandName) {
  let replyMsg = null;

  const send = async (payload) => {
    const data = normalizePayload(payload);
    if (replyMsg) {
      return replyMsg.edit(data).catch(() => message.channel.send(data).catch(() => null));
    }
    replyMsg = await message.reply(data).catch(() => message.channel.send(data).catch(() => null));
    return replyMsg;
  };

  const firstNumber = () => {
    const n = args.find(a => !isNaN(Number(a)));
    return n !== undefined ? Number(n) : null;
  };

  const shim = {
    isPrefixShim: true,
    client,
    commandName,
    guild: message.guild,
    guildId: message.guild.id,
    channel: message.channel,
    channelId: message.channelId,
    member: message.member,
    user: message.author,
    locale: 'ar',
    guildLocale: message.guild.preferredLocale,
    createdTimestamp: message.createdTimestamp,
    replied: false,
    deferred: false,
    isChatInputCommand: () => true,
    isCommand: () => true,
    isRepliable: () => true,
    isButton: () => false,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
    inGuild: () => true,
    reply: async (p) => { shim.replied = true; return send(p); },
    deferReply: async () => { shim.deferred = true; message.channel.sendTyping().catch(() => {}); },
    editReply: async (p) => { shim.replied = true; return send(p); },
    followUp: async (p) => message.channel.send(normalizePayload(p)).catch(() => null),
    deleteReply: async () => { if (replyMsg) await replyMsg.delete().catch(() => {}); },
    fetchReply: async () => replyMsg,
    showModal: async () => {
      await message.reply({ content: t(message.guild.id, 'events.prefix.modal_only') }).catch(() => {});
    },
    options: {
      getString: () => (args.length ? args.join(' ') : null),
      getInteger: () => { const n = firstNumber(); return n === null ? null : Math.trunc(n); },
      getNumber: () => firstNumber(),
      getBoolean: () => null,
      getUser: () => message.mentions.users.first() || null,
      getMember: () => message.mentions.members?.first() || null,
      getChannel: (optName) => {
        return message.mentions.channels.first() ||
          (args[0] && message.guild.channels.cache.get(args[0])) ||
          (args[0] && message.guild.channels.cache.find(c => c.name === args[0].replace(/^#/, ''))) ||
          message.channel ||
          null;
      },
      getRole: () => message.mentions.roles.first() || null,
      getMentionable: () => message.mentions.members?.first() || message.mentions.roles.first() || null,
      getAttachment: () => message.attachments.first() || null,
      getSubcommand: () => null,
      getSubcommandGroup: () => null,
      getFocused: () => '',
      get: () => null,
      data: []
    }
  };
  return shim;
}

function resolveCommand(client, name) {
  if (!name) return null;
  const n = name.toLowerCase();
  const prefixCmd = client.prefixCommands?.get(n) || client.prefixCommands?.get(client.aliases?.get(n));
  const slashCmd = client.commands?.get(n) || client.slashCommands?.get(n);
  return prefixCmd || slashCmd || null;
}

function matchCustomAlias(trimmedContent, cmdConfigs, prefix, client) {
  const messageParts = trimmedContent.split(/ +/);
  const firstWord = (messageParts[0] || '').toLowerCase();
  const firstWordClean = firstWord.replace(/^[/#!.]+/, '');

  for (const [cmdKey, cfg] of Object.entries(cmdConfigs)) {
    if (!cfg || !cfg.alias) continue;
    const rawAlias = String(cfg.alias).trim().toLowerCase();
    if (!rawAlias) continue;
    const cleanAlias = rawAlias.replace(/^[/#!.]+/, '');

    const matched =
      firstWord === rawAlias ||
      firstWordClean === cleanAlias ||
      firstWord === (prefix + cleanAlias).toLowerCase() ||
      firstWord === ('/' + cleanAlias);

    if (!matched) continue;

    const rawName = cmdKey.replace(/^\//, '');
    const command = resolveCommand(client, rawName);
    dlog('[ALIAS DEBUG] MATCHED', cmdKey, '| command found:', !!command);
    if (!command) {
      console.warn(`[ALIAS] الاختصار "${rawAlias}" مربوط بـ "${rawName}" بس الأمر مو موجود`);
      continue;
    }
    return { command, commandName: rawName, matchedCmdKey: cmdKey, args: messageParts.slice(1) };
  }
  return null;
}

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (!message.guild || message.author.bot) return;

    dlog(`[MSG DEBUG] content="${message.content}" | channel=${message.channel.id} | author=${message.author.tag}`);

    const guildId = message.guild.id;
    const userId = message.author.id;
    const settings = db.getGuildSettings(guildId) || {};

    // 🛡️ Security Guardian
    if (client.securityGuardian) {
      try {
        const securityScan = await client.securityGuardian.scanMessage(message);
        const findings = securityScan?.findings || [];
        const sensitiveFindings = findings.filter(f => !f.startsWith('Dangerous attachment:'));
        const dangerousFiles = findings.filter(f => f.startsWith('Dangerous attachment:'));

        if (sensitiveFindings.length || dangerousFiles.length) {
          await message.delete().catch(() => {});
          const reasons = [
            ...sensitiveFindings.map(f => `Sensitive information: ${f}`),
            ...dangerousFiles
          ];
          await client.securityGuardian.report(
            message.guild,
            'Blocked security incident',
            `User ${message.author.id} in guild ${guildId}. Findings: ${reasons.join(', ')}`,
            'critical'
          );
          const warning = await message.channel.send({
            content: t(guildId, 'events.automod.security', { mention: `${message.author}` })
          }).catch(() => null);
          if (warning) setTimeout(() => warning.delete().catch(() => {}), 7000);
          return;
        }
      } catch (securityError) {
        await client.securityGuardian.report(
          message.guild,
          'Security scanner error',
          securityError?.stack || String(securityError),
          'warning'
        ).catch(() => {});
      }
    }

    const serverTracker = require('../../utils/serverTracker');
    if (!serverTracker.memoryGuilds.has(guildId)) {
      serverTracker.trackGuild(message.guild).catch(() => {});
    }

    if (db.trackUserProfile) {
      db.trackUserProfile({
        userId: message.author.id,
        username: message.author.tag || message.author.username,
        displayName: message.member?.displayName || message.author.globalName || message.author.username,
        avatar: message.author.avatar,
        avatarUrl: message.author.displayAvatarURL({ dynamic: true, size: 128 })
      });
    }

    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator) ||
                    message.member?.permissions.has(PermissionFlagsBits.ManageGuild);

    const isAutoModWhitelisted =
      (settings.automod_whitelist_role && message.member?.roles.cache.has(settings.automod_whitelist_role)) ||
      (settings.automod_whitelist_channel && message.channel.id === settings.automod_whitelist_channel) ||
      (settings.automod_exempt_users && settings.automod_exempt_users.split(',').map(u => u.trim()).includes(userId)) ||
      (db.isUserWhitelisted && db.isUserWhitelisted(guildId, userId, 'whitelist'));

    const isStaff = isAdmin ||
      (settings.staff_role && message.member?.roles.cache.has(settings.staff_role)) ||
      (settings.support_role && message.member?.roles.cache.has(settings.support_role)) ||
      message.member?.permissions.has(PermissionFlagsBits.ModerateMembers);

    if (isStaff && db.addStaffMessages) {
      db.addStaffMessages(guildId, userId, 1);
      if (db.touchStaffShiftAction) db.touchStaffShiftAction(guildId, userId);
    }

    // 🤖 Droplet AI
    const cleanContent = message.content ? message.content.trim() : '';
    const botMentionRegex = new RegExp(`^<@!?${client.user?.id}>`);
    const isBotMentioned = botMentionRegex.test(cleanContent) ||
      (message.mentions && message.mentions.has(client.user?.id) && !message.mentions.everyone);

    const dropletCallRegex = /^(?:droplet|دروبلت)(?:[\s,:!?؟-]+(.+)|$)/i;
    const matchDroplet = cleanContent.match(dropletCallRegex);


    if (isBotMentioned || matchDroplet) {
      const ownerId = process.env.OWNER_ID || config.ownerId || '1178342841882267744';
      if (message.author.id !== ownerId) {
        return; // تجاهل الأعضاء العاديين، الذكاء الاصطناعي مخصص للمالك ومساعدته في إدارة البوت فقط
      }

      let userPrompt = '';
      if (isBotMentioned) {
        userPrompt = cleanContent.replace(botMentionRegex, '').replace(new RegExp(`<@!?${client.user?.id}>`, 'g'), '').trim();
      } else if (matchDroplet) {
        userPrompt = (matchDroplet[1] || '').trim();
      }
      if (!userPrompt) userPrompt = 'أهلاً بك يا مالك البوت! كيف يمكنني مساعدتك في تطوير وإدارة Droplet اليوم؟';

      try {
        await message.channel.sendTyping().catch(() => {});
        const aiResponse = await askAI(userPrompt);
        if (aiResponse) {
          const chunks = aiResponse.length <= 2000 ? [aiResponse] : (aiResponse.match(/[\s\S]{1,1950}/g) || [aiResponse]);
          await message.reply({ content: chunks[0] }).catch(async () => {
            await message.channel.send({ content: chunks[0] }).catch(() => {});
          });
          for (let i = 1; i < chunks.length; i++) {
            await message.channel.send({ content: chunks[i] }).catch(() => {});
          }
        }
        return;
      } catch (err) {
        console.error('[Auto Droplet AI Error]:', err);
      }
    }


    // 🛡️ Auto-Mod
    const tempWarn = async (content, ms = 4000) => {
      const w = await message.channel.send({ content }).catch(() => null);
      if (w) setTimeout(() => w.delete().catch(() => {}), ms);
    };

    if (!isAutoModWhitelisted) {
      if (settings.bad_words_enabled && settings.bad_words_list) {
        const rawList = settings.bad_words_list.split(/[\n,]+/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
        const lowerMsg = message.content.toLowerCase();
        const foundBadWord = rawList.find(word => lowerMsg.includes(word));

        if (foundBadWord) {
          try {
            await message.delete().catch(() => {});
            const action = settings.automod_action || 'warn';
            let actionText = t(guildId, 'events.automod.action_warn');

            if (action === 'timeout_5m') {
              await message.member?.timeout(5 * 60 * 1000, t(guildId, 'events.automod.audit_badword')).catch(() => {});
              actionText = t(guildId, 'events.automod.action_5m');
            } else if (action === 'timeout_1h') {
              await message.member?.timeout(60 * 60 * 1000, t(guildId, 'events.automod.audit_badword')).catch(() => {});
              actionText = t(guildId, 'events.automod.action_1h');
            } else if (action === 'kick') {
              await message.member?.kick(t(guildId, 'events.automod.audit_badword')).catch(() => {});
              actionText = t(guildId, 'events.automod.action_kick');
            }

            await tempWarn(t(guildId, 'events.automod.badword', { user: message.author, action: actionText }), 5000);

            if (settings.log_channel) {
              const logCh = message.guild.channels.cache.get(settings.log_channel);
              if (logCh) {
                logCh.send({
                  embeds: [new EmbedBuilder()
                    .setColor('#E74C3C')
                    .setTitle(t(guildId, 'events.automod.log_badword'))
                    .addFields(
                      { name: t(guildId, 'events.automod.f_member'), value: `${message.author.tag} (${message.author.id})`, inline: true },
                      { name: t(guildId, 'events.automod.f_channel'), value: `<#${message.channel.id}>`, inline: true },
                      { name: t(guildId, 'events.automod.f_action'), value: actionText, inline: true },
                      { name: t(guildId, 'events.automod.f_text'), value: '```' + message.content.substring(0, 1000) + '```', inline: false }
                    )
                    .setTimestamp()
                  ]
                }).catch(() => {});
              }
            }
            return;
          } catch (err) {
            console.error('فشل في معالجة الكلمات المحظورة:', err);
          }
        }
      }

      if (settings.anti_mass_mention) {
        const mentionLimit = settings.max_mentions || 4;
        const totalMentions = message.mentions.users.size + message.mentions.roles.size;
        if (totalMentions >= mentionLimit) {
          await message.delete().catch(() => {});
          await message.member?.timeout(5 * 60 * 1000, t(guildId, 'events.automod.audit_mention')).catch(() => {});
          await tempWarn(t(guildId, 'events.automod.mass_mention', { user: message.author, got: totalMentions, limit: mentionLimit }), 6000);
          return;
        }
      }

      if (settings.anti_caps && message.content.length >= 8) {
        const letters = message.content.replace(/[^a-zA-Z]/g, '');
        if (letters.length >= 6) {
          const upperCount = letters.replace(/[^A-Z]/g, '').length;
          if (upperCount / letters.length > 0.7) {
            await message.delete().catch(() => {});
            await tempWarn(t(guildId, 'events.automod.caps', { user: message.author }));
            return;
          }
        }
      }

      if (settings.anti_emoji_spam || settings.anti_emoji) {
        const maxEmojis = settings.max_emojis || 5;
        const customEmojis = (message.content.match(/<a?:.+?:\d+>/g) || []).length;
        const unicodeEmojis = (message.content.match(/\p{Extended_Pictographic}/gu) || []).length;
        const totalEmojis = customEmojis + unicodeEmojis;
        if (totalEmojis > maxEmojis) {
          await message.delete().catch(() => {});
          await tempWarn(t(guildId, 'events.automod.emoji', { user: message.author, got: totalEmojis, max: maxEmojis }));
          return;
        }
      }

      if (settings.anti_line_spam) {
        const maxLines = settings.max_lines || 8;
        if (message.content.split('\n').length > maxLines) {
          await message.delete().catch(() => {});
          await tempWarn(t(guildId, 'events.automod.lines', { user: message.author }));
          return;
        }
      }

      if (settings.anti_spoilers) {
        const spoilerMatches = (message.content.match(/\|\|.*?\|\|/g) || []).length;
        if (spoilerMatches >= 3) {
          await message.delete().catch(() => {});
          await tempWarn(t(guildId, 'events.automod.spoilers', { user: message.author }));
          return;
        }
      }

      if (settings.anti_zalgo) {
        const zalgoRegex = /[̀-ͯ҉᷀-᷿⃐-⃿︠-︯]{3,}/;
        if (zalgoRegex.test(message.content)) {
          await message.delete().catch(() => {});
          await tempWarn(t(guildId, 'events.automod.zalgo', { user: message.author }));
          return;
        }
      }

      if (settings.anti_text_repeat) {
        const charRepeatRegex = /(.)\1{7,}/i;
        const wordRepeatRegex = /\b(\w+)\s+\1\s+\1\s+\1\b/i;
        if (charRepeatRegex.test(message.content) || wordRepeatRegex.test(message.content)) {
          await message.delete().catch(() => {});
          await tempWarn(t(guildId, 'events.automod.repeat', { user: message.author }));
          return;
        }
      }

      if (settings.anti_stickers && message.stickers && message.stickers.size > 0) {
        await message.delete().catch(() => {});
        await tempWarn(t(guildId, 'events.automod.stickers', { user: message.author }));
        return;
      }

      if (settings.anti_long_messages && message.content.length > 1000) {
        await message.delete().catch(() => {});
        await tempWarn(t(guildId, 'events.automod.long', { user: message.author }));
        return;
      }
    }

    // Anti-Link
    if ((settings.anti_link || settings.anti_links) && !isAutoModWhitelisted) {
      const linkRegex = /(https?:\/\/[^\s]+)|(discord\.(gg|io|me|li)\/[^\s]+)|(discord\.com\/invite\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|net|org|xyz|gg|tk|ml|ga|cf|gq)\b)/i;
      if (linkRegex.test(message.content)) {
        await message.delete().catch(err => console.error('فشل حذف الرابط (تأكد من صلاحية Manage Messages):', err));
        await tempWarn(t(guildId, 'events.automod.link', { user: message.author }), 5000);
        return;
      }
    }

    // Anti-Invites
    if ((settings.anti_invites || settings.anti_invite_links) && !isAutoModWhitelisted) {
      const inviteRegex = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/[a-zA-Z0-9\-._]+/i;
      if (inviteRegex.test(message.content)) {
        await message.delete().catch(err => console.error('فشل حذف دعوة الديسكورد:', err));
        await tempWarn(t(guildId, 'events.automod.invite', { user: message.author }), 5000);
        return;
      }
    }

    // Anti-Ghost-Ping
    if (settings.anti_ghost_ping && message.mentions.users.size > 0) {
      message.mentionedUserIds = [...message.mentions.users.keys()];
    }

    // Anti-Spam
    if (settings.anti_spam) {
      const now = Date.now();
      const userSpam = spamMap.get(userId) || { count: 0, lastMessage: now, messages: [] };
      if (now - userSpam.lastMessage < 2500) {
        userSpam.count += 1;
        userSpam.messages.push(message);
      } else {
        userSpam.count = 1;
        userSpam.messages = [message];
      }
      userSpam.lastMessage = now;
      spamMap.set(userId, userSpam);

      if (userSpam.count >= 4) {
        for (const msg of userSpam.messages) await msg.delete().catch(() => {});
        await message.member?.timeout(60 * 1000, 'Anti-Spam Protection').catch(() => {});
        await tempWarn(t(guildId, 'events.automod.spam', { user: message.author }), 6000);
        spamMap.delete(userId);
        return;
      }
    }

    // XP & Leveling
    if (settings.leveling_enabled !== 0) {
      try {
        const userDb = db.getUser(userId, guildId) || {};
        const now = Date.now();
        const economy = config.economy || { xpCooldownMs: 60000, xpPerMessage: 5 };
        if (now - (userDb.last_message_xp || 0) >= economy.xpCooldownMs) {
          const baseXP = Math.floor(Math.random() * 10) + economy.xpPerMessage;
          const xpGained = baseXP * (settings.level_multiplier || 1);
          const { level, leveledUp } = db.addXp(userId, guildId, xpGained);

          if (leveledUp) {
            try {
              const rewards = db.getLevelRewards ? db.getLevelRewards(guildId).filter(r => r.level <= level) : [];
              for (const rew of rewards) {
                const roleObj = message.guild.roles.cache.get(rew.role_id) || await message.guild.roles.fetch(rew.role_id).catch(() => null);
                if (roleObj && message.member && !message.member.roles.cache.has(roleObj.id)) {
                  await message.member.roles.add(roleObj).catch(() => {});
                }
              }
            } catch (e) {}

            if (settings.level_up_msg_enabled !== 0) {
              const rawMsg = settings.level_message || t(guildId, 'events.levelup.default');
              const mention = `<@${message.author.id}>`;
              const formattedMsg = rawMsg
                .replace(/[\[{](user|mention)[\]}]/gi, mention)
                .replace(/[\[{]userName[\]}]/gi, message.author.username)
                .replace(/[\[{]level[\]}]/gi, level.toString())
                .replace(/[\[{]server[\]}]/gi, message.guild.name);

              const levelEmbed = new EmbedBuilder()
                .setColor(config.colors?.primary || '#9333ea')
                .setAuthor({ name: t(guildId, 'events.levelup.author'), iconURL: message.guild.iconURL() || undefined })
                .setDescription(formattedMsg)
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 256 }))
                .addFields(
                  { name: t(guildId, 'events.levelup.f_level'), value: '`Level ' + level + '`', inline: true },
                  { name: t(guildId, 'events.levelup.f_member'), value: mention, inline: true }
                )
                .setFooter({ text: `${message.guild.name} • Leveling System` })
                .setTimestamp();

              const channelMode = settings.level_channel || 'current';
              if (channelMode === 'disabled') {
              } else if (channelMode === 'dm') {
                message.author.send({ embeds: [levelEmbed] }).catch(() => {});
              } else if (channelMode === 'current') {
                await message.channel.send({ embeds: [levelEmbed] }).catch(() => {});
              } else {
                const targetChan = message.guild.channels.cache.get(channelMode) || await message.guild.channels.fetch(channelMode).catch(() => null);
                if (targetChan && targetChan.isTextBased()) targetChan.send({ embeds: [levelEmbed] }).catch(() => {});
              }
            }
          }
        }
      } catch (e) {
        console.error('[Leveling Error]:', e);
      }
    }

    // 🎯 فحص الأوامر والاختصارات مبكراً
    const prefix = settings.prefix || config.defaultPrefix || '#';
    let cmdConfigs = {};
    try {
      const parsed = typeof settings.command_configs === 'string'
        ? JSON.parse(settings.command_configs)
        : settings.command_configs;
      cmdConfigs = (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      console.error('[CMD CONFIG] command_configs مو JSON صحيح:', e.message);
    }

    const trimmedContent = message.content.trim();
    dlog('[ALIAS DEBUG] content:', trimmedContent, '| cmdConfigs keys:', Object.keys(cmdConfigs || {}));

    let resolved = matchCustomAlias(trimmedContent, cmdConfigs, prefix, client);
    if (!resolved && trimmedContent.startsWith(prefix)) {
      const pArgs = trimmedContent.slice(prefix.length).trim().split(/ +/);
      const name = (pArgs.shift() || '').toLowerCase();
      const cmd = resolveCommand(client, name);
      if (cmd) resolved = { command: cmd, commandName: name, matchedCmdKey: null, args: pArgs };
    }
    const isCommandMessage = !!resolved;

    // Auto Responder
    const autoResponders = isCommandMessage ? [] : (db.getAutoResponders(guildId) || []);
    if (autoResponders.length > 0) {
      const rawContent = trimmedContent;
      const lowerContent = rawContent.toLowerCase();

      for (const r of autoResponders) {
        if (r.is_active === 0 || !r.trigger_word) continue;
        if (r.exempt_channels && r.exempt_channels.split(',').includes(message.channel.id)) continue;
        if (r.allowed_channels && !r.allowed_channels.split(',').includes(message.channel.id)) continue;
        if (r.exempt_roles && message.member && r.exempt_roles.split(',').some(id => message.member.roles.cache.has(id))) continue;
        if (r.allowed_roles && message.member && !r.allowed_roles.split(',').some(id => message.member.roles.cache.has(id))) continue;

        const trig = r.case_sensitive ? r.trigger_word : r.trigger_word.toLowerCase();
        const testContent = r.case_sensitive ? rawContent : lowerContent;
        let isMatch = false;
        const mode = r.match_mode || 'contains';

        if (mode === 'exact') isMatch = testContent === trig;
        else if (mode === 'starts') isMatch = testContent.startsWith(trig);
        else if (mode === 'ends') isMatch = testContent.endsWith(trig);
        else if (mode === 'regex') {
          try { isMatch = new RegExp(r.trigger_word, r.case_sensitive ? '' : 'i').test(rawContent); } catch (e) {}
        } else isMatch = testContent.includes(trig);

        if (!isMatch) continue;

        if (r.delete_trigger) message.delete().catch(() => {});

        const replyContent = (r.reply_text || '')
          .replace(/\{user\}/gi, `<@${message.author.id}>`)
          .replace(/\{username\}/gi, message.author.username)
          .replace(/\{server\}/gi, message.guild.name)
          .replace(/\{channel\}/gi, `<#${message.channel.id}>`)
          .replace(/\{memberCount\}/gi, message.guild.memberCount.toString());

        if (r.reply_type === 'reaction') {
          message.react((r.reply_text || '').trim()).catch(() => {});
        } else if (r.reply_type === 'embed') {
          const autoEmbed = new EmbedBuilder().setColor('#EF5700').setDescription(replyContent || '​').setTimestamp();
          message.channel.send({ embeds: [autoEmbed] }).catch(() => {});
        } else if (replyContent) {
          message.reply({ content: replyContent }).catch(() => {
            message.channel.send({ content: replyContent }).catch(() => {});
          });
        }

        if (db.incrementAutoResponderUse) db.incrementAutoResponderUse(r.id);
        break;
      }
    }

    // Auto-Line
    let autolineChannels = [];
    try { autolineChannels = JSON.parse(settings.autoline_channels || '[]'); } catch (e) {}

    if (!isCommandMessage && autolineChannels.includes(message.channel.id)) {
      const lineUrl = settings.autoline_line || 'https://cdn.discordapp.com/attachments/1083818318856237128/1148721611180638318/line.png';
      const mode = settings.autoline_mode || 'line';
      if (mode === 'line') {
        message.channel.send({ content: lineUrl }).catch(() => {});
      } else if (mode === 'embed') {
        const lineEmbed = new EmbedBuilder().setColor(config.colors?.primary || '#5865F2').setImage(lineUrl);
        message.channel.send({ embeds: [lineEmbed] }).catch(() => {});
      }
    }

    // Feedback Channel
    if (!isCommandMessage && settings.feedback_channel && message.channel.id === settings.feedback_channel) {
      const feedbackLine = settings.feedback_line || settings.autoline_line;
      const feedbackMode = settings.feedback_mode || 'embed';
      if (feedbackMode === 'embed') {
        const fbEmbed = new EmbedBuilder()
          .setColor(config.colors?.primary || '#5865F2')
          .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
          .setDescription(message.content || '​')
          .setTimestamp();
        if (message.attachments.size > 0) fbEmbed.setImage(message.attachments.first().url);
        await message.delete().catch(() => {});
        const sent = await message.channel.send({ embeds: [fbEmbed] }).catch(() => null);
        if (sent) {
          sent.react('❤️').catch(() => {});
          sent.react('⭐').catch(() => {});
        }
        if (feedbackLine) message.channel.send({ content: feedbackLine }).catch(() => {});
      }
      return;
    }

    // Suggestions Channel
    if (!isCommandMessage && settings.suggestions_enabled !== 0 && settings.suggestions_channel &&
        message.channel.id === settings.suggestions_channel) {
      const content = trimmedContent;
      if (content.length > 0) {
        const { buildSuggestionEmbed, buildSuggestionComponents } = require('../../utils/suggestionBuilder');
        const suggCode = Math.random().toString(36).substring(2, 11);
        const suggLang = getGuildLang(guildId);

        const suggEmbed = buildSuggestionEmbed({
          user: message.author, content, title: null, code: suggCode,
          status: 'pending', upvotes: 0, downvotes: 0, createdAt: Date.now(), lang: suggLang
        });
        const components = buildSuggestionComponents({ upvotes: 0, downvotes: 0, lang: suggLang });

        await message.delete().catch(() => {});
        const sentMsg = await message.channel.send({ embeds: [suggEmbed], components }).catch(() => null);

        if (sentMsg) {
          if (settings.suggestions_auto_thread !== 0) {
            sentMsg.startThread({
              name: t(suggLang, 'general.suggest.thread_default', { user: message.author.username }).slice(0, 95),
              autoArchiveDuration: 1440
            }).catch(() => {});
          }
          db.createSuggestion({
            guild_id: guildId, channel_id: message.channel.id, message_id: sentMsg.id,
            user_id: message.author.id, title: null, content, category: 'عام'
          });
        }
      }
      return;
    }

    // ⚙️ تنفيذ الأوامر
    if (!resolved) return;
    const { command, commandName, matchedCmdKey, args } = resolved;

    try {
      let disabledCmdsList = [];
      try { disabledCmdsList = JSON.parse(settings.disabled_commands || '[]'); } catch (e) {}
      const prefixCmdSlash = '/' + commandName;
      if (disabledCmdsList.includes(prefixCmdSlash) ||
          disabledCmdsList.includes(commandName) ||
          (matchedCmdKey && disabledCmdsList.includes(matchedCmdKey))) return;

      const activeCfg = (matchedCmdKey && cmdConfigs[matchedCmdKey]) || cmdConfigs[prefixCmdSlash] || cmdConfigs[commandName];
      const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator) ||
                      message.member?.permissions.has(PermissionFlagsBits.ManageGuild);

      if (activeCfg && !isAdmin) {
        // فحص الرتب المسموحة فقط لو فيه رتب محددة
        if (Array.isArray(activeCfg.allowedRoles) && activeCfg.allowedRoles.length > 0) {
          const hasRole = message.member?.roles.cache.some(r => activeCfg.allowedRoles.includes(r.id));
          if (!hasRole) return;
        }
        // فحص القنوات المسموحة فقط لو فيه قنوات محددة
        if (Array.isArray(activeCfg.allowedChannels) && activeCfg.allowedChannels.length > 0 &&
            !activeCfg.allowedChannels.includes(message.channelId)) return;
      }

      if (typeof command.executePrefix === 'function') {
        await command.executePrefix(message, args, client);
      } else if (typeof command.execute === 'function') {
        const shim = createInteractionShim(message, args, client, commandName);
        await command.execute(shim, client);
      }
    } catch (error) {
      console.error(`[CMD ERROR] ${commandName}:`, error);
      message.reply({
        embeds: [embedUtil.error(t(guildId, 'events.common.cmd_exec_error_title'), t(guildId, 'events.common.cmd_exec_error_desc'))]
      }).catch(() => {});
    }
  }
};