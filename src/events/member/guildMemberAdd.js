const { AttachmentBuilder, EmbedBuilder, AuditLogEvent } = require('discord.js');
const db = require('../../database');
const canvasUtil = require('../../utils/canvas');
const config = require('../../config.json');
const { isEnabled } = require('../../utils/isEnabled');
const antiNuke = require('../../utils/antiNuke');

// مخزن مؤقت لكشف الريد (Raid Detection Map)
const raidMap = new Map(); // guildId => [timestamps]

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    const guild = member.guild;
    const settings = db.getGuildSettings(guild.id);

    // 0. فحوصات الأمان (Security Checks)
    // --- 0.1 Anti-Bot: حماية شاملة من البوتات غير المصرح بها ---
    const _antiBotOn = isEnabled(settings.anti_bot, isEnabled(settings.anti_bot_add, false));
    if (member.user.bot) {
      let isAllowed = false;
      let botAdder = null;
      try {
        const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd }).catch(() => null);
        const entry = auditLogs?.entries.first();
        if (entry && (Date.now() - entry.createdTimestamp < 20000) && entry.target?.id === member.id) {
          botAdder = entry.executor;
        }
      } catch {}

      if (botAdder) {
        if (
          botAdder.id === guild.ownerId ||
          botAdder.id === guild.client.user.id ||
          (db.isUserWhitelisted && db.isUserWhitelisted(guild.id, botAdder.id, 'whitelist')) ||
          (settings.antinuke_whitelist_role && guild.members.cache.get(botAdder.id)?.roles.cache.has(settings.antinuke_whitelist_role))
        ) {
          isAllowed = true;
        }
      }

      if (_antiBotOn && !isAllowed) {
        try {
          await member.kick('Anti-Bot Protection: بوت غير مصرح به');
          if (db.logSecurityEvent) {
            db.logSecurityEvent(guild.id, 'security', 'anti_bot_kick', botAdder ? botAdder.id : null, member.id, 'Unauthorized bot addition', member.user.tag);
          }
          if (botAdder && antiNuke?.checkAction) {
            await antiNuke.checkAction(guild, 'botAdd', AuditLogEvent.BotAdd).catch(() => {});
          }
          const logChannelId = settings.antinuke_alert_channel || settings.log_channel;
          if (logChannelId) {
            const logCh = guild.channels.cache.get(logChannelId);
            if (logCh) {
              logCh.send({
                embeds: [new EmbedBuilder()
                  .setColor('#FF0000')
                  .setTitle('🤖 Anti-Bot | تم طرد بوت غير مصرح به')
                  .setDescription(`تم طرد البوت **${member.user.tag}** (\`${member.id}\`) تلقائياً بسبب تفعيل حماية البوتات.`)
                  .addFields(
                    { name: '🤖 البوت', value: `${member.user.tag} (${member.id})`, inline: true },
                    { name: '👤 الشخص الفاعل', value: botAdder ? `<@${botAdder.id}> (\`${botAdder.tag}\`)` : 'غير معروف (مباشر)', inline: true }
                  )
                  .setTimestamp()
                ]
              }).catch(() => {});
            }
          }
          return;
        } catch (err) {
          console.error('فشل طرد البوت (Anti-Bot):', err);
        }
      }
    }

    // --- 0.1.5 سجل إضافة بوت (bot_add) — للبوتات التي دخلت ولم تُطرد ---
    if (member.user.bot) {
      try {
        const { sendServerLog } = require('../../utils/serverLogger');
        await sendServerLog(guild, 'bot_add', 'integrations', {
          title: 'إضافة بوت',
          desc: `تمت إضافة بوت جديد إلى السيرفر`,
          fields: [
            { name: '🤖 البوت', value: `<@${member.id}> (${member.user.tag})`, inline: true },
            { name: '🆔 الأيدي', value: `${member.id}`, inline: true },
            { name: '📅 تاريخ إنشاء الحساب', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: false }
          ],
          thumbnail: member.user.displayAvatarURL({ dynamic: true })
        });
      } catch {}
    }

    // --- 0.2 Anti-Alt: طرد الحسابات الجديدة (Alt Accounts) ---
    if (settings.anti_alt_days && settings.anti_alt_days > 0) {
      const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
      if (accountAgeDays < settings.anti_alt_days) {
        try {
          const dmMsg = `⚠️ **تم طرد حسابك من سيرفر ${guild.name}**\n`
            + `سبب الطرد: حسابك عمره **${Math.floor(accountAgeDays)} يوم** وهو أقل من الحد المسموح (**${settings.anti_alt_days} يوم**).\n`
            + `يرجى الانضمام مجدداً بعد مرور **${Math.ceil(settings.anti_alt_days - accountAgeDays)} يوم** من الآن.`;
          await member.send(dmMsg).catch(() => {});
          await member.kick(`Anti-Alt Protection: حساب عمره ${Math.floor(accountAgeDays)} يوم أقل من ${settings.anti_alt_days} يوم`);

          if (db.logSecurityEvent) {
            db.logSecurityEvent(guild.id, 'security', 'anti_alt_kick', null, member.id, 'Alt Account Blocked', `Age: ${Math.floor(accountAgeDays)}d < Limit: ${settings.anti_alt_days}d`);
          }

          if (settings.log_channel) {
            const logCh = guild.channels.cache.get(settings.log_channel);
            if (logCh) {
              logCh.send({
                embeds: [new EmbedBuilder()
                  .setColor('#FF6600')
                  .setTitle('🔞 Anti-Alt | تم طرد حساب Alt')
                  .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                  .addFields(
                    { name: '👤 العضو', value: `${member.user.tag} (${member.id})`, inline: true },
                    { name: '📅 عمر الحساب', value: `${Math.floor(accountAgeDays)} يوم`, inline: true },
                    { name: '🛡️ الحد المحدد', value: `${settings.anti_alt_days} يوم`, inline: true }
                  )
                  .setTimestamp()
                ]
              }).catch(() => {});
            }
          }
          return;
        } catch (err) {
          console.error('فشل طرد الحساب Alt (Anti-Alt):', err);
        }
      }
    }

    // --- 0.3 Anti-Raid: كشف الريد (يدعم antiraid_enabled + raid_threshold + antiraid_action) ---
    const _raidOn = isEnabled(settings.antiraid_enabled, isEnabled(settings.anti_raid, isEnabled(settings.anti_raid_fast, false)));
    if (_raidOn) {
      const _threshold = Math.max(2, Math.min(20, parseInt(settings.raid_threshold) || 5));
      const _action = String(settings.antiraid_action || 'kick').toLowerCase();
      const now = Date.now();
      const guildJoins = raidMap.get(guild.id) || [];
      const recentJoins = guildJoins.filter(t => now - t < 10000); // آخر 10 ثواني
      recentJoins.push(now);
      raidMap.set(guild.id, recentJoins);

      if (recentJoins.length >= _threshold) {
        // كشف ريد! أرسل تنبيه للوق وعطّل الانضمام بكيك العضو
        try {
          if (_action === 'ban') await member.ban({ reason: 'Anti-Raid Protection: تم اكتشاف هجوم ريد' }).catch(() => {});
          else await member.kick('Anti-Raid Protection: تم اكتشاف هجوم ريد');

          if (db.logSecurityEvent) {
            db.logSecurityEvent(guild.id, 'security', 'anti_raid_action', null, member.id, 'Raid Attack Intercepted', `${recentJoins.length} joins in 10s`);
          }

          const _raidLogId = settings.antiraid_log_channel || settings.antinuke_alert_channel || settings.log_channel;
          if (_raidLogId) {
            const logCh = guild.channels.cache.get(_raidLogId);
            if (logCh) {
              logCh.send({
                embeds: [new EmbedBuilder()
                  .setColor('#FF0000')
                  .setTitle('🚨 تحذير RAID | هجوم مكتشف!')
                  .setDescription(`⚠️ **تم اكتشاف هجوم Raid!**\nانضم **${recentJoins.length} عضو** في أقل من 10 ثواني!\nتم التصدي للعضو: **${member.user.tag}** بنجاح.`)
                  .addFields(
                    { name: '📊 معدل الانضمام', value: `${recentJoins.length} عضو / 10 ثواني`, inline: true },
                    { name: '🛡️ الإجراء المطبق', value: _action === 'ban' ? 'حظر تلقائي (Ban)' : 'طرد تلقائي (Kick)', inline: true }
                  )
                  .setTimestamp()
                ]
              }).catch(() => {});
            }
          }
          return;
        } catch (err) {
          console.error('فشل طرد عضو في الريد (Anti-Raid):', err);
        }
      }
    }

    // 1. نظام متتبع الدعوات (Invite Tracker)
    let inviterData = { inviter: null, code: null, isFake: false };
    try {
      const inviteTracker = require('../../utils/inviteTracker');
      inviterData = await inviteTracker.findInviter(member);
    } catch (e) {}

    const inviterObj = inviterData.inviter;
    const inviterMention = inviterObj ? `<@${inviterObj.id}>` : (inviterData.code ? `رابط خاص (\`${inviterData.code}\`)` : 'غير معروف (Direct / Discovery)');
    const inviterName = inviterObj ? inviterObj.username : 'غير معروف';
    const inviterStats = inviterObj ? db.getInvites(guild.id, inviterObj.id) : null;
    const inviterCount = inviterStats ? inviterStats.total : 0;

    // 1.5 نظام الرتب التلقائية (Auto-Role for Members & Bots)
    // ✅ FIX: فحص صريح (0/1) + دعم عدة رتب مفصولة بفاصلة + توافق مع auto_role القديم
    const _arEnabledRaw = (settings.autoroles_enabled === undefined || settings.autoroles_enabled === null || settings.autoroles_enabled === '') ? 0 : settings.autoroles_enabled;
    const _arEnabled = Number(_arEnabledRaw) !== 0 && String(_arEnabledRaw).toLowerCase() !== 'false';
    if (_arEnabled) {
      const baseRaw = member.user.bot
        ? (settings.autorole_bot_id || '')
        : [settings.autorole_id || settings.auto_role || '', settings.autorole_extra_ids || ''].filter(Boolean).join(',');
      const targetRoleIds = String(baseRaw || '').split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);

      for (const targetRoleId of targetRoleIds) {
        try {
          const role = guild.roles.cache.get(targetRoleId) || await guild.roles.fetch(targetRoleId).catch(() => null);
          if (!role) {
            console.warn(`[AUTOROLE] guild=${guild.id} role ${targetRoleId} not found, skipping.`);
            continue;
          }
          const me = guild.members.me;
          if (!me?.permissions.has('ManageRoles')) {
            console.warn(`[AUTOROLE] guild=${guild.id} missing ManageRoles, cannot assign ${role.id}.`);
            break;
          }
          const highest = me.roles.highest?.position || 0;
          if (role.position >= highest) {
            console.warn(`[AUTOROLE] guild=${guild.id} role ${role.id} (${role.name}) is above bot role, cannot assign.`);
            continue;
          }
          if (member.roles.cache.has(role.id)) continue;
          await member.roles.add(role).catch(e => console.error('فشل إعطاء الرتبة التلقائية:', e.message));
        } catch (err) {
          console.error('خطأ في إعطاء الرتبة التلقائية:', err.message);
        }
      }
    }

    // 2. نظام الترحيب (Welcome Message, Embed, DM & Canvas Card)
    try {
      let welcomeChannel = null;
      if (settings.welcome_channel) {
        welcomeChannel = guild.channels.cache.get(settings.welcome_channel) || await guild.channels.fetch(settings.welcome_channel).catch(() => null);
      }
      
      // Fallback: If no custom channel set or not found, check system channel
      if (!welcomeChannel && isEnabled(settings.welcome_enabled, false)) {
        welcomeChannel = guild.systemChannel;
      }

      if (welcomeChannel && welcomeChannel.isTextBased()) {
        // ✅ إسقاط التكرار: نفس العضو خلال 90 ثانية = نسخة مكررة (آمن ضد التسابق بين النسخ)
        let _dup = false;
        try {
          const nowSec = Math.floor(Date.now() / 1000);
          try {
            db.db.prepare('INSERT INTO recent_welcomes (guild_id, user_id, sent_at) VALUES (?, ?, ?)').run(guild.id, member.id, nowSec);
          } catch (insErr) {
            const prev = db.db.prepare('SELECT sent_at FROM recent_welcomes WHERE guild_id = ? AND user_id = ?').get(guild.id, member.id);
            if (prev && (nowSec - prev.sent_at) < 90) {
              console.log(`[WELCOME] ⏭️ تخطي ترحيب مكرر لـ ${member.user.tag} في ${guild.id}`);
              _dup = true;
            } else {
              db.db.prepare('UPDATE recent_welcomes SET sent_at = ? WHERE guild_id = ? AND user_id = ?').run(nowSec, guild.id, member.id);
            }
          }
          try { db.db.prepare('DELETE FROM recent_welcomes WHERE sent_at < ?').run(nowSec - 3600); } catch {}
        } catch (e) {}
        if (!_dup) {
          await sendWelcome();
        }
      }

      async function sendWelcome() {
        let msg = settings.welcome_message || 'أهلاً بك يا [user] في سيرفر **[server]**! 🎉 أنت العضو رقم [memberCount] (تمت دعوتك بواسطة [inviter])';
        msg = msg
          .replace(/\[user\]/gi, `<@${member.id}>`)
          .replace(/\{user\}/gi, `<@${member.id}>`)
          .replace(/\[mention\]/gi, `<@${member.id}>`)
          .replace(/\{mention\}/gi, `<@${member.id}>`)
          .replace(/\[userName\]/gi, member.user.username)
          .replace(/\{userName\}/gi, member.user.username)
          .replace(/\[name\]/gi, member.user.username)
          .replace(/\{name\}/gi, member.user.username)
          .replace(/\[server\]/gi, guild.name)
          .replace(/\{server\}/gi, guild.name)
          .replace(/\[serverName\]/gi, guild.name)
          .replace(/\{serverName\}/gi, guild.name)
          .replace(/\[memberCount\]/gi, guild.memberCount.toString())
          .replace(/\{memberCount\}/gi, guild.memberCount.toString())
          .replace(/\[members\]/gi, guild.memberCount.toString())
          .replace(/\{members\}/gi, guild.memberCount.toString())
          .replace(/\[inviter\]/gi, inviterMention)
          .replace(/\{inviter\}/gi, inviterMention)
          .replace(/\[inviterName\]/gi, inviterName)
          .replace(/\{inviterName\}/gi, inviterName)
          .replace(/\[invitesCount\]/gi, inviterCount.toString())
          .replace(/\{invitesCount\}/gi, inviterCount.toString())
          .replace(/\[inviteCode\]/gi, inviterData.code || 'N/A')
          .replace(/\{inviteCode\}/gi, inviterData.code || 'N/A');

        const sendPayload = {};

        if (isEnabled(settings.welcome_embed_enabled, false)) {
          const welcomeEmbed = new EmbedBuilder()
            .setColor(settings.welcome_embed_color || config.colors.primary || '#9333ea')
            .setTitle(`🎉 مرحباً بك في ${guild.name}!`)
            .setDescription(msg)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setFooter({ text: `العضو رقم #${guild.memberCount} • دعوة بواسطة: ${inviterName}`, iconURL: guild.iconURL() || undefined })
            .setTimestamp();

          // البانر داخل نفس الإيمبد — نفضل bytes القاعدة كمرفق (attachment://) فلا يعتمد على جلب خارجي
          try {
            const _gb3 = db.getGuildBanner ? db.getGuildBanner(guild.id) : null;
            if (_gb3 && _gb3.buffer && _gb3.buffer.length > 0 && _gb3.buffer.length <= 10 * 1024 * 1024) {
              const _ext3 = (_gb3.mime === 'image/jpeg') ? 'jpg' : ((_gb3.mime === 'image/gif') ? 'gif' : ((_gb3.mime === 'image/webp') ? 'webp' : 'png'));
              sendPayload.files = [{ attachment: _gb3.buffer, name: 'welcome_banner.' + _ext3 }];
              welcomeEmbed.setImage('attachment://welcome_banner.' + _ext3);
            } else if (settings.welcome_banner_image) {
              welcomeEmbed.setImage(settings.welcome_banner_image);
            }
          } catch {
            if (settings.welcome_banner_image) { try { welcomeEmbed.setImage(settings.welcome_banner_image); } catch {} }
          }

          sendPayload.embeds = [welcomeEmbed];
        } else {
          sendPayload.content = msg;
          // ✅ البانر يُرفق مع النص في نفس الرسالة — نحمله كمخزن مؤقت لأن ديسكورد لا يقبل روابط URL كمرفقات
          try {
            const _bu = (settings.welcome_banner_image && String(settings.welcome_banner_image).trim()) || '';
            if (_bu && _bu.toLowerCase() !== 'null') {
              let _bf = null;
              // 1) bytes البانر المخزنة في القاعدة (الأضمن — ولا رسالة ديسكورد أبداً)
              try {
                const _gb = db.getGuildBanner ? db.getGuildBanner(guild.id) : null;
                if (_gb && _gb.buffer && _gb.buffer.length > 0 && _gb.buffer.length <= 10 * 1024 * 1024) _bf = _gb.buffer;
              } catch {}
              // 2) ملف uploads محلي؟ اقرأ من القرص مباشرة (أضمن من HTTP للذات)
              try {
                const _m = _bu.match(/\/uploads\/([^?#\/]+)$/);
                if (_m && !_bu.includes('cdn.discordapp.com')) {
                  const _p = require('path'), _f = require('fs');
                  const _fp = _p.join(__dirname, '..', '..', 'dashboard', 'public', 'uploads', _p.basename(_m[1]));
                  if (_f.existsSync(_fp)) _bf = _f.readFileSync(_fp);
                }
              } catch {}
              if (!_bf && /^https?:\/\//i.test(_bu)) {
                const _sig = (() => { try { return AbortSignal.timeout(8000); } catch { return undefined; } })();
                const _r = await fetch(_bu, { signal: _sig }).catch(() => null);
                const _ct = _r && _r.headers ? String(_r.headers.get('content-type') || '') : '';
                if (_r && _r.ok && _ct.includes('image')) {
                  const _tmp = Buffer.from(await _r.arrayBuffer());
                  if (_tmp && _tmp.length > 0 && _tmp.length <= 10 * 1024 * 1024) _bf = _tmp;
                }
              }
              if (_bf && _bf.length > 0 && _bf.length <= 10 * 1024 * 1024) {
                sendPayload.files = [{ attachment: _bf, name: 'welcome_banner.png' }];
              }
            }
          } catch {}
        }

        if (settings.welcome_image) {
          try {
            // فضّل bytes القاعدة (لا تعتمد على الملف أو الرابط)
            let _bannerInput = settings.welcome_banner_image;
            try {
              const _gb2 = db.getGuildBanner ? db.getGuildBanner(guild.id) : null;
              if (_gb2 && _gb2.buffer && _gb2.buffer.length > 0) _bannerInput = _gb2.buffer;
            } catch {}
            const cardBuffer = await canvasUtil.createWelcomeCard(member, _bannerInput);
            if (cardBuffer) {
              const attachment = new AttachmentBuilder(cardBuffer, { name: 'welcome.png' });
              sendPayload.files = [attachment];
            }
          } catch (err) {
            console.error('فشل إنشاء بطاقة الترحيب عبر Canvas، سيتم إرسال الإيمبد/الرسالة كبديل:', err.message);
          }
        }

        await welcomeChannel.send(sendPayload).catch((e) => console.error('فشل إرسال رسالة الترحيب:', e.message));
        } // end sendWelcome()
    } catch (welcomeErr) {
      console.error('خطأ في معالجة الترحيب:', welcomeErr);
    }

    // 2.5 رسالة الترحيب في الخاص (DM Welcome Message)
    if (settings.welcome_dm_enabled && settings.welcome_dm_message) {
      try {
        let dmMsg = settings.welcome_dm_message
          .replace(/\[user\]/gi, `<@${member.id}>`)
          .replace(/\{user\}/gi, `<@${member.id}>`)
          .replace(/\[userName\]/gi, member.user.username)
          .replace(/\{userName\}/gi, member.user.username)
          .replace(/\[server\]/gi, guild.name)
          .replace(/\{server\}/gi, guild.name)
          .replace(/\[memberCount\]/gi, guild.memberCount.toString())
          .replace(/\{memberCount\}/gi, guild.memberCount.toString())
          .replace(/\[inviter\]/gi, inviterMention)
          .replace(/\{inviter\}/gi, inviterMention);

        await member.send({ content: dmMsg }).catch(() => {});
      } catch (err) {}
    }

    // 3. سجل انضمام الأعضاء (Join Log)
    if (settings.log_channel) {
      try {
        const logChannel = guild.channels.cache.get(settings.log_channel) || await guild.channels.fetch(settings.log_channel).catch(() => null);
        if (logChannel && logChannel.isTextBased()) {
          const joinEmbed = new EmbedBuilder()
            .setColor(config.colors.success || '#10b981')
            .setTitle('📥 عضو جديد انضم إلى السيرفر')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields(
              { name: '👤 العضو', value: `<@${member.id}> (${member.user.tag})`, inline: true },
              { name: '🆔 الأيدي', value: `${member.id}`, inline: true },
              { name: '🔗 الداعي (Inviter)', value: `${inviterMention} (${inviterCount} دعوة)`, inline: true },
              { name: '📅 تاريخ إنشاء الحساب', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: false },
              { name: '👥 إجمالي الأعضاء', value: `${guild.memberCount}`, inline: true }
            )
            .setTimestamp();

          if (inviterData.isFake) {
            joinEmbed.addFields({ name: '⚠️ تنبيه', value: 'حساب جديد عمره أقل من 3 أيام (Fake Invite)', inline: true });
          }

          await logChannel.send({ embeds: [joinEmbed] }).catch(() => {});
        }
      } catch (logErr) {
        console.error('خطأ في إرسال لوق الانضمام:', logErr.message);
      }
    }
  }
};
