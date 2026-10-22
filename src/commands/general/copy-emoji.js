const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'copy-emoji',
  description: 'نسخ ايموجي من سيرفر اخر واضافته لسيرفرك',
  aliases: ['سرقة-ايموجي'],
  data: new SlashCommandBuilder()
    .setName('copy-emoji')
    .setDescription('Copy an emoji and add it to the server')
    .addStringOption(opt => opt.setName('emoji').setDescription('The emoji').setRequired(true))
    .addStringOption(opt => opt.setName('name').setDescription('New name (optional)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return interaction.reply({ content: t(interaction.guild.id, 'general.copy-emoji.no_perm'), flags: 64 });
    }
    const raw = interaction.options.getString('emoji');
    const match = raw.match(/<(a?):(\w+):(\d+)>/);
    if (!match) return interaction.reply({ content: t(interaction.guild.id, 'general.copy-emoji.invalid'), flags: 64 });
    const url = 'https://cdn.discordapp.com/emojis/' + match[3] + (match[1] ? '.gif' : '.png');
    // 🔒 (سد L5) اسم الإيموجي: حروف-أرقام_ فقط بحد أقصى 32 وtry/catch — بلاها خطأ غير معالج
    let name = (interaction.options.getString('name') || match[2] || 'emoji').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);
    if (name.length < 2) name = 'droplet_emoji';
    let created;
    try {
      created = await interaction.guild.emojis.create({ attachment: url, name: name });
    } catch (e) {
      return interaction.reply({ content: '❌ فشل إنشاء الإيموجي — تأكد أن الاسم صالح ومن عنوان من 2 إلى 32 حرفاً (حروف إنجليزية/أرقام/شرطة سفلية) وأن لدى البوت صلاحية Manage Expressions.', flags: 64 });
    }
    return interaction.reply({ content: t(interaction.guild.id, 'general.copy-emoji.done', { emoji: created.toString() }) });
  }
};
