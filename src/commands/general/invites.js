// ========================================================
// FILE: src/commands/general/invites.js
// أوامر نظام تتبع الدعوات (Invite Tracker, Bonus Invites & Leaderboard)
// ========================================================
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'invites',
  description: 'عرض إحصائيات الدعوات وتتبع الأعضاء أو لوحة المتصدرين',
  aliases: ['دعوات', 'دعواتي', 'invites-lb', 'top-invites'],
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('أوامر نظام متتبع الدعوات (Invite Tracker)')
    .addSubcommand(sub =>
      sub.setName('show')
        .setDescription('عرض تفاصيل دعواتك أو دعوات عضو آخر')
        .addUserOption(opt => opt.setName('user').setDescription('العضو المراد فحص دعواته').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('leaderboard')
        .setDescription('عرض لوحة متصدري الدعوات في السيرفر')
    )
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('إضافة أو خصم دعوات إضافية لعضو (إدارة السيرفر فقط)')
        .addUserOption(opt => opt.setName('user').setDescription('العضو المستهدف').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('عدد الدعوات (استخدم رقماً سالباً للخصم)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('reset')
        .setDescription('تصفير إحصائيات الدعوات لعضو أو للسيرفر كاملاً')
        .addUserOption(opt => opt.setName('user').setDescription('العضو المراد تصفير دعواته (اتركه فارغاً للسيرفر كله)').setRequired(false))
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'show') {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const stats = db.getInvites(interaction.guild.id, targetUser.id);
      const inviterRecord = db.getMemberInviter(interaction.guild.id, targetUser.id);
      const inviterText = inviterRecord?.inviter_id ? `<@${inviterRecord.inviter_id}>` : (inviterRecord?.code ? `رابط خاص (\`${inviterRecord.code}\`)` : 'غير معروف (Direct / Vanity)');

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary || '#9333ea')
        .setTitle(`📨 إحصائيات دعوات: ${targetUser.username}`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .setDescription(`إجمالي الدعوات الصافية: **${stats.total}** دعوة صالحة ✨`)
        .addFields(
          { name: '✅ دعوات حقيقية (Regular)', value: `\`${stats.regular}\``, inline: true },
          { name: '🚪 مغادرين (Leaves)', value: `\`${stats.leaves}\``, inline: true },
          { name: '🤖 دعوات وهمية (Fake)', value: `\`${stats.fake}\``, inline: true },
          { name: '🎁 دعوات إضافية (Bonus)', value: `\`${stats.bonus}\``, inline: true },
          { name: '📊 الصافي (Net)', value: `**${stats.total}**`, inline: true },
          { name: '🔗 تمت دعوته بواسطة', value: inviterText, inline: true }
        )
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });

    } else if (sub === 'leaderboard') {
      const topList = db.getInvitesLeaderboard(interaction.guild.id, 10);
      if (!topList || topList.length === 0) {
        return interaction.reply({ content: '📊 لا توجد بيانات دعوات مسجلة في السيرفر حتى الآن.' });
      }

      const rows = topList.map((item, index) => {
        const medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : `\`#${index + 1}\``));
        return `${medal} <@${item.user_id}> ➔ **${item.total}** دعوة (✅ ${item.regular} | 🚪 ${item.leaves} | 🎁 ${item.bonus})`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor('#eab308')
        .setTitle(`🏆 قائمة متصدري الدعوات - ${interaction.guild.name}`)
        .setDescription(rows)
        .setFooter({ text: 'Droplet Invite Tracker' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });

    } else if (sub === 'add') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ هذا الأمر مخصص لإدارة السيرفر فقط (Manage Guild).', flags: 64 });
      }

      const targetUser = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');

      const updated = db.addBonusInvites(interaction.guild.id, targetUser.id, amount);
      const actionText = amount >= 0 ? `إضافة **+${amount}** دعوة إضافية` : `خصم **${amount}** دعوة`;

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#10b981')
            .setDescription(`✅ **تم ${actionText} للعضو ${targetUser} بنجاح.**\nإجمالي رصيده الجديد: **${updated.total}** دعوة.`)
        ]
      });

    } else if (sub === 'reset') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ يتطلب صلاحية Administrator لتصفير الدعوات.', flags: 64 });
      }

      const targetUser = interaction.options.getUser('user');
      if (targetUser) {
        db.resetInvites(interaction.guild.id, targetUser.id);
        return interaction.reply({ content: `✅ تم تصفير جميع بيانات الدعوات للعضو ${targetUser}.` });
      } else {
        db.resetInvites(interaction.guild.id);
        return interaction.reply({ content: '✅ تم تصفير جميع بيانات الدعوات لكافة أعضاء السيرفر بنجاح.' });
      }
    }
  },

  async executePrefix(message, args) {
    const cmd = args[0]?.toLowerCase();

    if (cmd === 'lb' || cmd === 'top' || message.content.includes('top-invites') || message.content.includes('invites-lb')) {
      const topList = db.getInvitesLeaderboard(message.guild.id, 10);
      if (!topList || topList.length === 0) return message.reply('📊 لا توجد دعوات مسجلة حتى الآن.');

      const rows = topList.map((item, index) => {
        const medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : `\`#${index + 1}\``));
        return `${medal} <@${item.user_id}> ➔ **${item.total}** دعوة (✅ ${item.regular} | 🚪 ${item.leaves} | 🎁 ${item.bonus})`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor('#eab308')
        .setTitle(`🏆 متصدرو الدعوات - ${message.guild.name}`)
        .setDescription(rows)
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    if (cmd === 'add') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return message.reply('❌ مخصص للإدارة فقط.');
      const user = message.mentions.users.first();
      const amount = parseInt(args[2], 10);
      if (!user || isNaN(amount)) return message.reply('❌ الاستخدام: `#invites add @user <amount>`');

      const updated = db.addBonusInvites(message.guild.id, user.id, amount);
      return message.reply(`✅ تم تعديل دعوات ${user} بمقدار ${amount}. الإجمالي الجديد: **${updated.total}**`);
    }

    // Default: Show stats
    const targetUser = message.mentions.users.first() || message.author;
    const stats = db.getInvites(message.guild.id, targetUser.id);
    const inviterRecord = db.getMemberInviter(message.guild.id, targetUser.id);
    const inviterText = inviterRecord?.inviter_id ? `<@${inviterRecord.inviter_id}>` : (inviterRecord?.code ? `رابط (\`${inviterRecord.code}\`)` : 'غير معروف');

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary || '#9333ea')
      .setTitle(`📨 دعوات: ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setDescription(`إجمالي الدعوات: **${stats.total}** دعوة صالحة`)
      .addFields(
        { name: '✅ الحقيقية', value: `\`${stats.regular}\``, inline: true },
        { name: '🚪 المغادرين', value: `\`${stats.leaves}\``, inline: true },
        { name: '🤖 الوهمية', value: `\`${stats.fake}\``, inline: true },
        { name: '🎁 الإضافية', value: `\`${stats.bonus}\``, inline: true },
        { name: '📊 الصافي', value: `**${stats.total}**`, inline: true },
        { name: '🔗 الداعي', value: inviterText, inline: true }
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
};
