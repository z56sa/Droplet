const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

// 13 Category definitions (identical to dashboard logs section)
const LOG_CATEGORIES = {
  members: { title: 'الأعضاء', icon: '🎯', color: '#5865F2', channelName: '🎯┃سجل-الأعضاء' },
  roles: { title: 'الرتب', icon: '🎖️', color: '#9333ea', channelName: '🎖️┃سجل-الرتب' },
  channels: { title: 'القنوات', icon: '📌', color: '#3b82f6', channelName: '📌┃سجل-القنوات' },
  messages: { title: 'الرسائل', icon: '💬', color: '#10b981', channelName: '💬┃سجل-الرسائل' },
  voice: { title: 'الصوت', icon: '🎙️', color: '#ec4899', channelName: '🎙️┃سجل-الصوتيات' },
  moderation: { title: 'الإشراف', icon: '🛡️', color: '#ef4444', channelName: '🛡️┃سجل-الإشراف' },
  server: { title: 'السيرفر', icon: '⚙️', color: '#f59e0b', channelName: '⚙️┃سجل-السيرفر' },
  invites: { title: 'الدعوات', icon: '🔗', color: '#06b6d4', channelName: '🔗┃سجل-الدعوات' },
  emojis: { title: 'الإيموجي والستيكرز', icon: '😃', color: '#8b5cf6', channelName: '😃┃سجل-الإيموجي' },
  events: { title: 'الأحداث', icon: '📅', color: '#14b8a6', channelName: '📅┃سجل-الفعاليات' },
  integrations: { title: 'التكاملات', icon: '🔌', color: '#6366f1', channelName: '🔌┃سجل-التكاملات' },
  automod: { title: 'الأوتو مود', icon: '🤖', color: '#f43f5e', channelName: '🤖┃سجل-الرقابة' },
  stage: { title: 'المنصة', icon: '📢', color: '#84cc16', channelName: '📢┃سجل-المنصة' }
};

// Event id prefixes per category (must match dashboard LOG_CATEGORIES ids)
const CATEGORY_EVENT_PREFIXES = {
  members: ['member'],
  roles: ['role'],
  channels: ['channel', 'thread'],
  messages: ['msg'],
  voice: ['vc'],
  moderation: ['mod'],
  server: ['server'],
  invites: ['invite'],
  emojis: ['emoji', 'sticker'],
  events: ['event'],
  integrations: ['integration', 'webhook', 'bot'],
  automod: ['automod'],
  stage: ['stage']
};

// Detailed mode: extra channels for the busiest categories
const DETAILED_SUBCHANNELS = {
  members: [
    { name: '📥┃سجل-الدخول-والخروج', prefixes: ['member_join', 'member_leave'] },
    { name: '🪓┃سجل-الحظر-والطرد', prefixes: ['member_ban', 'member_unban', 'member_kick'] },
    { name: '⏳┃سجل-العزل-والإسكات', prefixes: ['member_timeout', 'member_untimeout', 'member_mute', 'member_unmute', 'member_prison', 'member_unprison'] },
    { name: '✏️┃سجل-تغييرات-الأعضاء', prefixes: ['member_nick', 'member_avatar', 'member_username', 'member_boost', 'member_suspicious'] }
  ],
  messages: [
    { name: '🗑️┃سجل-حذف-الرسائل', prefixes: ['msg_delete', 'msg_image_delete', 'msg_purge'] },
    { name: '✏️┃سجل-تعديل-الرسائل', prefixes: ['msg_update'] },
    { name: '📌┃سجل-التثبيت-والتفاعلات', prefixes: ['msg_pin', 'msg_unpin', 'msg_reaction'] }
  ],
  voice: [
    { name: '🔁┃سجل-حركة-الرومات', prefixes: ['vc_join', 'vc_leave', 'vc_switch', 'vc_disconnect'] },
    { name: '🔇┃سجل-كتم-الصوت', prefixes: ['vc_mute', 'vc_unmute', 'vc_deafen', 'vc_undeafen', 'vc_self'] },
    { name: '📺┃سجل-البث-والكاميرا', prefixes: ['vc_stream', 'vc_video'] }
  ]
};

