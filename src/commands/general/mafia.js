/**
 * 🔪 لعبة المافيا (Mafia) — جماعية بالأدوار السرية
 * الأعضاء يتجندون بزر، يوصلهم دورهم سرّياً في الخاص (مافيا/محقق/طبيب/مواطن)،
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

// حماية من تشغيل لعبتين بنفس القناة
const activeMafiaChannels = new Set();
const gamesById = new Map();

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

module.exports = {
  name: 'mafia',
  description: 'لعبة المافيا الجماعية: أدوار سرية بالخاص ونقاش وتصويت في السيرفر 🔪',
  aliases: ['مافيا', 'mafia'],
  data: new SlashCommandBuilder()
    .setName('mafia')
    .setDescription('🔪 لعبة المافيا الجماعية بالأدوار السرية (5 لاعبين على الأقل)'),

  async execute(interaction) {
    return this.startLobby(interaction, interaction.channel, interaction.user, interaction.client);
  },

  async executePrefix(message, args, client) {
    return this.startLobby(null, message.channel, message.author, (client || message.client));
  },

  async startLobby(interaction, channel, host, client) {
    if (activeMafiaChannels.has(channel.id)) {
      const warn = '⚠️ هناك لعبة مافيا جارية في هذه القناة! انتظر حتى تنتهي.';
      if (interaction) return interaction.reply({ content: warn, flags: 64 });
      return channel.send(warn).catch(() => {});
    }

    const gid = Math.random().toString(36).slice(2, 8);
    const game = {
      id: gid, client, channelId: channel.id, guildId: channel.guild?.id || null, hostId: host.id,
      phase: 'lobby', players: new Map(),
      mafiaVotes: new Map(), doctorTarget: null, detTarget: null,
      votes: new Map(), round: 0, over: false,
      timers: [], phaseMsg: null, lobbyMsg: null, collector: null
    };
    gamesById.set(gid, game);
    activeMafiaChannels.add(channel.id);
    game.players.set(host.id, { id: host.id, name: host.username, role: null, alive: true, dmOk: false });

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
        value: '• دورك يوصلك **سرّياً في الخاص** (مافيا / محقق / طبيب / مواطن)\n' +
               '• 🌙 بالليل: المافيا تختار ضحية، الطبيب ينقذ، المحقق يفحص\n' +
               '• ☀️ بالنهار: نقاش ثم تصويت لإعدام مشتبه واحد\n' +
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
      activeMafiaChannels.delete(channel.id);
      gamesById.delete(gid);
      return;
    }

    const lobbyCollector = game.lobbyMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: LOBBY_MS });
    game.collector = lobbyCollector;

    lobbyCollector.on('collect', async (btn) => {
      if (game.over || game.phase !== 'lobby') return;

      if (btn.customId === `mafia:join:${gid}`) {
        if (game.players.has(btn.user.id)) {
          return btn.reply({ content: '✅ أنت مسجّل مسبقاً في اللعبة!', flags: 64 });
        }
        if (game.players.size >= MAX_PLAYERS) {
          return btn.reply({ content: '⚠️ اللعبة ممتلئة (الحد الأقصى 25 لاعباً)!', flags: 64 });
        }
        game.players.set(btn.user.id, { id: btn.user.id, name: btn.user.username, role: null, alive: true, dmOk: false });
        await btn.reply({ content: '🎯 تمت إضافتك للعبة! دورك سيصلك بالخاص عند البدء — **افتح رسائلك الخاصة الآن!**', flags: 64 });
        return this._refreshLobbyEmbed(game, refreshDescription);
      }

      if (btn.customId === `mafia:leave:${gid}`) {
        if (btn.user.id === game.hostId) {
          game.players.delete(btn.user.id);
          if (game.players.size === 0) {
            await btn.deferUpdate();
            lobbyCollector.stop('cancelled');
            return this.endGame(game, '🚫 تم إلغاء اللعبة (خرج المالك ولم يبق لاعبين).');
          }
          // نقل الملكية لأول لاعب متبقٍ
          game.hostId = [...game.players.keys()][0];
          const newHost = game.players.get(game.hostId);
          await btn.reply({ content: `👑 المالك خرج — الملكية انتقلت إلى <@${game.hostId}>!`, flags: 64 });
          return this._refreshLobbyEmbed(game, refreshDescription);
        }
        game.players.delete(btn.user.id);
        await btn.reply({ content: '🚪 تم حذفك من اللعبة.', flags: 64 });
        return this._refreshLobbyEmbed(game, refreshDescription);
      }

      if (btn.customId === `mafia:start:${gid}`) {
        if (btn.user.id !== game.hostId) {
          return btn.reply({ content: '👑 فقط صاحب اللعبة يقدر يبدأها!', flags: 64 });
        }
        if (game.players.size < MIN_PLAYERS) {
          return btn.reply({ content: `⚠️ تحتاج ${MIN_PLAYERS} لاعبين على الأقل للبدء (الحاليون: ${game.players.size}).`, flags: 64 });
        }
        await btn.deferUpdate();
        lobbyCollector.stop('started');
        return this.beginGame(game);
      }

      if (btn.customId === `mafia:end:${gid}`) {
        if (btn.user.id !== game.hostId && !isAdmin(btn.member)) {
          return btn.reply({ content: '👑 فقط صاحب اللعبة أو الإدارة يقدرون يلغونها!', flags: 64 });
        }
        await btn.deferUpdate();
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
        .setDescription(`🎭 **عدد اللاعبين:** ${ids.length}\n🔪 **عدد المافيا السرية:** ${mafiaCount}\n\n📩 **الأدوار تُرسل الآن في الخاصة — افتحوا رسائلكم فوراً!**\n🌙 الليل الأول يبدأ بعد لحظات…`)
        .setTimestamp()]
    }).catch(() => {});

    // توزيع الأدوار بالخاص
    for (const p of game.players.values()) {
      await this._sendRoleDm(game, p);
    }

    await this.startNight(game);
  },

  async _sendRoleDm(game, p) {
    const user = await game.client?.users.fetch(p.id).catch(() => null);
    if (!user) { p.dmOk = false; return; }

    const info = ROLE_INFO[p.role];
    const goal = {
      mafia: '🔪 **هدفك:** امحو الأبرياء حتى يصير عدكم يساوي عددهم. تتفقون بالليل على ضحية واحدة!',
      det:   '🕵️ **هدفك:** افحص لاعباً واحداً كل ليل واكتشف هل هو مافيا — ابقَ حيّاً ووجّه المدينة بالتصويت!',
      doc:   '💉 **هدفك:** اختر شخصاً كل ليل تنقذه من الموت (تقدر تنقذ نفسك).',
      town:  '👤 **هدفك:** انتبه للحديث والسلوك؛ اتصوّت ضد المشتبهين واقضوا على المافيا بالنهار!'
    }[p.role];

    const dmEmbed = new EmbedBuilder()
      .setColor(info.color)
      .setTitle(`رسالتك السرّية — دورك: ${info.name}`)
      .setDescription(`🔒 **هذا الدور سرّي! لا تكشفه لأحد إلا إذا مُتّ أو انكشف بالتصويت.**\n\n${goal}\n\n👥 **عدد اللاعبين:** ${game.players.size}\n🌙 كل ليلة تصلك رسالة فيها زر للتفعيل (إذا دورك يتطلب فعل ليلاً).`)
      .setFooter({ text: 'لعبة المافيا • Droplet' });

    try {
      await user.send({ embeds: [dmEmbed] });
      p.dmOk = true;
    } catch (e) {
      p.dmOk = false;
      const channel = this._channel(game);
      if (channel) {
        await channel.send(`⚠️ **${p.name}** رسائلك الخاصة مقفلة — **افتح خاصك الآن** لاستلام دورك!`).catch(() => {});
      }
    }
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
      .setDescription('المدينة تنام… 🔒\n**المافيا والطبيب والمحقق مستيقظون الآن في الخاصة.**\n🤫 الأبرياء ينامون في أمانهم المزيف…\n\n⏱️ الليل يستمر **45 ثانية**.')
      .setFooter({ text: `الجولة: ${game.round}/${MAX_ROUNDS}` })
      .setTimestamp();

    game.phaseMsg = await channel.send({ embeds: [nightEmbed] }).catch(() => null);
    this._attachEndButton(game, game.phaseMsg);

    // رسائل الخاصة للعمليات الليلية (كل منها مستقلة)
    await this._sendNightKillDm(game);
    await this._sendNightSaveDm(game);
    await this._sendNightInspectDm(game);

    const t = setTimeout(() => { if (!game.over && game.phase === 'night') this.resolveNight(game); }, NIGHT_MS);
    game.timers.push(t);
  },

  async _sendNightKillDm(game) {
    const mafias = aliveList(game, { onlyRole: 'mafia' }).filter(m => m.dmOk);
    const targets = aliveList(game, { excludeRole: 'mafia' });
    if (!mafias.length || !targets.length) return;

    const buttons = targets.slice(0, 25).map(p =>
      new ButtonBuilder()
        .setCustomId(`mafia:kill:${game.id}:${p.id}`)
        .setLabel(String(p.name).slice(0, 80))
        .setStyle(ButtonStyle.Danger)
    );

    for (const m of mafias) {
      const user = await game.client?.users.fetch(m.id).catch(() => null);
      if (!user) continue;
      try {
        const dmMsg = await user.send({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.mafia)
            .setTitle('🌙 المافيا مستيقظة — اختاروا الضحية')
            .setDescription('اضغط على زر الضحية.\n⏱️ **45 ثانية** — إذا ما اختار أحدكم، تُختار الضحية عشوائياً عند الفجر.')
            .setTimestamp()],
          components: chunkButtons(buttons)
        });
        this._collectNightAction(game, m, 'kill', dmMsg);
      } catch (e) {
        m.dmOk = false;
      }
    }
  },

  async _sendNightSaveDm(game) {
    const doc = [...game.players.values()].find(p => p.role === 'doc' && p.alive && p.dmOk);
    if (!doc) return;
    const targets = aliveList(game, {});
    if (!targets.length) return;

    const buttons = targets.slice(0, 25).map(p =>
      new ButtonBuilder()
        .setCustomId(`mafia:save:${game.id}:${p.id}`)
        .setLabel(String(p.name).slice(0, 80))
        .setStyle(ButtonStyle.Success)
    );

    const user = await game.client?.users.fetch(doc.id).catch(() => null);
    if (!user) return;
    try {
      const dmMsg = await user.send({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.doc)
          .setTitle('🌙 الطبيب مستيقظ — اختار من تنقذه')
          .setDescription('اضغط على زر الشخص.\n⏱️ **45 ثانية** — تقدر تنقذ نفسك.')
          .setTimestamp()],
        components: chunkButtons(buttons)
      });
      this._collectNightAction(game, doc, 'save', dmMsg);
    } catch (e) {
      doc.dmOk = false;
    }
  },

  async _sendNightInspectDm(game) {
    const det = [...game.players.values()].find(p => p.role === 'det' && p.alive && p.dmOk);
    if (!det) return;
    const targets = aliveList(game, { excludeSelf: det.id });
    if (!targets.length) return;

    const buttons = targets.slice(0, 25).map(p =>
      new ButtonBuilder()
        .setCustomId(`mafia:inspect:${game.id}:${p.id}`)
        .setLabel(String(p.name).slice(0, 80))
        .setStyle(ButtonStyle.Primary)
    );

    const user = await game.client?.users.fetch(det.id).catch(() => null);
    if (!user) return;
    try {
      const dmMsg = await user.send({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.det)
          .setTitle('🌙 المحقق مستيقظ — اختار من تفحص')
          .setDescription('اضغط على زر المشتبه — النتيجة توصلك عند الفجر.\n⏱️ **45 ثانية**')
          .setTimestamp()],
        components: chunkButtons(buttons)
      });
      this._collectNightAction(game, det, 'inspect', dmMsg);
    } catch (e) {
      det.dmOk = false;
    }
  },

  _collectNightAction(game, actor, action, dmMsg) {
    const collector = dmMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: NIGHT_MS,
      filter: i => i.user.id === actor.id && i.customId.startsWith(`mafia:${action}:${game.id}:`)
    });

    collector.on('collect', async (i) => {
      if (game.over || game.phase !== 'night') {
        return i.reply({ content: '⌛ الليلة انتهت بالفعل.', flags: 64 }).catch(() => {});
      }
      const targetId = i.customId.split(':')[3];
      const target = game.players.get(targetId);
      const who = target ? target.name : '؟';
      if (action === 'kill') game.mafiaVotes.set(actor.id, targetId);
      else if (action === 'save') game.doctorTarget = targetId;
      else game.detTarget = targetId;

      const labels = { kill: '🔪 ضحيتك الليلة', save: '💉 سترفع المستشفى عنه الليلة', inspect: '🕵️ هدف فحصك' };
      if (action === 'kill') collector.stop('chosen');
      return i.reply({ content: `${labels[action]}: **${who}** ✅`, flags: 64 }).catch(() => {});
    });
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

    // نتيجة فحص المحقق توصل بالخاص
    const det = [...game.players.values()].find(p => p.role === 'det' && p.alive);
    let detNote = '';
    if (det && det.dmOk && game.detTarget) {
      const target = game.players.get(game.detTarget);
      if (target && target.id !== det.id) {
        const isMafia = target.role === 'mafia';
        detNote = '\n\n🕵️ **المحقق** توصلت نتيجته بالخاص.';
        const user = await game.client?.users.fetch(det.id).catch(() => null);
        if (user) {
          await user.send({
            embeds: [new EmbedBuilder()
              .setColor(isMafia ? COLORS.mafia : COLORS.doc)
              .setTitle('🕵️ نتيجة الفحص')
              .setDescription(`الشخص **${target.name}**: ${isMafia ? '🔪 **مافيا!**' : '✅ **بريء!**'}\nاستخدم النتيجة بحكمة في التصويت.`)
              .setTimestamp()]
          }).catch(() => {});
        }
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
      .setDescription(`👥 **الأحياء (${alive.length}):**\n${aliveDisplay}\n\n☠️ **القتلى:** ${deadList}\n\n🗳️ **صرّح بصوتك من القائمة بالأسفل!** الأصوات الأكثر يُعدم صاحبها (التعادل = لا إعدام).\n⏱️ مدة النهار: **90 ثانية**.`)
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
      new ButtonBuilder().setCustomId(`mafia:end:${game.id}`).setLabel('إنهاء اللعبة ✖ (للمالك)').setStyle(ButtonStyle.Secondary)
    );

    game.phaseMsg = await channel.send({ embeds: [dayEmbed], components: [row, endRow] }).catch(() => null);
    this._attachEndButton(game, game.phaseMsg);

    const voteCollector = game.phaseMsg.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: DAY_MS,
      filter: (i) => i.customId === `mafia:vote:${game.id}` && game.players.has(i.user.id)
    });

    voteCollector.on('collect', async (i) => {
      if (game.over || game.phase !== 'day') return;
      const voter = game.players.get(i.user.id);
      if (!voter || !voter.alive) {
        return i.reply({ content: '☠️ الأحياء فقط يصوتون!', flags: 64 });
      }
      if (game.votes.has(voter.id)) {
        return i.reply({ content: '🗳️ صوّتت بالفعل! صوتك الواحد فقط.', flags: 64 });
      }
      const target = game.players.get(i.values[0]);
      if (!target || !target.alive) {
        return i.reply({ content: '❌ خيار غير صالح.', flags: 64 });
      }
      game.votes.set(voter.id, target.id);
      await i.reply({ content: `✅ صوتك مسجّل ضد **${target.name}**.`, flags: 64 });

      if (game.votes.size >= alive.length) voteCollector.stop('all_voted');
    });

    voteCollector.on('end', () => {
      if (game.over || game.phase !== 'day') return;
      this.resolveDay(game);
    });

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
    try { game.collector?.stop('ended'); } catch (e) {}
    gamesById.delete(game.id);
    activeMafiaChannels.delete(game.channelId);

    const channel = this._channel(game);
    if (!channel) return;

    // 🪙 توزيع المكافأة على اللاعبين الناجين من الفريق الفائز (تعادل = لا مكافأة)
    let rewardsNote = '';
    if (winner) {
      try {
        const db = require('../../database');
        const settings = db.getGuildSettings ? (db.getGuildSettings(game.guildId) || {}) : {};
        const rewardCoins = Number(settings.game_reward_mafia) || 120;
        const winningTeam = winner === 'mafia' ? 'mafia' : null;
        let rewarded = 0;
        if (winningTeam && game.guildId) {
          for (const p of game.players.values()) {
            if (p.alive && p.role === winningTeam) {
              try { db.addCoins(p.id, game.guildId, rewardCoins); rewarded++; } catch (e) {}
            }
          }
          if (rewarded > 0) {
            rewardsNote = `\n\n🪙 **مكافأة الفوز:** كل فائز حي حصل على **+${rewardCoins} 🪙** عملة!`;
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

    // تعطيل مكوّنات آخر رسالة مرحلية (زر الإنهاء وغيرها)
    if (game.phaseMsg) {
      try {
        const rows = game.phaseMsg.components.map(r => ActionRowBuilder.from(r));
        rows.forEach(r => r.components.forEach(c => c.setDisabled(true)));
        await game.phaseMsg.edit({ components: rows });
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
        if (game.over) return;
        if (i.user.id !== game.hostId && !isAdmin(i.member)) {
          return i.reply({ content: '👑 فقط صاحب اللعبة أو الإدارة يقدرون ينهونها!', flags: 64 }).catch(() => {});
        }
        await i.deferUpdate().catch(() => {});
        collector.stop('ended');
        this.endGame(game, '✋ تم إنهاء اللعبة يدوياً.');
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
