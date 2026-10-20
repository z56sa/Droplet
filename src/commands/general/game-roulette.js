/**
 * 🔫 لعبة الروليت الروسية الجماعية (Russian Roulette)
 * البوت يحضّر مسدس 6 خانات فيه حبة وحدة، الأعضاء يسجلون بالزر،
 * ثم ترتيب عشوائي وكل واحد يسحب الزناد بدوره:
 * كلّك فاضي = عايش — والحبة = فقد الجولة.
 * كل ناجٍ بآخر الجولة ياخذ المكافأة كاملة (إعداد game_reward_roulette من الداشبورد).
 */
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const db = require('../../database');
// 🔗 حارس الجولات مشترك مع باقي الألعاب حتى لا تتداخل في نفس الروم
const game = require('./game');
const activeGames = game.activeGames;

const CHAMBERS = 6;        // عدد خانات المسدس
const MAX_PLAYERS = 15;    // حد أقصى للجريئين (يمنع سبام الرسائل)
const JOIN_SECONDS = 25;   // مدة فتح باب التسجيل
const TURN_DELAY = 1300;   // فاصل تشويقي بين كل سحب زناد

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// 🧾 إيمبد التسجيل المباشر (يحدث مع كل مشترك جديد)
function joinEmbed(players, rewardCoins, starter) {
  const list = players.length
    ? players.map((p, i) => `\`${i + 1}.\` <@${p.id}>`).join('\n')
    : '_(بعد أحد… كون أول جريء 🫵)_';
  return new EmbedBuilder()
    .setColor('#c0392b')
    .setTitle('🔫 الروليت الروسية — من يجرؤ؟')
    .setDescription(
      `حضّرنا مسدساً به **${CHAMBERS} خانات** وحبة واحدة مكانها عشوائي.\n` +
      `سجّل بالزر تحت، وبعدها ترتيب عشوائي: كل واحد يسحب الزناد بدوره.\n` +
      `**كل ناجٍ بآخر الجولة ياخذ +${rewardCoins} 🪙**!\n\n` +
      `⏱️ معك **${JOIN_SECONDS} ثانية** للتسجيل — الحد الأقصى **${MAX_PLAYERS} جريء**.`
    )
    .addFields({
      name: `⚔️ المشتركون (${players.length}/${MAX_PLAYERS}) — العدد الأدنى 2`,
      value: list
    })
    .setFooter({ text: `بدأها: ${starter.username} | جائزة كل ناجٍ: ${rewardCoins} 🪙` })
    .setTimestamp();
}

