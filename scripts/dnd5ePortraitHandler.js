export class Dnd5ePortraitHandler {
    static ID = 'character-chat-selector';
    static SETTINGS = {
        HIDE_DND5E_PORTRAIT: 'hideDnd5ePortrait'
    };

    static initialize() {
        this.registerSettings();
        
        Hooks.once('ready', () => {
            this._updateChatStyles();
        });
    }

    static registerSettings() {
        game.settings.register(this.ID, this.SETTINGS.HIDE_DND5E_PORTRAIT, {
            name: game.i18n.localize("CHATSELECTOR.Settings.HidePortrait.Name"),
            hint: game.i18n.localize("CHATSELECTOR.Settings.HidePortrait.Hint"),
            scope: 'client',
            config: true,
            type: Boolean,
            default: false,
            onChange: () => {
                this._updateChatStyles();
            }
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
            style.textContent = `
                .chat-message .message-header .avatar {
                    display: none !important;
                }
                .chat-message .message-header .name-stacked {
                    margin-left: 0 !important;
                }
            `;
            document.head.appendChild(style);
        }
    }
}