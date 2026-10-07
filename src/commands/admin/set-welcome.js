const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'set-welcome',
  description: 'إعداد نظام الترحيب بالأعضاء الجدد (روم، رسالة، بطاقة صورة)',
  aliases: ['ترحيب'],
  data: new SlashCommandBuilder()
    .setName('set-welcome')
    .setDescription('Configure the welcome system')

    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('The welcome message channel')

        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('Custom welcome message ({user}, {server}, {memberCount})')

        .setRequired(false)
    )
    .addBooleanOption(opt =>
      opt.setName('image')
        .setDescription('Enable or disable the designed image card (Canvas)')

        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    // 1. التأجيل الفوري لمنع خطأ انتهاء المهلة (3 ثواني)
    await interaction.deferReply({ flags: 64 });

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply({ content: t(lang, 'admin.common.no_admin') });
    }

    const channel = interaction.options.getChannel('channel');
    const message = interaction.options.getString('message');
    const image = interaction.options.getBoolean('image');

    try {
      // 2. تحديث قاعدة البيانات بالطريقة الآمنة
      const updateSetting = (key, val) => {
        if (typeof db.setGuildSetting === 'function') {
          db.setGuildSetting(interaction.guild.id, key, val);
        } else if (typeof db.updateGuildSetting === 'function') {
          db.updateGuildSetting(interaction.guild.id, key, val);
        }
      };

      updateSetting('welcome_channel', channel.id);
      if (message !== null) {
        updateSetting('welcome_message', message);
      }
      if (image !== null) {
        updateSetting('welcome_image', image ? 1 : 0);
      }

      // 3. الرد النهائي الآمن
      await interaction.editReply({
        content: t(lang, 'admin.setwelcome.updated', {
          channel: channel.id,
          state: t(lang, image === false ? 'admin.setwelcome.state_off' : 'admin.setwelcome.state_on')
        })
      });
    } catch (err) {
      console.error('خطأ في إعدادات الترحيب:', err);
      await interaction.editReply({ content: t(lang, 'admin.setwelcome.db_error') });
    }
  },

  async executePrefix(message, args) {
    const lang = getGuildLang(message.guild.id);
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply(t(lang, 'admin.common.no_admin'));
    }

    const channel = message.mentions.channels.first();
    if (!channel) return message.reply(t(lang, 'admin.setwelcome.prefix_need_mention'));

    try {
      if (typeof db.setGuildSetting === 'function') {
        db.setGuildSetting(message.guild.id, 'welcome_channel', channel.id);
      } else if (typeof db.updateGuildSetting === 'function') {
        db.updateGuildSetting(message.guild.id, 'welcome_channel', channel.id);
      }
      message.reply(t(lang, 'admin.setwelcome.prefix_set', { channel: channel.id }));
    } catch (err) {
      console.error('خطأ في إعدادات الترحيب (Prefix):', err);
      message.reply(t(lang, 'admin.setwelcome.prefix_save_error'));
    }
  }
};
