const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const config = require('../../config.json');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'server',
  description: 'عرض معلومات السيرفر وإحصائياته',
  aliases: ['serverinfo', 'سيرفر'],
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('عرض معلومات السيرفر وإحصائياته'),

  async execute(interaction) {
    const embed = await this.buildEmbed(interaction.guild);
    await interaction.reply({ embeds: [embed] });
  },

  async executePrefix(message) {
    const embed = await this.buildEmbed(message.guild);
    await message.reply({ embeds: [embed] });
  },

  async buildEmbed(guild) {
    try { await guild.fetch().catch(() => {}); } catch(e) {}
    const owner = await guild.fetchOwner().catch(() => null);
    const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
    const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
    const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;

    return new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(t(guild.id, 'general.server.title', { guild: guild.name }))
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: t(guild.id, 'general.server.field_id'), value: `\`${guild.id}\``, inline: true },
        { name: t(guild.id, 'general.server.field_owner'), value: owner ? `<@${owner.id}>` : t(guild.id, 'general.server.unknown'), inline: true },
        { name: t(guild.id, 'general.server.field_created'), value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
        { name: t(guild.id, 'general.server.field_members'), value: t(guild.id, 'general.server.members_value', { n: guild.memberCount }), inline: true },
        { name: t(guild.id, 'general.server.field_roles'), value: t(guild.id, 'general.server.roles_value', { n: guild.roles.cache.size }), inline: true },
        { name: t(guild.id, 'general.server.field_boost'), value: t(guild.id, 'general.server.boost_value', { tier: guild.premiumTier, count: guild.premiumSubscriptionCount || 0 }), inline: true },
        { name: t(guild.id, 'general.server.field_channels'), value: t(guild.id, 'general.server.channels_value', { t: textChannels, v: voiceChannels, c: categories }), inline: false }
      )
      .setTimestamp();
  }
};