const LOGS_CATEGORY_NAME = 'Droplet Server Logs';
const TOTAL_LOGS = 105;

function getLogsConfig(guildId) {
  const settings = db.getGuildSettings(guildId) || {};
  try {
    return (settings.logs_config ? (typeof settings.logs_config === 'string' ? JSON.parse(settings.logs_config) : settings.logs_config) : {}) || {};
  } catch (e) { return {}; }
}

function saveLogsConfig(guildId, logsConfig) {
  db.updateGuildSetting(guildId, 'logs_config', JSON.stringify(logsConfig));
  db.updateGuildSetting(guildId, 'logs_enabled', 1);
}

function categoryMatchesEvent(categoryKey, eventId) {
  const prefixes = CATEGORY_EVENT_PREFIXES[categoryKey] || [categoryKey];
  return prefixes.some(p => eventId.startsWith(p));
}

async function ensureLogsCategory(guild) {
  let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === LOGS_CATEGORY_NAME);
  if (!category) {
    category = await guild.channels.create({
      name: LOGS_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: ['ViewChannel'] },
        { id: guild.members.me.id, allow: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'ManageChannels'] }
      ]
    });
  }
  return category;
}

async function createLogChannel(guild, categoryName, name) {
  const existing = guild.channels.cache.find(c => c.name === name && c.type === ChannelType.GuildText);
  if (existing) return existing;
  const cat = await ensureLogsCategory(guild);
  return guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: cat.id,
    rateLimitPerUser: 5,
    topic: `قناة سجلات ${categoryName} — Droplet Logs`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: ['ViewChannel', 'SendMessages'] },
      { id: guild.members.me.id, allow: ['ViewChannel', 'SendMessages', 'EmbedLinks'] }
    ]
  });
}

async function runSetup(guild, mode) {
  const guildId = guild.id;
  const logsConfig = getLogsConfig(guildId);
  const created = [];

  await ensureLogsCategory(guild);

  // 1. Create one main channel per category (grouped) or extra detailed sub-channels
  const catChannelIds = {};
  for (const key of Object.keys(LOG_CATEGORIES)) {
    const cat = LOG_CATEGORIES[key];
    const ch = await createLogChannel(guild, cat.title, cat.channelName);
    created.push(ch);
    catChannelIds[key] = ch.id;
    db.updateGuildSetting(guildId, 'log_channel_' + key, ch.id);
  }

  // 2. Detailed mode: create sub-channels for busy categories and map their events
  const eventChannelMap = {};
  if (mode === 'detailed') {
    for (const [catKey, subs] of Object.entries(DETAILED_SUBCHANNELS)) {
      for (const sub of subs) {
        const ch = await createLogChannel(guild, LOG_CATEGORIES[catKey].title, sub.name);
        created.push(ch);
        for (const p of sub.prefixes) eventChannelMap[p] = ch.id;
      }
    }
  }

  // 3. Enable all known events and assign channels
  for (const eventId of Object.keys(logsConfig)) {
    for (const catKey of Object.keys(LOG_CATEGORIES)) {
      if (categoryMatchesEvent(catKey, eventId)) {
        logsConfig[eventId].enabled = true;
        logsConfig[eventId].channel_id = eventChannelMap[eventId] || catChannelIds[catKey];
        break;
      }
    }
  }
  saveLogsConfig(guildId, logsConfig);

  return created;
}

async function deleteLogsChannels(guild) {
  const guildId = guild.id;
  const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === LOGS_CATEGORY_NAME);
  let deleted = 0;
  if (category) {
    for (const ch of category.children.cache.values()) {
      await ch.delete().catch(() => {});
      deleted++;
    }
    await category.delete().catch(() => {});
  }
  db.updateGuildSetting(guildId, 'logs_enabled', 0);
  return deleted;
}

