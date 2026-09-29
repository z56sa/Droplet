/**
 * @file i18n.js
 * @description Localization module for ZENO Dashboard (Arabic & English)
 * Features:
 * - Dynamic dictionary mapping Arabic texts/phrases to their English translations
 * - Automatically translates full DOM text nodes, attribute labels, and headings
 * - Detects device language (navigator.language) on first visit
 * - Switch button toggles between Arabic and English instantly
 * - Flips direction (RTL for Arabic, LTR for English)
 * - Remembers the user's choice (localStorage) across reloads
 * - Watches for dynamically added content (MutationObserver) and translates it too
 */

(function () {
    const dictionary = {
        // Top Navbar & Actions
        "لوحة التحكم": "Dashboard",
        "الرجوع للوحة التحكم": "Back to Dashboard",
        "تسجيل الخروج": "Logout",
        "الدعم الفني": "Support Server",
        "سيرفر الدعم": "Support Server",
        "المميزات والأنظمة": "Features & Systems",
        "حفظ التغييرات": "Save Changes",
        "تم الحفظ وتطبيق التغييرات في السيرفر بنجاح!": "Settings saved and applied to Discord successfully!",
        "البوت متصل ويعمل": "Bot is online & active",
        "يتم تطبيق كل التعديلات وحفظها مباشرة في سيرفر الديسكورد لحظياً بدون إعادة تشغيل.": "Changes are applied and saved directly to Discord in real-time.",

        // Page Titles (sectionTitles)
        "نظرة عامة على السيرفر": "Server Overview",
        "نظرة عامة على السيرفر 📊": "Server Overview 📊",
        "الإحصائيات والتحليلات 📊": "Analytics & Stats 📊",
        "الإحصائيات والتحليلات": "Analytics & Stats",
        "مظهر وتخصيص البوت 🎨": "Bot Appearance & Customization 🎨",
        "مظهر وتخصيص البوت": "Bot Appearance & Customization",
        "إعدادات السيرفر العامة ⚙️": "General Server Settings ⚙️",
        "إعدادات السيرفر العامة": "General Server Settings",
        "جميع الأوامر والخدمات ⌨️": "All Commands & Services ⌨️",
        "مركز إدارة الأوامر الشامل ⌨️": "Comprehensive Commands Center ⌨️",
        "الإشراف وإدارة الأعضاء 🔨": "Moderation & Members Management 🔨",
        "الرقابة التلقائية وفلاتر السب والشات 🤖": "AutoMod Rules & Chat Filters 🤖",
        "رسائل وبطاقات الترحيب والمغادرة 👋": "Welcome & Leave Messages 👋",
        "الرد التلقائي على الكلمات 💬": "Auto Responder on Words 💬",
        "نظام التذاكر والدعم الفني 🎫": "Ticket & Support System 🎫",
        "جدار الحماية الشامل ومكافحة التخريب 🛡️": "Comprehensive Shield & Anti-Nuke 🛡️",
        "الحماية / القائمة البيضاء ⚪": "Security / Whitelist ⚪",
        "الحماية / السجلات 📋": "Security / Logs 📋",
        "نظام مكافحة الغزو والأعضاء الوهميين 🚨": "Anti-Raid & Fake Accounts 🚨",
        "تتبع نشاط الإدارة والمشرفين 👮": "Staff & Moderator Activity Tracking 👮",
        "نظام الرومات الصوتية المؤقتة 🕒": "Temp Voice Channels 🕒",
        "نظام تنبيهات ومعلومات البوست 💎": "Server Boost Notifications 💎",
        "نظام رتب الألوان المتقدم 🎨": "Advanced Color Roles System 🎨",
        "سجلات السيرفر الشاملة 📜": "Comprehensive Server Logs 📜",
        "نظام المستويات والخبرة XP 🏆": "Levels & XP System 🏆",
        "الرتب التلقائية عند الانضمام 🎖️": "Auto Roles on Join 🎖️",
        "نظام مسابقات القيف اواي 🎁": "Giveaways System 🎁",
        "نظام الاقتراحات والشكاوي 💡": "Suggestions & Feedback System 💡",
        "متتبع الدعوات المتقدم (Invite Tracker) 🔗": "Advanced Invite Tracker 🔗",
        "نظام الإعلانات والمذيع الآلي 📢": "Broadcast System 📢",
        "صانع رسائل الإيمبد المتقدم 📄": "Advanced Embed Builder 📄",
        "القرآن الكريم والإذاعات الإسلامية 🕌": "Quran Radio & Islamic Content 🕌",
        "نظام التقديمات والتوظيف 📝": "Staff Applications System 📝",
        "لوحة الإعدادات ⚙️": "Settings Panel ⚙️",

        // Overview Metric Cards
        "بوستات السيرفر": "Server Boosts",
        "إجمالي القنوات": "Total Channels",
        "الأعضاء المتصلون": "Online Members",
        "إجمالي الأعضاء": "Total Members",
        "إجمالي الرتب": "Total Roles",
        "الإيموجيات المخصصة": "Custom Emojis",
        "عدد البوتات": "Bots Count",
        "إجمالي القيف اوايز": "Total Giveaways",
        "معلومات السيرفر": "Server Information",
        "تاريخ إنشاء السيرفر": "Server Creation Date",
        "مستوى البوست": "Boost Level",
        "رابط السيرفر المخصص": "Vanity URL",
        "مستوى التحقق": "Verification Level",
        "لا يوجد": "None",
        "منخفض": "Low",
        "متوسط": "Medium",
        "عالي": "High",
        "عالي جداً": "Very High",
        "مستوى": "Level",

        // Quick Actions & Widgets
        "الإجراءات السريعة": "Quick Actions",
        "إدارة الأوامر": "Manage Commands",
        "إعدادات الإشراف": "Moderation Settings",
        "نظام الحماية": "Protection System",
        "أكثر الأعضاء نشاطاً": "Top Active Members",
        "عرض الكل": "View All",
        "قنوات الإحصائيات": "Stat Channels",
        "مؤشرات تفاعل السيرفر": "Server Engagement Indicators",
        "القنوات النصية": "Text Channels",
        "القنوات الصوتية": "Voice Channels",
        "الرتب المسجلة": "Recorded Roles",
        "اقتراح": "Suggestion",
        "قناة": "Channel",

        // Sidebar & Groups
        "الأخيرة": "Recent",
        "الرسائل والأمبد": "Messages & Embeds",
        "الميزات الأساسية": "Core Features",
        "الإجراءات الآلية": "Automations",
        "الحماية والأمان": "Security & Protection",
        "الرقابة والإشراف": "Moderation & Logs",
        "الحماية المتقدمة": "Advanced Protection",
        "الإدارة والمنظومة": "Administration",
        "التفاعل والأنشطة": "Engagement",
        "القرآن والمحتوى الإسلامي": "Quran & Islamic",
        "عام": "General",
        "أخرى": "Other",
        "نظرة عامة": "Overview",
        "مظهر البوت": "Bot Appearance",
        "الإعدادات": "Settings",
        "الإحصائيات": "Analytics",
        "الأوامر": "Commands",
        "الترحيب & المغادرة": "Welcome & Leave",
        "الرد التلقائي": "Auto Responder",
        "نظام التذاكر": "Ticket System",
        "المستويات & XP": "Levels & XP",
        "الرتب التلقائية": "Auto Roles",
        "قيف اواي": "Giveaways",
        "التقديمات": "Applications",
        "الاقتراحات والشكاوي": "Suggestions & Feedback",
        "حماية السيرفر": "Server Protection",
        "سجلات الأحداث": "Event Logs",
        "تحديث": "Update",
        "جديد": "New",
        "جديد وذكي": "New & Smart",
        "وذكي": "and Smart",
        "ذكي": "Smart",

        // Common General Buttons & Texts
        "خروج": "Logout",
        "تفعيل": "Enable",
        "تعطيل": "Disable",
        "حذف": "Delete",
        "إنشاء": "Create",
        "تعديل": "Edit",
        "إلغاء": "Cancel",
        "إرسال": "Send",
        "تطبيق": "Apply",
        "المشرف": "Staff / Mod",
        "إجراءات": "Actions",
        "تذاكر": "Tickets",
        "الجلسات": "Shifts",
        "إجمالي": "Total",
        "عضو": "Member",
        "الأعضاء": "Members",
        "إدارة سيرفر": "Manage Server",
        "لوحة المتصدرين": "Leaderboards",
        "أغنى الأثرياء": "Richest Users",
        "أعلى نقاط السمعة & XP": "Top Rep & XP",
        "الراتب اليومي": "Daily Reward",
        "صوّت للبوت": "Vote for Bot",
        "صوّت للبوت على Top.gg": "Vote for Bot on Top.gg",
        "متجر الخلفيات": "Wallpapers Shop",
        "سيرفراتي المدارة": "My Managed Servers",
        "خوادمك المتاحة للإدارة": "Your Manageable Servers",
        "الملف الشخصي": "Profile",
        "بطاقة الهوية": "ID Card",
        "اليوم": "Today",
        "الرصيد": "Balance",
        "الذهب": "Gold",
        "السمعة": "Reputation",
        "التصنيف": "Rank",
        "المستوى": "Level",
        "احصل على": "Get",
        "مجاناً كل 24 ساعة!": "for free every 24 hours!",
        "مكافأة اليوم": "Today's Reward",
        "التكرار": "Frequency",
        "كل 24 ساعة": "Every 24 hours",
        "استلام الرصيد اليومي": "Claim Daily Reward",
        "متاح بعد: ": "Available in: ",
        "صوّتك يساعد البوت على الانتشار ويدعم تطويره! يمكنك التصويت مرة كل": "Your vote helps the bot grow and supports development! You can vote every",
        "12 ساعة": "12 hours",
        "صوّت الآن واكسب": "Vote now and earn",
        "لا توجد سيرفرات مشتركة لديك صلاحيات إدارتها": "No manageable servers found",
        "لإدارة سيرفر، يجب أن تكون مالك السيرفر أو تملك رتبة إدارية (Manage Server أو Administrator) ويكون البوت مضافاً في السيرفر.": "To manage a server, you must be the owner or have Administrator / Manage Server permissions, and the bot must be invited.",
        "إضافة البوت لسيرفرك": "Add Bot to Server",
        "جديد: نظام التذاكر والتحكم المتطور": "New: Advanced Ticket & Control System",
        "اصنع خادم ديسكورد": "Build a Professional",
        "احترافي!": "Discord Server!",
        "إضافة البوت في Discord": "Add Bot to Discord",
        "السيرفرات النشطة": "Active Servers",
        "سرعة الاستجابة": "Response Latency",
        "مستخدم نشط": "Active Users",

        // Landing Page Features Section
        "مميزات حقيقية وشاملة": "Real & Comprehensive Features",
        "كل ما يحتاجه سيرفرك في مكان واحد": "Everything Your Server Needs in One Place",
        "أنظمة برمجية متطورة مصممة بأعلى معايير الحماية والأداء، بتحكم كامل ولحظي.": "Advanced software systems built to the highest security and performance standards, with complete real-time control.",
        "حماية متقدمة ومانع تخريب": "Advanced Protection & Anti-Nuke",
        "تصدي فوري لمحاولات السبام والروابط المشبوهة، حماية الرتب، منع تخريب القنوات، وسجل أمان ومراقبة متكامل لحظة بلحظة.": "Instant defense against spam and suspicious links, role protection, channel lockdown, and full real-time audit logging.",
        "بطاقات ترحيب ورتب فورية": "Welcome Cards & Instant Roles",
        "تصميم بطاقات ترحيب بالصور الاحترافية ومشاركتها فور دخول العضو، مع إسناد تلقائي للرتب وإرسال رسائل خاصة مميزة.": "Professional image welcome cards upon member join, with automated role assignment and customized direct messages.",
        "نظام اقتصاد ومكافآت يومية": "Economy & Daily Rewards System",
        "نظام راتب يومي مع مكافآت Streak متتالية، لوحة متصدرين بالذهب والخبرة، ومتجر خلفيات هوية غني بـ 105 خلفية حصرية.": "Daily salary system with consecutive Streak rewards, Gold and XP leaderboards, and a profile card wallpaper shop with 105 exclusive designs.",
        "لوحات تذاكر متعددة الأقسام": "Multi-Category Ticket Panels",
        "نظام تذاكر احترافي بأزرار تفاعلية، استلام التذاكر من فريق الدعم، حفظ سجل المحادثات (Transcripts)، وتقييم طاقم العمل.": "Professional ticket panels with interactive buttons, support staff claiming, full chat transcripts, and staff rating.",
        "سجلات دقيقة (Server Logs)": "Detailed Server Logs",
        "سجلات دقيقة": "Detailed Logs",
        "تسجيل شامل لـ 13 فئة (حذف وتعديل الرسائل، دخول وخروج الصوت، تعديل الرتب والقنوات، الطرد والحظر) بأدق التفاصيل.": "Comprehensive logging across 13 categories (messages, voice, roles, channels, kicks, bans) with precision details.",
        "رومات صوتية مؤقتة وتلقائية": "Automated Temp Voice Channels",
        "إنشاء رومات صوتية خاصة تلقائياً فور دخول العضو، مع لوحة تحكم كاملة لقفل الروم، تحديد العدد، وتغيير الاسم والجودة.": "Automatic private voice channels on member join, with a complete control panel to lock, limit, rename, and adjust bitrate.",
        "جميع الحقوق محفوظة ©": "All Rights Reserved ©",
        "سيرفر الدعم الفني": "Support Server",

        // Additional Dashboard & Sidebar Terms
        "إدارة السيرفر": "Server Management",
        "القرآن والإذاعة": "Quran & Radio",
        "القرآن & الراديو": "Quran & Radio",
        "رسائل الأمبد": "Embed Messages",
        "نظام الإعلانات": "Broadcast System",
        "Anti Nuke (الحماية)": "Anti-Nuke Protection",
        "القائمة البيضاء": "Whitelist",
        "سجلات الأمان والإشراف": "Security & Mod Logs",
        "النسخ الاحتياطية": "Server Backups",
        "الرقابة التلقائية": "Auto Moderation",
        "مكافحة الغزو": "Anti-Raid",
        "نشاط الإدارة": "Staff Activity",
        "الرومات المؤقتة": "Temp Voice",
        "البوستات": "Server Boosts",
        "الألوان": "Color Roles",
        "السجلات": "Logs",
        "التذاكر": "Tickets",
        "لوحة صدارة المشرفين": "Staff Leaderboard",
        "إداريين نشطين": "Active Staff",
        "إجراءات إدارية": "Staff Actions",
        "تذاكر مغلقة": "Closed Tickets",
        "أعلى نقاط فردية": "Top Individual Points",
        "إداري مسجل": "Registered Staff",
        "تصفير الإحصائيات": "Reset Stats",
        "إحصائيات دقيقة للتذاكر، الإشراف، الصوت والنقاط لكل مشرف": "Accurate stats for tickets, mod actions, voice and points for each moderator",
        "لا يوجد نشاط مسجل للمشرفين حتى الآن": "No staff activity recorded yet",
        "يتم تسجيل إجراءات المشرفين تلقائياً عند تنفيذ أوامر الإشراف": "Staff actions are automatically tracked upon executing moderation commands",
        "الأقسام": "Categories",
        "الأوامر الأساسية": "Basic Commands",
        "العقوبات": "Punishments",
        "سجلات العقوبات": "Punishment Logs",
        "إدارة القنوات": "Channels Management",
        "أدوات الشات": "Chat Tools",
        "إدارة الصوت": "Voice Management",
        "إدارة الرتب": "Roles Management",
        "الرتب الخاصة": "Custom Roles",
        "أدوات البوت الخاص": "Custom Bot Tools",
        "الحماية": "Security",
        "المستويات والخبرة": "Levels & XP",
        "إحصائيات السيرفر": "Server Stats",
        "الأوامر المفعلة": "Enabled Commands",
        "إجمالي الأوامر": "Total Commands",
        "اختصارات مخصصة": "Custom Aliases",
        "تعطيل الكل": "Disable All",
        "تفعيل الكل": "Enable All",
        "حُفظ": "Saved",
        "الكل": "All",
        "مفعل": "Enabled",
        "معطل": "Disabled",
        "لا توجد أوامر مطابقة": "No matching commands found",
        "لا توجد بيانات نشاط حتى الآن": "No activity data yet",
        "صلاحيات ديسكورد": "Discord Perms",
        "قفل قناة": "Lock channel",
        "فتح قناة": "Unlock channel",
        "طرد عضو": "Kick member",
        "حظر عضو": "Ban member",
        "فك حظر عضو": "Unban member",
        "كتم عضو": "Mute member",
        "فك كتم عضو": "Unmute member",
        "عزل عضو": "Timeout member",
        "فك عزل عضو": "Untimeout member",
        "تحذير عضو": "Warn member",
        "حذف تحذير": "Delete warning",
        "سجن عضو": "Jail member",
        "إخراج من السجن": "Unjail member",

        // Appearance Section
        "تخصيص البوت": "Bot Customization",
        "غير اسم البوت وصورته وبنره لكل سيرفر": "Change bot name, avatar and banner per server",
        "اسم البوت في السيرفر": "Bot Name in Server",
        "تغيير اسم البوت المعروض في هذا السيرفر فقط": "Change bot name displayed in this server only",
        "وصف البوت في السيرفر": "Bot Description in Server",
        "تغيير وصف البوت (About Me) المعروض في هذا السيرفر فقط": "Change bot About Me displayed in this server only",
        "اكتب وصفاً للبوت في هذا السيرفر...": "Write a description for the bot in this server...",
        "صورة البوت في السيرفر": "Bot Avatar in Server",
        "تغيير صورة البوت المعروضة في هذا السيرفر فقط (Per-Server Avatar)": "Change bot avatar displayed in this server only (Per-Server Avatar)",
        "اختر صورة": "Choose Avatar",
        "اضغط أو الصق رابط صورة جديدة": "Click or paste a new image link",
        "بنر البوت في السيرفر": "Bot Banner in Server",
        "تغيير بنر البوت المعروض في هذا السيرفر فقط (Per-Server Banner)": "Change bot banner displayed in this server only (Per-Server Banner)",
        "اختر بنر": "Choose Banner",
        "الصق رابط صورة البنر المباشر": "Paste direct banner image link",
        "ملاحظات مهمة": "Important Notes",
        "• تغيير الاسم والصورة والبنر يؤثر فقط على السيرفر المحدد.": "• Changing name, avatar, and banner affects only the selected server.",
        "• قد يستغرق ظهور التغييرات بضع ثوانٍ في ديسكورد فور الضغط على حفظ.": "• Changes may take a few seconds to appear in Discord after saving.",
        "• الصور يجب أن تكون بروابط مباشرة بصيغة PNG أو JPG أو WEBP أو GIF.": "• Images must be direct links ending in PNG, JPG, WEBP, or GIF.",
        "رابط الصورة المباشر": "Direct image link",
        "رابط البنر المباشر": "Direct banner link",

        // Moderation Section Detailed Badges & Cards
        "إعدادات الإشراف والعقوبات": "Moderation & Punishments Settings",
        "مسح كل التحذيرات": "Clear All Warnings",
        "رتب الإشراف": "Moderator Roles",
        "رتب المشرفين": "Staff Roles",
        "رتب مستثناة": "Excluded Roles",
        "كلمات محظورة": "Banned Words",
        "نظام التحذيرات": "Warnings System",
        "نظام الكتم": "Mute System",
        "سبام المنشنات": "Mention Spam",
        "فلتر الحروف الكبيرة": "Caps Filter",
        "سبام الإيموجيات": "Emoji Spam",

        // General Settings & Danger Zone
        "تصفير سجلات العقوبات التلقائي": "Auto-Clear Infractions",
        "حذف دوري لسجلات العقوبات المنتهية / المزالة – العقوبات النشطة لا تتأثر إطلاقاً.": "Periodic cleanup of expired / removed punishment logs – active punishments are never affected.",
        "فترة التصفير": "Clearing Period",
        "كل أسبوع": "Every week",
        "كل أسبوعين": "Every 2 weeks",
        "كل 3 أسابيع": "Every 3 weeks",
        "كل شهر": "Every month",
        "أنواع العقوبات المشمولة": "Covered Punishment Types",
        "كل الأنواع": "All Types",
        "حظر": "Ban",
        "حظر مؤقت": "Temporary Ban",
        "ميوت": "Mute",
        "ميوت صوتي": "Voice Mute",
        "سجن": "Jail",
        "تحذير": "Warning",
        "طرد": "Kick",
        "داون": "Down",
        "بلوك": "Block",
        "بلاك لست": "Blacklist",
        "تايم اوت": "Timeout",
        "منطقة الخطر": "Danger Zone",
        "تصفير قاعدة بيانات السيرفر": "Reset Server Database",
        "أونر السيرفر حصراً. يمسح كل بيانات البوت لهذا السيرفر نهائياً – الإعدادات، الحماية، سجل العقوبات، كل شيء (عدا التوب الكتابي/الصوتي والدعوات، تُدار منفصلة عبر أمر reset).": "Server owner only. Permanently deletes all bot data for this server – Settings, Security, Punishment Logs, everything (except text/voice top & invites, managed separately via reset command).",

        // Analytics & Stats Section
        "لوحة الإحصائيات والتحليلات المتقدمة": "Advanced Analytics & Stats Dashboard",
        "تحليل شامل لحركة السيرفر ونموه وتوزيع الأعضاء والقنوات": "Comprehensive analysis of server activity, growth, and member & channel distribution",
        "إدارة قنوات العدادات 📡": "Manage Stat Channels 📡",
        "إدارة قنوات العدادات": "Manage Stat Channels",
        "الاقتراحات والشكاوى": "Suggestions & Feedback",
        "إجمالي قنوات السيرفر": "Total Server Channels",
        "قنوات السيرفر": "Server Channels",
        "الربط السريع للعدادات": "Quick Stat Channels Setup",
        "فتح مدير قنوات الإحصائيات (9 أنواع) 🚀": "Open Stat Channels Manager (9 Types) 🚀",
        "فتح مدير قنوات الإحصائيات": "Open Stat Channels Manager",
        "يمكنك الآن تفعيل **9 أنواع مختلفة** من قنوات الإحصائيات (أعضاء، بشر، بوتات، متصلين، صوتية، رتب...) تتحدث تلقائياً كل 10 دقائق من قسم قنوات الإحصائيات.": "You can now enable 9 different types of stat channels (members, humans, bots, online, voice, roles...) updating automatically every 10 minutes from the stat channels section.",
        "عدد جميع الأعضاء في السيرفر": "Total count of all members in the server",
        "عدد الأعضاء البشريين فقط": "Count of human members only",
        "عدد البوتات في السيرفر": "Count of bots in the server",
        "الأعضاء الأونلاين": "Online Members",
        "عدد الأعضاء المتصلين حالياً": "Count of currently connected members",
        "المتصلين صوتياً": "Connected to Voice",
        "عدد الأعضاء في القنوات الصوتية": "Count of members in voice channels",
        "عدد القنوات الكلي": "Total Channels Count",
        "إجمالي عدد جميع القنوات": "Total count of all channels",
        "الرتب الكلية": "Total Roles",
        "عدد الرتب في السيرفر": "Count of roles in the server",
        "حذف هذه القناة": "Delete this channel",
        "مربوطة بـ:": "Linked to:",

        // Commands DB
        "الأوامر الرئيسية للبوت والاستخدام اليومي": "Core bot commands for daily use",
        "أوامر تنفيذ العقوبات المباشرة على الأعضاء": "Commands for direct member punishments",
        "استعلام وعرض سجلات العقوبات السابقة": "Query and view past punishment logs",
        "أوامر قفل وإخفاء وإدارة القنوات": "Channel lock, hide & management commands",
        "أوامر حذف الرسائل والإعلانات والتفاعل": "Message deletion, announcements & interaction",
        "أوامر التحكم في قنوات الصوت والأعضاء": "Voice channel & member control commands",
        "أوامر إعطاء وإزالة وإنشاء الرتب": "Give, remove & create role commands",
        "أوامر الرتب الخاصة المخصصة لكل عضو": "Personal custom role commands for each member",
        "أوامر عرض إحصائيات ومعلومات السيرفر": "Server info & statistics commands",
        "أوامر تخصيص مظهر وحالة البوت الخاص": "Custom bot appearance & status commands",
        "أوامر الحماية من التخريب ومكافحة السبام": "Anti-nuke & anti-spam protection commands",
        "أوامر المستويات وبطاقات الرانك": "Level system & rank card commands",
        "أوامر قنوات العدادات التلقائية": "Automatic stat counter channel commands",
        "أوامر البروفايل والسمعة والعملات": "Profile, reputation & currency commands",
        "قائمة جميع الأوامر المتاحة": "List of all available commands",
        "سرعة استجابة البوت": "Bot response latency",
        "معلومات البوت الكاملة": "Complete bot information",
        "معلومات السيرفر الشاملة": "Comprehensive server information",
        "معلومات عضو في السيرفر": "Member information in the server",
        "عرض صورة عضو بدقة عالية": "View member avatar in high resolution",
        "عرض بنر عضو": "View member banner",
        "عدد دعوات عضو في السيرفر": "Member's invite count in the server",
        "قائمة رتب السيرفر الكاملة": "Complete server roles list",
        "قائمة قنوات السيرفر": "Server channels list",
        "قائمة إيموجيات السيرفر المخصصة": "Server custom emojis list",
        "تقديم طلب وظيفي بالسيرفر": "Submit a staff application in the server",
        "فتح تذكرة دعم": "Open a support ticket",
        "استلام الراتب اليومي": "Claim daily reward",
        "عرض بطاقة البروفايل": "View profile card",
        "قائمة المتصدرين": "Leaderboard list",
        "رصيد النجوم والتقييمات": "Stars & rating balance",
        "حذف نهائي لكل سجلات العقوبات": "Permanently delete all punishment records",
        "تغيير الاسم المستعار": "Change nickname",
        "بلاك لست عضو (دائم)": "Blacklist member (permanent)",
        "فك بلاك لست عضو": "Unblacklist member",
        "حذف عقوبة من عضو": "Remove punishment from member",
        "إزالة الرتب الإدارية لمدة محددة": "Remove admin roles for a set duration",
        "استعادة الرتب الإدارية المزالة": "Restore removed admin roles",
        "حظر عضو من رتبة": "Block member from a role",
        "فك حظر عضو من رتبة": "Unblock member from a role",
        "عرض كل التحذيرات النشطة": "View all active warnings",
        "سجل باندات عضو": "Member ban log",
        "سجل بلاك لست عضو": "Member blacklist log",
        "سجل بلوكات عضو": "Member block log",
        "عرض تفاصيل عقوبة": "View punishment details",
        "سجل عقوبات العضو الكامل": "Complete member punishment log",
        "عقوبات العضو النشطة حالياً": "Member's currently active punishments",
        "سجل داونات عضو": "Member down log",
        "سجل إشراف المشرفين": "Moderator supervision log",
        "سجل طرديات عضو": "Member kick log",
        "سجل كتمات عضو": "Member mute log",
        "سجل سجنات عضو": "Member jail log",
        "سجل عزلات عضو": "Member timeout log",
        "سجل تحذيرات عضو": "Member warnings log",
        "تقرير نشاط فريق الإدارة": "Staff team activity report",
        "سجل التدقيق والعمليات": "Audit & operations log",
        "ملخص جميع العقوبات النشطة": "Summary of all active punishments",
        "قفل قناة مقفولة": "Unlock a locked channel",
        "إخفاء قناة عن الأعضاء": "Hide channel from members",
        "إظهار قناة مخفية": "Show a hidden channel",
        "تفعيل السلو مود في القناة": "Enable slow mode in channel",
        "نسخ قناة بكامل إعداداتها": "Clone channel with all its settings",
        "تغيير اسم القناة": "Change channel name",
        "تغيير وصف القناة": "Change channel topic",
        "تفعيل/تعطيل وضع NSFW": "Enable/disable NSFW mode",
        "حذف عدد محدد من الرسائل": "Delete a specific number of messages",
        "حذف الرسائل المثبتة": "Delete pinned messages",
        "حذف رسائل البوتات": "Delete bot messages",
        "حذف رسائل عضو معين": "Delete messages from a specific member",
        "إرسال رسالة عبر البوت": "Send a message through the bot",
        "إنشاء Embed مخصص": "Create a custom Embed",
        "إنشاء استطلاع رأي": "Create a poll",
        "تعيين تذكير مؤقت": "Set a temporary reminder",
        "إرسال إعلان رسمي": "Send an official announcement",
        "بث رسالة في جميع القنوات": "Broadcast a message to all channels",
        "ترجمة نص إلى لغة أخرى": "Translate text to another language",
        "اقتباس رسالة قديمة": "Quote an old message",
        "كتم عضو في الصوت": "Mute member in voice",
        "فك كتم عضو في الصوت": "Unmute member in voice",
        "صمم عضو في الصوت": "Deafen member in voice",
        "فك تصميم عضو في الصوت": "Undeafen member in voice",
        "طرد عضو من قناة الصوت": "Kick member from voice channel",
        "نقل عضو بين قنوات الصوت": "Move member between voice channels",
        "نقل جميع الأعضاء لقناة أخرى": "Move all members to another channel",
        "تحديد الحد الأقصى للمستخدمين": "Set maximum user limit",
        "إغلاق كامل قنوات السيرفر فوراً": "Immediately lock down all server channels",
        "إعادة فتح جميع القنوات المغلقة": "Re-open all locked channels",
        "تقرير حالة الحماية": "Security status report",
        "فحص ثغرات وصلاحيات السيرفر": "Scan server permissions & vulnerabilities",
        "إضافة رتبة مكافأة عند مستوى": "Add reward role at a level",
        "إزالة رتبة مكافأة": "Remove reward role",
        "قائمة جميع رتب المكافآت": "List of all reward roles",
        "تغيير خلفية بطاقة الرانك": "Change rank card background",
        "تفعيل مضاعفة الخبرة 2x": "Enable 2x XP boost",
        "إنشاء قنوات عدادات السيرفر": "Create server stat channels",
        "تفعيل عداد الأعضاء": "Enable members counter",
        "تفعيل عداد البوتات": "Enable bots counter",
        "تفعيل عداد القنوات": "Enable channels counter",
        "تفعيل عداد الرتب": "Enable roles counter",
        "تفعيل عداد البوستات": "Enable boosts counter",
        "تفعيل عداد المتواجدين أونلاين": "Enable online members counter",
        "تفعيل عداد المتواجدين في الصوت": "Enable in-voice counter",
        "حذف جميع قنوات العدادات": "Delete all stat channels",
        "تحديث فوري لأرقام العدادات": "Instant refresh of stat numbers",
        "تعديل شكل قنوات العدادات": "Edit stat channel format",
        "إعطاء رتبة لعضو": "Give role to member",
        "إزالة رتبة من عضو": "Remove role from member",
        "إعطاء رتبة لجميع الأعضاء": "Give role to all members",
        "إعطاء رتبة لجميع البوتات": "Give role to all bots",
        "إعطاء رتبة لجميع البشر": "Give role to all humans",
        "إنشاء رتبة جديدة": "Create a new role",
        "حذف رتبة من السيرفر": "Delete a role from the server",
        "تغيير لون رتبة": "Change role color",
        "معلومات رتبة مفصلة": "Detailed role information",
        "قائمة أعضاء رتبة معينة": "List of members with a specific role",
        "إنشاء رتبة خاصة بك": "Create your own custom role",
        "عرض معلومات رتبتك الخاصة": "View your custom role info",
        "تغيير لون رتبتك الخاصة": "Change your custom role color",
        "تغيير اسم رتبتك الخاصة": "Change your custom role name",
        "تغيير أيقونة رتبتك الخاصة": "Change your custom role icon",
        "مشاركة رتبتك الخاصة مع عضو": "Share your custom role with a member",
        "إلغاء مشاركة الرتبة مع عضو": "Revoke role sharing from a member",
        "حذف رتبتك الخاصة نهائياً": "Permanently delete your custom role",
        "قائمة جميع الرتب الخاصة": "List of all custom roles",
        "بنر السيرفر الرسمي": "Official server banner",
        "أيقونة السيرفر بدقة عالية": "Server icon in high resolution",
        "إحصائيات السيرفر المفصلة": "Detailed server statistics",
        "قائمة المبوستين وعدد البوستات": "List of boosters and boost count",
        "أكثر الأعضاء دعوةً": "Top member inviters",
        "قائمة كاملة بالقنوات": "Full channels list",
        "قائمة وتوزيع الرتب": "Roles list and distribution",
        "قائمة الإيموجيات المخصصة": "Custom emojis list",
        "قائمة الستيكرات": "Stickers list",
        "قائمة المحظورين": "Banned members list",
        "قائمة الإدارة والمشرفين": "Admins and moderators list",
        "قائمة بوتات السيرفر": "Server bots list",
        "ميزات السيرفر المفعلة": "Enabled server features",
        "مدة تشغيل البوت": "Bot uptime",
        "معلومات الشاردات": "Shards information",
        "تغيير اسم البوت في السيرفر": "Change bot name in server",
        "تغيير صورة البوت": "Change bot avatar",
        "تغيير بنر البوت": "Change bot banner",
        "تغيير نشاط وحالة البوت": "Change bot activity & status",
        "تغيير حالة التواجد Online/DND/Idle": "Change online status Online/DND/Idle",
        "تفعيل/تعطيل مكافحة الغزو": "Enable/disable anti-raid",
        "إعدادات جدار الحماية Anti-Nuke": "Anti-Nuke shield settings",
        "إضافة عضو للقائمة البيضاء": "Add member to whitelist",
        "إزالة عضو من القائمة البيضاء": "Remove member from whitelist",
        "عرض القائمة البيضاء": "View whitelist",
        "منع دخول البوتات غير الموثقة": "Block unverified bots from joining",
        "مكافحة السبام والرسائل المتكررة": "Anti-spam & repeated messages",
        "منع نشر الروابط": "Prevent link sharing",
        "إنشاء نسخة احتياطية للسيرفر": "Create server backup",
        "استعادة نسخة احتياطية": "Restore a backup",
        "قائمة النسخ الاحتياطية": "Backups list",
        "عرض بطاقة مستواك الحالية": "View your current level card",
        "المتصدرين في المستويات": "Top levels leaderboard",
        "تعديل نقاط الخبرة لعضو": "Edit XP points for a member",
        "تعديل مستوى عضو": "Edit member level",
        "تصفير نظام المستويات": "Reset levels system",
        "عرض بطاقة بروفايلك الشاملة": "View your comprehensive profile card",
        "إعطاء نقطة سمعة لعضو (+rep)": "Give reputation point to member (+rep)",
        "استلام الراتب اليومي (Gold)": "Claim daily reward (Gold)",
        "رصيدك من عملات Gold": "Your Gold currency balance",
        "تحويل عملات Gold لعضو آخر": "Transfer Gold coins to another member",
        "تعديل النبذة الشخصية": "Edit personal bio",
        "تعديل اللقب الشخصي": "Edit personal title",
        "تعديل الشارة المفضلة": "Edit favorite badge",
        "تغيير خلفية بطاقة البروفايل": "Change profile card background",
        "الزواج التفاعلي في السيرفر": "Interactive marriage in the server",
        "مسح جميع التحذيرات": "Clear all warnings",
        "مسح تحذيرات عضو كاملة": "Clear all warnings for a member",
        "عرض بطاقة مستواك": "View your level card",
        "عرض بطاقة مستوى": "View level card",
        "عرض بطاقة بروفايل": "View profile card",
        "تشغيل نشاط جماعي بالصوت": "Start a group activity in voice",
        "معلومات قناة الصوت الحالية": "Current voice channel info",
        "السماح لعضو بالدخول": "Allow member to enter",
        "منع عضو من الدخول": "Prevent member from entering",
        "تغيير جودة الصوت (Bitrate)": "Change audio quality (Bitrate)",
        "إنشاء قناة صوتية مؤقتة": "Create a temporary voice channel",
        "تغيير اسم قناة الصوت": "Change voice channel name",
        "تخصيص وإدارة جميع أوامر البوت والصلاحيات": "Customize and manage all bot commands and permissions",
        "...ابحث عن أمر": "Search for a command...",

        // Dashboard chrome & AI page
        "قائمة الأوامر": "Commands List",
        "الإشراف": "Moderation",
        "الأعضاء:": "Members:",
        "الذكاء الاصطناعي": "AI",
        "الذكاء الاصطناعي (ZENO AI & Web)": "AI (ZENO AI & Web)",
        "الذكاء الاصطناعي والتصفح الذكي": "AI & Smart Browsing",

        // Residual dashboard strings
        "خطأ في إعدادات البوت: CLIENT_SECRET غير مضاف في لوحة Render.": "Bot configuration error: CLIENT_SECRET is not configured in the Render dashboard.",
        "فشل جلب بيانات المستخدم من Discord": "Failed to fetch user data from Discord",
        "فشل جلب سيرفرات المستخدم من Discord": "Failed to fetch user guilds from Discord",
        "حدث خطأ أثناء تسجيل الدخول:": "An error occurred while logging in:",
        "غير معروف": "Unknown",
        "السيرفر غير موجود في كاش البوت": "Server not found in bot cache",
        "يجب تسجيل الدخول أولاً": "You must log in first",
        "بيانات غير صالحة": "Invalid data",
        "إجراء غير معروف": "Unknown action",
        "<p class=\"text-xs text-gray-500 text-center py-4\">لا توجد بيانات خبرة مسجلة بعد</p>": "<p class=\"text-xs text-gray-500 text-center py-4\">No XP data recorded yet</p>",
        "<p class=\"text-xs text-gray-500 text-center py-4\">لا توجد بيانات ذهب مسجلة بعد</p>": "<p class=\"text-xs text-gray-500 text-center py-4\">No Gold data recorded yet</p>",
        "<span class=\"absolute top-2 left-2 bg-emerald-500 text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-md\">✓ مفعّل حالياً</span>": "<span class=\"absolute top-2 left-2 bg-emerald-500 text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-md\">✓ Currently Active</span>",
        "<span>مجهزة على بطاقتك 🪪</span>": "<span>Equipped on your card 🪪</span>",
        "<span>شراء وتجهيز (${w.price.toLocaleString()} 🪙)</span>": "<span>Buy & Equip (${w.price.toLocaleString()} 🪙)</span>",
        "جارٍ الاستلام... ⏳": "Claiming... ⏳",
        "🎉 تم استلام": "🎉 Claimed",
        "حدث خطأ في الاتصال بالسيرفر": "Server connection error",
        "جارٍ الشراء... ⏳": "Purchasing... ⏳",
        "رصيدك لا يكفي لإتمام الشراء": "Insufficient balance for this purchase",
        "شراء وتجهيز": "Buy & Equip",
        "حدث خطأ أثناء الشراء": "An error occurred while purchasing",
        "الصفحة الرئيسية": "Home",

        // ===== Dashboard UI strings added during the latest dashboard builds =====
        "وداعاً [userName]، نتمنى رؤيتك قريباً 👋": "Goodbye [userName], we hope to see you again soon 👋",
        "مرحباً بك [user] في تذكرتك الخاصة! يرجى توضيح استفسارك أو مشكلتك بالتفصيل وسيقوم فريق الدعم بالرد عليك قريباً.": "Welcome [user] to your private ticket! Please describe your question or issue in detail and the support team will reply soon.",
        "🎫 نظام الدعم الفني والمساعدة": "🎫 Support & Help System",
        "نظام الدعم الفني والمساعدة": "Support & Help System",
        "فتح تذكرة | Open Ticket": "Open Ticket",
        "لفتح تذكرة جديدة والتواصل مع فريق الإدارة والدعم الفني، يرجى الضغط على الزر بالأسفل.": "To open a new ticket and contact the management and support team, click the button below.",
        "لم يتم العثور على القناة أو البوت يفتقر لصلاحيات الوصول إليها.": "Channel not found or the bot lacks permission to access it.",
        "نظام الرتب واللفلات التفاعلي 📈": "Interactive Levels & Ranks System 📈",
        "الرومات الصوتية المؤقتة 🔊": "Temporary Voice Channels 🔊",
        "الرتب التلقائية ورتب الدخول 🎖️": "Auto Roles & Join Roles 🎖️",
        "قناة المشاهير (Starboard) ⭐": "Starboard Channel ⭐",
        "نظام اختيار ألوان الرتب 🎨": "Role Color Selection System 🎨",
        "قنوات السجلات واللوق الشامل 📋": "Comprehensive Log Channels 📋",
        "التسلية والألعاب والمنافسات 🎮": "Entertainment, Games & Competitions 🎮",
        "الأوامر العامة والخدمية للأعضاء ⚙️": "General & Utility Commands ⚙️",
        "البوستات - رسالة الشكر للداعمين 🚀": "Boosts - Supporter Thank-You Message 🚀",
        "إذاعات وتلاوات القرآن الكريم 24/7 📻": "Quran Radio & Recitations 24/7 📻",
        "❌ أدخل رابط الحساب أو المعرف!": "❌ Enter the account URL or ID!",
        "نظام التقديمات 📝": "Applications System 📝",
        "تنبيهات YouTube / Twitch / TikTok 📺": "YouTube / Twitch / TikTok Notifications 📺",
        "مظهر البوت 🎨": "Bot Appearance 🎨",
        "إعدادات ": "Settings ",
        "✅ تمت إضافة الحساب بنجاح!": "✅ Account added successfully!",
        "❌ خطأ: ": "❌ Error: ",
        "يرجى كتابة ID القناة أولاً!": "Please enter the channel ID first!",
        "⏳ جارٍ الإرسال...": "⏳ Sending...",
        "جارٍ إرسال لوحة التذاكر إلى ديسكورد...": "Sending the ticket panel to Discord...",
        "✅ تم إرسال لوحة التذاكر بنجاح إلى الروم في السيرفر!": "✅ Ticket panel sent successfully to the server channel!",
        "فشل إرسال اللوحة، تأكد من صلاحيات البوت في الروم": "Failed to send the panel. Check the bot's channel permissions.",
        "❌ حدث خطأ أثناء الاتصال بالخادم": "❌ A server connection error occurred",
        "🚀 إرسال لوحة التذاكر إلى الروم المحدد": "🚀 Send Ticket Panel to Selected Channel",
        "❌ حدث خطأ أثناء الاتصال بالخادم: ": "❌ Server connection error: ",
        "يرجى اختيار روم التحقق أولاً!": "Please select the verification channel first!",
        "يرجى اختيار الرتبة الممنوحة عند التفعيل أولاً!": "Please select the role granted upon activation first!",
        "⏳ جارٍ النشر...": "⏳ Publishing...",
        "جارٍ إرسال لوحة التفعيل إلى ديسكورد...": "Sending the activation panel to Discord...",
        "✅ تم نشر رسالة وزر التفعيل بنجاح في القناة!": "✅ Verification message and button published successfully!",
        "فشل النشر، تأكد من صلاحيات البوت في القناة والرتبة": "Publishing failed. Check the bot's channel and role permissions.",
        "🚀 إرسال ونشر لوحة التحقق في الروم الآن": "🚀 Send & Publish Verification Panel Now",
        "🟢 البث يعمل الآن: ": "🟢 Stream is live: ",
        "في الروم الصوتي": "in the voice channel",
        "🔴 البوت غير متصل حالياً": "🔴 The bot is currently offline",
        "يرجى اختيار أو كتابة ID الروم الصوتي أولاً!": "Please select or enter the voice channel ID first!",
        "⏳ جارٍ البدء...": "⏳ Starting...",
        "يرجى كتابة عنوان التقديم أولاً!": "Please enter the application title first!",
        "خطأ: ": "Error: ",
        "فشل حفظ الاستمارة": "Failed to save the application form",
        "حدث خطأ أثناء الاتصال بالخادم": "A server connection error occurred",
        "هل أنت متأكد من رغبتك في حذف هذا التقديم؟": "Are you sure you want to delete this application?",
        "خطأ أثناء الحذف": "Error while deleting",
        "يرجى كتابة ID القناة المستهدفة أولاً!": "Please enter the target channel ID first!",
        "جارٍ نشر لوحة التقديمات في ديسكورد...": "Publishing the applications panel to Discord...",
        "📝 استمارات التقديم المتاحة": "📝 Available Application Forms",
        "اضغط على الزر أدناه أو اختر التقديم المناسب لتعبئة الاستمارة:": "Click the button below or choose an application to fill out the form:",
        "✅ تم نشر لوحة التقديمات بنجاح في القناة المحددة!": "✅ Applications panel published successfully to the selected channel!",
        "فشل النشر، تأكد من وجود استمارات وصلاحيات البوت": "Publishing failed. Make sure forms exist and the bot has the required permissions.",
        "إرسال اللوحة ➔": "Send Panel ➔",
        "الرجاء إدخال اسم الحساب واختيار روم التنبيهات!": "Please enter the account name and select a notification channel!",
        "⏳ جارٍ الإضافة...": "⏳ Adding...",
        "فشل إضافة التنبيه": "Failed to add notification",
        "حدث خطأ أثناء الاتصال بالسيرفر": "A server connection error occurred",
        "➕ إضافة وتفعيل التنبيه الآن": "➕ Add & Enable Notification Now",
        "جاري إرسال إشعار تجريبي في الروم...": "Sending a test notification to the channel...",
        "✅ تم إرسال الإشعار التجريبي بنجاح!": "✅ Test notification sent successfully!",
        "فشل إرسال الإشعار": "Failed to send notification",
        "الرجاء كتابة الكلمة المفتاحية ونص الرد!": "Please enter the keyword and response text!",
        "هل أنت متأكد من رغبتك في حذف هذا الرد التلقائي؟": "Are you sure you want to delete this auto response?",
        "عنوان الرسالة التجريبي": "Test Message Title",
        "محتوى رسالة الإيمبد يظهر هنا كما سيبدو تماماً في الديسكورد...": "Embed message content will appear here exactly as it will look in Discord...",
        "الرجاء إدخال ID القناة المستهدفة ومحتوى الرسالة (Description)!": "Please enter the target channel ID and message content (Description)!",
        "✅ تم إرسال رسالة الإيمبد إلى الروم في الديسكورد بنجاح!": "✅ Embed message sent to the Discord channel successfully!",
        "حدث خطأ أثناء الإرسال: ": "An error occurred while sending: ",
        "تأكد من صحة ID الروم وصلاحيات البوت": "Make sure the channel ID is correct and the bot has the required permissions.",
        "لا توجد أي قنوات أو حسابات مضافة حالياً. أضف أول حساب من النموذج بالأسفل!": "No channels or accounts have been added yet. Add the first account using the form below!",
        "🟢 نشط": "🟢 Active",
        "⚪ منتهي": "⚪ Ended",
        "⚡ فوري": "⚡ Instant",
        "إعلان بدون عنوان": "Untitled Announcement",
        "أدخل اسم الحساب!": "Enter the account name!",
        "✅ تمت الإضافة بنجاح!": "✅ Added successfully!",
        "هل أنت متأكد من الحذف؟": "Are you sure you want to delete this?",
        "هل أنت متأكد من رغبتك في حذف هذا الإعلان؟": "Are you sure you want to delete this announcement?",
        "جائزة": "Prize",
        "✅ تم إرسال رسالة اختبار!": "✅ Test message sent!",
        "رصيد الذهب والعملات": "Gold & Coins Balance",
        "فتح قناة مقفولة": "Unlock Locked Channel",
        "قفل قناة الصوت": "Lock Voice Channel",
        "فتح قناة الصوت": "Unlock Voice Channel",
        "إخفاء قناة الصوت": "Hide Voice Channel",
        "إظهار قناة الصوت": "Show Voice Channel",
        "أوامر الرتب الشخصية المخصصة لكل عضو": "Custom Personal Role Commands for Each Member",
        "لا توجد أوامر مطابقة 🔍": "No matching commands 🔍",
        "اختصار مخصص للأمر (Custom Alias)": "Custom Command Alias",
        "مثال: !b أو /b": "Example: !b or /b",
        "الرتب المسموح لها فقط بتشغيل الأمر (Allowed Roles)": "Roles Allowed to Use This Command",
        "القنوات المسموح فيها فقط بتشغيل الأمر (Allowed Channels)": "Channels Allowed for This Command",
        "إعادة ضبط": "Reset",
        "حفظ تفاصيل الأمر": "Save Command Details",
        "حظر الحروف الكبيرة": "Block Capital Letters",
        "إزعاج Spoilers": "Spoiler Filter",
        "نص Zalgo": "Zalgo Text",
        "مكافحة السبام المتقدم": "Advanced Anti-Spam",
        "الرسائل الطويلة": "Long Messages",
        "أدخل عدد التحذيرات المطلوب لتنفيذ العقوبة (مثلاً: 3):": "Enter the number of warnings required to apply the punishment (e.g. 3):",
        "أدخل الحد الأقصى للمنشنات المسموح بها في الرسالة الواحدة (مثلاً: 5):": "Enter the maximum allowed mentions per message (e.g. 5):",
        "أدخل الحد الأقصى لطول الرسالة بالأحرف (مثلاً: 1000):": "Enter the maximum message length in characters (e.g. 1000):",
        "هل أنت متأكد من رغبتك في حذف قاعدة العقوبة هذه؟": "Are you sure you want to delete this punishment rule?",
        "يرجى كتابة أيدي العضو أو منشن صالح وتحديد عدد الدعوات!": "Please enter a valid member ID or mention and specify the invite count!",
        "✅ تم تحديث رصيد دعوات العضو بنجاح!": "✅ Member invite balance updated successfully!",
        "فشل التحديث": "Update failed",
        "⚠️ تحذير: هل أنت متأكد من تصفير كافة بيانات الدعوات في السيرفر؟ لا يمكن التراجع عن هذا الإجراء!": "⚠️ Warning: Are you sure you want to reset all invite data on this server? This action cannot be undone!",
        "✅ تم تصفير الدعوات بنجاح!": "✅ Invites reset successfully!",
        "ينتهي بـ": "Ends with",
        "يبدأ بـ": "Starts with",
        "مطابقة تامة": "Exact match",
        "روم إرسال لوحة التذاكر (Panel Channel)": "Ticket Panel Channel",
        "الرتبة التي تُعطى للبوتات عند إضافتها للسيرفر": "Role given to bots when they are added to the server",
        "رتب مستثناة": "Excluded Roles",
        "المعطلة": "Disabled",
        "المفعلة": "Enabled",
        "المنتهية": "Ended",
        "النشطة": "Active",
        "المرفوضة": "Rejected",
        "المقبولة": "Accepted",
        "قيد المراجعة": "Pending Review",
        "الرتبة المطلوبة لاختيار الألوان (اختياري)": "Required role for selecting colors (optional)",
        "رتبة مكافأة البوستر التلقائية": "Automatic Booster Reward Role",
        "🟢 في الخدمة الآن": "🟢 On Duty Now",
        "رتب كتابية": "Text Roles",
        "رتب صوتية": "Voice Roles",
        "رتب مشتركة": "Combined Roles",
        "💬 الروم الحالي (نفس مكان كتابة الرسالة)": "💬 Current Channel (same channel as the message)",
        "📩 رسالة خاصة بالخاص (DM)": "📩 Direct Message (DM)",
        "🚫 معطل (بدون إرسال رسالة ترقية)": "🚫 Disabled (no level-up message)",
        "── القنوات النصية ──": "── Text Channels ──",
        "بدون رتبة تلقائية": "No automatic role",
        "الإدارة (Manage Server)": "Administration (Manage Server)",
        "بدون وصف": "No description",
        "إجابة قصيرة": "Short Answer",
        "فقرة": "Paragraph",
        "إنشاء نموذج تقديم جديد 📝": "Create New Application Form 📝",
        "ما هو عمرك وتواجدك اليومي؟": "What is your age and daily availability?",
        "ما هي خبراتك السابقة في الإدارة أو المجال؟": "What is your previous experience in administration or this field?",
        "لماذا ترغب بالانضمام إلى طاقم العمل؟": "Why do you want to join the staff team?",
        "النموذج غير موجود": "Application form not found",
        "تعديل نموذج: ": "Edit Form: ",
        "السؤال الأول": "First Question",
        "أقصى حد لأسئلة النافذة في ديسكورد هو 5 أسئلة": "Discord modals support a maximum of 5 questions",
        "يرجى إدخال عنوان النموذج": "Please enter the form title",
        "يرجى اختيار قناة استقبال الطلبات": "Please select an application submission channel",
        "يرجى كتابة سؤال واحد على الأقل للنموذج": "Please add at least one question to the form",
        "جارٍ الحفظ...": "Saving...",
        "✅ تم حفظ نموذج التقديم بنجاح!": "✅ Application form saved successfully!",
        "حفظ النموذج 💾": "Save Form 💾",
        "هل أنت متأكد من حذف نموذج التقديم هذا؟ سيتم حذف جميع الأسئلة المرتبطة به.": "Are you sure you want to delete this application form? All related questions will be deleted.",
        "✅ تم حذف النموذج بنجاح": "✅ Application form deleted successfully",
        "فشل الحذف": "Delete failed",
        "جاري الإرسال... ⏳": "Sending... ⏳",
        "تم الإرسال للقناة بنجاح! ✅": "Sent to the channel successfully! ✅",
        "إرسال البنل في شات 🚀": "Send Panel in Chat 🚀",
        "فشل الإرسال، تأكد من صحة القناة في النموذج": "Sending failed. Check the channel configured in the form.",
        "رفع الصورة": "Upload Image",
        "جاري الرفع... ⏳": "Uploading... ⏳",
        "✅ تم الرفع": "✅ Uploaded",
        "❌ فشل رفع الصورة: ": "❌ Image upload failed: ",
        "خطأ غير معروف": "Unknown error",
        "❌ حدث خطأ في الاتصال أثناء رفع الصورة": "❌ An error occurred while uploading the image",
        "لم يتم إرسال أي صورة": "No image was uploaded",
        "حجم الصورة كبير جداً (الحد الأقصى 15 ميجابايت)": "Image is too large (15 MB maximum)",
        "السيرفر غير متصل بالبوت حالياً": "Server is not currently connected to the bot",
        "تعذر تحميل وظيفة الإعداد": "Unable to load the setup function",
        "تم إنشاء ": "Created ",
        " قناة سجلات بنجاح": " log channel(s) successfully",
        "حدث خطأ أثناء الإنشاء": "An error occurred while creating",
        "تعذر تحميل وظيفة الحذف": "Unable to load the delete function",
        "تم حذف ": "Deleted ",
        " قناة وتعطيل السجلات": " channel(s) and disabled logging",
        "المستوى والرتبة مطلوبان": "Level and role are required",
        "غير مسجل دخول، يرجى تسجيل الدخول مجدداً": "Not logged in. Please log in again.",
        "لم يتم العثور على القناة — تأكد أن البوت موجود في السيرفر": "Channel not found — make sure the bot is in the server",
        "القناة المختارة ليست قناة نصية": "Selected channel is not a text channel",
        "البوت لا يملك صلاحية الإرسال في هذه القناة": "The bot does not have permission to send messages in this channel",
        "البوت لا يملك صلاحية إرسال Embed في هذه القناة — يلزم صلاحية Embed Links": "The bot does not have permission to send embeds in this channel — Embed Links permission is required",
        "🎉 سحب قيف اواي جديد!": "🎉 New Giveaway!",
        "مخصص لرتبة معينة • اضغط للمشاركة": "Restricted to a specific role • click to participate",
        "اضغط على الزر أدناه للمشاركة!": "Click the button below to participate!",
        "مشاركة في القيف اواي": "Enter Giveaway",
        " • اقتراح جديد": " • New Suggestion",
        "💡 اقتراح جديد": "💡 New Suggestion",
        "📂 التصنيف": "📂 Category",
        "⏳ الحالة": "⏳ Status",
        "قيد المراجعة": "Pending Review",
        "📊 التصويت | 0%": "📊 Votes | 0%",
        "صاحب الاقتراح: ": "Suggestion author: ",
        " • من الداشبورد": " • From the dashboard",
        "مناقشة: ": "Discussion: ",
        "مناقشة الاقتراح": "Suggestion Discussion",
        "⏳ قيد المراجعة": "⏳ Pending Review",
        "🚀 تم التنفيذ": "🚀 Implemented",
        "💡 اقتراح": "💡 Suggestion",
        "📊 الحالة": "📊 Status",
        "💬 رد الإدارة": "💬 Staff Response",
        "لم يتم تحديد روم إرسال لوحة التذاكر": "No ticket panel channel has been selected",
        "القناة غير موجودة أو ليست نصية": "Channel does not exist or is not a text channel",
        "🎫 تذاكر الدعم الفني": "🎫 Support Tickets",
        "لطلب المساعدة أو الاستفسار أو تقديم الشكاوى، اضغط على الزر أدناه لفتح تذكرة خاصة مع فريق الدعم.": "For help, questions, or complaints, click the button below to open a private ticket with the support team.",
        "لم يتم تحديد قناة لوحة الحضور والانصراف": "Staff attendance panel channel has not been selected",
        "📋 لوحة تسجيل حضور وانصراف الإدارة | Staff Shift": "📋 Staff Attendance & Shift Panel | Staff Shift",
        "تم تحديث قنوات الإحصائيات الآن!": "Stat channels updated successfully!",
        "لقد استلمت راتبك بالفعل، يرجى المحاولة لاحقاً بعد ": "You have already claimed your daily reward. Please try again in ",
        " دقيقة": " minutes",
        "رصيدك الحالي (": "Your current balance (",
        ") لا يكفي لشراء هذا العنصر (": ") is not enough to purchase this item (",
        "عنوان النموذج مطلوب": "Form title is required",
        "قناة استقبال الطلبات مطلوبة": "Application submission channel is required",
        "لم يتم العثور على القناة المحددة": "Selected channel not found",
        "اضغط على الزر بالأسفل لتعبئة استمارة التقديم والالتحاق بطاقم العمل.": "Click the button below to fill out the application and join the staff team.",
        "تقديم الآن 📝": "Apply Now 📝",
        "حدث خطأ أثناء معالجة الطلب": "An error occurred while processing the request",
        "تفعيل ✅": "Enable ✅",
        "تعطيل ❌": "Disable ❌",
        "...اختر": "...Select",
        "فشل الاختبار": "Test failed",
        "س": "h",
        "د": "m",
        "ث": "s",
        "إعدادات السيرفر": "Server Settings",
        "مرحباً بك في لوحة تحكم ZENO Bot!": "Welcome to the ZENO Bot Control Panel!",
        "مرحباً بك in Panel تحكم ZENO Bot!": "Welcome to the ZENO Bot Control Panel!",
        "جاري فحص الحالة...": "Checking status...",
        "بدون ديفن (Non-Deafened) 🔊": "Non-Deafened 🔊",
        "اختر الروم الصوتي أو ضع الـ ID يدوياً": "Select the voice channel or enter its ID manually",
        "إعدادات الروم والمحطة ⚙️": "Channel & Station Settings ⚙️",
        "اختر الروم الصوتي من السيرفر": "Select a voice channel from the server",
        "المحطة أو القارئ المفضل": "Preferred station or reciter",
        "البقاء متصلاً دائماً 24/7 (Always-On 24/7)": "Always Connected 24/7",
        "يقوم البوت بإعادة الاتصال بالروم الصوتي وتشغيل التلاوة تلقائياً في حال إعادة تشغيل البوت أو انقطاع الاتصال.": "The bot reconnects to the voice channel and resumes playback automatically after a restart or disconnection.",
        "تقديمات": "Applications",
        "إنشاء تقديم": "Create Application",
        "إضافة استمارة تقديم جديدة": "Add New Application Form",
        "عنوان التقديم": "Application Title",
        "شروط أو توضيح بسيط للتقديم...": "Requirements or a brief note about the application...",
        "مثال: تقديم إدارة السيرفر / دعم فني": "Example: Server Staff / Technical Support Application",
        "تعديل البطاقة": "Edit Card",
        "متجر شارات وأوسمة البروفايل 🎖️": "Profile Badges & Awards Shop 🎖️",
        "تاج الأساطير": "Legendary Crown",
        "شارة ملكية ذهبية": "Golden Royal Badge",
        "الماسة اللامعة": "Shining Diamond",
        "شارة النقاء والتميز": "Purity & Excellence Badge",
        "صاعقة النيون": "Neon Lightning",
        "شارة السرعة والقوة": "Speed & Power Badge",
        "درع الحارس": "Guardian Shield",
        "شارة الشرف والحماية": "Honor & Protection Badge",
        "لهب العزيمة": "Flame of Determination",
        "شارة النشاط والحماس": "Activity & Enthusiasm Badge",
        "رائد الفضاء": "Astronaut",
        "شارة الوصول للقمة": "Achievement Badge",
        "النجم الساطع": "Shining Star",
        "شارة التألق المستمر": "Continuous Brilliance Badge",
        "قناع الغموض": "Mystery Mask",
        "شارة الأسلوب الفريد": "Unique Style Badge",
        "خلفيات وبطاقات الهوية الشخصية 🪪": "Personal ID Card Backgrounds & Designs 🪪",
        "خصص تصميم بطاقة الهوية التي تظهر في الديسكورد عند كتابة أمر ": "Customize the ID card design shown in Discord when using the command ",
        "أو ": "or ",
        "تصميم أسود داكن كلاسيكي فخم": "Luxury Dark Classic Design",
        "توهج بنفسجي متدرج ملكي": "Royal Gradient Purple Glow",
        "بطاقة كبار الشخصيات بالذهب اللامع": "VIP Gold Card",
        "متجر خلفيات الملف الشخصي 🖼️": "Profile Background Shop 🖼️",
        "بطاقة نيون إلكترونية مستقبلية": "Futuristic Neon Electronic Card",
        "أعلى 100 عضو بواسطة نقاط الخبرة (XP Leaderboard) 🏆": "Top 100 Members by XP (XP Leaderboard) 🏆",
        "أغنى 100 عضو برصيد النجوم (Richest 100 Star) ⭐": "Top 100 Richest Members by Stars ⭐",
        "المكافأة اليومية (Daily Star Reward)": "Daily Star Reward",
        "احصل على ": "Get ",
        "إلى 1,000 نجوم (Stars)": "to 1,000 Stars",
        "مجاناً كل 24 ساعة!": "free every 24 hours!",
        "حافظ على سلسلة أيامك المتتالية لمضاعفة أرباحك.": "Keep your daily streak to multiply your rewards.",
        "مكافأة اليوم": "Today's Reward",
        "الوقت المتبقي بالضبط": "Exact time remaining",
        "تم استلام مكافأة اليوم! عد بعد انتهاء الوقت أعلاه": "Today's reward has been claimed! Come back when the time above expires",
        "رصيدك: ": "Balance: ",
        "شراء وتجهيز (5,000 ⭐)": "Buy & Equip (5,000 ⭐)",
        "شراء وتجهيز (7,500 ⭐)": "Buy & Equip (7,500 ⭐)",
        "شراء وتجهيز (12,000 ⭐)": "Buy & Equip (12,000 ⭐)",
        "شراء وتجهيز (6,000 ⭐)": "Buy & Equip (6,000 ⭐)",
        "شراء وتجهيز (9,000 ⭐)": "Buy & Equip (9,000 ⭐)",
        "شراء وتجهيز (15,000 ⭐)": "Buy & Equip (15,000 ⭐)",
        "شراء (10,000 ⭐)": "Buy (10,000 ⭐)",
        "شراء (15,000 ⭐)": "Buy (15,000 ⭐)",
        "شراء (8,000 ⭐)": "Buy (8,000 ⭐)",
        "شراء (6,000 ⭐)": "Buy (6,000 ⭐)",
        "شراء (7,000 ⭐)": "Buy (7,000 ⭐)",
        "شراء (12,000 ⭐)": "Buy (12,000 ⭐)",
        "شراء (9,000 ⭐)": "Buy (9,000 ⭐)",
        "شراء (5,000 ⭐)": "Buy (5,000 ⭐)",
        "تفعيل (3,000 ⭐)": "Activate (3,000 ⭐)",
        "تفعيل (4,500 ⭐)": "Activate (4,500 ⭐)",
        "تفعيل (8,000 ⭐)": "Activate (8,000 ⭐)",
        "تفعيل (6,000 ⭐)": "Activate (6,000 ⭐)",
        "شراء وتجهيز": "Buy & Equip",
        "شراء": "Buy",
        "استلام الرصيد 🎁": "Claim Balance 🎁",
        "فشل استلام الراتب اليومي": "Failed to claim daily reward",
        "🎉 تم استلام ": "🎉 Claimed ",
        " ذهب بنجاح! رصيدك الجديد: ": " Gold successfully! Your new balance: ",
        "جارٍ الاستلام...": "Claiming...",
        "جاري": "Processing",
        "جاري الفحص": "Checking",
        "لا توجد بيانات خبرة مسجلة بعد": "No XP data recorded yet",
        "لا توجد بيانات ذهب مسجلة بعد": "No Gold data recorded yet",
        "لا توجد بيانات نشاط حتى الآن": "No activity data yet",
        "مؤشرات تفاعل السيرفر": "Server Engagement Indicators",
        "الأعضاء المتصلون": "Online Members",
        "إجمالي القنوات": "Total Channels",
        "إجمالي الأعضاء": "Total Members",
        "إجمالي الرتب": "Total Roles",
        "الإيموجيات المخصصة": "Custom Emojis",
        "عدد البوتات": "Bot Count",
        "إجمالي القيف اوايز": "Total Giveaways",
        "تاريخ إنشاء السيرفر": "Server Creation Date",
        "رابط السيرفر المخصص": "Server Vanity URL",
        "مستوى التحقق": "Verification Level",
        "أكثر الأعضاء نشاطاً": "Top Active Members",
        "قنوات الإحصائيات": "Stat Channels",
        "القنوات النصية": "Text Channels",
        "القنوات الصوتية": "Voice Channels",
        "الرتب المسجلة": "Recorded Roles",
        "حفظ التفاصيل": "Save Details",
        "ABOUT ME": "ABOUT ME",


        "🎉 مبروك يا [user]! لقد وصلت إلى المستوى [level]! 🚀": "🎉 Congratulations [user]! You reached level [level]! 🚀",
        "كلمة1, كلمة2, كلمة3...": "word1, word2, word3...",
        "current (نفس الروم) أو ضع ID الروم...": "current (same channel) or enter the channel ID...",
        "📌 إثبات نفسك\\n\\nعشان تثبت نفسك، اضغط على الزر الموجود تحت الرسالة، وبكذا يتم تفعيلك وسترى جميع الرومات.": "📌 Verify Yourself\\n\\nTo verify yourself, click the button below the message to activate your account and see all channels.",
        "أو اكتب ID الروم الصوتي هنا...": "or enter the voice channel ID here...",
        "1. كم عمرك؟\\n2. ما هي خبراتك السابقة في الإدارة؟\\n3. كم ساعة تتواجد يومياً في الديسكورد؟": "1. How old are you?\\n2. What is your previous moderation experience?\\n3. How many hours are you active on Discord each day?",
        "مثال: @MrBeast أو رابط القناة": "Example: @MrBeast or channel link",
        "مثال: 🔔 نزل فيديو جديد على قناة {channel}! شاهد الآن: {url}": "Example: 🔔 A new video was posted on {channel}! Watch now: {url}",
        "ضع ID القناة...": "Enter the channel ID...",
        "مثال: نيترو / رتبة VIP...": "Example: Nitro / VIP role...",
        "مثال: 10m / 2h / 1d": "Example: 10m / 2h / 1d",
        "0 = لا يوجد شرط": "0 = no requirement",
        "⏳ جاري الاستلام...": "⏳ Claiming...",
        "تم استلام مكافأة اليوم! عد بعد انتهاء الوقت أعلاه": "Today's reward has been claimed! Come back when the time above expires",
        "إرسال اللوحة ➔": "Send Panel ➔",
        "➕ إضافة وتفعيل التنبيه الآن": "➕ Add & Enable Notification Now",
        "🟢 نشط": "🟢 Active",
        "⚪ منتهي": "⚪ Ended"

        "رصيد الذهب": "Gold Balance",
        "الترتيب": "Rank",
        "صلاحية إدارية": "Administrative Permission",
        "رصيدك:": "Your balance:",
        "متجر خلفيات البروفايل (Profile Backgrounds) 🖼️": "Profile Background Shop 🖼️",
        "خلفية النجوم والنيون الأرجواني": "Purple Neon Star Background",
        "سجل التحويلات والمكافآت": "Transaction & Rewards History",
        "آخر 5 معاملات الذهب": "Last 5 Gold Transactions",
        "خلفية الطبيعة والزمرد الفخم": "Luxury Nature & Emerald Background",
        "المبلغ": "Amount",
        "تاريخ": "Date",
        "خلفية اللهب والذهب الخالص": "Pure Flame & Gold Background",
        "المكافأة اليومية (Daily)": "Daily Reward",
        "خلفية الجليد والكريستال السماوي": "Sky Crystal Ice Background",
        "خلفية الساموراي القرمزي الفخم": "Luxury Crimson Samurai Background",
        "خلفية الإمبراطورية الملكية الذهبية": "Royal Golden Empire Background",
        "خصص تصميم بطاقة الهوية التي تظهر في الديسكورد عند كتابة أمر": "Customize the ID card design shown in Discord when using the command",
        "أو": "or",
        "🪙 الذهب": "🪙 Gold",
        "متجر شارات وأوسمة الملف الشخصي 🎖️": "Profile Badges & Awards Shop 🎖️",
        "استلام المكافأة اليومية الآن (+500 ⭐)": "Claim Daily Reward Now (+500 ⭐)",
        "المكافأة القادمة": "Next Reward",
        "ساعة": "Hour",
        "دقيقة": "Minute",
        "خلفيات بطاقة الهوية 🪪": "ID Card Backgrounds 🪪",
        "ثانية": "Second",
        "متاجر النجوم": "Star Shops",
        "أغنى الأثرياء برصيد الذهب 🪙": "Richest Members by Gold 🪙",
        "خلفيات البروفايل": "Profile Backgrounds",
        "شارات البروفايل": "Profile Badges",
        "خلفيات الهوية": "ID Backgrounds",
        "أعلى 100 بواسطة XP": "Top 100 by XP",
        "الراتب اليومي (Daily Reward)": "Daily Salary (Daily Reward)",
        "500 إلى 1,000 من الذهب": "500 to 1,000 Gold",
        "أغنى 100 بالنجوم": "Top 100 by Stars",
        "احصل على مكافأتك اليومية": "Claim Your Daily Reward",
        "استلام الراتب اليومي الآن (+500 🪙)": "Claim Daily Salary Now (+500 🪙)",
        "الراتب القادم": "Next Salary",
        "تم استلام راتب اليوم! عد بعد انتهاء الوقت أعلاه": "Today's salary has been claimed! Come back after the time above expires",
        "متجر القولد": "Gold Shop",
        "خلفيات الملف الشخصي": "Profile Backgrounds",
        "خلفيات بطاقة الهوية": "ID Card Backgrounds",
        "شارات وأوسمة": "Badges & Awards",
        "الخوادم": "Servers",
        "رسائل الإيمبد": "Embed Messages",
        "نشاط طاقم الإدارة": "Staff Activity",
        "إحصائيات وترتيب وإنجازات طاقم الإدارة وسجل إجراءاتهم": "Staff statistics, rankings, achievements, and action logs",
        "سجل الأحداث (Logs)": "Event Logs",
        "تتبع وتوثيق جميع تحركات وتغييرات السيرفر والرومات": "Track and document all server and channel activity and changes",
        "التسلية والألعاب": "Entertainment & Games",
        "روليت، مافيا، كراسي موسيقية، غميضة": "Roulette, Mafia, Musical Chairs, Hide & Seek",
        "الأوامر العامة": "General Commands",
        "رسائل شكر تلقائية للداعمين بالبوست": "Automatic thank-you messages for server boosters",
        "لوحات دعم فني مخصصة وترانسكريبت": "Custom support panels and transcripts",
        "نظام الرتب ونقاط الخبرة وبطاقات الرانك": "Ranks, XP, and Rank Cards System",
        "رومات مؤقتة": "Temporary Channels",
        "إنشاء قنوات صوتية خاصة تلقائياً": "Automatically create private voice channels",
        "التحقق & التفعيل": "Verification & Activation",
        "لوحة تفعيل الأعضاء بالأزرار التفاعلية": "Member activation panel with interactive buttons",
        "الاقتصاد والنجوم": "Economy & Stars",
        "البنك، الوظائف، تحويلات النجوم، والمكافآت": "Bank, jobs, star transfers, and rewards",
        "القرآن الكريم & الراديو": "Quran & Radio",
        "بث تلاوات وإذاعات القرآن الكريم 24/7 في الروم الصوتي": "Broadcast Quran recitations and radio 24/7 in the voice channel",
        "نظام التقديمات": "Applications System",
        "إنشاء وتخصيص استمارات التقديم مع لوحة أزرار تفاعلية ومراجعة الطلبات": "Create and customize application forms with an interactive button panel and review submissions",
        "مباشر 📊": "Live 📊",
        "الإحصائيات & التحليلات": "Statistics & Analytics",
        "تحليلات بيانية دقيقة لتفاعل الرسائل، دخول وخروج الأعضاء، والرومات الصوتية": "Detailed analytics for message engagement, member joins/leaves, and voice channels",
        "مجاني 👑": "Free 👑",
        "تخصيص الاسم المستعار، الأفاتار، البانر، وحالة ونوع النشاط مجاناً": "Customize the nickname, avatar, banner, status, and activity type for free",
        "الإعلانات 📢": "Announcements 📢",
        "جدولة إعلانات، تكرار تلقائي، عدة قنوات، Embed Designer": "Schedule announcements, automatic repeats, multiple channels, and Embed Designer",
        "قائمة الخصائص": "Feature List",
        "نظام اللفلات": "Leveling System",
        "ستاربورد": "Starboard",
        "تنبيهات السوشيال": "Social Alerts",
        "اللوق (Logs)": "Logs",
        "الحماية الخاصة (Anti-Nuke)": "Special Protection (Anti-Nuke)",
        "الإجراءات الآلية والعامة": "Automated & General Actions",
        "الإشراف والأمان": "Moderation & Security",
        "تسلية": "Entertainment",
        "بث": "Broadcast",
        "رسائل البوست (Server Boost Messages)": "Server Boost Messages",
        "اسم السيرفر": "Server Name",
        "رسائل المغادرة وتوديع الأعضاء (Leave / Goodbye) 👋": "Leave / Goodbye Messages 👋",
        "إرسال إشعار وتوديع في القناة عند خروج أي عضو من السيرفر": "Send a notification and goodbye message when a member leaves the server",
        "قناة المغادرة (Leave Channel)": "Leave Channel",
        "نص رسالة المغادرة": "Leave Message Text",
        "نظام التذاكر والدعم الفني المتقدم (Pro Tickets) 🎫": "Advanced Tickets & Support System (Pro Tickets) 🎫",
        "فتح وإدارة تذاكر الدعم الفني للأعضاء مع أقسام متعددة وأزرار سريعة وحفظ السجلات (Transcripts)": "Open and manage member support tickets with multiple sections, quick buttons, and transcripts",
        "الإعدادات الأساسية للرومات والرتب ⚙️": "Basic Channel & Role Settings ⚙️",
        "كاتيجوري التذاكر المفتوحة (Ticket Category)": "Open Ticket Category",
        "رتبة مسؤولي الدعم الفني (Support Role)": "Support Staff Role",
        "قناة حفظ السجلات والترانسكريبت (Ticket Log Channel)": "Ticket Log / Transcript Channel",
        "الحد الأقصى للتذاكر المفتوحة للعضو الواحد": "Maximum Open Tickets Per Member",
        "رسالة الترحيب داخل التذكرة الجديدة 📩": "New Ticket Welcome Message 📩",
        "🚀 إرسال فوري": "🚀 Send Instantly",
        "إنشاء وإرسال لوحة التذاكر التفاعلية إلى الديسكورد 🔘": "Create and send the interactive ticket panel to Discord 🔘",
        "قم بتحديد روم الدعم الفني بالأسفل واضغط زر الإرسال لينشر البوت لوحة التذاكر التفاعلية بالأزرار فوراً في السيرفر:": "Select the support channel below and click send to publish the interactive ticket panel with buttons immediately in the server:",
        "روم إرسال اللوحة (Channel)": "Panel Channel",
        "عنوان لوحة التذاكر": "Ticket Panel Title",
        "وصف لوحة التذاكر": "Ticket Panel Description",
        "نظام المستويات واللفلات التفاعلي (Leveling & XP) 📈": "Interactive Leveling & XP System 📈",
        "منح نقاط خبرة XP للأعضاء عند التفاعل في الشات وإرسال إشعارات الترقية وبطاقات الرانك": "Award XP to members when they interact in chat and send level-up notifications and rank cards",
        "نص رسالة الترقية (Level Up Message) 🎉": "Level Up Message 🎉",
        "منع الحروف الكبيرة (Anti-Caps)": "Anti-Caps",
        "منع سبام الإيموجي (Anti-Emoji)": "Anti-Emoji Spam",
        "فلتر الكلمات المسيئة (Bad Words)": "Bad Words Filter",
        "منع تكرار الأسطر الطويلة": "Prevent Repeated Long Lines",
        "قائمة الكلمات المحظورة (افصل بينها بفاصلة)": "Banned Words List (separate with commas)",
        "تفعيل الرومات الصوتية المؤقتة": "Enable Temporary Voice Channels",
        "إنشاء روم صوتي خاص تلقائياً عند دخول القناة الرئيسية": "Automatically create a private voice channel when joining the main channel",
        "إعدادات الخبرة XP والإعلانات ⚙️": "XP & Announcement Settings ⚙️",
        "قناة الإنشاء الرئيسية (Join to Create Voice)": "Main Creation Channel (Join to Create Voice)",
        "مضاعف نقاط الـ XP (XP Multiplier)": "XP Multiplier",
        "كاتيجوري الرومات المؤقتة (Category)": "Temporary Channel Category",
        "قناة إرسال رسائل الترقية (Level Up Channel)": "Level Up Channel",
        "اكتب": "Type",
        "للإرسال بنفس الروم، أو": "to send in the same channel, or",
        "للخاص، أو": "for DM, or",
        "لتعطيل الرسائل، أو ID روم مخصص.": "to disable messages, or a custom channel ID.",
        "المدة": "Duration",
        "7 أيام": "7 days",
        "24 ساعة": "24 hours",
        "14 يوم": "14 days",
        "30 يوم": "30 days",
        "يوفر إحصاءات وتحليلات تفصيلية عن نشاط السيرفر بما في ذلك تفاعل الأعضاء، الرسائل، والمزيد من المقاييس.": "Provides detailed statistics and analytics about server activity, including member engagement, messages, and more metrics.",
        "👤 أعضاء السيرفر": "👤 Server Members",
        "البوتات المساعدة": "Helper Bots",
        "🤖 حسابات بوتات": "🤖 Bot Accounts",
        "القنوات والرومات": "Channels",
        "💬 صوتية وكتابية": "💬 Voice & Text",
        "دخول/خروج": "Joins/Leaves",
        "المتصلين بالرومات الصوتية": "Members in Voice Channels",
        "⚙️ الاستثناءات (Exemptions)": "⚙️ Exemptions",
        "تخطي الرومات (Ignored Channels)": "Ignored Channels",
        "تخطي الرولات (Ignored Roles)": "Ignored Roles",
        "رومات صور فقط (Images Only Channels)": "Images Only Channels",
        "رومات يوتيوب فقط (YouTube Only)": "YouTube Only Channels",
        "📝 قائمة الكلمات المحظورة": "📝 Banned Words List",
        "أضف الكلمات المحظورة مفصولة بفواصل. البوت سيقوم بحذف الرسائل التي تحتوي عليها تلقائياً.": "Add banned words separated by commas. The bot will automatically delete messages containing them.",
        "⚡ الإجراء عند المخالفة (Action on Violation)": "⚡ Action on Violation",
        "12 أمراً متاحاً": "12 commands available",
        "أوامر التفاعل والمعلومات والخدمات المتاحة لجميع أعضاء السيرفر": "Interaction, information, and utility commands available to all server members",
        "قائمة الأوامر الخدمية والعامة": "General & Utility Commands List",
        "قائمة المساعدة التفاعلية المنسدلة لجميع الأوامر": "Interactive dropdown help list for all commands",
        "بطاقة البروفايل التفاعلية مع الرصيد والمستوى والسمعة": "Interactive profile card with balance, level, and reputation",
        "عرض وتحميل الصورة الرمزية للعضو أو السيرفر": "View and download the member or server avatar",
        "عرض بنر الملف الشخصي أو بنر السيرفر بجودة عالية": "View the profile or server banner in high quality",
        "عرض معلومات السيرفر والأونر وتاريخ الإنشاء والإحصائيات": "View server information, owner, creation date, and statistics",
        "عرض بطاقة معلومات العضو ورتبه وتاريخ الانضمام": "View member information, roles, and join date",
        "فحص سرعة استجابة البوت وسيرفرات ديسكورد": "Check bot response speed and Discord servers",
        "حاسبة ضريبة بروبوت والتحويلات الذكية": "ProBot tax calculator and smart transfers",
        "استعراض رصيد النجوم والسمعة وإعطاء النجوم للأعضاء": "View star and reputation balances and give stars to members",
        "عرض قائمة جميع رتب السيرفر وأعداد أعضائها": "View all server roles and their member counts",
        "إحصائيات القنوات الصوتية والنصية والكاتيجوري": "Voice, text, and category channel statistics",
        "استعراض وإحصاء جميع إيموجيات وستيكرات السيرفر": "Browse and count all server emojis and stickers",
        "إنشاء وإدارة مسابقات الجيف أواي وتحديد الفائزين": "Create and manage giveaways and select winners",
        "إنشاء استطلاعات وتصويت تفاعلي للأعضاء": "Create polls and interactive member voting",
        "الاستماع لآيات وسور القرآن الكريم والتفاسير": "Listen to Quran verses, chapters, and tafsir",
        "تشغيل إذاعة القرآن الكريم على مدار الساعة": "Run Quran radio 24/7",
        "برفكس الأوامر (Prefix)": "Command Prefix",
        "قناة سجلات الإشراف (Moderation Logs)": "Moderation Logs Channel",
        "أوامر الإشراف المتاحة 🔨": "Available Moderation Commands 🔨",
        "حظر الأعضاء المؤقت والنهائي مع إرسال رسالة خاصة قبل الحظر": "Temporarily or permanently ban members with a DM before the ban",
        "رفع الحظر عن عضو محظور مع البحث باليوزرنيم": "Unban a member and search by username",
        "طرد الأعضاء المخالفين مع إرسال رسالة خاصة قبل الطرد": "Kick violating members with a DM before the kick",
        "نظام تحذيرات متقدم مع عقوبات تلقائية تراكمية": "Advanced warning system with cumulative automatic punishments",
        "تايم اوت مؤقت وكتم صوتي وكتابي برسالة خاصة": "Temporary timeout and voice/text mute with a DM",
        "مسح الرسائل مع فلاتر (بوتات، صور، روابط)": "Delete messages with filters (bots, images, links)",
        "قفل وفتح القنوات للسيرفر بالكامل أو قناة معينة": "Lock and unlock channels for the whole server or a specific channel",
        "إعطاء وسحب الرتب المؤقتة والدائمة حتى 5 أعضاء": "Give and remove temporary or permanent roles for up to 5 members",
        "رسالة لوحة التحقق (Verification Message) 📌": "Verification Panel Message 📌",
        "🚀 نشر مباشر": "🚀 Publish Instantly",
        "إرسال لوحة التحقق التفاعلية إلى الديسكورد 🔘": "Send the interactive verification panel to Discord 🔘",
        "اضغط الزر بالأسفل ليقوم البوت بنشر رسالة التحقق مع الزر التفاعلي فوراً في الروم المحدد أعلاه، وعندما يضغط العضو على الزر سيحصل على الرتبة مباشرة:": "Click the button below to publish the verification message with the interactive button in the selected channel. When a member clicks it, they will receive the role immediately:",
        "-- اختر من قائمة الرومات --": "-- Select from channel list --",
        "✕ إلغاء": "✕ Cancel",
        "✨ إضافة استمارة تقديم جديدة": "✨ Add New Application Form",
        "وصف التقديم (اختياري)": "Application Description (Optional)",
        "روم استلام الطلبات (Log Channel)": "Application Log Channel",
        "الرتبة الممنوحة عند القبول (Accepted Role)": "Role Granted on Acceptance",
        "أسئلة الاستمارة (سؤال في كل سطر - حتى 5 أسئلة)": "Form Questions (one question per line - up to 5 questions)",
        "1. كم عمرك؟&#10;2. ما هي خبراتك السابقة في الإدارة؟&#10;3. كم ساعة تتواجد يومياً في الديسكورد؟": "1. How old are you?&#10;2. What is your previous moderation experience?&#10;3. How many hours are you active on Discord each day?",
        "💾 حفظ الاستمارة": "💾 Save Form",
        "عرض التقديمات قيد الانتظار": "View Pending Applications",
        "عرض نقاط التقديمات الخاصة بك أو الخاصة بعضو آخر": "View your application points or another member's",
        "إعادة تعيين نقاط التقديمات لسيرفر أو لعضو": "Reset application points for a server or member",
        "تعيين نقاط التقديمات لعضو": "Set application points for a member",
        "منشئ الرسالة الواحدة": "Single Message Creator",
        "أنشئ وأرسل رسالة واحدة تتضمن جميع التقديمات لسهولة عرضها.": "Create and send one message containing all applications for easy viewing.",
        "يرجى الضغط على الزر أدناه أو اختيار الاستمارة المناسبة للتقديم:": "Please click the button below or select the appropriate form to apply:",
        "نوع العرض:": "Display Type:",
        "ضغطة زر": "Button Click",
        "قائمة الاختيار": "Select Menu",
        "القناة المستهدفة لنشر اللوحة:": "Target Channel for Panel",
        "يعرض ويخصص ملف تعريف البوت، بما في ذلك المعلومات مثل الحالة والصورة الرمزية والتفاصيل المخصصة الأخرى.": "View and customize the bot profile, including status, avatar, and other custom details.",
        "✨ ميزة مجانية للجميع": "✨ Free Feature for Everyone",
        "حفظ": "Save",
        "المنصة المستهدفة": "Target Platform",
        "📺 YouTube (قناة يوتيوب)": "📺 YouTube (YouTube Channel)",
        "🔴 Twitch (ستريمر تويتش)": "🔴 Twitch (Twitch Streamer)",
        "🎵 TikTok (حساب تيك توك)": "🎵 TikTok (TikTok Account)",
        "اسم الحساب / الرابط / ID القناة": "Account Name / Link / Channel ID",
        "روم إرسال التنبيهات": "Notification Channel",
        "-- اختر الروم --": "-- Select Channel --",
        "الرتبة المراد منشنها (اختياري)": "Role to Mention (Optional)",
        "بدون منشن": "No Mention",
        "رسالة التنبيه المخصصة (اختياري)": "Custom Notification Message (Optional)",
        "المتغيرات المتاحة: {channel} (اسم القناة) ، {title} (عنوان الفيديو/البث) ، {url} (الرابط)": "Available variables: {channel} (channel name), {title} (video/stream title), {url} (URL)",
        "قناة السجلات (Log Channel ID)": "Log Channel ID",
        "نظام تنبيهات السوشيال ميديا 📺": "Social Media Alerts System 📺",
        "إرسال إشعارات فورية وتلقائية عند نشر فيديو جديد أو بدء بث مباشر": "Send instant automatic notifications when a new video is posted or a live stream starts",
        "القنوات والحسابات النشطة 📋": "Active Channels & Accounts 📋",
        "🗑️ حذف": "🗑️ Delete",
        "لا توجد أي إعلانات مجدولة أو متكررة حالياً": "No scheduled or recurring announcements",
        "إضافة ✅": "Add ✅",
        "🎁 إنشاء سحب قيف أواي جديد": "🎁 Create New Giveaway",
        "القناة": "Channel",
        "الجائزة 🎁": "Prize 🎁",
        "عدد الفائزين 🏆": "Number of Winners 🏆",
        "⚙️ شروط ومميزات متقدمة (اختياري)": "⚙️ Advanced Requirements & Features (Optional)",
        "🛡️ رتبة إجبارية للاشتراك": "🛡️ Required Role to Enter",
        "لا يوجد شرط رتبة": "No Role Requirement",
        "🔥 رتبة الفرصة المضاعفة (x2)": "🔥 Double Chance Role (x2)",
        "⭐ أدنى مستوى مطلوب (Levels)": "⭐ Minimum Required Level (Levels)",
        "📅 الحد الأدنى لعمر الحساب (بالأيام)": "📅 Minimum Account Age (days)",

        "لا توجد بيانات مستخدمين مسجلة بعد": "No user data recorded yet",
        "لا توجد بيانات نجوم مسجلة بعد": "No star data recorded yet",
        "لوحة التحكم | ZENO": "Dashboard | ZENO",
        "تتبع دعوات الأعضاء، من جاب مين، الليدربورد، ومكافأة الداعي": "Track member invites, who invited whom, leaderboards, and inviter rewards",
        "سحوبات متقدمة: شروط رول/مستوى، فرصة مضاعفة، Reroll، إشعار DM": "Advanced giveaways: role/level requirements, double chance, reroll, and DM notifications",
        "📌 إثبات نفسك&#10;&#10;عشان تثبت نفسك، اضغط على الزر الموجود تحت الرسالة، وبكذا يتم تفعيلك وسترى جميع الرومات.": "📌 Verify Yourself&#10;&#10;To verify yourself, click the button below the message to activate your account and see all channels.",
        "لا توجد سحوبات نشطة حالياً": "No active giveaways",
        "لا توجد سحوبات منتهية": "No ended giveaways",

        "500 إلى 1,000 نجوم (Stars)": "500 to 1,000 Stars",
        "شراء (10,000 🪙)": "Buy (10,000 🪙)",
        "شراء (15,000 🪙)": "Buy (15,000 🪙)",
        "شراء (8,000 🪙)": "Buy (8,000 🪙)",
        "شراء (7,000 🪙)": "Buy (7,000 🪙)",
        "تفعيل (3,000 🪙)": "Activate (3,000 🪙)",
        "تفعيل (4,500 🪙)": "Activate (4,500 🪙)",

    };

    // ---- Reverse dictionary (English -> Arabic) so we can toggle back ----
    const reverseDictionary = {};
    for (const ar in dictionary) {
        if (Object.prototype.hasOwnProperty.call(dictionary, ar)) {
            reverseDictionary[dictionary[ar]] = ar;
        }
    }

    // Match the storage keys already used by the landing page's inline
    // toggleZenoLang() script, so language stays in sync across the whole
    // site (landing page + every dashboard page) instead of each page
    // keeping its own separate preference.
    const STORAGE_KEYS = ["zeno_dashboard_lang", "zeno_lang"];
    const COOKIE_NAME = "zeno_dashboard_lang";
    const ATTRS_TO_TRANSLATE = ["placeholder", "title", "aria-label", "value"];
    // Only translate `value` for these input types (buttons/submits), never text inputs
    const VALUE_TRANSLATABLE_TYPES = ["button", "submit", "reset"];

    /**
     * Look up a translation for a given piece of text in the target language.
     * Falls back to the original text if nothing matches (unknown strings are
     * left untouched instead of breaking the UI).
     */
    // Build phrase lists once so compound HTML/text nodes are translated too.
    // Exact-match-only translation leaves Arabic fragments visible inside strings
    // that contain counters, icons, variables, or multiple labels.
    // Fallback word-level dictionary for legacy/server-rendered UI strings that are not
    // exact dictionary matches. This prevents Arabic fragments from remaining when English
    // is selected, including dynamically generated labels and mixed HTML text.
    const fallbackWords = {
        "لوحة": "Panel", "التحكم": "Control", "الرئيسية": "Home", "العودة": "Back",
        "السيرفر": "Server", "السيرفرات": "Servers", "سيرفر": "Server", "سيرفرات": "Servers",
        "عضو": "Member", "الأعضاء": "Members", "عضوًا": "members", "المستخدم": "User",
        "المستخدمين": "Users", "الرتبة": "Role", "الرتب": "Roles", "قناة": "Channel",
        "القنوات": "Channels", "روم": "Channel", "الرومات": "Channels", "رسالة": "Message",
        "الرسائل": "Messages", "الإعدادات": "Settings", "إعدادات": "Settings",
        "نظام": "System", "أنظمة": "Systems", "حماية": "Protection", "الحماية": "Protection",
        "أمان": "Security", "الأمان": "Security", "إشراف": "Moderation", "الإشراف": "Moderation",
        "إدارة": "Management", "الإداريين": "Staff", "المشرف": "Moderator", "المشرفين": "Moderators",
        "المميزات": "Features", "الميزات": "Features", "ميزة": "Feature", "ميزات": "Features",
        "الأوامر": "Commands", "أمر": "Command", "الأمر": "Command", "الأوامر": "Commands",
        "الكل": "All", "جميع": "All", "كل": "All", "بعض": "Some", "المجموع": "Total",
        "إجمالي": "Total", "عدد": "Count", "مستوى": "Level", "المستوى": "Level", "مستويات": "Levels",
        "الخبرة": "Experience", "الخبرة": "XP", "نقاط": "Points", "نقطة": "Point",
        "ذهب": "Gold", "الذهب": "Gold", "الرصيد": "Balance", "المبلغ": "Amount",
        "اليوم": "Today", "يوم": "Day", "ساعة": "hour", "ساعات": "hours", "دقيقة": "minute",
        "دقائق": "minutes", "ثانية": "second", "ثواني": "seconds", "الآن": "Now",
        "حالياً": "Currently", "مفعل": "Enabled", "مفعّل": "Enabled", "معطل": "Disabled",
        "معطّل": "Disabled", "تفعيل": "Enable", "تعطيل": "Disable", "إضافة": "Add",
        "أضف": "Add", "حذف": "Delete", "مسح": "Clear", "تعديل": "Edit", "حفظ": "Save",
        "تطبيق": "Apply", "إلغاء": "Cancel", "تأكيد": "Confirm", "تراجع": "Undo",
        "إرسال": "Send", "رفع": "Upload", "إزالة": "Remove", "اختيار": "Select",
        "اختر": "Select", "ابحث": "Search", "بحث": "Search", "تفاصيل": "Details",
        "معلومات": "Information", "بيانات": "Data", "إحصائيات": "Statistics", "سجل": "Log",
        "السجلات": "Logs", "سجلات": "Logs", "حدث": "Event", "أحداث": "Events",
        "دعوة": "Invite", "دعوات": "Invites", "البوست": "Boost", "البوستات": "Boosts",
        "المشاركين": "Participants", "مشارك": "Participant", "الفائزين": "Winners", "الفائز": "Winner",
        "الجائزة": "Prize", "الوصف": "Description", "المدة": "Duration", "الحالة": "Status",
        "نشط": "Active", "نشطة": "Active", "منتهي": "Ended", "منتهية": "Ended",
        "مفتوحة": "Open", "مفتوحة": "Open", "مغلقة": "Closed", "مغلق": "Closed",
        "مراجعة": "Review", "المراجعة": "Review", "مقبول": "Accepted", "مقبولة": "Accepted",
        "مرفوض": "Rejected", "مرفوضة": "Rejected", "تنفيذ": "Execute", "قبول": "Accept", "رفض": "Reject",
        "الترحيب": "Welcome", "ترحيب": "Welcome", "المغادرة": "Leave", "مغادرة": "Leave",
        "تذكرة": "Ticket", "التذاكر": "Tickets", "تذاكر": "Tickets", "دعم": "Support",
        "الدعم": "Support", "الرد": "Response", "ردود": "Responses", "رد": "Reply",
        "كلمة": "Word", "كلمات": "Words", "عبارة": "Phrase", "عبارات": "Phrases",
        "مسموح": "Allowed", "مسموحة": "Allowed", "مستثنى": "Exempt", "مستثناة": "Exempt",
        "المستثناة": "Excluded", "تحتوي": "Contains", "يحتوي": "Contains", "يبدأ": "Starts",
        "ينتهي": "Ends", "مطابقة": "Match", "تامة": "Exact", "جزئي": "Partial",
        "أعضاء": "Members", "عضو": "Member", "بشر": "Humans", "بوت": "Bot", "البوت": "Bot",
        "البوتات": "Bots", "الحسابات": "Accounts", "حساب": "Account", "جديد": "New",
        "جديدة": "New", "قديم": "Old", "الوهمية": "Fake", "الوهمي": "Fake",
        "العقوبات": "Punishments", "عقوبة": "Punishment", "تحذير": "Warning", "تحذيرات": "Warnings",
        "حظر": "Ban", "محظور": "Banned", "طرد": "Kick", "كتم": "Mute", "عزل": "Timeout",
        "سجن": "Jail", "قفل": "Lock", "فتح": "Unlock", "إخفاء": "Hide", "إظهار": "Show",
        "الصوت": "Voice", "صوت": "Voice", "النصية": "Text", "الكتابية": "Text",
        "كتابي": "Text", "كتابية": "Text", "صوتية": "Voice", "صوتي": "Voice",
        "الألوان": "Colors", "لون": "Color", "صورة": "Image", "صور": "Images", "خلفية": "Wallpaper",
        "الخلفية": "Background", "بنر": "Banner", "اسم": "Name", "عنوان": "Title",
        "المظهر": "Appearance", "مظهر": "Appearance", "التخصيص": "Customization", "تخصيص": "Customize",
        "الملف": "Profile", "الشخصي": "Personal", "بطاقة": "Card", "بطاقات": "Cards",
        "الهوية": "Identity", "التصنيف": "Rank", "ترتيب": "Rank", "ترتيبك": "Your rank",
        "الأخيرة": "Recent", "عام": "General", "أخرى": "Other", "القسم": "Section", "الأقسام": "Categories",
        "الفئة": "Category", "الفئات": "Categories", "اختصارات": "Aliases", "اختصار": "Alias",
        "الرئيسي": "Main", "الرئيسية": "Main", "افتراضي": "Default", "مخصص": "Custom",
        "مخصصة": "Custom", "مخصصة": "Custom", "متاح": "Available", "متاحة": "Available",
        "غير": "Not", "لا": "No", "يوجد": "Exists", "توجد": "There are", "لايوجد": "None",
        "بنجاح": "successfully", "بنجاح!": "successfully!", "فشل": "Failed", "خطأ": "Error",
        "حدث": "Occurred", "يرجى": "Please", "فضلاً": "Please", "تأكد": "Make sure",
        "هل": "Are", "متأكد": "sure", "رغبتك": "you want", "من": "from", "في": "in",
        "هذا": "this", "هذه": "this", "ذلك": "that", "يمكن": "can", "يمكنك": "You can",
        "يجب": "must", "سيتم": "will be", "يتم": "is", "عند": "when", "بعد": "after",
        "قبل": "before", "فقط": "only", "أي": "any", "مع": "with", "بدون": "without",
        "لـ": "for", "على": "on", "إلى": "to", "منه": "from it", "داخل": "inside",
        "أعلى": "Top", "أسفل": "Bottom", "يمين": "Right", "يسار": "Left",
        "الرئيسية": "Main", "المتقدم": "Advanced", "متقدم": "Advanced", "شامل": "Comprehensive",
        "شاملة": "Comprehensive", "دقيق": "Detailed", "دقيقة": "Detailed", "سريع": "Fast",
        "متطورة": "Advanced", "احترافي": "Professional", "احترافية": "Professional",
        "آلي": "Automatic", "تلقائي": "Automatic", "تلقائية": "Automatic", "مباشر": "Live",
        "لحظياً": "in real time", "فوراً": "immediately", "مباشرة": "directly",
        "المتصلون": "Online", "المتاحة": "Available", "المتواجدين": "Present", "الصلاحيات": "Permissions",
        "صلاحيات": "Permissions", "صلاحية": "Permission", "الأونر": "Owner", "المالك": "Owner",
        "المالكين": "Owners", "المعرف": "ID", "معرف": "ID", "أيدي": "IDs", "منشن": "Mention",
        "تغيير": "Change", "تحديث": "Update", "إنشاء": "Create", "توليد": "Generate",
        "استعادة": "Restore", "إعادة": "Reset", "ضبط": "Set", "حفظ": "Save",
        "استلام": "Claim", "مكافأة": "Reward", "المكافأة": "Reward", "راتب": "Salary",
        "التصويت": "Voting", "صوّت": "Vote", "المتصدّرين": "Leaderboards", "المتصدرين": "Leaderboards",
        "المتصدّر": "Leaderboard", "الأغنى": "Richest", "نشاط": "Activity", "النشاط": "Activity",
        "المستوى": "Level", "المستويات": "Levels", "الاقتصاد": "Economy", "المتجر": "Shop",
        "الخادم": "Server", "الخوادم": "Servers", "البرودكاست": "Broadcast", "الإعلانات": "Announcements",
        "الإعلان": "Announcement", "الاقتراحات": "Suggestions", "اقتراح": "Suggestion", "الشكاوي": "Complaints",
        "شكوى": "Complaint", "التقديمات": "Applications", "تقديم": "Application", "التطبيق": "Application",
        "المسابقة": "Giveaway", "مسابقة": "Giveaway", "القيف": "Giveaway", "اواي": "Giveaway",
        "الاستثناءات": "Exceptions",
        "الإيموجيات": "Emojis",
        "التحليلات": "Analytics",
        "الصلاحيات": "Permissions",
        "الاستخدام": "Usage",
        "الإعلانات": "Announcements",
        "المستخدمين": "Users",
        "الاحتياطية": "Backups",
        "المغادرين": "Leaving Members",
        "الإجراءات": "Actions",
        "الافتراضية": "Default",
        "الستيكرات": "Stickers",
        "المتحدثين": "Speakers",
        "الاستجابة": "Response",
        "التلقائية": "Automatic",
        "المشاركون": "Participants",
        "الموثوقين": "Trusted",
        "التفاعلية": "Interactive",
        "التغييرات": "Changes",
        "المكتومين": "Muted Members",
        "المتطلبات": "Requirements",
        "المستخدمة": "Used",
        "التفاصيل": "Details",
        "التكاملات": "Integrations",
        "التفصيلية": "Detailed",
        "الاصطناعي": "Artificial",
        "الأونلاين": "Online",
        "العمليات": "Operations",
        "الديسكورد": "Discord",
        "البيانات": "Data",
        "الداخلية": "Internal",
        "المسجلين": "Registered",
        "التفعيل": "Activation",
        "الانتشار": "Growth",
        "الإدارية": "Administrative",
        "التفاعل": "Engagement",
        "المتكررة": "Repeated",
        "المكافآت": "Rewards",
        "المنشنات": "Mentions",
        "السبويلر": "Spoilers",
        "الفيضان": "Flooding",
        "تلقائياً": "Automatically",
        "المحظورة": "Banned",
        "الأدمنية": "Admin",
        "الحقيقية": "Real",
        "الوهمية": "Fake",
        "الانتقال": "Navigation",
        "الاحتيال": "Fraud",
        "المعاينة": "Preview",
        "المدعومة": "Supported",
        "المطابقة": "Matching",
        "الحساسية": "Sensitivity",
        "الانتظار": "Waiting",
        "المسموحة": "Allowed",
        "تفاعلية": "Interactive",
        "المفتوحة": "Open",
        "الارتفاع": "Increase",
        "الانضمام": "Join",
        "الممنوحة": "Granted",
        "الاحتفاظ": "Retention",
        "المنتهية": "Expired",
        "المطلوبة": "Required",
        "المشاركة": "Participation",
        "المرفوضة": "Rejected",
        "المقبولة": "Accepted",
        "اقتراحات": "Suggestions",
        "بالتفصيل": "In Detail",
        "المشبوهة": "Suspicious",
        "البوسترز": "Boosters",
        "الفانيتي": "Vanity",
        "الممنوعة": "Forbidden",
        "برودكاست": "Broadcast",
        "رياكشنات": "Reactions",
        "مرحباً بك in Panel تحكم ZENO Bot!": "Welcome to the ZENO Bot Control Panel!",
        "مرحباً بك في لوحة تحكم ZENO Bot!": "Welcome to the ZENO Bot Control Panel!",
        "المحاولة": "Attempt",
    };

    const translationPairs = {
        en: Object.entries(dictionary).sort((a, b) => b[0].length - a[0].length),
        ar: Object.entries(reverseDictionary).sort((a, b) => b[0].length - a[0].length)
    };

    // English fallback vocabulary for legacy UI strings authored directly in English.
    // This keeps Arabic mode complete too, including tiny labels such as ABOUT ME.
    const englishFallbackWords = {
        "about": "عن", "me": "أنا", "home": "الرئيسية", "dashboard": "لوحة التحكم", "panel": "لوحة", "control": "تحكم",
        "settings": "الإعدادات", "setting": "إعداد", "server": "السيرفر", "servers": "السيرفرات", "member": "عضو", "members": "الأعضاء",
        "user": "مستخدم", "users": "المستخدمون", "role": "رتبة", "roles": "الرتب", "channel": "قناة", "channels": "القنوات",
        "message": "رسالة", "messages": "الرسائل", "name": "الاسم", "title": "العنوان", "description": "الوصف", "status": "الحالة",
        "actions": "الإجراءات", "action": "إجراء", "save": "حفظ", "saved": "تم الحفظ", "cancel": "إلغاء", "delete": "حذف", "edit": "تعديل",
        "create": "إنشاء", "add": "إضافة", "remove": "إزالة", "enable": "تفعيل", "enabled": "مفعّل", "disable": "تعطيل", "disabled": "معطّل",
        "apply": "تطبيق", "reset": "إعادة ضبط", "confirm": "تأكيد", "close": "إغلاق", "open": "فتح", "search": "بحث", "select": "اختيار",
        "choose": "اختر", "loading": "جارٍ التحميل", "success": "نجاح", "error": "خطأ", "warning": "تحذير", "information": "معلومات",
        "details": "التفاصيل", "general": "عام", "overview": "نظرة عامة", "profile": "الملف الشخصي", "identity": "الهوية", "rank": "الترتيب",
        "level": "المستوى", "levels": "المستويات", "experience": "الخبرة", "gold": "الذهب", "balance": "الرصيد", "daily": "اليومي", "reward": "المكافأة",
        "rewards": "المكافآت", "shop": "المتجر", "logout": "تسجيل الخروج", "login": "تسجيل الدخول", "support": "الدعم الفني", "features": "المميزات",
        "systems": "الأنظمة", "security": "الأمان", "protection": "الحماية", "moderation": "الإشراف", "commands": "الأوامر", "command": "الأمر",
        "logs": "السجلات", "log": "السجل", "analytics": "التحليلات", "stats": "الإحصائيات", "statistics": "الإحصائيات", "online": "متصل",
        "offline": "غير متصل", "active": "نشط", "inactive": "غير نشط", "total": "الإجمالي", "count": "العدد", "none": "لا يوجد", "new": "جديد",
        "recent": "الأخيرة", "other": "أخرى", "all": "الكل", "yes": "نعم", "no": "لا", "welcome": "الترحيب", "leave": "المغادرة",
        "tickets": "التذاكر", "ticket": "تذكرة", "giveaways": "القيف أواي", "suggestions": "الاقتراحات", "applications": "التقديمات", "appearance": "المظهر",
        "customization": "التخصيص", "custom": "مخصص", "default": "افتراضي", "advanced": "متقدم", "basic": "أساسي", "professional": "احترافي",
        "automatic": "تلقائي", "automations": "الأتمتة", "broadcast": "الإعلانات", "invite": "دعوة", "invites": "الدعوات", "boost": "بوست", "boosts": "البوستات",
        "emojis": "الإيموجيات", "stickers": "الستيكرات", "voice": "الصوت", "text": "النص", "color": "اللون", "colors": "الألوان", "image": "الصورة",
        "images": "الصور", "wallpaper": "الخلفية", "wallpapers": "الخلفيات", "banner": "البنر", "bot": "البوت", "bots": "البوتات", "owner": "المالك",
        "admin": "الإداري", "moderator": "المشرف", "permissions": "الصلاحيات", "permission": "الصلاحية", "data": "البيانات", "usage": "الاستخدام",
        "view": "عرض", "view all": "عرض الكل", "back": "رجوع", "next": "التالي", "previous": "السابق", "submit": "إرسال", "send": "إرسال",
        "upload": "رفع", "download": "تحميل", "about me": "عنّي", "switch to english": "التبديل إلى الإنجليزية", "switch to arabic": "التبديل إلى العربية",
        "manage server": "إدارة السيرفر", "server overview": "نظرة عامة على السيرفر", "server settings": "إعدادات السيرفر", "quick actions": "الإجراءات السريعة",
        "no results": "لا توجد نتائج", "no data": "لا توجد بيانات"
    };

    function translateEnglishFallback(text) {
        const trimmed = text.trim();
        if (!trimmed) return text;
        const exact = englishFallbackWords[trimmed.toLowerCase()];
        if (exact) {
            const leading = text.slice(0, text.length - text.trimStart().length);
            const trailing = text.slice(text.trimEnd().length);
            return leading + exact + trailing;
        }
        return text.replace(/[A-Za-z]+(?:['-][A-Za-z]+)*/g, function (word) {
            return englishFallbackWords[word.toLowerCase()] || word;
        });
    }

    function translateText(text, targetLang) {
        if (!text || !text.trim()) return text;

        const trimmed = text.trim();
        const leading = text.slice(0, text.length - text.trimStart().length);
        const trailing = text.slice(text.trimEnd().length);
        const map = targetLang === "en" ? dictionary : reverseDictionary;

        // Exact match first.
        if (Object.prototype.hasOwnProperty.call(map, trimmed)) {
            return leading + map[trimmed] + trailing;
        }

        // Then translate known phrases embedded in compound strings.
        // Longest phrases are replaced first to avoid partial matches.
        let result = text;
        for (const [source, target] of (translationPairs[targetLang] || [])) {
            if (!source || source === target || !result.includes(source)) continue;
            result = result.split(source).join(target);
        }

        // Final fallback in both directions. This catches tiny labels and legacy
        // mixed-language strings that were not explicitly added to the main dictionary.
        if (targetLang === "en" && /[\u0600-\u06FF]/.test(result)) {
            result = result.replace(/[\u0600-\u06FF]+/g, function (word) {
                return translateFallbackWord(word);
            });
        } else if (targetLang === "ar" && /[A-Za-z]/.test(result)) {
            result = translateEnglishFallback(result);
        }

        return result;
    }

    function translateFallbackWord(word) {
        if (fallbackWords[word]) return fallbackWords[word];
        const candidates = [word];
        if (word.indexOf("وال") === 0) candidates.push(word.slice(1), word.slice(2));
        if (word.indexOf("بال") === 0) candidates.push(word.slice(1), word.slice(2));
        if (word.indexOf("لل") === 0) candidates.push(word.slice(1), word.slice(2));
        if (word.indexOf("و") === 0) candidates.push(word.slice(1));
        if (word.indexOf("ب") === 0) candidates.push(word.slice(1));
        if (word.indexOf("ل") === 0) candidates.push(word.slice(1));
        if (word.indexOf("ال") === 0) candidates.push(word.slice(2));
        for (const candidate of candidates) {
            if (fallbackWords[candidate]) return fallbackWords[candidate];
        }
        return word;
    }

    /**
     * Walk every text node under `root` and translate it in place.
     * Skips <script> and <style> content.
     */
    function translateTextNodes(root, targetLang) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                const parentTag = node.parentNode && node.parentNode.nodeName;
                if (parentTag === "SCRIPT" || parentTag === "STYLE") {
                    return NodeFilter.FILTER_REJECT;
                }
                return node.nodeValue.trim()
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_SKIP;
            }
        });

        const nodes = [];
        let current;
        while ((current = walker.nextNode())) nodes.push(current);

        nodes.forEach(function (node) {
            // Always translate from the original Arabic/source text so repeated
            // AR <-> EN toggles never lose the source phrase.
            if (node.nodeValue.trim()) {
                if (!node.__zenoI18nOriginal) {
                    node.__zenoI18nOriginal = node.nodeValue;
                }
                const source = node.__zenoI18nOriginal;
                node.nodeValue = targetLang === "ar" ? source : translateText(source, "en");
            }
        });
    }

    /** Translate known attributes (placeholder, title, aria-label, button values) */
    function translateAttributes(root, targetLang) {
        const all = root.querySelectorAll("*");
        all.forEach(function (el) {
            ATTRS_TO_TRANSLATE.forEach(function (attr) {
                if (!el.hasAttribute(attr)) return;
                if (attr === "value") {
                    const type = (el.getAttribute("type") || "").toLowerCase();
                    if (el.tagName !== "INPUT" || VALUE_TRANSLATABLE_TYPES.indexOf(type) === -1) {
                        return;
                    }
                }

                const marker = "data-zeno-i18n-" + attr.replace(/[^a-z0-9_-]/gi, "_");
                const current = el.getAttribute(attr);

                if (!el.hasAttribute(marker)) {
                    el.setAttribute(marker, current);
                }

                const source = el.getAttribute(marker);
                const translated = targetLang === "ar" ? source : translateText(source, "en");
                if (translated !== current) el.setAttribute(attr, translated);
            });
        });
    }

    /** Apply full-page translation + direction/lang flip */
    function applyLanguage(targetLang, root) {
        root = root || document.body;
        translateTextNodes(root, targetLang);
        translateAttributes(root, targetLang);

        if (root === document.body) {
            document.documentElement.setAttribute("lang", targetLang);
            document.documentElement.setAttribute(
                "dir",
                targetLang === "ar" ? "rtl" : "ltr"
            );
            document.documentElement.setAttribute("data-lang", targetLang);
            updateToggleButtonLabel(targetLang);
        }
    }

    function getSavedLanguage() {
        for (const key of STORAGE_KEYS) {
            try {
                const v = localStorage.getItem(key);
                if (v === "ar" || v === "en") return v;
            } catch (e) { /* ignore */ }
        }
        try {
            const match = document.cookie.match(
                new RegExp("(?:^|; )" + COOKIE_NAME + "=([^;]+)")
            );
            if (match && (match[1] === "ar" || match[1] === "en")) return match[1];
        } catch (e) { /* ignore */ }
        return null;
    }

    function saveLanguage(lang) {
        STORAGE_KEYS.forEach(function (key) {
            try { localStorage.setItem(key, lang); } catch (e) { /* ignore */ }
        });
        try {
            document.cookie = COOKIE_NAME + "=" + lang + ";path=/;max-age=31536000;SameSite=Lax";
        } catch (e) { /* ignore */ }
    }

    function detectInitialLanguage() {
        const saved = getSavedLanguage();
        if (saved === "ar" || saved === "en") return saved;

        const nav = (navigator.language || navigator.userLanguage || "").toLowerCase();
        // Page content is authored in Arabic, so only switch to English when the
        // device is clearly *not* an Arabic locale.
        return nav.indexOf("ar") === 0 ? "ar" : "en" === nav.split("-")[0] ? "en" : "ar";
    }

    let currentLang = "ar";

    /**
     * Switch language. Server-rendered dashboard pages only show the
     * correct language after a fresh page load (the server bakes translated
     * strings into the HTML), so this persists the choice then reloads —
     * same pattern as the landing page's toggleZenoLang(). Pass
     * { reload:false } to only patch the DOM client-side without reloading
     * (useful for pages with no server-side translation at all).
     */
    function setLanguage(lang, options) {
        if (lang !== "ar" && lang !== "en") return;
        currentLang = lang;
        saveLanguage(lang);
        applyLanguage(lang, document.body); // instant feedback before reload
        const shouldReload = !!(options && options.reload === true);
        if (shouldReload) {
            setTimeout(function () { location.reload(); }, 50);
        }
    }

    function syncCurrentLanguageFromDocument() {
        const domLang = document.documentElement.getAttribute("lang");
        if (domLang === "ar" || domLang === "en") currentLang = domLang;
        return currentLang;
    }

    function toggleLanguage(options) {
        syncCurrentLanguageFromDocument();
        setLanguage(currentLang === "ar" ? "en" : "ar", options);
    }

    /**
     * Translate a single string for dynamic/runtime text (e.g. alert()
     * messages, text injected after an AJAX call). Matches how this
     * project's pages already call `_t('نص عربي')` inline.
     */
    function t(text) {
        return translateText(text, currentLang);
    }

    // Updates the label/state of the site's OWN language button, instead of
    // creating a floating one. Set data-lang-toggle="true" on your existing
    // button (or add its id/selector to TOGGLE_BUTTON_SELECTORS below) and
    // this module will wire it up automatically — no duplicate button.
    const TOGGLE_BUTTON_SELECTORS = [
        "[data-lang-toggle]",
        "#lang-toggle-btn",
        ".zeno-lang-toggle-btn"
    ];

    function getToggleButton() {
        for (const sel of TOGGLE_BUTTON_SELECTORS) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        return null;
    }

    function updateToggleButtonLabel(lang) {
        const btn = getToggleButton();
        if (!btn) return;
        // Only touch a text-holding child if present (e.g. <span>AR</span>),
        // so icons inside the button aren't wiped out.
        const label = btn.querySelector("[data-lang-label]") || btn.querySelector(".lang-toggle-label") || btn.querySelector(".font-black") || btn;
        label.textContent = lang === "ar" ? "EN" : "AR";
        btn.setAttribute(
            "aria-label",
            lang === "ar" ? "Switch to English" : "التبديل إلى العربية"
        );
    }

    /** Hook the click handler onto the site's existing language button. */
    function ensureToggleButton() {
        const btn = getToggleButton();
        if (!btn || btn.dataset.langBound === "true") return;

        // Use the same public toggle function used by older dashboard pages.
        // Do not stop propagation here; the delegated handler below is the
        // single fallback for buttons that are replaced dynamically.
        btn.addEventListener("click", function (event) {
            event.preventDefault();
            toggleLanguage({ reload: false });
        });
        btn.dataset.langBound = "true";
    }

    // Delegated fallback: keeps the toggle working even when the dashboard
    // replaces/re-renders the header button after initial page load.
    function ensureDelegatedToggle() {
        if (document.documentElement.dataset.zenoI18nDelegated === "true") return;
        document.documentElement.dataset.zenoI18nDelegated = "true";
        document.addEventListener("click", function (event) {
            const target = event.target && event.target.closest
                ? event.target.closest(TOGGLE_BUTTON_SELECTORS.join(","))
                : null;
            if (!target) return;

            // Ignore clicks already handled by the direct listener.
            if (target.dataset.langBound === "true") return;

            event.preventDefault();
            toggleLanguage({ reload: false });
        }, false);
    }

    /** Watch for dynamically injected content (SPA-style dashboards) and translate it */
    function observeDynamicContent() {
        const observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType === 1) {
                        applyLanguage(currentLang, node);
                    } else if (node.nodeType === 3 && node.nodeValue.trim()) {
                        if (!node.__zenoI18nOriginal) node.__zenoI18nOriginal = node.nodeValue;
                        node.nodeValue = currentLang === "ar"
                            ? node.__zenoI18nOriginal
                            : translateText(node.__zenoI18nOriginal, "en");
                    }
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        currentLang = detectInitialLanguage();
        ensureToggleButton();
        ensureDelegatedToggle();
        applyLanguage(currentLang, document.body);
        observeDynamicContent();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    // ===== Public API =====
    // `window.zenoI18n` (lowercase z) is the name your dashboard pages
    // already call via onclick="window.zenoI18n.toggleLang()" — this is
    // what was missing and causing the "Cannot read properties of undefined
    // (reading 'toggleLang')" error.
    // Compatibility aliases for older dashboard buttons that call a global toggle.
    // These aliases intentionally point to the same single implementation so the
    // button can never toggle twice or depend on a page-specific handler.
    window.toggleZenoLang = toggleLanguage;
    window.toggleLanguage = toggleLanguage;

    window.zenoI18n = {
        toggleLang: toggleLanguage,
        setLang: setLanguage,
        getLang: function () { return currentLang; },
        apply: function (lang) {
            const target = lang === "ar" || lang === "en" ? lang : currentLang;
            currentLang = target;
            saveLanguage(target);
            applyLanguage(target, document.body);
            return target;
        },
        t: t
    };

    // Also expose a plain global `_t()`, matching how server.js's inline
    // scripts already call it directly: _t('حدث خطأ أثناء الشراء')
    if (typeof window._t !== "function") {
        window._t = t;
    }

    // Kept for backward compatibility with anything already using the
    // capitalized name from an earlier version of this file.
    window.ZenoI18n = {
        setLanguage: setLanguage,
        toggleLanguage: toggleLanguage,
        getLanguage: function () { return currentLang; },
        translate: translateText
    };
})();