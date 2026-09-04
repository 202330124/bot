import { EmbedBuilder } from 'discord.js';

// 1. 시간 포맷 함수
export function formatTime(ms) {
    if(!ms) return 'Live';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// 2. Embed(알림창) 생성 함수
// 사용법: createEmbed('playing', track), createEmbed('add', track, position), createEmbed('queue', songs)
export function createEmbed(type, data, extra = null) {
    const embed = new EmbedBuilder();

    // 1️⃣ 현재 재생 중인 곡 알림 ('playing')
    if(type === 'playing') {
        const track = data;
        const requester = track.requester || { username: '알 수 없음', displayAvatarURL: () => '' };
        
        embed.setColor('#1db954')
            .setTitle('💿 Now Playing')
            .setThumbnail(`https://img.youtube.com/vi/${track.info.identifier}/mqdefault.jpg`)
            .setDescription(`**${track.info.title}**`)
            .addFields(
                { name: '곡 길이', value: formatTime(track.info.length), inline: true },
                { name: '음원', value: `[링크](${track.info.uri})`, inline: true }
            )
            .setFooter({ iconURL: requester.displayAvatarURL(), text: `${requester.username}` });
    } 
    
    // 2️⃣ 대기열 추가 알림 ('add')
    else if(type === 'add') {
        const track = data;
        const position = extra;
        
        embed.setColor('#8e8e8e')
            .setTitle('🎧 Add Queue')
            .setDescription(`**${track.info.title}** | \`대기열 #${position}\``);
    } 
    
    // 3️⃣ 대기열 전체 목록 확인 ('queue')
    else if(type === 'queue') {
        const songs = data; // 이 경우 data는 노래 배열 전체입니다.
        const currentTrack = songs[0];
        const tracks = songs.slice(1);

        embed.setColor('#b339ff')
            .setTitle('📑 Queue')
            .setDescription(
                `**💿 Now Playing: ** \n` +
                `[${currentTrack.info.title}](${currentTrack.info.uri}) - \`${formatTime(currentTrack.info.length)}\``
            );

        if(tracks.length > 0) {
            const limit = 10;
            const displayTracks = tracks.slice(0, limit);
            const listString = displayTracks.map((track, i) => {
                return `**${i + 1}.** [${track.info.title}](${track.info.uri}) - \`${formatTime(track.info.length)}\``;
            }).join('\n');

            embed.addFields({
                name: '⏱️ Waiting: ',
                value: listString + (tracks.length > limit ? `\n\n...외 **${tracks.length - limit}**곡` : '')
            });
        } else {
            embed.addFields({ name: '⏱️ Waiting: ', value: '대기 중인 곡이 없습니다.' });
        }
    }

    return embed;
}

// 3. [전역 타이머 시작] (대기열 독립형)
export function startTimer(client, guildId, shoukaku, textChannel) {
    resetTimer(client, guildId); // 중복 방지를 위해 기존 타이머 확실히 끄기

    const timeout = setTimeout(() => {
        const checkQueue = client.queue.get(guildId);
        const player = shoukaku.players.get(guildId);
        
        // 봇이 재생 중이 아니거나, 대기열이 비었을 때 퇴장
        if(!player || !player.track || (checkQueue && checkQueue.songs.length === 0)) {
            shoukaku.leaveVoiceChannel(guildId);
            client.queue.delete(guildId);
            client.timers.delete(guildId);
            if(checkQueue && checkQueue.textChannel) {
                checkQueue.textChannel.send('동작이 없어 연결을 종료합니다.').catch(() => {});
            } else if(textChannel) {
                textChannel.send('동작이 없어 연결을 종료합니다.').catch(() => {});
            }
        }
    }, 1 * 60 * 1000); // 1분

    client.timers.set(guildId, timeout); // index.js에 만든 Map에 저장
}

// 4. [전역 타이머 해제]
export function resetTimer(client, guildId) {
    const timeout = client.timers.get(guildId);
    if(timeout) {
        clearTimeout(timeout);
        client.timers.delete(guildId);
    }
}

// 5. [전역 이벤트 엔진 장착] 🔥 (가장 핵심)
export function setupPlayer(player, client, shoukaku, guildId) {
    // ⚠️ 이미 엔진이 달려있다면 중복해서 달지 않음! (안전장치)
    if (player.listenerCount('end') > 0) return;

    // ▶️ 노래를 부르기 시작할 때: "일을 시작했으니 타이머를 즉시 끈다!"
    player.on('start', () => {
        resetTimer(client, guildId);
    });

    // 🛑 노래가 끝났을 때: 기존에 play.js / haerin.js에 있던 로직 그대로 실행
    player.on('end', () => {
        const currentQueue = client.queue.get(guildId);
        if(!currentQueue) {
            startTimer(client, guildId, shoukaku);
            return;
        }
            
        currentQueue.songs.shift();

        // stop.js에서 강제 정지 깃발을 세웠다면?
        if(currentQueue.isForcedStop) {
            currentQueue.isForcedStop = false;
            startTimer(client, guildId, shoukaku, currentQueue.textChannel);
            return;
        }

        if(currentQueue.songs.length > 0) {
            const nextTrack = currentQueue.songs[0];
            player.playTrack({ track: { encoded: nextTrack.encoded } });
            const embed = createEmbed('playing', nextTrack);
            currentQueue.textChannel.send({ embeds: [embed] }).catch(() => {});
        } else {
            startTimer(client, guildId, shoukaku, currentQueue.textChannel);
        }
    });
}