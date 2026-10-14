const db = require('../../database');
const { getGuildLang, t } = require('../../utils/lang');

module.exports = {
  name: 'autoreply-add',
  description: 'لاضافة رد تلقائي',
  aliases: ['اضف-رد'],

  async execute(interaction) {
    const lang = getGuildLang(interaction.guild.id);
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t(lang, 'common.no_manage_perm'), flags: 64 });
    }
    const isPremium = db.isGuildPremium ? db.isGuildPremium(interaction.guild.id) : false;
    const currentReplies = db.getAutoResponders ? db.getAutoResponders(interaction.guild.id) : [];
    const maxLimit = isPremium ? 100 : 8;

    if (currentReplies.length >= maxLimit) {
      if (!isPremium) {
        return interaction.reply({
          content: `⚠️ وصلت للحد الأقصى للخطة المجانية (**8 ردود تلقائية**).\n👑 للحصول على حتى **100 رد تلقائي**، قم بالترقية إلى **Droplet Premium** عبر \`/premium\`.`,
          flags: 64
        });
      } else {
        return interaction.reply({
          content: `⚠️ وصلت للحد الأقصى للردود التلقائية حتى لسيرفرات البريميوم (**100 رد**).`,
          flags: 64
        });
      }
    }

    const word = interaction.options.getString('word');
    const reply = interaction.options.getString('reply');
    db.addAutoResponder(interaction.guild.id, word, reply);
    return interaction.reply({ content: t(lang, 'admin.autoreplyadd.added', { word }) });
  }
};
