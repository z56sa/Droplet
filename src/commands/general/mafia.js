/**
 * 🔪 لعبة المافيا (Mafia) — جماعية بالأدوار السرية
 * الأعضاء يتجندون بزر، ثم كل لاعب يكشف دور **حده فقط** بزر سري داخل القناة
 * (رسالة ephemeral — ما يشوفها أحد غيره) — والعمليات الليلية (قتل/إنقاذ/فحص)
 * بنفس الآلية بدل الرسائل الخاصة، فما تنعطل اللعبة أبداً لو أحد مسكّر خاصه.
 * ثم دورات ليل (عمليات سرية) ونهار (نقاش + تصويت) حتى ينتصر أحد الطرفين.
 */
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType
} = require('discord.js');

const LOBBY_MS = 120000;   // مهلة التجنيد
const NIGHT_MS = 45000;    // مدة الليل
const DAY_MS = 90000;      // مدة النهار
const MIN_PLAYERS = 5;
const MAX_PLAYERS = 25;
const MAX_ROUNDS = 8;

const COLORS = { mafia: '#E74C3C', det: '#3498DB', doc: '#2ECC71', town: '#95A5A6' };
const ROLE_INFO = {
  mafia: { name: '🔪 مافيا', color: COLORS.mafia },
  det:   { name: '🕵️ محقق', color: COLORS.det },
  doc:   { name: '💉 طبيب', color: COLORS.doc },
  town:  { name: '👤 مواطن', color: COLORS.town }
};

const GOAL_TEXT = {
  mafia: '🔪 **هدفك:** امحو الأبرياء حتى يصير عدكم يساوي عددهم. اتفقوا على ضحية واحدة وكل واحد يصوّت من لوحته!',
  det:   '🕵️ **هدفك:** افحص لاعباً واحداً كل ليل واكتشف هل هو مافيا — ابقَ حيّاً ووجّه المدينة بالتصويت!',
  doc:   '💉 **هدفك:** اختر شخصاً كل ليل تنقذه من الموت (تقدر تنقذ نفسك).',
  town:  '👤 **هدفك:** انتبه للحديث والسلوك؛ اتصوّت ضد المشتبهين واقضوا على المافيا بالنهار!'
};

// ✅ القفل وصّل بباقي عائلة الألعاب (كويز/روفيت/غارتيك/الأغلفة) — لعبة وحدة بالقناة عبر كل الألعاب
const { activeGames, preflightGamesError } = require('./game');
const db = require('../../database');

function chunkButtons(buttons, perRow = 5) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += perRow) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + perRow)));
  }
  return rows.slice(0, 5); // ديسكورد: 5 صفوف كحد أقصى
}

