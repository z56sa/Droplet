const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'applications',
  description: 'إدارة نظام التقديمات ونقاط المراجعين في السيرفر',
  aliases: ['تقديمات', 'تقديم'],
  data: new SlashCommandBuilder()
    .setName('applications')
    .setDescription('Manage the application system and review requests')

    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('pending')
        .setDescription('Show pending applications and requests')

    )
    .addSubcommandGroup(group =>
      group
        .setName('points')
        .setDescription('Manage application reviewer points')

        .addSubcommand(sub =>
          sub
            .setName('list')
            .setDescription('Show your or another member application points')

            .addUserOption(opt => opt.setName('user').setDescription('The member to check points for').setRequired(false))
        )
        .addSubcommand(sub =>
          sub
            .setName('set')
            .setDescription('Set application points for a member')

            .addUserOption(opt => opt.setName('user').setDescription('The member').setRequired(true))
            .addIntegerOption(opt => opt.setName('points').setDescription('The number of points').setRequired(true).setMinValue(0))
        )
        .addSubcommand(sub =>
          sub
            .setName('reset_user')
            .setDescription('Reset application points for a member')

            .addUserOption(opt => opt.setName('user').setDescription('The member').setRequired(true))
        )
        .addSubcommand(sub =>
          sub
            .setName('reset_server')
            .setDescription('Reset all application points in the entire server')

        )
    ),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    const subGroup = interaction.options.getSubcommandGroup(false);
    const subCmd = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // 1. عرض الطلبات المعلقة (applications pending)
    if (subCmd === 'pending') {
      const pendingList = db.getPendingSubmissions(guildId);
      if (!pendingList || pendingList.length === 0) {
        return interaction.reply({ content: t(lang, 'admin.applications.pending_empty'), flags: 64 });
      }

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(t(lang, 'admin.applications.pending_title'))
        .setDescription(t(lang, 'admin.applications.pending_desc', { count: pendingList.length }))
        .setFooter({ text: t(lang, 'admin.applications.pending_footer') })
        .setTimestamp();

      pendingList.slice(0, 10).forEach((sub, i) => {
        const app = db.getApplication(sub.app_id);
        embed.addFields({
          name: t(lang, 'admin.applications.pending_row_name', { i: i + 1, id: sub.id, title: app ? app.title : t(lang, 'admin.applications.default_form_name') }),
          value: t(lang, 'admin.applications.pending_row_value', { user: sub.user_id, time: sub.submitted_at })
        });
      });

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // 2. إدارة النقاط (applications points)
    if (subGroup === 'points') {
      if (subCmd === 'list') {
        const target = interaction.options.getUser('user') || interaction.user;
        const points = db.getUserApplicationPoints(guildId, target.id);

        const embed = new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle(t(lang, 'admin.applications.points_title'))
          .setDescription(t(lang, 'admin.applications.points_desc', { user: target, tag: target.tag, points }))
          .setFooter({ text: t(lang, 'admin.applications.points_footer') })
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      if (subCmd === 'set') {
        const target = interaction.options.getUser('user');
        const points = interaction.options.getInteger('points');
        db.setUserApplicationPoints(guildId, target.id, points);

        return interaction.reply({
          content: t(lang, 'admin.applications.set_success', { user: target, points })
        });
      }

      if (subCmd === 'reset_user') {
        const target = interaction.options.getUser('user');
        db.resetApplicationPoints(guildId, target.id);

        return interaction.reply({
          content: t(lang, 'admin.applications.reset_user_success', { user: target })
        });
      }

      if (subCmd === 'reset_server') {
        db.resetApplicationPoints(guildId);

        return interaction.reply({
          content: t(lang, 'admin.applications.reset_server_success')
        });
      }
    }
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild.id);
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply(t(lang, 'admin.applications.prefix_no_perm'));
    }

    const sub = args[0]?.toLowerCase();
    if (sub === 'pending') {
      const pendingList = db.getPendingSubmissions(message.guild.id);
      return message.reply(t(lang, 'admin.applications.prefix_pending_count', { count: pendingList ? pendingList.length : 0 }));
    }

    message.reply(t(lang, 'admin.applications.prefix_use_slash'));
  }
};
