const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'set',
  description: 'أوامر ضبط وتخصيص البوت ولوحات الإدارة',
  aliases: ['ضبط', 'اعداد'],
  data: new SlashCommandBuilder()
    .setName('set')
    .setDescription('Bot settings and admin panels')

    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    // 1. /set message
    .addSubcommand(sub =>
      sub.setName('message')
        .setDescription('Create a staff check-in/out panel (Login / Logout Panel)')

        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('The channel to send the panel in')

            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addBooleanOption(opt =>
          opt.setName('banner')
            .setDescription('Show the decorative panel banner?')

            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('banner_url')
            .setDescription('Custom banner image URL (optional)')

            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('title')
            .setDescription('Panel title')

            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('description')
            .setDescription('Description and instructions text inside the panel')

            .setRequired(false)
        )
    )
    // 2. /set name
    .addSubcommand(sub =>
      sub.setName('name')
        .setDescription('Change the bot name in this server or globally')

        .addStringOption(opt =>
          opt.setName('new_name')
            .setDescription('The new bot name')

            .setMinLength(2)
            .setMaxLength(32)
            .setRequired(true)
        )
        .addBooleanOption(opt =>
          opt.setName('global')
            .setDescription('Change the name across Discord or only in this server?')

            .setRequired(false)
        )
    )
    // 3. /set avatar
    .addSubcommand(sub =>
      sub.setName('avatar')
        .setDescription('Change the bot profile picture')

        .addAttachmentOption(opt =>
          opt.setName('image_file')
            .setDescription('Upload the new bot image file')

            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('image_url')
            .setDescription('Or paste a direct image URL')

            .setRequired(false)
        )
    )
    // 4. /set state
    .addSubcommand(sub =>
      sub.setName('state')
        .setDescription('Change the bot presence and activity')

        .addStringOption(opt =>
          opt.setName('status')
            .setDescription('Presence status (Online / Idle / DND / Invisible)')

            .setRequired(true)
            .addChoices(
              { name: '🟢 Online', value: 'online' },
              { name: '🌙 Idle', value: 'idle' },
              { name: '🔴 Do Not Disturb', value: 'dnd' },
              { name: '⚪ Invisible', value: 'invisible' }
            )
        )
        .addStringOption(opt =>
          opt.setName('activity_text')
            .setDescription('The text shown next to the status')

            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('activity_type')
            .setDescription('Activity type')

            .setRequired(false)
            .addChoices(
              { name: '🎮 Playing', value: 'Playing' },
              { name: '👀 Watching', value: 'Watching' },
              { name: '🎧 Listening', value: 'Listening' },
              { name: '🏆 Competing', value: 'Competing' }
            )
        )
    ),

  async execute(interaction, client) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t(lang, 'admin.set.no_perm'), flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // 1. /set message
    if (sub === 'message') {
      const channel = interaction.options.getChannel('channel');
      const showBanner = interaction.options.getBoolean('banner') ?? true;
      const customBanner = interaction.options.getString('banner_url');
      const title = interaction.options.getString('title') || t(lang, 'admin.set.def_title');
      const desc = interaction.options.getString('description') || t(lang, 'admin.set.def_desc');

      const settings = db.getGuildSettings(guildId);
      const bannerImg = (customBanner && customBanner.trim() !== '') ? customBanner.trim() : (settings.staff_banner_url && settings.staff_banner_url.trim() !== '' ? settings.staff_banner_url.trim() : null);

      const embed = new EmbedBuilder()
        .setColor('#7c3aed')
        .setTitle(title)
        .setDescription(desc)
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
        .setTimestamp();

      if (showBanner && bannerImg) {
        embed.setImage(bannerImg);
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('staff_login_btn')
          .setLabel(t(lang, 'admin.set.login_label'))
          .setEmoji('🟢')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('staff_logout_btn')
          .setLabel(t(lang, 'admin.set.logout_label'))
          .setEmoji('🔴')
          .setStyle(ButtonStyle.Danger)
      );

      try {
        const sentMsg = await channel.send({ embeds: [embed], components: [row] });
        db.updateGuildSettings(guildId, {
          staff_login_channel: channel.id,
          staff_banner_url: bannerImg || '',
          staff_banner_enabled: showBanner ? 1 : 0
        });

        return interaction.reply({
          content: t(lang, 'admin.set.panel_sent', { channel: channel.id }),
          flags: 64
        });
      } catch (err) {
        return interaction.reply({ content: t(lang, 'admin.set.send_fail', { err: err.message }), flags: 64 });
      }
    }

    // 2. /set name
    if (sub === 'name') {
      await interaction.deferReply({ flags: 64 });
      const newName = interaction.options.getString('new_name');
      const isGlobal = interaction.options.getBoolean('global') ?? false;

      if (isGlobal) {
        try {
          await client.user.setUsername(newName);
          return interaction.editReply({ content: t(lang, 'admin.set.name_global', { name: newName }) });
        } catch (err) {
          return interaction.editReply({ content: t(lang, 'admin.set.name_global_fail', { err: err.message }) });
        }
      } else {
        try {
          const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
          await me.setNickname(newName);
          db.updateGuildSettings(guildId, { bot_nickname: newName });
          return interaction.editReply({ content: t(lang, 'admin.set.name_server', { guild: interaction.guild.name, name: newName }) });
        } catch (err) {
          return interaction.editReply({ content: t(lang, 'admin.set.name_server_fail', { err: err.message }) });
        }
      }
    }

    // 3. /set avatar
    if (sub === 'avatar') {
      await interaction.deferReply({ flags: 64 });
      const attachment = interaction.options.getAttachment('image_file');
      const imgUrl = interaction.options.getString('image_url');
      const finalUrl = attachment ? attachment.url : imgUrl;

      if (!finalUrl) {
        return interaction.editReply({ content: t(lang, 'admin.set.avatar_need') });
      }

      try {
        await client.user.setAvatar(finalUrl);
        db.updateGuildSettings(guildId, { bot_avatar: finalUrl });
        return interaction.editReply({
          content: t(lang, 'admin.set.avatar_done'),
          embeds: [new EmbedBuilder().setColor('#10b981').setImage(finalUrl)]
        });
      } catch (err) {
        return interaction.editReply({ content: t(lang, 'admin.set.avatar_fail', { err: err.message }) });
      }
    }

    // 4. /set state
    if (sub === 'state') {
      await interaction.deferReply({ flags: 64 });
      const status = interaction.options.getString('status');
      const activityText = interaction.options.getString('activity_text');
      const activityType = interaction.options.getString('activity_type') || 'Watching';

      try {
        const { ActivityType } = require('discord.js');
        const typeMap = {
          Playing: ActivityType.Playing,
          Watching: ActivityType.Watching,
          Listening: ActivityType.Listening,
          Competing: ActivityType.Competing
        };

        const presenceOptions = { status };
        if (activityText) {
          presenceOptions.activities = [{
            name: activityText,
            type: typeMap[activityType] || ActivityType.Watching
          }];
        }

        client.user.setPresence(presenceOptions);
        return interaction.editReply({
          content: t(lang, 'admin.set.state_done', { status, type: activityType, text: activityText || t(lang, 'admin.set.state_none') })
        });
      } catch (err) {
        return interaction.editReply({ content: t(lang, 'admin.set.state_fail', { err: err.message }) });
      }
    }
  }
};
