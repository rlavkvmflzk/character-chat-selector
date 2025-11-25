import { HpTintEffect } from './hpTintEffect.js';
import { Dnd5ePortraitHandler } from './dnd5ePortraitHandler.js';
import { HotkeyManager } from './hotkeyManager.js';
import { RubyTextHandler } from './rubyTextHandler.js';
import { ChatAutocomplete } from './chatAutocomplete.js';

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

    static initialize() {
        this.registerSettings();

        Hooks.once('ready', () => {
            if (game.settings.get('character-chat-selector', this.SETTINGS.SHOW_SELECTOR)) {
                this._createSelector();
                this._updateSelectorVisibility();
            }
            this._updateDropdownStyles();
        });

        Hooks.on("collapseSidebar", (sidebar, collapsed) => {
            this._updateSelectorVisibility(null, collapsed);
        });

        Hooks.on("changeSidebarTab", (app) => {
            this._updateSelectorVisibility(app.tabName, null);
        });

        Hooks.once('ready', () => {
            this._onCharacterSelect({ target: { value: '' } });
        });

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

                const availableActors = ChatAutocomplete.actors;

                const bestMatch = this._findBestMatch(searchTerm, availableActors);

                if (bestMatch) {
                    const select = document.querySelector('.character-select');
                    const customSelect = document.querySelector('.custom-select');
                    if (select && customSelect) {
                        select.value = bestMatch.id;
                        const selectedDiv = customSelect.querySelector('.select-selected');
                        if (selectedDiv) {
                            selectedDiv.textContent = bestMatch.name;
                        }
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

        Hooks.on('createActor', () => this.refreshSelector());
        Hooks.on('deleteActor', () => this.refreshSelector());
        Hooks.on('updateActor', (actor, changes) => {
            if (changes.name || changes.ownership) {
                this.refreshSelector();
            }
        });

        Hooks.on('renderChatMessageHTML', (message, html, data) => {
            this._addPortraitToMessage(message, html, data);
        });

        HpTintEffect.initialize();
        HpTintEffect.injectStyles();
        if (game.system.id === 'dnd5e') {
            Dnd5ePortraitHandler.initialize();
        }
        RubyTextHandler.initialize();

        this.tempCharacter = null;
    }

    static registerSettings() {

        game.settings.register('character-chat-selector', 'allowPersonalThemes', {
            name: game.i18n.localize('CHATSELECTOR.Settings.AllowPersonalThemes.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.AllowPersonalThemes.Hint'),
            scope: 'world',
            config: true,
            type: Boolean,
            default: true
        });

        game.settings.register('character-chat-selector', this.SETTINGS.SHOW_SELECTOR, {
            name: game.i18n.localize('CHATSELECTOR.Settings.ShowSelector.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.ShowSelector.Hint'),
            scope: 'client',
            config: true,
            type: Boolean,
            default: true,
            onChange: (value) => {
                this.updateSelector();
                this._updateSelectorVisibility();
            }
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

        const syncFlags = () => this._syncUserFlags();

        game.settings.register('character-chat-selector', this.SETTINGS.PORTRAIT_SIZE, {
            name: game.i18n.localize('CHATSELECTOR.Settings.PortraitSize.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.PortraitSize.Hint'),
            scope: 'client',
            config: true,
            type: Number,
            default: 36,
            range: { min: 20, max: 100, step: 4 },
            onChange: syncFlags
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
            default: 'default',
            onChange: syncFlags
        });

        game.settings.register('character-chat-selector', this.SETTINGS.USE_USER_COLOR, {
            name: game.i18n.localize('CHATSELECTOR.Settings.UseUserColor.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.UseUserColor.Hint'),
            scope: 'client',
            config: true,
            type: Boolean,
            default: true,
            onChange: syncFlags
        });

        game.settings.register('character-chat-selector', this.SETTINGS.PORTRAIT_BORDER_COLOR, {
            name: game.i18n.localize('CHATSELECTOR.Settings.PortraitBorderColor.Name'),
            scope: 'client',
            config: true,
            type: String,
            default: '#000000',
            onChange: syncFlags
        });

        game.settings.register('character-chat-selector', this.SETTINGS.USE_SECONDARY_COLOR, {
            name: game.i18n.localize('CHATSELECTOR.Settings.UseSecondaryColor.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.UseSecondaryColor.Hint'),
            scope: 'client',
            config: true,
            type: Boolean,
            default: false,
            onChange: syncFlags
        });

        game.settings.register('character-chat-selector', this.SETTINGS.SECONDARY_COLOR, {
            name: game.i18n.localize('CHATSELECTOR.Settings.SecondaryColor.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.SecondaryColor.Hint'),
            scope: 'client',
            config: true,
            type: String,
            default: '#2b2a24',
            onChange: syncFlags
        });

        game.settings.register('character-chat-selector', this.SETTINGS.USE_GLOW_EFFECT, {
            name: game.i18n.localize('CHATSELECTOR.Settings.UseGlowEffect.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.UseGlowEffect.Hint'),
            scope: 'client',
            config: true,
            type: Boolean,
            default: false,
            onChange: syncFlags
        });

        game.settings.register('character-chat-selector', this.SETTINGS.GLOW_COLOR, {
            name: game.i18n.localize('CHATSELECTOR.Settings.GlowColor.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.GlowColor.Hint'),
            scope: 'client',
            config: true,
            type: String,
            default: '#ffffff80',
            onChange: syncFlags
        });

        game.settings.register('character-chat-selector', this.SETTINGS.GLOW_STRENGTH, {
            name: game.i18n.localize('CHATSELECTOR.Settings.GlowStrength.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.GlowStrength.Hint'),
            scope: 'client',
            config: true,
            type: Number,
            range: { min: 0, max: 20, step: 1 },
            default: 5,
            onChange: syncFlags
        });

        game.settings.register('character-chat-selector', this.SETTINGS.USE_USER_BORDER, {
            name: game.i18n.localize('CHATSELECTOR.Settings.UseUserBorder.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.UseUserBorder.Hint'),
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

        game.settings.register('character-chat-selector', this.SETTINGS.HIDE_DND5E_PORTRAIT, {
            name: "Hide D&D5e Portrait",
            hint: "Hides the default D&D5e chat portrait if enabled",
            scope: 'client',
            config: true,
            type: Boolean,
            default: false,
            onChange: () => {
                this._updateChatStyles();
            }
        });

        game.settings.register('character-chat-selector', this.SETTINGS.ALLOWED_MODULE_FLAGS, {
            name: game.i18n.localize('CHATSELECTOR.Settings.AllowedModuleFlags.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.AllowedModuleFlags.Hint'),
            scope: 'world',
            config: true,
            type: String,
            default: 'foundryvtt-simple-calendar,theatre',
            onChange: () => {
                ui.notifications.warn(game.i18n.localize('CHATSELECTOR.Settings.ReloadRequired'), { permanent: true });
            }
        });

        game.settings.register('character-chat-selector', 'dropdownBackground', {
            name: game.i18n.localize('CHATSELECTOR.Settings.DropdownBackground.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.DropdownBackground.Hint'),
            scope: 'client',
            config: true,
            type: String,
            default: '#000000B3'
        });

        game.settings.register('character-chat-selector', 'dropdownTextColor', {
            name: game.i18n.localize('CHATSELECTOR.Settings.DropdownTextColor.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.DropdownTextColor.Hint'),
            scope: 'client',
            config: true,
            type: String,
            default: '#f0f0f0'
        });

        game.settings.register('character-chat-selector', 'dropdownBorderColor', {
            name: game.i18n.localize('CHATSELECTOR.Settings.DropdownBorderColor.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.DropdownBorderColor.Hint'),
            scope: 'client',
            config: true,
            type: String,
            default: '#7a7971'
        });

        game.settings.register('character-chat-selector', 'dropdownHoverColor', {
            name: game.i18n.localize('CHATSELECTOR.Settings.DropdownHoverColor.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.DropdownHoverColor.Hint'),
            scope: 'client',
            config: true,
            type: String,
            default: '#FFFFFF1A'
        });

        game.settings.register('character-chat-selector', 'enableThumbnailPreview', {
            name: game.i18n.localize('CHATSELECTOR.Settings.EnableThumbnailPreview.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.EnableThumbnailPreview.Hint'),
            scope: 'client',
            config: true,
            type: Boolean,
            default: true,
            onChange: () => this._updateDropdownStyles()
        });

        game.settings.register('character-chat-selector', this.SETTINGS.FACTORY_RESET, {
            name: game.i18n.localize('CHATSELECTOR.Settings.FactoryReset.Name'),
            hint: game.i18n.localize('CHATSELECTOR.Settings.FactoryReset.Hint'),
            scope: 'client',
            config: true,
            type: Boolean,
            default: false,
            onChange: () => { }
        });

        Hooks.on('renderSettingsConfig', (app, html, data) => {
            this._injectColorPickers(html);
            this._injectResetButton(html); // [추가 2] 버튼 주입 함수 호출            
        });

        Hooks.once('ready', () => {
            this._syncUserFlags();
        });
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
        if (!activeTab) activeTab = 'chat';

        const isChatTab = activeTab === 'chat';

        if (!isCollapsed && isChatTab) {
            selector.style.removeProperty('display');
            selector.style.removeProperty('visibility');
            selector.style.removeProperty('opacity');
            selector.style.removeProperty('pointer-events');

            setTimeout(() => {
                if (ui.chat) {
                    ui.chat.scrollBottom();
                }
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

        // 1. Settings 초기화
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

        // 2. Flags 초기화
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
        <div class="character-chat-selector">
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
            <button class="refresh-characters" title="${game.i18n.localize("CHATSELECTOR.RefreshList")}">
                <i class="fas fa-sync"></i>
            </button>
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
        const refreshButton = document.querySelector('.refresh-characters');

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
                this.refreshSelector();
            });
        }
    }

    static async _onCharacterSelect(event) {
        const actorId = event.target.value;
        const originalProcessMessage = ui.chat.processMessage;

        if (actorId) {
            this.tempCharacter = null;
        }

        ui.chat.processMessage = async function (message) {
            const CHAT_STYLES = CONST.CHAT_MESSAGE_STYLES;

            if (message.startsWith("/c") || message.startsWith("!")) {
                return ChatLog.prototype.processMessage.call(this, message);
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

                    ChatSelector.tempCharacter = {
                        name: tempName,
                        img: 'icons/svg/mystery-man.svg'
                    };

                    return ChatMessage.create({
                        user: game.user.id,
                        speaker: {
                            alias: tempName
                        },
                        content: processedMessage,
                        style: CHAT_STYLES.IC
                    });
                } else {
                    ChatSelector.tempCharacter = {
                        name: tempName,
                        img: 'icons/svg/mystery-man.svg'
                    };

                    ui.notifications.info(game.i18n.format("CHATSELECTOR.Info.TempCharacterEnabled", {
                        name: tempName
                    }));

                    return false;
                }
            }

            if (ChatSelector.tempCharacter) {
                // 일반 메시지
                if (!message.startsWith('/')) {
                    const processedMessage = RubyTextHandler.processMessage(message);
                    return ChatMessage.create({
                        user: game.user.id,
                        speaker: {
                            alias: ChatSelector.tempCharacter.name
                        },
                        content: processedMessage,
                        style: CHAT_STYLES.IC
                    });
                }

                // 감정표현
                if (message.startsWith('/emote ') || message.startsWith('/em ') || message.startsWith('/me ')) {
                    const cmdLength = message.startsWith('/emote ') ? 7 : 4;
                    const emoteText = message.slice(cmdLength);
                    const processedEmoteText = RubyTextHandler.processMessage(emoteText);
                    return ChatMessage.create({
                        user: game.user.id,
                        speaker: {
                            alias: ChatSelector.tempCharacter.name
                        },
                        content: `${ChatSelector.tempCharacter.name} ${processedEmoteText}`,
                        style: CHAT_STYLES.EMOTE
                    });
                }
            }

            // 일반 챗 처리 (액터 선택됨 or 기본)
            if (!actorId) {
                const speaker = ChatMessage.getSpeaker();

                if (message.startsWith('/')) {
                    // [중요] 명령어지만 커스텀 처리가 필요한 것들 먼저 캐치

                    // OOC
                    if (message.startsWith('/ooc ')) {
                        const oocText = message.slice(5);
                        return ChatMessage.create({
                            user: game.user.id,
                            speaker: speaker,
                            content: RubyTextHandler.processMessage(oocText),
                            style: CHAT_STYLES.OOC
                        });
                    }

                    // Whisper
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
                        return originalProcessMessage.call(this, message);
                    }

                    // GM Whisper
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

                    // Emote
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

                    return originalProcessMessage.call(this, message);
                }

                const processedMessage = RubyTextHandler.processMessage(message);
                return ChatMessage.create({
                    user: game.user.id,
                    speaker: speaker,
                    content: processedMessage,
                    style: CHAT_STYLES.IC
                });
            }

            // 액터가 선택된 경우
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
                    style: CHAT_STYLES.OOC
                });
            }

            if (message.startsWith('/w ') || message.startsWith('/whisper ')) {
                // 정규식으로 타겟과 메시지 분리 (더 안전함)
                const match = message.match(/^\/(?:w|whisper)\s+(?:["'\[](.*?)["'\]]|(\S+))\s+(.*)/);

                if (match) {
                    const targetName = match[1] || match[2];
                    const whisperText = match[3];
                    const targets = game.users.filter(u => u.name === targetName);

                    if (targets.length === 0) {
                        return originalProcessMessage.call(this, message);
                    }

                    return ChatMessage.create({
                        user: game.user.id,
                        speaker: speaker, // 화자 유지
                        content: RubyTextHandler.processMessage(whisperText),
                        whisper: targets.map(u => u.id),
                        style: CHAT_STYLES.WHISPER
                    });
                } else {
                    return originalProcessMessage.call(this, message);
                }
            }

            if (message.startsWith('/gm ')) {
                const gmText = message.slice(4);
                return ChatMessage.create({
                    user: game.user.id,
                    speaker: speaker, // 화자 유지
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
                });
            }

            if (message.startsWith('/')) {
                return originalProcessMessage.call(this, message);
            }

            const processedMessage = RubyTextHandler.processMessage(message);

            return ChatMessage.create({
                user: game.user.id,
                speaker: speaker,
                content: processedMessage,
                style: CHAT_STYLES.IC
            });
        };
    }

    static refreshSelector() {
        const oldSelector = document.querySelector('.character-chat-selector');
        if (!oldSelector) return;

        const hiddenSelect = oldSelector.querySelector('.character-select');
        const currentValue = hiddenSelect ? hiddenSelect.value : null;

        oldSelector.remove();

        this._createSelector(currentValue);
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

        if (ChatSelector.tempCharacter && message.speaker?.alias === ChatSelector.tempCharacter.name) {
            return ChatSelector.tempCharacter.img;
        }

        if (!message.speaker?.actor) {
            const user = message.author || message.user;

            if (user?.avatar) {
                return user.avatar;
            } else {
                console.warn("사용자 아바타를 찾을 수 없음:", message.author);
            }
        }

        const speakAsToken = game.settings.get('character-chat-selector', this.SETTINGS.SPEAK_AS_TOKEN);

        if (speakAsToken) {
            const tokenImg = await this._getTokenImage(message.speaker);

            if (tokenImg) return tokenImg;
        }

        const actor = game.actors.get(message.speaker.actor);

        if (actor?.img) {
            return actor.img;
        }

        const fallbackAvatar = game.users.get(message.author || message.user)?.avatar || 'icons/svg/mystery-man.svg';
        return fallbackAvatar;
    }

    static async _getTokenImage(speaker) {

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

    // [수정 2] async 제거 - 위 함수가 동기식이므로 여기도 동기식이어야 함
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
            // await 제거 (동기 호출)
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

    // [수정 3] async 제거 + MutationObserver 적용 (깜빡임 해결 + 안전장치)
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

        // [스크롤 조건 체크]
        const chatLog = document.getElementById('chat-log');
        const wasAtBottom = chatLog ? (chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 50) : false;
        const isMyMessage = message.isAuthor;

        // [강력한 스크롤 고정 함수]
        const enforceBottom = () => {
            if ((wasAtBottom || isMyMessage) && chatLog) {
                chatLog.scrollTop = chatLog.scrollHeight;
            }
        };

        // 포트레잇 컨테이너 생성
        const portraitContainer = this._createPortraitElement(message, imgSrc);

        // [핵심 해결책] 이미지가 완전히 로딩되어 높이가 잡혔을 때 스크롤 내리기
        const img = portraitContainer.querySelector('img');
        if (img) {
            img.onload = () => {
                enforceBottom();
                // 브라우저 렌더링 타이밍 오차 보정 (더블 탭)
                requestAnimationFrame(enforceBottom);
            };
        }

        // 삽입 및 교체 로직 (함수로 분리하여 중복 제거)
        const injectPortrait = () => {
            // 중복 방지
            if (header.querySelector('.chat-portrait-container')) return;

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
            
            // DOM 삽입 직후 1차 스크롤
            enforceBottom();
        };

        // 1. 즉시 실행
        injectPortrait();

        // 2. MutationObserver (시스템이 나중에 건드리는 것 감지)
        const observer = new MutationObserver((mutations, obs) => {
            const avatar = header.querySelector('a.avatar');
            // 내 포트레잇이 아니고 시스템 아바타라면 교체
            if (avatar && !avatar.classList.contains('chat-portrait-container')) {
                avatar.replaceWith(portraitContainer);
                this._applyCommonStyles(messageElement, message, portraitContainer);
                enforceBottom();
                obs.disconnect();
            }
        });
        observer.observe(header, { childList: true, subtree: true });

        // 3. 안전 장치 (0ms 후 확인)
        setTimeout(() => {
            observer.disconnect();
            injectPortrait(); // 혹시 누락되었으면 삽입
            enforceBottom();  // 마지막으로 스크롤 확인
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
            if (!sheet && speaker.actor) { // [수정] speaker.actor가 존재할 때만
                const actor = game.actors.get(speaker.actor);
                sheet = actor?.sheet;
            }
            // sheet가 없으면(유저 아바타) 아무 동작 안 함
            sheet?.render(true);
        });

        return portraitContainer;
    }

    static _applyCommonStyles(html, message, portraitContainer) {
        const useUserBorder = game.settings.get('character-chat-selector', this.SETTINGS.USE_USER_BORDER);
        const chatBorderColor = useUserBorder ? (message.author?.color || message.user?.color || game.settings.get('character-chat-selector', this.SETTINGS.CHAT_BORDER_COLOR)) : game.settings.get('character-chat-selector', this.SETTINGS.CHAT_BORDER_COLOR);

        if (html.style) {
            html.style.borderColor = chatBorderColor;
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

        // [최적화] actors는 이제 {id, name, img, nameLower} 객체들의 배열입니다.
        // Document getter 접근이 발생하지 않습니다.
        actors.forEach(actor => {
            const nameLower = actor.nameLower; // 이미 소문자로 저장된 값 사용
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
                // Levenshtein 거리는 무거운 연산이므로, 위 조건이 아닐 때만 계산
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