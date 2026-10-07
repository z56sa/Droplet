const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('إدارة وتخصيص منظومة الرقابة التلقائية الذكية (Auto-Mod)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('عرض الحالة الشاملة لكافة فلاتر الرقابة التلقائية')
    )
    .addSubcommand(sub =>
      sub.setName('badwords')
        .setDescription('إعداد فلتر الكلمات المحظورة والشتم')
        .addBooleanOption(opt => opt.setName('enable').setDescription('تفعيل أو تعطيل الفلتر').setRequired(true))
        .addStringOption(opt => opt.setName('words').setDescription('الكلمات مفصولة بفاصلة (مثال: كلمة1, كلمة2)').setRequired(false))
        .addStringOption(opt =>
          opt.setName('action')
            .setDescription('نوع العقوبة')
            .setRequired(false)
            .addChoices(
              { name: 'تحذير فقط (Warn)', value: 'warn' },
              { name: 'عزل مؤقت 5 دقائق (Timeout 5m)', value: 'timeout_5m' },
              { name: 'عزل مؤقت ساعة (Timeout 1h)', value: 'timeout_1h' },
              { name: 'طرد فوري (Kick)', value: 'kick' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('mentions')
        .setDescription('إعداد منع المنشن الجماعي والمفرط')
        .addBooleanOption(opt => opt.setName('enable').setDescription('تفعيل أو تعطيل').setRequired(true))
        .addIntegerOption(opt => opt.setName('limit').setDescription('الحد الأقصى للمنشن بالرسالة (افتراضي: 4)').setMinValue(2).setMaxValue(20).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('caps')
        .setDescription('إعداد منع الحروف الكبيرة (Caps Lock)')
        .addBooleanOption(opt => opt.setName('enable').setDescription('تفعيل أو تعطيل').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('emojis')
        .setDescription('إعداد منع سبام الإيموجيات')
        .addBooleanOption(opt => opt.setName('enable').setDescription('تفعيل أو تعطيل').setRequired(true))
        .addIntegerOption(opt => opt.setName('limit').setDescription('الحد الأقصى للإيموجيات بالرسالة (افتراضي: 5)').setMinValue(2).setMaxValue(30).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('lines')
        .setDescription('إعداد منع سبام الأسطر المتكررة')
        .addBooleanOption(opt => opt.setName('enable').setDescription('تفعيل أو تعطيل').setRequired(true))
        .addIntegerOption(opt => opt.setName('limit').setDescription('الحد الأقصى للأسطر بالرسالة (افتراضي: 8)').setMinValue(3).setMaxValue(50).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('whitelist')
        .setDescription('تحديد رتبة أو روم مستثنى من الرقابة التلقائية')
        .addRoleOption(opt => opt.setName('role').setDescription('الرتبة المستثناة').setRequired(false))
        .addChannelOption(opt => opt.setName('channel').setDescription('الروم المستثنى').setRequired(false))
    ),

  name: 'automod',
  description: 'إدارة الرقابة التلقائية',
  category: 'admin',
  aliases: ['رقابة', 'اوتومود'],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const settings = db.getGuildSettings(guildId);

    if (sub === 'status') {
      const embed = buildStatusEmbed(settings, interaction.guild);
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
        content: `✅ **تم تحديث فلتر الكلمات المحظورة بنجاح!**\nالحالة: ${enable ? '🟢 مفعل' : '🔴 معطل'}${words ? `\nالكلمات: \`${words}\`` : ''}${action ? `\nالإجراء: \`${action}\`` : ''}`,
        flags: 64
      });
    }

    if (sub === 'mentions') {
      const enable = interaction.options.getBoolean('enable');
      const limit = interaction.options.getInteger('limit');

      db.updateGuildSetting(guildId, 'anti_mass_mention', enable ? 1 : 0);
      if (limit !== null) db.updateGuildSetting(guildId, 'max_mentions', limit);

      return interaction.reply({
        content: `✅ **تم تحديث منع المنشن الجماعي!**\nالحالة: ${enable ? '🟢 مفعل' : '🔴 معطل'}\nالحد: **${limit || settings.max_mentions || 4} منشن**`,
        flags: 64
      });
    }

    if (sub === 'caps') {
      const enable = interaction.options.getBoolean('enable');
      db.updateGuildSetting(guildId, 'anti_caps', enable ? 1 : 0);
      return interaction.reply({
        content: `✅ **تم ${enable ? 'تفعيل 🟢' : 'تعطيل 🔴'} منع الحروف الكبيرة (Caps Lock)!**`,
        flags: 64
      });
    }

    if (sub === 'emojis') {
      const enable = interaction.options.getBoolean('enable');
      const limit = interaction.options.getInteger('limit');

      db.updateGuildSetting(guildId, 'anti_emoji_spam', enable ? 1 : 0);
      if (limit !== null) db.updateGuildSetting(guildId, 'max_emojis', limit);

      return interaction.reply({
        content: `✅ **تم تحديث منع سبام الإيموجيات!**\nالحالة: ${enable ? '🟢 مفعل' : '🔴 معطل'}\nالحد: **${limit || settings.max_emojis || 5} إيموجي**`,
        flags: 64
      });
    }

    if (sub === 'lines') {
      const enable = interaction.options.getBoolean('enable');
      const limit = interaction.options.getInteger('limit');

      db.updateGuildSetting(guildId, 'anti_line_spam', enable ? 1 : 0);
      if (limit !== null) db.updateGuildSetting(guildId, 'max_lines', limit);

      return interaction.reply({
        content: `✅ **تم تحديث منع سبام الأسطر!**\nالحالة: ${enable ? '🟢 مفعل' : '🔴 معطل'}\nالحد: **${limit || settings.max_lines || 8} أسطر**`,
        flags: 64
      });
    }

    if (sub === 'whitelist') {
      const role = interaction.options.getRole('role');
      const channel = interaction.options.getChannel('channel');

      if (role) db.updateGuildSetting(guildId, 'automod_whitelist_role', role.id);
      if (channel) db.updateGuildSetting(guildId, 'automod_whitelist_channel', channel.id);

      return interaction.reply({
        content: `✅ **تم تحديث الاستثناءات:**\n${role ? `👑 الرتبة المستثناة: <@&${role.id}>\n` : ''}${channel ? `💬 الروم المستثنى: <#${channel.id}>` : ''}`,
        flags: 64
      });
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
    }
    const settings = db.getGuildSettings(message.guild.id);
    const embed = buildStatusEmbed(settings, message.guild);
    return message.reply({ embeds: [embed] });
  }
};

function buildStatusEmbed(settings, guild) {
  const wlRole = settings.automod_whitelist_role ? `<@&${settings.automod_whitelist_role}>` : '`المشرفين فقط`';
  const wlChan = settings.automod_whitelist_channel ? `<#${settings.automod_whitelist_channel}>` : '`كل الرومات خاضعة للرقابة`';

  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🛡️ لوحة معلومات الرقابة التلقائية (Auto-Mod Pro)')
    .setDescription(`إليك الحالة الحالية لكافة فلاتر الرقابة الذكية في **${guild.name}**:`)
    .addFields(
      {
        name: '🚫 منع الروابط (Anti-Link)',
        value: settings.anti_link ? '🟢 **مفعل**' : '🔴 **معطل**',
        inline: true
      },
      {
        name: '⚡ منع السبام (Anti-Spam)',
        value: settings.anti_spam ? '🟢 **مفعل**' : '🔴 **معطل**',
        inline: true
      },
      {
        name: '🤬 فلتر الكلمات المحظورة',
        value: settings.bad_words_enabled ? `🟢 **مفعل** (الإجراء: \`${settings.automod_action || 'warn'}\`)` : '🔴 **معطل**',
        inline: true
      },
      {
        name: '📢 منع المنشن الجماعي',
        value: settings.anti_mass_mention ? `🟢 **مفعل** (الحد: ${settings.max_mentions || 4})` : '🔴 **معطل**',
        inline: true
      },
      {
        name: '🔤 منع الحروف الكبيرة (Caps)',
        value: settings.anti_caps ? '🟢 **مفعل** (>70%)' : '🔴 **معطل**',
        inline: true
      },
      {
        name: '😀 منع سبام الإيموجي',
        value: settings.anti_emoji_spam ? `🟢 **مفعل** (الحد: ${settings.max_emojis || 5})` : '🔴 **معطل**',
        inline: true
      },
      {
        name: '📜 منع سبام الأسطر',
        value: settings.anti_line_spam ? `🟢 **مفعل** (الحد: ${settings.max_lines || 8})` : '🔴 **معطل**',
        inline: true
      },
      {
        name: '👑 الاستثناءات (Whitelist)',
        value: `• الرتبة: ${wlRole}\n• الروم: ${wlChan}`,
        inline: false
      }
    )
    .setFooter({ text: 'Droplet Auto-Mod System • التعديل متاح أيضاً عبر لوحة الويب' })
    .setTimestamp();
}
