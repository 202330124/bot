import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('나가기')
        .setDescription('재생을 정지하고 봇을 내보냅니다.'),

    async execute(interaction, shoukaku) {
        // 유저가 음성 채널에 있는지 확인
        const userVoiceChannel = interaction.member.voice.channel;
        if(!userVoiceChannel) {
            return interaction.reply({ content: '먼저 음성 채널에 접속해주세요.', ephemeral: true });
        }

        // 봇이 음성 채널에 있는지, 있다면 같은 방인지 확인
        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        
        // 봇이 아예 방에 없으면
        if(!botVoiceChannel) {
            return interaction.reply({ content: '봇이 음성 채널에 없습니다.', ephemeral: true });
        }

        // 봇이 있는데 다른 방에 있다면?
        if(botVoiceChannel.id !== userVoiceChannel.id) {
            return interaction.reply({ content: '봇과 같은 음성 채널에 있어야합니다.', ephemeral: true });
        }

        // 퇴장 처리 (여기까지 왔으면 같은 방에 있다는 뜻)
        const queue = interaction.client.queue.get(interaction.guildId);

        // 타이머 정리
        if(queue && queue.timeout) clearTimeout(queue.timeout);

        // 연결 끊기 (플레이어 삭제 포함)
        shoukaku.leaveVoiceChannel(interaction.guildId);
        
        // 대기열 삭제
        if(queue) {
            interaction.client.queue.delete(interaction.guildId);
        }

        return interaction.reply({ content: '재생을 멈추고 연결을 끊었습니다.', ephemeral: true });
    }
};