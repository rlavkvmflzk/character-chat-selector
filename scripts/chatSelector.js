import { HpTintEffect } from './hpTintEffect.js';
import { Dnd5ePortraitHandler } from './dnd5ePortraitHandler.js';
import { HotkeyManager } from './hotkeyManager.js';
import { RubyTextHandler } from './rubyTextHandler.js';

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
        CHAT_BORDER_COLOR: 'chatBorderColor',
        HIDE_DND5E_PORTRAIT: 'hideDnd5ePortrait',
        ALLOWED_MODULE_FLAGS: 'allowedModuleFlags',
    };

    static initialize() {
        this.registerSettings();

        Hooks.once('ready', () => {
            if (game.settings.get('character-chat-selector', this.SETTINGS.SHOW_SELECTOR)) {
                this._createSelector();
            }
                this._updateDropdownStyles();
        });

        Hooks.once('ready', () => {
            if (game.settings.get('character-chat-selector', this.SETTINGS.SHOW_SELECTOR)) {
                this._createSelector();
            }
            this._updateDropdownStyles();
            
            // 초기 processMessage 설정
            this._onCharacterSelect({ target: { value: '' } });
        });

            // 캐릭터 이름으로 찾기 시작
            Hooks.on("chatMessage", (chatLog, messageText, chatData) => {
                if (messageText.startsWith("/c") || messageText.startsWith("!")) {
                    const isSlashCommand = messageText.startsWith("/c");
                    const searchTerm = isSlashCommand ? 
                        messageText.slice(2).trim() : 
                        messageText.slice(1).trim();
                    
                    if (!searchTerm) {
                        ui.notifications.warn(game.i18n.localize("CHATSELECTOR.Warnings.NoName"));
                        return false;
                    }
            
                    const availableActors = game.actors.filter(actor => {
                        if (game.user.isGM) return true;
                        return actor.ownership[game.user.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
                    });
            
                    const bestMatch = this._findBestMatch(searchTerm, availableActors);
            
                    if (bestMatch) {
                        // 실제 select 엘리먼트 업데이트
                        const select = document.querySelector('.character-select');
                        const customSelect = document.querySelector('.custom-select');
                        if (select && customSelect) {
                            // 기본 select 값 변경
                            select.value = bestMatch.id;
                            
                            // 커스텀 UI 업데이트
                            const selectedDiv = customSelect.querySelector('.select-selected');
                            if (selectedDiv) {
                                selectedDiv.textContent = bestMatch.name;
                            }
            
                            // 이벤트 발생
                            const event = { target: { value: bestMatch.id } };
                            this._onCharacterSelect(event);
                            
                            ui.notifications.info(game.i18n.format("CHATSELECTOR.Info.CharacterChanged", {
                                name: bestMatch.name
                            }));
                        }
                    } else {
                        ui.notifications.warn(game.i18n.localize("CHATSELECTOR.Warnings.NoMatch"));
                    }
            
                    return false;
                }
                return true;
            });

        // 액터 변경 감지
        Hooks.on('createActor', () => {
            this._updateCharacterList();
        });
        Hooks.on('deleteActor', () => {
            this._updateCharacterList();
        });
        Hooks.on('updateActor', () => {
            this._updateCharacterList();
        });

        // 채팅 메시지 렌더링 훅 추가
        Hooks.on('renderChatMessage', (message, html, data) => {
            this._addPortraitToMessage(message, html, data);
        });

        HpTintEffect.initialize();
        HpTintEffect.injectStyles();
        if (game.system.id === 'dnd5e') {
            Dnd5ePortraitHandler.initialize();
        }
        RubyTextHandler.initialize();
    }

    static registerSettings() {
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

        game.settings.register('character-chat-selector', this.SETTINGS.HIDE_DND5E_PORTRAIT, {
            name: "Hide D&D5e Portrait",
            hint: "Hides the default D&D5e chat portrait if enabled",
            scope: 'client',
            config: true,
            type: Boolean,
            default: false,
            onChange: () => {
                // 설정 변경 시 채팅 메시지 스타일 업데이트
                this._updateChatStyles();
            }
        });

        game.settings.register('character-chat-selector', this.SETTINGS.ALLOWED_MODULE_FLAGS, {
            name: game.i18n.localize('CHATSELECTOR.Settings.AllowedModuleFlags.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.AllowedModuleFlags.Hint'),
            scope: 'world',
            config: true,
            type: String,
            default: 'foundryvtt-simple-calendar,chatedit,theatre',
            onChange: () => {
                ui.notifications.warn(game.i18n.localize('CHATSELECTOR.Settings.ReloadRequired'), {permanent: true});
            }
        });

        // 드롭다운 스타일 설정
        ColorPicker.register('character-chat-selector', 'dropdownBackground', {
            name: game.i18n.localize('CHATSELECTOR.Settings.DropdownBackground.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.DropdownBackground.Hint'),
            scope: 'client',
            config: true,
            default: '#000000B3', // rgba(0, 0, 0, 0.7)
        }, {
            format: 'hexa',
            alphaChannel: true,
            preview: true
        });
    
        ColorPicker.register('character-chat-selector', 'dropdownTextColor', {
            name: game.i18n.localize('CHATSELECTOR.Settings.DropdownTextColor.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.DropdownTextColor.Hint'),
            scope: 'client',
            config: true,
            default: '#f0f0f0FF',
        }, {
            format: 'hexa',
            alphaChannel: true,
            preview: true
        });
    
        ColorPicker.register('character-chat-selector', 'dropdownBorderColor', {
            name: game.i18n.localize('CHATSELECTOR.Settings.DropdownBorderColor.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.DropdownBorderColor.Hint'),
            scope: 'client',
            config: true,
            default: '#7a7971FF',
        }, {
            format: 'hexa',
            alphaChannel: true,
            preview: true
        });
    
        ColorPicker.register('character-chat-selector', 'dropdownHoverColor', {
            name: game.i18n.localize('CHATSELECTOR.Settings.DropdownHoverColor.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.DropdownHoverColor.Hint'),
            scope: 'client',
            config: true,
            default: '#FFFFFF1A', // rgba(255, 255, 255, 0.1)
        }, {
            format: 'hexa',
            alphaChannel: true,
            preview: true
        });
    
        // 썸네일 프리뷰 활성화 설정
        game.settings.register('character-chat-selector', 'enableThumbnailPreview', {
            name: game.i18n.localize('CHATSELECTOR.Settings.EnableThumbnailPreview.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.EnableThumbnailPreview.Hint'),
            scope: 'client',
            config: true,
            type: Boolean,
            default: true,
            onChange: () => this._updateDropdownStyles()
        });
}

    static _createSelector() {
        const chatControls = document.querySelector("#chat-controls");
        if (!chatControls) {
            console.error("ChatSelector | Chat controls not found");
            return;
        }
        
        if (document.querySelector('.character-chat-selector')) {
            return;
        }
    
        const currentSpeaker = ChatMessage.getSpeaker();
    
        const selectorHtml = `
        <div class="character-chat-selector">
            <select class="character-select" style="display: none;">
                <option value="">${game.i18n.localize("CHATSELECTOR.Default")}</option>
                ${this._getCharacterOptions(currentSpeaker.actor)}
            </select>
            <div class="custom-select">
                <div class="select-selected">${game.i18n.localize("CHATSELECTOR.Default")}</div>
                <div class="select-items">
                    <div class="select-item" data-value="">
                        <span>${game.i18n.localize("CHATSELECTOR.Default")}</span>
                    </div>
                    ${this._getCharacterOptions(currentSpeaker.actor)}
                </div>
            </div>
            <button class="refresh-characters" title="${game.i18n.localize("CHATSELECTOR.RefreshList")}">
                <i class="fas fa-sync"></i>
            </button>
            <button class="configure-hotkeys" title="${game.i18n.localize("CHATSELECTOR.ConfigureHotkeys")}">
                <i class="fas fa-keyboard"></i>
            </button>
        </div>
    `;
    
        chatControls.insertAdjacentHTML('beforeend', selectorHtml);
        this._addEventListeners();
    }

    static _getCharacterOptions(currentActorId) {        
        const actors = game.actors
            .filter(actor => {
                if (game.user.isGM) return true;
                return actor.ownership[game.user.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
            })
            .sort((a, b) => a.name.localeCompare(b.name));
        
        return actors
            .map(a => `
                <div class="select-item ${a.id === currentActorId ? 'selected' : ''}" 
                    data-value="${a.id}">
                    <img class="actor-thumbnail" src="${a.img}" alt="${a.name}">
                    <span>${a.name}</span>
                </div>
            `)
            .join('');
    }

    static _addEventListeners() {
        const selectDiv = document.querySelector('.custom-select');
        const selected = selectDiv?.querySelector('.select-selected');
        const itemsDiv = selectDiv?.querySelector('.select-items');
        const refreshButton = document.querySelector('.refresh-characters');
    
        if (selected) {
            selected.addEventListener('click', () => {
                itemsDiv?.classList.toggle('show');
            });
        }
    
        if (itemsDiv) {
            itemsDiv.querySelectorAll('.select-item').forEach(item => {
                // 썸네일 미리보기 요소 생성
                const thumbnail = item.querySelector('.actor-thumbnail');
                if (thumbnail) {
                    const preview = document.createElement('div');
                    preview.className = 'thumbnail-preview';
                    const previewImg = document.createElement('img');
                    previewImg.src = thumbnail.src;
                    preview.appendChild(previewImg);
                    item.appendChild(preview);
    
                    // 마우스 진입 시 위치 계산 및 조정
                    item.addEventListener('mouseenter', (e) => {
                        const itemRect = item.getBoundingClientRect();
                        const previewRect = preview.getBoundingClientRect();
                        const viewportHeight = window.innerHeight;
                        const viewportWidth = window.innerWidth;
                        
                        // 미리보기의 기본 위치 계산
                        let top = itemRect.top + (itemRect.height - 150) / 2; // 150은 미리보기 높이
                        
                        // 화면 하단을 벗어나는 경우
                        if (top + 150 > viewportHeight) {
                            top = viewportHeight - 160; // 10px 여백
                        }
                        
                        // 화면 상단을 벗어나는 경우
                        if (top < 10) {
                            top = 10;
                        }
                        
                        // 좌우 위치 결정
                        let left = itemRect.right + 10;
                        if (left + 150 > viewportWidth) {
                            left = itemRect.left - 160; // 미리보기 너비 + 여백
                        }
                        
                        preview.style.top = `${top}px`;
                        preview.style.left = `${left}px`;
                    });
                }
    
                item.addEventListener('click', () => {
                    const value = item.dataset.value;
                    const text = item.querySelector('span').textContent;
                    selected.textContent = text;
                    itemsDiv.classList.remove('show');
                    this._onCharacterSelect({ target: { value } });
                });
            });
        }
        
        const configureButton = document.querySelector('.configure-hotkeys');
        if (configureButton) {
            configureButton.addEventListener('click', () => {
                HotkeyManager.showConfig();
            });
        }
        
        document.addEventListener('click', (e) => {
            if (!selectDiv?.contains(e.target)) {
                itemsDiv?.classList.remove('show');
            }
        });
    
        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                this._updateCharacterList();
            });
        }
    }

    static async _onCharacterSelect(event) {
        const actorId = event.target.value;
        const originalProcessMessage = ui.chat.processMessage;
        
        ui.chat.processMessage = async function(message) {
            if (message.startsWith("/c") || message.startsWith("!")) {
                return ChatLog.prototype.processMessage.call(this, message);
            }
    
            const processedMessage = RubyTextHandler.processMessage(message);
    
            if (!actorId) {
                const speaker = ChatMessage.getSpeaker();
                
                if (message.startsWith('/')) {
                    return originalProcessMessage.call(this, message);
                }
                
                return ChatMessage.create({
                    user: game.user.id,
                    speaker: speaker,
                    content: processedMessage,
                    type: CONST.CHAT_MESSAGE_TYPES.IC
                });
            }
    
            // 특정 액터가 선택된 경우의 기존 처리
            const actor = game.actors.get(actorId);
            if (!actor) return;
            
            const speakAsToken = game.settings.get('character-chat-selector', 'speakAsToken');
            const tokenData = actor.prototypeToken;
            
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
    
                if (message.startsWith('/ooc ')) {
                    const oocText = message.slice(5);
                    return ChatMessage.create({
                        user: game.user.id,
                        content: RubyTextHandler.processMessage(oocText),
                        type: CONST.CHAT_MESSAGE_TYPES.OOC
                    });
                }
    
                if (message.startsWith('/w ') || message.startsWith('/whisper ')) {
                    const parts = message.slice(message.indexOf(' ') + 1).split(' ');
                    const target = parts[0];
                    const whisperText = parts.slice(1).join(' ');
                    return ChatMessage.create({
                        user: game.user.id,
                        content: RubyTextHandler.processMessage(whisperText),
                        type: CONST.CHAT_MESSAGE_TYPES.WHISPER,
                        whisper: game.users.filter(u => u.name === target).map(u => u.id)
                    });
                }
    
                if (message.startsWith('/gm ')) {
                    const gmText = message.slice(4);
                    return ChatMessage.create({
                        user: game.user.id,
                        content: RubyTextHandler.processMessage(gmText),
                        type: CONST.CHAT_MESSAGE_TYPES.WHISPER,
                        whisper: game.users.filter(u => u.isGM).map(u => u.id)
                    });
                }
    
                if (message.startsWith('/emote ') || message.startsWith('/em ') || message.startsWith('/me ')) {
                    const cmdLength = message.startsWith('/emote ') ? 7 : 4;
                    const emoteText = message.slice(cmdLength);
                    const processedEmoteText = RubyTextHandler.processMessage(emoteText);
                    return ChatMessage.create({
                        user: game.user.id,
                        speaker: speaker,
                        content: `${speaker.alias} ${processedEmoteText}`,
                        type: CONST.CHAT_MESSAGE_TYPES.EMOTE
                    });
                }
    
                if (message.startsWith('/r') || message.startsWith('/roll') || 
                message.startsWith('/gmroll ') || message.startsWith('/gr ') ||
                message.startsWith('/blindroll ') || message.startsWith('/br ') ||
                message.startsWith('/selfroll ') || message.startsWith('/sr ')) {
                try {
                    let rollMode = "roll";
                    let whisperIds = [];
                    let rollData = "";
                    
                    if (message.startsWith('/gmroll ') || message.startsWith('/gr ')) {
                        rollMode = "gmroll";
                        whisperIds = game.users.filter(u => u.isGM).map(u => u.id);
                        rollData = message.startsWith('/gr ') ? message.slice(4) : message.slice(8);
                    } else if (message.startsWith('/blindroll ') || message.startsWith('/br ')) {
                        rollMode = "blindroll";
                        whisperIds = game.users.filter(u => u.isGM).map(u => u.id);
                        rollData = message.startsWith('/br ') ? message.slice(4) : message.slice(10);
                    } else if (message.startsWith('/selfroll ') || message.startsWith('/sr ')) {
                        rollMode = "selfroll";
                        whisperIds = [game.user.id];
                        rollData = message.startsWith('/sr ') ? message.slice(4) : message.slice(10);
                    } else {
                        rollMode = game.settings.get("core", "rollMode");
                        rollData = message.startsWith('/r ') ? message.slice(3) : message.slice(6);
                        switch (rollMode) {
                            case "gmroll":
                            case "blindroll":
                                whisperIds = game.users.filter(u => u.isGM).map(u => u.id);
                                break;
                            case "selfroll":
                                whisperIds = [game.user.id];
                                break;
                        }
                    }
            
                    // 채팅 입력창 초기화를 먼저 함
                    ui.chat.element.find('#chat-message').val('');
            
                    (async () => {
                        const roll = new Roll(rollData.trim());
                        await roll.evaluate({async: true});
                        
                        if (game.dice3d) {
                            await game.dice3d.showForRoll(roll);
                        }
            
                        const chatData = {
                            user: game.user.id,
                            speaker: speaker,
                            type: CONST.CHAT_MESSAGE_TYPES.ROLL,
                            roll: roll,
                            rollMode: rollMode,
                            content: await roll.render(),
                            sound: CONFIG.sounds.dice,
                            flags: {
                                core: {
                                    initiator: game.user.id,
                                    canPopout: true
                                }
                            }
                        };
            
                        if (whisperIds.length > 0) {
                            chatData.whisper = whisperIds;
                        }
            
                        await ChatMessage.create(chatData);
                    })();
            
                    return true;
                } catch (err) {
                    console.error("Roll error:", err);
                    ui.notifications.error("Invalid roll formula");
                    return null;
                }
            }
    
                if (message.startsWith('/')) {
                    return originalProcessMessage.call(this, message);
                }
                
                return ChatMessage.create({
                    user: game.user.id,
                    speaker: speaker,
                    content: processedMessage,
                    type: CONST.CHAT_MESSAGE_TYPES.IC
                });
            };
        } 

    static _updateCharacterList() {
        const select = document.querySelector('.character-select');
        if (!select) {
            return;
        }

        const currentValue = select.value;
        select.innerHTML = `
            <option value="">${game.i18n.localize("CHATSELECTOR.Default")}</option>
            ${this._getCharacterOptions(currentValue)}
        `;
        select.value = currentValue;
    }

    static updateSelector() {
        const existingSelector = document.querySelector('.character-chat-selector');
        if (existingSelector) {
            existingSelector.remove();
        }

        if (game.settings.get('character-chat-selector', this.SETTINGS.SHOW_SELECTOR)) {
            this._createSelector();
        }
    }

    static async _getMessageImage(message) {
    
        // 화자가 선택되어 있지 않은 경우 (기본 상태)
        if (!message.speaker?.actor) {
            const user = message.author || message.user;
    
            if (user?.avatar) {
                return user.avatar;
            } else {
                console.warn("사용자 아바타를 찾을 수 없음:", message.author);
            }
        }
    
        // 토큰 모드로 설정된 경우
        const speakAsToken = game.settings.get('character-chat-selector', this.SETTINGS.SPEAK_AS_TOKEN);
    
        if (speakAsToken) {
            const tokenImg = await this._getTokenImage(message.speaker);
    
            if (tokenImg) return tokenImg;
        }
    
        // 선택된 액터의 이미지
        const actor = game.actors.get(message.speaker.actor);
    
        if (actor?.img) {
            return actor.img;
        }
    
        // 모든 것이 실패하면 플레이어 아바타로 폴백
        const fallbackAvatar = game.users.get(message.author || message.user)?.avatar || 'icons/svg/mystery-man.svg';
        return fallbackAvatar;
    }

    static async _getTokenImage(speaker) {
        
        let tokenImg = null;
        
        // 1. 실제 토큰 확인
        if (speaker.token) {
            
            // 현재 씬의 활성 토큰 확인
            const activeToken = canvas.tokens?.placeables.find(t => t.id === speaker.token);
            if (activeToken) {
                tokenImg = activeToken.document.texture.src || activeToken.document.img;
            }
    
            // 지정된 씬의 토큰 확인
            if (!tokenImg) {
                const scene = game.scenes.get(speaker.scene || canvas.scene?.id);
                if (scene) {
                    const tokenDoc = scene.tokens.get(speaker.token);
                    if (tokenDoc) {
                        tokenImg = tokenDoc.texture?.src || tokenDoc.img;
                    }
                }
            }
        }
    
   // 2. 프로토타입 토큰 이미지 확인
            if (!tokenImg && speaker.actor) {
                const actor = game.actors.get(speaker.actor);
                if (actor) {
                    const prototypeToken = actor.prototypeToken;
                    if (prototypeToken) {
                        tokenImg = prototypeToken.texture?.src || prototypeToken.img || actor.img;
                    }
                }
            }

            return tokenImg;
        }
        
        static async _addPortraitToMessage(message, html, data) {
            if (!game.settings.get('character-chat-selector', this.SETTINGS.SHOW_PORTRAIT)) return;

            const messageStyle = game.version.startsWith('12') ? message.style : message.type;

                // 허용된 모듈 플래그 목록 가져오기
            const allowedFlags = game.settings
                .get('character-chat-selector', this.SETTINGS.ALLOWED_MODULE_FLAGS)
                .split(',')
                .map(flag => flag.trim());

            // 메시지에 플래그가 있는지 확인하고, 허용되지 않은 모듈의 플래그인 경우 포트레잇 추가하지 않음
            if (message.flags) {
                const messageFlags = Object.keys(message.flags).filter(flag => 
                    flag !== 'core' && 
                    flag !== 'character-chat-selector'
                );
                
                // 허용되지 않은 모듈의 플래그가 있는 경우 포트레잇 추가하지 않음
                if (messageFlags.length > 0 && 
                    !messageFlags.some(flag => allowedFlags.includes(flag))) {
                    return;
                }
            }

            // 모듈에서 처리하는 메시지 타입인지 확인
            const isOurMessage = 
                (messageStyle === CONST.CHAT_MESSAGE_TYPES.IC) ||
                (messageStyle === CONST.CHAT_MESSAGE_TYPES.EMOTE) ||
                (messageStyle === CONST.CHAT_MESSAGE_TYPES.OOC) ||
                (messageStyle === CONST.CHAT_MESSAGE_TYPES.ROLL && !message.flags?.["core"]?.external) ||
                (messageStyle === CONST.CHAT_MESSAGE_TYPES.WHISPER);
        
            if (!isOurMessage) return;
        
            const speaker = message.speaker;
            if (!speaker) return;
        
            const header = html.find('.message-header');
            if (!header.length) return;
         
            // 설정값 가져오기
            const portraitSize = game.settings.get('character-chat-selector', this.SETTINGS.PORTRAIT_SIZE);
            const borderStyle = game.settings.get('character-chat-selector', this.SETTINGS.PORTRAIT_BORDER);
            const useUserColor = game.settings.get('character-chat-selector', this.SETTINGS.USE_USER_COLOR);
            const speakAsToken = game.settings.get('character-chat-selector', this.SETTINGS.SPEAK_AS_TOKEN);
         
            // 이미지 소스 가져오기     
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

    // 빠른 바꾸기 이름 매칭
    static _findBestMatch(searchTerm, actors) {
        const koreanConsonants = {
            'ㄱ': '[가-깋]',
            'ㄴ': '[나-닣]',
            'ㄷ': '[다-딯]',
            'ㄹ': '[라-맇]',
            'ㅁ': '[마-밓]',
            'ㅂ': '[바-빟]',
            'ㅅ': '[사-싷]',
            'ㅇ': '[아-잏]',
            'ㅈ': '[자-짛]',
            'ㅊ': '[차-칳]',
            'ㅋ': '[카-킿]',
            'ㅌ': '[타-팋]',
            'ㅍ': '[파-핗]',
            'ㅎ': '[하-힣]'
        };
    
        let searchPattern = searchTerm.split('').map(char => {
            return koreanConsonants[char] || char;
        }).join('.*');
    
        let bestMatch = null;
        let bestScore = Infinity;
        const searchTermLower = searchTerm.toLowerCase();
        const searchRegex = new RegExp(searchPattern, 'i');
    
        actors.forEach(actor => {
            const nameLower = actor.name.toLowerCase();
            let score = 10;  
            
            if (nameLower.startsWith(searchTermLower)) {
                score = 0;
            }
            else if (nameLower.split(' ').some(word => word.startsWith(searchTermLower))) {
                score = 1;
            }
            else if (searchRegex.test(actor.name)) {
                score = 2;
            }
            else if (nameLower.includes(searchTermLower)) {
                score = 3;
            }
            else {
                score = this._getLevenshteinDistance(searchTermLower, nameLower);
                score = score / Math.max(nameLower.length, searchTermLower.length) * 10;
            }
    
            const lengthDiff = Math.abs(nameLower.length - searchTermLower.length);
            score += lengthDiff * 0.1;
    
            if (score < bestScore) {
                bestScore = score;
                bestMatch = actor;
            }
        });
    
        return bestScore < 3 ? bestMatch : null;
    }

    static _getLevenshteinDistance(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
    
        const matrix = [];
    
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
    
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i-1) === a.charAt(j-1)) {
                    matrix[i][j] = matrix[i-1][j-1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i-1][j-1] + 1,  
                        matrix[i][j-1] + 1,   
                        matrix[i-1][j] + 1     
                    );
                }
            }
        }
    
        return matrix[b.length][a.length];
    }
    
    static _updateDropdownStyles() {
        const styleId = 'character-selector-custom-styles';
        let styleElement = document.getElementById(styleId);
        
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = styleId;
            document.head.appendChild(styleElement);
        }
    
        const backgroundColor = game.settings.get('character-chat-selector', 'dropdownBackground');
        const textColor = game.settings.get('character-chat-selector', 'dropdownTextColor');
        const borderColor = game.settings.get('character-chat-selector', 'dropdownBorderColor');
        const hoverColor = game.settings.get('character-chat-selector', 'dropdownHoverColor');
        const enableThumbnail = game.settings.get('character-chat-selector', 'enableThumbnailPreview');
    
        styleElement.textContent = `
            .select-items {
                background: ${backgroundColor};
                border-color: ${borderColor};
                color: ${textColor};
            }
            
            .select-selected {
                background: ${backgroundColor};
                border-color: ${borderColor};
                color: ${textColor};
            }
            
            .select-item {
                color: ${textColor};
            }
            
            .select-item:hover {
                background-color: ${hoverColor};
            }
    
            .thumbnail-preview {
                display: ${enableThumbnail ? 'none' : 'none !important'};
            }
        `;
    }
}