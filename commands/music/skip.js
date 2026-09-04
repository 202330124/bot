import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('스킵')
        .setDescription('현재 재생 중인 노래를 건너뜁니다.'),

    async execute(interaction) {
        // 유저가 음성 채널에 있는지 확인
        const userVoiceChannel = interaction.member.voice.channel;
        if(!userVoiceChannel) {
            return interaction.reply({ content: '음성 채널에 연결되어있지 않습니다.', ephemeral: true });
        }

        // 봇과 같은 방인지 확인 (남의 노래 스킵 방지)
        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        if(botVoiceChannel && botVoiceChannel.id !== userVoiceChannel.id) {
            return interaction.reply({ content: '봇과 같은 음성 채널에 있어야합니다.', ephemeral: true });
        }

        const queue = interaction.client.queue.get(interaction.guildId);

        // 재생 중인 곡이 없거나(!queue), 노래 객체는 있는데 실제 재생이 안 되는 경우(!player.track) 차단
        if(!queue || !queue.player.track) {
            return interaction.reply({ content: '재생 중인 곡이 없습니다.', ephemeral: true });
        }

        // 대기열에 다음 곡이 없을 때
        if(queue.songs.length <= 1) {
            return interaction.reply({ content: '대기열이 비어있어 건너뛸 수 없습니다.', ephemeral: true });
        }

        await interaction.deferReply();

        queue.player.stopTrack();

        await interaction.deleteReply();
    }
};