function buildStatusEmbed(guild, logsConfig, settings) {
  const enabledCount = Object.values(logsConfig).filter(c => c && (c.enabled === true || c.enabled === 1 || c.enabled === '1')).length;
  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`📜 سجلات السيرفر الشاملة | ${guild.name}`)
    .setDescription('نظام تتبع جميع الأحداث في السيرفر مع الفاعل والتفاصيل فورياً')
    .addFields(
      { name: '📊 الحالة العامة', value: settings.logs_enabled === 0 ? '🔴 معطلة' : '🟢 مفعلة', inline: true },
      { name: '✅ السجلات المفعلة', value: `${enabledCount} / ${TOTAL_LOGS}`, inline: true },
      { name: '📁 الأقسام', value: `13 قسم`, inline: true }
    );

  const catLines = Object.keys(LOG_CATEGORIES).map(k => {
    const cat = LOG_CATEGORIES[k];
    const chId = settings['log_channel_' + k];
    const chStr = chId ? `<#${chId}>` : '`—`';
    const anyEnabled = Object.keys(logsConfig).some(id => logsConfig[id] && logsConfig[id].enabled && categoryMatchesEvent(k, id));
    return `${cat.icon} ${cat.title} — ${chStr} ${anyEnabled ? '✅' : '⬜'}`;
  });
  embed.addFields({ name: '📁 قنوات الأقسام (13)', value: catLines.join('\n').slice(0, 1024) || '—' });
  embed.setFooter({ text: 'Droplet Logs • سجلات السيرفر' }).setTimestamp();
  return embed;
}

function buildCategoryChoices() {
  return Object.keys(LOG_CATEGORIES).map(k => ({ name: `${LOG_CATEGORIES[k].icon} ${LOG_CATEGORIES[k].title}`, value: k }));
}

