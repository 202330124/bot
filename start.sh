#!/bin/bash

# 1. lavalink 폴더로 이동하여 실행 (application.yml 인식 목적)
# 512MB 메모리 제한을 고려하여 자바 메모리 할당량을 256MB로 제한하는 옵션을 추가했습니다.
cd lavalink
java -Xmx256M -jar Lavalink.jar &

# 2. 다시 루트 폴더로 복귀
cd ..

# 3. Lavalink이 완전히 켜질 때까지 대기 (구조가 복잡할수록 넉넉히 13초 권장)
sleep 13

# 4. 노드 봇 실행
node index.js