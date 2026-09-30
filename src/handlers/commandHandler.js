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
      const command = require(filePath);

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
      
      // 1. تسجيل الأوامر فورياً لكل السيرفرات المتصل بها البوت (تظهر في ثانية واحدة بدون انتظار)
      if (client.guilds?.cache?.size > 0) {
        for (const [guildId, guild] of client.guilds.cache) {
          try {
            await rest.put(
              Routes.applicationGuildCommands(client.user.id, guildId),
              { body: slashCommandsArray }
            );
            console.log(`[Slash Commands] Registered ${slashCommandsArray.length} commands to guild: ${guild.name} (${guildId}) ⚡`);
          } catch(e) {
            console.error(`[Slash Commands] Failed to register to guild ${guildId}:`, e.message);
          }
        }
      }

      // 2. تسجيل الأوامر العامة الرسمية الموحدة (Global Commands)
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
      logger.info(`[SUCCESS] ✅ تم تسجيل ${registered?.length || slashCommandsArray.length} أمر سلاش عام بنجاح.`);
    } catch (err) {
      logger.error(`حدث خطأ أثناء تسجيل أوامر السلاش: ${err.message}`);
    }
  };

  if (client.isReady() && client.user?.id) {
    client.registerSlashCommands();
  } else {
    client.once('clientReady', () => {
      client.registerSlashCommands();
    });
    client.once('ready', () => {
      client.registerSlashCommands();
    });
  }
};
