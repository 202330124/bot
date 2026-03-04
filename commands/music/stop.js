import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('정지')
        .setDescription('현재 재생 중인 노래를 멈추고 대기 상태로 전환합니다. (대기열 유지)'),

    async execute(interaction) {
        // 유저가 음성 채널에 있는지 확인
        const userVoiceChannel = interaction.member.voice.channel;
        if(!userVoiceChannel) {
            return interaction.reply({ content: '음성 채널에 연결되어있지 않습니다.', ephemeral: true });
        }

        // 봇과 같은 방인지 확인 (남의 노래 끄기 방지)
        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        if(botVoiceChannel && botVoiceChannel.id !== userVoiceChannel.id) {
            return interaction.reply({ content: '봇과 같은 음성 채널에 있어야합니다.', ephemeral: true });
        }

        const queue = interaction.client.queue.get(interaction.guildId);

        // 대기열이 없거나(queue가 null), 대기열은 있는데 노래가 안 나오는 경우(!player.track) 둘 다 차단
        if(!queue || !queue.player.track) {
            return interaction.reply({ content: '재생 중인 곡이 없습니다.', ephemeral: true });
        }

        // 🚨 핵심: "이건 강제로 멈춘 거야"라고 깃발을 꽂습니다.
        queue.isForcedStop = true;

        // 노래를 멈춥니다. -> play.js의 'end' 이벤트가 발생합니다.
        await queue.player.stopTrack();
        
        return interaction.reply({ content: '현재 재생 중인 곡을 정지합니다. `/재생` 명령어로 대기열을 이어서 들을 수 있습니다.', ephemeral: true });
    }
};