function aliveList(game, opts = {}) {
  return [...game.players.values()].filter(p => {
    if (!p.alive) return false;
    if (opts.excludeSelf && p.id === opts.excludeSelf) return false;
    if (opts.onlyRole && p.role !== opts.onlyRole) return false;
    if (opts.excludeRole && p.role === opts.excludeRole) return false;
    return true;
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isAdmin(member) {
  try { return !!member?.permissions?.has?.(1n << 3n); } catch (e) { return false; }
}

async function ephReply(i, payload) {
  try { return await i.reply({ ...payload, flags: 64 }); } catch (e) { return null; }
}

module.exports = {
  name: 'mafia',
  description: 'لعبة المافيا الجماعية: أدوار سرية تُكشف بأزرار بالقناة (كل واحد يشوف دوره لحاله) 🔪',
  aliases: ['مافيا', 'mafia'],
  data: new SlashCommandBuilder()
    .setName('mafia')
    .setDescription('🔪 لعبة المافيا الجماعية بالأدوار السرية (5 لاعبين على الأقل)')
    .setDMPermission(false),

  async execute(interaction) {
    return this.startLobby(interaction, interaction.channel, interaction.user, interaction.client);
  },

  async executePrefix(message, args, client) {
    return this.startLobby(null, message.channel, message.author, (client || message.client));
  },

  async startLobby(interaction, channel, host, client) {
    if (activeGames.has(channel.id)) {
      const warn = '⚠️ هناك لعبة جارية بالفعل في هذه القناة! انتظر حتى تنتهي.';
      if (interaction) return ephReply(interaction, { content: warn });
      return channel.send(warn).catch(() => {});
    }

    // ✅ المافيا تدخل بوابة العايلة نفسها: games_enabled + games_channel (كانت تجاهلها — ألعاب مقفلة وما هي محكوبة)
    const settings = db.getGuildSettings ? (db.getGuildSettings(channel.guild?.id || null) || {}) : {};
    const gateErr = preflightGamesError(channel.id, channel.guild?.id || null, settings, { skipActive: true });
    if (gateErr) {
      if (interaction) return ephReply(interaction, { content: gateErr });
      return channel.send(gateErr).catch(() => {});
    }

    const gid = Math.random().toString(36).slice(2, 8);
    const game = {
      id: gid, client, channelId: channel.id, guildId: channel.guild?.id || null, hostId: host.id,
      phase: 'lobby', players: new Map(),
      mafiaVotes: new Map(), doctorTarget: null, detTarget: null, detResult: null,
      votes: new Map(), round: 0, over: false,
      timers: [], phaseMsg: null, lobbyMsg: null, revealMsg: null, nightMsg: null,
      lobbyCollector: null, interCollector: null
    };
    activeGames.add(channel.id);
    game.players.set(host.id, { id: host.id, name: host.username, role: null, alive: true });

    const refreshDescription = () => {
      const players = [...game.players.values()];
      const list = players.map((p, i) => `${i + 1}. **${p.name}**`).join('\n') || '—';
      const need = Math.max(0, MIN_PLAYERS - players.length);
      return `**👑 صاحب اللعبة:** <@${game.hostId}>\n` +
        `**👥 المجندون (${players.length}/${MAX_PLAYERS}):**\n${list}\n\n` +
        (need > 0
          ? `⏳ ناقص **${need}** لاعبين على الأقل!\nاللعبة تبدأ تلقائياً عند اكتمال العدد أو عند ضغط المالك زر «ابدأ».\n⏱️ مهلة التجنيد: **دقيقتان**.`
          : '✅ العدد يكفي — المالك يقدر يبدأ اللعبة الآن!');
    };

    const lobbyEmbed = new EmbedBuilder()
      .setColor('#8E44AD')
      .setTitle('🔪 لعبة المافيا — التجنيد مفتوح!')
      .setDescription(refreshDescription())
      .addFields({
        name: '📜 القوانين السريعة',
        value: '• دورك يظهر لك **سرّياً داخل القناة**: بعد البدء ينزل زر باسمك — اضغطه وراح تشوف دورك وحدك (مافيا / محقق / طبيب / مواطن) 🔒\n' +
               '• 🌙 بالليل: المافيا تختار ضحية، الطبيب ينقذ، المحقق يفحص — كلها **بأزرار كل واحد يشوف لوحته لحاله**\n' +
               '• ☀️ بالنهار: نقاش ثم تصويت لإعدام مشتبه واحد — وزر «معلوماتي» يوريك دورك ونتيجة الفحص (سرّي)\n' +
               '• المافيا تفوز إذا صار عددهم يساوي عدد الأبرياء — والأبرياء يفوزون بتصفية كل المافيا'
      })
      .setFooter({ text: `ID: ${gid} | بدأها: ${host.username}` })
      .setTimestamp();

    const lobbyRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mafia:join:${gid}`).setLabel('🎯 انضم للعبة').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`mafia:leave:${gid}`).setLabel('🚪 خروج').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`mafia:start:${gid}`).setLabel('ابدأ اللعبة ▶').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`mafia:end:${gid}`).setLabel('إلغاء ✖').setStyle(ButtonStyle.Danger)
    );

    const payload = { embeds: [lobbyEmbed], components: [lobbyRow] };
    try {
      if (interaction) {
        await interaction.reply(payload);
        game.lobbyMsg = await interaction.fetchReply();
      } else {
        game.lobbyMsg = await channel.send(payload);
      }
    } catch (e) {
      activeGames.delete(channel.id);
      // ✅ فشل إرسال التجنيد → رد سرّي واضح بدل «التطبيق ما رد» (لو التوكين لسا حي)
      if (interaction) await ephReply(interaction, { content: '⚠️ تعذر فتح تجنيد المافيا الآن (تأخير بالشبكة) — جرّب مرة ثانية!' });
      return;
    }

    const lobbyCollector = game.lobbyMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: LOBBY_MS });
    game.lobbyCollector = lobbyCollector;

    lobbyCollector.on('collect', async (btn) => {
      if (game.over || game.phase !== 'lobby') return;

      if (btn.customId === `mafia:join:${gid}`) {
        if (game.players.has(btn.user.id)) {
          return ephReply(btn, { content: '✅ أنت مسجّل مسبقاً في اللعبة!' });
        }
        if (game.players.size >= MAX_PLAYERS) {
          return ephReply(btn, { content: '⚠️ اللعبة ممتلئة (الحد الأقصى 25 لاعباً)!' });
        }
        game.players.set(btn.user.id, { id: btn.user.id, name: btn.user.username, role: null, alive: true });
        await ephReply(btn, { content: '🎯 تمت إضافتك للعبة! بعد بدء اللعبة اضغط **زر اسمك** داخل القناة وراح يشافك دورك سرّياً 🔒' });
        return this._refreshLobbyEmbed(game, refreshDescription);
      }

      if (btn.customId === `mafia:leave:${gid}`) {
        if (btn.user.id === game.hostId) {
          game.players.delete(btn.user.id);
          if (game.players.size === 0) {
            await btn.deferUpdate().catch(() => {});
            lobbyCollector.stop('cancelled');
            return this.endGame(game, '🚫 تم إلغاء اللعبة (خرج المالك ولم يبق لاعبين).');
          }
          // نقل الملكية لأول لاعب متبقٍ
          game.hostId = [...game.players.keys()][0];
          await btn.deferUpdate().catch(() => {});
          await channel.send(`👑 المالك خرج — الملكية انتقلت إلى <@${game.hostId}>!`).catch(() => {});
          return this._refreshLobbyEmbed(game, refreshDescription);
        }
        game.players.delete(btn.user.id);
        await ephReply(btn, { content: '🚪 تم حذفك من اللعبة.' });
        return this._refreshLobbyEmbed(game, refreshDescription);
      }

      if (btn.customId === `mafia:start:${gid}`) {
        if (btn.user.id !== game.hostId) {
          return ephReply(btn, { content: '👑 فقط صاحب اللعبة يقدر يبدأها!' });
        }
        if (game.players.size < MIN_PLAYERS) {
          return ephReply(btn, { content: `⚠️ تحتاج ${MIN_PLAYERS} لاعبين على الأقل للبدء (الحاليون: ${game.players.size}).` });
        }
        await btn.deferUpdate().catch(() => {});
        lobbyCollector.stop('started');
        return this.beginGame(game);
      }

      if (btn.customId === `mafia:end:${gid}`) {
        if (btn.user.id !== game.hostId && !isAdmin(btn.member)) {
          return ephReply(btn, { content: '👑 فقط صاحب اللعبة أو الإدارة يقدرون يلغونها!' });
        }
        await btn.deferUpdate().catch(() => {});
        lobbyCollector.stop('cancelled');
        return this.endGame(game, '🚫 تم إلغاء اللعبة من قبل المالك.');
      }
    });

    lobbyCollector.on('end', (_c, reason) => {
      if (game.over || reason === 'started' || reason === 'cancelled') return;
      if (game.players.size >= MIN_PLAYERS) {
        return this.beginGame(game);
      }
      this.endGame(game, '⌛ انتهت مهلة التجنيد وعدد اللاعبين غير كافٍ.');
    });
  },

  async _refreshLobbyEmbed(game, refreshDescription) {
    try {
      const players = [...game.players.values()];
      const need = Math.max(0, MIN_PLAYERS - players.length);
      const embed = EmbedBuilder.from(game.lobbyMsg.embeds[0]);
      embed.setDescription(refreshDescription());
      await game.lobbyMsg.edit({ embeds: [embed] });
    } catch (e) {}
  },

  // ================== بدء اللعبة وتوزيع الأدوار ==================
  async beginGame(game) {
    const channel = this._channel(game);
    if (!channel) return this.endGame(game, '❌ القناة غير متوفرة.');
    if (game.players.size < MIN_PLAYERS) return this.endGame(game, '⚠️ عدد اللاعبين غير كافٍ.');

    const ids = shuffle([...game.players.keys()]);
    const mafiaCount = Math.max(1, Math.floor(ids.length / 3));
    const roles = [];
    for (let i = 0; i < mafiaCount; i++) roles.push('mafia');
    roles.push('det');
    roles.push('doc');
    while (roles.length < ids.length) roles.push('town');

    ids.forEach((id, i) => {
      const p = game.players.get(id);
      p.role = roles[i];
    });

    // تعطيل أزرار رسالة التجنيد
    try {
      const rows = game.lobbyMsg.components.map(r => ActionRowBuilder.from(r));
      rows.forEach(r => r.components.forEach(c => c.setDisabled(true)));
      await game.lobbyMsg.edit({ components: rows });
    } catch (e) {}

    await channel.send({
      embeds: [new EmbedBuilder()
        .setColor(COLORS.mafia)
        .setTitle('🔪 بدأت لعبة المافيا!')
        .setDescription(`🎭 **عدد اللاعبين:** ${ids.length}\n🔪 **عدد المافيا السرية:** ${mafiaCount}\n\n⬇️ **زر كشف الأدوار راح ينزل بحظة** — كل واحد يضغط زر اسمه ودوره يطلع إياه **سرّياً** ما يشفه أحد 🔒\n🌙 الليل الأول يبدأ بعد لحظات…`)
        .setTimestamp()]
    }).catch(() => {});

    await this._sendRoleReveal(game);
    this._startGameCollector(game);

    await this.startNight(game);
  },

  // رسالة أزرار كشف الأدوار (في القناة — النتيجة سرّية لصاحب الزر فقط)
  async _sendRoleReveal(game) {
    const channel = this._channel(game);
    if (!channel) return;
    const buttons = [...game.players.values()].map(p =>
      new ButtonBuilder()
        .setCustomId(`mafia:myrole:${game.id}:${p.id}`)
        .setLabel(String(p.name).slice(0, 80))
        .setStyle(ButtonStyle.Secondary)
    );
    const embed = new EmbedBuilder()
      .setColor('#8E44AD')
      .setTitle('🎭 كشف الأدوار السرّية')
      .setDescription('اضغط على **زر اسمك** 👇 — دورك يظهر لك **وحدك** (رسالة سرّية ما يشفه أحد) 🔒\n⚠️ ما تضغط زر أحد ثاني 😅')
      .setFooter({ text: `تقدر تفحص دورك أي وقت طول اللعبة • ID: ${game.id}` })
      .setTimestamp();
    try {
      game.revealMsg = await channel.send({ embeds: [embed], components: chunkButtons(buttons) });
    } catch (e) {
      game.revealMsg = null;
    }
  },

  // كولكتور عام على مستوى القناة يلتقط كل أزرار اللعبة (بما فيها الأزرار داخل الرسائل السرية)
  _startGameCollector(game) {
    const channel = this._channel(game);
    if (!channel) return;
    const gid = game.id;
    // مدة قصوى للعبة كاملة + هامش أمان
    const totalTime = (MAX_ROUNDS + 2) * (NIGHT_MS + DAY_MS) + 120000;
    try {
      const collector = channel.createMessageComponentCollector({
        time: totalTime,
        filter: (i) => {
          const cid = String(i.customId || '');
          if (!cid.startsWith('mafia:')) return false;
          // زر الإنهاء وتصويت النهار لهما كولكتورات خاصة (ما نلتقطها هنا)
          if (cid.startsWith('mafia:end:') || cid.startsWith('mafia:vote:')) return false;
          return cid.includes(`:${gid}:`) || cid.endsWith(`:${gid}`);
        }
      });
      game.interCollector = collector;
      collector.on('collect', async (i) => {
        try {
          await this._handleGameInteraction(game, i);
        } catch (e) {
          console.error('[MAFIA] Interaction error:', e);
          if (!i.replied && !i.deferred) await ephReply(i, { content: '⚠️ صار خطأ مؤقت — جرّب مرة ثانية.' });
        }
      });
    } catch (e) {
      game.interCollector = null;
    }
  },

  async _handleGameInteraction(game, i) {
    if (game.over) {
      return ephReply(i, { content: '🎮 اللعبة انتهت — الأدوار كلها مكشوفة في رسالة النهاية فوق.' });
    }
    const parts = String(i.customId).split(':'); // mafia:<action>:<gid>[:<uid أو tid>]
    const action = parts[1];

    // زر كشف الدور / زر معلوماتي (النهار)
    if (action === 'myrole' || action === 'info') {
      const uid = action === 'myrole' ? parts[3] : i.user.id;
      if (i.user.id !== uid) {
        return ephReply(i, { content: '😉 هذا الزر مو مالك — دورك زرك اللي باسمك، ما تطنطق 😅' });
      }
      const p = game.players.get(uid);
      if (!p) return ephReply(i, { content: '🚪 أنت مو مسجّل بهذي اللعبة.' });
      if (game.phase === 'lobby') return ephReply(i, { content: '⏳ الأدوار توزّع بعد بدء اللعبة — اصبر شوي!' });
      return ephReply(i, this._rolePayload(game, p));
    }

    // زر فتح اللوحة الليلية
    if (action === 'panel') {
      if (i.user.id !== parts[3]) {
        return ephReply(i, { content: '😉 هذا الزر مو مالك!' });
      }
      return this._openNightPanel(game, i);
    }

    // اختيار هدف من داخل اللوحة السرية (قتل / إنقاذ / فحص)
    if (action === 'kill' || action === 'save' || action === 'inspect') {
      return this._handleNightAction(game, i, action, parts[3]);
    }

    return ephReply(i, { content: '❔ زر غير معروف.' });
  },

  // محتوى الرسالة السرّية: الدور + الهدف + حالتك
  _rolePayload(game, p) {
    const info = ROLE_INFO[p.role] || { name: 'بدون دور', color: COLORS.town };
    const statusLine = p.alive
      ? '🔎 **أنت حي — كمّل لعب!**'
      : '☠️ **أنت مُت في اللعبة** — جم مشاهده النهاية معنا 🕯️';

    let extra = '';
    if (p.role === 'det' && game.detResult) {
      extra += `\n\n🔎 **فحصك الأخير:** **${game.detResult.name}** — ${game.detResult.mafia ? '🔪 **مافيا!**' : '✅ **بريء!**'}`;
    }
    if (p.role === 'mafia') {
      const counts = {};
      for (const tid of game.mafiaVotes.values()) counts[tid] = (counts[tid] || 0) + 1;
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (top) {
        const tName = game.players.get(top[0])?.name || '؟';
        extra += `\n\n🗳️ **تصويت المافيا حالياً:** ${tName} (${top[1]} صوت)`;
      }
      const mates = aliveList(game, { onlyRole: 'mafia' }).filter(m => m.id !== p.id).map(m => m.name);
      if (mates.length) extra += `\n👥 **حلفاؤك المافيا:** ${mates.join('، ')}`;
    }

    const embed = new EmbedBuilder()
      .setColor(info.color)
      .setTitle(`🪪 حالتك السرّية — دورك: ${info.name}`)
      .setDescription(`🔒 **هذا الدور سرّي! لا تكشفه لأحد إلا إذا مُتّ أو انكشف بالتصويت.**\n\n${statusLine}\n\n${GOAL_TEXT[p.role] || ''}\n👥 **عدد اللاعبين:** ${game.players.size}${extra}`)
      .setFooter({ text: 'لعبة المافيا • Droplet' });

    return { embeds: [embed] };
  },

  // فتح لوحة الفاعل الليلي (رسالة سرّية فيها أزرار الأهداف)
  async _openNightPanel(game, i) {
    const uid = i.user.id;
    const p = game.players.get(uid);
    if (!p) return ephReply(i, { content: '🚪 أنت مو مسجّل بهذي اللعبة.' });
    if (!p.alive) return ephReply(i, { content: '☠️ أنت خارج اللعبة — نام بسلام يا بطلي 😴' });
    if (game.phase !== 'night') return ephReply(i, { content: '🌙 الفعّالات الليلية تشتغل **بالليل فقط** — انتظر رسالة الليل!' });

    if (p.role === 'mafia') {
      const targets = aliveList(game, { excludeRole: 'mafia' });
      if (!targets.length) return ephReply(i, { content: '🌙 ما بقي أهداف — نام!' });
      const mates = aliveList(game, { onlyRole: 'mafia' }).filter(m => m.id !== p.id).map(m => m.name);
      const matesNote = mates.length ? `\n👥 **حلفاؤك المافيا:** ${mates.join('، ')} — اتفقوا على ضحية واحدة وكل واحد يصوّت من لوحته.` : '';
      const embed = new EmbedBuilder()
        .setColor(COLORS.mafia)
        .setTitle('🌙 المافيا مستيقظة — اختاروا الضحية')
        .setDescription(`اضغط زر الضحية.\n⏱️ **45 ثانية** — إذا ما أحد اختار، تُختار الضحية عشوائياً عند الفجر.${matesNote}`)
        .setTimestamp();
      const buttons = targets.slice(0, 25).map(t =>
        new ButtonBuilder().setCustomId(`mafia:kill:${game.id}:${t.id}`).setLabel(String(t.name).slice(0, 80)).setStyle(ButtonStyle.Danger)
      );
      return ephReply(i, { embeds: [embed], components: chunkButtons(buttons) });
    }

    if (p.role === 'doc') {
      const targets = aliveList(game, {});
      if (!targets.length) return ephReply(i, { content: '🌙 ما بقي أحياء لنقذهم!' });
      const embed = new EmbedBuilder()
        .setColor(COLORS.doc)
        .setTitle('🌙 الطبيب مستيقظ — اختار من تنقذه')
        .setDescription('اضغط زر الشخص.\n⏱️ **45 ثانية** — تقدر تنقذ نفسك.')
        .setTimestamp();
      const buttons = targets.slice(0, 25).map(t =>
        new ButtonBuilder().setCustomId(`mafia:save:${game.id}:${t.id}`).setLabel(String(t.name).slice(0, 80)).setStyle(ButtonStyle.Success)
      );
      return ephReply(i, { embeds: [embed], components: chunkButtons(buttons) });
    }

    if (p.role === 'det') {
      const targets = aliveList(game, { excludeSelf: uid });
      if (!targets.length) return ephReply(i, { content: '🌙 ما في أحد تفحصه الليلة!' });
      const last = game.detResult
        ? `\n\n🔎 **فحصك الأخير:** **${game.detResult.name}** — ${game.detResult.mafia ? '🔪 مافيا!' : '✅ بريء!'}`
        : '';
      const embed = new EmbedBuilder()
        .setColor(COLORS.det)
        .setTitle('🌙 المحقق مستيقظ — اختار من تفحص')
        .setDescription(`اضغط زر المشتبه — **النتيجة تظهر عند الفجر داخل زر «معلوماتي»**.\n⏱️ **45 ثانية**${last}`)
        .setTimestamp();
      const buttons = targets.slice(0, 25).map(t =>
        new ButtonBuilder().setCustomId(`mafia:inspect:${game.id}:${t.id}`).setLabel(String(t.name).slice(0, 80)).setStyle(ButtonStyle.Primary)
      );
      return ephReply(i, { embeds: [embed], components: chunkButtons(buttons) });
    }

    // مواطن — ما فعل له الليلة
    const embed = new EmbedBuilder()
      .setColor(COLORS.town)
      .setTitle('😴 مواطن — نامت المدينة')
      .setDescription('الليل ما يحتاج فعل منك.\nالمافيا والطبيب والمحقق أول من يستيقظ الآن… احزر مع الباقين بالنهار! 🤫')
      .setFooter({ text: 'لعبة المافيا • Droplet' });
    return ephReply(i, { embeds: [embed] });
  },

  // تنفيذ فعل ليلي من داخل اللوحة السرية
  async _handleNightAction(game, i, action, targetId) {
    const uid = i.user.id;
    const actor = game.players.get(uid);
    const roleByAction = { kill: 'mafia', save: 'doc', inspect: 'det' };
    if (!actor || actor.role !== roleByAction[action]) {
      return ephReply(i, { content: '🚫 هذا الفعل ما يخصك!' });
    }
    if (!actor.alive) return ephReply(i, { content: '☠️ أنت خارج اللعبة!' });
    if (game.phase !== 'night') return ephReply(i, { content: '⌛ الليلة انتهت بالفعل.' });

    const target = game.players.get(targetId);
    if (!target || !target.alive) return ephReply(i, { content: '❌ هذا الهدف غير صالح، اختر ثاني.' });

    if (action === 'kill') {
      if (target.role === 'mafia') return ephReply(i, { content: '🚫 ما تقتلون بعضكم 😅 — اختار من الأبرياء!' });
      game.mafiaVotes.set(uid, targetId);
    } else if (action === 'save') {
      game.doctorTarget = targetId;
    } else {
      game.detTarget = targetId;
    }

    const labels = { kill: '🔪 ضحيتك الليلة', save: '💉 سترفع المستشفى عنه الليلة', inspect: '🕵️ هدف فحصك' };
    let note = '';
    if (action === 'kill') {
      note = `\n🗳️ **${game.mafiaVotes.size} من المافيا صوّتوا** — إذا ما اتفقوا، تنحط الضحية عشوائياً عند الفجر.`;
    }
    return ephReply(i, { content: `${labels[action]}: **${target.name}** ✅${note}` });
  },

  // ================== الليل: عمليات سرية ==================
  async startNight(game) {
    if (game.over) return;
    game.round++;
    game.phase = 'night';
    game.mafiaVotes.clear();
    game.doctorTarget = null;
    game.detTarget = null;

    const channel = this._channel(game);
    if (!channel) return this.endGame(game, '❌ القناة غير متوفرة.');

    const nightEmbed = new EmbedBuilder()
      .setColor('#1a1a2e')
      .setTitle(`🌙 الليل رقم ${game.round}`)
      .setDescription('المدينة تنام… 🔒\n**لوحة الأفعال الليلية انزلت تحت — كل واحد يفتح زر اسمه ولوحته تطلع إياه سرّياً.**\n🤫 الأبرياء ينامون في أمانهم المزيف…\n\n⏱️ الليل يستمر **45 ثانية**.')
      .setFooter({ text: `الجولة: ${game.round}/${MAX_ROUNDS}` })
      .setTimestamp();

    game.phaseMsg = await channel.send({ embeds: [nightEmbed] }).catch(() => null);
    this._attachEndButton(game, game.phaseMsg);

    // زر لكل واحد من الأحياء (حتى ما يتكشف مين فاعل — الكل عنده زر)
    const alive = aliveList(game, {});
    if (alive.length) {
      const panelButtons = alive.map(p =>
        new ButtonBuilder()
          .setCustomId(`mafia:panel:${game.id}:${p.id}`)
          .setLabel(String(p.name).slice(0, 80))
          .setStyle(ButtonStyle.Secondary)
      );
      try {
        game.nightMsg = await channel.send({
          embeds: [new EmbedBuilder()
            .setColor('#1a1a2e')
            .setTitle('🌙 لوحة الأفعال الليلية')
            .setDescription('اضغط **زر اسمك** لتفتح لوحة عملياتك **سرّياً** 🔒\n(المافيا / الطبيب / المحقق عندهم فعل الليلة — الباقي يفتح وينام 😴)\n⚠️ ما تضغط زر أحد ثاني')
            .setFooter({ text: 'سرّي — كل شخص يشوف لوحته لحاله' })
            .setTimestamp()],
          components: chunkButtons(panelButtons)
        });
      } catch (e) {
        game.nightMsg = null;
      }
    }

    const t = setTimeout(() => { if (!game.over && game.phase === 'night') this.resolveNight(game); }, NIGHT_MS);
    game.timers.push(t);
  },

  // ================== حل الليل: الفجر ==================
  async resolveNight(game) {
    if (game.over || game.phase !== 'night') return;
    game.phase = 'dawn';

    const channel = this._channel(game);
    if (!channel) return this.endGame(game, '❌ القناة غير متوفرة.');

    const counts = {};
    for (const tid of game.mafiaVotes.values()) counts[tid] = (counts[tid] || 0) + 1;

    let victimId = null;
    let max = 0;
    for (const [tid, n] of Object.entries(counts)) {
      if (n > max) { max = n; victimId = tid; }
    }
    // لو المافيا لم تتفق → ضحي عشوائي من الأحياء غير المافيا
    if (!victimId) {
      const candidates = aliveList(game, { excludeRole: 'mafia' });
      if (candidates.length) victimId = candidates[Math.floor(Math.random() * candidates.length)].id;
    }

    let outcome;
    const victim = victimId ? game.players.get(victimId) : null;
    if (victim && game.doctorTarget === victimId) {
      outcome = `💉🌙 **المافيا اقتل ${victim.name} الليلة… لكن الطبيب أنقذه!** المدينة استيقظت صباحاً آمنة.`;
    } else if (victim) {
      victim.alive = false;
      outcome = `☠️ **عند الفجر: وجدنا جثة ${victim.name}!**\n يا للعجب — المافيا هاجمت الليلة الماضية…`;
    } else {
      outcome = '🌙 **مرّت الليلة بهدوء — لا ضحايا!**';
    }

    // نتيجة فحص المحقق — تُخزّن وتظهر له بـزر «معلوماتي» (بدون رسائل خاصة)
    const det = [...game.players.values()].find(p => p.role === 'det' && p.alive);
    let detNote = '';
    if (det && game.detTarget) {
      const target = game.players.get(game.detTarget);
      if (target && target.id !== det.id) {
        const isMafia = target.role === 'mafia';
        game.detResult = { name: target.name, mafia: isMafia };
        detNote = '\n\n🕵️ **المحقق** أنهى فحصه الليلة — النتيجة ظاهرة له بـزر «معلوماتي» 🔒';
      }
    }

    await channel.send({
      embeds: [new EmbedBuilder().setColor('#F39C12').setTitle('☀️ فجر جديد!')
        .setDescription(outcome + detNote + '\n\n⏱️ **النهار يبدأ بعد لحظات…**')
        .setTimestamp()]
    }).catch(() => {});

    const win = this.checkWin(game);
    if (win) return this.endGame(game, win.message, win.winner);
    if (game.round >= MAX_ROUNDS) return this.endGame(game, `⌛ انتهت الجولات (${MAX_ROUNDS}) ولم يتحدد فائز — **تعادل غريب!**`);

    await this.startDay(game);
  },

  // ================== النهار: نقاش وتصويت ==================
  async startDay(game) {
    if (game.over) return;
    game.phase = 'day';
    game.votes.clear();

    const channel = this._channel(game);
    const alive = aliveList(game, {});

    const aliveDisplay = alive.map((p, i) => `${i + 1}. **${p.name}**`).join('\n') || '—';
    const deadList = [...game.players.values()].filter(p => !p.alive)
      .map(p => `${p.name} (${ROLE_INFO[p.role]?.name || '؟'})`).join(' • ') || 'لا أحد';

    const dayEmbed = new EmbedBuilder()
      .setColor('#F1C40F')
      .setTitle(`☀️ النهار رقم ${game.round} — ناقشوا وصوّتوا!`)
      .setDescription(`👥 **الأحياء (${alive.length}):**\n${aliveDisplay}\n\n☠️ **القتلى:** ${deadList}\n\n🗳️ **صرّح بصوتك من القائمة بالأسفل!** الأصوات الأكثر يُعدم صاحبها (التعادل = لا إعدام).\n🪪 زر «معلوماتي» يوريك دورك ونتيجة فحص المحقق — سرّي ما يشفه أحد غيرك.\n⏱️ مدة النهار: **90 ثانية**.`)
      .setTimestamp();

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`mafia:vote:${game.id}`)
      .setPlaceholder('🗳️ اختر المشتبه به…')
      .addOptions(alive.slice(0, 25).map(p => ({
        label: String(p.name).slice(0, 80),
        value: p.id
      })));

    const row = new ActionRowBuilder().addComponents(menu);
    const endRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mafia:info:${game.id}`).setLabel('🪪 معلوماتي').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`mafia:end:${game.id}`).setLabel('إنهاء اللعبة ✖ (للمالك)').setStyle(ButtonStyle.Danger)
    );

    game.phaseMsg = await channel.send({ embeds: [dayEmbed], components: [row, endRow] }).catch(() => null);
    this._attachEndButton(game, game.phaseMsg);

    // لو فشل إرسال رسالة اليوم نعتمد على المؤقّت الاحتياطي ونكمّل الدورة
    if (game.phaseMsg) {
      const voteCollector = game.phaseMsg.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: DAY_MS,
        filter: (i) => i.customId === `mafia:vote:${game.id}` && game.players.has(i.user.id)
      });

      voteCollector.on('collect', async (i) => {
        if (game.over || game.phase !== 'day') return;
        const voter = game.players.get(i.user.id);
        if (!voter || !voter.alive) {
          return ephReply(i, { content: '☠️ الأحياء فقط يصوتون!' });
        }
        if (game.votes.has(voter.id)) {
          return ephReply(i, { content: '🗳️ صوّتت بالفعل! صوتك الواحد فقط.' });
        }
        const target = game.players.get(i.values[0]);
        if (!target || !target.alive) {
          return ephReply(i, { content: '❌ خيار غير صالح.' });
        }
        game.votes.set(voter.id, target.id);
        await ephReply(i, { content: `✅ صوتك مسجّل ضد **${target.name}**.` });

        if (game.votes.size >= alive.length) voteCollector.stop('all_voted');
      });

      voteCollector.on('end', () => {
        if (game.over || game.phase !== 'day') return;
        this.resolveDay(game);
      });
    }

    // مهلة احتياطية بعد انتهاء الكولكتور بحفزة صغيرة
    const t2 = setTimeout(() => { if (!game.over && game.phase === 'day') this.resolveDay(game); }, DAY_MS + 1200);
    game.timers.push(t2);
  },

  async resolveDay(game) {
    if (game.over || game.phase !== 'day') return;
    game.phase = 'dusk';

    const channel = this._channel(game);
    if (!channel) return this.endGame(game, '❌ القناة غير متوفرة.');

    const counts = {};
    for (const tid of game.votes.values()) counts[tid] = (counts[tid] || 0) + 1;

    let eliminatedId = null;
    let max = 0;
    let tie = false;
    for (const [tid, n] of Object.entries(counts)) {
      if (n > max) { max = n; eliminatedId = tid; tie = false; }
      else if (n === max) tie = true;
    }

    let outcome;
    if (!eliminatedId || tie || Object.keys(counts).length === 0) {
      outcome = '⚖️ **لم يتفقوا على أحد — لا إعدام اليوم!**';
    } else {
      const target = game.players.get(eliminatedId);
      if (target) target.alive = false;
      const roleInfo = ROLE_INFO[target?.role] || { name: '؟' };
      const wasMafia = target?.role === 'mafia';
      outcome = wasMafia
        ? `🎉 **قرار المدينة: إعدام ${target.name}!** (${roleInfo.name})\nكفو! كنتم محقّين — كان مافيا فعلاً 🔪`
        : `😱 **قرار المدينة: إعدام ${target?.name}!** (${roleInfo.name})\nللأسف… كان بريئاً 😭`;
    }

    await channel.send({
      embeds: [new EmbedBuilder().setColor('#E67E22').setTitle('🗳️ نتيجة التصويت')
        .setDescription(outcome + '\n\n🌙 **الليل القادم يبدأ بعد لحظات…**')
        .setTimestamp()]
    }).catch(() => {});

    const win = this.checkWin(game);
    if (win) return this.endGame(game, win.message, win.winner);
    if (game.round >= MAX_ROUNDS) return this.endGame(game, `⌛ انتهت الجولات (${MAX_ROUNDS}) — **تعادل غريب!**`);

    await this.startNight(game);
  },

  // ================== شروط الفوز ==================
  checkWin(game) {
    const aliveMafia = [...game.players.values()].filter(p => p.alive && p.role === 'mafia').length;
    const aliveOthers = [...game.players.values()].filter(p => p.alive && p.role !== 'mafia').length;
    if (aliveMafia === 0) {
      return { winner: 'town', message: '🏙️ **المدينة انتصرت!** تمت تصفية كل المافيا 🔪❌ — الأبرياء رجعوا ينامون بأمان.' };
    }
    if (aliveMafia >= aliveOthers) {
      return { winner: 'mafia', message: '🔪 **المافيا استولت على المدينة!** صار رقمهم يساوي الأبرياء — لا أمل بعد اليوم…' };
    }
    return null;
  },

  // ================== نهاية اللعبة ==================
  async endGame(game, messageText, winner = null) {
    if (game.over) return;
    game.over = true;
    game.phase = 'ended';
    game.timers.forEach(clearTimeout);
    game.timers = [];
    try { game.lobbyCollector?.stop('ended'); } catch (e) {}
    try { game.interCollector?.stop('ended'); } catch (e) {}
    activeGames.delete(game.channelId);

    const channel = this._channel(game);
    if (!channel) return;

    // 🪙 توزيع المكافأة على اللاعبين الناجين من الفريق الفائز (تعادل = لا مكافأة)
    // ✅ كل فائز يمر على بوابة المكافأة اليومية المشتركة (مرة وحدة باليوم بكل الألعاب) — وفلسفة fail-closed نفسها
    let rewardsNote = '';
    if (winner) {
      try {
        const settings = db.getGuildSettings ? (db.getGuildSettings(game.guildId) || {}) : {};
        const rewardCoins = Number(settings.game_reward_mafia) || 120;
        const winningTeam = winner === 'mafia' ? 'mafia' : null;
        let rewarded = 0;
        let skippedDaily = 0;
        if (winningTeam && game.guildId) {
          if (rewardCoins <= 0) {
            rewardsNote = '\n\n🏆 فوز بلا عملات (الجوائز مقفلة من الإدارة)';
          } else {
            for (const p of game.players.values()) {
              if (p.alive && p.role === winningTeam) {
                let claim = { paid: true };
                try {
                  if (db.claimGameReward) claim = db.claimGameReward(p.id, game.guildId, rewardCoins, 'game:mafia');
                  else if (db.addCoins) db.addCoins(p.id, game.guildId, rewardCoins);
                } catch (e) { claim = { paid: false, failed: true }; }
                if (claim.paid) rewarded++;
                else if (!claim.failed) skippedDaily++; // الكول-داون اليومي (بدون failed)
              }
            }
            if (rewarded > 0 && skippedDaily > 0) {
              rewardsNote = `\n\n🪙 **مكافأة الفوز:** ${rewarded} من الفائزين حصلوا على **+${rewardCoins} 🪙** — و${skippedDaily} صرفوا مكافأتهم اليومية بلعبة ثانية ⏳`;
            } else if (rewarded > 0) {
              rewardsNote = `\n\n🪙 **مكافأة الفوز:** كل فائز حي حصل على **+${rewardCoins} 🪙** عملة!`;
            } else if (skippedDaily > 0) {
              rewardsNote = '\n\n⏳ **مكافأة الفوز اليوم خلصت:** الفائزون صرفوا مكافأتهم اليومية بلعبة ثانية — **الألعاب تدفع مرة وحدة باليوم** 🎮 رجعوا بكره!';
            }
            // كلهم فشل تقني → بدون أي وعد مكافأة (نفس فلسفة باقي الألعاب)
          }
        }
      } catch (e) {}
    }

    const rolesTable = [...game.players.values()].map(p =>
      `${p.alive ? '🟢' : '☠️'} **${p.name}** — ${ROLE_INFO[p.role]?.name || 'بدون دور'}`
    ).join('\n') || '—';

    const endEmbed = new EmbedBuilder()
      .setColor(winner === 'mafia' ? COLORS.mafia : winner === 'town' ? COLORS.doc : '#95A5A6')
      .setTitle('🎮 انتهت لعبة المافيا!')
      .setDescription(`${messageText}\n\n🎭 **كشف الأدوار:**\n${rolesTable}${rewardsNote}`)
      .setFooter({ text: 'لعبة المافيا • Droplet' })
      .setTimestamp();

    await channel.send({ embeds: [endEmbed] }).catch(() => {});

    // تعطيل كل أزرار اللعبة (التجنيد + كشف الأدوار + الليلة + المرحلية الأخيرة)
    for (const msg of [game.lobbyMsg, game.revealMsg, game.nightMsg, game.phaseMsg]) {
      try {
        if (!msg || !msg.components?.length) continue;
        const rows = msg.components.map(r => ActionRowBuilder.from(r));
        rows.forEach(r => r.components.forEach(c => c.setDisabled(true)));
        await msg.edit({ components: rows });
      } catch (e) {}
    }
  },

  // زر الإنهاء الفوري خلال أي مرحلة (المالك أو الإدارة)
  _attachEndButton(game, msg) {
    if (!msg) return;
    try {
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: Math.max(NIGHT_MS, DAY_MS) + 2000,
        filter: i => i.customId === `mafia:end:${game.id}`
      });
      collector.on('collect', async (i) => {
        try {
          if (game.over) return;
          if (i.user.id !== game.hostId && !isAdmin(i.member)) {
            return ephReply(i, { content: '👑 فقط صاحب اللعبة أو الإدارة يقدرون ينهونها!' });
          }
          await i.deferUpdate().catch(() => {});
          collector.stop('ended');
          this.endGame(game, '✋ تم إنهاء اللعبة يدوياً.');
        } catch (e) {}
      });
    } catch (e) {}
  },

  // ================== مساعدات ==================
  _channel(game) {
    try {
      return game.client?.channels?.cache?.get(game.channelId) || null;
    } catch (e) {
      return null;
    }
  }
};
