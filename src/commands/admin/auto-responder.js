const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'auto-responder',
  description: 'إدارة نظام الرد التلقائي على الكلمات المحددة',
  aliases: ['رد_تلقائي', 'autoresponder'],
  data: new SlashCommandBuilder()
    .setName('auto-responder')
    .setDescription('Manage the auto-reply system')

    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a new auto-reply')

        .addStringOption(opt => opt.setName('word').setDescription('The word that triggers the bot reply').setRequired(true))
        .addStringOption(opt => opt.setName('reply').setDescription('The bot reply').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Show the server auto-reply list')

    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete an auto-reply by its number (ID)')

        .addIntegerOption(opt => opt.setName('id').setDescription('The auto-reply number').setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(lang, 'common.no_manage_perm'), flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'add') {
      const word = interaction.options.getString('word');
      const reply = interaction.options.getString('reply');

      db.addAutoResponder(guildId, word, reply);

      const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle(t(lang, 'admin.autoresponder.add_title'))
        .addFields(
          { name: t(lang, 'admin.autoresponder.add_when'), value: `\`${word}\``, inline: true },
          { name: t(lang, 'admin.autoresponder.add_reply'), value: reply, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (sub === 'list') {
      const list = db.getAutoResponders(guildId);
      if (!list || list.length === 0) {
        return interaction.reply({ content: t(lang, 'admin.autoresponder.list_empty'), flags: 64 });
      }

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(t(lang, 'admin.autoresponder.list_title', { guild: interaction.guild.name }))
        .setDescription(
          list.map(r => t(lang, 'admin.autoresponder.list_row', { id: r.id, word: r.trigger_word, reply: r.reply_text })).join('\n\n')
        )
        .setFooter({ text: t(lang, 'admin.autoresponder.list_footer') })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (sub === 'delete') {
      const id = interaction.options.getInteger('id');
      const result = db.deleteAutoResponder(id, guildId);

      if (result.changes > 0) {
        await interaction.reply({ content: t(lang, 'admin.autoresponder.deleted', { id }) });
      } else {
        await interaction.reply({ content: t(lang, 'admin.autoresponder.not_found', { id }), flags: 64 });
      }
    }
  }
};
