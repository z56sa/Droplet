const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t } = require('../../utils/lang');

module.exports = {
  name: 'tax',
  description: 'حساب ضريبة بروبوت',
  aliases: ['ضريبة'],
  data: new SlashCommandBuilder()
    .setName('tax')
    .setDescription('حساب ضريبة بروبوت')
    .addIntegerOption(opt => opt.setName('amount').setDescription('المبلغ').setMinValue(1).setRequired(true)),

  async execute(interaction) {
    const lang = interaction.guild.id;
    const amount = interaction.options.getInteger('amount');
    const taxed = Math.floor((amount * 20) / 19) + 1;
    const diff = taxed - amount;
    const withMed = Math.floor((taxed * 20) / 19) + 1;
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(t(lang, 'economy.tax.title'))
      .addFields(
        { name: t(lang, 'economy.tax.field_original'), value: amount.toLocaleString(), inline: true },
        { name: t(lang, 'economy.tax.field_transfer'), value: taxed.toLocaleString(), inline: true },
        { name: t(lang, 'economy.tax.field_deducted'), value: diff.toLocaleString(), inline: true },
        { name: t(lang, 'economy.tax.field_middleman'), value: withMed.toLocaleString(), inline: true }
      );
    return interaction.reply({ embeds: [embed] });
  }
};
