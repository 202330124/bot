import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { resetTimer, setupPlayer, startTimer } from '../../utils/musicUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('해린')
        .setDescription('해린 등장'),

    async execute(interaction, shoukaku) {
        // 🚨 핵심: 명령어를 친 사람이 내가 아니라면 가차없이 튕겨냅니다.
        if (interaction.user.id !== process.env.ADMIN_USER_ID) {
            return interaction.reply({ 
                content: '🚫 이 명령어는 개발자만 사용할 수 있습니다.', 
                ephemeral: true 
            });
        }

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
                resetTimer(interaction.client, guildId);

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

            // 전역 플레이어
            setupPlayer(player, interaction.client, shoukaku, guildId);

            // 4. [대기 모드] 빈 대기열 생성
            const newQueue = {
                player: player,
                textChannel: interaction.channel,
                songs: [], 
                isForcedStop: false
            };

            interaction.client.queue.set(guildId, newQueue);

            // 전역 타이머 시작
            startTimer(interaction.client, guildId, shoukaku, interaction.channel);

            // 완료 메시지
            return interaction.editReply({ content: '해린 등장', ephemeral: true });

        } catch (error) {
            console.error(error);
            return interaction.editReply({ content: '해린 등장 실패', ephemeral: true });
        }
    }
};