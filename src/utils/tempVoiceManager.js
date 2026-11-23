const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder
} = require('discord.js');
const db = require('../database');

/**
 * Builds the interactive Temp Voice Control Panel components
 * @param {string} channelId 
 * @param {string} ownerId 
 */
function buildTempVoicePanel(channelId, ownerId) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🎙️ لوحة تحكم الروم الصوتي المؤقت')
    .setDescription(
      `مرحباً بك في رومك المؤقت <#${channelId}>!\n` +
      `أنت صاحب هذا الروم (<@${ownerId}>)، يمكنك التحكم بإعداداته عبر الأزرار أدناه:`
    )
    .addFields(
      { name: '🔒 قفل / فتح', value: 'منع أو السماح للجميع بالدخول', inline: true },
      { name: '👁️ إخفاء / إظهار', value: 'إخفاء الروم عن غير المتواجدين', inline: true },
      { name: '👥 تحديد العدد', value: 'تحديد الحد الأقصى للمستخدمين', inline: true },
      { name: '✏️ تغيير الاسم', value: 'تعديل اسم الروم الصوتي', inline: true },
      { name: '🚫 طرد عضو', value: 'طرد مستخدم من الروم الصوتي', inline: true },
      { name: '👑 نقل الملكية', value: 'نقل ملكية الروم لشخص آخر', inline: true }
    )
    .setFooter({ text: 'Droplet Voice System • التحكم متاح لصاحب الروم فقط' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tv_lock_${channelId}`)
      .setLabel('قفل / فتح')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`tv_hide_${channelId}`)
      .setLabel('إخفاء / إظهار')
      .setEmoji('👁️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`tv_limit_${channelId}`)
      .setLabel('تحديد العدد')
      .setEmoji('👥')
      .setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tv_rename_${channelId}`)
      .setLabel('تغيير الاسم')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`tv_kick_${channelId}`)
      .setLabel('طرد عضو')
      .setEmoji('🚫')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`tv_transfer_${channelId}`)
      .setLabel('نقل الملكية')
      .setEmoji('👑')
      .setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row1, row2] };
}

/**
 * Handles interactions for Temp Voice control buttons and modals
 * @param {import('discord.js').Interaction} interaction 
 */
