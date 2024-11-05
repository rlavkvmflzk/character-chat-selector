import { HpTintEffect } from './hpTintEffect.js';

const DEBUG = false;

// 로그용 유틸리티 함수 추가
const log = (...args) => {
    if (DEBUG) log(...args);
};

export class ChatSelector {
    static SETTINGS = {
        SHOW_SELECTOR: 'showSelector',
        SPEAK_AS_TOKEN: 'speakAsToken',
        SHOW_PORTRAIT: 'showPortrait',
        PORTRAIT_SIZE: 'portraitSize',
        PORTRAIT_BORDER: 'portraitBorder',
        PORTRAIT_BORDER_COLOR: 'portraitBorderColor',  
        USE_USER_BORDER: 'useUserBorder',
        USE_USER_COLOR: 'useUserColor',
        USE_SECONDARY_COLOR: 'useSecondaryColor',
        USE_GLOW_EFFECT: 'useGlowEffect',
        SECONDARY_COLOR: 'secondaryColor',
        GLOW_COLOR: 'glowColor',
        GLOW_STRENGTH: 'glowStrength',
        CHAT_BORDER_COLOR: 'chatBorderColor'
    };

    static initialize() {
        log("ChatSelector | Initializing...");
        this.registerSettings();
        
        Hooks.once('ready', () => {
            log("ChatSelector | Ready hook fired");
            if (game.settings.get('character-chat-selector', this.SETTINGS.SHOW_SELECTOR)) {
                this._createSelector();
            }
        });

        // 액터 변경 감지
        Hooks.on('createActor', () => {
            log("ChatSelector | Actor created");
            this._updateCharacterList();
        });
        Hooks.on('deleteActor', () => {
            log("ChatSelector | Actor deleted");
            this._updateCharacterList();
        });
        Hooks.on('updateActor', () => {
            log("ChatSelector | Actor updated");
            this._updateCharacterList();
        });

        // 채팅 메시지 렌더링 훅 추가
        Hooks.on('renderChatMessage', (message, html, data) => {
            this._addPortraitToMessage(message, html, data);
        });

        HpTintEffect.initialize();
        HpTintEffect.injectStyles();
    }

