# 📘 Droplet Dashboard & Bot API Documentation

توثيق شامل لجميع مسارات الـ REST API في بوت ولوحة تحكم **Droplet** مع معايير الأمان، الصلاحيات، والـ Payload.

---

## 🔒 الأمان والمصادقة (Security & Authentication)

### 1. إدارة الجلسة (Session Lifecycle)
- يعتمد النظام على `express-session` مع تخزين دائم في SQLite (`better-sqlite3-session-store`).
- الجلسة تتبع أسلوب **Rolling Expiration**: يتم تجديد صلاحية الجلسة تلقائياً مع كل طلب نشط.
- مدة الصلاحية الافتراضية: 7 أيام.
- تسجيل الخروج من `/logout` يقوم بإنهاء الجلسة فوراً وتدميرها من الـ Store ومسح الكوكيز `connect.sid`.

### 2. تدقيق الصلاحيات اللحظي (Real-Time Guild Authorization)
- الميدلوير المركزي: `createGuildAuthMiddleware(client)` يطبق على جميع مسارات `/api/guild/:guildId`.
- يتحقق في **وقت كل طلب (On-the-fly)** من كاش وذاكرة سيرفر الديسكورد:
  1. هل المستخدم هو مالك السيرفر (`guild.ownerId`)؟
  2. هل يمتلك المستخدم رتبة فيها صلاحية `Administrator` أو `ManageGuild`؟
- في حال عدم تحقق الشروط، يُرفض الطلب فوراً برمز `403 Forbidden`.

### 3. معدل الطلبات (Rate Limiting)
- **API العام**: 120 طلب في الدقيقة (`apiLimiter`).
- **العمليات الحساسة**: 20 طلب في الدقيقة (`sensitiveActionLimiter`) لتصفير الإعدادات، إنشاء قنوات، تصفير السجلات.
- **الذكاء الاصطناعي**: 15 طلب في الدقيقة (`aiLimiter`).

---

## 🌐 المسارات العامة (Public Routes)

### 1. جلب إحصائيات البوت
- **Method:** `GET`
- **Path:** `/api/bot-info`
- **Rate Limit:** عام
- **Response:**
```json
{
  "id": "1506005273893146775",
  "username": "Droplet",
  "avatar": "https://cdn.discordapp.com/...",
  "guildsCount": 12,
  "ping": 35,
  "usersCount": 1420
}
```

---

## ⚙️ مسارات إعدادات السيرفر (Guild Settings API)

> **ملاحظة:** تتطلب جميع المسارات التالية تسجيل الدخول وامتلاك صلاحيات إدارة في السيرفر.

### 1. حفظ وتعديل إعدادات السيرفر
- **Method:** `POST`
- **Path:** `/api/guild/:guildId/settings`
- **Validation:** `settingsSchema` (Zod)
- **Body Example:**
```json
{
  "prefix": "!",
  "leveling_enabled": 1,
  "level_channel": "current",
  "level_message": "🎉 مبروك {user}! وصلت للمستوى {level}",
  "bot_nickname": "Droplet Guard"
}
```
- **Response:**
```json
{ "success": true }
```

### 2. رفع وتخصيص الصور (شعار الترحيب / صورة المستوى)
- **Method:** `POST`
- **Path:** `/api/guild/:guildId/upload-image`
- **Body:** `{ "image": "data:image/png;base64,...", "field": "welcome_image" }`
- **Response:**
```json
{ "success": true, "url": "https://.../uploads/welcome_image_...png" }
```

---

## 🛡️ الحماية والأمان (Protection & Whitelist API)

### 1. إضافة عضو للقائمة البيضاء / المضادة
- **Method:** `POST`
- **Path:** `/api/guild/:guildId/whitelist`
- **Validation:** `whitelistSchema`
- **Body:**
```json
{
  "userId": "123456789012345678",
  "type": "whitelist" // أو "antimod"
}
```

### 2. إزالة عضو من القائمة
- **Method:** `DELETE`
- **Path:** `/api/guild/:guildId/whitelist`
- **Body:**
```json
{
  "userId": "123456789012345678",
  "type": "whitelist"
}
```