module.exports = {
  name: 'game-roulette',
  description: 'لعبة الروليت الروسية الجماعية: من يجرؤ؟ 🔫',
  aliases: ['روليت', 'روسي', 'roulette'],
  data: new SlashCommandBuilder()
    .setName('game-roulette')
    .setDescription('🔫 الروليت الروسية: سجّل بالجولة وجرّب حظك — كل ناجٍ يكسب!'),

  async execute(interaction) {
    await interaction.deferReply();
    return this.startRoulette(interaction.channel, interaction.user, interaction.guild.id, (opts) => interaction.editReply(opts));
  },

  async executePrefix(message) {
    return this.startRoulette(message.channel, message.author, message.guild.id, async (opts) => {
      return message.reply(opts).catch(() => message.channel.send(opts));
    });
  },

  async startRoulette(channel, starter, guildId, replyMethod) {
    if (activeGames.has(channel.id)) {
      return replyMethod({ content: '⚠️ هناك لعبة جارية بالفعل في هذه القناة! انتظر حتى تنتهي.', flags: 64 });
    }

    const settings = db.getGuildSettings ? (db.getGuildSettings(guildId) || {}) : {};
    if (settings.games_enabled === 0 || settings.games_enabled === '0' || settings.games_enabled === false) {
      return replyMethod({ content: '🔒 نظام الألعاب معطل حالياً في هذا السيرفر من لوحة التحكم.', flags: 64 });
    }
    if (settings.games_channel && settings.games_channel !== channel.id) {
      return replyMethod({ content: `⚠️ تم تخصيص الألعاب لتعمل فقط في روم: <#${settings.games_channel}>!`, flags: 64 });
    }

    const rewardCoins = Number(settings.game_reward_roulette) || 100;

    activeGames.add(channel.id);

    const roundId = `roulette_${Date.now()}_${channel.id}`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(roundId)
        .setLabel('سجّل بالجولة')
        .setEmoji('🔫')
        .setStyle(ButtonStyle.Danger)
    );

    const players = [];
    let roundMsg = null;
    try {
      roundMsg = await replyMethod({
        embeds: [joinEmbed(players, rewardCoins, starter)],
        components: [row]
      });
    } catch (e) {
      activeGames.delete(channel.id);
      return;
    }
    if (!roundMsg) { activeGames.delete(channel.id); return; }

    // 🕐 مرحلة التسجيل
    const joinCollector = roundMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: JOIN_SECONDS * 1000
    });

    joinCollector.on('collect', async (btn) => {
      if (btn.customId !== roundId) return;
      if (players.some(p => p.id === btn.user.id)) {
        return btn.reply({ content: '✋ انت مسجّل بالجولة من قبل!', flags: 64 }).catch(() => {});
      }
      if (players.length >= MAX_PLAYERS) {
        return btn.reply({ content: `🚫 المكتمل (${MAX_PLAYERS} جريء) — تكفّل بالمشاهدة!`, flags: 64 }).catch(() => {});
      }
      players.push({ id: btn.user.id, name: btn.user.username });
      await btn.deferUpdate().catch(() => {});
      await roundMsg.edit({ embeds: [joinEmbed(players, rewardCoins, starter)] }).catch(() => {});
    });

    joinCollector.on('end', async () => {
      try {
        // 🚫 انسحاب الجولة لو المشاركين أقل من اثنين
        if (players.length < 2) {
          activeGames.delete(channel.id);
          await roundMsg.edit({
            embeds: [new EmbedBuilder()
              .setColor('#95a5a6')
              .setTitle('🚫 أُلغيت الجولة')
              .setDescription('لازم **عضوين على الأقل** يجرؤون… حاولوا مرة ثانية! 🎯')
              .setTimestamp()],
            components: []
          }).catch(() => {});
          return;
        }
        await roundMsg.edit({ components: [] }).catch(() => {});

        // 🎲 خلط رتبة السحب + خانة الحبة العشوائية
        const order = players.slice();
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        const bulletSlot = 1 + Math.floor(Math.random() * CHAMBERS);

        await roundMsg.edit({
          embeds: [new EmbedBuilder()
            .setColor('#e67e22')
            .setTitle('🔁 بدأ التدوير!')
            .setDescription(`**${order.length}** جريئ بترتيب عشوائي — المسدس ${CHAMBERS} خانات… السحب يبدأ الآن، بالتوفيق للجميع 💀`)
            .setTimestamp()]
        }).catch(() => {});

        const survivors = [];
        let chamber = 0;
        for (const p of order) {
          chamber++;
          await wait(TURN_DELAY);
          if (chamber === bulletSlot) {
            // 💥 صاحب الدور وقفت عنده الحبة
            await channel.send(`💥 **${p.name}** سحب الزناد… **طقّطط!** الرصاصة ضربت — فقد الجولة 💀 (الخانة ${chamber}/${CHAMBERS})`).catch(() => {});
            break;
          }
          survivors.push(p);
          await channel.send(`🔫 **${p.name}** سحب الزناد… *كلّك* — خانة فاضية ✅ (${chamber}/${CHAMBERS})`).catch(() => {});
        }

        // 🏆 الصرف النهائي لكل الناجين
        for (const p of survivors) {
          try { if (db.addCoins) db.addCoins(p.id, guildId, rewardCoins); } catch (e) {}
        }

        const survivorList = survivors.map(p => `<@${p.id}>`).join(' ');
        const resultEmbed = new EmbedBuilder()
          .setColor(bulletSlot > order.length ? '#2ecc71' : '#e74c3c')
          .setTitle(bulletSlot > order.length ? '🍀 ليلة المعجزة — الكل نجا!' : '💀 انتهت الجولة — عُدنا لصوب الحبة')
          .setDescription(
            (bulletSlot > order.length
              ? `الحبة كانت بالخانة الأخيرة (${bulletSlot}/${CHAMBERS}) وما وصلها أحد — **كل المشتركين ناجون!**`
              : `الحبة ضربت **${order.find(x => !survivors.includes(x))?.name || 'الجريء الأخير'}** بالخانة ${bulletSlot}/${CHAMBERS}.\n\nالنجاة شرفت **${survivors.length}** من الجريئين:`) +
            `\n${survivorList}` +
            `\n\n💰 كل ناجٍ حصل على **+${rewardCoins} 🪙** عملة!` +
            `\n🎯 الجولة الجاية — العمّد الأكثر جرأة يتفوقون 🔥`
          )
          .setTimestamp();

        activeGames.delete(channel.id);
        await roundMsg.edit({ embeds: [resultEmbed] }).catch(() => {});
      } catch (e) {
        console.error('[Roulette] round error:', e);
        activeGames.delete(channel.id);
      }
    });
  }
};
