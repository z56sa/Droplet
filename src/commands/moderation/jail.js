const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ms = require('ms');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'jail',
  description: 'نظام سجن الأعضاء المخالفين وعزلهم عن السيرفر',
  aliases: ['سجن', 'حبس', 'unjail', 'فك_سجن'],
  data: new SlashCommandBuilder()
    .setName('jail')
    .setDescription('نظام سجن وعزل الأعضاء المخالفين')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('سجن عضو وعزله في روم ورتبة السجن')
        .addUserOption(opt => opt.setName('target').setDescription('العضو المراد سجنه').setRequired(true))
        .addStringOption(opt => opt.setName('duration').setDescription('مدة السجن (مثال: 30m, 2h, 1d) - اتركه فارغاً لدائم').setRequired(false))
        .addStringOption(opt => opt.setName('reason').setDescription('سبب السجن').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('فك سجن عضو وإعادة رتبه السابقة')
        .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('سبب فك السجن').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('عرض قائمة المسجونين حالياً في السيرفر')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: '❌ ليس لديك صلاحية إدارة الأعضاء أو سجنهم.', flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const settings = db.getGuildSettings(guild.id);

    if (sub === 'list') {
      const jailedList = db.getGuildJailedUsers(guild.id);
      if (!jailedList || jailedList.length === 0) {
        return interaction.reply({ content: '🕊️ لا يوجد أي أعضاء مسجونين حالياً في السيرفر.', flags: 64 });
      }

      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle(`🔒 قائمة الأعضاء المسجونين (${jailedList.length})`)
        .setDescription(
          jailedList.map((j, i) => {
            const untilStr = j.jail_until ? `<t:${j.jail_until}:R>` : 'سجن مؤبد / دائم';
            return `**#${i + 1}** <@${j.user_id}> | 👮 المشرف: <@${j.moderator_id}>\n📋 السبب: \`${j.reason || 'بدون سبب'}\` | ⏳ ينتهي: ${untilStr}`;
          }).join('\n\n')
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    const targetUser = interaction.options.getUser('target');
    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return interaction.reply({ content: '❌ لم يتم العثور على هذا العضو في السيرفر.', flags: 64 });

    // البحث عن رتبة السجن
    let jailRole = null;
    if (settings.jail_role) {
      jailRole = guild.roles.cache.get(settings.jail_role) || await guild.roles.fetch(settings.jail_role).catch(() => null);
    }
    if (!jailRole) {
      jailRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed' || r.name.includes('سجن'));
    }

    if (sub === 'add') {
      if (member.id === interaction.user.id) return interaction.reply({ content: '❌ لا يمكنك سجن نفسك!', flags: 64 });
      if (member.id === guild.ownerId) return interaction.reply({ content: '❌ لا يمكنك سجن مالك السيرفر!', flags: 64 });
      if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== guild.ownerId) {
        return interaction.reply({ content: '❌ لا يمكنك سجن عضو رتبته أعلى منك أو مساوية لك.', flags: 64 });
      }

      // إذا لم تكن رتبة السجن موجودة، نقوم بإنشائها تلقائياً
      if (!jailRole && guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        try {
          jailRole = await guild.roles.create({
            name: 'Jailed',
            color: '#7f8c8d',
            reason: 'إنشاء رتبة السجن التلقائية لـ Droplet'
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
          content: '❌ لم يتم تعيين رتبة السجن! قم بإنشاء رتبة باسم `Jailed` أو حددها في الإعدادات.',
          flags: 64
        });
      }

      await interaction.deferReply().catch(() => {});

      const durationStr = interaction.options.getString('duration');
      const reason = interaction.options.getString('reason') || 'مخالفة قوانين السيرفر';
      let jailUntil = null;

      if (durationStr) {
        const msVal = ms(durationStr);
        if (!msVal) return interaction.editReply({ content: '❌ صيغة مدة غير صحيحة. استخدم: `10m`, `2h`, `1d`' });
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
        return interaction.editReply({ content: `❌ تعذر تعديل رتب العضو، تأكد أن رتبة البوت أعلى من رتب الأعضاء: ${e.message}` });
      }

      db.jailUser(guild.id, member.id, interaction.user.id, reason, userRoles, jailUntil);

      if (db.recordStaffAction) {
        db.recordStaffAction(guild.id, interaction.user.id, 'jail', member.id, reason, durationStr || 'دائم');
      }

      const dmEmbed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle(`🔒 تم سجلك في سيرفر ${guild.name}`)
        .setDescription(`تم تطبيق عقوبة السجن بحقك لعزلك عن السيرفر.`)
        .addFields(
          { name: '📋 السبب', value: reason },
          { name: '⏱️ المدة', value: durationStr ? durationStr : 'سجن غير محدد (دائم)', inline: true },
          { name: '👮 المشرف', value: interaction.user.tag, inline: true }
        )
        .setTimestamp();
      await member.send({ embeds: [dmEmbed] }).catch(() => {});

      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🔒 تم سجن العضو بنجاح')
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '👤 المسجون', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
          { name: '👮 المشرف', value: interaction.user.tag, inline: true },
          { name: '⏱️ المدة', value: durationStr ? durationStr : 'دائم', inline: true },
          { name: '📋 السبب', value: reason }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      this.sendToLog(guild, embed);

    } else if (sub === 'remove') {
      const jailedRecord = db.getJailUser(guild.id, member.id);
      if (!jailedRecord && (!jailRole || !member.roles.cache.has(jailRole.id))) {
        return interaction.reply({ content: '❌ هذا العضو ليس مسجوناً حالياً.', flags: 64 });
      }

      await interaction.deferReply().catch(() => {});
      const reason = interaction.options.getString('reason') || 'انتهاء العقوبة أو عفو إداري';

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
        .setTitle('🔓 تم فك سجن العضو')
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '👤 العضو', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
          { name: '👮 المشرف', value: interaction.user.tag, inline: true },
          { name: '📋 السبب', value: reason }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      this.sendToLog(guild, embed);
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ ليس لديك صلاحية سجن الأعضاء.');
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
      if (!targetUser) return message.reply('❌ الاستخدام: `#unjail @user [السبب]`');
      const member = await guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) return message.reply('❌ العضو غير موجود.');

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

      return message.reply(`🔓 تم فك سجن **${targetUser.tag}** واسترجاع رتبه بنجاح.`);
    }

    const targetUser = message.mentions.users.first();
    if (!targetUser) return message.reply('❌ الاستخدام: `#jail @user [المدة اختياري] [السبب]` أو `#unjail @user`');

    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply('❌ العضو غير موجود.');

    if (!jailRole) {
      return message.reply('❌ لم يتم ضبط رتبة السجن في السيرفر! استخدم `/jail add` لإنشائها وضبطها.');
    }

    let durationStr = null;
    let reason = 'مخالفة القوانين';
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
      .setTitle('🔒 تم سجن العضو')
      .addFields(
        { name: '👤 المسجون', value: targetUser.tag, inline: true },
        { name: '⏱️ المدة', value: durationStr || 'دائم', inline: true },
        { name: '📋 السبب', value: reason }
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
