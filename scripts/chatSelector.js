export class ChatSelector {
    static SETTINGS = {
        SHOW_SELECTOR: 'showSelector',
        SPEAK_AS_TOKEN: 'speakAsToken',
        SHOW_PORTRAIT: 'showPortrait',
        PORTRAIT_SIZE: 'portraitSize',
        PORTRAIT_BORDER: 'portraitBorder',
        PORTRAIT_BORDER_COLOR: 'portraitBorderColor',
        USE_USER_COLOR: 'useUserColor',
        USE_USER_BORDER: 'useUserBorder',
        CHAT_BORDER_COLOR: 'chatBorderColor'
    };

    static initialize() {
        console.log("ChatSelector | Initializing...");
        this.registerSettings();
        
        Hooks.once('ready', () => {
            console.log("ChatSelector | Ready hook fired");
            if (game.settings.get('character-chat-selector', this.SETTINGS.SHOW_SELECTOR)) {
                this._createSelector();
            }
        });

        // 액터 변경 감지
        Hooks.on('createActor', () => {
            console.log("ChatSelector | Actor created");
            this._updateCharacterList();
        });
        Hooks.on('deleteActor', () => {
            console.log("ChatSelector | Actor deleted");
            this._updateCharacterList();
        });
        Hooks.on('updateActor', () => {
            console.log("ChatSelector | Actor updated");
            this._updateCharacterList();
        });

        // 채팅 메시지 렌더링 훅 추가
        Hooks.on('renderChatMessage', (message, html, data) => {
            this._addPortraitToMessage(message, html, data);
        });
    }

    static registerSettings() {
        console.log("ChatSelector | Registering settings");
        game.settings.register('character-chat-selector', this.SETTINGS.SHOW_SELECTOR, {
            name: game.i18n.localize('CHATSELECTOR.Settings.ShowSelector.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.ShowSelector.Hint'),
            scope: 'client',
            config: true,
            type: Boolean,
            default: true,
            onChange: (value) => this.updateSelector()
        });
    
        game.settings.register('character-chat-selector', this.SETTINGS.SPEAK_AS_TOKEN, {
            name: game.i18n.localize('CHATSELECTOR.Settings.SpeakAsToken.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.SpeakAsToken.Hint'),
            scope: 'client',
            config: true,
            type: Boolean,
            default: false,
            onChange: () => {
                const select = document.querySelector('.character-select');
                if (select && select.value) {
                    const event = { target: select };
                    this._onCharacterSelect(event);
                }
            }
        });
    
        game.settings.register('character-chat-selector', this.SETTINGS.SHOW_PORTRAIT, {
            name: game.i18n.localize('CHATSELECTOR.Settings.ShowPortrait.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.ShowPortrait.Hint'),
            scope: 'client',
            config: true,
            type: Boolean,
            default: true
        });
    
        game.settings.register('character-chat-selector', this.SETTINGS.PORTRAIT_SIZE, {
            name: game.i18n.localize('CHATSELECTOR.Settings.PortraitSize.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.PortraitSize.Hint'),
            scope: 'client',
            config: true,
            type: Number,
            default: 36,
            range: {
                min: 20,
                max: 100,
                step: 4
            }
        });
    
        game.settings.register('character-chat-selector', this.SETTINGS.PORTRAIT_BORDER, {
            name: game.i18n.localize('CHATSELECTOR.Settings.PortraitBorder.Name'),
            scope: 'client',
            config: true,
            type: String,
            choices: {
                'default': game.i18n.localize('CHATSELECTOR.Settings.PortraitBorder.Choices.Default'),
                'none': game.i18n.localize('CHATSELECTOR.Settings.PortraitBorder.Choices.None'),
                'square': game.i18n.localize('CHATSELECTOR.Settings.PortraitBorder.Choices.Square'),
                'circle': game.i18n.localize('CHATSELECTOR.Settings.PortraitBorder.Choices.Circle'),
            },
            default: 'default'
        });
    
        game.settings.register('character-chat-selector', this.SETTINGS.PORTRAIT_BORDER_COLOR, {
            name: game.i18n.localize('CHATSELECTOR.Settings.PortraitBorderColor.Name'),
            scope: 'client',
            config: true,
            type: String,
            default: '#000000'
        });
    
        game.settings.register('character-chat-selector', this.SETTINGS.USE_USER_COLOR, {
            name: game.i18n.localize('CHATSELECTOR.Settings.UseUserColor.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.UseUserColor.Hint'),
            scope: 'client',
            config: true,
            type: Boolean,
            default: true
        });
    
        game.settings.register('character-chat-selector', this.SETTINGS.CHAT_BORDER_COLOR, {
            name: game.i18n.localize('CHATSELECTOR.Settings.ChatBorderColor.Name'),
            scope: 'client',
            config: true,
            type: String,
            default: '#000000'
        });
    
        game.settings.register('character-chat-selector', this.SETTINGS.USE_USER_BORDER, {
            name: game.i18n.localize('CHATSELECTOR.Settings.UseUserBorder.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.UseUserBorder.Hint'),
            scope: 'client',
            config: true,
            type: Boolean,
            default: true
        });
    }
    

    static _createSelector() {
        console.log("ChatSelector | Creating selector");
        const chatControls = document.querySelector("#chat-controls");
        if (!chatControls) {
            console.error("ChatSelector | Chat controls not found");
            return;
        }
        
        if (document.querySelector('.character-chat-selector')) {
            console.log("ChatSelector | Selector already exists");
            return;
        }

        const currentSpeaker = ChatMessage.getSpeaker();
        console.log("ChatSelector | Current speaker:", currentSpeaker);

        const selectorHtml = `
            <div class="character-chat-selector">
                <select class="character-select">
                    <option value="">기본</option>
                    ${this._getCharacterOptions(currentSpeaker.actor)}
                </select>
                <button class="refresh-characters" title="목록 새로고침">
                    <i class="fas fa-sync"></i>
                </button>
            </div>
        `;

        chatControls.insertAdjacentHTML('beforeend', selectorHtml);
        this._addEventListeners();
    }

    static _getCharacterOptions(currentActorId) {
        console.log("ChatSelector | Getting character options, current actor:", currentActorId);
        
        const actors = game.actors.filter(actor => {
            // GM은 모든 액터를 볼 수 있음
            if (game.user.isGM) return true;
            
            // 일반 플레이어는 자신이 소유한 액터만 볼 수 있음
            return actor.ownership[game.user.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        });
    
        const options = actors
            .map(a => {
                return `<option value="${a.id}" ${a.id === currentActorId ? 'selected' : ''}>${a.name}</option>`;
            })
            .join('');

        return options;
    }

    static _addEventListeners() {
        console.log("ChatSelector | Adding event listeners");
        const select = document.querySelector('.character-select');
        const refreshButton = document.querySelector('.refresh-characters');

        if (select) {
            select.addEventListener('change', (event) => {
                console.log("ChatSelector | Selection changed:", event.target.value);
                this._onCharacterSelect(event);
            });
        }

        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                console.log("ChatSelector | Refresh clicked");
                this._updateCharacterList();
            });
        }
    }

    static _onCharacterSelect(event) {
        const actorId = event.target.value;
        console.log("ChatSelector | Character selected:", actorId);
    
        if (actorId) {
            const actor = game.actors.get(actorId);
            if (actor) {
                console.log("ChatSelector | Setting speaker to:", actor.name);
                
                const speakAsToken = game.settings.get('character-chat-selector', this.SETTINGS.SPEAK_AS_TOKEN);
                const tokenData = actor.prototypeToken;
                
                ui.chat.processMessage = function(message) {
                    const chatData = {
                        user: game.user.id,
                        speaker: speakAsToken ? {
                            scene: game.scenes.current?.id,
                            actor: actor.id,
                            token: tokenData.id || null, 
                            alias: tokenData.name || actor.name
                        } : {
                            scene: game.scenes.current?.id,
                            actor: actor.id,
                            token: null,
                            alias: actor.name
                        },
                        content: message,
                    };
                    return ChatMessage.create(chatData);
                };
            }
        } else {
            console.log("ChatSelector | Resetting to default");
            
            // 기본 상태로 완전히 복구
            const originalProcessMessage = ui.chat.constructor.prototype.processMessage;
            ui.chat.processMessage = originalProcessMessage;
            delete ChatMessage.implementation.prototype._getChatSpeakerData;
            
        }
    }

    static _updateCharacterList() {
        console.log("ChatSelector | Updating character list");
        const select = document.querySelector('.character-select');
        if (!select) {
            console.error("ChatSelector | Select element not found");
            return;
        }

        const currentValue = select.value;
        select.innerHTML = `
            <option value="">기본</option>
            ${this._getCharacterOptions(currentValue)}
        `;
        select.value = currentValue;
    }

    static updateSelector() {
        console.log("ChatSelector | Updating selector");
        const existingSelector = document.querySelector('.character-chat-selector');
        if (existingSelector) {
            console.log("ChatSelector | Removing existing selector");
            existingSelector.remove();
        }

        if (game.settings.get('character-chat-selector', this.SETTINGS.SHOW_SELECTOR)) {
            console.log("ChatSelector | Creating new selector");
            this._createSelector();
        }
    }

    static async _getMessageImage(message) {
        console.log("_getMessageImage 시작:", message);
    
        // 화자가 선택되어 있지 않은 경우 (기본 상태)
        if (!message.speaker?.actor) {
            const user = message.author || message.user;
            console.log("사용자 정보:", user);
    
            if (user?.avatar) {
                console.log("사용자 아바타 반환:", user.avatar);
                return user.avatar;
            } else {
                console.warn("사용자 아바타를 찾을 수 없음:", message.author);
            }
        }
    
        // 토큰 모드로 설정된 경우
        const speakAsToken = game.settings.get('character-chat-selector', this.SETTINGS.SPEAK_AS_TOKEN);
        console.log("토큰으로 말하기 모드:", speakAsToken);
    
        if (speakAsToken) {
            const tokenImg = await this._getTokenImage(message.speaker);
            console.log("토큰 이미지 검색 결과:", tokenImg);
    
            if (tokenImg) return tokenImg;
        }
    
        // 선택된 액터의 이미지
        const actor = game.actors.get(message.speaker.actor);
        console.log("선택된 액터:", actor);
    
        if (actor?.img) {
            console.log("액터 이미지 반환:", actor.img);
            return actor.img;
        }
    
        // 모든 것이 실패하면 플레이어 아바타로 폴백
        const fallbackAvatar = game.users.get(message.author || message.user)?.avatar || 'icons/svg/mystery-man.svg';
        console.log("폴백 아바타:", fallbackAvatar);
        return fallbackAvatar;
    }

    static async _getTokenImage(speaker) {
        console.log("Getting token image for speaker:", speaker);
        
        let tokenImg = null;
        
        // 1. 실제 토큰 확인
        if (speaker.token) {
            console.log("Speaker has token ID:", speaker.token);
            
            // 현재 씬의 활성 토큰 확인
            const activeToken = canvas.tokens?.placeables.find(t => t.id === speaker.token);
            if (activeToken) {
                console.log("Found active token:", activeToken);
                tokenImg = activeToken.document.texture.src || activeToken.document.img;
                console.log("Active token image:", tokenImg);
            }
    
            // 지정된 씬의 토큰 확인
            if (!tokenImg) {
                const scene = game.scenes.get(speaker.scene || canvas.scene?.id);
                if (scene) {
                    const tokenDoc = scene.tokens.get(speaker.token);
                    if (tokenDoc) {
                        console.log("Found token document:", tokenDoc);
                        tokenImg = tokenDoc.texture?.src || tokenDoc.img;
                        console.log("Token document image:", tokenImg);
                    }
                }
            }
        }
    
   // 2. 프로토타입 토큰 이미지 확인
            if (!tokenImg && speaker.actor) {
                console.log("Checking prototype token for actor:", speaker.actor);
                const actor = game.actors.get(speaker.actor);
                if (actor) {
                    const prototypeToken = actor.prototypeToken;
                    if (prototypeToken) {
                        console.log("Found prototype token:", prototypeToken);
                        tokenImg = prototypeToken.texture?.src || prototypeToken.img || actor.img;
                        console.log("Prototype token image:", tokenImg);
                    }
                }
            }

            console.log("Final token image result:", tokenImg);
            return tokenImg;
        }

    static async _addPortraitToMessage(message, html, data) {
        if (!game.settings.get('character-chat-selector', this.SETTINGS.SHOW_PORTRAIT)) return;
    
        const speaker = message.speaker;
        if (!speaker) return;
    
        const header = html.find('.message-header');
        if (!header.length) return;
    
        const portraitSize = game.settings.get('character-chat-selector', this.SETTINGS.PORTRAIT_SIZE);
        const borderStyle = game.settings.get('character-chat-selector', this.SETTINGS.PORTRAIT_BORDER);
        const useUserColor = game.settings.get('character-chat-selector', this.SETTINGS.USE_USER_COLOR);
        const borderColor = useUserColor ? (message.author?.color || message.user?.color || '#4b4a44') : 
                           game.settings.get('character-chat-selector', this.SETTINGS.PORTRAIT_BORDER_COLOR);
        
        // 이미지 소스 결정 로직
        let imgSrc;
        const speakAsToken = game.settings.get('character-chat-selector', this.SETTINGS.SPEAK_AS_TOKEN);
        
        console.log("Message speaker:", message.speaker);
        console.log("Speak as token setting:", speakAsToken);
        
        if (speakAsToken) {
            imgSrc = await this._getMessageImage(message);
            console.log("Retrieved token image:", imgSrc);
        }
        
        if (!imgSrc) {
            // speaker의 actor가 없을 때 사용자 아바타로 폴백 설정
            if (!message.speaker?.actor) {
                const user = message.author || message.user;  
                if (user?.avatar) {
                    imgSrc = user.avatar;
                } else {
                }
            } else {
                // actor가 있는 경우 actor의 이미지 확인
                const actor = game.actors.get(message.speaker.actor);
                imgSrc = actor?.img || 'icons/svg/mystery-man.svg';
            }
        }
    
        // 초상화 컨테이너 생성
        const portraitContainer = document.createElement('div');
        portraitContainer.classList.add('chat-portrait-container');
        portraitContainer.style.width = `${portraitSize}px`;
        portraitContainer.style.height = `${portraitSize}px`;
    
        // 초상화 이미지 생성
        const img = document.createElement('img');
        img.src = imgSrc;
        img.classList.add('chat-portrait');
    
        // 스타일 적용
        switch (borderStyle) {
            case 'none':
                portraitContainer.classList.add('portrait-none');
                break;
            case 'square':
                portraitContainer.classList.add('portrait-square');
                break;
            case 'circle':
                portraitContainer.classList.add('portrait-circle');
                break;
            case 'default':
                portraitContainer.classList.add('portrait-default');
                break;
        }
    
        if (borderStyle !== 'none') {
            portraitContainer.style.color = borderColor; 
        }
    
        // 초상화 클릭 이벤트
        portraitContainer.addEventListener('click', async (event) => {
            let sheet = null;
            if (speakAsToken) {
                const token = await this._getToken(speaker);
                sheet = token?.actor?.sheet;
            }
            if (!sheet) {
                const actor = game.actors.get(speaker.actor);
                sheet = actor?.sheet;
            }
            sheet?.render(true);
        });
    
        // 이미지를 컨테이너에 추가
        portraitContainer.appendChild(img);
        portraitContainer.classList.add('chat-portrait-container');
        portraitContainer.style.setProperty('--portrait-size', `${portraitSize}px`);  
    
        // 메시지에 포트레잇 추가
        header.prepend(portraitContainer);

        
        const useUserBorder = game.settings.get('character-chat-selector', this.SETTINGS.USE_USER_BORDER);
        const chatBorderColor = game.settings.get('character-chat-selector', this.SETTINGS.CHAT_BORDER_COLOR);
        const messageElement = html[0];
        if (useUserBorder) {
            const userColor = message.author?.color || message.user?.color;
            console.log('User color:', userColor);
            if (userColor) {
                messageElement.style.borderColor = userColor;
            } else {
                messageElement.style.borderColor = chatBorderColor;
            }
        } else {
            messageElement.style.borderColor = chatBorderColor;
        }
   
        
        // CSS 스타일 추가
        if (!document.querySelector('#chat-portrait-styles')) {
            const style = document.createElement('style');
            style.id = 'chat-portrait-styles';
            style.textContent = `
            .chat-portrait-container {
                position: relative;
                margin-right: 8px;
                flex: 0 0 auto;
                overflow: hidden;
                transition: all 0.2s ease;
                width: var(--portrait-size);
                height: var(--portrait-size);
            }
        
            .chat-portrait {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
            }
        
            /* 기본 상태 */
            .portrait-default {
                border: 1px solid currentColor;
                border-radius: 10%;
            }
        
            /* 사각형 */
            .portrait-square {
                border: 2px solid currentColor;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            }
        
            /* 원형 */
            .portrait-circle {
                border: 2px solid currentColor;
                border-radius: 50%;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                overflow: hidden;
            }
        
            /* 테두리 없음 */
            .portrait-none {
                border: none;
                box-shadow: none;
            }
        
            .chat-portrait-container:hover {
                transform: scale(1.05);
                box-shadow: 0 0 15px rgba(0, 0, 0, 0.2);
                cursor: pointer;
            }
        
            .message {
                position: relative;
            }
        
            .message::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                pointer-events: none;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.05);
                border-radius: inherit;
            }
        
            .message-header {
                display: flex;
                align-items: center;
                padding: 5px;
                background: rgba(255, 255, 255, 0.05);
            }
            
            .chat-portrait-container img {
                image-rendering: auto;
                width: 100%;
                height: 100%;
                border: none;  
            }
        `;        
            document.head.appendChild(style);
        }
    }

    static _getToken(speaker) {
        if (!speaker.token) return null;
        
        const scene = game.scenes.get(speaker.scene || canvas.scene?.id);
        if (!scene) return null;

        return scene.tokens.get(speaker.token)?.object || 
               canvas.tokens?.placeables.find(t => t.id === speaker.token);
    }
}