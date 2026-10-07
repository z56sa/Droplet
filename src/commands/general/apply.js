// ============================================================
// FILE: src/commands/general/apply.js
// نظام التقديمات التفاعلي الشامل (Discord Embed + Button + Modal)
// ============================================================
const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits
} = require("discord.js");
const database = require("../../database/index");
const config = require("../../config.json");
const { t } = require("../../utils/lang");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("apply")
    .setDescription("Open the applications menu or send the application message in the channel")
    .addSubcommand(sub =>
      sub
        .setName("form")
        .setDescription("Apply for a job or rank in the server")
    )
    .addSubcommand(sub =>
      sub
        .setName("send_panel")
        .setDescription("Send the applications panel message in a channel (staff only)")
        .addChannelOption(opt => opt.setName("channel").setDescription("The channel to send the application message in").setRequired(false))
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const subCmd = interaction.options.getSubcommand(false) || "form";

    // 1. إرسال بانل التقديم في قناة محددة
    if (subCmd === "send_panel") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: t(guildId, "general.apply.no_perm"), flags: 64 });
      }

      const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
      const apps = database.getApplications(guildId).filter(a => a.status === 'open');

      if (!apps || apps.length === 0) {
        return interaction.reply({ content: t(guildId, "general.apply.no_open_forms"), flags: 64 });
      }

      const panelEmbed = new EmbedBuilder()
        .setColor("#9333ea")
        .setTitle(t(guildId, "general.apply.panel_title", { guild: interaction.guild.name }))
        .setDescription(t(guildId, "general.apply.panel_desc"))
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
        .setTimestamp();

      if (apps.length === 1) {
        const app = apps[0];
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`btn_apply_${app.id}`)
            .setLabel(t(guildId, "general.apply.single_button", { title: app.title.slice(0, 30) }))
            .setStyle(ButtonStyle.Primary)
        );
        await targetChannel.send({ embeds: [panelEmbed], components: [row] });
      } else {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId("select_apply_form")
          .setPlaceholder(t(guildId, "general.apply.select_placeholder_panel"))
          .addOptions(
            apps.map(a => ({
              label: a.title.slice(0, 50),
              description: (a.description || t(guildId, "general.apply.job_default")).slice(0, 80),
              value: String(a.id),
              emoji: "📝"
            }))
          );
        const row = new ActionRowBuilder().addComponents(selectMenu);
        await targetChannel.send({ embeds: [panelEmbed], components: [row] });
      }

      return interaction.reply({ content: t(guildId, "general.apply.panel_sent", { channel: `<#${targetChannel.id}>` }), flags: 64 });
    }

    // 2. التقديم المباشر للعضو (/apply form)
    let openApps = [];
    try {
      openApps = database.getApplications(guildId).filter(a => a.status === 'open');
    } catch(e) {}

    if (!openApps.length) {
      return interaction.reply({ content: t(guildId, "general.apply.no_jobs"), flags: 64 });
    }

    if (openApps.length === 1) {
      const app = openApps[0];
      return openModalForApp(interaction, app);
    }

    // عدة نماذج -> قائمة اختيار
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("select_apply_form")
      .setPlaceholder(t(guildId, "general.apply.select_placeholder_form"))
      .addOptions(
        openApps.map(a => ({
          label: a.title.slice(0, 50),
          description: (a.description || t(guildId, "general.apply.job_default")).slice(0, 80),
          value: String(a.id),
          emoji: "📝"
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);
    return interaction.reply({ content: t(guildId, "general.apply.choose_form"), components: [row], flags: 64 });
  }
};

function openModalForApp(interaction, app) {
  const guildId = interaction.guild?.id || 'EN';
  let questions = [];
  try {
    questions = typeof app.questions === 'string' ? JSON.parse(app.questions) : app.questions;
  } catch(e) {
    questions = [{ text: t(guildId, "general.apply.modal_fallback_q"), type: "paragraph" }];
  }

  const modal = new ModalBuilder()
    .setCustomId(`modal_submit_app_${app.id}`)
    .setTitle(`📝 ${app.title.slice(0, 40)}`);

  const fields = questions.slice(0, 5).map((q, i) => {
    const qText = typeof q === 'object' ? (q.text || t(guildId, "general.apply.modal_fallback_label", { n: i + 1 })) : String(q);
    const isShort = typeof q === 'object' && q.type === 'short';

    return new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(`q_${i}`)
        .setLabel(qText.slice(0, 45))
        .setStyle(isShort ? TextInputStyle.Short : TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
    );
  });

  modal.addComponents(...fields);
  return interaction.showModal(modal);
}
