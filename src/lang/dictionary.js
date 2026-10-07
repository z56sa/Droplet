/**
 * Bilingual string dictionary (EN default, AR secondary).
 * Keys are namespaced: '<category>.<command>.<string>'.
 * Values may contain {placeholders} replaced by t().
 */
module.exports = {
  en: {
    // ===== economy.balance =====
    'economy.balance.author': 'Financial account of {name}',
    'economy.balance.field_balance': '🪙 Balance (Gold)',
    'economy.balance.field_level': '⭐ Level',
    'economy.balance.field_xp': '✨ Experience (XP)',
    'economy.balance.footer': 'Droplet Economy System • Permanent save active 🛡️',

    // ===== economy.daily =====
    'economy.daily.cooldown_title': '⏰ Daily reward already claimed!',
    'economy.daily.cooldown_desc': 'Next reward in:\n⌛ **{h}h {m}m**',
    'economy.daily.cooldown_footer': 'Come back soon!',
    'economy.daily.bonus_100': '🏆 **100-day streak bonus!** (x6)',
    'economy.daily.bonus_30': '🌟 **30-day streak bonus!** (x3.5)',
    'economy.daily.bonus_7': '🔥 **7-day streak bonus!** (x2.5)',
    'economy.daily.bonus_3': '✨ **3-day streak bonus!** (+100)',
    'economy.daily.title': '💰 Your daily reward!',
    'economy.daily.field_reward': '🎁 Reward',
    'economy.daily.field_new_balance': '💳 New balance',
    'economy.daily.field_streak': '🔥 Streak: {streak} days',
    'economy.daily.footer_next': '🎯 {left} days left for the next bonus',
    'economy.daily.footer_top': '🏆 You are at the top!',
    // ===== economy.leaderboard =====
    'economy.leaderboard.disabled': '❌ The leveling system is currently disabled in this server.',
    'economy.leaderboard.title_xp': '🏆 Top XP leaders | {guild}',
    'economy.leaderboard.empty_xp': 'No activity data yet in this server.',
    'economy.leaderboard.row_xp': '**Level {level}** ({xp} XP)',
    'economy.leaderboard.title_coins': '⭐ Top Star Coin holders | {guild}',
    'economy.leaderboard.empty_coins': 'No balance data yet.',
    'economy.leaderboard.row_coins': '**{coins}** credits 🪙',

    // ===== economy.rank =====
    'economy.rank.not_found': '❌ Member not found in this server.',
    'economy.rank.loading': '⏳ Preparing rank card...',

    // ===== economy.pay =====
    'economy.pay.self': '❌ You cannot send coins to yourself!',
    'economy.pay.bot': '❌ You cannot send coins to bots!',
    'economy.pay.title': '💸 Transfer completed successfully!',
    'economy.pay.from': '📤 **From:**',
    'economy.pay.to': '📥 **To:**',
    'economy.pay.amount': '💰 **Amount:**',
    'economy.pay.remaining': '💳 **Your remaining balance:**',
    'economy.pay.footer': 'Droplet Economy System • Instantly saved to database',
    'economy.pay.insufficient': '❌ Insufficient balance! Your current balance is **{balance}** Gold 🪙',
    'economy.pay.error': '⚠️ An error occurred while processing the transfer.',
    'economy.pay.usage': '⚠️ Correct usage:\n`#pay @user <amount>`',

    // ===== economy.work =====
    'economy.work.cooldown_title': '😴 You are tired!',
    'economy.work.cooldown_desc': 'Take a rest, you can work again in:\n⏰ **{h}h {m}m**',
    'economy.work.bonus': '\n🍀 **Lucky! Your salary is doubled this time!**',
    'economy.work.field_salary': '💰 Salary',
    'economy.work.field_balance': '💳 Your balance',
    'economy.work.footer': 'You can work again in 4 hours',

    // ===== economy.bank =====
    'economy.bank.title_balance': '🏦 {name} bank account',
    'economy.bank.field_wallet': '👛 Wallet',
    'economy.bank.field_bank': '🏦 Bank',
    'economy.bank.field_total': '💎 Total',
    'economy.bank.footer': 'Money in the bank is safe from gambling losses!',
    'economy.bank.invalid_amount': '❌ Enter a valid amount or type `all`.',
    'economy.bank.deposit_title': '✅ Deposited to bank',
    'economy.bank.deposit_field': '💰 Deposited',
    'economy.bank.deposit_insufficient': '❌ Not enough in your wallet! You have `{wallet}` ⭐',
    'economy.bank.deposit_error': '❌ An error occurred during deposit.',
    'economy.bank.withdraw_title': '✅ Withdrawn from bank',
    'economy.bank.withdraw_field': '💰 Withdrawn',
    'economy.bank.withdraw_insufficient': '❌ Not enough in your bank! You have `{bank}` ⭐ in the bank.',
    'economy.bank.withdraw_error': '❌ An error occurred during withdrawal.',

    // ===== common =====
    'common.no_manage_perm': '❌ You do not have Manage Server permission.',
    'common.member_not_found': '❌ Member not found in this server.',

    // ===== economy.profile =====
    'economy.profile.loading': '⏳ Preparing your profile card...',

    // ===== economy.setwallpaper =====
    'economy.setwallpaper.invalid_url': '❌ Please enter a valid image URL starting with `https://`',
    'economy.setwallpaper.success': '🖼️ **{name}**, your profile wallpaper has been set! 🎉\nType **`#profile`** to see your new card.',
    'economy.setwallpaper.prefix_invalid': '❌ Please enter the image URL after the command or attach an image!\nExample: `#setwallpaper https://...`',

    // ===== economy.tax =====
    'economy.tax.title': '💳 ProBot tax calculator',
    'economy.tax.field_original': 'Original amount',
    'economy.tax.field_transfer': 'Amount to transfer',
    'economy.tax.field_deducted': 'Tax deducted',
    'economy.tax.field_middleman': 'With middleman',
    'economy.taxmode.set': '✅ Tax mode set to: {mode}',
    'economy.taxline.set': '✅ Tax line set successfully!',
    'economy.taxroom.set': '✅ Tax channel set successfully!',

    // ===== economy.shop =====
    'economy.shop.view_title': '🛒 Server Shop & Custom Tools',
    'economy.shop.view_desc': 'Hello <@{user}>! Your balance: **{coins}** 🪙 gold.\nChoose what suits you and buy directly with the slash commands below:',
    'economy.shop.view_roles_title': '👑 Custom Roles',
    'economy.shop.view_roles_value': '• **Fully custom role (30 days):** `{price}` gold\n  *(You set its name and HEX color, granted automatically)*\n  👉 Buy: `/shop buy-role name:name color:#hex`',
    'economy.shop.view_rent_title': '🎙️ Private Room Rentals',
    'economy.shop.view_rent_value': '• **Private voice room (7 days):** `{voice}` gold\n• **Private text room (7 days):** `{text}` gold\n  👉 Buy: `/shop rent-room`',
    'economy.shop.view_cos_title': '🎨 Profile Cosmetics & Frames',
    'economy.shop.view_cos_value': '• **Royal gold frame:** `{gold}` gold\n• **Neon frame:** `{neon}` gold\n• **Royal VIP badge:** `{vip}` gold\n  👉 Buy: `/shop buy-cosmetic`',
    'economy.shop.footer': 'Droplet Economy & Utility Store • Auto-renewing',
    'economy.shop.role_insufficient': '❌ Insufficient balance. You need `{cost}` gold, your balance: `{coins}` gold.',
    'economy.shop.role_badcolor': '❌ Invalid color format! Must be a HEX code like: `#7c3aed` or `#ff0055`',
    'economy.shop.role_existing': '⚠️ You already have a custom role (<@&{role}>) expiring {expiry}.',
    'economy.shop.role_reason': 'Custom role purchase by {tag}',
    'economy.shop.role_created_title': '🎉 Your custom role was created!',
    'economy.shop.role_created_desc': 'Congratulations <@{user}>! Your custom role was created and given to you.',
    'economy.shop.role_name_field': '🏷️ Role name',
    'economy.shop.role_color_field': '🎨 Color',
    'economy.shop.role_expires_field': '⏳ Expires',
    'economy.shop.role_footer': 'Droplet Custom Role Store',
    'economy.shop.role_fail': '❌ Failed to create role: {err}. Check the bot admin permissions.',
    'economy.shop.room_insufficient': '❌ Insufficient balance. Cost: `{cost}` gold, your balance: `{coins}` gold.',
    'economy.shop.room_existing': '⚠️ You already rented a room (<#{channel}>) expiring {expiry}.',
    'economy.shop.room_reason': 'Private room rental by {tag}',
    'economy.shop.room_created_title': '🏠 Room rented successfully!',
    'economy.shop.room_created_desc': 'Your private room is ready: <#{channel}>',
    'economy.shop.room_type_field': '📂 Room type',
    'economy.shop.room_type_voice': '🔊 Voice',
    'economy.shop.room_type_text': '💬 Text',
    'economy.shop.room_cost_field': '💰 Charged',
    'economy.shop.room_expires_field': '⏳ Rental ends',
    'economy.shop.room_footer': 'You can manage permissions and invite friends via channel settings',
    'economy.shop.room_fail': '❌ Failed to create room: {err}',
    'economy.shop.cosmetic_insufficient': '❌ Insufficient balance. Cost: `{cost}` gold, your balance: `{coins}` gold.',
    'economy.shop.item_frame_gold': 'Royal gold frame',
    'economy.shop.item_frame_neon': 'Neon frame',
    'economy.shop.item_badge_vip': 'Royal VIP badge',
    'economy.shop.cosmetic_title': '✨ Cosmetic purchased and equipped!',
    'economy.shop.cosmetic_desc': '**{item}** is now active on your profile card!',
    'economy.shop.cosmetic_item_field': '🎁 Item',
    'economy.shop.cosmetic_price_field': '💰 Price',
    'economy.shop.cosmetic_owner_field': '👤 Owner',
    'economy.shop.cosmetic_footer': 'Shows on your profile in the dashboard and server',

    // ===== general.ping =====
    'general.ping.measuring': 'Measuring...',
    'general.ping.title': '🏓 Latency (Pong!)',
    'general.ping.field_latency': '📡 Latency',
    'general.ping.field_api': '🌐 Discord API',

    // ===== general.avatar =====
    'general.avatar.title': "🖼️ {user}'s avatar",
    'general.avatar.footer': 'Requested by: {tag}',
    'general.avatar.button': 'Direct image link',

    // ===== general.say =====
    'general.say.no_perm': "❌ You don't have Manage Messages permission.",
    'general.say.sent': '✅ Sent',

    // ===== general.banner =====
    'general.banner.no_banner': '❌ **{user}** has no custom banner.',
    'general.banner.title': "🎨 {user}'s banner",

    // ===== general.server =====
    'general.server.title': '🏰 Server info: {guild}',
    'general.server.field_id': '🆔 Server ID',
    'general.server.field_owner': '👑 Server owner',
    'general.server.unknown': 'Unknown',
    'general.server.field_created': '📅 Created',
    'general.server.field_members': '👥 Members',
    'general.server.members_value': '`{n}` members',
    'general.server.field_roles': '👑 Roles',
    'general.server.roles_value': '`{n}` roles',
    'general.server.field_boost': '🚀 Boost level',
    'general.server.boost_value': 'Level {tier} ({count} boosts)',
    'general.server.field_channels': '💬 Channels',
    'general.server.channels_value': '💬 Text: `{t}` | 🔊 Voice: `{v}` | 📁 Categories: `{c}`',

    // ===== general.roles =====
    'general.roles.title': '🎖️ Server roles',
    'general.roles.empty': 'No roles.',

    // ===== general.come =====
    'general.come.dm': '📢 Staff requests you in <#{channel}> on {guild}',
    'general.come.sent': '✅ Summon request sent!',

    // ===== general.send =====
    'general.send.sent': '✅ Message sent!',

    // ===== general.user =====
    'general.user.not_found': '❌ Member not found in this server.',
    'general.user.not_found_short': '❌ Member not found.',
    'general.user.no_roles': 'No roles',
    'general.user.title': '👤 Member info: {tag}',
    'general.user.field_id': '🆔 ID',
    'general.user.field_bot': '🤖 Bot?',
    'general.user.yes': 'Yes',
    'general.user.no': 'No',
    'general.user.field_created': '📅 Created',
    'general.user.field_joined': '📥 Joined server',
    'general.user.field_roles': '🏷️ Roles',
    'general.user.too_many_roles': 'Too many roles to display',

    // ===== general.embed =====
    'general.embed.sent': '✅ Embed sent successfully in <#{channel}>',

    // ===== general.suggest =====
    'general.suggest.disabled': '❌ Suggestions are currently disabled in this server.',
    'general.suggest.no_content': '❌ Please write your suggestion after the command! Example: `#suggest Add a gaming room`',
    'general.suggest.no_channel': '❌ No valid suggestions channel set in the dashboard.',
    'general.suggest.thread_title': 'Discussion: {title}',
    'general.suggest.thread_default': 'Suggestion discussion #{user}',
    'general.suggest.sent': '✅ Your suggestion was posted in <#{channel}>!',
    'general.suggest.error': '❌ Failed to post suggestion, check bot permissions in the channel.',

    // ===== suggestion widget =====
    'suggest.widget.title': '💡 New suggestion',
    'suggest.widget.status': '**Status:**',
    'suggest.widget.by': ' · by <@{id}>',
    'suggest.widget.note': '💬 **Staff note:** {reason}',
    'suggest.status.pending': 'Pending',
    'suggest.status.considered': 'Under review',
    'suggest.status.accepted': 'Accepted',
    'suggest.status.rejected': 'Rejected',
    'suggest.status.implemented': 'Implemented',
    'suggest.button.accept': 'Accept',
    'suggest.button.reject': 'Reject',
    'suggest.button.consider': 'Under review',
    'suggest.vote.not_found': '❌ Suggestion data not found in database.',
    'suggest.vote.action_removed': 'removing your vote',
    'suggest.vote.action_up': 'recording your upvote 👍',
    'suggest.vote.action_down': 'recording your downvote 👎',
    'suggest.vote.done': '✅ {action} successful!',
    'suggest.staff.only': '❌ This action is for server staff only.',
    'suggest.modal.accept_title': '✅ Officially accept suggestion',
    'suggest.modal.reject_title': '❌ Reject suggestion',
    'suggest.modal.consider_title': '🔍 Mark suggestion under review',
    'suggest.modal.label_accept': 'Acceptance note (optional):',
    'suggest.modal.label_reject': 'Rejection reason:',
    'suggest.modal.label_consider': 'Under-review notes (optional):',
    'suggest.modal.ph_accept': 'Write a note for staff or the author...',
    'suggest.modal.ph_reject': 'Write why it cannot be implemented...',
    'suggest.modal.ph_consider': 'Write how the idea will be reviewed...',
    'suggest.unknown_member': 'Member',
    'suggest.notify.accepted': '🎉 Your suggestion was accepted!',
    'suggest.notify.rejected': '📌 Your suggestion was rejected',
    'suggest.notify.considered': '🔍 Your suggestion is now under review!',
    'suggest.notify.default': '📌 Update on your suggestion',
    'suggest.notify.desc': 'Hello **{user}**!\nThe staff team reviewed your suggestion in **{guild}**:\n\n**Suggestion:** {content}\n**New status:** `{status}`\n**Comment/reason:** `{reason}`',
    'suggest.action.consider_label': 'marking the suggestion under review',
    'suggest.action.done': '✅ {action} completed, status and votes updated, author notified.',
  },
  ar: {
    // ===== economy.balance =====
    'economy.balance.author': 'الحساب المالي لـ {name}',
    'economy.balance.field_balance': '🪙 الرصيد (Gold)',
    'economy.balance.field_level': '⭐ المستوى (Level)',
    'economy.balance.field_xp': '✨ نقاط الخبرة (XP)',
    'economy.balance.footer': 'Droplet Economy System • الحفظ الدائم نشط 🛡️',

    // ===== economy.daily =====
    'economy.daily.cooldown_title': '⏰ انتهت مكافأتك اليومية!',
    'economy.daily.cooldown_desc': 'المكافأة التالية خلال:\n⌛ **{h} ساعة و{m} دقيقة**',
    'economy.daily.cooldown_footer': 'عد قريباً!',
    'economy.daily.bonus_100': '🏆 **مكافأة 100 يوم متتالي!** (x6)',
    'economy.daily.bonus_30': '🌟 **مكافأة 30 يوم متتالي!** (x3.5)',
    'economy.daily.bonus_7': '🔥 **مكافأة 7 أيام متتالية!** (x2.5)',
    'economy.daily.bonus_3': '✨ **مكافأة 3 أيام متتالية!** (+100)',
    'economy.daily.title': '💰 مكافأتك اليومية!',
    'economy.daily.field_reward': '🎁 المكافأة',
    'economy.daily.field_new_balance': '💳 رصيدك الجديد',
    'economy.daily.field_streak': '🔥 الـ Streak: {streak} يوم',
    'economy.daily.footer_next': '🎯 {left} يوم متبقٍ للمكافأة التالية',
    'economy.daily.footer_top': '🏆 أنت على القمة!',

    // ===== economy.leaderboard =====
    'economy.leaderboard.disabled': '❌ نظام المستويات واللفل معطل في هذا السيرفر حالياً.',
    'economy.leaderboard.title_xp': '🏆 توب المتصدرين في المستويات | {guild}',
    'economy.leaderboard.empty_xp': 'لا توجد بيانات تفاعل بعد في هذا السيرفر.',
    'economy.leaderboard.row_xp': '**المستوى {level}** ({xp} XP)',
    'economy.leaderboard.title_coins': '⭐ توب الأثرياء في Star Coin | {guild}',
    'economy.leaderboard.empty_coins': 'لا توجد بيانات أرصدة بعد.',
    'economy.leaderboard.row_coins': '**{coins}** كريدت 🪙',

    // ===== economy.rank =====
    'economy.rank.not_found': '❌ العضو غير موجود في السيرفر.',
    'economy.rank.loading': '⏳ جاري تجهيز بطاقة المستوى...',

    // ===== economy.pay =====
    'economy.pay.self': '❌ لا يمكنك تحويل العملات لنفسك!',
    'economy.pay.bot': '❌ لا يمكنك تحويل العملات للبوتات!',
    'economy.pay.title': '💸 تمت عملية التحويل المالي بنجاح!',
    'economy.pay.from': '📤 **من:**',
    'economy.pay.to': '📥 **إلى:**',
    'economy.pay.amount': '💰 **المبلغ المحول:**',
    'economy.pay.remaining': '💳 **رصيدك المتبقي:**',
    'economy.pay.footer': 'Droplet Economy System • تم الحفظ فوراً بقاعدة البيانات',
    'economy.pay.insufficient': '❌ رصيدك غير كافي! رصيدك الحالي هو **{balance}** Gold 🪙',
    'economy.pay.error': '⚠️ حدث خطأ أثناء تنفيذ الحوالة المالية.',
    'economy.pay.usage': '⚠️ طريقة الاستخدام الصحيحة:\n`#pay @user <amount>` أو `#تحويل @user 100`',

    // ===== economy.work =====
    'economy.work.cooldown_title': '😴 أنت متعب!',
    'economy.work.cooldown_desc': 'استرح قليلاً، يمكنك العمل مجدداً خلال:\n⏰ **{h} ساعة و{m} دقيقة**',
    'economy.work.bonus': '\n🍀 **حظ سعيد! راتبك مضاعف هذه المرة!**',
    'economy.work.field_salary': '💰 الراتب',
    'economy.work.field_balance': '💳 رصيدك',
    'economy.work.footer': 'يمكنك العمل مجدداً بعد 4 ساعات',

    // ===== economy.bank =====
    'economy.bank.title_balance': '🏦 حساب {name} البنكي',
    'economy.bank.field_wallet': '👛 المحفظة',
    'economy.bank.field_bank': '🏦 البنك',
    'economy.bank.field_total': '💎 الإجمالي',
    'economy.bank.footer': 'المال في البنك آمن من الخسارة في المراهنات!',
    'economy.bank.invalid_amount': '❌ أدخل مبلغاً صحيحاً أو اكتب `all`.',
    'economy.bank.deposit_title': '✅ تم الإيداع في البنك',
    'economy.bank.deposit_field': '💰 تم إيداع',
    'economy.bank.deposit_insufficient': '❌ ليس في محفظتك كافٍ! لديك `{wallet}` ⭐',
    'economy.bank.deposit_error': '❌ حدث خطأ أثناء عملية الإيداع.',
    'economy.bank.withdraw_title': '✅ تم السحب من البنك',
    'economy.bank.withdraw_field': '💰 تم سحب',
    'economy.bank.withdraw_insufficient': '❌ ليس في بنكك كافٍ! لديك `{bank}` ⭐ في البنك.',
    'economy.bank.withdraw_error': '❌ حدث خطأ أثناء عملية السحب.',

    // ===== common =====
    'common.no_manage_perm': '❌ لا تملك صلاحية إدارة السيرفر.',
    'common.member_not_found': '❌ العضو غير موجود في السيرفر.',

    // ===== economy.profile =====
    'economy.profile.loading': '⏳ جاري تجهيز بطاقة البروفايل والهوية...',

    // ===== economy.setwallpaper =====
    'economy.setwallpaper.invalid_url': '❌ يرجى إدخال رابط صورة صالح يبدأ بـ `https://`',
    'economy.setwallpaper.success': '🖼️ **{name}**, تم تعيين خلفية بروفايلك بنجاح! 🎉\nاكتب **`#star`** أو **`#profile`** لمشاهدة بطاقتك الجديدة.',
    'economy.setwallpaper.prefix_invalid': '❌ يرجى إدخال رابط الصورة بعد الأمر أو إرفاق صورة مع الرسالة!\nمثال: `#setwallpaper https://...`',

    // ===== economy.tax =====
    'economy.tax.title': '💳 حاسبة ضريبة بروبوت',
    'economy.tax.field_original': 'المبلغ الأصلي',
    'economy.tax.field_transfer': 'المبلغ المطلوب تحويله',
    'economy.tax.field_deducted': 'الضريبة المستقطعة',
    'economy.tax.field_middleman': 'مع وسيط',
    'economy.taxmode.set': '✅ تم تعيين نمط الضريبة إلى: {mode}',
    'economy.taxline.set': '✅ تم تعيين خط الضريبة بنجاح!',
    'economy.taxroom.set': '✅ تم تعيين روم الضريبة بنجاح!',

    // ===== economy.shop =====
    'economy.shop.view_title': '🛒 متجر السيرفر الشامل والأدوات المخصصة',
    'economy.shop.view_desc': 'مرحباً <@{user}>! رصيدك الحالي: **{coins}** 🪙 ذهب.\nاختر ما يناسبك واشترِه مباشرة باستخدام أوامر السلاش أدناه:',
    'economy.shop.view_roles_title': '👑 الرتب الخاصة (Custom Roles)',
    'economy.shop.view_roles_value': '• **رتبة مخصصة بالكامل (30 يوماً):** `{price}` ذهب\n  *(تحدد اسمها ولونها الخاص HEX بالكامل وتُمنح لك تلقائياً)*\n  👉 الشراء: `/shop buy-role name:اسم color:#hex`',
    'economy.shop.view_rent_title': '🎙️ استئجار الغرف الخاصة (Room Rentals)',
    'economy.shop.view_rent_value': '• **استئجار روم صوتي خاص (7 أيام):** `{voice}` ذهب\n• **استئجار روم كتابي خاص (7 أيام):** `{text}` ذهب\n  👉 الشراء: `/shop rent-room`',
    'economy.shop.view_cos_title': '🎨 حزم المظهر وإطارات البروفايل (Cosmetics)',
    'economy.shop.view_cos_value': '• **إطار الذهب الملكي:** `{gold}` ذهب\n• **إطار النيون الأرجواني:** `{neon}` ذهب\n• **شارة VIP الملكية:** `{vip}` ذهب\n  👉 الشراء: `/shop buy-cosmetic`',
    'economy.shop.footer': 'Droplet Economy & Utility Store • تجديد الصلاحيات تلقائياً',
    'economy.shop.role_insufficient': '❌ رصيدك غير كافٍ. تحتاج إلى `{cost}` ذهب، ورصيدك الحالي: `{coins}` ذهب.',
    'economy.shop.role_badcolor': '❌ صيغة اللون غير صحيحة! يجب أن تكون كود HEX مثل: `#7c3aed` أو `#ff0055`',
    'economy.shop.role_existing': '⚠️ لديك رتبة خاصة سابقة بالفعل (<@&{role}>) تنتهي {expiry}.',
    'economy.shop.role_reason': 'شراء رتبة مخصصة بواسطة {tag}',
    'economy.shop.role_created_title': '🎉 تم إنشاء رتبتك الخاصة بنجاح!',
    'economy.shop.role_created_desc': 'تهانينا <@{user}>! تم إنشاء رتبتك الخاصة وإعطاؤها لك بنجاح.',
    'economy.shop.role_name_field': '🏷️ اسم الرتبة',
    'economy.shop.role_color_field': '🎨 اللون',
    'economy.shop.role_expires_field': '⏳ تنتهي الصلاحية',
    'economy.shop.role_footer': 'Droplet Custom Role Store',
    'economy.shop.role_fail': '❌ فشل إنشاء الرتبة: {err}. تأكد من صلاحيات البوت الإدارية.',
    'economy.shop.room_insufficient': '❌ رصيدك غير كافٍ. التكلفة: `{cost}` ذهب، ورصيدك: `{coins}` ذهب.',
    'economy.shop.room_existing': '⚠️ لديك روم مستأجر بالفعل (<#{channel}>) ينتهي {expiry}.',
    'economy.shop.room_reason': 'استئجار غرفة خاصة بواسطة {tag}',
    'economy.shop.room_created_title': '🏠 تم استئجار الروم بنجاح!',
    'economy.shop.room_created_desc': 'تم إنشاء وتجهيز غرفتك الخاصة: <#{channel}>',
    'economy.shop.room_type_field': '📂 نوع الروم',
    'economy.shop.room_type_voice': '🔊 صوتي',
    'economy.shop.room_type_text': '💬 كتابي',
    'economy.shop.room_cost_field': '💰 التكلفة المحسومة',
    'economy.shop.room_expires_field': '⏳ ينتهي الاستئجار',
    'economy.shop.room_footer': 'يمكنك التحكم بالصلاحيات وإدخال أصدقائك عبر إعدادات الروم',
    'economy.shop.room_fail': '❌ فشل إنشاء الروم: {err}',
    'economy.shop.cosmetic_insufficient': '❌ رصيدك غير كافٍ. التكلفة: `{cost}` ذهب، ورصيدك: `{coins}` ذهب.',
    'economy.shop.item_frame_gold': 'إطار الذهب الملكي',
    'economy.shop.item_frame_neon': 'إطار النيون الأرجواني',
    'economy.shop.item_badge_vip': 'شارة VIP الملكية',
    'economy.shop.cosmetic_title': '✨ تم شراء وتجهيز عنصر المظهر بنجاح!',
    'economy.shop.cosmetic_desc': 'تم شراء وتفعيل **{item}** في بطاقة الهوية والبروفايل الخاصة بك!',
    'economy.shop.cosmetic_item_field': '🎁 العنصر',
    'economy.shop.cosmetic_price_field': '💰 السعر',
    'economy.shop.cosmetic_owner_field': '👤 المالك',
    'economy.shop.cosmetic_footer': 'يظهر في ملفك الشخصي داخل اللوحة والسيرفر',

    // ===== general.ping =====
    'general.ping.measuring': 'جاري القياس...',
    'general.ping.title': '🏓 سرعة الاستجابة (Pong!)',
    'general.ping.field_latency': '📡 زمن الاستجابة (Latency)',
    'general.ping.field_api': '🌐 سرعة اتصال الديسكورد (API)',

    // ===== general.avatar =====
    'general.avatar.title': '🖼️ صورة الحساب: {user}',
    'general.avatar.footer': 'طلب بواسطة: {tag}',
    'general.avatar.button': 'رابط الصورة المباشر',

    // ===== general.say =====
    'general.say.no_perm': '❌ لا تملك صلاحية إدارة الرسائل.',
    'general.say.sent': '✅ تم الإرسال',

    // ===== general.banner =====
    'general.banner.no_banner': '❌ المستخدم **{user}** لا يملك بنر مخصص.',
    'general.banner.title': '🎨 بنر المستخدم: {user}',

    // ===== general.server =====
    'general.server.title': '🏰 معلومات السيرفر: {guild}',
    'general.server.field_id': '🆔 أيدي السيرفر',
    'general.server.field_owner': '👑 مالك السيرفر',
    'general.server.unknown': 'غير معروف',
    'general.server.field_created': '📅 تاريخ الإنشاء',
    'general.server.field_members': '👥 عدد الأعضاء',
    'general.server.members_value': '`{n}` عضو',
    'general.server.field_roles': '👑 عدد الرتب',
    'general.server.roles_value': '`{n}` رتبة',
    'general.server.field_boost': '🚀 مستوى التعزيز (Boost)',
    'general.server.boost_value': 'المستوى {tier} ({count} بوست)',
    'general.server.field_channels': '💬 القنوات والرومات',
    'general.server.channels_value': '💬 كتابية: `{t}` | 🔊 صوتية: `{v}` | 📁 تصنيفات: `{c}`',

    // ===== general.roles =====
    'general.roles.title': '🎖️ رتب السيرفر',
    'general.roles.empty': 'لا توجد رتب.',

    // ===== general.come =====
    'general.come.dm': '📢 طلب المشرف حضورك إلى: <#{channel}> في سيرفر {guild}',
    'general.come.sent': '✅ تم إرسال طلب الحضور بنجاح!',

    // ===== general.send =====
    'general.send.sent': '✅ تم إرسال الرسالة بنجاح!',

    // ===== general.user =====
    'general.user.not_found': '❌ لم يتم العثور على هذا العضو في السيرفر.',
    'general.user.not_found_short': '❌ لم يتم العثور على هذا العضو.',
    'general.user.no_roles': 'لا توجد رتب',
    'general.user.title': '👤 معلومات العضو: {tag}',
    'general.user.field_id': '🆔 الأيدي (ID)',
    'general.user.field_bot': '🤖 بوت؟',
    'general.user.yes': 'نعم',
    'general.user.no': 'لا',
    'general.user.field_created': '📅 تاريخ الإنشاء',
    'general.user.field_joined': '📥 تاريخ الانضمام للسيرفر',
    'general.user.field_roles': '🏷️ الرتب',
    'general.user.too_many_roles': 'عدد الرتب كبير جداً للعرض',

    // ===== general.embed =====
    'general.embed.sent': '✅ تم إرسال رسالة الـ Embed بنجاح في القناة: <#{channel}>',

    // ===== general.suggest =====
    'general.suggest.disabled': '❌ نظام الاقتراحات معطل حالياً في هذا السيرفر.',
    'general.suggest.no_content': '❌ يرجى كتابة محتوى الاقتراح بعد الأمر! مثال: `#suggest إضافة روم للألعاب`',
    'general.suggest.no_channel': '❌ لم يتم تعيين قناة صالحة لنشر الاقتراحات في إعدادات الداشبورد.',
    'general.suggest.thread_title': 'مناقشة: {title}',
    'general.suggest.thread_default': 'مناقشة اقتراح #{user}',
    'general.suggest.sent': '✅ تم إرسال اقتراحك بنجاح ونشره في <#{channel}>!',
    'general.suggest.error': '❌ حدث خطأ أثناء إرسال الاقتراح، يرجى التأكد من صلاحيات البوت في القناة.',

    // ===== suggestion widget =====
    'suggest.widget.title': '💡 اقتراح جديد',
    'suggest.widget.status': '**الحالة:**',
    'suggest.widget.by': ' · بواسطة <@{id}>',
    'suggest.widget.note': '💬 **ملاحظة الإدارة:** {reason}',
    'suggest.status.pending': 'معلّق',
    'suggest.status.considered': 'قيد الدراسة',
    'suggest.status.accepted': 'مقبول',
    'suggest.status.rejected': 'مرفوض',
    'suggest.status.implemented': 'منفّذ',
    'suggest.button.accept': 'قبول',
    'suggest.button.reject': 'رفض',
    'suggest.button.consider': 'قيد الدراسة',
    'suggest.vote.not_found': '❌ تعذر العثور على بيانات هذا الاقتراح في قاعدة البيانات.',
    'suggest.vote.action_removed': 'إلغاء تصويتك',
    'suggest.vote.action_up': 'تسجيل تأييدك 👍',
    'suggest.vote.action_down': 'تسجيل معارضتك 👎',
    'suggest.vote.done': '✅ تم {action} بنجاح!',
    'suggest.staff.only': '❌ هذا الإجراء مخصص لإدارة ومشرفي السيرفر فقط.',
    'suggest.modal.accept_title': '✅ قبول الاقتراح رسمياً',
    'suggest.modal.reject_title': '❌ رفض الاقتراح',
    'suggest.modal.consider_title': '🔍 وضع الاقتراح قيد الدراسة',
    'suggest.modal.label_accept': 'ملاحظة القبول (اختياري):',
    'suggest.modal.label_reject': 'سبب الرفض:',
    'suggest.modal.label_consider': 'ملاحظات قيد الدراسة (اختياري):',
    'suggest.modal.ph_accept': 'اكتب ملاحظة للإدارة أو صاحب الاقتراح...',
    'suggest.modal.ph_reject': 'اكتب سبب عدم إمكانية تطبيق الاقتراح...',
    'suggest.modal.ph_consider': 'اكتب ملاحظة حول كيفية وتفاصيل دراسة الفكرة...',
    'suggest.unknown_member': 'عضو',
    'suggest.notify.accepted': '🎉 تم قبول اقتراحك!',
    'suggest.notify.rejected': '📌 تم رفض اقتراحك',
    'suggest.notify.considered': '🔍 اقتراحك الآن قيد الدراسة!',
    'suggest.notify.default': '📌 تحديث بخصوص اقتراحك',
    'suggest.notify.desc': 'مرحباً **{user}**!\nقام فريق الإدارة بمراجعة اقتراحك في سيرفر **{guild}**:\n\n**الاقتراح:** {content}\n**الحالة الجديدة:** `{status}`\n**التعليق/السبب:** `{reason}`',
    'suggest.action.consider_label': 'وضع الاقتراح قيد الدراسة',
    'suggest.action.done': '✅ تم {action} بنجاح وتحديث حالته وشريط التصويت وإشعار صاحب الاقتراح.',
  },
};
