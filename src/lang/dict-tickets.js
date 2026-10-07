/**
 * Bilingual dictionary part owned by the tickets/admin migration worker.
 * Namespace: tickets.*
 * EN is the default, AR holds the original Arabic verbatim.
 */
module.exports = {
  en: {
    // ===== shared =====
    'tickets.common.not_in_ticket': '❌ This command only works inside tickets.',
    'tickets.common.not_in_ticket_channel': '❌ This command only works inside ticket channels.',
    'tickets.common.no_admin': '❌ You do not have Administrator permission.',

    // ===== tickets.addticketbutton =====
    'tickets.addticketbutton.button_label': '📩 Open Ticket',
    'tickets.addticketbutton.panel_prompt': '🎫 Press to open a ticket:',
    'tickets.addticketbutton.sent': '✅ Ticket button sent!',

    // ===== tickets.adduser =====
    'tickets.adduser.added': '✅ Added <@{user}> to the ticket.',

    // ===== tickets.close =====
    'tickets.close.closed': '🔒 Ticket closed. The channel will be deleted soon...',

    // ===== tickets.delete =====
    'tickets.delete.deleting': '🗑️ Deleting the ticket...',

    // ===== tickets.removeuser =====
    'tickets.removeuser.removed': '✅ Removed <@{user}> from the ticket.',

    // ===== tickets.rename =====
    'tickets.rename.renamed': '✅ Ticket renamed to: {name}',

    // ===== tickets.setticketlog =====
    'tickets.setticketlog.success': '✅ Ticket log channel set successfully!',

    // ===== tickets.setuprating =====
    'tickets.setuprating.enabled': '✅ Ticket rating enabled.',
    'tickets.setuprating.disabled': '❌ Ticket rating disabled.',

    // ===== tickets.ticketsetup =====
    'tickets.ticketsetup.def_title': 'Tickets',
    'tickets.ticketsetup.def_description': 'Choose the ticket category that suits you ❤️',
    'tickets.ticketsetup.def_button_label': 'Open Ticket',
    'tickets.ticketsetup.def_welcome': 'Welcome {user} to your ticket! Please describe your inquiry or issue in detail and the support team will reply to you soon.',
    'tickets.ticketsetup.def_cat1_name': 'General Support',
    'tickets.ticketsetup.def_cat1_desc': 'For general inquiries and issues',
    'tickets.ticketsetup.def_cat2_name': 'Store & Purchases',
    'tickets.ticketsetup.def_cat2_desc': 'For buying ranks, services and products',
    'tickets.ticketsetup.def_cat3_name': 'Complaints & Suggestions',
    'tickets.ticketsetup.def_cat3_desc': 'To file a complaint or suggestion to management',
    'tickets.ticketsetup.def_cat4_name': 'Applications & Management',
    'tickets.ticketsetup.def_cat4_desc': 'To apply for a rank or request a partnership',
    'tickets.ticketsetup.select_placeholder': 'Select the ticket type',
    'tickets.ticketsetup.no_admin': 'You do not have Administrator permission to run this command.',
    'tickets.ticketsetup.panel_sent': '✅ Custom ticket panel sent successfully in: <#{channel}>',

    // ===== tickets.ticket =====
    'tickets.ticket.default_reason': 'Closed by staff command',
    'tickets.ticket.prefix_default_reason': 'Closed via #ticket close command',
    'tickets.ticket.close_generating': '🔒 **Generating the interactive transcript and closing the ticket in 5 seconds...**\nReason: `{reason}`',
    'tickets.ticket.prefix_close_notice': '🔒 **The transcript will be saved and the ticket deleted in 5 seconds...**\nReason: `{reason}`',
    'tickets.ticket.log_title': '🔒 Ticket closed with interactive transcript saved',
    'tickets.ticket.log_field_channel': '🎫 Channel name',
    'tickets.ticket.log_field_owner': '👤 Ticket owner',
    'tickets.ticket.log_field_closed_by': '👮 Closed by',
    'tickets.ticket.log_field_web': '🌐 Web viewer',
    'tickets.ticket.log_web_link': '[View interactive transcript]({url})',
    'tickets.ticket.log_field_reason': '📝 Reason',
    'tickets.ticket.rate_title': '⭐ Support experience rating',
    'tickets.ticket.rate_desc': 'Hello **{user}**!\nYour ticket in **{guild}** has been closed.\n\n🌐 **Interactive transcript link:** [Click here to view the ticket]({url})\nPlease rate the support performance by clicking the stars below:',
    'tickets.ticket.rate_5': '⭐ 5 Excellent',
    'tickets.ticket.staff_only': '❌ This command is for support staff only.',
    'tickets.ticket.prefix_staff_only': '❌ For support staff only.',
    'tickets.ticket.already_claimed': '⚠️ This ticket is already claimed by: <@{user}>',
    'tickets.ticket.claimed': '🙋‍♂️ **{user} claimed the ticket and will handle it now.**',
    'tickets.ticket.prefix_claimed': '🙋‍♂️ {user} claimed the ticket.',
    'tickets.ticket.not_claimed': '⚠️ This ticket is not currently claimed by anyone.',
    'tickets.ticket.unclaimed': '↩️ {user} unclaimed the ticket, it is now available to everyone.',
    'tickets.ticket.prefix_unclaimed': '↩️ Ticket claim removed.',
    'tickets.ticket.transferred': '🔀 **Ticket successfully transferred to {user}.**',
    'tickets.ticket.prefix_transferred': '🔀 Ticket transferred to {user}.',
    'tickets.ticket.transcript_fail': '❌ Failed to generate the interactive transcript for this ticket.',
    'tickets.ticket.prefix_transcript_fail': '❌ Failed to generate the transcript.',
    'tickets.ticket.transcript_done': '📄 **Here you go, ticket transcript extracted successfully!**',
    'tickets.ticket.prefix_transcript_done': '📄 Ticket transcript generated:',
    'tickets.ticket.added': '✅ Added {user} to the ticket.',
    'tickets.ticket.removed': '✅ Removed {user} from the ticket.',
    'tickets.ticket.prefix_need_staff_mention': '❌ Please mention a support staff member.',
    'tickets.ticket.prefix_need_member_mention': '❌ Please mention the member.',
    'tickets.ticket.prefix_usage': '❌ Usage:\n`#ticket close [reason]`\n`#ticket claim`\n`#ticket unclaim`\n`#ticket transfer @staff`\n`#ticket transcript`\n`#ticket add @user`\n`#ticket remove @user`',
  },
  ar: {
    // ===== shared =====
    'tickets.common.not_in_ticket': '❌ هذا الأمر يعمل فقط داخل التذاكر.',
    'tickets.common.not_in_ticket_channel': '❌ هذا الأمر يعمل فقط داخل قنوات التذاكر.',
    'tickets.common.no_admin': '❌ لا تملك صلاحية الأدمن.',

    // ===== tickets.addticketbutton =====
    'tickets.addticketbutton.button_label': '📩 فتح تذكرة',
    'tickets.addticketbutton.panel_prompt': '🎫 اضغط لفتح تذكرة:',
    'tickets.addticketbutton.sent': '✅ تم إرسال زر التذكرة!',

    // ===== tickets.adduser =====
    'tickets.adduser.added': '✅ تمت إضافة <@{user}> للتذكرة.',

    // ===== tickets.close =====
    'tickets.close.closed': '🔒 تم إغلاق التذكرة. سيتم حذف الروم قريباً...',

    // ===== tickets.delete =====
    'tickets.delete.deleting': '🗑️ جاري حذف التذكرة...',

    // ===== tickets.removeuser =====
    'tickets.removeuser.removed': '✅ تمت إزالة <@{user}> من التذكرة.',

    // ===== tickets.rename =====
    'tickets.rename.renamed': '✅ تم تغيير اسم التذكرة إلى: {name}',

    // ===== tickets.setticketlog =====
    'tickets.setticketlog.success': '✅ تم تعيين روم سجلات التذاكر بنجاح!',

    // ===== tickets.setuprating =====
    'tickets.setuprating.enabled': '✅ تم تفعيل تقييم التذاكر.',
    'tickets.setuprating.disabled': '❌ تم تعطيل تقييم التذاكر.',

    // ===== tickets.ticketsetup =====
    'tickets.ticketsetup.def_title': 'التذاكر',
    'tickets.ticketsetup.def_description': 'قم باختيار قسم التذكرة المناسب لك ❤️',
    'tickets.ticketsetup.def_button_label': 'فتح تذكرة | Open Ticket',
    'tickets.ticketsetup.def_welcome': 'مرحباً بك {user} في تذكرتك! يرجى كتابة استفسارك أو مشكلتك بالتفصيل وسيقوم فريق الدعم بالرد عليك قريباً.',
    'tickets.ticketsetup.def_cat1_name': 'الدعم الفني العام',
    'tickets.ticketsetup.def_cat1_desc': 'للاستفسارات والمشاكل العامة',
    'tickets.ticketsetup.def_cat2_name': 'قسم الشراء والمتجر',
    'tickets.ticketsetup.def_cat2_desc': 'لشراء الرتب والخدمات والمنتجات',
    'tickets.ticketsetup.def_cat3_name': 'الشكاوى والاقتراحات',
    'tickets.ticketsetup.def_cat3_desc': 'لتقديم شكوى أو اقتراح للإدارة',
    'tickets.ticketsetup.def_cat4_name': 'التقديم والإدارة',
    'tickets.ticketsetup.def_cat4_desc': 'للتقديم على رتبة أو طلب شراكة',
    'tickets.ticketsetup.select_placeholder': 'اختر نوع التذكرة',
    'tickets.ticketsetup.no_admin': '❌ لا تملك صلاحية الأدمن لتنفيذ هذا الأمر.',
    'tickets.ticketsetup.panel_sent': '✅ تم إرسال لوحة التذاكر المخصصة بنجاح في القناة: <#{channel}>',

    // ===== tickets.ticket =====
    'tickets.ticket.default_reason': 'تم الإغلاق بواسطة أمر المشرف',
    'tickets.ticket.prefix_default_reason': 'تم الإغلاق بأمر #ticket close',
    'tickets.ticket.close_generating': '🔒 **جاري توليد السجل التفاعلي وإغلاق التذكرة خلال 5 ثوانٍ...**\nالسبب: `{reason}`',
    'tickets.ticket.prefix_close_notice': '🔒 **سيتم حفظ السجل وحذف التذكرة خلال 5 ثوانٍ...**\nالسبب: `{reason}`',
    'tickets.ticket.log_title': '🔒 تم إغلاق تذكرة وحفظ السجل التفاعلي',
    'tickets.ticket.log_field_channel': '🎫 اسم الروم',
    'tickets.ticket.log_field_owner': '👤 صاحب التذكرة',
    'tickets.ticket.log_field_closed_by': '👮 أغلقت بواسطة',
    'tickets.ticket.log_field_web': '🌐 عارض الويب',
    'tickets.ticket.log_web_link': '[مشاهدة السجل التفاعلي مباشرة]({url})',
    'tickets.ticket.log_field_reason': '📝 السبب',
    'tickets.ticket.rate_title': '⭐ تقييم تجربة الدعم الفني',
    'tickets.ticket.rate_desc': 'مرحباً **{user}**!\nتم إغلاق تذكرتك في سيرفر **{guild}**.\n\n🌐 **رابط السجل التفاعلي:** [اضغط هنا لمشاهدة التذكرة]({url})\nيرجى تقييم أداء الدعم الفني بالضغط على النجوم أدناه:',
    'tickets.ticket.rate_5': '⭐ 5 ممتاز',
    'tickets.ticket.staff_only': '❌ هذا الأمر مخصص لطاقم الدعم الفني فقط.',
    'tickets.ticket.prefix_staff_only': '❌ مخصص لطاقم الدعم الفني فقط.',
    'tickets.ticket.already_claimed': '⚠️ هذه التذكرة مستلمة بالفعل بواسطة: <@{user}>',
    'tickets.ticket.claimed': '🙋‍♂️ **قام {user} باستلام التذكرة وسيقوم بمتابعتها الآن.**',
    'tickets.ticket.prefix_claimed': '🙋‍♂️ قام {user} باستلام التذكرة.',
    'tickets.ticket.not_claimed': '⚠️ هذه التذكرة ليست مستلمة من أحد حالياً.',
    'tickets.ticket.unclaimed': '↩️ قام {user} بإلغاء استلام التذكرة، وأصبحت متاحة للجميع.',
    'tickets.ticket.prefix_unclaimed': '↩️ تم إلغاء استلام التذكرة.',
    'tickets.ticket.transferred': '🔀 **تم تحويل التذكرة بنجاح إلى المسؤول {user}.**',
    'tickets.ticket.prefix_transferred': '🔀 تم تحويل التذكرة إلى {user}.',
    'tickets.ticket.transcript_fail': '❌ فشل في توليد السجل التفاعلي لهذه التذكرة.',
    'tickets.ticket.prefix_transcript_fail': '❌ فشل في توليد السجل.',
    'tickets.ticket.transcript_done': '📄 **تفضل، تم استخراج سجل التذكرة بنجاح!**',
    'tickets.ticket.prefix_transcript_done': '📄 تم توليد سجل التذكرة:',
    'tickets.ticket.added': '✅ تمت إضافة {user} إلى التذكرة.',
    'tickets.ticket.removed': '✅ تمت إزالة {user} من التذكرة.',
    'tickets.ticket.prefix_need_staff_mention': '❌ يرجى منشن موظف الدعم.',
    'tickets.ticket.prefix_need_member_mention': '❌ يرجى منشن العضو.',
    'tickets.ticket.prefix_usage': '❌ الاستخدام:\n`#ticket close [reason]`\n`#ticket claim`\n`#ticket unclaim`\n`#ticket transfer @staff`\n`#ticket transcript`\n`#ticket add @user`\n`#ticket remove @user`',
  },
};
