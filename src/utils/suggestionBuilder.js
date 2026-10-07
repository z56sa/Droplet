/**
 * Suggestion System Helpers (Fanu / Modern Pro Style)
 * Renders embeds with dynamic progress bar, percentage calculation, status styling,
 * and 2 rows of buttons (Vote Row + Staff Decision Row).
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { t } = require('./lang');

const STATUS_CONFIG = {
  pending: {
    labelKey: 'suggest.status.pending',
    emoji: '⏳',
    color: '#eab308', // Amber / Gold
    barColor: 'green'
  },
  considered: {
    labelKey: 'suggest.status.considered',
    emoji: '🔍',
    color: '#3b82f6', // Blue
    barColor: 'blue'
  },
  accepted: {
    labelKey: 'suggest.status.accepted',
    emoji: '✅',
    color: '#22c55e', // Green
    barColor: 'green'
  },
  rejected: {
    labelKey: 'suggest.status.rejected',
    emoji: '❌',
    color: '#ef4444', // Red
    barColor: 'red'
  },
  implemented: {
    labelKey: 'suggest.status.implemented',
    emoji: '🚀',
    color: '#8b5cf6', // Purple
    barColor: 'purple'
  }
};

/**
 * Builds a visual progress bar matching the Discord images:
 * Example: 🟩🟩🟩🟩🟩🟩🟩🟩⬛⬛ 82%
 */
function buildProgressBar(upvotes, downvotes, totalBars = 12) {
  const total = upvotes + downvotes;
  if (total === 0) {
    const emptyBar = '⬛'.repeat(totalBars);
    return `${emptyBar} 0%`;
  }

  const percent = Math.round((upvotes / total) * 100);
  const greenBars = Math.round((percent / 100) * totalBars);
  const blackBars = totalBars - greenBars;

  const barStr = '🟩'.repeat(Math.max(0, greenBars)) + '⬛'.repeat(Math.max(0, blackBars));
  return `${barStr} ${percent}%`;
}

/**
 * Builds the modern Fanu-style Embed matching the user screenshots
 * @param {Object} options
 * @param {Object} options.user Discord User who submitted
 * @param {string} options.content Suggestion text
 * @param {string} [options.title] Optional title
 * @param {string} [options.code] Unique suggestion ID/code (e.g. r4Qm6DMig)
 * @param {string} [options.status='pending']
 * @param {number} [options.upvotes=0]
 * @param {number} [options.downvotes=0]
 * @param {number|Date} [options.createdAt]
 * @param {string} [options.reviewerId] Staff reviewer ID
 * @param {string} [options.reason] Reason / comment
 */
function buildSuggestionEmbed({
  user,
  content,
  title = null,
  code = null,
  status = 'pending',
  upvotes = 0,
  downvotes = 0,
  createdAt = Date.now(),
  reviewerId = null,
  reason = null,
  lang = 'EN'
}) {
  const statusInfo = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const statusLabel = t(lang, statusInfo.labelKey);
  const timeSeconds = Math.floor(new Date(createdAt).getTime() / 1000);
  const displayCode = code || (typeof createdAt === 'number' ? createdAt.toString(36) : Math.random().toString(36).substring(2, 9));

  // Top header info: user tag + relative timestamp + code badge
  const headerLines = [
    `👤 **${user.tag || user.username}** \`@${user.username || user.tag}\``,
    `📅 <t:${timeSeconds}:R> · \`${displayCode}\``
  ].join('\n');

  // Body content: title (bold) + text
  let bodyText = '';
  if (title) {
    bodyText += `### ${title}\n\n`;
  }
  bodyText += `${content}`;

  // Footer block: Status + Votes count + Progress bar
  const progressBar = buildProgressBar(upvotes, downvotes);
  let statusLine = `${t(lang, 'suggest.widget.status')} ${statusLabel} ${statusInfo.emoji}`;
  if (reviewerId) {
    statusLine += t(lang, 'suggest.widget.by', { id: reviewerId });
  }

  // استخدام علامات LTR (\u200E) لعزل الأرقام والإيموجيات حتى لا يعكسها ديسكورد العربي من اليمين لليسار
  const votesDisplay = `\u200E👍 **${upvotes}** \u200E· \u200E👎 **${downvotes}**\u200E`;

  const footerBlock = [
    '──────────────────────────────',
    statusLine,
    votesDisplay,
    `\u200E${progressBar}\u200E`
  ];

  if (reason) {
    footerBlock.push(t(lang, 'suggest.widget.note', { reason }));
  }

  const fullDescription = `${headerLines}\n──────────────────────────────\n\n${bodyText}\n\n${footerBlock.join('\n')}`;

  const embed = new EmbedBuilder()
    .setColor(statusInfo.color)
    .setTitle(t(lang, 'suggest.widget.title'))
    .setDescription(fullDescription)
    .setTimestamp(new Date(createdAt));

  if (user.displayAvatarURL) {
    embed.setThumbnail(user.displayAvatarURL({ dynamic: true }));
  }

  return embed;
}

/**
 * Builds the 2-row button layout exactly as shown in the screenshot:
 * Row 1: [ 👍 upvotes ]  [ 👎 downvotes ]
 * Row 2: [ ✅ قبول ]  [ ❌ رفض ]  [ 🔍 قيد الدراسة ]
 */
function buildSuggestionComponents({
  upvotes = 0,
  downvotes = 0,
  disabled = false,
  lang = 'EN'
}) {
  // Row 1: Vote buttons (Thumbs Up Success, Thumbs Down Danger)
  const voteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('sugg_upvote')
      .setLabel(String(upvotes))
      .setEmoji('👍')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('sugg_downvote')
      .setLabel(String(downvotes))
      .setEmoji('👎')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );

  // Row 2: Staff decision buttons (Accept, Reject, Consider)
  const staffRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('sugg_accept_btn')
      .setLabel(t(lang, 'suggest.button.accept'))
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('sugg_reject_btn')
      .setLabel(t(lang, 'suggest.button.reject'))
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('sugg_consider_btn')
      .setLabel(t(lang, 'suggest.button.consider'))
      .setEmoji('🔍')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled)
  );

  return [voteRow, staffRow];
}

module.exports = {
  STATUS_CONFIG,
  buildProgressBar,
  buildSuggestionEmbed,
  buildSuggestionComponents
};
