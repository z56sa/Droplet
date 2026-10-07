const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'role-all',
  description: 'إعطاء رتبة محددة لجميع أعضاء السيرفر أو البوتات أو البشر',
  aliases: ['رول-الكل', 'roleall'],
  data: new SlashCommandBuilder()
    .setName('role-all')
    .setDescription('Give a role to all members or remove it from them')

    .addSubcommand(sub =>
      sub.setName('give')
        .setDescription('Give a role to everyone')

        .addRoleOption(opt => opt.setName('role').setDescription('The role to give to everyone').setRequired(true))
        .addStringOption(opt =>
          opt.setName('target')
            .setDescription('Target category')

            .setRequired(false)
            .addChoices(
              { name: '👥 Everyone (humans and bots)', value: 'all' },
              { name: '👤 Humans only (no bots)', value: 'humans' },
              { name: '🤖 Bots only', value: 'bots' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a role from everyone')

        .addRoleOption(opt => opt.setName('role').setDescription('The role to remove from everyone').setRequired(true))
        .addStringOption(opt =>
          opt.setName('target')
            .setDescription('Target category')

            .setRequired(false)
            .addChoices(
              { name: '👥 Everyone (humans and bots)', value: 'all' },
              { name: '👤 Humans only (no bots)', value: 'humans' },
              { name: '🤖 Bots only', value: 'bots' }
            )
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild?.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: t(lang, 'moderation.role_all.no_perm'), flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    const role = interaction.options.getRole('role');
    const targetType = interaction.options.getString('target') || 'all';

    const botMember = interaction.guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: t(lang, 'moderation.role_all.bot_no_perm'), flags: 64 });
    }

    if (role.position >= botMember.roles.highest.position) {
      return interaction.reply({
        content: t(lang, 'moderation.role_all.higher', { role: role.id }),
        flags: 64
      });
    }

    if (role.managed) {
      return interaction.reply({
        content: t(lang, 'moderation.role_all.managed'),
        flags: 64
      });
    }

    await interaction.deferReply().catch(() => {});

    // جلب جميع أعضاء السيرفر
    await interaction.guild.members.fetch().catch(() => {});
    let members = interaction.guild.members.cache;

    if (targetType === 'humans') {
      members = members.filter(m => !m.user.bot);
    } else if (targetType === 'bots') {
      members = members.filter(m => m.user.bot);
    }

    const isGive = sub === 'give';
    const targetMembers = isGive
      ? members.filter(m => !m.roles.cache.has(role.id))
      : members.filter(m => m.roles.cache.has(role.id));

    const totalCount = targetMembers.size;
    if (totalCount === 0) {
      return interaction.editReply({
        content: t(lang, isGive ? 'moderation.role_all.none_give' : 'moderation.role_all.none_remove', { role: role.id })
      });
    }

    const targetLabel = t(lang, targetType === 'humans' ? 'moderation.role_all.target_humans' : targetType === 'bots' ? 'moderation.role_all.target_bots' : 'moderation.role_all.target_all');
    const initialEmbed = new EmbedBuilder()
      .setColor(config.colors?.primary || '#9333ea')
      .setTitle(t(lang, isGive ? 'moderation.role_all.initial_give' : 'moderation.role_all.initial_remove'))
      .setDescription(t(lang, 'moderation.role_all.initial_desc', { count: totalCount }))
      .addFields(
        { name: t(lang, 'moderation.role_all.field_role'), value: `<@&${role.id}>`, inline: true },
        { name: t(lang, 'moderation.role_all.field_target'), value: targetLabel, inline: true },
        { name: t(lang, 'moderation.role_all.field_total'), value: `${totalCount}`, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [initialEmbed] });

    let successCount = 0;
    let failCount = 0;

    for (const [, member] of targetMembers) {
      try {
        if (isGive) {
          await member.roles.add(role.id, t(lang, 'moderation.role_all.audit_give', { tag: interaction.user.tag }));
        } else {
          await member.roles.remove(role.id, t(lang, 'moderation.role_all.audit_remove', { tag: interaction.user.tag }));
        }
        successCount++;
      } catch (err) {
        failCount++;
      }

      // تأخير بسيط 300ms لتفادي الـ Rate-limit
      await new Promise(r => setTimeout(r, 300));
    }

    const finishEmbed = new EmbedBuilder()
      .setColor(failCount === 0 ? (config.colors?.success || '#2ecc71') : '#e67e22')
      .setTitle(t(lang, isGive ? 'moderation.role_all.finish_give' : 'moderation.role_all.finish_remove'))
      .setDescription(
        t(lang, isGive ? 'moderation.role_all.finish_desc_give' : 'moderation.role_all.finish_desc_remove', { role: role.id })
      )
      .addFields(
        { name: t(lang, 'moderation.role_all.field_role'), value: `<@&${role.id}>`, inline: true },
        { name: t(lang, 'moderation.role_all.field_success'), value: `${successCount}`, inline: true },
        { name: t(lang, 'moderation.role_all.field_fail'), value: `${failCount}`, inline: true },
        { name: t(lang, 'moderation.role_all.field_by'), value: `<@${interaction.user.id}>`, inline: false }
      )
      .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
      .setTimestamp();

    await interaction.editReply({ embeds: [finishEmbed] }).catch(() => {});
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild?.id);
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply(t(lang, 'moderation.role_all.no_perm'));
    }

    const botMember = message.guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply(t(lang, 'moderation.role_all.bot_no_perm'));
    }

    const action = args[0]?.toLowerCase();
    const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);

    if (!action || !['give', 'add', 'remove', 'del'].includes(action) || !role) {
      return message.reply({
        content: t(lang, 'moderation.role_all.prefix_usage')
      });
    }

    if (role.position >= botMember.roles.highest.position) {
      return message.reply(t(lang, 'moderation.role_all.prefix_higher', { role: role.id }));
    }

    if (role.managed) {
      return message.reply(t(lang, 'moderation.role_all.prefix_managed'));
    }

    const isGive = action === 'give' || action === 'add';
    const statusMsg = await message.reply(t(lang, 'moderation.role_all.prefix_status', { role: role.id }));

    await message.guild.members.fetch().catch(() => {});
    const members = message.guild.members.cache;
    const targetMembers = isGive
      ? members.filter(m => !m.roles.cache.has(role.id))
      : members.filter(m => m.roles.cache.has(role.id));

    const totalCount = targetMembers.size;
    if (totalCount === 0) {
      return statusMsg.edit(t(lang, isGive ? 'moderation.role_all.prefix_all_have' : 'moderation.role_all.prefix_none_have'));
    }

    let successCount = 0;
    let failCount = 0;

    for (const [, member] of targetMembers) {
      try {
        if (isGive) {
          await member.roles.add(role.id, t(lang, 'moderation.role_all.audit_give', { tag: message.author.tag }));
        } else {
          await member.roles.remove(role.id, t(lang, 'moderation.role_all.audit_remove', { tag: message.author.tag }));
        }
        successCount++;
      } catch (err) {
        failCount++;
      }
      await new Promise(r => setTimeout(r, 300));
    }

    const finishEmbed = new EmbedBuilder()
      .setColor(config.colors?.success || '#2ecc71')
      .setTitle(t(lang, isGive ? 'moderation.role_all.finish_give' : 'moderation.role_all.finish_remove'))
      .addFields(
        { name: t(lang, 'moderation.role_all.field_role'), value: `<@&${role.id}>`, inline: true },
        { name: t(lang, 'moderation.role_all.field_success'), value: `${successCount}`, inline: true },
        { name: t(lang, 'moderation.role_all.field_fail'), value: `${failCount}`, inline: true },
        { name: t(lang, 'moderation.role_all.field_by'), value: `<@${message.author.id}>`, inline: false }
      )
      .setTimestamp();

    await statusMsg.edit({ content: null, embeds: [finishEmbed] }).catch(() => {});
  }
};
