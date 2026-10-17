const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const token = process.env.DASHBOARD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.TOKEN;
let clientId = process.env.CLIENT_ID;

if (!token) {
    console.error('❌ خطأ: لم يتم العثور على التوكن');
    process.exit(0);
}

if (!clientId) {
    try {
        clientId = Buffer.from(token.split('.')[0], 'base64').toString('ascii');
    } catch(e) {}
}

const commands = [];
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    if (fs.lstatSync(commandsPath).isDirectory()) {
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            // ✅ حماية: ملف واحد خراب ما يكسر رفع كل الأوامر
            let command;
            try {
                command = require(filePath);
            } catch (e) {
                console.error(`⚠️ تعذر تحميل ${folder}/${file}: ${e.message}`);
                continue;
            }
            if ('data' in command && 'execute' in command) {
                commands.push(command.data.toJSON());
            }
        }
    } else if (commandsPath.endsWith('.js')) {
        let command;
        try {
            command = require(commandsPath);
        } catch (e) {
            console.error(`⚠️ تعذر تحميل ${commandFolders}/${path.basename(commandsPath)}: ${e.message}`);
            return;
        }
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        }
    }
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        const data = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error('❌ حدث خطأ أثناء رفع الأوامر:', error);
    }
})();