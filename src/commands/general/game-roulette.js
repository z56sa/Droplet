/**
 * 🎡 لعبة الروليت الدوارة (بالأدوار)
 * العجلة تنزل بالتناوب على كل عضو — اللي تنط عليه ياخذ صلاح الطرد:
 * يختار عضو من الأحياء ويطرده برا الجولة، وهكذا حتى يبقى ناجٍ واحد
 * ياخذ الجائزة كاملة. اللي يتأخر بالاختيار — العجلة تختار بداله!
 * الجائزة من إعداد game_reward_roulette بالداشبورد.
 */
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const db = require('../../database');
// 🔗 حارس الجولات مشترك مع باقي الألعاب حتى لا تتداخل في نفس الروم
const game = require('./game');
const activeGames = game.activeGames;
const preflightGamesError = game.preflightGamesError;

const MIN_PLAYERS = 3;    // تحت هذا العدد اللعبة تلغي (2 = القرار جاهز مسبقاً)
const MAX_PLAYERS = 15;   // حد أقصى (تنبيه: قائمة الاختيار تسع 25)
const JOIN_SECONDS = 30;  // مدة فتح باب التسجيل
const CHOICE_SECONDS = 40; // مدة انتظار اختيار المطرود — بعدها العجلة تقرر
const SPIN_DELAY = 1500;  // مهلة تشويق بين الدورات

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// 🧾 إيمبد التسجيل المباشر (يتحدث مع كل مشترك جديد)
function joinEmbed(players, rewardCoins, starter) {
  const list = players.length
    ? players.map((p, i) => `\`${i + 1}.\` <@${p.id}>`).join('\n')
    : '_(بعد أحد… كون أول من يركب العجلة 🎡)_';
  return new EmbedBuilder()
    .setColor('#e67e22')
    .setTitle('🎡 الروليت — من تطرده العجلة؟')
    .setDescription(
      `العجلة ستنزل **بالتناوب** على كل عضو — اللي تنط عليه ياخذ صلاح الطرد:\n` +
      `يختار عضو من الأحياء ويطرده برا الجولة 💀\n` +
      `و**اللي يتأخر بالاختيار — العجلة تختار بداله!** 🎲\n\n` +
      `🏆 آخر ناجٍ ياخذ **+${rewardCoins} 🪙** كاملة!\n` +
      `⏱️ معك **${JOIN_SECONDS} ثانية** للتسجيل — الحد الأقصى **${MAX_PLAYERS} لاعب**.`
    )
    .addFields({
      name: `👥 المشتركون (${players.length}/${MAX_PLAYERS}) — الأدنى ${MIN_PLAYERS}`,
      value: list
    })
    .setFooter({ text: `بدأها: ${starter.username} | جائزة الفائز: ${rewardCoins} 🪙` })
    .setTimestamp();
}

// 🎯 إيمبد دورة (يحدّث كل جولة)
function spinEmbed(order, aliveIds, kickedLog, current, turnNo) {
  const aliveList = order.filter(p => aliveIds.has(p.id)).map(p => `<@${p.id}>`).join(' ');
  const kickedList = kickedLog.slice(-5).reverse().join('\n');
  const embed = new EmbedBuilder()
    .setColor('#f39c12')
    .setTitle(`🎡 الدورة ${turnNo} — العجلة انطّت!`)
    .setDescription(
      `العجلة وقفت عند **<@${current.id}>** — الحكم بيده الآن:\n` +
      `يختار من قائمة الأحياء ويطرده برا الجولة 💀 (لو تأخر، العجلة تختار بداله 🎲)`
    )
    .addFields(
      { name: `⚔️ الأحياء (${aliveIds.size})`, value: aliveList || '—' },
      { name: '💀 المطرودون (آخر 5)', value: kickedList ? kickedList : '_(بعد أحد — أمان كامل 🆓)_' }
    )
    .setFooter({ text: `الجولة تكمل حتى الصمود الأخير 🏆` })
    .setTimestamp();
  return embed;
}

