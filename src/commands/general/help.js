const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const config = require('../../config.json');

// =============================================
// قائمة الأوامر الكاملة مع التصنيفات
// =============================================
const CATEGORIES = {
  mod: {
    emoji: '🛡️',
    title: 'الإشراف والحماية',
    color: '#ef4444',
    commands: [
      { name: 'ban',            desc: 'اعطاء بان لشخص او ازالته' },
      { name: 'unban',          desc: 'فك حظر عضو' },
      { name: 'unbanall',       desc: 'فك حظر جميع الأعضاء المحظورين في السيرفر' },
      { name: 'kick',           desc: 'اعطاء طرد لشخص او ازالته' },
      { name: 'mute',           desc: 'اعطاء ميوت لشخص او ازالته' },
      { name: 'timeout',        desc: 'اعطاء تايم اوت لشخص او ازالته' },
      { name: 'untimeout',      desc: 'إزالة التايم أوت من عضو' },
      { name: 'untimeall',      desc: 'إزالة التايم أوت من جميع الأعضاء' },
      { name: 'warn',           desc: 'تحذير عضو' },
      { name: 'unwarn',         desc: 'إزالة تحذير من عضو' },
      { name: 'warns',          desc: 'عرض تحذيرات عضو' },
      { name: 'clear',          desc: 'حذف عدد من الرسائل' },
      { name: 'lock',           desc: 'قفل الروم' },
      { name: 'unlock',         desc: 'فتح الروم' },
      { name: 'hide',           desc: 'اخفاء الروم' },
      { name: 'show',           desc: 'إظهار الروم الذي تم إخفاؤه' },
      { name: 'unhide',         desc: 'اظهار الروم' },
      { name: 'nickname',       desc: 'اعطاء اسم مستعار لشخص او ازالته' },
      { name: 'demote',         desc: 'تخفيض عضو عن طريق إزالة أعلى رتبة يمتلكها' },
      { name: 'promote',        desc: 'ترقية عضو تلقائياً لأعلى رتبة (فوق رتبته الحالية)' },
      { name: 'role',           desc: 'اعطاء رتبة لشخص او ازالتها' },
      { name: 'role-all',       desc: 'اعطاء أو ازالة رتبة لجميع الأعضاء دفعة واحدة' },
      { name: 'xroles',         desc: 'إعطاء أو إزالة رتبة لعدة أعضاء' },
      { name: 'come',           desc: 'استدعاء شخص' },
      { name: 'snipe',          desc: 'عرض آخر رسالة محذوفة في القناة' },
    ]
  },
  protection: {
    emoji: '🔐',
    title: 'الحماية المتقدمة',
    color: '#f97316',
    commands: [
      { name: 'anti-ban',          desc: 'تسطيب نظام الحماية من الباند' },
      { name: 'anti-bots',         desc: 'تسطيب نظام الحماية من البوتات' },
      { name: 'anti-delete-roles', desc: 'تسطيب نظام الحماية من حظر الرتب' },
      { name: 'anti-delete-rooms', desc: 'تسطيب نظام الحماية من حذف الرومات' },
      { name: 'antilink',          desc: 'إدارة الحماية من الروابط' },
      { name: 'antispam',          desc: 'إدارة الحماية من السبام' },
      { name: 'badwords',          desc: 'إدارة الكلمات الممنوعة' },
      { name: 'protection-status', desc: 'للاستعلام عن حالة نظام الحماية' },
      { name: 'set-protect-logs',  desc: 'لتحديد روم لوج الحماية' },
    ]
  },
  tickets: {
    emoji: '🎫',
    title: 'التذاكر والتقديم',
    color: '#8b5cf6',
    commands: [
      { name: 'setup-ticket',       desc: 'تثبيت التذكرة' },
      { name: 'add-ticket-button',  desc: 'تثبيت التذكرة (زر إضافي)' },
      { name: 'add-button',         desc: 'اضافة زر للرتبة أخرى' },
      { name: 'close',              desc: 'إغلاق تذكرة التكت الحالي' },
      { name: 'delete',             desc: 'حذف تذكرة التكت الحالي' },
      { name: 'rename',             desc: 'إعادة تسمية تذكرة التكت الحالي' },
      { name: 'add-user',           desc: 'إضافة مستخدم للتذكرة الحالية' },
      { name: 'remove-user',        desc: 'إزالة مستخدم من التذكرة الحالية' },
      { name: 'to-select',          desc: 'تحويل التكت الى سلكت منيو' },
      { name: 'set-ticket-log',     desc: 'تحديد روم اللوغ للتذاكر' },
      { name: 'setup-apply',        desc: 'تسطيب نظام التقديم' },
      { name: 'new-apply',          desc: 'انشاء تقديم جديد' },
      { name: 'close-apply',        desc: 'انهاء التقديم المفتوح' },
    ]
  },
  giveaway: {
    emoji: '🎉',
    title: 'الجيف أواي',
    color: '#ec4899',
    commands: [
      { name: 'gstart',   desc: 'بدأ جيف اواي' },
      { name: 'gend',     desc: 'انهاء جيف اواي' },
      { name: 'greroll',  desc: 'اعادة فائزين جيف اواي' },
    ]
  },
  economy: {
    emoji: '💰',
    title: 'الاقتصاد والرصيد',
    color: '#eab308',
    commands: [
      { name: 'daily',    desc: 'استلام الراتب اليومي' },
      { name: 'rovex',    desc: 'تحويل رصيد أو عرض رصيدك' },
      { name: 'tax',      desc: 'معرفة ضريبة رقم' },
      { name: 'profile',  desc: 'عرض معلومات حسابك أو حساب شخص آخر' },
      { name: 'rank',     desc: 'عرض رانكك في السيرفر' },
      { name: 'top',      desc: 'عرض توب السيرفر (رصيد أو مستوى)' },
    ]
  },
  autoline: {
    emoji: '📏',
    title: 'الخطوط التلقائية ورومات الخدمات',
    color: '#06b6d4',
    commands: [
      { name: 'add-autoline-channel',    desc: 'اضافة روم خط تلقائي' },
      { name: 'remove-autoline-channel', desc: 'ازالة روم خط تلقائي' },
      { name: 'set-autoline-line',       desc: 'تحديد الخط التلقائي' },
      { name: 'line-mode',               desc: 'اختر بين إرسال صورة أو رابط' },
      { name: 'add-nadeko-room',         desc: 'اضافة روم يتم تفعيل الخاصية فيها' },
      { name: 'remove-nadeko-room',      desc: 'ازالة روم مفعل الخاصية فيها' },
      { name: 'set-feedback-line',       desc: 'تحديد خط الاراء' },
      { name: 'set-feedback-room',       desc: 'تحديد روم الاراء' },
      { name: 'set-suggestions-line',    desc: 'تحديد خط الاقتراحات' },
      { name: 'set-suggestions-room',    desc: 'تحديد روم الاقتراحات' },
      { name: 'suggestion-mode',         desc: 'أزرار أو رياكشنات للاقتراحات' },
      { name: 'set-tax-line',            desc: 'تحديد خط الضريبة' },
      { name: 'set-tax-room',            desc: 'تحديد روم الضريبة التلقائية' },
      { name: 'tax-mode',                desc: 'اختيار بين استخدام امبد أو رسالة عادية' },
    ]
  },
  settings: {
    emoji: '⚙️',
    title: 'الإعدادات والأوامر العامة',
    color: '#10b981',
    commands: [
      { name: 'greet',           desc: 'إعدادات الترحيب' },
      { name: 'setup-welcome',   desc: 'إعدادات الترحيب التفصيلية' },
      { name: 'set-message',     desc: 'تحديد الرسالة عند الدخول' },
      { name: 'autorole',        desc: 'إدارة الرتب التلقائية عند دخول الأعضاء' },
      { name: 'settempvoice',    desc: 'إدارة إنشاء القنوات الصوتية المؤقتة' },
      { name: 'setup-rating',    desc: 'تسطيب اعدادات التقييم' },
      { name: 'setcommandrole',  desc: 'ربط رتبة معينة بأمر معين' },
      { name: 'setup-logs',      desc: 'تسطيب نظام اللوج' },
      { name: 'logs-info',       desc: 'معلومات نظام اللوج في السيرفر' },
      { name: 'alias',           desc: 'إدارة اختصارات الأوامر' },
      { name: 'set-shortcut',    desc: 'تحديد اختصار لأمر معين' },
      { name: 'autoreply-add',   desc: 'لاضافة رد تلقائي' },
      { name: 'autoreply-list',  desc: 'لرؤية جميع الردود التلقائية' },
      { name: 'autoreply-remove',desc: 'لازالة رد تلقائي' },
      { name: 'avatar',          desc: 'رؤية افاتارك او شخص اخر' },
      { name: 'banner',          desc: 'رؤية بانرك او شخص اخر' },
      { name: 'user',            desc: 'رؤية معلومات حسابك او شخص اخر' },
      { name: 'server',          desc: 'رؤية معلومات السيرفر' },
      { name: 'inrole',          desc: 'عرض جميع الأعضاء الذين يمتلكون رتبة معينة' },
      { name: 'roles',           desc: 'للاستعلام عن رتب السيرفر' },
      { name: 'embed',           desc: 'قول كلام في ايمبد' },
      { name: 'say',             desc: 'قول كلام' },
      { name: 'send',            desc: 'لارسال رسالة لشخص ما' },
      { name: 'ai',              desc: 'التحدث مع الذكاء الاصطناعي (ZENO)' },
      { name: 'ask',             desc: 'اسأل ذكاء ZENO الاصطناعي أي سؤال!' },
      { name: 'ping',            desc: 'لتجربة سرعة البوت' },
      { name: 'help',            desc: 'قائمة اوامر البوت' },
    ]
  }
};

