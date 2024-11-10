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
            name: "Enable Ruby Text",
            hint: "Enable Japanese furigana/ruby text support in chat",
            scope: "client",
            config: true,
            type: Boolean,
            default: true
        });

        game.settings.register(this.ID, this.SETTINGS.RUBY_SIZE, {
            name: "Ruby Text Size",
            hint: "Size of ruby text relative to base text",
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
            name: "Ruby Text Color",
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
        return message.replace(rubyPattern, (match, kanji, furigana) => {
            const kanjiLength = [...kanji].length;
            const furiganaLength = [...furigana].length;
            
            if (furiganaLength > kanjiLength) {
                const extraSpace = Math.ceil((furiganaLength - kanjiLength) / 2); // 양쪽으로 나눌 여백 계산
                // 루비 컨테이너에 좌우 margin 적용
                return `<span style="display: inline-block; margin: 0 ${extraSpace * 0.5}em;"><ruby>${kanji}<rt>${furigana}</rt></ruby></span>`;
            }
            
            return `<ruby>${kanji}<rt>${furigana}</rt></ruby>`;
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
        // 다크모드에서 더 밝은 색상으로 조정
        const rgb = color.match(/\w\w/g).map(x => parseInt(x, 16));
        const lighter = rgb.map(x => Math.min(255, x + 51)).map(x => x.toString(16).padStart(2, '0'));
        return `#${lighter.join('')}`;
    }
}