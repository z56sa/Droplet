const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ms = require('ms');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'jail',
  description: 'نظام سجن الأعضاء المخالفين وعزلهم عن السيرفر',
  aliases: ['سجن', 'حبس', 'unjail', 'فك_سجن'],
  data: new SlashCommandBuilder()
    .setName('jail')
    .setDescription('Jail and isolate violating members')

    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Jail a member in the jail channel and role')

        .addUserOption(opt => opt.setName('target').setDescription('The member to jail').setRequired(true))
        .addStringOption(opt => opt.setName('duration').setDescription('Jail duration (e.g. 30m, 2h, 1d) — empty for permanent').setRequired(false))
        .addStringOption(opt => opt.setName('reason').setDescription('Jail reason').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Unjail a member and restore previous roles')

        .addUserOption(opt => opt.setName('target').setDescription('The member').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Unjail reason').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Show currently jailed members')

    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild?.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: t(lang, 'moderation.jail.no_perm'), flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const settings = db.getGuildSettings(guild.id);

    if (sub === 'list') {
      const jailedList = db.getGuildJailedUsers(guild.id);
      if (!jailedList || jailedList.length === 0) {
        return interaction.reply({ content: t(lang, 'moderation.jail.list_empty'), flags: 64 });
      }

      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle(t(lang, 'moderation.jail.list_title', { count: jailedList.length }))
        .setDescription(
          jailedList.map((j, i) => {
            const untilStr = j.jail_until ? `<t:${j.jail_until}:R>` : t(lang, 'moderation.jail.list_perm');
            return t(lang, 'moderation.jail.list_row', {
              i: i + 1, user: j.user_id, mod: j.moderator_id,
              reason: j.reason || t(lang, 'moderation.jail.list_no_reason'), until: untilStr
            });
          }).join('\n\n')
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    const targetUser = interaction.options.getUser('target');
    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return interaction.reply({ content: t(lang, 'moderation.jail.not_found'), flags: 64 });

    // البحث عن رتبة السجن
    let jailRole = null;
    if (settings.jail_role) {
      jailRole = guild.roles.cache.get(settings.jail_role) || await guild.roles.fetch(settings.jail_role).catch(() => null);
    }
    if (!jailRole) {
      jailRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed' || r.name.includes('سجن'));
    }

    if (sub === 'add') {
      if (member.id === interaction.user.id) return interaction.reply({ content: t(lang, 'moderation.jail.self'), flags: 64 });
      if (member.id === guild.ownerId) return interaction.reply({ content: t(lang, 'moderation.jail.owner'), flags: 64 });
      if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== guild.ownerId) {
        return interaction.reply({ content: t(lang, 'moderation.jail.higher'), flags: 64 });
      }

      // إذا لم تكن رتبة السجن موجودة، نقوم بإنشائها تلقائياً
      if (!jailRole && guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        try {
          jailRole = await guild.roles.create({
            name: 'Jailed',
            color: '#7f8c8d',
            reason: t(guild.id, 'moderation.jail.role_create_reason')
          });
          db.updateGuildSetting(guild.id, 'jail_role', jailRole.id);

          guild.channels.cache.forEach(ch => {
            ch.permissionOverwrites?.create(jailRole, {
              ViewChannel: false,
              SendMessages: false,
              Speak: false
            }).catch(() => {});
          });
        } catch (e) {}
      }

      if (!jailRole) {
        return interaction.reply({
          content: t(lang, 'moderation.jail.no_role'),
          flags: 64
        });
      }

      await interaction.deferReply().catch(() => {});

      const durationStr = interaction.options.getString('duration');
      const reason = interaction.options.getString('reason') || t(lang, 'moderation.jail.default_reason');
      let jailUntil = null;

      if (durationStr) {
        const msVal = ms(durationStr);
        if (!msVal) return interaction.editReply({ content: t(lang, 'moderation.jail.bad_duration') });
        jailUntil = Math.floor((Date.now() + msVal) / 1000);
      }

      const userRoles = member.roles.cache
        .filter(r => r.id !== guild.id && r.id !== jailRole.id)
        .map(r => r.id);

      try {
        if (userRoles.length > 0) {
          await member.roles.remove(userRoles).catch(() => {});
        }
        await member.roles.add(jailRole);
      } catch (e) {
        return interaction.editReply({ content: t(lang, 'moderation.jail.role_fail', { err: e.message }) });
      }

      db.jailUser(guild.id, member.id, interaction.user.id, reason, userRoles, jailUntil);

      if (db.recordStaffAction) {
        db.recordStaffAction(guild.id, interaction.user.id, 'jail', member.id, reason, durationStr || 'دائم');
      }

      const dmEmbed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle(t(lang, 'moderation.jail.dm_title', { guild: guild.name }))
        .setDescription(t(lang, 'moderation.jail.dm_desc'))
        .addFields(
          { name: t(lang, 'moderation.jail.field_reason'), value: reason },
          { name: t(lang, 'moderation.jail.field_duration'), value: durationStr ? durationStr : t(lang, 'moderation.jail.dm_indefinite'), inline: true },
          { name: t(lang, 'moderation.jail.field_by'), value: interaction.user.tag, inline: true }
        )
        .setTimestamp();
      await member.send({ embeds: [dmEmbed] }).catch(() => {});

      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle(t(lang, 'moderation.jail.title_add'))
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: t(lang, 'moderation.jail.field_jailed'), value: `${member.user.tag} (<@${member.id}>)`, inline: true },
          { name: t(lang, 'moderation.jail.field_by'), value: interaction.user.tag, inline: true },
          { name: t(lang, 'moderation.jail.field_duration'), value: durationStr ? durationStr : t(lang, 'moderation.jail.permanent'), inline: true },
          { name: t(lang, 'moderation.jail.field_reason'), value: reason }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      this.sendToLog(guild, embed);

    } else if (sub === 'remove') {
      const jailedRecord = db.getJailUser(guild.id, member.id);
      if (!jailedRecord && (!jailRole || !member.roles.cache.has(jailRole.id))) {
        return interaction.reply({ content: t(lang, 'moderation.jail.not_jailed'), flags: 64 });
      }

      await interaction.deferReply().catch(() => {});
      const reason = interaction.options.getString('reason') || t(lang, 'moderation.jail.default_unjail_reason');

      let restoredRoles = [];
      if (jailedRecord && jailedRecord.old_roles) {
        try {
          restoredRoles = JSON.parse(jailedRecord.old_roles);
        } catch (e) {}
      }

      try {
        if (jailRole && member.roles.cache.has(jailRole.id)) {
          await member.roles.remove(jailRole).catch(() => {});
        }
        if (restoredRoles.length > 0) {
          await member.roles.add(restoredRoles).catch(() => {});
        }
      } catch (e) {}

      db.unjailUser(guild.id, member.id);

      if (db.recordStaffAction) {
        db.recordStaffAction(guild.id, interaction.user.id, 'unjail', member.id, reason, 'إلغاء سجن');
      }

      const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle(t(lang, 'moderation.jail.title_remove'))
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: t(lang, 'moderation.jail.field_member'), value: `${member.user.tag} (<@${member.id}>)`, inline: true },
          { name: t(lang, 'moderation.jail.field_by'), value: interaction.user.tag, inline: true },
          { name: t(lang, 'moderation.jail.field_reason'), value: reason }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      this.sendToLog(guild, embed);
    }
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild?.id);
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply(t(lang, 'moderation.jail.prefix_no_perm'));
    }

    const invoked = (message.content.trim().slice(1).split(/\s+/)[0] || '').toLowerCase();
    const guild = message.guild;
    const settings = db.getGuildSettings(guild.id);

    let jailRole = null;
    if (settings.jail_role) {
      jailRole = guild.roles.cache.get(settings.jail_role);
    }
    if (!jailRole) {
      jailRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed' || r.name.includes('سجن'));
    }

    if (invoked === 'unjail' || invoked === 'فك_سجن') {
      const targetUser = message.mentions.users.first();
      if (!targetUser) return message.reply(t(lang, 'moderation.jail.prefix_unjail_usage'));
      const member = await guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) return message.reply(t(lang, 'moderation.jail.prefix_not_found'));

      const record = db.unjailUser(guild.id, member.id);
      if (jailRole && member.roles.cache.has(jailRole.id)) {
        await member.roles.remove(jailRole).catch(() => {});
      }
      if (record && record.old_roles) {
        try {
          const rIds = JSON.parse(record.old_roles);
          if (rIds.length) await member.roles.add(rIds).catch(() => {});
        } catch (e) {}
      }

      return message.reply(t(lang, 'moderation.jail.prefix_unjailed', { tag: targetUser.tag }));
    }

    const targetUser = message.mentions.users.first();
    if (!targetUser) return message.reply(t(lang, 'moderation.jail.prefix_jail_usage'));

    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply(t(lang, 'moderation.jail.prefix_not_found'));

    if (!jailRole) {
      return message.reply(t(lang, 'moderation.jail.prefix_no_role'));
    }

    let durationStr = null;
    let reason = t(lang, 'moderation.jail.prefix_default_reason');
    let jailUntil = null;

    if (args[1] && ms(args[1])) {
      durationStr = args[1];
      jailUntil = Math.floor((Date.now() + ms(durationStr)) / 1000);
      reason = args.slice(2).join(' ') || reason;
    } else {
      reason = args.slice(1).join(' ') || reason;
    }

    const userRoles = member.roles.cache.filter(r => r.id !== guild.id && r.id !== jailRole.id).map(r => r.id);
    if (userRoles.length > 0) await member.roles.remove(userRoles).catch(() => {});
    await member.roles.add(jailRole).catch(() => {});

    db.jailUser(guild.id, member.id, message.author.id, reason, userRoles, jailUntil);

    const embed = new EmbedBuilder()
      .setColor('#e74c3c')
      .setTitle(t(lang, 'moderation.jail.prefix_title_add'))
      .addFields(
        { name: t(lang, 'moderation.jail.field_jailed'), value: targetUser.tag, inline: true },
        { name: t(lang, 'moderation.jail.field_duration'), value: durationStr || t(lang, 'moderation.jail.permanent'), inline: true },
        { name: t(lang, 'moderation.jail.field_reason'), value: reason }
      ).setTimestamp();

    await message.reply({ embeds: [embed] });
    this.sendToLog(guild, embed);
  },

  sendToLog(guild, embed) {
    const settings = db.getGuildSettings(guild.id);
    if (settings?.log_channel) {
      const ch = guild.channels.cache.get(settings.log_channel);
      if (ch) ch.send({ embeds: [embed] }).catch(() => {});
    }
  }
};
