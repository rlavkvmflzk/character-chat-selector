import { HpTintEffect } from './hpTintEffect.js';
import { Dnd5ePortraitHandler } from './dnd5ePortraitHandler.js';
import { HotkeyManager } from './hotkeyManager.js';
import { RubyTextHandler } from './rubyTextHandler.js';
import { ChatAutocomplete } from './chatAutocomplete.js';
import { ChatOptimizer } from './chatOptimizer.js';
import { ChatNotification } from './chatNotification.js';
import { ChatSelectorConfig } from './chatSelectorConfig.js'; 
import { Wfrp4ePortraitHandler } from './wfrp4ePortraitHandler.js';

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
        FACTORY_RESET: 'factoryReset'
    };

    // 원본 함수 저장용 변수
    static originalProcessMessage = null;

    static initialize() {
        this.registerSettings();

        Hooks.once('ready', () => {
            if (ui.chat && !this.originalProcessMessage) {
                console.log("ChatSelector | Saving ORIGINAL processMessage (Ready)");
                this.originalProcessMessage = ui.chat.processMessage;
            } else if (!ui.chat) {
                console.error("ChatSelector | CRITICAL: ui.chat is undefined even in ready hook!");
            }

            // 2. UI 생성
            if (game.settings.get('character-chat-selector', this.SETTINGS.SHOW_SELECTOR)) {
                this._createSelector();
                this._updateSelectorVisibility();
            }
            this._updateDropdownStyles();

            // 3. 초기 선택값 로드 (원본 함수 저장 후 실행)
            this.selectActor("");
        });

        Hooks.on("collapseSidebar", (sidebar, collapsed) => {
            // sidebar 인스턴스에서 직접 탭 정보를 가져와 전달하여 타이밍 이슈 방지
            this._updateSelectorVisibility(sidebar.activeTab, collapsed);
        });

        Hooks.on("changeSidebarTab", (app) => {
            this._updateSelectorVisibility(app.tabName, null);
        });

        Hooks.on("chatMessage", (chatLog, messageText, chatData) => {
            if (messageText.startsWith("/c") || messageText.startsWith("!")) {
                const isSlashCommand = messageText.startsWith("/c");
                const searchTerm = isSlashCommand ?
                    messageText.slice(2).trim() :
                    messageText.slice(1).trim();

                console.log(`ChatSelector | Command detected: ${searchTerm}`); // DEBUG

                const lowerTerm = searchTerm.toLowerCase();
                if (!searchTerm || lowerTerm === 'default' || lowerTerm === '기본' || lowerTerm === 'reset') {
                    console.log("ChatSelector | Resetting to Default via command"); // DEBUG
                    this.selectActor("");
                    return false;
                }

                const availableActors = ChatAutocomplete.actors;
                const bestMatch = this._findBestMatch(searchTerm, availableActors);

                if (bestMatch) {
                    console.log(`ChatSelector | Match found via command: ${bestMatch.name}`); // DEBUG
                    this.selectActor(bestMatch.id);
                } else {
                    ui.notifications.warn(game.i18n.localize("CHATSELECTOR.Warnings.NoMatch"));
                }
                return false;
            }
            return true;
        });

        Hooks.on('createActor', () => this.refreshSelector());
        Hooks.on('deleteActor', () => this.refreshSelector());
        Hooks.on('updateActor', (actor, changes) => {
            if (changes.name || changes.ownership) this.refreshSelector();
        });

        Hooks.on('renderChatMessageHTML', (message, html, data) => {
            this._addPortraitToMessage(message, html, data);
        });

        HpTintEffect.initialize();
        HpTintEffect.injectStyles();
        
        // 시스템별 핸들러 초기화
        if (game.system.id === 'dnd5e') {
            Dnd5ePortraitHandler.initialize();
        }
        if (game.system.id === 'wfrp4e') { 
            Wfrp4ePortraitHandler.initialize();
        }
        
        RubyTextHandler.initialize();

        this.tempCharacter = null;
    }

    // 통합 선택 로직
    static selectActor(actorId) {
        console.log(`ChatSelector | selectActor called with ID: '${actorId}'`); // DEBUG

        const select = document.querySelector('.character-select');
        const customSelect = document.querySelector('.custom-select');

        // 1. 기능 변경 실행
        const event = { target: { value: actorId } };
        this._onCharacterSelect(event);

        // 2. UI 동기화
        if (select && customSelect) {
            select.value = actorId;

            let actorName = game.i18n.localize("CHATSELECTOR.Default");
            if (actorId) {
                const actor = ChatAutocomplete.actors.find(a => a.id === actorId);
                if (actor) actorName = actor.name;
            }

            const selectedDiv = customSelect.querySelector('.select-selected');
            if (selectedDiv) selectedDiv.textContent = actorName;

            customSelect.querySelectorAll('.select-item').forEach(item => {
                if (item.dataset.value === actorId) item.classList.add('selected');
                else item.classList.remove('selected');
            });

            if (actorId !== "") {
                ui.notifications.info(game.i18n.format("CHATSELECTOR.Info.CharacterChanged", {
                    name: actorName
                }));
            }
        }
    }

    static async _onCharacterSelect(event) {
        const actorId = event.target.value;
        console.log(`ChatSelector | _onCharacterSelect processing for ID: '${actorId}'`); // DEBUG

        // 1. 원본으로 복구
        if (this.originalProcessMessage) {
            console.log("ChatSelector | Restoring ORIGINAL processMessage"); // DEBUG
            ui.chat.processMessage = this.originalProcessMessage;
        } else {
            console.warn("ChatSelector | Original processMessage missing! This should not happen if initialized correctly."); // DEBUG
            // 비상시 현재 함수라도 캡처 시도
            if (ui.chat && ui.chat.processMessage) this.originalProcessMessage = ui.chat.processMessage;
        }

        const originalFunc = this.originalProcessMessage;
        if (!originalFunc) return; // 안전장치

        if (actorId) {
            this.tempCharacter = null;
        }

        // 래퍼 함수 정의
        ui.chat.processMessage = async function (message) {
            const CHAT_STYLES = CONST.CHAT_MESSAGE_STYLES;

            if (message.startsWith("/c") || message.startsWith("!")) {
                return originalFunc.call(this, message);
            }

            if (message.startsWith("/as ")) {
                const asContent = message.slice(4).trim();
                if (!asContent) {
                    ChatSelector.tempCharacter = null;
                    ui.notifications.info(game.i18n.localize("CHATSELECTOR.Info.TempCharacterDisabled"));
                    return false;
                }
                const parts = asContent.split(' ');
                const tempName = parts[0];
                if (parts.length > 1) {
                    const messageContent = parts.slice(1).join(' ');
                    const processedMessage = RubyTextHandler.processMessage(messageContent);
                    ChatSelector.tempCharacter = { name: tempName, img: 'icons/svg/mystery-man.svg' };
                    return ChatMessage.create({
                        user: game.user.id,
                        speaker: { alias: tempName },
                        content: processedMessage,
                        style: CHAT_STYLES.IC
                    });
                } else {
                    ChatSelector.tempCharacter = { name: tempName, img: 'icons/svg/mystery-man.svg' };
                    ui.notifications.info(game.i18n.format("CHATSELECTOR.Info.TempCharacterEnabled", { name: tempName }));
                    return false;
                }
            }

            if (ChatSelector.tempCharacter) {
                if (!message.startsWith('/')) {
                    const processedMessage = RubyTextHandler.processMessage(message);
                    return ChatMessage.create({
                        user: game.user.id,
                        speaker: { alias: ChatSelector.tempCharacter.name },
                        content: processedMessage,
                        style: CHAT_STYLES.IC
                    });
                }
                if (message.startsWith('/emote ') || message.startsWith('/em ') || message.startsWith('/me ')) {
                    const cmdLength = message.startsWith('/emote ') ? 7 : 4;
                    const emoteText = message.slice(cmdLength);
                    return ChatMessage.create({
                        user: game.user.id,
                        speaker: speaker,
                        content: `${speaker.alias} ${RubyTextHandler.processMessage(emoteText)}`,
                        style: CHAT_STYLES.EMOTE
                    }, { chatBubble: true }); 
                }
            }

            // [Default 모드]
            if (!actorId) {
                const speaker = ChatMessage.getSpeaker();

                if (message.startsWith('/')) {
                    if (message.startsWith('/ooc ')) {
                        const oocText = message.slice(5);
                        return ChatMessage.create({
                            user: game.user.id,
                            speaker: speaker,
                            content: RubyTextHandler.processMessage(oocText),
                            style: CHAT_STYLES.OOC
                        });
                    }
                    if (message.startsWith('/w ') || message.startsWith('/whisper ')) {
                        const match = message.match(/^\/(?:w|whisper)\s+(?:["'\[](.*?)["'\]]|(\S+))\s+(.*)/);
                        if (match) {
                            const targetName = match[1] || match[2];
                            const whisperText = match[3];
                            const targets = game.users.filter(u => u.name === targetName);
                            if (targets.length > 0) {
                                return ChatMessage.create({
                                    user: game.user.id,
                                    speaker: speaker,
                                    content: RubyTextHandler.processMessage(whisperText),
                                    whisper: targets.map(u => u.id),
                                    style: CHAT_STYLES.WHISPER
                                });
                            }
                        }
                        return originalFunc.call(this, message);
                    }
                    if (message.startsWith('/gm ')) {
                        const gmText = message.slice(4);
                        return ChatMessage.create({
                            user: game.user.id,
                            speaker: speaker,
                            content: RubyTextHandler.processMessage(gmText),
                            whisper: game.users.filter(u => u.isGM).map(u => u.id),
                            style: CHAT_STYLES.WHISPER
                        });
                    }
                    if (message.startsWith('/emote ') || message.startsWith('/em ') || message.startsWith('/me ')) {
                        const cmdLength = message.startsWith('/emote ') ? 7 : 4;
                        const emoteText = message.slice(cmdLength);
                        return ChatMessage.create({
                            user: game.user.id,
                            speaker: speaker,
                            content: `${speaker.alias} ${RubyTextHandler.processMessage(emoteText)}`,
                            style: CHAT_STYLES.EMOTE
                        });
                    }
                    return originalFunc.call(this, message);
                }

                const processedMessage = RubyTextHandler.processMessage(message);
                return ChatMessage.create({
                    user: game.user.id,
                    speaker: speaker,
                    content: processedMessage,
                    style: CHAT_STYLES.IC
                }, { chatBubble: true }); 
            }

            // [Actor 모드]
            const actor = game.actors.get(actorId);
            if (!actor) return;

            const speakAsToken = game.settings.get('character-chat-selector', 'speakAsToken');

            // [핵심] 현재 씬에서 해당 액터와 연결된 토큰을 찾는 함수
            const getActiveToken = () => {
                if (!canvas.ready || !canvas.scene) return null;
                if (actor.isToken) return actor.token;

                // 1. 제어 중인 토큰 우선
                const controlled = canvas.tokens.controlled.find(t => t.document.actorId === actor.id);
                if (controlled) return controlled.document;

                // 2. 씬에 배치된 토큰 검색
                const found = canvas.tokens.placeables.find(t => t.document.actorId === actor.id || t.actor?.id === actor.id);
                return found ? found.document : null;
            };

            const activeToken = getActiveToken();

            //  speaker 객체 구성
            const speaker = {
                scene: game.scenes.current?.id,
                actor: actor.id,
                // 토큰 ID가 있어야 말풍선이 뜹니다.
                token: activeToken ? activeToken.id : null,
                alias: (speakAsToken && activeToken) ? activeToken.name : actor.name
            };

            if (message.startsWith('/ooc ')) {
                const oocText = message.slice(5);
                return ChatMessage.create({
                    user: game.user.id,
                    content: RubyTextHandler.processMessage(oocText),
                    style: CHAT_STYLES.OOC
                });
            }

            if (message.startsWith('/w ') || message.startsWith('/whisper ')) {
                const match = message.match(/^\/(?:w|whisper)\s+(?:["'\[](.*?)["'\]]|(\S+))\s+(.*)/);
                if (match) {
                    const targetName = match[1] || match[2];
                    const whisperText = match[3];
                    const targets = game.users.filter(u => u.name === targetName);
                    if (targets.length === 0) return originalFunc.call(this, message);

                    return ChatMessage.create({
                        user: game.user.id,
                        speaker: speaker,
                        content: RubyTextHandler.processMessage(whisperText),
                        whisper: targets.map(u => u.id),
                        style: CHAT_STYLES.WHISPER
                    });
                }
                return originalFunc.call(this, message);
            }

            if (message.startsWith('/gm ')) {
                const gmText = message.slice(4);
                return ChatMessage.create({
                    user: game.user.id,
                    speaker: speaker,
                    content: RubyTextHandler.processMessage(gmText),
                    whisper: game.users.filter(u => u.isGM).map(u => u.id),
                    style: CHAT_STYLES.WHISPER
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
                    style: CHAT_STYLES.EMOTE
                }, { chatBubble: true });
            }

            if (message.startsWith('/')) {
                return originalFunc.call(this, message);
            }

            const processedMessage = RubyTextHandler.processMessage(message);

            return ChatMessage.create({
                user: game.user.id,
                speaker: speaker,
                content: processedMessage,
                style: CHAT_STYLES.IC
            }, { chatBubble: true });
        };
    }

    static registerSettings() {
        // 1. 유일하게 표시될 설정 메뉴 버튼
        game.settings.registerMenu("character-chat-selector", "configMenu", {
            name: "CHATSELECTOR.Config.Title",
            label: "CHATSELECTOR.Config.Button",
            hint: "CHATSELECTOR.Config.Hint",
            icon: "fas fa-cogs",
            type: ChatSelectorConfig,
            restricted: false
        });

        // 2. 헬퍼 함수: 모든 설정을 config: false로 등록
        const registerHidden = (key, type, def, scope = 'client', extra = {}) => {
            game.settings.register('character-chat-selector', key, {
                scope: scope,
                config: false, 
                type: type,
                default: def,
                ...extra
            });
        };

        // --- General Settings ---
        registerHidden('allowPersonalThemes', Boolean, true, 'world');
        registerHidden(this.SETTINGS.SHOW_SELECTOR, Boolean, true, 'client', {
            onChange: () => {
                this.refreshSelector(); 
                this._updateSelectorVisibility();
            }
        });
        registerHidden(this.SETTINGS.SPEAK_AS_TOKEN, Boolean, false, 'client', {
            onChange: () => {
                const select = document.querySelector('.character-select');
                if (select && select.value) {
                    this._onCharacterSelect({ target: select });
                }
            }
        });

        // --- Portrait Appearance ---
        const syncFlags = () => this._syncUserFlags();

        registerHidden(this.SETTINGS.SHOW_PORTRAIT, Boolean, true);
        registerHidden(this.SETTINGS.PORTRAIT_SIZE, Number, 36, 'client', { onChange: syncFlags });
        
        // 초이스 타입도 String으로 등록하고 UI 처리는 Config 앱에서 담당
        registerHidden(this.SETTINGS.PORTRAIT_BORDER, String, 'default', 'client', { onChange: syncFlags });
        registerHidden(this.SETTINGS.USE_USER_COLOR, Boolean, true, 'client', { onChange: syncFlags });
        registerHidden(this.SETTINGS.PORTRAIT_BORDER_COLOR, String, '#000000', 'client', { onChange: syncFlags });
        
        registerHidden(this.SETTINGS.USE_SECONDARY_COLOR, Boolean, false, 'client', { onChange: syncFlags });
        registerHidden(this.SETTINGS.SECONDARY_COLOR, String, '#2b2a24', 'client', { onChange: syncFlags });
        
        registerHidden(this.SETTINGS.USE_GLOW_EFFECT, Boolean, false, 'client', { onChange: syncFlags });
        registerHidden(this.SETTINGS.GLOW_COLOR, String, '#ffffff80', 'client', { onChange: syncFlags });
        registerHidden(this.SETTINGS.GLOW_STRENGTH, Number, 5, 'client', { onChange: syncFlags });

        // --- Chat Message Style ---
        registerHidden(this.SETTINGS.USE_USER_BORDER, Boolean, true);
        registerHidden(this.SETTINGS.CHAT_BORDER_COLOR, String, '#000000');

        // --- System & Compatibility ---
        registerHidden(this.SETTINGS.HIDE_DND5E_PORTRAIT, Boolean, false, 'client', {
            onChange: () => this._updateChatStyles()
        });
        registerHidden('hideWfrp4ePortrait', Boolean, false, 'client', {
            onChange: () => Wfrp4ePortraitHandler._updateChatStyles()
        });        
        registerHidden(this.SETTINGS.ALLOWED_MODULE_FLAGS, String, 'foundryvtt-simple-calendar,theatre', 'world');

        // --- Dropdown UI ---
        const updateDropdown = () => this._updateDropdownStyles();

        registerHidden('dropdownBackground', String, '#000000B3', 'client', { onChange: updateDropdown });
        registerHidden('dropdownTextColor', String, '#f0f0f0', 'client', { onChange: updateDropdown });
        registerHidden('dropdownBorderColor', String, '#7a7971', 'client', { onChange: updateDropdown });
        registerHidden('dropdownHoverColor', String, '#FFFFFF1A', 'client', { onChange: updateDropdown });
        registerHidden('enableThumbnailPreview', Boolean, true, 'client', { onChange: updateDropdown });

        // --- HP Tint ---
        registerHidden('useHpTint', Boolean, false, 'client', { onChange: () => HpTintEffect._refreshAllTints() });
        registerHidden('hpTintIntensity', Number, 0.6, 'client', { onChange: () => HpTintEffect._refreshAllTints() });
        registerHidden('hpCurrentPath', String, 'system.attributes.hp.value', 'world', { onChange: () => HpTintEffect._refreshAllTints() });
        registerHidden('hpMaxPath', String, 'system.attributes.hp.max', 'world', { onChange: () => HpTintEffect._refreshAllTints() });

        // --- Ruby Text ---
        registerHidden('enableRuby', Boolean, true, 'client', { onChange: () => RubyTextHandler.injectStyles() });
        registerHidden('rubyTextSize', Number, 0.5, 'client', { onChange: () => RubyTextHandler.injectStyles() });
        registerHidden('rubyTextColor', String, '#666666', 'client', { onChange: () => RubyTextHandler.injectStyles() });
        registerHidden('enableMarkdown', Boolean, true);

        // --- Chat Optimization ---
        registerHidden('enableChatOptimization', Boolean, true, 'client', { requiresReload: true });
        registerHidden('maxChatMessages', Number, 50, 'client', { onChange: () => ui.chat?.render(true) });
        registerHidden('chatBatchSize', Number, 20);

        // --- Notification Sound ---
        registerHidden('enableNotificationSound', Boolean, false);
        registerHidden('playNotificationForSelf', Boolean, false);
        registerHidden('notificationSoundPath', String, 'sounds/notify.wav');
        registerHidden('notificationVolume', Number, 0.5);

        // --- Hotkeys ---
        registerHidden('enableHotkeys', Boolean, false, 'client', {
            onChange: value => { if (value) HotkeyManager.registerHotkeyBindings(); else HotkeyManager.unregisterHotkeyBindings(); }
        });
        registerHidden('hotkeyModifier', String, 'Control');

        // --- Factory Reset ---
        registerHidden(this.SETTINGS.FACTORY_RESET, Boolean, false);
    }

    static _updateSelectorVisibility(forceTabName = null, forceCollapsed = null) {
        const selector = document.querySelector('.character-chat-selector');
        if (!selector) return;

        let isCollapsed = forceCollapsed;
        if (isCollapsed === null) {
            if (ui.sidebar && "expanded" in ui.sidebar) {
                isCollapsed = !ui.sidebar.expanded;
            } else {
                const uiRight = document.getElementById('ui-right');
                isCollapsed = uiRight ? uiRight.classList.contains('collapsed') : false;
            }
        }

        let activeTab = forceTabName;

        if (!activeTab && ui.sidebar) {
            activeTab = ui.sidebar.activeTab;
        }

        if (!activeTab) {
            const activeTabIcon = document.querySelector('#sidebar-tabs > .item.active');
            if (activeTabIcon) {
                activeTab = activeTabIcon.dataset.tab;
            }
        }

        // 탭 정보를 여전히 찾을 수 없다면(초기 로딩/애니메이션 중) 'chat'으로 간주
        if (!activeTab) {
            activeTab = 'chat';
        }

        const isChatTab = activeTab === 'chat';

        if (!isCollapsed && isChatTab) {
            // ... (이후 동일)
            selector.style.removeProperty('display');
            selector.style.removeProperty('visibility');
            selector.style.removeProperty('opacity');
            selector.style.removeProperty('pointer-events');

            setTimeout(() => {
                if (ui.chat) ui.chat.scrollBottom();
            }, 50);

        } else {
            selector.style.setProperty('display', 'none', 'important');
        }
    }

    static async _syncUserFlags() {
        if (!game.user) return;

        const themeData = {
            portraitSize: game.settings.get('character-chat-selector', this.SETTINGS.PORTRAIT_SIZE),
            borderStyle: game.settings.get('character-chat-selector', this.SETTINGS.PORTRAIT_BORDER),
            useUserColor: game.settings.get('character-chat-selector', this.SETTINGS.USE_USER_COLOR),
            borderColor: game.settings.get('character-chat-selector', this.SETTINGS.PORTRAIT_BORDER_COLOR),
            useSecondary: game.settings.get('character-chat-selector', this.SETTINGS.USE_SECONDARY_COLOR),
            secondaryColor: game.settings.get('character-chat-selector', this.SETTINGS.SECONDARY_COLOR),
            useGlow: game.settings.get('character-chat-selector', this.SETTINGS.USE_GLOW_EFFECT),
            glowColor: game.settings.get('character-chat-selector', this.SETTINGS.GLOW_COLOR),
            glowStrength: game.settings.get('character-chat-selector', this.SETTINGS.GLOW_STRENGTH)
        };

        await game.user.setFlag('character-chat-selector', 'userTheme', themeData);
    }

    static _injectColorPickers(html) {
        const colorSettings = [
            this.SETTINGS.PORTRAIT_BORDER_COLOR,
            this.SETTINGS.SECONDARY_COLOR,
            this.SETTINGS.GLOW_COLOR,
            this.SETTINGS.CHAT_BORDER_COLOR,
            'dropdownBackground',
            'dropdownTextColor',
            'dropdownBorderColor',
            'dropdownHoverColor',
        ];

        const root = (html instanceof HTMLElement) ? html : html[0];

        colorSettings.forEach(settingKey => {
            const inputName = `character-chat-selector.${settingKey}`;
            const input = root.querySelector(`input[name="${inputName}"]`);

            if (input) {
                if (input.nextElementSibling?.type === 'color') return;

                const picker = document.createElement('input');
                picker.type = 'color';
                picker.style.marginLeft = '5px';
                picker.style.verticalAlign = 'middle';
                picker.style.height = '26px';
                picker.style.width = '40px';
                picker.style.border = 'none';
                picker.style.cursor = 'pointer';

                const currentVal = input.value;
                if (currentVal && currentVal.startsWith('#')) {
                    picker.value = currentVal.substring(0, 7);
                }

                picker.addEventListener('input', (e) => {
                    const hex = e.target.value;
                    const currentAlpha = input.value.length > 7 ? input.value.substring(7) : '';
                    input.value = hex + currentAlpha;
                });

                input.addEventListener('input', (e) => {
                    const val = e.target.value;
                    if (val.startsWith('#') && val.length >= 7) {
                        picker.value = val.substring(0, 7);
                    }
                });

                input.after(picker);
            }
        });
    }

    static _injectResetButton(html) {
        const root = (html instanceof HTMLElement) ? html : html[0];
        const inputName = `character-chat-selector.${this.SETTINGS.FACTORY_RESET}`;
        const checkbox = root.querySelector(`input[name="${inputName}"]`);

        if (checkbox) {
            const formGroup = checkbox.closest('.form-group');
            const button = document.createElement('button');
            button.type = 'button';
            button.innerHTML = `<i class="fas fa-undo"></i> ${game.i18n.localize("CHATSELECTOR.Settings.FactoryReset.Name")}`;
            button.style.width = 'auto';
            button.style.minWidth = '200px';
            button.style.marginLeft = 'auto';

            button.onclick = () => this._doFactoryReset();

            const controlDiv = formGroup.querySelector('.form-fields');
            controlDiv.innerHTML = '';
            controlDiv.appendChild(button);
        }
    }

    static async _doFactoryReset() {
        const MODULE_ID = 'character-chat-selector';

        const confirmed = await Dialog.confirm({
            title: game.i18n.localize("CHATSELECTOR.Settings.FactoryReset.ConfirmTitle"),
            content: game.i18n.localize("CHATSELECTOR.Settings.FactoryReset.ConfirmContent"),
            defaultYes: false
        });

        if (!confirmed) return;

        ui.notifications.info("Processing Factory Reset...");

        const allSettings = Array.from(game.settings.settings.keys());
        for (const key of allSettings) {
            if (key.startsWith(`${MODULE_ID}.`)) {
                const settingName = key.split('.')[1];
                const settingDef = game.settings.settings.get(key);

                if (settingName === this.SETTINGS.FACTORY_RESET) continue;

                try {
                    if (settingDef.scope === 'world' && !game.user.isGM) continue;
                    await game.settings.set(MODULE_ID, settingName, settingDef.default);
                } catch (err) {
                    console.warn(`[ChatSelector] Failed to reset ${settingName}:`, err);
                }
            }
        }

        try {
            await game.user.unsetFlag(MODULE_ID, "hotkeyBindings");
            await game.user.unsetFlag(MODULE_ID, "userTheme");
        } catch (err) {
            console.warn("[ChatSelector] Failed to clear flags:", err);
        }

        ui.notifications.info("Reset complete. Reloading...");

        setTimeout(() => {
            location.reload();
        }, 1500);
    }

    static _createSelector(initialActorId = null) {
        const chatControls = document.querySelector("#chat-controls");
        if (!chatControls) {
            console.error("ChatSelector | Chat controls not found");
            return;
        }

        if (document.querySelector('.character-chat-selector')) {
            return;
        }

        const actors = ChatAutocomplete.actors;

        const selectedActor = initialActorId ? actors.find(a => a.id === initialActorId) : null;
        const selectedName = selectedActor ? selectedActor.name : game.i18n.localize("CHATSELECTOR.Default");
        const finalActorId = selectedActor ? selectedActor.id : "";

        const getCharacterOptionTags = () => {
            return actors
                .map(a => `<option value="${a.id}">${a.name}</option>`)
                .join('');
        };

        const selectorHtml = `
            <div class="character-chat-selector" style="display: none;">
                <select class="character-select" style="display: none;">
                    <option value="">${game.i18n.localize("CHATSELECTOR.Default")}</option>
                    ${getCharacterOptionTags()}
                </select>
                <div class="custom-select">
                    <div class="select-selected">${selectedName}</div>
                    <div class="select-items">
                        <div class="select-item" data-value="">
                            <span>${game.i18n.localize("CHATSELECTOR.Default")}</span>
                        </div>
                        ${this._getCharacterOptions(finalActorId)}
                    </div>
                </div>
                <button type="button" class="configure-hotkeys" title="${game.i18n.localize("CHATSELECTOR.ConfigureHotkeys")}">
                    <i class="fas fa-keyboard"></i>
                </button>
            </div>
            `;

        chatControls.insertAdjacentHTML('beforeend', selectorHtml);

        const newHiddenSelect = document.querySelector('.character-chat-selector .character-select');
        if (newHiddenSelect) {
            newHiddenSelect.value = finalActorId;
        }

        this._addEventListeners();
    }

    static _getCharacterOptions(currentActorId) {
        const actors = ChatAutocomplete.actors;

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

        if (selected) {
            selected.addEventListener('click', () => {
                itemsDiv?.classList.toggle('show');
            });
        }

        if (itemsDiv) {
            itemsDiv.querySelectorAll('.select-item').forEach(item => {
                const thumbnail = item.querySelector('.actor-thumbnail');
                if (thumbnail) {
                    const preview = document.createElement('div');
                    preview.className = 'thumbnail-preview';
                    const previewImg = document.createElement('img');
                    previewImg.src = thumbnail.src;
                    preview.appendChild(previewImg);
                    item.appendChild(preview);

                    item.addEventListener('mouseenter', (e) => {
                        const itemRect = item.getBoundingClientRect();
                        const viewportHeight = window.innerHeight;
                        const viewportWidth = window.innerWidth;

                        let top = itemRect.top + (itemRect.height - 150) / 2;

                        if (top + 150 > viewportHeight) {
                            top = viewportHeight - 160;
                        }

                        if (top < 10) {
                            top = 10;
                        }

                        let left = itemRect.right + 10;
                        if (left + 150 > viewportWidth) {
                            left = itemRect.left - 160;
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
                    //  통합 메서드 사용
                    this.selectActor(value);
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
    }

    //  안전한 목록 새로고침 메서드
    static refreshSelector() {
        // 1. 현재 선택된 값 저장
        const select = document.querySelector('.character-select');
        const currentId = select ? select.value : null;

        // 2. 기존 UI 제거
        const existingSelector = document.querySelector('.character-chat-selector');
        if (existingSelector) existingSelector.remove();

        // 3. 데이터 갱신
        ChatAutocomplete._updateCache();

        // 4. UI 재생성 (저장해둔 값으로 복구)
        this._createSelector(currentId);

        //  생성 직후 현재 탭이나 사이드바 상태에 맞춰 보임/숨김 갱신 (이게 핵심!)
        this._updateSelectorVisibility();
    }

    static _getMessageImage(message) {
        if (ChatSelector.tempCharacter && message.speaker?.alias === ChatSelector.tempCharacter.name) {
            return ChatSelector.tempCharacter.img;
        }

        if (!message.speaker?.actor) {
            const user = message.author || message.user;

            if (user?.avatar) {
                return user.avatar;
            }
        }

        const speakAsToken = game.settings.get('character-chat-selector', this.SETTINGS.SPEAK_AS_TOKEN);

        if (speakAsToken) {
            const tokenImg = this._getTokenImage(message.speaker);

            if (tokenImg) return tokenImg;
        }

        const actor = game.actors.get(message.speaker.actor);

        if (actor?.img) {
            return actor.img;
        }

        const fallbackAvatar = game.users.get(message.author || message.user)?.avatar || 'icons/svg/mystery-man.svg';
        return fallbackAvatar;
    }

    static _getTokenImage(speaker) {
        let tokenImg = null;

        if (speaker.token) {
            const activeToken = canvas.tokens?.placeables.find(t => t.id === speaker.token);
            if (activeToken) {
                tokenImg = activeToken.document.texture.src || activeToken.document.img;
            }

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

    static _addPortraitToMessage(message, html, data) {
        if (!game.settings.get('character-chat-selector', this.SETTINGS.SHOW_PORTRAIT)) return;

        const CHAT_STYLES = CONST.CHAT_MESSAGE_STYLES;
        const messageStyle = message.style;

        const isOurMessage =
            (messageStyle === CHAT_STYLES.IC) ||
            (messageStyle === CHAT_STYLES.EMOTE) ||
            (messageStyle === CHAT_STYLES.OOC) ||
            (messageStyle === CHAT_STYLES.OTHER) ||
            (message.whisper.length > 0) ||
            (message.isRoll && !message.flags?.["core"]?.external);

        if (!isOurMessage || !message.speaker) return;

        const imgSrc = this._getMessageImage(message);
        if (!imgSrc) return;

        const messageElement = (html instanceof HTMLElement) ? html : (html[0] || html);
        const header = messageElement.querySelector('.message-header');
        if (!header) return;

        const chatLog = document.getElementById('chat-log');
        const wasAtBottom = chatLog ? (chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 50) : false;
        const isMyMessage = message.isAuthor;

        const enforceBottom = () => {
            if ((wasAtBottom || isMyMessage) && chatLog) {
                chatLog.scrollTop = chatLog.scrollHeight;
            }
        };

        const portraitContainer = this._createPortraitElement(message, imgSrc);

        const img = portraitContainer.querySelector('img');
        if (img) {
            img.onload = () => {
                enforceBottom();
                requestAnimationFrame(enforceBottom);
            };
        }

        const injectPortrait = () => {
            if (header.querySelector('.chat-portrait-container')) return;
            
            messageElement.classList.add('ccs-custom-border'); 

            const existingAvatar = header.querySelector('a.avatar');
            const senderEl = header.querySelector('.message-sender');

            if (existingAvatar) {
                existingAvatar.replaceWith(portraitContainer);
            } else if (senderEl) {
                senderEl.prepend(portraitContainer);
            } else {
                header.prepend(portraitContainer);
            }

            this._applyCommonStyles(messageElement, message, portraitContainer);
            enforceBottom();
        };

        injectPortrait();

        const observer = new MutationObserver((mutations, obs) => {
            const avatar = header.querySelector('a.avatar');
            if (avatar && !avatar.classList.contains('chat-portrait-container')) {
                avatar.replaceWith(portraitContainer);
                this._applyCommonStyles(messageElement, message, portraitContainer);
                enforceBottom();
                obs.disconnect();
            }
        });
        observer.observe(header, { childList: true, subtree: true });

        setTimeout(() => {
            observer.disconnect();
            injectPortrait();
            enforceBottom();
        }, 0);
    }

    static _createPortraitElement(message, imgSrc) {
        const moduleID = 'character-chat-selector';

        const allowPersonal = game.settings.get(moduleID, 'allowPersonalThemes');

        const author = message.author || game.users.get(message.user);

        let theme = {};
        let sourceIsAuthor = false;

        if (allowPersonal && author) {
            const authorTheme = author.getFlag(moduleID, 'userTheme');
            if (authorTheme) {
                theme = authorTheme;
                sourceIsAuthor = true;
            }
        }

        const getVal = (key, settingKey) => {
            if (sourceIsAuthor && theme[key] !== undefined) return theme[key];
            return game.settings.get(moduleID, settingKey);
        };

        const portraitSize = getVal('portraitSize', this.SETTINGS.PORTRAIT_SIZE);
        const borderStyle = getVal('borderStyle', this.SETTINGS.PORTRAIT_BORDER);
        const useUserColor = getVal('useUserColor', this.SETTINGS.USE_USER_COLOR);
        const speakAsToken = game.settings.get(moduleID, this.SETTINGS.SPEAK_AS_TOKEN);

        const useSecondary = getVal('useSecondary', this.SETTINGS.USE_SECONDARY_COLOR);
        const secondaryColor = getVal('secondaryColor', this.SETTINGS.SECONDARY_COLOR);
        const useGlow = getVal('useGlow', this.SETTINGS.USE_GLOW_EFFECT);
        const glowColor = getVal('glowColor', this.SETTINGS.GLOW_COLOR);
        const glowStrength = getVal('glowStrength', this.SETTINGS.GLOW_STRENGTH);
        const customBorderColor = getVal('borderColor', this.SETTINGS.PORTRAIT_BORDER_COLOR);

        const portraitContainer = document.createElement('div');
        portraitContainer.classList.add('chat-portrait-container', `portrait-${borderStyle}`);

        if (useGlow) {
            portraitContainer.classList.add('animated-glow');
        }

        portraitContainer.style.setProperty('--portrait-size', `${portraitSize}px`);

        const img = document.createElement('img');
        img.src = imgSrc;
        img.classList.add('chat-portrait');
        portraitContainer.appendChild(img);

        const userColorToUse = (author?.color || '#4b4a44');
        const primaryColor = useUserColor ? userColorToUse : customBorderColor;

        portraitContainer.style.setProperty('--primary-color', primaryColor);
        portraitContainer.style.setProperty('--glow-color', glowColor);

        if (useSecondary) {
            portraitContainer.style.setProperty('--secondary-color', secondaryColor);
            portraitContainer.style.setProperty('--use-secondary-color', '1');
        } else {
            portraitContainer.style.setProperty('--secondary-color', primaryColor);
            portraitContainer.style.setProperty('--use-secondary-color', '0');
        }

        if (useGlow && glowStrength > 0) {
            portraitContainer.style.setProperty('--glow-color', glowColor);
            portraitContainer.style.setProperty('--glow-strength', `${glowStrength}px`);
        } else {
            portraitContainer.style.setProperty('--glow-color', 'transparent');
            portraitContainer.style.setProperty('--glow-strength', '0px');
        }

        portraitContainer.addEventListener('click', async () => {
            const speaker = message.speaker;
            let sheet = null;
            if (speakAsToken) {
                const token = await this._getToken(speaker);
                sheet = token?.actor?.sheet;
            }
            if (!sheet && speaker.actor) {
                const actor = game.actors.get(speaker.actor);
                sheet = actor?.sheet;
            }
            sheet?.render(true);
        });

        return portraitContainer;
    }

static _applyCommonStyles(html, message, portraitContainer) {
        const moduleID = 'character-chat-selector';
        const allowPersonal = game.settings.get(moduleID, 'allowPersonalThemes');
        const author = message.author || game.users.get(message.user);

        // [수정] Personal Theme 로직을 여기서도 수행하여 메시지 박스 테두리 설정을 가져옴
        let theme = {};
        let sourceIsAuthor = false;

        if (allowPersonal && author) {
            const authorTheme = author.getFlag(moduleID, 'userTheme');
            if (authorTheme) {
                theme = authorTheme;
                sourceIsAuthor = true;
            }
        }
        
        const useUserBorder = game.settings.get(moduleID, this.SETTINGS.USE_USER_BORDER);
        
        //  DOM 요소에 클래스 부여 (확실하게)
        const messageElement = (html instanceof HTMLElement) ? html : (html[0] || html);
        if (messageElement) messageElement.classList.add('ccs-custom-border');

        // 작성자의 색상을 가져오도록 명시적 처리
        const chatBorderColor = useUserBorder 
            ? (author?.color || '#000000') 
            : game.settings.get(moduleID, this.SETTINGS.CHAT_BORDER_COLOR);

        if (html.style) {
            html.style.setProperty('--ccs-chat-border-color', chatBorderColor);
        }
        
        // DOM 요소인 경우 (V13 renderChatMessageHTML 훅 대응)
        if (html instanceof HTMLElement) {
             html.style.setProperty('--ccs-chat-border-color', chatBorderColor);
             html.style.borderColor = chatBorderColor; // Fallback
        }

        HpTintEffect.applyTintToPortrait(portraitContainer, message);
    }

    static _getToken(speaker) {
        if (!speaker.token) return null;

        const scene = game.scenes.get(speaker.scene || canvas.scene?.id);
        if (!scene) return null;

        return scene.tokens.get(speaker.token)?.object ||
            canvas.tokens?.placeables.find(t => t.id === speaker.token);
    }

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
            const nameLower = actor.nameLower;
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
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }

    static _updateDropdownStyles(overrides = {}) {
        const styleId = 'character-selector-custom-styles';
        let styleElement = document.getElementById(styleId);

        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = styleId;
            document.head.appendChild(styleElement);
        }

        // 오버라이드 데이터가 있으면(설정창 미리보기) 그걸 쓰고, 없으면 저장된 설정값 사용
        const getVal = (key) => overrides[key] ?? game.settings.get('character-chat-selector', key);

        const backgroundColor = getVal('dropdownBackground');
        const textColor = getVal('dropdownTextColor');
        const borderColor = getVal('dropdownBorderColor');
        const hoverColor = getVal('dropdownHoverColor');
        const enableThumbnail = getVal('enableThumbnailPreview');

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

    static updateExistingMessages() {
        const messages = document.querySelectorAll('.message.ccs-custom-border, .chat-message.ccs-custom-border');
        messages.forEach(html => {
            const messageId = html.dataset.messageId || html.dataset.documentId;
            const message = game.messages.get(messageId);
            if (!message) return;

            // 1. 테두리 색상 갱신
            this._applyCommonStyles(html, message, html.querySelector('.chat-portrait-container'));
            
            // 2. 초상화 스타일 갱신 (이미 있는 경우)
            const portraitContainer = html.querySelector('.chat-portrait-container');
            if (portraitContainer) {
                const imgSrc = this._getMessageImage(message);
                const newPortrait = this._createPortraitElement(message, imgSrc);
                portraitContainer.replaceWith(newPortrait);
            }
        });
    }
}