module.exports = {
  name: 'logs',
  description: 'نظام سجلات السيرفر الشاملة (Audit Logs) — إعداد وإدارة 105 سجلات في 13 قسم',
  aliases: ['سجلات', 'لوق', 'سجل'],
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('نظام سجلات السيرفر الشاملة (Audit Logs)')
    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('إنشاء قنوات السجلات تلقائياً بالسيرفر')
        .addStringOption(opt =>
          opt.setName('mode')
            .setDescription('نظام الإنشاء')
            .setRequired(true)
            .addChoices(
              { name: 'قنوات عادية (قناة لكل قسم)', value: 'grouped' },
              { name: 'قنوات مفصلة (قناة لكل نوع سجل)', value: 'detailed' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('channel')
        .setDescription('تحديد القناة الافتراضية لقسم سجلات')
        .addStringOption(opt =>
          opt.setName('category')
            .setDescription('قسم السجلات')
            .setRequired(true)
            .addChoices(...buildCategoryChoices())
        )
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('القناة التي ستُرسل فيها السجلات')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('enable')
        .setDescription('تفعيل جميع سجلات قسم معين')
        .addStringOption(opt =>
          opt.setName('category')
            .setDescription('قسم السجلات')
            .setRequired(true)
            .addChoices(...buildCategoryChoices())
        )
    )
    .addSubcommand(sub =>
      sub.setName('disable')
        .setDescription('تعطيل جميع سجلات قسم معين')
        .addStringOption(opt =>
          opt.setName('category')
            .setDescription('قسم السجلات')
            .setRequired(true)
            .addChoices(...buildCategoryChoices())
        )
    )
    .addSubcommand(sub =>
      sub.setName('toggle')
        .setDescription('تفعيل أو تعطيل السجلات بالكامل')
        .addStringOption(opt =>
          opt.setName('state')
            .setDescription('حالة السجلات')
            .setRequired(true)
            .addChoices(
              { name: '✅ تفعيل', value: 'on' },
              { name: '❌ تعطيل', value: 'off' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('عرض إعدادات وحالة سجلات السيرفر')
    )
    .addSubcommand(sub =>
      sub.setName('test')
        .setDescription('إرسال سجل تجريبي لقسم معين للتأكد من العمل')
        .addStringOption(opt =>
          opt.setName('category')
            .setDescription('قسم السجلات')
            .setRequired(true)
            .addChoices(...buildCategoryChoices())
        )
    )
    .addSubcommand(sub =>
      sub.setName('delete-channels')
        .setDescription('حذف كاتيجوري سجلات Droplet وجميع القنوات بداخلها وتعطيل السجلات')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية الأدمن.', flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const guildId = guild.id;

    try {
      if (sub === 'setup') {
        await interaction.deferReply();
        const mode = interaction.options.getString('mode');
        const created = await runSetup(guild, mode);

        const embed = new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle('✅ تم إنشاء قنوات السجلات بنجاح')
          .setDescription(`تم إنشاء **${created.length}** قناة سجلات داخل كاتيجوري **${LOGS_CATEGORY_NAME}** بنظام: **${mode === 'grouped' ? 'قنوات عادية (قناة لكل قسم)' : 'قنوات مفصلة (قناة لكل نوع سجل)'}**\n\nتم تفعيل وتوزيع جميع السجلات تلقائياً 🎉`)
          .addFields({ name: '📁 القنوات المنشأة', value: created.slice(0, 15).map(c => `<#${c.id}>`).join('، ') + (created.length > 15 ? ` و${created.length - 15} أخرى` : '') })
          .setFooter({ text: 'Droplet Logs • سجلات السيرفر' })
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });

      } else if (sub === 'channel') {
        const category = interaction.options.getString('category');
        const channel = interaction.options.getChannel('channel');
        db.updateGuildSetting(guildId, 'log_channel_' + category, channel.id);

        const cat = LOG_CATEGORIES[category];
        const embed = new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle('✅ تم تحديد قناة السجلات')
          .setDescription(`${cat.icon} سجلات **${cat.title}** ستُرسل الآن في: <#${channel.id}>`)
          .setTimestamp();
        await interaction.reply({ embeds: [embed] });

      } else if (sub === 'enable' || sub === 'disable') {
        const category = interaction.options.getString('category');
        const cat = LOG_CATEGORIES[category];
        const logsConfig = getLogsConfig(guildId);

        let count = 0;
        for (const id of Object.keys(logsConfig)) {
          if (categoryMatchesEvent(category, id)) {
            logsConfig[id].enabled = sub === 'enable';
            count++;
          }
        }
        saveLogsConfig(guildId, logsConfig);

        const embed = new EmbedBuilder()
          .setColor(sub === 'enable' ? config.colors.success : config.colors.danger)
          .setTitle(sub === 'enable' ? '✅ تم تفعيل سجلات القسم' : '❌ تم تعطيل سجلات القسم')
          .setDescription(`${cat.icon} ${sub === 'enable' ? 'تم تفعيل' : 'تم تعطيل'} **${count}** سجل في قسم **${cat.title}**`)
          .setTimestamp();
        await interaction.reply({ embeds: [embed] });

      } else if (sub === 'toggle') {
        const state = interaction.options.getString('state');
        db.updateGuildSetting(guildId, 'logs_enabled', state === 'on' ? 1 : 0);

        const embed = new EmbedBuilder()
          .setColor(state === 'on' ? config.colors.success : config.colors.danger)
          .setTitle(state === 'on' ? '✅ تم تفعيل نظام السجلات' : '❌ تم تعطيل نظام السجلات')
          .setDescription(state === 'on'
            ? '📜 سيتم الآن تسجيل جميع الأحداث المفعلة في قنوات السجلات'
            : '📜 تم إيقاف تسجيل جميع السجلات بالكامل')
          .setTimestamp();
        await interaction.reply({ embeds: [embed] });

      } else if (sub === 'list') {
        const settings = db.getGuildSettings(guildId) || {};
        const logsConfig = getLogsConfig(guildId);
        await interaction.reply({ embeds: [buildStatusEmbed(guild, logsConfig, settings)] });

      } else if (sub === 'test') {
        await interaction.deferReply({ flags: 64 });
        const category = interaction.options.getString('category');
        const cat = LOG_CATEGORIES[category];
        const settings = db.getGuildSettings(guildId) || {};

        const { sendServerLog } = require('../../utils/serverLogger');
        const TEST_EVENT_IDS = { members: 'member_join', messages: 'msg_delete', roles: 'role_create', voice: 'vc_join', channels: 'channel_create', moderation: 'mod_warn_add', server: 'server_update', invites: 'invite_create', emojis: 'emoji_create', events: 'event_create', integrations: 'bot_add', automod: 'automod_rule_create', stage: 'stage_create' };
        const testEventId = TEST_EVENT_IDS[category] || (category + '_test');

        await sendServerLog(guild, testEventId, category, {
          title: `${cat.icon} سجل تجريبي — ${cat.title}`,
          desc: `هذا سجل تجريبي للتأكد من عمل نظام السجلات في قسم **${cat.title}**.\nإذا تشاهد هذه الرسالة فالنظام يعمل بنجاح ✅`,
          footer: 'Droplet Logs • رسالة تجريبية'
        });

        const embed = new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle('✅ تم إرسال السجل التجريبي')
          .setDescription(`${cat.icon} تم إرسال سجل تجريبي لقسم **${cat.title}**${settings['log_channel_' + category] ? ` إلى: <#${settings['log_channel_' + category]}>` : ''}`)
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });

      } else if (sub === 'delete-channels') {
        await interaction.deferReply({ flags: 64 });
        const deleted = await deleteLogsChannels(guild);

        const embed = new EmbedBuilder()
          .setColor(config.colors.warning)
          .setTitle('🗑️ تم حذف قنوات السجلات')
          .setDescription(`تم حذف كاتيجوري **${LOGS_CATEGORY_NAME}** و **${deleted}** قناة بداخلها، وتم تعطيل نظام السجلات.`)
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (err) {
      console.error('Logs command error:', err);
      const reply = { content: '❌ حدث خطأ أثناء تنفيذ الأمر: ' + err.message, flags: 64 };
      if (interaction.deferred) await interaction.editReply(reply).catch(() => {});
      else await interaction.reply(reply).catch(() => {});
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ لا تملك صلاحية الأدمن.');
    }

    const guild = message.guild;
    const guildId = guild.id;
    const action = (args[0] || '').toLowerCase();

    try {
      if (action === 'setup') {
        const mode = (args[1] || 'grouped').toLowerCase() === 'detailed' ? 'detailed' : 'grouped';
        const msg = await message.reply('⏳ جاري إنشاء قنوات السجلات...');
        const created = await runSetup(guild, mode);

        const embed = new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle('✅ تم إنشاء قنوات السجلات بنجاح')
          .setDescription(`تم إنشاء **${created.length}** قناة سجلات داخل كاتيجوري **${LOGS_CATEGORY_NAME}** بنظام: **${mode === 'grouped' ? 'قنوات عادية' : 'قنوات مفصلة'}**\n\nتم تفعيل وتوزيع جميع السجلات تلقائياً 🎉`)
          .addFields({ name: '📁 القنوات المنشأة', value: created.slice(0, 15).map(c => `<#${c.id}>`).join('، ') + (created.length > 15 ? ` و${created.length - 15} أخرى` : '') })
          .setTimestamp();
        await msg.edit({ content: '', embeds: [embed] });

      } else if (action === 'channel') {
        const categoryKey = (args[1] || '').toLowerCase();
        const channel = message.mentions.channels.first();
        if (!LOG_CATEGORIES[categoryKey] || !channel) {
          return message.reply(`❌ الاستخدام الصحيح: \`#logs channel <القسم> #روم\`\n📁 الأقسام: ${Object.keys(LOG_CATEGORIES).join('، ')}`);
        }
        db.updateGuildSetting(guildId, 'log_channel_' + categoryKey, channel.id);
        const cat = LOG_CATEGORIES[categoryKey];
        message.reply(`✅ ${cat.icon} سجلات **${cat.title}** ستُرسل الآن في: <#${channel.id}>`);

      } else if (action === 'enable' || action === 'disable') {
        const categoryKey = (args[1] || '').toLowerCase();
        if (!LOG_CATEGORIES[categoryKey]) {
          return message.reply(`❌ الاستخدام الصحيح: \`#logs ${action} <القسم>\`\n📁 الأقسام: ${Object.keys(LOG_CATEGORIES).join('، ')}`);
        }
        const cat = LOG_CATEGORIES[categoryKey];
        const logsConfig = getLogsConfig(guildId);
        let count = 0;
        for (const id of Object.keys(logsConfig)) {
          if (categoryMatchesEvent(categoryKey, id)) {
            logsConfig[id].enabled = action === 'enable';
            count++;
          }
        }
        saveLogsConfig(guildId, logsConfig);
        message.reply(`${action === 'enable' ? '✅ تم تفعيل' : '❌ تم تعطيل'} **${count}** سجل في قسم **${cat.title}**`);

      } else if (action === 'on' || action === 'off') {
        db.updateGuildSetting(guildId, 'logs_enabled', action === 'on' ? 1 : 0);
        message.reply(action === 'on' ? '✅ تم تفعيل نظام السجلات بالكامل 📜' : '❌ تم تعطيل نظام السجلات بالكامل 📜');

      } else if (action === 'list') {
        const settings = db.getGuildSettings(guildId) || {};
        const logsConfig = getLogsConfig(guildId);
        message.reply({ embeds: [buildStatusEmbed(guild, logsConfig, settings)] });

      } else if (action === 'test') {
        const categoryKey = (args[1] || '').toLowerCase();
        if (!LOG_CATEGORIES[categoryKey]) {
          return message.reply(`❌ الاستخدام الصحيح: \`#logs test <القسم>\`\n📁 الأقسام: ${Object.keys(LOG_CATEGORIES).join('، ')}`);
        }
        const cat = LOG_CATEGORIES[categoryKey];
        const { sendServerLog } = require('../../utils/serverLogger');
        await sendServerLog(guild, categoryKey === 'members' ? 'member_join' : categoryKey === 'messages' ? 'msg_delete' : categoryKey === 'roles' ? 'role_create' : categoryKey === 'voice' ? 'vc_join' : categoryKey + '_test', categoryKey, {
          title: `${cat.icon} سجل تجريبي — ${cat.title}`,
          desc: `هذا سجل تجريبي للتأكد من عمل نظام السجلات في قسم **${cat.title}**.\nإذا تشاهد هذه الرسالة فالنظام يعمل بنجاح ✅`,
          footer: 'Droplet Logs • رسالة تجريبية'
        });
        message.reply(`✅ ${cat.icon} تم إرسال سجل تجريبي لقسم **${cat.title}**`);

      } else if (action === 'delete' || action === 'delete-channels') {
        const msg = await message.reply('⏳ جاري حذف قنوات السجلات...');
        const deleted = await deleteLogsChannels(guild);
        await msg.edit(`🗑️ تم حذف كاتيجوري **${LOGS_CATEGORY_NAME}** و **${deleted}** قناة، وتعطيل السجلات.`);

      } else {
        const helpEmbed = new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle('📜 أوامر سجلات السيرفر الشاملة')
          .setDescription('نظام تتبع جميع الأحداث في السيرفر — 105 سجل في 13 قسم')
          .addFields(
            { name: '⚙️ الإعداد', value: [
              '`logs setup` — إنشاء قنوات السجلات تلقائياً (عادية)',
              '`logs setup detailed` — إنشاء قنوات مفصلة',
              '`logs channel <قسم> #روم` — تحديد قناة قسم',
              '`logs delete` — حذف قنوات السجلات'
            ].join('\n'), inline: false },
            { name: '🎛️ التحكم', value: [
              '`logs on / logs off` — تفعيل/تعطيل السجلات',
              '`logs enable <قسم>` — تفعيل سجلات قسم',
              '`logs disable <قسم>` — تعطيل سجلات قسم',
              '`logs test <قسم>` — سجل تجريبي',
              '`logs list` — عرض حالة السجلات'
            ].join('\n'), inline: false },
            { name: '📁 الأقسام (13)', value: Object.keys(LOG_CATEGORIES).map(k => `${LOG_CATEGORIES[k].icon} ${LOG_CATEGORIES[k].title}`).join('، ') }
          )
          .setFooter({ text: 'يمكنك إدارة كل سجل على حدة من لوحة التحكم الويب' })
          .setTimestamp();
        message.reply({ embeds: [helpEmbed] });
      }
    } catch (err) {
      console.error('Logs prefix command error:', err);
      message.reply('❌ حدث خطأ: ' + err.message).catch(() => {});
    }
  }
};

// Shared helpers for the dashboard API endpoints
module.exports._runSetup = runSetup;
module.exports._deleteLogsChannels = deleteLogsChannels;
module.exports._LOG_CATEGORIES = LOG_CATEGORIES;
module.exports._LOGS_CATEGORY_NAME = LOGS_CATEGORY_NAME;
