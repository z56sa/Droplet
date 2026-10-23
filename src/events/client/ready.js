const { ActivityType, Events } = require('discord.js');
const logger = require('../../utils/logger');
const inviteTracker = require('../../utils/inviteTracker');

module.exports = {
  name: 'clientReady', // استبدلناه بالنص الصريح عشان يتوافق مع الإصدارات الحديثة
  once: true,
  async execute(client) {
    // ... باقي الكود بدون تغيير
    logger.success(`🎉 تم تسجيل الدخول بنجاح باسم البوت: ${client.user.tag}`);
    // جلب جميع أعضاء السيرفرات لملء الكاش وحساب العدد الفعلي بدقة 100%
    try {
      for (const [_, guild] of client.guilds.cache) {
        await guild.members.fetch().catch(() => null);
      }
    } catch (e) { }

    // تهيئة متتبع الدعوات وحفظ بيانات السيرفرات
    await inviteTracker.init(client);
    const serverTracker = require('../../utils/serverTracker');
    await serverTracker.init(client).catch(() => {});

    // تسجيل وتحديث أوامر السلاش لدى ديسكورد فوراً (مرة واحدة فقط — الحارس يمنع التكرار مع index.js)
    if (typeof client.registerSlashCommands === 'function' && !client._slashRegistered) {
      client._slashRegistered = true;
      client.registerSlashCommands().catch(() => {});
    }

    // تنظيف الرومات الصوتية المؤقتة الفارغة المتبقية بعد إعادة التشغيل
    try {
      const db = require('../../database');
      if (db.getAllTempVoices) {
        const tempVoices = db.getAllTempVoices();
        for (const tv of tempVoices) {
          const guild = client.guilds.cache.get(tv.guild_id);
          if (guild) {
            const ch = guild.channels.cache.get(tv.channel_id) || await guild.channels.fetch(tv.channel_id).catch(() => null);
            if (!ch || ch.members.size === 0) {
              if (ch) await ch.delete('تنظيف الرومات المؤقتة الفارغة بعد إعادة التشغيل').catch(() => {});
              db.deleteTempVoice(tv.channel_id);
            }
          } else {
            db.deleteTempVoice(tv.channel_id);
          }
        }
      }
    } catch (e) {}

    const totalMembers = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || g.members.cache.size || 0), 0);
    logger.info(`البوت متواجد في ${client.guilds.cache.size} سيرفر(ات) ويخدم ${totalMembers} مستخدم.`);

    // تعيين الحالة والنشاط — تُستعاد الحالة المحفوظة من القاعدة (قرار /set state يبقى بعد إعادة التشغيل)
    // (قبل: كل إعادة تشغيل تكبّت الحالة للـ /help الافتراضي وتتجاهل قرار المالك)
    let savedPresence = null;
    try { savedPresence = require('../../database').getBotPresence(); } catch (e) {}
    const activities = [];
    if (savedPresence && savedPresence.activity_text) {
      activities.push({
        name: String(savedPresence.activity_text).slice(0, 128),
        type: ActivityType[savedPresence.activity_type] || ActivityType.Watching
      });
    }
    if (!activities.length) {
      // الوضع الافتراضي (ما في قرار مخزّن بالقاعدة)
      activities.push({
        name: `/help | ${client.user.username}`,
        type: ActivityType.Playing
      });
    }
    client.user.setPresence({
      activities,
      status: String((savedPresence && savedPresence.status) || 'online')
    });
  }
};
