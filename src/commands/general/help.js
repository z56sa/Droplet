const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const config = require('../../config.json');
const { t } = require('../../utils/lang');

// =============================================
// Full command list with categories.
// Display strings live in src/lang/dict-general.js
// ('general.help.cat.<key>' / 'general.help.cmd.<name>').
// =============================================
const CATEGORIES = {
  mod: {
    emoji: '🛡️',
    color: '#ef4444',
    commands: [
      'ban', 'unban', 'unbanall', 'kick', 'mute', 'timeout', 'untimeout',
      'untimeall', 'warn', 'unwarn', 'warns', 'clear', 'lock', 'unlock',
      'hide', 'show', 'unhide', 'nickname', 'demote', 'promote', 'role',
      'role-all', 'xroles', 'come', 'snipe'
    ]
  },
  protection: {
    emoji: '🔐',
    color: '#f97316',
    commands: [
      'anti-ban', 'anti-bots', 'anti-delete-roles', 'anti-delete-rooms',
      'antilink', 'antispam', 'badwords', 'protection-status', 'set-protect-logs'
    ]
  },
  tickets: {
    emoji: '🎫',
    color: '#8b5cf6',
    commands: [
      'setup-ticket', 'add-ticket-button', 'add-button', 'close', 'delete',
      'rename', 'add-user', 'remove-user', 'to-select', 'set-ticket-log',
      'setup-apply', 'new-apply', 'close-apply'
    ]
  },
  giveaway: {
    emoji: '🎉',
    color: '#ec4899',
    commands: ['gstart', 'gend', 'greroll']
  },
  economy: {
    emoji: '💰',
    color: '#eab308',
    commands: ['daily', 'rovex', 'tax', 'profile', 'rank', 'top']
  },
  autoline: {
    emoji: '📏',
    color: '#06b6d4',
    commands: [
      'add-autoline-channel', 'remove-autoline-channel', 'set-autoline-line',
      'line-mode', 'add-nadeko-room', 'remove-nadeko-room', 'set-feedback-line',
      'set-feedback-room', 'set-suggestions-line', 'set-suggestions-room',
      'suggestion-mode', 'set-tax-line', 'set-tax-room', 'tax-mode'
    ]
  },
  settings: {
    emoji: '⚙️',
    color: '#10b981',
    commands: [
      'greet', 'setup-welcome', 'set-message', 'autorole', 'settempvoice',
      'setup-rating', 'setcommandrole', 'setup-logs', 'logs-info', 'alias',
      'set-shortcut', 'autoreply-add', 'autoreply-list', 'autoreply-remove',
      'avatar', 'banner', 'user', 'server', 'inrole', 'roles', 'embed',
      'say', 'send', 'ai', 'ask', 'ping', 'help'
    ]
  }
};

module.exports = {
  name: 'help',
  description: 'قائمة اوامر البوت',
  aliases: ['h', 'اوامر', 'مساعدة'],
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('View the full interactive bot command list'),

  async execute(interaction, client) {
    const gid = interaction.guild.id;
    const embed = this.getMainEmbed(gid);
    const row = this.getSelectMenu(gid);
    await interaction.reply({ embeds: [embed], components: [row] });
    const response = await interaction.fetchReply();
    this.handleMenu(response, interaction.user.id, client, gid);
  },

  async executePrefix(message, args, client) {
    const gid = message.guild.id;
    const embed = this.getMainEmbed(gid);
    const row = this.getSelectMenu(gid);
    const response = await message.reply({ embeds: [embed], components: [row] });
    this.handleMenu(response, message.author.id, client, gid);
  },

  getMainEmbed(langOrGuildId) {
    const totalCommands = Object.values(CATEGORIES).reduce((sum, cat) => sum + cat.commands.length, 0);
    return new EmbedBuilder()
      .setColor(config.colors?.primary || '#9333ea')
      .setTitle(t(langOrGuildId, 'general.help.main_title'))
      .setDescription(
        t(langOrGuildId, 'general.help.main_desc', { total: totalCommands, cats: Object.keys(CATEGORIES).length })
      )
      .addFields(
        Object.entries(CATEGORIES).map(([key, cat]) => ({
          name: `${cat.emoji} ${t(langOrGuildId, `general.help.cat.${key}`)}`,
          value: t(langOrGuildId, 'general.help.field_value', { n: cat.commands.length }),
          inline: true
        }))
      )
      .setFooter({ text: t(langOrGuildId, 'general.help.footer_main', { total: totalCommands }) })
      .setTimestamp();
  },

  getSelectMenu(langOrGuildId) {
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder(t(langOrGuildId, 'general.help.select_placeholder'))
        .addOptions(
          Object.entries(CATEGORIES).map(([key, cat]) => ({
            label: `${cat.emoji} ${t(langOrGuildId, `general.help.cat.${key}`)}`.slice(0, 100),
            value: key,
            description: t(langOrGuildId, 'general.help.option_desc', { n: cat.commands.length })
          }))
        )
    );
  },

  getMention(client, name) {
    const id = client.slashCommandIds?.get(name) || '0';
    return `</${name}:${id}>`;
  },

  handleMenu(response, userId, client, langOrGuildId) {
    const collector = response.createMessageComponentCollector({
      filter: (i) => i.customId === 'help_category_select' && i.user.id === userId,
      time: 180000
    });

    collector.on('collect', async (i) => {
      const gid = i.guild?.id || langOrGuildId;
      const key = i.values[0];
      const cat = CATEGORIES[key];
      if (!cat) return;

      const lines = cat.commands.map(name => {
        const mention = this.getMention(client, name);
        return `• ${mention} — ${t(gid, `general.help.cmd.${name}`)}`;
      });

      const embed = new EmbedBuilder()
        .setColor(cat.color || config.colors?.primary || '#9333ea')
        .setTitle(`${cat.emoji} ${t(gid, `general.help.cat.${key}`)}`)
        .setDescription(lines.join('\n\n') || t(gid, 'general.help.cat_empty'))
        .setFooter({ text: t(gid, 'general.help.cat_footer', { n: cat.commands.length }) })
        .setTimestamp();

      await i.update({ embeds: [embed], components: [this.getSelectMenu(gid)] });
    });

    collector.on('end', () => {
      // Collector expired
    });
  }
};
