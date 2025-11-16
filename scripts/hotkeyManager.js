export class HotkeyManager {
    static ID = 'character-chat-selector';

    static initialize() {
        console.log('HotkeyManager: Initializing...');
        this.registerSettings();

        if (game.settings.get(this.ID, 'enableHotkeys')) {
            console.log('HotkeyManager: Hotkeys enabled, registering bindings...');
            this.registerHotkeyBindings();
        }

        // 설정 변경 감지
        Hooks.on('closeSettingsConfig', () => {
            console.log('HotkeyManager: Settings closed, checking hotkey status...');
            if (game.settings.get(this.ID, 'enableHotkeys')) {
                this.registerHotkeyBindings();
            } else {
                this.unregisterHotkeyBindings();
            }
        });
    }

    static registerSettings() {
        // 단축키 활성화 설정
        game.settings.register(this.ID, 'enableHotkeys', {
            name: game.i18n.localize("CHATSELECTOR.Settings.EnableHotkeys.Name"),
            hint: game.i18n.localize("CHATSELECTOR.Settings.EnableHotkeys.Hint"),
            scope: "client",
            config: true,
            type: Boolean,
            default: false,
            onChange: value => {
                if (value) {
                    this.registerHotkeyBindings();
                } else {
                    this.unregisterHotkeyBindings();
                }
            }
        });

        // 단축키 보조키 설정
        game.settings.register(this.ID, 'hotkeyModifier', {
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


        // 단축키 바인딩 저장
        game.settings.register(this.ID, 'hotkeyBindings', {
            scope: "client",
            config: false,
            type: Object,
            default: {}
        });
    }

    // 단축키 이벤트 핸들러 등록
    static registerHotkeyBindings() {
        console.log('HotkeyManager: Registering hotkey event handler...');
        $(document).off('keydown.characterHotkeys').on('keydown.characterHotkeys', (event) => {
            this._handleHotkey(event);
        });
    }

    // 단축키 이벤트 핸들러 제거
    static unregisterHotkeyBindings() {
        $(document).off('keydown.characterHotkeys');
    }

    static _handleHotkey(event) {
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

        const modifier = game.settings.get(this.ID, 'hotkeyModifier');
        let validModifier = false;

        switch (modifier) {
            case 'Control':
                validModifier = event.ctrlKey && !event.altKey && !event.shiftKey;
                break;
            case 'Control+Shift':
                validModifier = event.ctrlKey && event.shiftKey && !event.altKey;
                break;
            case 'Control+Alt':
                validModifier = event.ctrlKey && event.altKey && !event.shiftKey;
                break;
            case 'Shift':
                validModifier = event.shiftKey && !event.ctrlKey && !event.altKey;
                break;
        }

        if (!validModifier) return;

        // Shift키와 함께 눌렸을 때 원래 숫자키 값을 복원
        let key = event.key.toUpperCase();
        if (event.shiftKey) {
            const shiftKeyMap = {
                '!': '1',
                '@': '2',
                '#': '3',
                '$': '4',
                '%': '5',
                '^': '6',
                '&': '7',
                '*': '8',
                '(': '9',
                ')': '0'
            };
            key = shiftKeyMap[key] || key;
        }

        const bindings = game.settings.get(this.ID, 'hotkeyBindings');
        const actorId = Object.entries(bindings).find(([_, hotkey]) => hotkey === key)?.[0];

        if (actorId) {
            event.preventDefault();
            this._switchCharacter(actorId);
        }
    }

    static async _switchCharacter(actorId) {
        const actor = game.actors.get(actorId);
        if (!actor) return;

        // 드롭다운 UI 업데이트
        const customSelect = document.querySelector('.custom-select');
        if (customSelect) {
            const selectedDiv = customSelect.querySelector('.select-selected');
            if (selectedDiv) {
                selectedDiv.textContent = actor.name;
            }

            // select-items 내의 선택된 항목 표시 업데이트
            const items = customSelect.querySelectorAll('.select-item');
            items.forEach(item => {
                if (item.dataset.value === actorId) {
                    item.classList.add('selected');
                } else {
                    item.classList.remove('selected');
                }
            });
        }

        // 숨겨진 select 엘리먼트 업데이트
        const select = document.querySelector('.character-select');
        if (select) {
            select.value = actorId;
        }

        // 캐릭터 전환 이벤트 발생
        const customEvent = new CustomEvent('characterHotkeySwitch', {
            detail: { actorId: actorId }
        });
        document.dispatchEvent(customEvent);

        // 알림 표시
        ui.notifications.info(game.i18n.format("CHATSELECTOR.Info.CharacterChanged", {
            name: actor.name
        }));
    }

    // 단축키 설정 UI 표시
    static showConfig() {
        new HotkeyConfigDialog().render(true);
    }
}

// 단축키 설정 다이얼로그
class HotkeyConfigDialog extends FormApplication {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: 'hotkey-config',
            title: game.i18n.localize("CHATSELECTOR.HotkeyConfig.Title"),
            template: "modules/character-chat-selector/templates/hotkey-config.html",
            width: 400,
            // height: "auto" 옵션이 없는지 다시 한번 확인합니다.
            closeOnSubmit: true
        });
    }

    getData() {
        const bindings = game.settings.get(HotkeyManager.ID, 'hotkeyBindings');
        const modifier = game.settings.get(HotkeyManager.ID, 'hotkeyModifier');

        const characters = game.actors
            .filter(a => a.ownership[game.user.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
            .map(a => ({
                id: a.id,
                name: a.name,
                img: a.img,
                hotkey: bindings[a.id] || ''
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        return {
            characters,
            modifier
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // html 파라미터는 jQuery 객체이므로, 첫 번째 DOM 요소를 가져오기 위해 html[0]을 사용합니다.
        // 이 DOM 요소는 이제 <div class="hotkey-config">가 됩니다.
        const formElement = html[0];

        formElement.querySelectorAll('.hotkey-input').forEach(input => {
            input.addEventListener('keydown', this._onHotkeyPress.bind(this));
        });

        formElement.querySelectorAll('.clear-hotkey').forEach(button => {
            button.addEventListener('click', this._onClearHotkey.bind(this));
        });
    }

    async _onHotkeyPress(event) {
        event.preventDefault();
        const input = event.currentTarget;
        const key = event.key.toUpperCase();

        if (/^[0-9A-Z]$/.test(key)) {
            const actorId = input.dataset.actorId;
            const bindings = game.settings.get(HotkeyManager.ID, 'hotkeyBindings');

            const existingActor = Object.entries(bindings)
                .find(([id, k]) => k === key && id !== actorId)?.[0];

            if (existingActor) {
                const actor = game.actors.get(existingActor);
                ui.notifications.warn(game.i18n.format("CHATSELECTOR.Warnings.HotkeyInUse", {
                    key: key,
                    name: actor?.name || 'Unknown'
                }));
                return;
            }

            input.value = key; // jQuery .val() 대신 .value 사용
            bindings[actorId] = key;
            await game.settings.set(HotkeyManager.ID, 'hotkeyBindings', bindings);
        }
    }

    async _onClearHotkey(event) {
        const actorId = event.currentTarget.dataset.actorId;
        // this.element.find(...) 대신 querySelector를 사용하여 안정성 확보
        const input = this.element[0].querySelector(`.hotkey-input[data-actor-id="${actorId}"]`);
        if (input) {
            input.value = ''; // jQuery .val('') 대신 .value 사용
        }

        const bindings = game.settings.get(HotkeyManager.ID, 'hotkeyBindings');
        delete bindings[actorId];
        await game.settings.set(HotkeyManager.ID, 'hotkeyBindings', bindings);
    }
}