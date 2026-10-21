const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'new-panel',
  description: 'انشاء بانل جديد',
  aliases: ['بانل-جديد'],
  data: new SlashCommandBuilder()
    .setName('new-panel')
    .setDescription('Create a new role panel')

    .addStringOption(opt => opt.setName('title').setDescription('The title').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('The description').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    // 🔒 بوابة حية (تشتغل بالسلاش والبريفكس عبر الشيم — member هو عضو حقيقي بالحالتين)
    const callerPerms = interaction.member?.permissions;
    const canManage = callerPerms && (callerPerms.has(PermissionFlagsBits.Administrator) || callerPerms.has(PermissionFlagsBits.ManageGuild));
    if (!canManage) {
      const lang = getGuildLang(interaction.guild.id);
      return interaction.reply({ content: '🔒 هذا الأمر للإدارة فقط — تحتاج صلاحية Administrator أو Manage Server.', flags: 64 });
    }
    const lang = getGuildLang(interaction.guild.id);
    const title = interaction.options.getString('title');
    const desc = interaction.options.getString('description');
    const embed = new EmbedBuilder().setColor('#5865F2').setTitle(title).setDescription(desc);
    const msg = await interaction.channel.send({ embeds: [embed] });
    return interaction.reply({ content: t(lang, 'admin.newpanel.created', { id: msg.id }) });
  }
};
