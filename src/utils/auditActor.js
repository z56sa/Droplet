// ========================================================
// 🕵️ auditActor.js — يجيب "الفاعل" (المنفّذ) لأي فعل من سجل التدقيق Audit Log
// ويحوّله لحقل جاهز "👤 الفاعل" لكل سجلات السيرفر
// مع كاش قصير لتجنب ضرب Rate Limits عند الأحداث المتتالية
// ========================================================
const _cache = new Map(); // key -> { id, tag, reason, _ts }
const _TTL = 6000;

/**
 * يجيب الفاعل من Audit Log
 * @param {import('discord.js').Guild} guild
 * @param {number|string} actionType رقم نوع الفعل (AuditLogEvent)
 * @param {string|null} targetId معرّف الهدف (قناة/رتبة/عضو/كود دعوة...) — للمطابقة الدقيقة
 * @returns {Promise<{id:string, tag:string, reason:string|null}|null>}
 */
async function getAuditActor(guild, actionType, targetId = null) {
    try {
        if (!guild || actionType === undefined || actionType === null) return null;
        // نحتاج صلاحية عرض سجل التدقيق
        const me = guild.members?.me;
        if (me && !me.permissions.has('ViewAuditLog')) return null;

        const key = `${guild.id}:${actionType}:${targetId || ''}`;
        const hit = _cache.get(key);
        if (hit && Date.now() - hit._ts < _TTL) return { id: hit.id, tag: hit.tag, reason: hit.reason };

        const logs = await guild.fetchAuditLogs({ type: actionType, limit: 5 });
        if (!logs || !logs.entries || !logs.entries.size) return null;

        let entry = null;
        if (targetId) {
            for (const e of logs.entries.values()) {
                const t = e.target;
                const tid = (t && typeof t === 'object') ? (t.id ?? t.code) : t;
                if (tid !== undefined && tid !== null && String(tid) === String(targetId)) { entry = e; break; }
            }
        }
        if (!entry) entry = logs.entries.first();
        if (!entry || !entry.executor) return null;

        const info = {
            id: String(entry.executor.id),
            tag: entry.executor.tag || entry.executor.username || String(entry.executor.id),
            reason: entry.reason || null,
            _ts: Date.now()
        };
        _cache.set(key, info);
        // تنظيف الكاش القديم دورياً
        if (_cache.size > 300) {
            const now = Date.now();
            for (const [k, v] of _cache) { if (now - v._ts > _TTL) _cache.delete(k); }
        }
        return { id: info.id, tag: info.tag, reason: info.reason };
    } catch (e) {
        return null;
    }
}

/**
 * حقل جاهز للإمبد — يُمرر كـ payload.actor في sendServerLog
 */
function actorField(actor) {
    if (!actor || !actor.id) {
        return { name: '👤 الفاعل', value: 'غير معروف (البوت/النظام/صاحب الرسالة)', inline: true };
    }
    const reason = actor.reason ? `\n📋 السبب: ${String(actor.reason).slice(0, 120)}` : '';
    return { name: '👤 الفاعل', value: `<@${actor.id}>\n\`${actor.tag}\`${reason}`, inline: true };
}

/**
 * اختصار: يجيب الفاعل ويرجع الحقل مباشرة
 */
async function actorFieldFor(guild, actionType, targetId = null) {
    const actor = await getAuditActor(guild, actionType, targetId);
    return actorField(actor);
}

module.exports = { getAuditActor, actorField, actorFieldFor };
