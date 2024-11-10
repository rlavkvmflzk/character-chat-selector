export class RubyTextHandler {
    static ID = 'character-chat-selector';
    static SETTINGS = {
        ENABLE_RUBY: 'enableRuby',
        RUBY_SIZE: 'rubyTextSize',
        RUBY_COLOR: 'rubyTextColor'
    };

    static initialize() {
        this.registerSettings();
        this.injectStyles();
    }

    static registerSettings() {
        
        game.settings.register(this.ID, this.SETTINGS.ENABLE_RUBY, {
            name: game.i18n.localize("CHATSELECTOR.Settings.EnableRuby.Name"),
            hint: game.i18n.localize("CHATSELECTOR.Settings.EnableRuby.Hint"),
            scope: "client",
            config: true,
            type: Boolean,
            default: true
        });
    
        game.settings.register(this.ID, this.SETTINGS.RUBY_SIZE, {
            name: game.i18n.localize("CHATSELECTOR.Settings.RubySize.Name"),
            hint: game.i18n.localize("CHATSELECTOR.Settings.RubySize.Hint"),
            scope: "client",
            config: true,
            type: Number,
            range: {
                min: 0.4,
                max: 1.0,
                step: 0.1
            },
            default: 0.6
        });
    
        ColorPicker.register(this.ID, this.SETTINGS.RUBY_COLOR, {
            name: game.i18n.localize("CHATSELECTOR.Settings.RubyColor.Name"),
            hint: game.i18n.localize("CHATSELECTOR.Settings.RubyColor.Hint"),
            scope: "client",
            default: "#666666",
            config: true
        });
    }

    static processMessage(message) {
        if (!game.settings.get(this.ID, this.SETTINGS.ENABLE_RUBY)) {
            return message;
        }
    
        const rubyPattern = /\[\[(.*?)\|(.*?)\]\]/g;
        return message.replace(rubyPattern, (match, original, ruby) => {
            const kanjiLength = [...original].length;
            const furiganaLength = [...ruby].length;
            
            if (furiganaLength > kanjiLength) {
                const extraSpace = Math.ceil((furiganaLength - kanjiLength) / 2); 
                return `<span style="display: inline-block; margin: 0 ${extraSpace * 0.5}em;"><ruby>${original}<rt>${ruby}</rt></ruby></span>`;
            }
            
            return `<ruby>${original}<rt>${ruby}</rt></ruby>`;
        });
    }

    static injectStyles() {
        const styleId = 'ruby-text-styles';
        const rubySize = game.settings.get(this.ID, this.SETTINGS.RUBY_SIZE);
        const rubyColor = game.settings.get(this.ID, this.SETTINGS.RUBY_COLOR);
    
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            ruby {
                display: inline-flex;
                flex-direction: column;
                align-items: center;
                vertical-align: bottom;
                margin-top: ${rubySize * 1.5}em;
                line-height: 1.2;
                position: relative;
                text-align: center;
            }
    
            rt {
                display: block;
                position: absolute;
                top: -${rubySize * 2}em;
                left: 50%;
                transform: translateX(-50%);
                font-size: ${rubySize}em;
                color: ${rubyColor};
                white-space: nowrap;
                user-select: none;
                line-height: 1;
                text-align: center;
                width: max-content;
                letter-spacing: normal;
            }
    
            rb {
                display: inline-block;
                line-height: inherit;
                text-align: center;
            }
    
            :root[data-theme="dark"] rt {
                color: ${this._adjustColorForDarkMode(rubyColor)};
            }
            
            ruby > rt {
                text-indent: 0;
                text-align: center;
                text-align-last: center;
            }
        `;
    
        const existingStyle = document.getElementById(styleId);
        if (existingStyle) {
            existingStyle.remove();
        }
        document.head.appendChild(style);
    }

    static _adjustColorForDarkMode(color) {
        const rgb = color.match(/\w\w/g).map(x => parseInt(x, 16));
        const lighter = rgb.map(x => Math.min(255, x + 51)).map(x => x.toString(16).padStart(2, '0'));
        return `#${lighter.join('')}`;
    }
}