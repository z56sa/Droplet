const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Manage the smart auto-moderation system (Auto-Mod)')

    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Show the status of all auto-moderation filters')

    )
    .addSubcommand(sub =>
      sub.setName('badwords')
        .setDescription('Configure the blocked-words filter')

        .addBooleanOption(opt => opt.setName('enable').setDescription('Enable or disable the filter').setRequired(true))
        .addStringOption(opt => opt.setName('words').setDescription('Words separated by comma (e.g. word1, word2)').setRequired(false))
        .addStringOption(opt =>
          opt.setName('action')
            .setDescription('Punishment type')

            .setRequired(false)
            .addChoices(
              { name: 'Warn only', value: 'warn' },
              { name: 'Timeout 5 minutes', value: 'timeout_5m' },
              { name: 'Timeout 1 hour', value: 'timeout_1h' },
              { name: 'Instant kick', value: 'kick' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('mentions')
        .setDescription('Configure mass-mention prevention')

        .addBooleanOption(opt => opt.setName('enable').setDescription('Enable or disable').setRequired(true))
        .addIntegerOption(opt => opt.setName('limit').setDescription('Max mentions per message (default: 4)').setMinValue(2).setMaxValue(20).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('caps')
        .setDescription('Configure caps lock prevention')

        .addBooleanOption(opt => opt.setName('enable').setDescription('Enable or disable').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('emojis')
        .setDescription('Configure emoji spam prevention')

        .addBooleanOption(opt => opt.setName('enable').setDescription('Enable or disable').setRequired(true))
        .addIntegerOption(opt => opt.setName('limit').setDescription('Max emojis per message (default: 5)').setMinValue(2).setMaxValue(30).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('lines')
        .setDescription('Configure repeated-lines spam prevention')

        .addBooleanOption(opt => opt.setName('enable').setDescription('Enable or disable').setRequired(true))
        .addIntegerOption(opt => opt.setName('limit').setDescription('Max lines per message (default: 8)').setMinValue(3).setMaxValue(50).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('whitelist')
        .setDescription('Set a role or channel exempt from auto-moderation')

        .addRoleOption(opt => opt.setName('role').setDescription('The exempt role').setRequired(false))
        .addChannelOption(opt => opt.setName('channel').setDescription('The exempt channel').setRequired(false))
    ),

  name: 'automod',
  description: 'إدارة الرقابة التلقائية',
  category: 'admin',
  aliases: ['رقابة', 'اوتومود'],

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const settings = db.getGuildSettings(guildId);

    if (sub === 'status') {
      const embed = buildStatusEmbed(settings, interaction.guild, lang);
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'badwords') {
      const enable = interaction.options.getBoolean('enable');
      const words = interaction.options.getString('words');
      const action = interaction.options.getString('action');

      db.updateGuildSetting(guildId, 'bad_words_enabled', enable ? 1 : 0);
      if (words !== null) db.updateGuildSetting(guildId, 'bad_words_list', words);
      if (action !== null) db.updateGuildSetting(guildId, 'automod_action', action);

      return interaction.reply({
        content: t(lang, 'admin.automod.badwords_updated', {
          state: enable ? t(lang, 'admin.automod.state_on') : t(lang, 'admin.automod.state_off'),
          words: words ? t(lang, 'admin.automod.words_part', { words }) : '',
          action: action ? t(lang, 'admin.automod.action_part', { action }) : ''
        }),
        flags: 64
      });
    }

    if (sub === 'mentions') {
      const enable = interaction.options.getBoolean('enable');
      const limit = interaction.options.getInteger('limit');

      db.updateGuildSetting(guildId, 'anti_mass_mention', enable ? 1 : 0);
      if (limit !== null) db.updateGuildSetting(guildId, 'max_mentions', limit);

      return interaction.reply({
        content: t(lang, 'admin.automod.mentions_updated', {
          state: enable ? t(lang, 'admin.automod.state_on') : t(lang, 'admin.automod.state_off'),
          limit: limit || settings.max_mentions || 4
        }),
        flags: 64
      });
    }

    if (sub === 'caps') {
      const enable = interaction.options.getBoolean('enable');
      db.updateGuildSetting(guildId, 'anti_caps', enable ? 1 : 0);
      return interaction.reply({
        content: t(lang, 'admin.automod.caps_updated', {
          state: enable ? t(lang, 'admin.automod.enabled_word') : t(lang, 'admin.automod.disabled_word')
        }),
        flags: 64
      });
    }

    if (sub === 'emojis') {
      const enable = interaction.options.getBoolean('enable');
      const limit = interaction.options.getInteger('limit');

      db.updateGuildSetting(guildId, 'anti_emoji_spam', enable ? 1 : 0);
      if (limit !== null) db.updateGuildSetting(guildId, 'max_emojis', limit);

      return interaction.reply({
        content: t(lang, 'admin.automod.emojis_updated', {
          state: enable ? t(lang, 'admin.automod.state_on') : t(lang, 'admin.automod.state_off'),
          limit: limit || settings.max_emojis || 5
        }),
        flags: 64
      });
    }

    if (sub === 'lines') {
      const enable = interaction.options.getBoolean('enable');
      const limit = interaction.options.getInteger('limit');

      db.updateGuildSetting(guildId, 'anti_line_spam', enable ? 1 : 0);
      if (limit !== null) db.updateGuildSetting(guildId, 'max_lines', limit);

      return interaction.reply({
        content: t(lang, 'admin.automod.lines_updated', {
          state: enable ? t(lang, 'admin.automod.state_on') : t(lang, 'admin.automod.state_off'),
          limit: limit || settings.max_lines || 8
        }),
        flags: 64
      });
    }

    if (sub === 'whitelist') {
      const role = interaction.options.getRole('role');
      const channel = interaction.options.getChannel('channel');

      if (role) db.updateGuildSetting(guildId, 'automod_whitelist_role', role.id);
      if (channel) db.updateGuildSetting(guildId, 'automod_whitelist_channel', channel.id);

      return interaction.reply({
        content: t(lang, 'admin.automod.whitelist_updated', {
          role: role ? t(lang, 'admin.automod.whitelist_role_part', { id: role.id }) : '',
          channel: channel ? t(lang, 'admin.automod.whitelist_channel_part', { id: channel.id }) : ''
        }),
        flags: 64
      });
    }
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild.id);
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply(t(lang, 'admin.automod.prefix_no_perm'));
    }
    const settings = db.getGuildSettings(message.guild.id);
    const embed = buildStatusEmbed(settings, message.guild, lang);
    return message.reply({ embeds: [embed] });
  }
};

function buildStatusEmbed(settings, guild, lang) {
  const wlRole = settings.automod_whitelist_role ? `<@&${settings.automod_whitelist_role}>` : t(lang, 'admin.automod.wl_default_role');
  const wlChan = settings.automod_whitelist_channel ? `<#${settings.automod_whitelist_channel}>` : t(lang, 'admin.automod.wl_default_channel');

  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(t(lang, 'admin.automod.status_title'))
    .setDescription(t(lang, 'admin.automod.status_desc', { guild: guild.name }))
    .addFields(
      {
        name: t(lang, 'admin.automod.f_antilink'),
        value: settings.anti_link ? t(lang, 'admin.automod.v_on') : t(lang, 'admin.automod.v_off'),
        inline: true
      },
      {
        name: t(lang, 'admin.automod.f_antispam'),
        value: settings.anti_spam ? t(lang, 'admin.automod.v_on') : t(lang, 'admin.automod.v_off'),
        inline: true
      },
      {
        name: t(lang, 'admin.automod.f_badwords'),
        value: settings.bad_words_enabled ? t(lang, 'admin.automod.v_badwords_on', { action: settings.automod_action || 'warn' }) : t(lang, 'admin.automod.v_off'),
        inline: true
      },
      {
        name: t(lang, 'admin.automod.f_mentions'),
        value: settings.anti_mass_mention ? t(lang, 'admin.automod.v_limit_on', { limit: settings.max_mentions || 4 }) : t(lang, 'admin.automod.v_off'),
        inline: true
      },
      {
        name: t(lang, 'admin.automod.f_caps'),
        value: settings.anti_caps ? t(lang, 'admin.automod.v_caps_on') : t(lang, 'admin.automod.v_off'),
        inline: true
      },
      {
        name: t(lang, 'admin.automod.f_emojis'),
        value: settings.anti_emoji_spam ? t(lang, 'admin.automod.v_limit_on', { limit: settings.max_emojis || 5 }) : t(lang, 'admin.automod.v_off'),
        inline: true
      },
      {
        name: t(lang, 'admin.automod.f_lines'),
        value: settings.anti_line_spam ? t(lang, 'admin.automod.v_limit_on', { limit: settings.max_lines || 8 }) : t(lang, 'admin.automod.v_off'),
        inline: true
      },
      {
        name: t(lang, 'admin.automod.f_whitelist'),
        value: t(lang, 'admin.automod.v_whitelist', { role: wlRole, channel: wlChan }),
        inline: false
      }
    )
    .setFooter({ text: t(lang, 'admin.automod.footer') })
    .setTimestamp();
}
