const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class HotkeyManager {
    static initialize() {
        console.log('Character Chat Selector | Initializing HotkeyManager...');
        
        this.registerSettings();

        // 초기 실행 시 체크
        if (game.settings.get('character-chat-selector', 'enableHotkeys')) {
            this.registerHotkeyBindings();
        }

        Hooks.on('closeSettingsConfig', () => {
            if (game.settings.get('character-chat-selector', 'enableHotkeys')) {
                this.registerHotkeyBindings();
            } else {
                this.unregisterHotkeyBindings();
            }
        });
    }

    static registerSettings() {
        const MODULE_ID = 'character-chat-selector';

        // 기능 활성화 여부는 클라이언트 설정(PC별 설정)으로 남겨두는 것이 일반적입니다.
        game.settings.register(MODULE_ID, 'enableHotkeys', {
            name: game.i18n.localize("CHATSELECTOR.Settings.EnableHotkeys.Name"),
            hint: game.i18n.localize("CHATSELECTOR.Settings.EnableHotkeys.Hint"),
            scope: "client",
            config: true,
            type: Boolean,
            default: false,
            onChange: value => {
                if (value) this.registerHotkeyBindings();
                else this.unregisterHotkeyBindings();
            }
        });

        game.settings.register(MODULE_ID, 'hotkeyModifier', {
            name: game.i18n.localize("CHATSELECTOR.Settings.HotkeyModifier.Name"),
            hint: game.i18n.localize("CHATSELECTOR.Settings.HotkeyModifier.Hint"),
            scope: "client",
            config: true,
            type: String,
            choices: {
                "Control": "Ctrl",
                "Control+Shift": "Ctrl+Shift",
                "Control+Alt": "Ctrl+Alt",
                "Shift": "Shift"
            },
            default: "Control"
        });

        // [삭제됨] hotkeyBindings 설정 등록 코드를 제거합니다.
        // 대신 아래 로직들에서 game.user.getFlag()를 사용합니다.
        
        console.log('Character Chat Selector | Hotkey settings registered.');
    }

    static registerHotkeyBindings() {
        $(document).off('keydown.characterHotkeys').on('keydown.characterHotkeys', (event) => {
            this._handleHotkey(event);
        });
    }

    static unregisterHotkeyBindings() {
        $(document).off('keydown.characterHotkeys');
    }

    static _handleHotkey(event) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable) return;

        const modifier = game.settings.get('character-chat-selector', 'hotkeyModifier');
        let validModifier = false;

        switch (modifier) {
            case 'Control': validModifier = event.ctrlKey && !event.altKey && !event.shiftKey; break;
            case 'Control+Shift': validModifier = event.ctrlKey && event.shiftKey && !event.altKey; break;
            case 'Control+Alt': validModifier = event.ctrlKey && event.altKey && !event.shiftKey; break;
            case 'Shift': validModifier = event.shiftKey && !event.ctrlKey && !event.altKey; break;
        }

        if (!validModifier) return;

        let key = event.key.toUpperCase();
        if (event.shiftKey) {
            const shiftKeyMap = { '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0' };
            key = shiftKeyMap[key] || key;
        }

        // [변경됨] Settings 대신 User Flag에서 데이터를 가져옵니다.
        const bindings = game.user.getFlag('character-chat-selector', 'hotkeyBindings') || {};
        
        const actorId = Object.entries(bindings).find(([_, hotkey]) => hotkey === key)?.[0];

        if (actorId) {
            event.preventDefault();
            event.stopPropagation();
            this._switchCharacter(actorId);
        }
    }

    static async _switchCharacter(actorId) {
        const actor = game.actors.get(actorId);
        if (!actor) return;

        const customSelect = document.querySelector('.custom-select');
        if (customSelect) {
            const selectedDiv = customSelect.querySelector('.select-selected');
            if (selectedDiv) selectedDiv.textContent = actor.name;

            customSelect.querySelectorAll('.select-item').forEach(item => {
                if (item.dataset.value === actorId) item.classList.add('selected');
                else item.classList.remove('selected');
            });
        }

        const select = document.querySelector('.character-select');
        if (select) select.value = actorId;

        document.dispatchEvent(new CustomEvent('characterHotkeySwitch', { detail: { actorId } }));

        ui.notifications.info(game.i18n.format("CHATSELECTOR.Info.CharacterChanged", { name: actor.name }));
    }

    static showConfig() {
        new HotkeyConfigDialog().render(true);
    }
}

class HotkeyConfigDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        tag: "form",
        id: "hotkey-config",
        classes: ["hotkey-config-window", "hotkey-config"],
        window: {
            icon: "fas fa-keyboard",
            resizable: false,
            title: "CHATSELECTOR.HotkeyConfig.Title"
        },
        position: { width: 400, height: "auto" },
        form: { handler: HotkeyConfigDialog.onSubmit, closeOnSubmit: true }
    };

    static PARTS = {
        form: { template: "modules/character-chat-selector/templates/hotkey-config.html" }
    };

    get title() {
        return game.i18n.localize("CHATSELECTOR.HotkeyConfig.Title");
    }

    async _prepareContext(options) {
        const MODULE_ID = 'character-chat-selector';
        
        // [변경됨] Settings -> User Flags
        const bindings = game.user.getFlag(MODULE_ID, 'hotkeyBindings') || {};
        const modifier = game.settings.get(MODULE_ID, 'hotkeyModifier');

        const characters = game.actors
            .filter(a => a.ownership[game.user.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
            .map(a => ({
                id: a.id,
                name: a.name,
                img: a.img,
                hotkey: bindings[a.id] || ''
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        return { characters, modifier };
    }

    _onRender(context, options) {
        // 기존 이벤트 리스너들
        this.element.querySelectorAll('.hotkey-input').forEach(input => {
            input.addEventListener('keydown', this._onHotkeyPress.bind(this));
        });

        this.element.querySelectorAll('.clear-hotkey').forEach(button => {
            button.addEventListener('click', this._onClearHotkey.bind(this));
        });

        // [추가됨] 검색 기능 로직
        const searchInput = this.element.querySelector('.search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (event) => {
                const query = event.target.value.toLowerCase();
                const rows = this.element.querySelectorAll('.character-hotkey-row');

                rows.forEach(row => {
                    const name = row.querySelector('.character-name').textContent.toLowerCase();
                    // 이름에 검색어가 포함되어 있으면 보이고(flex), 없으면 숨김(none)
                    if (name.includes(query)) {
                        row.style.display = 'flex';
                    } else {
                        row.style.display = 'none';
                    }
                });
            });
            
            // 편의성: 창 열리면 검색창에 자동 포커스 (선택사항)
            // setTimeout(() => searchInput.focus(), 50);
        }
    }

    async _onHotkeyPress(event) {
        event.preventDefault();
        const input = event.currentTarget;
        const key = event.key.toUpperCase();
        const MODULE_ID = 'character-chat-selector';

        if (/^[0-9A-Z]$/.test(key)) {
            const actorId = input.dataset.actorId;
            // [변경됨] Settings -> User Flags
            const bindings = game.user.getFlag(MODULE_ID, 'hotkeyBindings') || {};
            // 불변성 유지를 위해 복사본 생성
            const newBindings = { ...bindings };

            const existingActorId = Object.entries(newBindings)
                .find(([id, k]) => k === key && id !== actorId)?.[0];

            if (existingActorId) {
                const actor = game.actors.get(existingActorId);
                ui.notifications.warn(game.i18n.format("CHATSELECTOR.Warnings.HotkeyInUse", {
                    key: key,
                    name: actor?.name || 'Unknown'
                }));
                return;
            }

            input.value = key;
            newBindings[actorId] = key;
            
            // [변경됨] setFlag 사용
            await game.user.setFlag(MODULE_ID, 'hotkeyBindings', newBindings);
        }
    }

    async _onClearHotkey(event) {
        const MODULE_ID = 'character-chat-selector';
        const actorId = event.currentTarget.dataset.actorId;
        const input = this.element.querySelector(`.hotkey-input[data-actor-id="${actorId}"]`);
        if (input) input.value = '';

        // [변경됨] Settings -> User Flags
        const bindings = game.user.getFlag(MODULE_ID, 'hotkeyBindings') || {};
        
        if (bindings[actorId]) {
            const newBindings = { ...bindings };
            delete newBindings[actorId]; // flag에서 키 삭제를 위해 -null 대신 delete 후 재저장 권장
            
            // [변경됨] setFlag 사용
            // 키를 완전히 제거하기 위해 unsetFlag를 쓰거나 객체를 덮어씀
            await game.user.setFlag(MODULE_ID, 'hotkeyBindings', newBindings);
        }
    }

    static async onSubmit(event, form, formData) { return; }
}