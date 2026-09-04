import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { createEmbed } from '../../utils/musicUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('대기열')
        .setDescription('현재 대기열 목록을 확인합니다.'),

    async execute(interaction) {
        const queue = interaction.client.queue.get(interaction.guildId);

        // 대기열이 비어 있을 때
        if(!queue || queue.songs.length === 0) {
            return interaction.reply({ content: '대기열이 비어있습니다. 곡을 추가해주세요.', ephemeral: true });
        }

        // 현재 재생 중인 곡 (배열의 0번)
        const currentTrack = queue.songs[0];

        // 대기 중인 곡들 (배열의 1번부터 끝까지)
        const tracks = queue.songs.slice(1);

        // 기존: const embed = createQueueEmbed(queue.songs);
        const embed = createEmbed('queue', queue.songs);

        return interaction.reply({ embeds: [embed] });
    }
};

// 밀리초(ms)를 '분:초' 형태로 바꿔주는 도우미 함수
function formatTime(ms) {
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
    return `${min}:${sec}`;
}