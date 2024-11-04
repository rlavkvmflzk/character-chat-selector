import { ChatSelector } from './chatSelector.js';

Hooks.once('init', () => {
    console.log('Character Chat Selector | Initializing');
    ChatSelector.initialize();
});

// 채팅 메시지 생성 전에 추가 처리
Hooks.on('preCreateChatMessage', (message, data) => {
    console.log("Chat message being created with data:", data);
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
            console.log("Modified chat message data:", data);
        }
    }
    return true;
});