export class Wfrp4ePortraitHandler {
    static ID = 'character-chat-selector';
    static SETTINGS = {
        HIDE_WFRP4E_PORTRAIT: 'hideWfrp4ePortrait'
    };

    static initialize() {
        // WFRP4e 시스템이 아니면 작동하지 않음
        if (game.system.id !== 'wfrp4e') return;

        Hooks.once('ready', () => {
            this._updateChatStyles();
        });
    }

    static _updateChatStyles() {
        const hidePortrait = game.settings.get(this.ID, this.SETTINGS.HIDE_WFRP4E_PORTRAIT);
        
        const existingStyle = document.getElementById('chat-selector-wfrp4e-style');
        if (existingStyle) {
            existingStyle.remove();
        }

        if (hidePortrait) {
            const style = document.createElement('style');
            style.id = 'chat-selector-wfrp4e-style';
            // WFRP4e의 기본 토큰 이미지 영역 숨김
            style.textContent = `
                .chat-message .message-header .message-token {
                    display: none !important;
                }
            `;
            document.head.appendChild(style);
        }
    }
}