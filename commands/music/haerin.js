import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('해린')
        .setDescription('해린 등장'),

    async execute(interaction, shoukaku) {
        // 1. 유저가 음성 채널에 있는지 확인
        const userVoiceChannel = interaction.member.voice.channel;
        if(!userVoiceChannel) {
            return interaction.reply({ content: '음성 채널에 연결되어있지 않습니다.', ephemeral: true });
        }

        const guildId = interaction.guildId;
        const botVoiceChannel = interaction.guild.members.me.voice.channel;

        // 봇이 이미 같은 채널에 있다면?
        if(botVoiceChannel && botVoiceChannel.id === userVoiceChannel.id) {
            return interaction.reply({ content: '이미 같은 채널에 속해있습니다.', ephemeral: true });
        }

        // ⏳ 이동 작업은 시간이 걸릴 수 있으니 우선 대기 (타임아웃 방지)
        await interaction.deferReply({ ephemeral: true });

        // 2. [이동] 봇을 유저 채널로 이동 (이동하면서 자동으로 새 연결 갱신됨)
        try {
            // 3. [초기화] 기존 대기열 및 재생 중인 노래 정리
            const oldQueue = interaction.client.queue.get(guildId);
            if(oldQueue) {
                // ⚠️ [수정] 중요! 기존에 돌고 있던 타이머가 있다면 반드시 끄고 삭제해야 합니다.
                // 이걸 안 하면 이동했지만, 예전 타이머로 인해 봇이 퇴장.
                if(oldQueue.timeout) clearTimeout(oldQueue.timeout);

                // 대기열 삭제
                interaction.client.queue.delete(guildId);
            }

            shoukaku.leaveVoiceChannel(guildId);

            // 1초 대기 (Wait)
            // 끊자마자 바로 연결하면 타임아웃 오류가 나므로, 잠깐 기다려줍니다.
            await new Promise(resolve => setTimeout(resolve, 1000));

            const player = await shoukaku.joinVoiceChannel({
                guildId: guildId,
                channelId: userVoiceChannel.id,
                shardId: interaction.guild.shardId,
                deaf: true
            });

            // 4. [대기 모드] 빈 대기열 생성
            const newQueue = {
                player: player,
                textChannel: interaction.channel,
                songs: [], 
                timeout: null,
                isForcedStop: false
            };

            // 이벤트 리스너 등록 (play.js와 동일하게)
            player.on('end', () => {
                const currentQueue = interaction.client.queue.get(interaction.guildId);
                if(!currentQueue) return;
                    
                currentQueue.songs.shift();

                if(currentQueue.isForcedStop) {
                    currentQueue.isForcedStop = false;
                    disconnectTimer(currentQueue, interaction, shoukaku);
                    return;
                }

                if(currentQueue.songs.length > 0) {
                    const nextTrack = currentQueue.songs[0];
                    player.playTrack({ track: { encoded: nextTrack.encoded } });

                    const embed = createEmbed(nextTrack, null);
                    currentQueue.textChannel.send({ embeds: [embed] }).catch(() => {});
                } else {
                    disconnectTimer(currentQueue, interaction, shoukaku);
                }
            });

            interaction.client.queue.set(guildId, newQueue);

            // 1분 타이머 시작
            disconnectTimer(newQueue, interaction, shoukaku);

            // 완료 메시지
            return interaction.editReply({ content: '해린 등장', ephemeral: true });

        } catch (error) {
            console.error(error);
            return interaction.editReply({ content: '해린 등장 실패', ephemeral: true });
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