    static registerSettings() {
        log("ChatSelector | Registering settings");
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
                'minimalist': game.i18n.localize('CHATSELECTOR.Settings.PortraitBorder.Choices.minimalist'),
                'cyber': game.i18n.localize('CHATSELECTOR.Settings.PortraitBorder.Choices.cyber')
            },
            default: 'default'
        });

        game.settings.register('character-chat-selector', this.SETTINGS.USE_USER_COLOR, {
            name: game.i18n.localize('CHATSELECTOR.Settings.UseUserColor.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.UseUserColor.Hint'),
            scope: 'client',
            config: true,
            type: Boolean,
            default: true
        });


        ColorPicker.register('character-chat-selector', this.SETTINGS.PORTRAIT_BORDER_COLOR, {
            name: game.i18n.localize('CHATSELECTOR.Settings.PortraitBorderColor.Name'),
            scope: 'client',
            config: true,
            default: '#000000FF',
        }, {
            format: 'hexa',
            alphaChannel: true,
            preview: true
        });
    


        game.settings.register('character-chat-selector', this.SETTINGS.USE_SECONDARY_COLOR, {
            name: game.i18n.localize('CHATSELECTOR.Settings.UseSecondaryColor.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.UseSecondaryColor.Hint'),
            scope: 'client',
            config: true,
            type: Boolean,
            default: false
        });
        
        ColorPicker.register('character-chat-selector', this.SETTINGS.SECONDARY_COLOR, {
            name: game.i18n.localize('CHATSELECTOR.Settings.SecondaryColor.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.SecondaryColor.Hint'),
            scope: 'client',
            config: true,
            default: '#2b2a24FF'
        }, {
            format: 'hexa',
            alphaChannel: true,
            preview: true
        });
        
        game.settings.register('character-chat-selector', this.SETTINGS.USE_GLOW_EFFECT, {
            name: game.i18n.localize('CHATSELECTOR.Settings.UseGlowEffect.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.UseGlowEffect.Hint'),
            scope: 'client',
            config: true,
            type: Boolean,
            default: false
        });
        
        ColorPicker.register('character-chat-selector', this.SETTINGS.GLOW_COLOR, {
            name: game.i18n.localize('CHATSELECTOR.Settings.GlowColor.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.GlowColor.Hint'),
            scope: 'client',
            config: true,
            default: '#ffffff80'
        }, {
            format: 'hexa',
            alphaChannel: true,
            preview: true
        });
        
        game.settings.register('character-chat-selector', this.SETTINGS.GLOW_STRENGTH, {
            name: game.i18n.localize('CHATSELECTOR.Settings.GlowStrength.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.GlowStrength.Hint'),
            scope: 'client',
            config: true,
            type: Number,
            range: {
                min: 0,
                max: 20,
                step: 1
            },
            default: 5
        });

        game.settings.register('character-chat-selector', this.SETTINGS.USE_USER_BORDER, {
            name: game.i18n.localize('CHATSELECTOR.Settings.UseUserBorder.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.UseUserBorder.Hint'),
            scope: 'client',
            config: true,
            type: Boolean,
            default: true
        });

        ColorPicker.register('character-chat-selector', this.SETTINGS.CHAT_BORDER_COLOR, {
            name: game.i18n.localize('CHATSELECTOR.Settings.ChatBorderColor.Name'),
            scope: 'client',
            config: true,
            default: '#000000FF',
        }, {
            format: 'hexa',
            alphaChannel: true,
            preview: true
        });
    }

    static _createSelector() {
        log("ChatSelector | Creating selector");
        const chatControls = document.querySelector("#chat-controls");
        if (!chatControls) {
            console.error("ChatSelector | Chat controls not found");
            return;
        }
        
        if (document.querySelector('.character-chat-selector')) {
            log("ChatSelector | Selector already exists");
            return;
        }

        const currentSpeaker = ChatMessage.getSpeaker();
        log("ChatSelector | Current speaker:", currentSpeaker);

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
        log("ChatSelector | Getting character options, current actor:", currentActorId);
        
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
        log("ChatSelector | Adding event listeners");
        const select = document.querySelector('.character-select');
        const refreshButton = document.querySelector('.refresh-characters');

        if (select) {
            select.addEventListener('change', (event) => {
                log("ChatSelector | Selection changed:", event.target.value);
                this._onCharacterSelect(event);
            });
        }

        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                log("ChatSelector | Refresh clicked");
                this._updateCharacterList();
            });
        }
    }

    static _onCharacterSelect(event) {
        const actorId = event.target.value;
        log("ChatSelector | Character selected:", actorId);
    
        if (actorId) {
            const actor = game.actors.get(actorId);
            if (actor) {
                log("ChatSelector | Setting speaker to:", actor.name);
                
                const speakAsToken = game.settings.get('character-chat-selector', this.SETTINGS.SPEAK_AS_TOKEN);
                const tokenData = actor.prototypeToken;
                
                // 원본 processMessage 함수 보존
                const originalProcessMessage = ui.chat.processMessage;
                
                ui.chat.processMessage = async function(message) {
                    const speaker = speakAsToken ? {
                        scene: game.scenes.current?.id,
                        actor: actor.id,
                        token: tokenData.id || null,
                        alias: tokenData.name || actor.name
                    } : {
                        scene: game.scenes.current?.id,
                        actor: actor.id,
                        token: null,
                        alias: actor.name
                    };
    
                    // 주사위 명령어 체크
                    if (message.startsWith('/r') || message.startsWith('/roll')) {
                        try {
                            const rollData = message.slice(message.indexOf(' ') + 1);
                            const roll = await new Roll(rollData).evaluate({async: true});
                            
                            // Dice So Nice와 통합
                            if (game.dice3d) {
                                await game.dice3d.showForRoll(roll, game.user, true);
                            }
    
                            const chatData = {
                                user: game.user.id,
                                speaker: speaker,
                                type: CONST.CHAT_MESSAGE_TYPES.ROLL,
                                roll: roll,
                                rollMode: game.settings.get("core", "rollMode"),
                                content: await roll.render(),
                                sound: CONFIG.sounds.dice,
                                flags: {
                                    core: {
                                        initiator: game.user.id,
                                        canPopout: true
                                    }
                                }
                            };
    
                            return ChatMessage.create(chatData);
                        } catch (err) {
                            console.error(err);
                            return originalProcessMessage.call(this, message);
                        }
                    }
                    
                    // 일반 메시지 처리
                    const chatData = {
                        user: game.user.id,
                        speaker: speaker,
                        content: message,
                        type: CONST.CHAT_MESSAGE_TYPES.IC
                    };
                    return ChatMessage.create(chatData);
                };
            }
        } else {
            log("ChatSelector | Resetting to default");
            
            // 기본 상태로 완전히 복구
            const originalProcessMessage = ui.chat.constructor.prototype.processMessage;
            ui.chat.processMessage = originalProcessMessage;
            delete ChatMessage.implementation.prototype._getChatSpeakerData;
        }
    }

    static _updateCharacterList() {
        log("ChatSelector | Updating character list");
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
        log("ChatSelector | Updating selector");
        const existingSelector = document.querySelector('.character-chat-selector');
        if (existingSelector) {
            log("ChatSelector | Removing existing selector");
            existingSelector.remove();
        }

        if (game.settings.get('character-chat-selector', this.SETTINGS.SHOW_SELECTOR)) {
            log("ChatSelector | Creating new selector");
            this._createSelector();
        }
    }

    static async _getMessageImage(message) {
        log("_getMessageImage 시작:", message);
    
        // 화자가 선택되어 있지 않은 경우 (기본 상태)
        if (!message.speaker?.actor) {
            const user = message.author || message.user;
            log("사용자 정보:", user);
    
            if (user?.avatar) {
                log("사용자 아바타 반환:", user.avatar);
                return user.avatar;
            } else {
                console.warn("사용자 아바타를 찾을 수 없음:", message.author);
            }
        }
    
        // 토큰 모드로 설정된 경우
        const speakAsToken = game.settings.get('character-chat-selector', this.SETTINGS.SPEAK_AS_TOKEN);
        log("토큰으로 말하기 모드:", speakAsToken);
    
        if (speakAsToken) {
            const tokenImg = await this._getTokenImage(message.speaker);
            log("토큰 이미지 검색 결과:", tokenImg);
    
            if (tokenImg) return tokenImg;
        }
    
        // 선택된 액터의 이미지
        const actor = game.actors.get(message.speaker.actor);
        log("선택된 액터:", actor);
    
        if (actor?.img) {
            log("액터 이미지 반환:", actor.img);
            return actor.img;
        }
    
        // 모든 것이 실패하면 플레이어 아바타로 폴백
        const fallbackAvatar = game.users.get(message.author || message.user)?.avatar || 'icons/svg/mystery-man.svg';
        log("폴백 아바타:", fallbackAvatar);
        return fallbackAvatar;
    }

    static async _getTokenImage(speaker) {
        log("Getting token image for speaker:", speaker);
        
        let tokenImg = null;
        
        // 1. 실제 토큰 확인
        if (speaker.token) {
            log("Speaker has token ID:", speaker.token);
            
            // 현재 씬의 활성 토큰 확인
            const activeToken = canvas.tokens?.placeables.find(t => t.id === speaker.token);
            if (activeToken) {
                log("Found active token:", activeToken);
                tokenImg = activeToken.document.texture.src || activeToken.document.img;
                log("Active token image:", tokenImg);
            }
    
            // 지정된 씬의 토큰 확인
            if (!tokenImg) {
                const scene = game.scenes.get(speaker.scene || canvas.scene?.id);
                if (scene) {
                    const tokenDoc = scene.tokens.get(speaker.token);
                    if (tokenDoc) {
                        log("Found token document:", tokenDoc);
                        tokenImg = tokenDoc.texture?.src || tokenDoc.img;
                        log("Token document image:", tokenImg);
                    }
                }
            }
        }
    
   // 2. 프로토타입 토큰 이미지 확인
            if (!tokenImg && speaker.actor) {
                log("Checking prototype token for actor:", speaker.actor);
                const actor = game.actors.get(speaker.actor);
                if (actor) {
                    const prototypeToken = actor.prototypeToken;
                    if (prototypeToken) {
                        log("Found prototype token:", prototypeToken);
                        tokenImg = prototypeToken.texture?.src || prototypeToken.img || actor.img;
                        log("Prototype token image:", tokenImg);
                    }
                }
            }

            log("Final token image result:", tokenImg);
            return tokenImg;
        }

        static async _addPortraitToMessage(message, html, data) {
            if (!game.settings.get('character-chat-selector', this.SETTINGS.SHOW_PORTRAIT)) return;

            log("Checking message:", {
                type: message.type,
                style: message.style,
                content: message.content,
                speaker: message.speaker
            });
            
            // 포트레이트를 표시할 메시지 스타일
            const validStyles = [
                1,  // 일반 채팅
                2,  // 귓속말
                3,  // 굴림
                4,  // 기타
            ];
        
            // 설정이 꺼져있거나 유효하지 않은 메시지 스타일이면 중단
            if (!game.settings.get('character-chat-selector', this.SETTINGS.SHOW_PORTRAIT)) {
                log("Portrait display is disabled");
                return;
            }
            
            if (!validStyles.includes(message.style)) {
                log("Invalid message style:", message.style);
                return;
            }
        
            const speaker = message.speaker;
            if (!speaker) {
                log("No speaker found");
                return;
            }
         
            const header = html.find('.message-header');
            if (!header.length) return;
         
            // 설정값 가져오기
            const portraitSize = game.settings.get('character-chat-selector', this.SETTINGS.PORTRAIT_SIZE);
            const borderStyle = game.settings.get('character-chat-selector', this.SETTINGS.PORTRAIT_BORDER);
            const useUserColor = game.settings.get('character-chat-selector', this.SETTINGS.USE_USER_COLOR);
            const speakAsToken = game.settings.get('character-chat-selector', this.SETTINGS.SPEAK_AS_TOKEN);
         
            // 이미지 소스 가져오기
            log("Message speaker:", message.speaker);
            log("Speak as token setting:", speakAsToken);
            
            const imgSrc = await this._getMessageImage(message);
            if (!imgSrc) return;
         
            // 초상화 컨테이너 생성
            const portraitContainer = document.createElement('div');
            portraitContainer.classList.add('chat-portrait-container');
            portraitContainer.style.setProperty('--portrait-size', `${portraitSize}px`);
         
            // 초상화 이미지 생성
            const img = document.createElement('img');
            img.src = imgSrc;
            img.classList.add('chat-portrait');
         
            // 스타일 적용
            portraitContainer.classList.add(`portrait-${borderStyle}`);
         
            // CSS 변수 설정
            const primaryColor = useUserColor ? 
                (message.author?.color || message.user?.color || '#4b4a44') : 
                game.settings.get('character-chat-selector', this.SETTINGS.PORTRAIT_BORDER_COLOR);
            
            const useSecondaryColor = game.settings.get('character-chat-selector', this.SETTINGS.USE_SECONDARY_COLOR);
            const useGlowEffect = game.settings.get('character-chat-selector', this.SETTINGS.USE_GLOW_EFFECT);
         
            portraitContainer.style.setProperty('--primary-color', primaryColor);
            portraitContainer.style.setProperty('--secondary-color', useSecondaryColor ? 
                game.settings.get('character-chat-selector', this.SETTINGS.SECONDARY_COLOR) : primaryColor);
            portraitContainer.style.setProperty('--glow-color', useGlowEffect ? 
                game.settings.get('character-chat-selector', this.SETTINGS.GLOW_COLOR) : 'transparent');
            portraitContainer.style.setProperty('--glow-strength', useGlowEffect ? 
                `${game.settings.get('character-chat-selector', this.SETTINGS.GLOW_STRENGTH)}px` : '0');
         
            // 이벤트 리스너 추가
            portraitContainer.addEventListener('click', async () => {
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
         
            // 메시지에 포트레잇 추가
            header.prepend(portraitContainer);
         
            // 채팅 메시지 테두리 색상
            const useUserBorder = game.settings.get('character-chat-selector', this.SETTINGS.USE_USER_BORDER);
            const chatBorderColor = useUserBorder ? 
                (message.author?.color || message.user?.color || game.settings.get('character-chat-selector', this.SETTINGS.CHAT_BORDER_COLOR)) : 
                game.settings.get('character-chat-selector', this.SETTINGS.CHAT_BORDER_COLOR);
         
            const messageElement = html[0];
            messageElement.style.borderColor = chatBorderColor;
         
            // HP Tint Effect 설정
            const hookId = HpTintEffect.applyTintToPortrait(portraitContainer, message);
            
            // 메시지가 삭제될 때 훅 정리
            if (hookId) {
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        if (!document.contains(messageElement)) {
                            Hooks.off('updateActor', hookId);
                            observer.disconnect();
                        }
                    });
                });
         
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
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
