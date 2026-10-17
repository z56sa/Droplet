const fs = require('fs');
const path = require('path');
const { REST, Routes, Collection } = require('discord.js');
const logger = require('../utils/logger');

module.exports = async (client) => {
  client.commands = new Collection();
  client.prefixCommands = new Collection();
  client.aliases = new Collection();

  const slashCommandsArray = [];
  const commandsPath = path.join(__dirname, '../commands');
  const categories = fs.readdirSync(commandsPath);

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    if (!fs.statSync(categoryPath).isDirectory()) continue;

    const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      const filePath = path.join(categoryPath, file);
      // ✅ حماية: ملف كمانجر واحد خراب ما يسقط تحميل باقي الأوامر
      let command;
      try {
        command = require(filePath);
      } catch (e) {
        console.error(`[CommandHandler] فشل تحميل الأمر: ${category}/${file} — ${e.message}`);
        continue;
      }

      if (command.data && command.data.name) {
        command.category = category;
        client.commands.set(command.data.name, command);
        slashCommandsArray.push(command.data.toJSON());
      }

      // دعم الأوامر النصية البرفكس (Prefix)
      if (command.name) {
        command.category = category;
        client.prefixCommands.set(command.name.toLowerCase(), command);
        if (command.aliases && Array.isArray(command.aliases)) {
          for (const alias of command.aliases) {
            client.aliases.set(alias.toLowerCase(), command.name.toLowerCase());
          }
        }
      }
    }
  }

  logger.info(`تم تحميل ${client.commands.size} أمر سلاش و ${client.prefixCommands.size} أمر نصي.`);

  client.slashCommandsData = slashCommandsArray;

  // تسجيل أوامر السلاش في الديسكورد
  const botToken = (process.env.DASHBOARD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.TOKEN || '').trim();
  
  client.registerSlashCommands = async () => {
    if (!client.user?.id) return;
    const tokenToUse = botToken || client.token;
    if (!tokenToUse || tokenToUse === 'YOUR_BOT_TOKEN_HERE') return;

    const rest = new REST({ version: '10' }).setToken(tokenToUse);
    try {
      logger.info(`جاري تسجيل ${slashCommandsArray.length} أمر سلاش للبوت (${client.user.id})...`);

      // 1. ✅ تنظيف الأوامر المسجلة قديماً لكل سيرفر ( كانت سبب ظهور الأوامر مكررة في ديسكورد: guild + global بنفس الاسم )
      if (client.guilds?.cache?.size > 0) {
        for (const [guildId, guild] of client.guilds.cache) {
          try {
            await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: [] });
          } catch (e) {
            logger.warn(`[GUILD SLASH] تعذر تفريغ الأوامر القديمة لسيرفر ${guildId}: ${e.message}`);
          }
        }
        logger.info(`[GUILD SLASH] 🧹 تم تفريغ أوامر السيرفرات القديمة (${client.guilds.cache.size} سيرفر) لمنع التكرار.`);
      }

      // 2. ✅ التسجيل العالمي الرسمي الموحد (Global) — المصدر الوحيد للأوامر، بلا تكرار
      const registered = await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: slashCommandsArray }
      );
      client.slashCommandIds = new Map();
      if (Array.isArray(registered)) {
        for (const cmd of registered) {
          client.slashCommandIds.set(cmd.name, cmd.id);
        }
      }
      logger.info(`[SUCCESS] ✅ تم تسجيل ${registered?.length || slashCommandsArray.length} أمر سلاش عام بنجاح (بدون تكرار).`);
    } catch (err) {
      logger.error(`حدث خطأ أثناء تسجيل أوامر السلاش: ${err.message}`);
    }
  };

  if (client.isReady() && client.user?.id) {
    if (!client._slashRegistered) { client._slashRegistered = true; client.registerSlashCommands(); }
  } else {
    client.once('clientReady', () => {
      if (!client._slashRegistered) { client._slashRegistered = true; client.registerSlashCommands(); }
    });
  }
};
