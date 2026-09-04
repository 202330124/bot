import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url'; // ✅ 이 모듈을 추가해야 합니다.

dotenv.config();

const commands = [];
// process.cwd()로 루트 경로 잡기 (기존 유지)
const foldersPath = path.join(process.cwd(), 'commands');
const commandFolders = fs.readdirSync(foldersPath);

(async () => {
    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            
            // ✅ 수정된 부분: filePath를 바로 import하지 않고 URL로 변환 후 import 합니다.
            // Windows 경로(C:\...)를 file://URL 형식으로 바꿔줍니다.
            const command = await import(pathToFileURL(filePath).href);

            if ('data' in command.default && 'execute' in command.default) {
                commands.push(command.default.data.toJSON());
            } else {
                console.log(`[경고] ${filePath} 파일에 'data' 또는 'execute' 속성이 없습니다.`);
            }
        }
    }

    const rest = new REST().setToken(process.env.HAERIN_BOT_TOKEN);

    try {
        console.log(`${commands.length}개의 명령어를 등록(새로고침)합니다.`);

        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID), 
            { body: commands },
        );

        console.log(`✅ 성공적으로 ${data.length}개의 명령어를 등록했습니다.`);
    } catch (error) {
        console.error(error);
    }
})();