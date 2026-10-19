const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database');
const { t } = require('../../utils/lang');

// 🔒 فحص أمان الرابط: https فقط + منع عناوين داخلية تمهد لـ SSRF (canvas يجلب الرابط لاحقاً)
function isSafeWallpaperUrl(raw) {
  try {
    if (!raw || typeof raw !== 'string' || raw.length > 500) return false;
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    if (!u.hostname) return false;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
    if (h.startsWith('[')) return false; // IPv6 literal
    if (/^(127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(h)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  name: 'setwallpaper',
  description: 'تعيين خلفية مخصصة لبطاقة البروفايل والهوية من رابط مباشر',
  aliases: ['setbg', 'خلفية', 'تعيين_خلفية'],
  data: new SlashCommandBuilder()
    .setName('setwallpaper')
    .setDescription('تعيين خلفية مخصصة لبطاقة البروفايل')
    .addStringOption(opt =>
      opt.setName('url')
        .setDescription('رابط الصورة المباشر (https://...)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const url = interaction.options.getString('url').trim();
    if (!isSafeWallpaperUrl(url)) {
      return interaction.reply({ content: t(interaction.guild.id, 'economy.setwallpaper.invalid_url'), flags: 64 });
    }

    db.setWallpaper(interaction.user.id, interaction.guild.id, url);

    await interaction.reply({
      content: t(interaction.guild.id, 'economy.setwallpaper.success', { name: interaction.user.username })
    });
  },

  async executePrefix(message, args) {
    let url = args[0];
    if (message.attachments.size > 0) {
      url = message.attachments.first().url;
    }

    if (!url || !isSafeWallpaperUrl(url)) {
      return message.reply(t(message.guild.id, 'economy.setwallpaper.prefix_invalid'));
    }

    db.setWallpaper(message.author.id, message.guild.id, url);

    await message.reply({
      content: t(message.guild.id, 'economy.setwallpaper.success', { name: message.author.username })
    });
  }
};
