export class Dnd5ePortraitHandler {
    static ID = 'character-chat-selector';
    static SETTINGS = {
        HIDE_DND5E_PORTRAIT: 'hideDnd5ePortrait'
    };

    static initialize() {
        Hooks.once('ready', () => {
            this._updateChatStyles();
        });
    }

    static _updateChatStyles() {
            const hidePortrait = game.settings.get(this.ID, this.SETTINGS.HIDE_DND5E_PORTRAIT);
            
            const existingStyle = document.getElementById('chat-selector-dnd5e-style');
            if (existingStyle) {
                existingStyle.remove();
            }

            if (hidePortrait) {
                const style = document.createElement('style');
                style.id = 'chat-selector-dnd5e-style';
                // D&D 5e 시스템 클래스(.dnd5e2)를 직접 지정하여 CSS 우선순위를 높여 확실하게 숨깁니다.
                // 또한, 우리 모듈의 초상화는 이 규칙의 영향을 받지 않도록 예외 처리(.chat-portrait-container)를 추가합니다.
                style.textContent = `
                    .dnd5e2.chat-message .message-sender a.avatar:not(.chat-portrait-container) {
                        display: none !important;
                    }
                    .dnd5e2.chat-message .message-header .name-stacked {
                        margin-left: 0 !important;
                    }
                `;
                document.head.appendChild(style);
            }
        }
}