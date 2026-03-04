import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import { Shoukaku, Connectors } from 'shoukaku';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
    ]
});

// 명령어 저장 공간
client.commands = new Collection();

// 대기열 저장 공간
client.queue = new Map();

// URL 객체 대신 process.cwd()와 path.join 사용
const foldersPath = path.join(process.cwd(), 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for(const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    for(const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = await import(pathToFileURL(filePath).href);
        
        if('data' in command.default && 'execute' in command.default) {
            client.commands.set(command.default.data.name, command.default);
        }
    }
}

const Nodes = [{
    name: 'LocalNode',
    url: 'localhost:2333',
    auth: '0000'
}];

const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), Nodes);

shoukaku.on('error', (_, error) => console.error('Lavalink Error:', error));
shoukaku.on('ready', (name) => console.log(`✅ Lavalink Connected: ${name}`));

client.on(Events.InteractionCreate, async interaction => {
    if(!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if(!command) return;

    // 타임아웃 설정
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));

    try {
        await Promise.race([ command.execute(interaction, shoukaku), timeout ]);
    } catch(error) {
        console.error(error);

        let message;

        if(error.message === 'timeout') {
            message = '응답 시간이 초과되었습니다.';
        } else {
            message = '오류가 발생하였습니다.';
        }

        const guildId = interaction.guildId;
        const bot = interaction.guild.members.me;

        // 1) 봇이 음성 채널에 들어가 있고
        if(bot && bot.voice.channelId) {
            const currentQueue = client.queue.get(guildId);

            // 2) 대기열이 아예 없거나, 비어있다면 (즉, 노래 재생에 실패한 상황이라면)
            if(!currentQueue || currentQueue.tracks.length === 0) {
                // 채널에서 내보내고 대기열 정리
                shoukaku.leaveVoiceChannel(guildId);
                client.queue.delete(guildId);
            }
        }

        // 답변 방식 결정 및 전송
        // 이미 답변을 했거나(replied), 답변 대기 상태(deferred)라면 followUp을 써야 함
        if(interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
            
        } else {
            // 아직 아무 답변도 안 했다면 reply를 써야 함
            await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
        }
    }
});

client.once(Events.ClientReady, client => {
    console.log(`🤖 로그인 완료: ${client.user.tag}`);
});

client.on(Events.VoiceStateUpdate, async(oldState, newState) => {
    // 기초 정보 확인
    const guild = oldState.guild;
    const queue = client.queue.get(guild.id);

    // 봇(나 자신)이 실제로 음성 채널에 있는지 확인
    // Lavalink(Shoukaku)가 아니라 디스코드 멤버 정보에서 직접 가져옴
    const bot = guild.members.me;

    // 봇이 음성 채널에 아예 없다면 대기열만 남은 상태이므로 정리하고 나옴
    if(!bot.voice.channelId) {
        shoukaku.leaveVoiceChannel(guild.id);

        client.queue.delete(guild.id);

        return;
    }

    // 대기열이 없으면 봇이 노래를 안 틀고 있다는 뜻이므로 VoiceStateUpdate 이벤트 바로 종료
    if(!queue) return;

    // 봇이 있는 채널 ID 확인
    const botChannelId = bot.voice.channelId;

    // (누군가 나갔거나 들어왔을 때)
    if(oldState.channelId === botChannelId || newState.channelId === botChannelId) {
        // 1초 대기 (서버 동기화)
        setTimeout(async () => {
            try {
                // 채널 정보 강제 갱신 (force: true)
                const channel = await client.channels.fetch(botChannelId, { force: true });
                
                if(!channel) return;

                // 봇 제외 사람 수 세기
                const members = channel.members.filter(member => !member.user.bot);

                console.log(`👀 인원 확인: ${members.size}명 남음`);

                if(members.size === 0) {
                    console.log('👋 보이스 채널에 사용자가 없어 연결을 종료합니다.');
                    
                    if(queue.textChannel) {
                        queue.textChannel.send('보이스 채널에 사용자가 없어 연결을 종료합니다.');
                    }

                    if(queue.timeout) clearTimeout(queue.timeout);

                    // Lavalink 연결 끊기 요청
                    shoukaku.leaveVoiceChannel(guild.id);
                    
                    // 대기열 삭제
                    client.queue.delete(guild.id);
                }
            } catch(error) {
                console.error('🚨 자동 퇴장 오류:', error);
            }
        }, 1000); 
    }
});

client.login(process.env.HAERIN_BOT_TOKEN);