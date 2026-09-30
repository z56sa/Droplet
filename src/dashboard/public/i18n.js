/**
 * @file i18n.js
 * @description Localization module for ZENO Dashboard (Arabic & English)
 * Features:
 * - Dynamic dictionary mapping English translations to all Arabic texts and phrases
 * - Automatically translates full DOM text nodes, attribute labels, and headings
 * - Detects device language (navigator.language)
 * - Switch button toggles between Arabic and English instantly
 * - Flips direction (RTL for Arabic, LTR for English)
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

        // General Settings Page
        "الإعدادات العامة": "General Settings",
        "إعدادات البوت لسيرفر": "Bot settings for",
        "البادئة (Prefix)": "Command Prefix",
        "الرمز المستخدم قبل الأوامر النصية": "Symbol used before text commands",
        "لغة البوت": "Bot Language",
        "تصفير سجلات العقوبات التلقائي": "Auto-Clear Infractions",
        "حذف دوري لسجلات العقوبات المنتهية / المزالة – العقوبات النشطة لا تتأثر إطلاقاً.": "Periodic cleanup of expired / removed punishment logs – active punishments are never affected.",
        "فترة التصفير": "Clearing Period",
        "كل أسبوع": "Every week",
        "كل أسبوعين": "Every 2 weeks",
        "كل 3 أسابيع": "Every 3 weeks",
        "كل شهر": "Every month",
        "أنواع العقوبات المشمولة": "Covered Punishment Types",
        "كل الأنواع": "All Types",
        "حظر مؤقت": "Temporary Ban",
        "ميوت صوتي": "Voice Mute",
        "بلاك لست": "Blacklist",
        "تايم اوت": "Timeout",
        "منطقة الخطر": "Danger Zone",
        "تصفير قاعدة بيانات السيرفر": "Reset Server Database",
        "أونر السيرفر حصراً. يمسح كل بيانات البوت لهذا السيرفر نهائياً – الإعدادات، الحماية، سجل العقوبات، كل شيء (عدا التوب الكتابي/الصوتي والدعوات، تُدار منفصلة عبر أمر reset).": "Server owner only. Permanently deletes all bot data for this server – settings, protection, punishment log, everything (except text/voice top and invites, managed separately via the reset command).",

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
        "إدارة السيرفر": "Manage Server",
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
        "نظام تذاكر احترافي بأزرار تفاعلية، استلاستلام التذاكر من فريق الدعم، حفظ سجل المحادثات (Transcripts)، وتقييم طاقم العمل.": "Professional ticket panels with interactive buttons, support staff claiming, full chat transcripts, and staff rating.",
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
        "رابط السيرفر المخصص": "Server vanity URL",
        "ميزات السيرفر المفعلة": "Enabled server features",
        "تاريخ إنشاء السيرفر": "Server creation date",
        "مدة تشغيل البوت": "Bot uptime",
        "سرعة الاستجابة": "Response speed",
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

        // Dashboard chrome & AI page (often left untranslated)
        "قائمة الأوامر": "Commands List",
        "الإشراف": "Moderation",
        "الأعضاء:": "Members:",
        "الذكاء الاصطناعي": "AI",
        "الذكاء الاصطناعي (ZENO AI & Web)": "AI (ZENO AI & Web)",
        "الذكاء الاصطناعي والتصفح الذكي": "AI & Smart Browsing",
        "تجربة الذكاء الاصطناعي الحي (Live Chat)": "Live AI Experience (Live Chat)",
        "محادثة تجريبية مباشرة من الداشبورد": "Live Chat Test from Dashboard",
        "اسأل ZENO أي سؤال أو Search في الويب...": "Ask ZENO any question or search the web...",
        "جاري التفكير...": "Thinking...",
        "جاري الحفظ...": "Saving...",
        "جارٍ الحفظ...": "Saving...",
        "ارسال": "Send",
        "تصفح حي": "Live Browsing",
        "بالإنترنت Online": "Online",
        "logout": "Logout",
        "support_server": "Support Server",
        "back_to_dashboard": "Back to Dashboard",

        // Client-side JS messages (dashboard.js, dashboard-actions.js, logs-manager.js)
        "تم الحفظ بنجاح!": "Saved successfully!",
        "فشل في حفظ الإعدادات": "Failed to save settings",
        "حدث خطأ في الاتصال": "Connection error occurred",
        "حدث خطأ في الاتصال بالسيرفر": "Server connection error occurred",
        "✅ تم حفظ إعدادات السجلات!": "✅ Log settings saved!",
        "❌ فشل حفظ الإعدادات": "❌ Failed to save settings",

        // Server.js generated HTML & JS messages
        "غير معروف": "Unknown",
        "السيرفر غير موجود في كاش البوت": "Server not found in bot cache",
        "يجب تسجيل الدخول أولاً": "Please login first",
        "بيانات غير صالحة": "Invalid data",
        "إجراء غير معروف": "Unknown action",
        "تم تحديث الرصيد وحفظه فوراً في قاعدة البيانات": "Balance updated and saved to database instantly",
        "لا توجد بيانات خبرة مسجلة بعد": "No XP data recorded yet",
        "لا توجد بيانات ذهب مسجلة بعد": "No gold data recorded yet",
        "لا توجد بيانات نشاط حتى الآن": "No activity data yet",
        "✓ مفعّل حالياً": "✓ Currently Active",
        "مجهزة على بطاقتك 🪪": "Equipped on your card 🪪",
        "شراء وتجهيز": "Buy & Equip",
        "جارٍ الاستلام... ⏳": "Claiming... ⏳",
        "فشل استلام الراتب اليومي": "Failed to claim daily reward",
        "استلام الرصيد 🎁": "Claim Reward 🎁",
        "جارٍ الشراء... ⏳": "Purchasing... ⏳",
        "✅ تم الشراء والتفعيل بنجاح!": "✅ Purchased and activated successfully!",
        "رصيدك لا يكفي لإتمام الشراء": "Your balance is insufficient for this purchase",
        "حدث خطأ أثناء الشراء": "Error occurred during purchase",
        "الرصيد": "Balance",
        "المبلغ": "Amount",
        "اليوم": "Today",
        "تاريخ": "Date",
        "المكافأة اليومية (Daily)": "Daily Reward",
        "الملف الشخصي": "Profile",
        "بطاقة الهوية": "ID Card",
        "مرحباً بك في لوحة تحكم ZENO Bot!": "Welcome to ZENO Bot Dashboard!",
        "لوحة المتصدرين": "Leaderboards",
        "أعلى 100 عضو بواسطة نقاط الخبرة (XP Leaderboard) 🏆": "Top 100 Members by XP 🏆",
        "أغنى الأثرياء": "Richest Users",
        "الراتب اليومي (Daily Reward)": "Daily Reward",
        "مكافأة اليوم": "Today's Reward",
        "التكرار": "Frequency",
        "صوّت للبوت على Top.gg": "Vote for Bot on Top.gg",
        "🗳️ صوّت الآن على Top.gg": "🗳️ Vote Now on Top.gg",
        "عام": "General",
        "أخرى": "Other",
        "الصفحة الرئيسية": "Home",
        "...اختر القناة": "...Select Channel",
        "...اختر الرتبة": "...Select Role",
        "حدد عدد المنشنات المسموح بها في الرسالة الواحدة": "Set maximum mentions allowed per message",
        "حظر الحروف الكبيرة": "Block Capital Letters",
        "منع الرسائل التي تحتوي على أحرف كبيرة بشكل مفرط (70% أو أكثر)": "Prevent messages with excessive capital letters (70% or more)",
        "إزعاج Spoilers": "Spoiler Spam",
        "منع الاستخدام المفرط لعلامات السبويلر": "Prevent excessive use of spoiler tags",
        "نص Zalgo": "Zalgo Text",
        "منع النصوص المشوهة والرموز الغريبة (Zalgo text)": "Prevent distorted text and weird symbols (Zalgo text)",
        "مرونة أكثر في التخصيص": "More customization flexibility",
        "حماية البوت — حماية متقدمة يديرها البوت مباشرة": "Bot Shield — Advanced protection managed directly by the bot",
        "مكافحة السبام المتقدم": "Advanced Anti-Spam",
        "مكافحة السبام": "Anti-Spam",
        "عضو #": "Member #",
        "خطأ في إعدادات البوت: CLIENT_SECRET غير مضاف في لوحة Render.": "Bot config error: CLIENT_SECRET is not added in Render dashboard.",
        "تعذر إكمال تسجيل الدخول عبر Discord": "Could not complete Discord login",
        "رسالة الخطأ من Discord: ": "Error message from Discord: ",
        "تأكد من صحة Client Secret في إعدادات البوت.": "Verify the Client Secret in bot settings.",
        "العودة للصفحة الرئيسية": "Back to Home",
        "فشل جلب بيانات المستخدم من Discord": "Failed to fetch user data from Discord",
        "فشل جلب سيرفرات المستخدم من Discord": "Failed to fetch user servers from Discord",
        "الإعدادات": "Settings",
        "ترتيبك الحالي: #": "Your current rank: #",
        "عودة لخوادمك المتاحة": "Back to your available servers",
        "ليس لديك صلاحيات إدارة في هذا السيرفر": "You don't have manage permissions in this server",
        "يجب أن تكون مالك السيرفر أو تمتلك صلاحية Manage Server / Administrator": "You must be the server owner or have Manage Server / Administrator permission",
        "البوت غير موجود في هذا السيرفر": "Bot is not in this server",
        "حدث خطأ داخلي في الخادم": "Internal server error occurred",
        "عذراً، حدث خطأ أثناء معالجة الطلب": "Sorry, an error occurred while processing the request",
        "العودة للوحة التحكم": "Back to Dashboard",
        "Unauthorized: يرجى تسجيل الدخول أولاً": "Unauthorized: Please login first",
        "Bad Request: معرف السيرفر مطلوب": "Bad Request: Server ID is required",
        "البوت غير متواجد في هذا السيرفر أو السيرفر غير موجود": "Bot is not in this server or server does not exist",
        "Forbidden: لا تملك صلاحيات إدارة (Administrator أو Manage Server) في هذا السيرفر": "Forbidden: You don't have manage permissions (Administrator or Manage Server) in this server",
        "حدث خطأ أثناء التحقق من الصلاحيات": "Error occurred while checking permissions",
        "حدث خطأ أثناء فحص الصلاحيات": "Error occurred while verifying permissions",
        "Too Many Requests: تم تجاوز حد الطلبات المسموح به. يرجى الانتظار قليلاً.": "Too Many Requests: Request limit exceeded. Please wait a moment.",
        "Too Many Requests: عدد كبير من العمليات الحساسة في وقت قصير. يرجى المحاولة بعد قليل.": "Too Many Requests: Too many sensitive operations in a short time. Please try again later.",
        "Too Many Requests: تم تجاوز حد رسائل الذكاء الاصطناعي للدقيقة. انتظر قليلاً.": "Too Many Requests: AI messages per minute limit exceeded. Please wait.",
        "المحفز مطلوب": "Trigger word is required",
        "الرد مطلوب": "Reply text is required",
        "العنوان أو محتوى الوصف مطلوب على الأقل": "At least title or description content is required",
        "اسم الجائزة مطلوب": "Prize name is required",
        "محتوى الاقتراح مطلوب": "Suggestion content is required",
        "نص السؤال مطلوب": "Question text is required",

        // Guild dashboard JS alerts and messages (from server.js inline scripts)
        "✅ تمت إضافة قاعدة العقوبة التلقائية بنجاح!": "✅ Auto-punishment rule added successfully!",
        "❌ خطأ: ": "❌ Error: ",
        "فشل الإضافة": "Addition failed",
        "حدث خطأ في الاتصال": "Connection error occurred",
        "✅ تم تحديث حد المنشنات بنجاح!": "✅ Mention limit updated successfully!",
        "✅ تم تحديث حد طول الرسائل بنجاح!": "✅ Message length limit updated successfully!",
        "⚙️ إعدادات ": "⚙️ Settings for ",
        ":\\nيمكنك استثناء أعضاء محددين عبر حقل \"أعضاء معفيون من الفلتر\" بالأسفل.": ":\\nYou can exclude specific members via the \"Exempt Members\" field below.",
        " تعمل بكفاءة وفق الإعدادات الحالية.": " is working efficiently with current settings.",
        "هل أنت متأكد من رغبتك في حذف قاعدة العقوبة هذه؟": "Are you sure you want to delete this punishment rule?",
        "✅ تم الحذف بنجاح!": "✅ Deleted successfully!",
        "❌ خطأ في الحذف": "❌ Delete error",
        "يرجى كتابة أيدي العضو أو منشن صالح وتحديد عدد الدعوات!": "Please enter a valid user ID/mention and set the invite count!",
        "✅ تم تحديث رصيد دعوات العضو بنجاح!": "✅ Member invite balance updated successfully!",
        "فشل التحديث": "Update failed",
        "⚠️ تحذير: هل أنت متأكد من تصفير كافة بيانات الدعوات في السيرفر؟ لا يمكن التراجع عن هذا الإجراء!": "⚠️ Warning: Are you sure you want to reset all invite data in the server? This action cannot be undone!",
        "✅ تم تصفير الدعوات بنجاح!": "✅ Invites reset successfully!",
        "يرجى إدخال معرف المستخدم (User ID)!": "Please enter a valid User ID!",
        "✅ تم إضافة العضو بنجاح!": "✅ Member added successfully!",
        "حدث خطأ في الاتصال بالخادم": "Server connection error occurred",
        "هل أنت متأكد من حذف هذا العضو؟": "Are you sure you want to delete this member?",
        "فشل الحذف": "Deletion failed",
        "يرجى كتابة كلمة أو عبارة المحفز": "Please enter a trigger word or phrase",
        "يرجى كتابة الرد التلقائي": "Please enter the auto reply text",
        "✅ تمت إضافة الرد التلقائي بنجاح!": "✅ Auto reply added successfully!",
        "هل أنت متأكد من حذف هذا الرد التلقائي؟": "Are you sure you want to delete this auto reply?",
        "❌ يرجى اختيار ملف صورة صالح (PNG, JPG, WEBP, GIF)": "❌ Please select a valid image file (PNG, JPG, WEBP, GIF)",
        "❌ حجم الصورة يتجاوز 15 ميجابايت. يرجى اختيار صورة أصغر.": "❌ Image size exceeds 15 MB. Please choose a smaller image.",
        "❌ فشل رفع الصورة: ": "❌ Image upload failed: ",
        "خطأ غير معروف": "Unknown error",
        "حدث خطأ أثناء رفع الصورة: ": "Error occurred while uploading image: ",
        "يرجى اختيار \"روم إرسال لوحة التذاكر (Panel Channel)\" أولاً ثم حفظ التغييرات.": "Please select a \"Ticket Panel Channel\" first then save changes.",
        "هل تريد إرسال لوحة التذاكر الآن مباشرة إلى الروم المختار؟": "Do you want to send the ticket panel now to the selected channel?",
        "✅ تم إرسال لوحة التذاكر بنجاح إلى القناة!": "✅ Ticket panel sent to channel successfully!",
        "❌ فشل الإرسال: ": "❌ Send failed: ",
        "تأكد من صلاحيات البوت في القناة": "Check bot permissions in the channel",
        "حدث خطأ أثناء محاولة الإرسال: ": "Error occurred while attempting to send: ",
        "✅ تمت إضافة رتبة المستوى بنجاح!": "✅ Level reward role added successfully!",
        "✅ تمت إضافة رتبة الشرط المزدوج بنجاح!": "✅ Dual condition role added successfully!",
        "هل أنت متأكد من حذف هذه الرتبة؟": "Are you sure you want to delete this role?",
        "هل أنت متأكد من مسح جميع التحذيرات المسجلة لجميع الأعضاء في هذا السيرفر؟": "Are you sure you want to clear all recorded warnings for all members in this server?",
        "✅ تم مسح جميع التحذيرات بنجاح!": "✅ All warnings cleared successfully!",
        "❌ فشل مسح التحذيرات": "❌ Failed to clear warnings",
        "يرجى كتابة اسم الجائزة": "Please enter the prize name",
        "يرجى اختيار القناة التي سيتم نشر القيف اواي فيها": "Please select the channel where the giveaway will be posted",
        "✅ تم إنشاء ونشر القيف اواي في السيرفر بنجاح!": "✅ Giveaway created and posted to the server successfully!",
        "❌ خطأ: ": "❌ Error: ",
        "فشل إنشاء القيف اواي": "Giveaway creation failed",
        "❌ حجم الصورة كبير جداً (أكثر من 15 ميجابايت)": "❌ Image size is too large (over 15 MB)",
        "⚠️ تعذّر رفع الصورة: ": "⚠️ Image upload failed: ",
        "⚠️ خطأ في الاتصال أثناء رفع الصورة": "⚠️ Connection error during image upload",
        "يرجى كتابة تفاصيل الاقتراح": "Please enter suggestion details",
        "✅ تم إرسال الاقتراح بنجاح ونشره في السيرفر!": "✅ Suggestion submitted and posted to the server successfully!",
        "فشل إرسال الاقتراح": "Suggestion submission failed",
        "✅ تم تحديث حالة الاقتراح بنجاح!": "✅ Suggestion status updated successfully!",
        "❌ فشل تحديث الحالة": "❌ Status update failed",
        "لا توجد سجلات مطابقة للبحث أو الفلتر 🔍": "No records match the search or filter 🔍",
        " سجل": " records",

        // Common variants (with/without tashkeel, etc.)
        "جاري الحفظ...": "Saving...",
        "جارٍ الحفظ...": "Saving...",
        "تم الحفظ بنجاح!": "Saved successfully!",
        "خطأ: ": "Error: ",
        "❌ ": "❌ ",
        "✅ ": "✅ ",
        "⚠️ ": "⚠️ ",
        "🗳️ ": "🗳️ ",
        "🎁 ": "🎁 ",
        "🪪 ": "🪪 ",
        "⏳ ": "⏳ ",
        "⚙️ ": "⚙️ ",
        "🔍 ": "🔍 ",
        "←": "←",
        "->": "->",
        "س": "h",
        "د": "m",
        "ث": "s",
        "ساعة": "hour",
        "دقيقة": "minute",
        "ثانية": "second",
        "؟": "?",
        "!": "!",

        // Arabic Month Names (Gregorian, Levantine, and North African)
        "يناير": "January",
        "فبراير": "February",
        "مارس": "March",
        "أبريل": "April",
        "ابريل": "April",
        "مايو": "May",
        "يونيو": "June",
        "يوليو": "July",
        "أغسطس": "August",
        "اغسطس": "August",
        "سبتمبر": "September",
        "أكتوبر": "October",
        "اكتوبر": "October",
        "نوفمبر": "November",
        "ديسمبر": "December",
        "كانون الثاني": "January",
        "شباط": "February",
        "آذار": "March",
        "اذار": "March",
        "نيسان": "April",
        "أيار": "May",
        "ايار": "May",
        "حزيران": "June",
        "تموز": "July",
        "آب": "August",
        "اب": "August",
        "أيلول": "September",
        "ايلول": "September",
        "تشرين الأول": "October",
        "تشرين الاول": "October",
        "تشرين الثاني": "November",
        "كانون الأول": "December",
        "كانون الاول": "December"
    };

    // Helper function to translate a single text string
    function translateText(text) {
        if (!text) return text;
        const trimmed = text.trim();
        return dictionary[trimmed] || text;
    }

    // Function to traverse and translate DOM nodes
    function translateNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const original = node.nodeValue;
            const trimmed = original.trim();
            if (trimmed && dictionary[trimmed]) {
                node.nodeValue = original.replace(trimmed, dictionary[trimmed]);
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            // Translate placeholders
            if (node.hasAttribute('placeholder')) {
                const ph = node.getAttribute('placeholder').trim();
                if (dictionary[ph]) {
                    node.setAttribute('placeholder', dictionary[ph]);
                }
            }
            // Translate title attributes
            if (node.hasAttribute('title')) {
                const titleAttr = node.getAttribute('title').trim();
                if (dictionary[titleAttr]) {
                    node.setAttribute('title', dictionary[titleAttr]);
                }
            }
            // Recursively translate child nodes
            for (let child of node.childNodes) {
                translateNode(child);
            }
        }
    }

    const LANG_KEYS = ['zeno_dashboard_lang', 'zeno_lang'];
    const reverseDictionary = {};
    Object.keys(dictionary).forEach((ar) => {
        const en = dictionary[ar];
        if (en && !reverseDictionary[en]) reverseDictionary[en] = ar;
    });
    const arKeysByLength = Object.keys(dictionary).sort((a, b) => b.length - a.length);
    const enKeysByLength = Object.keys(reverseDictionary).sort((a, b) => b.length - a.length);

    const easternToArabicMap = {
        '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
        '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
    };

    function translateString(text, dict, keys) {
        if (!text) return text;
        const trimmed = text.trim();
        if (!trimmed) return text;
        if (dict[trimmed]) {
            let res = text.replace(trimmed, dict[trimmed]);
            if (dict === dictionary) {
                res = res.replace(/[٠-٩]/g, d => easternToArabicMap[d] || d);
            }
            return res;
        }
        let out = text;
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (key.length < 2) continue;
            if (out.indexOf(key) !== -1) out = out.split(key).join(dict[key]);
        }
        if (dict === dictionary) {
            out = out.replace(/[٠-٩]/g, d => easternToArabicMap[d] || d);
        }
        return out;
    }

    function readStoredLang() {
        try {
            for (const key of LANG_KEYS) {
                const value = localStorage.getItem(key);
                if (value === 'ar' || value === 'en') return value;
            }
        } catch (e) {}
        const match = (document.cookie || '').match(/(?:^|;\s*)zeno_dashboard_lang=(ar|en)/);
        if (match) return match[1];
        return null;
    }

    function persistLang(lang) {
        try {
            localStorage.setItem('zeno_dashboard_lang', lang);
            localStorage.setItem('zeno_lang', lang);
        } catch (e) {}
        document.cookie = 'zeno_dashboard_lang=' + lang + ';path=/;max-age=31536000;SameSite=Lax';
    }

    function detectLang() {
        const stored = readStoredLang();
        if (stored) return stored;
        const htmlLang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
        if (htmlLang.startsWith('ar')) return 'ar';
        if (htmlLang.startsWith('en')) return 'en';
        const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
        return nav.startsWith('ar') ? 'ar' : 'en';
    }

    function ensureLayoutStyle() {
        if (document.getElementById('zeno-i18n-layout')) return;
        const style = document.createElement('style');
        style.id = 'zeno-i18n-layout';
        style.textContent = [
            'html.zeno-lang-en [dir="rtl"] { direction: ltr !important; }',
            'html.zeno-lang-en .text-right { text-align: left !important; }',
            'html.zeno-lang-en .justify-end { justify-content: flex-start !important; }',
            'html.zeno-lang-en .lang-ar, html.zeno-lang-en [data-lang="ar"], html.zeno-lang-en span[lang="ar"] { display: none !important; }',
            'html.zeno-lang-ar .lang-en, html.zeno-lang-ar [data-lang="en"], html.zeno-lang-ar span[lang="en"] { display: none !important; }',
            'html.zeno-lang-en .lang-en, html.zeno-lang-en [data-lang="en"], html.zeno-lang-en span[lang="en"] { display: inline !important; }',
            'html.zeno-lang-ar .lang-ar, html.zeno-lang-ar [data-lang="ar"], html.zeno-lang-ar span[lang="ar"] { display: inline !important; }'
        ].join('\n');
        (document.head || document.documentElement).appendChild(style);
    }

    function applyLayout(lang) {
        ensureLayoutStyle();
        const html = document.documentElement;
        html.setAttribute('lang', lang);
        html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        html.classList.toggle('zeno-lang-en', lang === 'en');
        html.classList.toggle('zeno-lang-ar', lang === 'ar');
        document.querySelectorAll('.zeno-lang-toggle-btn').forEach((btn) => {
            const label = lang === 'ar' ? 'EN' : 'AR';
            btn.innerHTML = '<span class="text-sm">🌐</span><span class="font-black text-xs uppercase tracking-wider">' + label + '</span>';
            // ربط حدث الضغط إذا لم يكن مربوطاً
            if (!btn._zenoClickBound) {
                btn._zenoClickBound = true;
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleLang();
                });
            }
        });
    }

    function isLangHandledSpan(node) {
        if (!node) return false;
        let cur = node;
        // نتوقف عند document.body ولا نتحقق من <html> لأنه يحتوي على lang="ar"/"en" عالمي
        while (cur && cur !== document.documentElement && cur !== document) {
            if (cur.nodeType === Node.ELEMENT_NODE) {
                if (cur.classList && (cur.classList.contains('lang-ar') || cur.classList.contains('lang-en'))) {
                    return true;
                }
                if (cur !== document.body && cur.getAttribute) {
                    const dlang = cur.getAttribute('data-lang');
                    const elang = cur.getAttribute('lang');
                    if (dlang && (dlang === 'ar' || dlang === 'en')) return true;
                    if (elang && (elang === 'ar' || elang === 'en')) return true;
                }
            }
            cur = cur.parentNode;
        }
        return false;
    }

    function translateNodeWithDict(node, dict, keys) {
        if (!node || !dict) return;
        if (isLangHandledSpan(node)) return;
        if (node.nodeType === Node.TEXT_NODE) {
            const original = node.nodeValue;
            const next = translateString(original, dict, keys);
            if (next !== original) node.nodeValue = next;
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return;

        if (node.classList && (node.classList.contains('lang-ar') || node.classList.contains('lang-en'))) return;
        if (node !== document.body && node !== document.documentElement && node.getAttribute) {
            const dlang = node.getAttribute('data-lang');
            const elang = node.getAttribute('lang');
            if (dlang && (dlang === 'ar' || dlang === 'en')) return;
            if (elang && (elang === 'ar' || elang === 'en')) return;
        }

        if (node.hasAttribute('placeholder')) {
            node.setAttribute('placeholder', translateString(node.getAttribute('placeholder'), dict, keys));
        }
        if (node.hasAttribute('title')) {
            node.setAttribute('title', translateString(node.getAttribute('title'), dict, keys));
        }
        if (node.hasAttribute('data-i18n')) {
            const key = node.getAttribute('data-i18n').trim();
            if (dict[key] && node.childElementCount === 0) {
                node.textContent = dict[key];
            }
        }
        for (let i = 0; i < node.childNodes.length; i++) {
            translateNodeWithDict(node.childNodes[i], dict, keys);
        }
    }

    function isManualLangPage() {
        if (document.body && document.body.hasAttribute && document.body.hasAttribute('data-zeno-manual-lang')) return true;
        if (document.documentElement && document.documentElement.hasAttribute && document.documentElement.hasAttribute('data-zeno-manual-lang')) return true;
        try {
            var lp = location.pathname;
            if (lp === '/' || lp === '' || lp === '/dashboard' || lp === '/index.html' || lp === '/dashboard/') {
                var hasLangSpans = document.querySelector && (document.querySelector('.lang-ar') || document.querySelector('.lang-en'));
                if (hasLangSpans) return true;
            }
        } catch(e){}
        return false;
    }

    function applyLanguage() {
        const lang = detectLang();
        applyLayout(lang);
        if (!document.body) return lang;
        if (isManualLangPage()) return lang;
        if (lang === 'en') {
            translateNodeWithDict(document.body, dictionary, arKeysByLength);
        } else {
            translateNodeWithDict(document.body, reverseDictionary, enKeysByLength);
        }
        return lang;
    }

    function toggleLang() {
        const next = detectLang() === 'ar' ? 'en' : 'ar';
        persistLang(next);
        applyLayout(next);
        // Always reload to ensure clean render with correct lang CSS classes
        location.reload();
    }

    function translateRuntimeText(text) {
        if (!text || typeof text !== 'string') return text;
        const lang = detectLang();
        if (lang === 'en') {
            return translateString(text, dictionary, arKeysByLength);
        } else {
            return translateString(text, reverseDictionary, enKeysByLength);
        }
    }

    window._zenoT = function(text) {
        return translateRuntimeText(text);
    };
    window._zenoIsEn = function() {
        return detectLang() === 'en';
    };

    const originalAlert = window.alert;
    window.alert = function(message) {
        return originalAlert(translateRuntimeText(message));
    };

    const originalConfirm = window.confirm;
    window.confirm = function(message) {
        return originalConfirm(translateRuntimeText(message));
    };

    const originalPrompt = window.prompt;
    window.prompt = function(message, defaultValue) {
        return originalPrompt(translateRuntimeText(message), defaultValue);
    };

    const api = {
        dictionary,
        translate: translateText,
        translateRuntime: translateRuntimeText,
        detectLang,
        apply: applyLanguage,
        translatePage: applyLanguage,
        toggleLang,
        toggleLanguage: toggleLang
    };

    window.ZenoI18n = api;
    window.zenoI18n = api;

    let observerActive = false;
    let isTranslating = false;
    function startMutationObserver() {
        if (observerActive || !('MutationObserver' in window)) return;
        if (isManualLangPage()) return;
        observerActive = true;
        const observer = new MutationObserver(function(mutations) {
            if (isTranslating) return;
            const lang = detectLang();
            const dict = lang === 'en' ? dictionary : reverseDictionary;
            const keys = lang === 'en' ? arKeysByLength : enKeysByLength;
            isTranslating = true;
            try {
                mutations.forEach(function(m) {
                    if (m.addedNodes && m.addedNodes.length) {
                        for (let i = 0; i < m.addedNodes.length; i++) {
                            const node = m.addedNodes[i];
                            if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
                                translateNodeWithDict(node, dict, keys);
                            }
                        }
                    }
                    if (m.type === 'characterData' && m.target.nodeType === Node.TEXT_NODE) {
                        const next = translateString(m.target.nodeValue, dict, keys);
                        if (next !== m.target.nodeValue) m.target.nodeValue = next;
                    }
                    if (m.type === 'attributes' && m.target.nodeType === Node.ELEMENT_NODE) {
                        const el = m.target;
                        if (m.attributeName === 'placeholder' && el.hasAttribute('placeholder')) {
                            el.setAttribute('placeholder', translateString(el.getAttribute('placeholder'), dict, keys));
                        }
                        if (m.attributeName === 'title' && el.hasAttribute('title')) {
                            el.setAttribute('title', translateString(el.getAttribute('title'), dict, keys));
                        }
                    }
                });
            } finally {
                isTranslating = false;
            }
        });
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['placeholder', 'title']
            });
        } else {
            document.addEventListener('DOMContentLoaded', function() {
                if (document.body) observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    characterData: true,
                    attributes: true,
                    attributeFilter: ['placeholder', 'title']
                });
            });
        }
    }

    applyLayout(detectLang());

    // Event delegation: اضغط على أي مكان وإذا كان زر الترجمة شغّل toggleLang
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('[data-lang-toggle="true"], .zeno-lang-toggle-btn');
        if (btn) {
            e.preventDefault();
            e.stopPropagation();
            toggleLang();
        }
    }, true);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            applyLanguage();
            startMutationObserver();
        });
    } else {
        applyLanguage();
        startMutationObserver();
    }
})();