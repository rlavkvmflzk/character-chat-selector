export class RubyTextHandler {
    static ID = 'character-chat-selector';
    static SETTINGS = {
        ENABLE_RUBY: 'enableRuby',
        RUBY_SIZE: 'rubyTextSize',
        RUBY_COLOR: 'rubyTextColor',
        ENABLE_MARKDOWN: 'enableMarkdown'
    };

    static initialize() {
        this.injectStyles();

        Hooks.on('renderSettingsConfig', (app, html, data) => {
            const root = (html instanceof HTMLElement) ? html : (html[0] || html);
            const inputName = 'character-chat-selector.rubyTextColor';
            const input = root.querySelector ? root.querySelector(`input[name="${inputName}"]`) : null;

            if (input && input.nextElementSibling?.type !== 'color') {
                const picker = document.createElement('input');
                picker.type = 'color';
                picker.style.marginLeft = '5px';
                picker.style.height = '26px';
                picker.style.width = '40px';
                picker.style.border = 'none';
                picker.style.cursor = 'pointer';

                if (input.value.startsWith('#')) picker.value = input.value.substring(0, 7);

                picker.addEventListener('input', (e) => {
                    input.value = e.target.value;
                    const event = new Event('change', { bubbles: true });
                    input.dispatchEvent(event);
                });

                input.addEventListener('input', (e) => {
                    if (e.target.value.length >= 7) picker.value = e.target.value.substring(0, 7);
                });

                input.after(picker);
            }
        });
    }


    static processMessage(message) {
        if (!message || typeof message !== 'string') return message;

        // 1. 마크다운 처리
        if (game.settings.get(this.ID, this.SETTINGS.ENABLE_MARKDOWN) && typeof marked !== 'undefined') {
            try {
                // [수정] parseInline 대신 parse 사용 (## 헤더 등 블록 요소 지원을 위해)
                let parsed = marked.parse(message, { breaks: true });

                // [중요] marked는 모든 텍스트를 <p>로 감싸는데, 이게 채팅창 레이아웃을 깸
                // 따라서 '단순 문단' 하나만 있는 경우 <p> 태그를 벗겨냄. 
                // (## 같은 헤더나 목록은 <p>가 아니라 <h2>, <ul> 등이므로 유지됨)
                if (parsed.trim().startsWith('<p>') && parsed.trim().endsWith('</p>')) {
                    // 내부에 다른 블록 태그가 없는지 확인 (단순 텍스트인 경우)
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = parsed;
                    if (tempDiv.children.length === 1 && tempDiv.children[0].tagName === 'P') {
                        parsed = tempDiv.children[0].innerHTML;
                    }
                }

                // HTML 정화 (보안)
                if (typeof DOMPurify !== 'undefined') {
                    // [수정] 루비 태그가 정화 과정에서 잘리지 않도록 허용 목록 추가
                    message = DOMPurify.sanitize(parsed, {
                        ADD_TAGS: ['ruby', 'rt', 'rp', 'span'],
                        ADD_ATTR: ['style', 'class']
                    });
                } else {
                    message = parsed;
                }
            } catch (error) {
                console.error("Character Chat Selector | Markdown parsing error:", error);
            }
        }

        // 2. 루비 문자 처리
        if (game.settings.get(this.ID, this.SETTINGS.ENABLE_RUBY)) {
            const rubyPattern = /\[(.*?)\|(.*?)\]/g;

            message = message.replace(rubyPattern, (match, original, ruby) => {
                const kanjiLength = [...original].length;
                const furiganaLength = [...ruby].length;

                if (furiganaLength > kanjiLength) {
                    const extraSpace = (furiganaLength - kanjiLength) * 0.5;
                    return `<span class="ruby-spacer" style="--ruby-space: ${extraSpace}em;"><ruby>${original}<rt>${ruby}</rt></ruby></span>`;
                }

                return `<ruby>${original}<rt>${ruby}</rt></ruby>`;
            });
        }

        return message;
    }

    static injectStyles() {
        const styleId = 'ruby-text-styles';
        let rubySize, rubyColor, enableRuby;

        try {
            enableRuby = game.settings.get(this.ID, this.SETTINGS.ENABLE_RUBY);
            rubySize = game.settings.get(this.ID, this.SETTINGS.RUBY_SIZE);
            rubyColor = game.settings.get(this.ID, this.SETTINGS.RUBY_COLOR);
        } catch (e) {
            enableRuby = true;
            rubySize = 0.5;
            rubyColor = "#666666";
        }

        const existingStyle = document.getElementById(styleId);
        if (existingStyle) {
            existingStyle.remove();
        }

        if (!enableRuby) return;

        const style = document.createElement('style');
        style.id = styleId;

        style.textContent = `
            ruby {
                display: inline-flex;
                flex-direction: column;
                align-items: center;
                vertical-align: bottom;
                margin-top: ${rubySize * 1.2}em; 
                line-height: 1;
                position: relative;
                text-align: center;
            }
    
            rt {
                display: block;
                position: absolute;
                top: -${rubySize * 1.5}em; 
                left: 50%;
                transform: translateX(-50%);
                font-size: ${rubySize}em; 
                color: ${rubyColor};
                white-space: nowrap;
                user-select: none;
                line-height: 1;
                text-align: center;
                pointer-events: none;
            }

            .ruby-spacer {
                display: inline-block;
                margin: 0 var(--ruby-space, 0);
            }
            
            :root[data-theme="dark"] rt {
                filter: brightness(1.2); 
            }
        `;

        document.head.appendChild(style);
    }
}