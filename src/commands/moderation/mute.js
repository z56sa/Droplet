const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ms = require('ms');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'mute',
  description: 'إسكات عضو كتابياً وصوتياً عبر رتبة Muted أو الـ Timeout',
  aliases: ['اسكات', 'كتم', 'unmute', 'فك_كتم', 'فك_اسكات'],
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('إسكات عضو كتابياً وصوتياً عبر رتبة Muted أو تايم آوت')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('إسكات عضو برتبة Muted مع تحديد مدة اختيارية')
        .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true))
        .addStringOption(opt => opt.setName('duration').setDescription('المدة (مثال: 10m, 1h, 1d) - اتركه فارغاً لدائم').setRequired(false))
        .addStringOption(opt => opt.setName('reason').setDescription('سبب الإسكات').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('فك الإسكات عن عضو وإزالة رتبة Muted')
        .addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('السبب').setRequired(false))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: '❌ ليس لديك صلاحية إسكات الأعضاء.', flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const targetUser = interaction.options.getUser('target');
    const member = await guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) return interaction.reply({ content: '❌ لم يتم العثور على هذا العضو في السيرفر.', flags: 64 });

    const settings = db.getGuildSettings(guild.id);
    let muteRole = null;
    if (settings.mute_role) {
      muteRole = guild.roles.cache.get(settings.mute_role) || await guild.roles.fetch(settings.mute_role).catch(() => null);
    }
    if (!muteRole) {
      muteRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'muted' || r.name.includes('مكتوم'));
    }

    if (sub === 'add') {
      if (member.id === interaction.user.id) return interaction.reply({ content: '❌ لا تستطيع كتم نفسك!', flags: 64 });
      if (member.id === guild.ownerId) return interaction.reply({ content: '❌ لا يمكنك كتم مالك السيرفر!', flags: 64 });
      if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== guild.ownerId) {
        return interaction.reply({ content: '❌ لا يمكنك كتم عضو رتبته أعلى منك أو مساوية لك.', flags: 64 });
      }

      await interaction.deferReply().catch(() => {});
      const durationStr = interaction.options.getString('duration');
      const reason = interaction.options.getString('reason') || 'مخالفة قوانين المحادثة';

      // إنشاء رتبة Muted إذا لم تكن موجودة
      if (!muteRole && guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        try {
          muteRole = await guild.roles.create({
            name: 'Muted',
            color: '#95a5a6',
            permissions: [],
            reason: 'إنشاء رتبة Muted التلقائية لـ Droplet'
          });
          db.updateGuildSetting(guild.id, 'mute_role', muteRole.id);

          guild.channels.cache.forEach(ch => {
            ch.permissionOverwrites?.create(muteRole, {
              SendMessages: false,
              AddReactions: false,
              Speak: false,
              SendMessagesInThreads: false
            }).catch(() => {});
          });
        } catch (e) {}
      }

      let unmuteAt = null;
      let durationMs = null;
      if (durationStr) {
        durationMs = ms(durationStr);
        if (!durationMs) return interaction.editReply({ content: '❌ صيغة مدة غير صحيحة. مثال: `10m`, `1h`, `1d`' });
        unmuteAt = Math.floor((Date.now() + durationMs) / 1000);
      }

      // تطبيق رتبة Muted + timeout كإجراء مزدوج للأمان
      if (muteRole) {
        await member.roles.add(muteRole).catch(() => {});
      }
      if (durationMs && durationMs <= 28 * 24 * 60 * 60 * 1000 && member.moderatable) {
        await member.timeout(durationMs, `${reason} | بواسطة ${interaction.user.tag}`).catch(() => {});
      }

      if (unmuteAt) {
        db.addTempMute(guild.id, member.id, interaction.user.id, reason, unmuteAt);
      }

      if (db.recordStaffAction) {
        db.recordStaffAction(guild.id, interaction.user.id, 'mute', member.id, reason, durationStr || 'دائم');
      }

      const dmEmbed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle(`🔇 تم إسكاتك في ${guild.name}`)
        .addFields(
          { name: '📋 السبب', value: reason },
          { name: '⏱️ المدة', value: durationStr || 'إسكات دائم', inline: true },
          { name: '👮 المشرف', value: interaction.user.tag, inline: true }
        ).setTimestamp();
      await member.send({ embeds: [dmEmbed] }).catch(() => {});

      const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('🔇 تم إسكات العضو بنجاح')
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '👤 العضو', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
          { name: '👮 المشرف', value: interaction.user.tag, inline: true },
          { name: '⏱️ المدة', value: durationStr || 'دائم', inline: true },
          { name: '📋 السبب', value: reason }
        ).setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      this.sendToLog(guild, embed);

    } else if (sub === 'remove') {
      await interaction.deferReply().catch(() => {});
      const reason = interaction.options.getString('reason') || 'فك الإسكات إدارياً';

      if (muteRole && member.roles.cache.has(muteRole.id)) {
        await member.roles.remove(muteRole).catch(() => {});
      }
      if (member.communicationDisabledUntilTimestamp) {
        await member.timeout(null, reason).catch(() => {});
      }

      db.removeTempMute(guild.id, member.id);

      if (db.recordStaffAction) {
        db.recordStaffAction(guild.id, interaction.user.id, 'unmute', member.id, reason, 'إلغاء إسكات');
      }

      const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🔊 تم رفع الإسكات عن العضو')
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '👤 العضو', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
          { name: '👮 المشرف', value: interaction.user.tag, inline: true },
          { name: '📋 السبب', value: reason }
        ).setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      this.sendToLog(guild, embed);
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ ليس لديك صلاحية إسكات الأعضاء.');
    }

    const invoked = (message.content.trim().slice(1).split(/\s+/)[0] || '').toLowerCase();
    const guild = message.guild;
    const settings = db.getGuildSettings(guild.id);

    let muteRole = null;
    if (settings.mute_role) {
      muteRole = guild.roles.cache.get(settings.mute_role);
    }
    if (!muteRole) {
      muteRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'muted' || r.name.includes('مكتوم'));
    }

    if (invoked === 'unmute' || invoked === 'فك_كتم' || invoked === 'فك_اسكات') {
      const targetUser = message.mentions.users.first();
      if (!targetUser) return message.reply('❌ الاستخدام: `#unmute @user [السبب]`');
      const member = await guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) return message.reply('❌ العضو غير موجود.');

      if (muteRole && member.roles.cache.has(muteRole.id)) {
        await member.roles.remove(muteRole).catch(() => {});
      }
      if (member.communicationDisabledUntilTimestamp) {
        await member.timeout(null).catch(() => {});
      }
      db.removeTempMute(guild.id, member.id);

      return message.reply(`🔊 تم رفع الإسكات عن **${targetUser.tag}** بنجاح.`);
    }

    const targetUser = message.mentions.users.first();
    if (!targetUser) return message.reply('❌ الاستخدام: `#mute @user [المدة اختياري] [السبب]` أو `#unmute @user`');
    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply('❌ العضو غير موجود.');

    let durationStr = null;
    let reason = 'مخالفة القوانين';
    let durationMs = null;
    let unmuteAt = null;

    if (args[1] && ms(args[1])) {
      durationStr = args[1];
      durationMs = ms(durationStr);
      unmuteAt = Math.floor((Date.now() + durationMs) / 1000);
      reason = args.slice(2).join(' ') || reason;
    } else {
      reason = args.slice(1).join(' ') || reason;
    }

    if (muteRole) await member.roles.add(muteRole).catch(() => {});
    if (durationMs && durationMs <= 28 * 24 * 60 * 60 * 1000 && member.moderatable) {
      await member.timeout(durationMs, reason).catch(() => {});
    }

    if (unmuteAt) db.addTempMute(guild.id, member.id, message.author.id, reason, unmuteAt);

    const embed = new EmbedBuilder()
      .setColor('#f39c12')
      .setTitle('🔇 تم إسكات العضو')
      .addFields(
        { name: '👤 العضو', value: targetUser.tag, inline: true },
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
