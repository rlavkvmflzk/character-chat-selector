import { ChatSelector } from './chatSelector.js';
import { HotkeyManager } from './hotkeyManager.js';
import { ChatEditor } from './chatEditor.js'; 
import { ChatAutocomplete } from './chatAutocomplete.js';
import { ChatOptimizer } from './chatOptimizer.js'; // [추가됨]


Hooks.once('init', () => {
    console.log('Character Chat Selector: Initializing...');
    ChatSelector.initialize();
    HotkeyManager.initialize();
    ChatEditor.initialize(); 
    ChatAutocomplete.initialize();
    ChatOptimizer.initialize(); // [추가됨]    
});

// 채팅 메시지 생성 전에 추가 처리
Hooks.on('preCreateChatMessage', (message, options, userId) => {
    const select = document.querySelector('.character-select');
    if (select && select.value) {
        const actor = game.actors.get(select.value);
        if (actor) {
            // updateSource를 사용하여 문서 생성 전 데이터를 안전하게 변경
            message.updateSource({
                speaker: {
                    actor: actor.id,
                    alias: actor.name,
                    scene: game.scenes.current?.id,
                    token: null
                }
            });
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