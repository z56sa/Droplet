const db = require('../../database');

// دخول السحب عبر التفاعل (لوضع reaction من الداشبورد)
module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user) {
    try {
      if (user.bot) return;
      if (reaction.partial) await reaction.fetch().catch(() => {});
      const message = reaction.message;
      if (!message || !message.guild) return;
      const gw = db.getGiveaway ? db.getGiveaway(message.id) : null;
      if (!gw || gw.status !== 'active') return;
      if ((gw.entry_mode || 'button') !== 'reaction') return;
      const gwEmoji = gw.emoji || '🎉';
      const reacted = reaction.emoji.name || reaction.emoji.toString();
      if (reacted !== gwEmoji && reaction.emoji.toString() !== gwEmoji) return;
      if (gw.required_role) {
        const member = await message.guild.members.fetch(user.id).catch(() => null);
        if (!member || !member.roles.cache.has(gw.required_role)) return;
      }
      db.addGiveawayEntry(message.id, user.id);
    } catch {}
  }
};
