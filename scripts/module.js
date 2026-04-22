import { ChatSelector } from './chatSelector.js';
import { HotkeyManager } from './hotkeyManager.js';
import { ChatEditor } from './chatEditor.js'; 
import { ChatAutocomplete } from './chatAutocomplete.js';
import { ChatOptimizer } from './chatOptimizer.js';
import { ChatNotification } from './chatNotification.js'; 
Hooks.once('init', () => {
    console.log('Character Chat Selector: Initializing...');
    ChatSelector.initialize();
    HotkeyManager.initialize();
    ChatEditor.initialize(); 
    ChatAutocomplete.initialize();
    ChatOptimizer.initialize();    
    ChatNotification.initialize();
});

// 채팅 메시지 생성 전에 추가 처리
Hooks.on('preCreateChatMessage', (message, options, userId) => {
    // 다른 모듈이 발화자를 직접 관리하는 메시지(스마트폰 메시지 앱, 갤러리 공유 등)는
    // 덮어쓰지 않고 통과시킵니다. 모듈이 자체 플래그로 의사를 밝혔거나, 범용
    // bypass 플래그(character-chat-selector.skip)를 설정한 경우 모두 해당합니다.
    const flags = message.flags ?? {};
    if (flags["smartphone-widget"]) return true;
    if (flags["character-chat-selector"]?.skip) return true;

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