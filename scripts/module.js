import { ChatSelector } from './chatSelector.js';
import { HotkeyManager } from './hotkeyManager.js';

Hooks.once('init', () => {
    console.log('Character Chat Selector: Initializing...');
    ChatSelector.initialize();
    HotkeyManager.initialize();
    MarkdownHandler.initialize(); // <-- 추가    
});

// 채팅 메시지 생성 전에 추가 처리
Hooks.on('preCreateChatMessage', (message, data) => {
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
        }
    }
    return true;
});

document.addEventListener('characterHotkeySwitch', (event) => {
    console.log('Character Chat Selector: Received hotkey switch event:', event.detail);
    const select = document.querySelector('.character-select');
    if (select) {
        select.value = event.detail.actorId;
        ChatSelector._onCharacterSelect({ target: { value: event.detail.actorId } });
    }
});