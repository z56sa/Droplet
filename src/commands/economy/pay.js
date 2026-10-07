const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');

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
      return interaction.reply({ content: '❌ لا يمكنك تحويل العملات لنفسك!', flags: 64 });
    }
    if (recipient.bot) {
      return interaction.reply({ content: '❌ لا يمكنك تحويل العملات للبوتات!', flags: 64 });
    }

    try {
      const result = db.transferCoins(guildId, sender.id, recipient.id, amount);
      const embed = new EmbedBuilder()
        .setColor('#10B981')
        .setTitle('💸 تمت عملية التحويل المالي بنجاح!')
        .setDescription(
          `📤 **من:** <@${sender.id}>\n` +
          `📥 **إلى:** <@${recipient.id}>\n` +
          `💰 **المبلغ المحول:** \`${amount.toLocaleString()}\` **Gold** 🪙\n\n` +
          `💳 **رصيدك المتبقي:** \`${result.senderBalance.toLocaleString()}\` 🪙`
        )
        .setFooter({ text: 'Droplet Economy System • تم الحفظ فوراً بقاعدة البيانات', iconURL: interaction.guild.iconURL({ dynamic: true }) })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      if (err.message === 'INSUFFICIENT_FUNDS') {
        const senderData = db.getUser(sender.id, guildId);
        return interaction.reply({
          content: `❌ رصيدك غير كافي! رصيدك الحالي هو **${(senderData.coins || 0).toLocaleString()}** Gold 🪙`,
          flags: 64
        });
      }
      return interaction.reply({ content: '⚠️ حدث خطأ أثناء تنفيذ الحوالة المالية.', flags: 64 });
    }
  },

  async executePrefix(message, args) {
    const sender = message.author;
    const guildId = message.guild.id;

    const recipient = message.mentions.users.first() ||
      (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
    const amount = parseInt(args[1] || args[0]);

    if (!recipient || !amount || isNaN(amount) || amount <= 0) {
      return message.reply({ content: '⚠️ طريقة الاستخدام الصحيحة:\n`#pay @user <amount>` أو `#تحويل @user 100`' });
    }

    if (recipient.id === sender.id) {
      return message.reply({ content: '❌ لا يمكنك تحويل العملات لنفسك!' });
    }
    if (recipient.bot) {
      return message.reply({ content: '❌ لا يمكنك تحويل العملات للبوتات!' });
    }

    try {
      const result = db.transferCoins(guildId, sender.id, recipient.id, amount);
      const embed = new EmbedBuilder()
        .setColor('#10B981')
        .setTitle('💸 تمت عملية التحويل المالي بنجاح!')
        .setDescription(
          `📤 **من:** <@${sender.id}>\n` +
          `📥 **إلى:** <@${recipient.id}>\n` +
          `💰 **المبلغ المحول:** \`${amount.toLocaleString()}\` **Gold** 🪙\n\n` +
          `💳 **رصيدك المتبقي:** \`${result.senderBalance.toLocaleString()}\` 🪙`
        )
        .setFooter({ text: 'Droplet Economy System • تم الحفظ فوراً بقاعدة البيانات', iconURL: message.guild.iconURL({ dynamic: true }) })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      if (err.message === 'INSUFFICIENT_FUNDS') {
        const senderData = db.getUser(sender.id, guildId);
        return message.reply({
          content: `❌ رصيدك غير كافي! رصيدك الحالي هو **${(senderData.coins || 0).toLocaleString()}** Gold 🪙`
        });
      }
      return message.reply({ content: '⚠️ حدث خطأ أثناء تنفيذ الحوالة المالية.' });
    }
  }
};
