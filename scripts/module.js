import { ChatSelector } from './chatSelector.js';
import { HotkeyManager } from './hotkeyManager.js';
import { ChatEditor } from './chatEditor.js'; 
import { ChatAutocomplete } from './chatAutocomplete.js';
import { ChatOptimizer } from './chatOptimizer.js';
import { ChatNotification } from './chatNotification.js'; 
import { ChatSelectorConfig } from './chatSelectorConfig.js'; 

Hooks.once('init', () => {
    console.log('Characer Chat Selector: Initializing...');
    ChatSelector.initialize();
    HotkeyManager.initialize();
    ChatEditor.initialize(); 
    ChatAutocomplete.initialize();
    ChatOptimizer.initialize();    
    ChatNotification.initialize();
    ChatSelectorConfig.initialize();
});

// 채팅 메시지 생성 전에 추가 처리
Hooks.on('preCreateChatMessage', (message, options, userId) => {
    const select = document.querySelector('.character-select');
    if (select && select.value) {
        const actor = game.actors.get(select.value);
        if (actor) {
            // chatSelector.js가 이미 올바른 토큰을 설정했다면(액터 ID가 같고 토큰 ID가 존재하면) 덮어쓰지 않고 유지합니다.
            if (message.speaker.actor === actor.id && message.speaker.token) {
                return true;
            }

            // 그 외의 경우(시트에서 롤을 굴리는 등)에는 액터 정보를 강제하되 토큰은 비웁니다.
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