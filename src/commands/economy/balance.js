const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'balance',
  description: 'عرض رصيدك الحالي من عملة الذهب (Gold) أو رصيد عضو آخر',
  aliases: ['bal', 'رصيد', 'فلوس', 'credits', 'coins'],
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('عرض رصيدك الحالي من العملات')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('العضو المراد فحص رصيده (اختياري)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const guildId = interaction.guild.id;
    const userData = db.getUser(target.id, guildId);
    const balance = userData.coins || 0;
    const level = userData.level || 1;
    const xp = userData.xp || 0;

    const embed = new EmbedBuilder()
      .setColor('#9333EA')
      .setAuthor({ 
        name: `الحساب المالي لـ ${target.username}`, 
        iconURL: target.displayAvatarURL({ dynamic: true }) 
      })
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '🪙 الرصيد (Gold)', value: `\`${balance.toLocaleString()}\` 🪙`, inline: true },
        { name: '⭐ المستوى (Level)', value: `\`${level}\``, inline: true },
        { name: '✨ نقاط الخبرة (XP)', value: `\`${xp.toLocaleString()}\``, inline: true }
      )
      .setFooter({ text: 'Droplet Economy System • الحفظ الدائم نشط 🛡️', iconURL: interaction.guild.iconURL({ dynamic: true }) })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  async executePrefix(message, args) {
    const target = message.mentions.users.first() ||
      (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null) ||
      message.author;

    const guildId = message.guild.id;
    const userData = db.getUser(target.id, guildId);
    const balance = userData.coins || 0;
    const level = userData.level || 1;
    const xp = userData.xp || 0;

    const embed = new EmbedBuilder()
      .setColor('#9333EA')
      .setAuthor({ 
        name: `الحساب المالي لـ ${target.username}`, 
        iconURL: target.displayAvatarURL({ dynamic: true }) 
      })
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '🪙 الرصيد (Gold)', value: `\`${balance.toLocaleString()}\` 🪙`, inline: true },
        { name: '⭐ المستوى (Level)', value: `\`${level}\``, inline: true },
        { name: '✨ نقاط الخبرة (XP)', value: `\`${xp.toLocaleString()}\``, inline: true }
      )
      .setFooter({ text: 'Droplet Economy System • الحفظ الدائم نشط 🛡️', iconURL: message.guild.iconURL({ dynamic: true }) })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
};
