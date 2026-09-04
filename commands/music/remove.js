import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('삭제')
        .setDescription('대기열에서 특정 번호의 노래를 삭제합니다.')
        .addIntegerOption(option => 
            option.setName('번호')
                .setDescription('삭제할 노래의 번호')
                .setRequired(true)
                .setMinValue(1) // 0번이나 음수는 입력 못하게 막음
        ),

    async execute(interaction) {
        // 유저가 음성 채널에 있는지 확인
        const userVoiceChannel = interaction.member.voice.channel;
        if (!userVoiceChannel) {
            return interaction.reply({ content: '음성 채널에 연결되어있지 않습니다.', ephemeral: true });
        }

        // 봇과 같은 방인지 확인 (남의 대기열 건드리기 방지)
        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        if (botVoiceChannel && botVoiceChannel.id !== userVoiceChannel.id) {
            return interaction.reply({ content: '봇과 같은 음성 채널에 있어야합니다.', ephemeral: true });
        }

        const queue = interaction.client.queue.get(interaction.guildId);

        if(!queue) {
            return interaction.reply({ content: '재생 중인 곡이 없습니다.', ephemeral: true });
        }

        // 유저가 입력한 번호 가져오기
        const index = interaction.options.getInteger('번호');

        // 입력한 번호가 실제 대기열 범위를 벗어났는지 확인
        // queue.songs[0]은 현재 재생 곡이므로, 실제 대기열은 1번부터 시작합니다.
        // 따라서 유저가 입력한 index가 배열 길이보다 작아야 유효합니다.
        if(index >= queue.songs.length) {
            return interaction.reply({ content: `${index}번 곡은 존재하지 않습니다. 대기열을 확인해주세요.`, ephemeral: true });
        }

        // 배열에서 해당 인덱스의 곡 1개를 제거 (splice)
        // removed 변수에는 삭제된 곡 정보가 담김
        const removed = queue.songs.splice(index, 1)[0];

        return interaction.reply({ content: `${removed.info.title} 곡을 대기열에서 삭제했습니다.`, ephemeral: true });
    }
};