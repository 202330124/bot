import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('재생')
        .setDescription('노래를 재생하거나 대기열에 추가합니다.')
        .addStringOption(option => {
            return option
                .setName('제목')
                .setDescription('제목 또는 URL을 입력해주세요.')
                .setRequired(false)
        }),

    async execute(interaction, shoukaku) {
        // 유저 음성 채널 확인
        const userVoiceChannel = interaction.member.voice.channel;

        if(!userVoiceChannel) {
            return interaction.reply({ content: '음성 채널에 연결되어있지 않습니다.', ephemeral: true });
        }

        // 봇과 같은 채널에 있는지 확인하는 코드
        const botVoiceChannelId = interaction.guild.members.me.voice.channelId;
        
        // "봇이 이미 보이스 채널에 속해있고, 내 방이랑 다르다면"
        if(botVoiceChannelId && userVoiceChannel.id !== botVoiceChannelId) {
            return interaction.reply({ content: '봇과 같은 음성 채널에 있어야합니다.', ephemeral: true });
        }

        const title = interaction.options.getString('제목');

        // 제목 입력 없이 /재생 했을 때 (멈춘 노래 다시 재생 로직)
        if(!title) {
            const queue = interaction.client.queue.get(interaction.guildId);
            const player = shoukaku.players.get(interaction.guildId);

            if(!queue || queue.songs.length === 0) {
                return interaction.reply({ content: '대기열에 재생할 노래가 없습니다.', ephemeral: true });
            }
            
            if(player && player.track) {
                return interaction.reply({ content: '이미 노래가 재생 중입니다.', ephemeral: true });
            }

            // 재생 시작
            await interaction.deferReply();
            
            // 강제 정지 풀고 1번 곡 재생
            queue.isForcedStop = false;

            if(queue.timeout) {
                clearTimeout(queue.timeout);
                queue.timeout = null;
            }
            
            await queue.player.playTrack({ track: { encoded: queue.songs[0].encoded } });

            const embed = createEmbed(queue.songs[0], null);

            return interaction.editReply({ embeds: [embed] });
        }

        // 우선 대기
        await interaction.deferReply();

        // 노드 및 트랙 검색
        const node = shoukaku.options.nodeResolver(shoukaku.nodes);
        const search = title.startsWith('http') ? title : `ytsearch:${title}`;

        let result;

        try {
            result = await node.rest.resolve(search);
        } catch(error) {
            return interaction.editReply({ content: '검색 중 오류가 발생했습니다.', ephemeral: true });
        }

        if(!node) {
            return interaction.editReply({ 
                content: '뮤직 서버와 연결되지 않았습니다.\n잠시 후 다시 시도하거나 관리자에게 문의하세요.', 
                ephemeral: true 
            });
        }

        if(!result) {
            return interaction.editReply({ content: '검색 결과가 없습니다.', ephemeral: true });
        }

        switch(result.loadType) {
            case 'empty':
            case 'NO_MATCH': 
                return interaction.editReply({ content: '검색 결과가 없습니다.', ephemeral: true });

            case 'error':
            case 'LOAD_FAILED':
                console.error(`Lavalink Load Error: ${result.exception?.message}`);

                return interaction.editReply({ 
                    content: `🚫 오류가 발생했습니다.\n내용: ${result.exception?.message || '알 수 없는 오류'}`,
                    ephemeral: true 
                });
        }

        let track;

        if(result.loadType === 'search') {
            track = result.data[0];
        } else {
            track = result.data;
            if(Array.isArray(track)) track = track[0];
        }

        // 노래 데이터에 신청자(유저) 정보를 붙여둡니다. 
        // (이렇게 해야 나중에 대기열에서 재생될 때도 누가 신청했는지 알 수 있음)
        track.requester = interaction.user;

        // 플레이어 준비
        let player = shoukaku.players.get(interaction.guildId);

        if(!player) {
            player = await shoukaku.joinVoiceChannel({
                guildId: interaction.guildId,
                channelId: userVoiceChannel.id,
                shardId: interaction.guild.shardId,
                deaf: true
            });
        }

        // 큐 관리
        let queue = interaction.client.queue.get(interaction.guildId);

        // 이미 노래가 재생 중이라면 대기열에 추가
        if(!queue) {
            queue = {
                player: player,
                textChannel: interaction.channel,
                songs: [],
                timeout: null,
                isForcedStop: false // 🚩 강제 정지 확인용 변수 초기화
            };

            interaction.client.queue.set(interaction.guildId, queue);

            // 이벤트 리스너 등록
            player.on('end', () => {
                const currentQueue = interaction.client.queue.get(interaction.guildId);
                if(!currentQueue) return;
                
                // 방금 끝난(또는 멈춘) 곡 제거
                currentQueue.songs.shift();

                // 만약 /정지 명령어로 멈춘 거라면
                if(currentQueue.isForcedStop) {
                    // 깃발을 다시 내리고
                    currentQueue.isForcedStop = false;

                    // 다음 곡을 재생하지 않고 바로 대기 모드로 들어갑니다.
                    disconnectTimer(currentQueue, interaction, shoukaku);

                    return;
                }

                // 일반적인 경우: 다음 곡이 있으면 재생
                if(currentQueue.songs.length > 0) {
                    const nextTrack = currentQueue.songs[0];
                    player.playTrack({ track: { encoded: nextTrack.encoded } });

                    // 다음 곡 재생 시: 순번 없이(null) 호출 -> "현재 재생 중" Embed
                    const embed = createEmbed(nextTrack, null);
                    currentQueue.textChannel.send({ embeds: [embed] }).catch(() => {});
                } else {
                    // 대기열이 비었으면 타이머 시작
                    disconnectTimer(currentQueue, interaction, shoukaku);
                }
            });
        }

        // 노래 추가 및 재생 판단
        queue.songs.push(track);

        let rest = false;

        // 타이머 취소 (노래가 들어왔으니까)
        if(queue.timeout) {
            clearTimeout(queue.timeout);
            queue.timeout = null;
            rest = true; // 타이머가 돌고 있었다면 "쉬고 있었다"고 체크
        }

        // 플레이어가 멈춰있으면(정지 상태거나 처음일 때) -> 바로 재생
        if(!player.track || rest) {
            // 정지 상태였을 수도 있으니 강제 정지 깃발 해제
            queue.isForcedStop = false; 
            
            // 현재 대기열의 첫 번째 곡 재생 (방금 넣은 곡일 수도 있고, 아까 남은 곡일 수도 있음)
            await player.playTrack({ track: { encoded: queue.songs[0].encoded } });

            // "지금 재생 시작한 곡"과 "내가 신청한 곡"이 같은지 확인
            if(queue.songs[0].encoded === track.encoded) {
                // 같으면 -> 재생 시작 메시지
                const embed = createEmbed(track, null);
                return interaction.editReply({ embeds: [embed] });
            } else {
                // 다르면(밀린 노래가 먼저 나옴) -> 대기열 추가 메시지
                const position = queue.songs.length - 1;
                const embed = createEmbed(track, position);
                return interaction.editReply({ embeds: [embed] });
            }
        } else {
            // 대기열 추가
            const position  = queue.songs.length - 1;

            // 순번 있음(position) -> "대기열 추가"
            const embed = createEmbed(track, position);
            return interaction.editReply({ embeds: [embed] });
        }
    }
};

