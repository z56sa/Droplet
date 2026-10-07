const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');
const dictAdmin = require('../../lang/dict-admin');

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

function buildStatusEmbed(guild, logsConfig, settings, lang) {
  const enabledCount = Object.values(logsConfig).filter(c => c && (c.enabled === true || c.enabled === 1 || c.enabled === '1')).length;
  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(t(lang, 'admin.logs.status_title', { guild: guild.name }))
    .setDescription(t(lang, 'admin.logs.status_desc'))
    .addFields(
      { name: t(lang, 'admin.logs.f_general'), value: settings.logs_enabled === 0 ? t(lang, 'admin.logs.v_off') : t(lang, 'admin.logs.v_on'), inline: true },
      { name: t(lang, 'admin.logs.f_enabled'), value: `${enabledCount} / ${TOTAL_LOGS}`, inline: true },
      { name: t(lang, 'admin.logs.f_sections'), value: t(lang, 'admin.logs.sections_value'), inline: true }
    );

  const catLines = Object.keys(LOG_CATEGORIES).map(k => {
    const cat = LOG_CATEGORIES[k];
    const chId = settings['log_channel_' + k];
    const chStr = chId ? `<#${chId}>` : '`—`';
    const anyEnabled = Object.keys(logsConfig).some(id => logsConfig[id] && logsConfig[id].enabled && categoryMatchesEvent(k, id));
    return `${cat.icon} ${t(lang, 'admin.logs.cat.' + k)} — ${chStr} ${anyEnabled ? '✅' : '⬜'}`;
  });
  embed.addFields({ name: t(lang, 'admin.logs.f_channels'), value: catLines.join('\n').slice(0, 1024) || '—' });
  embed.setFooter({ text: t(lang, 'admin.logs.footer') }).setTimestamp();
  return embed;
}

function buildCategoryChoices() {
  return Object.keys(LOG_CATEGORIES).map(k => ({
    name: `${LOG_CATEGORIES[k].icon} ${dictAdmin.en['admin.logs.cat.' + k]}`,
    value: k
  }));
}

function catTitle(lang, key) {
  return t(lang, 'admin.logs.cat.' + key);
}