---

## 📜 السجلات الشاملة (Logs Setup API)

### 1. الإعداد التلقائي لقنوات السجلات
- **Method:** `POST`
- **Path:** `/api/guild/:guildId/logs/auto-setup`
- **Rate Limit:** حساس (`sensitiveActionLimiter`)
- **Body:**
```json
{
  "mode": "grouped" // أو "detailed"
}
```

### 2. حذف قنوات السجلات وتعطيلها
- **Method:** `POST`
- **Path:** `/api/guild/:guildId/logs/delete-channels`
- **Rate Limit:** حساس (`sensitiveActionLimiter`)

---

## 💬 الرد التلقائي (Autoresponder API)

### 1. إضافة رد تلقائي
- **Method:** `POST`
- **Path:** `/api/guild/:guildId/autoresponder`
- **Validation:** `autoresponderSchema`
- **Body:**
```json
{
  "trigger_word": "السلام عليكم",
  "reply_text": "وعليكم السلام ورحمة الله وبركاته",
  "match_type": "exact"
}
```

### 2. حذف رد تلقائي
- **Method:** `DELETE`
- **Path:** `/api/guild/:guildId/autoresponder/:id`

---

## ⚠️ نظام العقوبات والتحذيرات (Warn Punishments API)

### 1. إضافة عقوبة تلقائية عند عدد تحذيرات
- **Method:** `POST`
- **Path:** `/api/guild/:guildId/warn-punishments`
- **Validation:** `warnPunishmentSchema`
- **Body:**
```json
{
  "warnCount": 3,
  "actionType": "timeout" // mute, kick, ban, temp_ban, timeout
}
```

### 2. مسح جميع التحذيرات
- **Method:** `POST`
- **Path:** `/api/guild/:guildId/clear-all-warnings`
- **Rate Limit:** حساس

---

## 🏆 نظام المستويات والمكافآت (Level Rewards API)

### 1. إضافة رتبة كمكافأة مستوى
- **Method:** `POST`
- **Path:** `/api/guild/:guildId/level-reward`
- **Validation:** `levelRewardSchema`
- **Body:**
```json
{
  "level": 5,
  "roleId": "987654321098765432",
  "rewardType": "text"
}
```

### 2. حذف مكافأة مستوى
- **Method:** `DELETE`
- **Path:** `/api/guild/:guildId/level-reward/:id`

---

## 📄 إرسال رسائل الإيمبد (Embed Builder API)

- **Method:** `POST`
- **Path:** `/api/guild/:guildId/send-embed`
- **Validation:** `sendEmbedSchema`
- **Body:**
```json
{
  "channelId": "123456789012345678",
  "title": "إعلان هام",
  "desc": "محتوى الإعلان بالتنسيق المطلوب",
  "color": "#7c3aed"
}
```

---

## 🎉 القيف اواي (Giveaways API)

- **Method:** `POST`
- **Path:** `/api/guild/:guildId/giveaways`
- **Validation:** `giveawaySchema`
- **Body:**
```json
{
  "prize": "Nitro Classic",
  "channelId": "123456789012345678",
  "duration": "24h",
  "winners": 1
}
```

---

## 🤖 الذكاء الاصطناعي (Droplet AI Live Chat)

- **Method:** `POST`
- **Path:** `/api/guild/:guildId/ai/chat`
- **Rate Limit:** 15/دقيقة (`aiLimiter`)
- **Validation:** `aiChatSchema`
- **Body:**
```json
{
  "prompt": "كيف أقوم بتفعيل حماية السيرفر من الحظر الجماعي؟"
}
```
- **Response:**
```json
{
  "success": true,
  "response": "..."
}
```

---

## 🧹 تصفير وإعادة تعيين بيانات السيرفر (Reset Data API)

- **Method:** `POST`
- **Path:** `/api/guild/:guildId/reset-data`
- **Rate Limit:** حساس (`sensitiveActionLimiter`)
- **Action:** يحذف كافة إعدادات السيرفر، السجلات، والتحذيرات، ويعيدها للحالة الافتراضية.