module.exports = {
  name: 'help',
  description: 'قائمة اوامر البوت',
  aliases: ['h', 'اوامر', 'مساعدة'],
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('عرض قائمة أوامر البوت الكاملة بشكل تفاعلي'),

  async execute(interaction, client) {
    const embed = this.getMainEmbed();
    const row = this.getSelectMenu();
    await interaction.reply({ embeds: [embed], components: [row] });
    const response = await interaction.fetchReply();
    this.handleMenu(response, interaction.user.id, client);
  },

  async executePrefix(message, args, client) {
    const embed = this.getMainEmbed();
    const row = this.getSelectMenu();
    const response = await message.reply({ embeds: [embed], components: [row] });
    this.handleMenu(response, message.author.id, client);
  },

  getMainEmbed() {
    const totalCommands = Object.values(CATEGORIES).reduce((sum, cat) => sum + cat.commands.length, 0);
    return new EmbedBuilder()
      .setColor(config.colors?.primary || '#9333ea')
      .setTitle('📚 دليل أوامر بوت ZENO الشامل')
      .setDescription(
        `مرحباً! يمتلك البوت **${totalCommands} أمراً** موزعاً على **${Object.keys(CATEGORIES).length} فئات**.\n` +
        `اختر الفئة من القائمة المنسدلة لعرض الأوامر التفصيلية 👇`
      )
      .addFields(
        Object.entries(CATEGORIES).map(([, cat]) => ({
          name: `${cat.emoji} ${cat.title}`,
          value: `\`${cat.commands.length} أمر\``,
          inline: true
        }))
      )
      .setFooter({ text: `ZENO Bot • ${totalCommands} أمر إجمالي • اختر فئة للتفاصيل` })
      .setTimestamp();
  },

  getSelectMenu() {
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('🔍 اختر فئة لعرض أوامرها...')
        .addOptions(
          Object.entries(CATEGORIES).map(([key, cat]) => ({
            label: `${cat.emoji} ${cat.title}`,
            value: key,
            description: `${cat.commands.length} أمر`
          }))
        )
    );
  },

  getMention(client, name) {
    const id = client.slashCommandIds?.get(name) || '0';
    return `</${name}:${id}>`;
  },

  handleMenu(response, userId, client) {
    const collector = response.createMessageComponentCollector({
      filter: (i) => i.customId === 'help_category_select' && i.user.id === userId,
      time: 180000
    });

    collector.on('collect', async (i) => {
      const key = i.values[0];
      const cat = CATEGORIES[key];
      if (!cat) return;

      const lines = cat.commands.map(cmd => {
        const mention = this.getMention(client, cmd.name);
        return `• ${mention} — ${cmd.desc}`;
      });

      const embed = new EmbedBuilder()
        .setColor(cat.color || config.colors?.primary || '#9333ea')
        .setTitle(`${cat.emoji} ${cat.title}`)
        .setDescription(lines.join('\n\n') || 'لا توجد أوامر في هذه الفئة.')
        .setFooter({ text: `${cat.commands.length} أمر في هذه الفئة • اختر فئة أخرى من القائمة` })
        .setTimestamp();

      await i.update({ embeds: [embed], components: [this.getSelectMenu()] });
    });

    collector.on('end', () => {
      // انتهى وقت الكولكتور
    });
  }
};
