FROM node:20-slim

# Java 및 FFmpeg 설치
RUN apt-get update && \
    apt-get install -y openjdk-17-jre ffmpeg python3 build-essential && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# 의존성 설치
COPY package*.json ./
RUN npm install

# 프로젝트 전체 복사 (lavalink 폴더 포함)
COPY . .

# 스크립트 실행 권한 부여 및 실행
RUN chmod +x start.sh
CMD ["./start.sh"]