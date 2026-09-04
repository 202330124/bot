import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { resetTimer, setupPlayer, createEmbed } from '../../utils/musicUtils.js';

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

            // 전역 타이머 끄기
            resetTimer(interaction.client, interaction.guildId);
            
            await queue.player.playTrack({ track: { encoded: queue.songs[0].encoded } });

            const embed = createEmbed('playing', queue.songs[0]);

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

        // 전역 플레이어 엔진
        setupPlayer(player, interaction.client, shoukaku, interaction.guildId);

        // 큐 관리
        let queue = interaction.client.queue.get(interaction.guildId);

        // 이미 노래가 재생 중이라면 대기열에 추가
        if(!queue) {
            queue = {
                player: player,
                textChannel: interaction.channel,
                songs: [],
                isForcedStop: false // 🚩 강제 정지 확인용 변수 초기화
            };

            interaction.client.queue.set(interaction.guildId, queue);
        }

        // 노래 추가 및 재생 판단
        queue.songs.push(track);

        let rest = false;

        // 전역 타이머가 돌고 있었다면 취소
        if(interaction.client.timers.has(interaction.guildId)) {
            resetTimer(interaction.client, interaction.guildId);
            rest = true; 
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
                const embed = createEmbed('playing', track);
                return interaction.editReply({ embeds: [embed] });
            } else {
                // 다르면(밀린 노래가 먼저 나옴) -> 대기열 추가 메시지
                const position = queue.songs.length - 1;
                const embed = createEmbed('add', track, position);
                return interaction.editReply({ embeds: [embed] });
            }
        } else {
            // 대기열 추가
            const position  = queue.songs.length - 1;

            // 순번 있음(position) -> "대기열 추가"
            const embed = createEmbed('add', track, position);
            return interaction.editReply({ embeds: [embed] });
        }
    }
};