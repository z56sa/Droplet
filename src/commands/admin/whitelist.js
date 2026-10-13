const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'whitelist',
  description: 'إدارة القائمة البيضاء لنظام الحماية واستثناء المشرفين الموثوقين',
  aliases: ['وايت-لست', 'القائمة-البيضاء', 'استثناء'],
  category: 'admin',
  data: new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Manage the security protection whitelist')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a trusted user to the protection whitelist')
        .addUserOption(opt => opt.setName('user').setDescription('The user to trust').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a user from the protection whitelist')
        .addUserOption(opt => opt.setName('user').setDescription('The user to remove').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all whitelisted users and roles')
    )
    .addSubcommand(sub =>
      sub.setName('role')
        .setDescription('Set or remove the global whitelist role')
        .addRoleOption(opt => opt.setName('role').setDescription('Role to exempt from Anti-Nuke (leave empty to reset)').setRequired(false))
    ),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({ content: t(lang, 'admin.common.no_admin'), flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'add') {
      const targetUser = interaction.options.getUser('user');
      if (!targetUser) return interaction.reply({ content: '❌ يرجى تحديد العضو المطلوب.', flags: 64 });

      if (targetUser.id === interaction.guild.ownerId) {
        return interaction.reply({ content: 'ℹ️ مالك السيرفر مستثنى تلقائياً من كافة أنظمة الحماية.', flags: 64 });
      }

      db.addProtectionWhitelist(guildId, targetUser.id, 'whitelist', interaction.user.id);
      return interaction.reply({
        content: `✅ تمت إضافة <@${targetUser.id}> (\`${targetUser.tag}\`) إلى القائمة البيضاء للحماية بنجاح.`
      });
    }

    if (sub === 'remove') {
      const targetUser = interaction.options.getUser('user');
      if (!targetUser) return interaction.reply({ content: '❌ يرجى تحديد العضو المطلوب.', flags: 64 });

      db.removeProtectionWhitelist(guildId, targetUser.id, 'whitelist');
      return interaction.reply({
        content: `🗑️ تمت إزالة <@${targetUser.id}> (\`${targetUser.tag}\`) من القائمة البيضاء للحماية.`
      });
    }

    if (sub === 'role') {
      const role = interaction.options.getRole('role');
      if (!role) {
        db.updateGuildSetting(guildId, 'antinuke_whitelist_role', null);
        return interaction.reply({ content: '✅ تم إلغاء رتبة الاستثناء من نظام الحماية (Anti-Nuke Whitelist Role).' });
      }

      db.updateGuildSetting(guildId, 'antinuke_whitelist_role', role.id);
      return interaction.reply({
        content: `✅ تم تعيين رتبة الاستثناء من الحماية إلى: **${role.name}** (<@&${role.id}>).`
      });
    }

    if (sub === 'list') {
      const settings = db.getGuildSettings(guildId) || {};
      const whitelistRows = db.getProtectionWhitelist(guildId, 'whitelist') || [];
      const roleId = settings.antinuke_whitelist_role;

      let membersList = 'لا يوجد أعضاء في القائمة البيضاء بعد.';
      if (whitelistRows.length > 0) {
        membersList = whitelistRows
          .slice(0, 20)
          .map((row, idx) => `${idx + 1}. <@${row.user_id}> (\`${row.user_id}\`)`)
          .join('\n');
        if (whitelistRows.length > 20) {
          membersList += `\n... وهناك ${whitelistRows.length - 20} آخرين.`;
        }
      }

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🛡️ القائمة البيضاء لنظام الحماية (Security Whitelist)')
        .setDescription('المشرفون والرتب في هذه القائمة مستثنون بالكامل من إجراءات Anti-Nuke و Anti-Mod.')
        .addFields(
          { name: '👑 مالك السيرفر', value: `<@${interaction.guild.ownerId}> (مستثنى دائماً)`, inline: false },
          { name: '🎭 رتبة الاستثناء (Whitelist Role)', value: roleId ? `<@&${roleId}>` : 'غير محددة', inline: false },
          { name: `👥 الأعضاء المصرح لهم (${whitelistRows.length})`, value: membersList, inline: false }
        )
        .setFooter({ text: 'Droplet Security Shield' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild.id);
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && message.guild.ownerId !== message.author.id) {
      return message.reply(t(lang, 'admin.common.no_admin'));
    }

    const sub = (args[0] || '').toLowerCase();
    const guildId = message.guild.id;

    if (sub === 'add') {
      const targetUser = message.mentions.users.first() || (args[1] ? await message.client.users.fetch(args[1]).catch(() => null) : null);
      if (!targetUser) return message.reply('❌ يرجى منشن أو وضع أيدي العضو: `#whitelist add @user`');

      db.addProtectionWhitelist(guildId, targetUser.id, 'whitelist', message.author.id);
      return message.reply(`✅ تمت إضافة <@${targetUser.id}> (\`${targetUser.tag}\`) إلى القائمة البيضاء بنجاح.`);
    }

    if (sub === 'remove' || sub === 'delete') {
      const targetUser = message.mentions.users.first() || (args[1] ? await message.client.users.fetch(args[1]).catch(() => null) : null);
      if (!targetUser) return message.reply('❌ يرجى منشن أو وضع أيدي العضو: `#whitelist remove @user`');

      db.removeProtectionWhitelist(guildId, targetUser.id, 'whitelist');
      return message.reply(`🗑️ تمت إزالة <@${targetUser.id}> (\`${targetUser.tag}\`) من القائمة البيضاء.`);
    }

    if (sub === 'role') {
      const role = message.mentions.roles.first() || (args[1] ? message.guild.roles.cache.get(args[1]) : null);
      if (!role) {
        db.updateGuildSetting(guildId, 'antinuke_whitelist_role', null);
        return message.reply('✅ تم إلغاء رتبة الاستثناء من نظام الحماية.');
      }
      db.updateGuildSetting(guildId, 'antinuke_whitelist_role', role.id);
      return message.reply(`✅ تم تعيين رتبة الاستثناء من الحماية إلى: **${role.name}**.`);
    }

    // Default: list
    const settings = db.getGuildSettings(guildId) || {};
    const whitelistRows = db.getProtectionWhitelist(guildId, 'whitelist') || [];
    const roleId = settings.antinuke_whitelist_role;

    let membersList = 'لا يوجد أعضاء في القائمة البيضاء بعد.';
    if (whitelistRows.length > 0) {
      membersList = whitelistRows
        .slice(0, 20)
        .map((row, idx) => `${idx + 1}. <@${row.user_id}> (\`${row.user_id}\`)`)
        .join('\n');
      if (whitelistRows.length > 20) {
        membersList += `\n... وهناك ${whitelistRows.length - 20} آخرين.`;
      }
    }

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🛡️ القائمة البيضاء لنظام الحماية (Security Whitelist)')
      .setDescription('المشرفون والرتب في هذه القائمة مستثنون بالكامل من قيود الحماية.')
      .addFields(
        { name: '👑 مالك السيرفر', value: `<@${message.guild.ownerId}> (مستثنى دائماً)`, inline: false },
        { name: '🎭 رتبة الاستثناء', value: roleId ? `<@&${roleId}>` : 'غير محددة', inline: false },
        { name: `👥 الأعضاء المعتمدون (${whitelistRows.length})`, value: membersList, inline: false }
      )
      .setFooter({ text: 'Droplet Security Shield • الاستخدام: #whitelist add / remove / role / list' })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
};