module.exports = {
  name: 'logs',
  description: 'نظام سجلات السيرفر الشاملة (Audit Logs) — إعداد وإدارة 105 سجلات في 13 قسم',
  aliases: ['سجلات', 'لوق', 'سجل'],
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Comprehensive server logs system (Audit Logs)')

    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('Create log channels automatically in the server')

        .addStringOption(opt =>
          opt.setName('mode')
            .setDescription('Creation mode')

            .setRequired(true)
            .addChoices(
              { name: 'Normal channels (one per section)', value: 'grouped' },
              { name: 'Detailed channels (one per log type)', value: 'detailed' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('channel')
        .setDescription('Set the default channel for a log section')

        .addStringOption(opt =>
          opt.setName('category')
            .setDescription('The logs section')

            .setRequired(true)
            .addChoices(...buildCategoryChoices())
        )
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('The channel logs will be sent in')

            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('enable')
        .setDescription('Enable all logs of a section')

        .addStringOption(opt =>
          opt.setName('category')
            .setDescription('The logs section')

            .setRequired(true)
            .addChoices(...buildCategoryChoices())
        )
    )
    .addSubcommand(sub =>
      sub.setName('disable')
        .setDescription('Disable all logs of a section')

        .addStringOption(opt =>
          opt.setName('category')
            .setDescription('The logs section')

            .setRequired(true)
            .addChoices(...buildCategoryChoices())
        )
    )
    .addSubcommand(sub =>
      sub.setName('toggle')
        .setDescription('Enable or disable all logs')

        .addStringOption(opt =>
          opt.setName('state')
            .setDescription('Logs state')

            .setRequired(true)
            .addChoices(
              { name: '✅ Enable', value: 'on' },
              { name: '❌ Disable', value: 'off' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Show server log settings and status')

    )
    .addSubcommand(sub =>
      sub.setName('test')
        .setDescription('Send a test log to a section to verify it works')

        .addStringOption(opt =>
          opt.setName('category')
            .setDescription('The logs section')

            .setRequired(true)
            .addChoices(...buildCategoryChoices())
        )
    )
    .addSubcommand(sub =>
      sub.setName('delete-channels')
        .setDescription('Delete the Droplet logs category, all channels and disable logs')

    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'admin.common.no_admin'), flags: 64 });
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
          .setTitle(t(lang, 'admin.logs.setup_title'))
          .setDescription(t(lang, 'admin.logs.setup_desc', {
            count: created.length,
            category: LOGS_CATEGORY_NAME,
            mode: t(lang, mode === 'grouped' ? 'admin.logs.mode_grouped' : 'admin.logs.mode_detailed')
          }))
          .addFields({ name: t(lang, 'admin.logs.f_created'), value: created.slice(0, 15).map(c => `<#${c.id}>`).join('، ') + (created.length > 15 ? t(lang, 'admin.logs.and_more', { n: created.length - 15 }) : '') })
          .setFooter({ text: t(lang, 'admin.logs.footer') })
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });

      } else if (sub === 'channel') {
        const category = interaction.options.getString('category');
        const channel = interaction.options.getChannel('channel');
        db.updateGuildSetting(guildId, 'log_channel_' + category, channel.id);

        const cat = LOG_CATEGORIES[category];
        const embed = new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle(t(lang, 'admin.logs.channel_title'))
          .setDescription(t(lang, 'admin.logs.channel_desc', { icon: cat.icon, title: catTitle(lang, category), channel: channel.id }))
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
          .setTitle(t(lang, sub === 'enable' ? 'admin.logs.enable_title' : 'admin.logs.disable_title'))
          .setDescription(t(lang, sub === 'enable' ? 'admin.logs.enable_desc' : 'admin.logs.disable_desc', { icon: cat.icon, count, title: catTitle(lang, category) }))
          .setTimestamp();
        await interaction.reply({ embeds: [embed] });

      } else if (sub === 'toggle') {
        const state = interaction.options.getString('state');
        db.updateGuildSetting(guildId, 'logs_enabled', state === 'on' ? 1 : 0);

        const embed = new EmbedBuilder()
          .setColor(state === 'on' ? config.colors.success : config.colors.danger)
          .setTitle(t(lang, state === 'on' ? 'admin.logs.toggle_on_title' : 'admin.logs.toggle_off_title'))
          .setDescription(t(lang, state === 'on' ? 'admin.logs.toggle_on_desc' : 'admin.logs.toggle_off_desc'))
          .setTimestamp();
        await interaction.reply({ embeds: [embed] });

      } else if (sub === 'list') {
        const settings = db.getGuildSettings(guildId) || {};
        const logsConfig = getLogsConfig(guildId);
        await interaction.reply({ embeds: [buildStatusEmbed(guild, logsConfig, settings, lang)] });

      } else if (sub === 'test') {
        await interaction.deferReply({ flags: 64 });
        const category = interaction.options.getString('category');
        const cat = LOG_CATEGORIES[category];
        const settings = db.getGuildSettings(guildId) || {};

        const { sendServerLog } = require('../../utils/serverLogger');
        const TEST_EVENT_IDS = { members: 'member_join', messages: 'msg_delete', roles: 'role_create', voice: 'vc_join', channels: 'channel_create', moderation: 'mod_warn_add', server: 'server_update', invites: 'invite_create', emojis: 'emoji_create', events: 'event_create', integrations: 'bot_add', automod: 'automod_rule_create', stage: 'stage_create' };
        const testEventId = TEST_EVENT_IDS[category] || (category + '_test');

        await sendServerLog(guild, testEventId, category, {
          title: t(lang, 'admin.logs.test_title', { icon: cat.icon, title: catTitle(lang, category) }),
          desc: t(lang, 'admin.logs.test_desc', { title: catTitle(lang, category) }),
          footer: t(lang, 'admin.logs.test_footer')
        });

        const embed = new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle(t(lang, 'admin.logs.test_sent_title'))
          .setDescription(t(lang, 'admin.logs.test_sent_desc', {
            icon: cat.icon,
            title: catTitle(lang, category),
            channel: settings['log_channel_' + category] ? t(lang, 'admin.logs.test_sent_channel', { channel: settings['log_channel_' + category] }) : ''
          }))
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });

      } else if (sub === 'delete-channels') {
        await interaction.deferReply({ flags: 64 });
        const deleted = await deleteLogsChannels(guild);

        const embed = new EmbedBuilder()
          .setColor(config.colors.warning)
          .setTitle(t(lang, 'admin.logs.delete_title'))
          .setDescription(t(lang, 'admin.logs.delete_desc', { category: LOGS_CATEGORY_NAME, count: deleted }))
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (err) {
      console.error('Logs command error:', err);
      const reply = { content: t(lang, 'admin.logs.error', { err: err.message }), flags: 64 };
      if (interaction.deferred) await interaction.editReply(reply).catch(() => {});
      else await interaction.reply(reply).catch(() => {});
    }
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild.id);
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply(t(lang, 'admin.common.no_admin'));
    }

    const guild = message.guild;
    const guildId = guild.id;
    const action = (args[0] || '').toLowerCase();
    const sections = Object.keys(LOG_CATEGORIES).join('، ');

    try {
      if (action === 'setup') {
        const mode = (args[1] || 'grouped').toLowerCase() === 'detailed' ? 'detailed' : 'grouped';
        const msg = await message.reply(t(lang, 'admin.logs.prefix_creating'));
        const created = await runSetup(guild, mode);

        const embed = new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle(t(lang, 'admin.logs.setup_title'))
          .setDescription(t(lang, 'admin.logs.setup_prefix_desc', {
            count: created.length,
            category: LOGS_CATEGORY_NAME,
            mode: t(lang, mode === 'grouped' ? 'admin.logs.mode_grouped_short' : 'admin.logs.mode_detailed_short')
          }))
          .addFields({ name: t(lang, 'admin.logs.f_created'), value: created.slice(0, 15).map(c => `<#${c.id}>`).join('، ') + (created.length > 15 ? t(lang, 'admin.logs.and_more', { n: created.length - 15 }) : '') })
          .setTimestamp();
        await msg.edit({ content: '', embeds: [embed] });

      } else if (action === 'channel') {
        const categoryKey = (args[1] || '').toLowerCase();
        const channel = message.mentions.channels.first();
        if (!LOG_CATEGORIES[categoryKey] || !channel) {
          return message.reply(t(lang, 'admin.logs.prefix_channel_usage', { sections }));
        }
        db.updateGuildSetting(guildId, 'log_channel_' + categoryKey, channel.id);
        const cat = LOG_CATEGORIES[categoryKey];
        message.reply(t(lang, 'admin.logs.prefix_channel_set', { icon: cat.icon, title: catTitle(lang, categoryKey), channel: channel.id }));

      } else if (action === 'enable' || action === 'disable') {
        const categoryKey = (args[1] || '').toLowerCase();
        if (!LOG_CATEGORIES[categoryKey]) {
          return message.reply(t(lang, 'admin.logs.prefix_enable_usage', { action, sections }));
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
        message.reply(t(lang, action === 'enable' ? 'admin.logs.prefix_enabled' : 'admin.logs.prefix_disabled', { count, title: catTitle(lang, categoryKey), icon: cat.icon }));

      } else if (action === 'on' || action === 'off') {
        db.updateGuildSetting(guildId, 'logs_enabled', action === 'on' ? 1 : 0);
        message.reply(t(lang, action === 'on' ? 'admin.logs.prefix_on' : 'admin.logs.prefix_off'));

      } else if (action === 'list') {
        const settings = db.getGuildSettings(guildId) || {};
        const logsConfig = getLogsConfig(guildId);
        message.reply({ embeds: [buildStatusEmbed(guild, logsConfig, settings, lang)] });

      } else if (action === 'test') {
        const categoryKey = (args[1] || '').toLowerCase();
        if (!LOG_CATEGORIES[categoryKey]) {
          return message.reply(t(lang, 'admin.logs.prefix_test_usage', { sections }));
        }
        const cat = LOG_CATEGORIES[categoryKey];
        const { sendServerLog } = require('../../utils/serverLogger');
        await sendServerLog(guild, categoryKey === 'members' ? 'member_join' : categoryKey === 'messages' ? 'msg_delete' : categoryKey === 'roles' ? 'role_create' : categoryKey === 'voice' ? 'vc_join' : categoryKey + '_test', categoryKey, {
          title: t(lang, 'admin.logs.test_title', { icon: cat.icon, title: catTitle(lang, categoryKey) }),
          desc: t(lang, 'admin.logs.test_desc', { title: catTitle(lang, categoryKey) }),
          footer: t(lang, 'admin.logs.test_footer')
        });
        message.reply(t(lang, 'admin.logs.prefix_test_sent', { icon: cat.icon, title: catTitle(lang, categoryKey) }));

      } else if (action === 'delete' || action === 'delete-channels') {
        const msg = await message.reply(t(lang, 'admin.logs.prefix_deleting'));
        const deleted = await deleteLogsChannels(guild);
        await msg.edit(t(lang, 'admin.logs.prefix_deleted', { category: LOGS_CATEGORY_NAME, count: deleted }));

      } else {
        const helpEmbed = new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle(t(lang, 'admin.logs.help_title'))
          .setDescription(t(lang, 'admin.logs.help_desc'))
          .addFields(
            { name: t(lang, 'admin.logs.help_setup'), value: t(lang, 'admin.logs.help_setup_value'), inline: false },
            { name: t(lang, 'admin.logs.help_control'), value: t(lang, 'admin.logs.help_control_value'), inline: false },
            { name: t(lang, 'admin.logs.help_sections'), value: Object.keys(LOG_CATEGORIES).map(k => `${LOG_CATEGORIES[k].icon} ${catTitle(lang, k)}`).join('، ') }
          )
          .setFooter({ text: t(lang, 'admin.logs.help_footer') })
          .setTimestamp();
        message.reply({ embeds: [helpEmbed] });
      }
    } catch (err) {
      console.error('Logs prefix command error:', err);
      message.reply(t(lang, 'admin.logs.prefix_error', { err: err.message })).catch(() => {});
    }
  }
};

// Shared helpers for the dashboard API endpoints
module.exports._runSetup = runSetup;
module.exports._deleteLogsChannels = deleteLogsChannels;
module.exports._LOG_CATEGORIES = LOG_CATEGORIES;
module.exports._LOGS_CATEGORY_NAME = LOGS_CATEGORY_NAME;
