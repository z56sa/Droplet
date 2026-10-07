const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'bank',
  description: 'نظام البنك - أودع وانسحب بأمان',
  aliases: ['بنك'],
  data: new SlashCommandBuilder()
    .setName('bank')
    .setDescription('نظام البنك 🏦')
    .addSubcommand(sub => sub.setName('balance').setDescription('عرض رصيد المحفظة والبنك'))
    .addSubcommand(sub => sub.setName('deposit').setDescription('إيداع في البنك')
      .addStringOption(opt => opt.setName('amount').setDescription('المبلغ أو "all"').setRequired(true)))
    .addSubcommand(sub => sub.setName('withdraw').setDescription('سحب من البنك')
      .addStringOption(opt => opt.setName('amount').setDescription('المبلغ أو "all"').setRequired(true))),

  async execute(interaction) {
    await interaction.deferReply();
    await this.handleBank(interaction.user, interaction.guild.id, interaction.options.getSubcommand(),
      interaction.options.getString('amount'), (opts) => interaction.editReply(opts));
  },

  async executePrefix(message, args) {
    const sub = args[0]?.toLowerCase() || 'balance';
    const amount = args[1];
    await this.handleBank(message.author, message.guild.id, sub, amount, (opts) => message.reply(opts));
  },

  async handleBank(user, guildId, sub, amountArg, reply) {
    const lang = getGuildLang(guildId);
    // تأكد أن عمود bank_balance موجود
    try {
      db.db.prepare('ALTER TABLE users ADD COLUMN bank_balance INTEGER DEFAULT 0').run();
    } catch (e) {}

    const userData = db.getUser(user.id, guildId);
    const wallet = userData.coins || userData.credits || 0;
    const bank = userData.bank_balance || 0;

    if (sub === 'balance') {
      const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(t(lang, 'economy.bank.title_balance', { name: user.username }))
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: t(lang, 'economy.bank.field_wallet'), value: `\`${wallet.toLocaleString()}\` ⭐`, inline: true },
          { name: t(lang, 'economy.bank.field_bank'), value: `\`${bank.toLocaleString()}\` ⭐`, inline: true },
          { name: t(lang, 'economy.bank.field_total'), value: `\`${(wallet + bank).toLocaleString()}\` ⭐`, inline: true }
        )
        .setFooter({ text: t(lang, 'economy.bank.footer') })
        .setTimestamp();
      return reply({ embeds: [embed] });
    }

    const isAll = amountArg?.toLowerCase() === 'all';
    const amount = isAll ? (sub === 'deposit' ? wallet : bank) : parseInt(amountArg);

    if (isNaN(amount) || amount <= 0)
      return reply({ content: t(lang, 'economy.bank.invalid_amount'), flags: 64 });

    if (sub === 'deposit') {
      try {
        const res = db.depositBank(user.id, guildId, amount);
        const embed = new EmbedBuilder().setColor('#27ae60')
          .setTitle(t(lang, 'economy.bank.deposit_title'))
          .addFields(
            { name: t(lang, 'economy.bank.deposit_field'), value: `\`${amount.toLocaleString()}\` ⭐`, inline: true },
            { name: t(lang, 'economy.bank.field_wallet'), value: `\`${res.wallet.toLocaleString()}\` ⭐`, inline: true },
            { name: t(lang, 'economy.bank.field_bank'), value: `\`${res.bank.toLocaleString()}\` ⭐`, inline: true }
          ).setTimestamp();
        return reply({ embeds: [embed] });
      } catch (err) {
        if (err.message === 'INSUFFICIENT_WALLET') {
          return reply({ content: t(lang, 'economy.bank.deposit_insufficient', { wallet: wallet.toLocaleString() }), flags: 64 });
        }
        return reply({ content: t(lang, 'economy.bank.deposit_error'), flags: 64 });
      }

    } else if (sub === 'withdraw') {
      try {
        const res = db.withdrawBank(user.id, guildId, amount);
        const embed = new EmbedBuilder().setColor('#e67e22')
          .setTitle(t(lang, 'economy.bank.withdraw_title'))
          .addFields(
            { name: t(lang, 'economy.bank.withdraw_field'), value: `\`${amount.toLocaleString()}\` ⭐`, inline: true },
            { name: t(lang, 'economy.bank.field_wallet'), value: `\`${res.wallet.toLocaleString()}\` ⭐`, inline: true },
            { name: t(lang, 'economy.bank.field_bank'), value: `\`${res.bank.toLocaleString()}\` ⭐`, inline: true }
          ).setTimestamp();
        return reply({ embeds: [embed] });
      } catch (err) {
        if (err.message === 'INSUFFICIENT_BANK') {
          return reply({ content: t(lang, 'economy.bank.withdraw_insufficient', { bank: bank.toLocaleString() }), flags: 64 });
        }
        return reply({ content: t(lang, 'economy.bank.withdraw_error'), flags: 64 });
      }
    }
  }
};
