const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'add-button',
  description: 'إضافة زر رتبة أو زر معلومات لرسالة محددة',
  aliases: ['اضافة-زر', 'زر-معلومات'],
  data: new SlashCommandBuilder()
    .setName('add-button')
    .setDescription('Add a role or info button to a specific message')

    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('role')
        .setDescription('Add a role (Reaction Role) button to a message')

        .addStringOption(opt => opt.setName('message_id').setDescription('The message ID').setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('The role granted on press').setRequired(true))
        .addStringOption(opt => opt.setName('label').setDescription('The text written on the button').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('info')
        .setDescription('Add an interactive info button to a message')

        .addStringOption(opt => opt.setName('message_id').setDescription('The message ID').setRequired(true))
        .addStringOption(opt => opt.setName('label').setDescription('The text written on the button').setRequired(true))
    ),

  async execute(interaction) {
    // 🔒 بوابة حية (سد مسار البريفكس عبر الشيم — أمر إضافات الأزرار ينعكس على العضو العام)
    const callerPerms = interaction.member?.permissions;
    const canManage = callerPerms && callerPerms.has(PermissionFlagsBits.Administrator);
    if (!canManage) {
      const lang = getGuildLang(interaction.guild.id);
      return interaction.reply({ content: '🔒 هذا الأمر للإدارة فقط — تحتاج صلاحية Administrator.', flags: 64 });
    }
    const lang = getGuildLang(interaction.guild.id);
    const sub = interaction.options.getSubcommand();
    const msgId = interaction.options.getString('message_id');
    const label = interaction.options.getString('label');
    const msg = await interaction.channel.messages.fetch(msgId).catch(() => null);

    if (!msg) {
      return interaction.reply({ content: t(lang, 'admin.addbutton.msg_not_found'), flags: 64 });
    }

    if (sub === 'role') {
      const role = interaction.options.getRole('role');
      const customId = 'rr_' + role.id + '_' + Date.now();
      const btn = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Primary);
      let rows = msg.components.map(r => ActionRowBuilder.from(r));
      if (rows.length === 0 || rows[rows.length - 1].components.length >= 5) {
        rows.push(new ActionRowBuilder().addComponents(btn));
      } else {
        rows[rows.length - 1].addComponents(btn);
      }
      await msg.edit({ components: rows });
      // ✅ التسجيل عبر setReactionRole (كانت addReactionRole غير مُصدَّرة فلم يُحفظ الزر أبداً)
      try {
        if (db.setReactionRole) db.setReactionRole(customId, interaction.guild.id, role.id, msg.id, msg.channel.id);
      } catch (e) {
        console.error('[add-button] failed to save button role:', e.message);
      }
      return interaction.reply({ content: t(lang, 'admin.addbutton.role_added', { role: role.name }) });
    } else if (sub === 'info') {
      const btn = new ButtonBuilder().setCustomId('info_' + Date.now()).setLabel(label).setStyle(ButtonStyle.Secondary);
      let rows = msg.components.map(r => ActionRowBuilder.from(r));
      if (rows.length === 0 || rows[rows.length - 1].components.length >= 5) {
        rows.push(new ActionRowBuilder().addComponents(btn));
      } else {
        rows[rows.length - 1].addComponents(btn);
      }
      await msg.edit({ components: rows });
      return interaction.reply({ content: t(lang, 'admin.addbutton.info_added') });
    }
  }
};