async function handleTempVoiceInteraction(interaction) {
  const { customId, guild, member } = interaction;

  // Extract channelId from customId
  const parts = customId.split('_');
  const action = parts[1];
  const channelId = parts[2];

  const channel = guild.channels.cache.get(channelId);
  if (!channel) {
    return interaction.reply({ content: '❌ لم يتم العثور على هذا الروم الصوتي، ربما تم حذفه.', ephemeral: true });
  }

  // Verify ownership
  const tempVoiceRecord = db.getTempVoice ? db.getTempVoice(channelId) : null;
  const isOwner = (tempVoiceRecord && tempVoiceRecord.user_id === member.id) ||
                  member.permissions.has(PermissionFlagsBits.Administrator);

  if (!isOwner) {
    return interaction.reply({ 
      content: `❌ أنت لست صاحب هذا الروم الصوتي! المالك الحالي هو: <@${tempVoiceRecord?.user_id || 'مجهول'}>`, 
      ephemeral: true 
    });
  }

  // 1. Lock / Unlock
  if (action === 'lock') {
    const everyoneRole = guild.roles.everyone;
    const currentPerm = channel.permissionOverwrites.cache.get(everyoneRole.id);
    const isLocked = currentPerm && currentPerm.deny.has(PermissionFlagsBits.Connect);

    try {
      await channel.permissionOverwrites.edit(everyoneRole, {
        Connect: isLocked ? null : false
      });
      return interaction.reply({
        content: isLocked ? '🔓 تم فتح الروم الصوتي للجميع.' : '🔒 تم قفل الروم الصوتي ومنع الدخول.',
        ephemeral: true
      });
    } catch (err) {
      return interaction.reply({ content: `❌ فشل تعديل الأذونات: ${err.message}`, ephemeral: true });
    }
  }

  // 2. Hide / Unhide
  if (action === 'hide') {
    const everyoneRole = guild.roles.everyone;
    const currentPerm = channel.permissionOverwrites.cache.get(everyoneRole.id);
    const isHidden = currentPerm && currentPerm.deny.has(PermissionFlagsBits.ViewChannel);

    try {
      await channel.permissionOverwrites.edit(everyoneRole, {
        ViewChannel: isHidden ? null : false
      });
      return interaction.reply({
        content: isHidden ? '👁️ أصبح الروم مرئياً للجميع الآن.' : '🕶️ تم إخفاء الروم الصوتي عن الأعضاء الآخرين.',
        ephemeral: true
      });
    } catch (err) {
      return interaction.reply({ content: `❌ فشل تعديل الرؤية: ${err.message}`, ephemeral: true });
    }
  }

  // 3. User Limit (Show Modal)
  if (action === 'limit') {
    const modal = new ModalBuilder()
      .setCustomId(`tv_mdl_limit_${channelId}`)
      .setTitle('تحديد عدد أعضاء الروم');

    const input = new TextInputBuilder()
      .setCustomId('limit_input')
      .setLabel('الحد الأقصى (0 = بلا حدود، حتى 99)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('مثال: 5')
      .setMaxLength(2)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // 4. Rename Channel (Show Modal)
  if (action === 'rename') {
    const modal = new ModalBuilder()
      .setCustomId(`tv_mdl_rename_${channelId}`)
      .setTitle('تغيير اسم الروم الصوتي');

    const input = new TextInputBuilder()
      .setCustomId('rename_input')
      .setLabel('الاسم الجديد للروم')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(channel.name)
      .setMaxLength(100)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // 5. Kick Member (Select Menu)
  if (action === 'kick') {
    const select = new UserSelectMenuBuilder()
      .setCustomId(`tv_sel_kick_${channelId}`)
      .setPlaceholder('اختر العضو الذي ترغب بطرده من الروم')
      .setMinValues(1)
      .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(select);
    return interaction.reply({
      content: 'اختر العضو المراد طرده من الروم الصوتي:',
      components: [row],
      ephemeral: true
    });
  }

  // 6. Transfer Ownership (Select Menu)
  if (action === 'transfer') {
    const select = new UserSelectMenuBuilder()
      .setCustomId(`tv_sel_transfer_${channelId}`)
      .setPlaceholder('اختر المالك الجديد للروم الصوتي')
      .setMinValues(1)
      .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(select);
    return interaction.reply({
      content: 'اختر العضو الذي تريد نقل ملكية هذا الروم إليه:',
      components: [row],
      ephemeral: true
    });
  }
}

/**
 * Handles Modals and Select Menus for Temp Voice controls
 * @param {import('discord.js').Interaction} interaction 
 */
async function handleTempVoiceModalOrSelect(interaction) {
  const { customId, guild } = interaction;

  // Handle Modals
  if (interaction.isModalSubmit()) {
    if (customId.startsWith('tv_mdl_limit_')) {
      const channelId = customId.replace('tv_mdl_limit_', '');
      const channel = guild.channels.cache.get(channelId);
      if (!channel) return interaction.reply({ content: '❌ لم يتم العثور على الروم.', ephemeral: true });

      const rawLimit = interaction.fields.getTextInputValue('limit_input').trim();
      const limit = parseInt(rawLimit);
      if (isNaN(limit) || limit < 0 || limit > 99) {
        return interaction.reply({ content: '❌ الرجاء إدخال رقم صحيح بين 0 و 99.', ephemeral: true });
      }

      try {
        await channel.setUserLimit(limit);
        return interaction.reply({
          content: limit === 0 ? '✅ تم إلغاء الحد الأقصى للمستخدمين (مفتوح).' : `✅ تم ضبط الحد الأقصى إلى: **${limit}** عضو.`,
          ephemeral: true
        });
      } catch (err) {
        return interaction.reply({ content: `❌ فشل تحديث العدد: ${err.message}`, ephemeral: true });
      }
    }

    if (customId.startsWith('tv_mdl_rename_')) {
      const channelId = customId.replace('tv_mdl_rename_', '');
      const channel = guild.channels.cache.get(channelId);
      if (!channel) return interaction.reply({ content: '❌ لم يتم العثور على الروم.', ephemeral: true });

      const newName = interaction.fields.getTextInputValue('rename_input').trim();
      if (!newName) return interaction.reply({ content: '❌ لا يمكن أن يكون الاسم فارغاً.', ephemeral: true });

      try {
        await channel.setName(newName);
        return interaction.reply({ content: `✅ تم تغيير اسم الروم الصوتي إلى: **${newName}**`, ephemeral: true });
      } catch (err) {
        return interaction.reply({ content: `❌ فشل تغيير الاسم (قد يكون هناك قيود معدل من ديسكورد): ${err.message}`, ephemeral: true });
      }
    }
  }

  // Handle User Select Menus
  if (interaction.isUserSelectMenu()) {
    if (customId.startsWith('tv_sel_kick_')) {
      const channelId = customId.replace('tv_sel_kick_', '');
      const channel = guild.channels.cache.get(channelId);
      if (!channel) return interaction.reply({ content: '❌ لم يتم العثور على الروم.', ephemeral: true });

      const targetId = interaction.values[0];
      const targetMember = guild.members.cache.get(targetId);

      if (!targetMember || targetMember.voice.channelId !== channelId) {
        return interaction.reply({ content: '❌ هذا العضو غير متواجد حالياً داخل رومك الصوتي.', ephemeral: true });
      }

      try {
        await targetMember.voice.disconnect('طرده صاحب الروم المؤقت');
        return interaction.reply({ content: `✅ تم طرد <@${targetId}> من الروم الصوتي بنجاح.`, ephemeral: true });
      } catch (err) {
        return interaction.reply({ content: `❌ فشل طرد العضو: ${err.message}`, ephemeral: true });
      }
    }

    if (customId.startsWith('tv_sel_transfer_')) {
      const channelId = customId.replace('tv_sel_transfer_', '');
      const channel = guild.channels.cache.get(channelId);
      if (!channel) return interaction.reply({ content: '❌ لم يتم العثور على الروم.', ephemeral: true });

      const targetId = interaction.values[0];
      if (targetId === interaction.user.id) {
        return interaction.reply({ content: '❌ أنت المالك بالفعل!', ephemeral: true });
      }

      try {
        if (db.db) {
          db.db.prepare('UPDATE temp_voices SET user_id = ? WHERE channel_id = ?').run(targetId, channelId);
        }

        // Update permissions on channel
        await channel.permissionOverwrites.edit(targetId, {
          ManageChannels: true,
          MoveMembers: true,
          MuteMembers: true,
          DeafenMembers: true,
          Connect: true,
          Speak: true
        }).catch(() => {});

        return interaction.reply({ content: `👑 تم نقل ملكية الروم الصوتي إلى <@${targetId}> بنجاح!`, ephemeral: true });
      } catch (err) {
        return interaction.reply({ content: `❌ فشل نقل الملكية: ${err.message}`, ephemeral: true });
      }
    }
  }
}

module.exports = {
  buildTempVoicePanel,
  handleTempVoiceInteraction,
  handleTempVoiceModalOrSelect
};
