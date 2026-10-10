const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'pay',
  description: 'تحويل عملات الذهب 🪙 إلى عضو آخر في السيرفر',
  aliases: ['transfer', 'تحويل', 'ارسال', 'send', 'pay'],
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('تحويل عملات الذهب 🪙 إلى عضو آخر')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('العضو المراد التحويل إليه')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('amount')
        .setDescription('المبلغ المراد تحويله')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const sender = interaction.user;
    const recipient = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const guildId = interaction.guild.id;

    if (recipient.id === sender.id) {
      return interaction.reply({ content: t(guildId, 'economy.pay.self'), flags: 64 });
    }
    if (recipient.bot) {
      return interaction.reply({ content: t(guildId, 'economy.pay.bot'), flags: 64 });
    }

    try {
      const settings = db.getGuildSettings ? db.getGuildSettings(guildId) : {};
      const taxRate = Math.max(0, Math.min(50, Number(settings.transfer_tax ?? 0) || 0));
      const tax = Math.floor(amount * taxRate / 100);
      const result = db.transferCoins(guildId, sender.id, recipient.id, amount);
      if (tax > 0) { try { db.removeCoins(sender.id, guildId, tax); } catch {} }
      const embed = new EmbedBuilder()
        .setColor('#10B981')
        .setTitle(t(guildId, 'economy.pay.title'))
        .setDescription(
          t(guildId, 'economy.pay.from') + ` <@${sender.id}>\n` +
          t(guildId, 'economy.pay.to') + ` <@${recipient.id}>\n` +
          t(guildId, 'economy.pay.amount') + ` \`${amount.toLocaleString()}\` **Gold** 🪙\n\n` +
          t(guildId, 'economy.pay.remaining') + ` \`${result.senderBalance.toLocaleString()}\` 🪙`
        )
        .setFooter({ text: t(guildId, 'economy.pay.footer'), iconURL: interaction.guild.iconURL({ dynamic: true }) })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      if (err.message === 'INSUFFICIENT_FUNDS') {
        const senderData = db.getUser(sender.id, guildId);
        return interaction.reply({
          content: t(guildId, 'economy.pay.insufficient', { balance: (senderData.coins || 0).toLocaleString() }),
          flags: 64
        });
      }
      return interaction.reply({ content: t(guildId, 'economy.pay.error'), flags: 64 });
    }
  },

  async executePrefix(message, args) {
    const sender = message.author;
    const guildId = message.guild.id;

    const recipient = message.mentions.users.first() ||
      (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    const amount = parseInt(args[1] || args[0]);

    if (!recipient || !amount || isNaN(amount) || amount <= 0) {
      return message.reply({ content: t(guildId, 'economy.pay.usage') });
    }

    if (recipient.id === sender.id) {
      return message.reply({ content: t(guildId, 'economy.pay.self') });
    }
    if (recipient.bot) {
      return message.reply({ content: t(guildId, 'economy.pay.bot') });
    }

    try {
      const settings = db.getGuildSettings ? db.getGuildSettings(guildId) : {};
      const taxRate = Math.max(0, Math.min(50, Number(settings.transfer_tax ?? 0) || 0));
      const tax = Math.floor(amount * taxRate / 100);
      const result = db.transferCoins(guildId, sender.id, recipient.id, amount);
      if (tax > 0) { try { db.removeCoins(sender.id, guildId, tax); } catch {} }
      const embed = new EmbedBuilder()
        .setColor('#10B981')
        .setTitle(t(guildId, 'economy.pay.title'))
        .setDescription(
          t(guildId, 'economy.pay.from') + ` <@${sender.id}>\n` +
          t(guildId, 'economy.pay.to') + ` <@${recipient.id}>\n` +
          t(guildId, 'economy.pay.amount') + ` \`${amount.toLocaleString()}\` **Gold** 🪙\n\n` +
          t(guildId, 'economy.pay.remaining') + ` \`${result.senderBalance.toLocaleString()}\` 🪙`
        )
        .setFooter({ text: t(guildId, 'economy.pay.footer'), iconURL: message.guild.iconURL({ dynamic: true }) })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      if (err.message === 'INSUFFICIENT_FUNDS') {
        const senderData = db.getUser(sender.id, guildId);
        return message.reply({
          content: t(guildId, 'economy.pay.insufficient', { balance: (senderData.coins || 0).toLocaleString() })
        });
      }
      return message.reply({ content: t(guildId, 'economy.pay.error') });
    }
  }
};
