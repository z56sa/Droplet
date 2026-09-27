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
    const translationPairs = {
        en: Object.entries(dictionary).sort((a, b) => b[0].length - a[0].length),
        ar: Object.entries(reverseDictionary).sort((a, b) => b[0].length - a[0].length)
    };

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
        return result;
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
            node.nodeValue = translateText(node.nodeValue, targetLang);
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
                const current = el.getAttribute(attr);
                const translated = translateText(current, targetLang);
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

    function toggleLanguage(options) {
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
        btn.addEventListener("click", toggleLanguage);
        btn.dataset.langBound = "true";
    }

    /** Watch for dynamically injected content (SPA-style dashboards) and translate it */
    function observeDynamicContent() {
        const observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType === 1) {
                        applyLanguage(currentLang, node);
                    } else if (node.nodeType === 3 && node.nodeValue.trim()) {
                        node.nodeValue = translateText(node.nodeValue, currentLang);
                    }
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        currentLang = detectInitialLanguage();
        ensureToggleButton();
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