module.exports = {
  name: 'game-roulette',
  description: 'لعبة الروليت الدوارة: العجلة تنط على الأعضاء بالتبادل واللي تنط عليه يطرد عضو 💀',
  aliases: ['روليت', 'الدولاب', 'roulette'],
  data: new SlashCommandBuilder()
    .setName('game-roulette')
    .setDescription('🎡 الروليت الدوارة: انطّت عليك العجلة؟ اختر من تطرده — آخر ناجٍ يكسب!'),

  async execute(interaction) {
    // ✅ الحجب قبل الـ defer — الرد الظوري يعمل قبل ما تتحول الرسالة لغير مؤقّتة (editReply مع flags يجيب 400)
    // ✅ إغلاق سباق البدء: القفل يفتح ملاصقاً للفحص قبل أي await — نافذة defer ما تسمح بلقطة مزدوجة
    const settings = db.getGuildSettings ? (db.getGuildSettings(interaction.guild.id) || {}) : {};
    const err = preflightGamesError(interaction.channelId, interaction.guild.id, settings);
    if (err) return interaction.reply({ content: err, ephemeral: true });
    activeGames.add(interaction.channel.id);
    try {
      await interaction.deferReply();
    } catch (e) {
      activeGames.delete(interaction.channel.id);
      return;
    }
    return this.startRoulette(interaction.channel, interaction.user, interaction.guild.id, (opts) => interaction.editReply(opts));
  },

  async executePrefix(message) {
    const settings = db.getGuildSettings ? (db.getGuildSettings(message.guild.id) || {}) : {};
    const err = preflightGamesError(message.channel.id, message.guild.id, settings);
    if (err) return message.reply({ content: err }).catch(() => {});
    return this.startRoulette(message.channel, message.author, message.guild.id, async (opts) => {
      return message.reply(opts).catch(() => message.channel.send(opts));
    });
  },

  async startRoulette(channel, starter, guildId, replyMethod) {
    // 🔒 الحجب (اللعبة الفعالة/تعطيل/الروم المخصص) مرّ مسبقاً في execute/executePrefix — preflightGamesError
    const settings = db.getGuildSettings ? (db.getGuildSettings(guildId) || {}) : {};
    const rewardCoins = Number(settings.game_reward_roulette) || 100;

    activeGames.add(channel.id);

    // 🛡️ حماية القفل: أي خطأ أثناء تجهيز الجولة يحرر القناة فوراً — ما تبقى مغلقة إلى رست البوت
    try {
      const roundId = `roulette_${Date.now()}_${channel.id}`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(roundId)
          .setLabel('اركب العجلة')
          .setEmoji('🎡')
          .setStyle(ButtonStyle.Primary)
      );

      const players = [];
      const roundMsg = await replyMethod({
        embeds: [joinEmbed(players, rewardCoins, starter)],
        components: [row]
      });
      if (!roundMsg) throw new Error('reply returned no message');

      // 🕐 مرحلة التسجيل
      const joinCollector = roundMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: JOIN_SECONDS * 1000
      });

    joinCollector.on('collect', async (btn) => {
      if (btn.customId !== roundId) return;
      if (players.some(p => p.id === btn.user.id)) {
        return btn.reply({ content: '✋ انت مشترك بالجولة من قبل!', flags: 64 }).catch(() => {});
      }
      if (players.length >= MAX_PLAYERS) {
        return btn.reply({ content: `🚫 المكتمل (${MAX_PLAYERS} لاعب) — تعال شاهد فقط!`, flags: 64 }).catch(() => {});
      }
      players.push({ id: btn.user.id, name: btn.user.username });
      await btn.deferUpdate().catch(() => {});
      await roundMsg.edit({ embeds: [joinEmbed(players, rewardCoins, starter)] }).catch(() => {});
    });

    // ⏳ انتهاء التسجيل — انطلاق الدورات
    joinCollector.on('end', async () => {
      try {
        if (players.length < MIN_PLAYERS) {
          activeGames.delete(channel.id);
          await roundMsg.edit({
            embeds: [new EmbedBuilder()
              .setColor('#95a5a6')
              .setTitle('🚫 أُلغيت الجولة')
              .setDescription(`لازم **${MIN_PLAYERS} لاعب على الأقل** — بالعدد الأقل ما ينفع للطرد أي مبهم… جرّبوا مرة أخرى! 🎡`)
              .setTimestamp()],
            components: []
          }).catch(() => {});
          return;
        }
        await roundMsg.edit({ components: [] }).catch(() => {});

        // 🎲 خلط ترتيب العجلة
        const order = players.slice();
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        const nameById = new Map(order.map(p => [p.id, p.name]));
        const aliveIds = new Set(order.map(p => p.id));
        const kickedLog = [];
        let cursor = -1;

        // جِب التالي الحيّ بالدورة الدائرية
        const nextAlive = () => {
          for (let s = 1; s <= order.length; s++) {
            const idx = (cursor + s) % order.length;
            if (aliveIds.has(order[idx].id)) { cursor = idx; return order[idx]; }
          }
          return null;
        };

        // 📥 انتظار اختيار المطرود — أو العجلة تقرر
        const waitForPick = (menuId, currentId) => new Promise((resolve) => {
          let done = false;
          const col = roundMsg.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: CHOICE_SECONDS * 1000
          });
          col.on('collect', async (sel) => {
            if (sel.customId !== menuId) return;
            if (sel.user.id !== currentId) {
              return sel.reply({ content: '🏷️ هذي دورة غيرك — استنى صاحبها يقرر!', flags: 64 }).catch(() => {});
            }
            done = true;
            const victimId = sel.values[0];
            await sel.deferUpdate().catch(() => {});
            col.stop('picked');
            resolve(victimId);
          });
          col.on('end', () => { if (!done) resolve(null); });
        });

        let turnNo = 0;
        while (aliveIds.size > 1) {
          turnNo++;
          const current = nextAlive();
          if (!current) break; // أمان نظري — ما يوصل هنا
         const others = order.filter(p => aliveIds.has(p.id) && p.id !== current.id);

          // قائمة الاختيار (سطر واحد بحد أقصى 14 لاعباً غيره)
          const menuId = `rk_${roundId}_${turnNo}`;
          const menuRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(menuId)
              .setPlaceholder(`${current.name} — من تطرده برا الجولة؟ 💀`)
              .addOptions(others.map(p =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(String(p.name).slice(0, 25) || 'لاعب')
                  .setValue(p.id)
                  .setDescription('أطرده برا الجولة 💀')
              ))
          );

          await roundMsg.edit({ embeds: [spinEmbed(order, aliveIds, kickedLog, current, turnNo)], components: [menuRow] }).catch(() => {});
          await wait(SPIN_DELAY);

          const victimId = await waitForPick(menuId, current.id);
          let victim = victimId;
          if (!victim) {
            victim = others[Math.floor(Math.random() * others.length)].id;
            await channel.send(`⌛ **${current.name}** تأخر بالقرار… فالعجلة خذت الحكم بالبيدها واختارت بداله! 🎲`).catch(() => {});
          }

          aliveIds.delete(victim);
          kickedLog.push(`<@${current.id}> → <@${victim}>`);
          await roundMsg.edit({ components: [] }).catch(() => {});
          await channel.send(`💀 **${nameById.get(current.id)}** قبض على الفرصة — طلّع **${nameById.get(victim)}** برا الجولة! الباقي **${aliveIds.size}** 😱`).catch(() => {});
        }

        // 🏆 آخر ناجٍ يمثل الفائز
        const winnerId = [...aliveIds][0];

        // 🎮 جائزة مرة وحدة باليوم عبر كل الألعاب
        let claim = { paid: true };
        try {
          if (db.claimGameReward) claim = db.claimGameReward(winnerId, guildId, rewardCoins);
          else if (db.addCoins) db.addCoins(winnerId, guildId, rewardCoins);
        } catch (e) { claim = { paid: false, failed: true }; }

        // 🧾 نص المكافأة الواضح: صرف فعلي / استُنزفت اليومية / جرح تقني / جوائز مقفلة (0)
        const rewardLine =
          rewardCoins <= 0 ? '🏆 صدارة بلا عملات (الجوائز مقفلة من الإدارة)' :
          claim.paid ? `الجائزة **+${rewardCoins} 🪙** عملة!` :
          claim.failed ? '⚠️ خلل تقني بالصرف — بلا مكافأة هالمرة 🛠️' :
          'تصدّرت آخر الصمود! 🏆 (جائزتك اليوم صرفت — **الألعاب تدفع مرة وحدة باليوم** 🎮)';

        activeGames.delete(channel.id);
        await roundMsg.edit({ components: [] }).catch(() => {});
        await roundMsg.edit({
          embeds: [new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('🏆 انتهت الجولة — آخر الصمود!')
            .setDescription(
              `العجلة دارت وكلّم المطرود وبرا — و**${nameById.get(winnerId) || 'الناجّي'}** آخر ناجٍ شاشة:\n\n` +
              `🎉 مبروك <@${winnerId}> — ${rewardLine}` +
              `\n\n⚡ الجولة الجاي عمّدون أشد القيادة 🔥`
            )
            .setTimestamp()]
        }).catch(() => {});
      } catch (e) {
        console.error('[Roulette] round error:', e);
        activeGames.delete(channel.id);
        await roundMsg.edit({ components: [] }).catch(() => {});
      }
    });
    } catch (setupErr) {
      console.error('[Roulette] setup failed:', setupErr);
      activeGames.delete(channel.id);
    }
  }
};
