// ========================================================
// FILE: src/events/guild/inviteCreate.js
// تحديث كاش الدعوات عند إنشاء رابط دعوة جديد
// ========================================================
const tracker = require('../../utils/inviteTracker');
const antiNuke = require('../../utils/antiNuke');

module.exports = {
  name: 'inviteCreate',
  async execute(invite) {
    tracker.onInviteCreate(invite);
    if (invite.guild) {
      const inviterId = invite.inviter?.id || null;
      await antiNuke.checkAction(invite.guild, 'inviteSpam', null, inviterId);
    }
  }
};