function createEmbed(track, position) {
    // 신청자가 없으면 봇 이름으로 대체 (오류 방지)
    const requester = track.requester || { username: '알 수 없음', displayAvatarURL: () => '' };

    const embed = new EmbedBuilder();

    if(position !== null) {
        // 대기열 추가 embed
        embed.setColor('#8e8e8e')
        // 본문(Description)에 한 줄로 요약
        // 형식: 🎧 Add Queue - 노래 제목 | #1
        embed.setTitle('🎧 Add Queue')
        embed.setDescription(`**${track.info.title}** | \`대기열 #${position}\``);
    } else {
        // 현재 재생 중
        embed.setColor('#1db954') // 💚
        embed.setTitle('💿 Now Playing')
        embed.setThumbnail(`https://img.youtube.com/vi/${track.info.identifier}/mqdefault.jpg`)
        embed.setDescription(`**${track.info.title}**`)
        embed.addFields(
            // inline: true 옵션으로 두 항목을 가로로 나란히 배치
            { name: '곡 길이', value: formatTime(track.info.length), inline: true },
            { name: '음원', value: `[링크](${track.info.uri})`, inline: true }
        );
        embed.setFooter({
            iconURL: requester.displayAvatarURL(), // 신청자 프로필 사진
            text: `${requester.username}`, // 신청자 닉네임
        });
    }

    return embed;
}

// 시간 포맷 함수
function formatTime(ms) {
    if(!ms) return 'Live';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// [타이머 함수]
function disconnectTimer(queue, interaction, shoukaku) {
    // 이미 타이머가 있으면 무시
    if(queue.timeout) return;
    
    queue.timeout = setTimeout(() => {
        const checkQueue = interaction.client.queue.get(interaction.guildId);
        
        // 두 가지 조건 중 하나라도 맞으면 퇴장합니다.
        // 1. 대기열이 텅 비었을 때 (songs.length === 0) 👉 노래 다 듣고 끝난 경우 해결
        // 2. OR 플레이어가 재생 중인 곡이 없을 때 (!player.track) 👉 /정지 명령어로 멈춘 경우 해결
        if(checkQueue && (checkQueue.songs.length === 0 || !checkQueue.player.track)) {
            shoukaku.leaveVoiceChannel(interaction.guildId);
            interaction.client.queue.delete(interaction.guildId);
            checkQueue.textChannel.send('동작이 없어 연결을 종료합니다.').catch(() => {});
        } 
        else if(checkQueue) {
            checkQueue.timeout = null;
        }
    }, 1 * 60 * 1000); // 1분
}