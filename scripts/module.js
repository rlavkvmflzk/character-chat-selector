import { ChatSelector } from './chatSelector.js';

const DEBUG = false;

// 로그용 유틸리티 함수 추가
const log = (...args) => {
    if (DEBUG) log(...args);
};

Hooks.once('init', () => {
    log('Character Chat Selector | Initializing');
    ChatSelector.initialize();
});

// 채팅 메시지 생성 전에 추가 처리
Hooks.on('preCreateChatMessage', (message, data) => {
    log("Chat message being created with data:", data);
    const select = document.querySelector('.character-select');
    if (select && select.value) {
        const actor = game.actors.get(select.value);
        if (actor) {
            data.speaker = {
                actor: actor.id,
                alias: actor.name,
                scene: game.scenes.current?.id,
                token: null
            };
            log("Modified chat message data:", data);
        }
    }
    return true;
});
