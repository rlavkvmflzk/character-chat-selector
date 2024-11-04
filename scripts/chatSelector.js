// scripts/chatSelector.js
export class ChatSelector {
    static SETTINGS = {
        SHOW_SELECTOR: 'showSelector',
        SPEAK_AS_TOKEN: 'speakAsToken' 
    };

    static initialize() {
        console.log("ChatSelector | Initializing...");
        this.registerSettings();
        
        // renderChatLog 대신 ready 훅 사용
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
    }

    static registerSettings() {
        console.log("ChatSelector | Registering settings");
        game.settings.register('character-chat-selector', this.SETTINGS.SHOW_SELECTOR, {
            name: 'CHATSELECTOR.Settings.ShowSelector.Name',
            hint: 'CHATSELECTOR.Settings.ShowSelector.Hint',
            scope: 'client',
            config: true,
            type: Boolean,
            default: true,
            onChange: (value) => this.updateSelector()
        });
    
        game.settings.register('character-chat-selector', this.SETTINGS.SPEAK_AS_TOKEN, {
            name: 'CHATSELECTOR.Settings.SpeakAsToken.Name',
            hint: 'CHATSELECTOR.Settings.SpeakAsToken.Hint',
            scope: 'client',
            config: true,
            type: Boolean,
            default: false,
            onChange: () => {
                // 현재 선택된 화자가 있다면 설정 변경을 즉시 반영
                const select = document.querySelector('.character-select');
                if (select && select.value) {
                    const event = { target: select };
                    this._onCharacterSelect(event);
                }
            }
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
                console.log("ChatSelector | Adding actor to options:", a.name);
                return `<option value="${a.id}" ${a.id === currentActorId ? 'selected' : ''}>${a.name}</option>`;
            })
            .join('');
        
        console.log("ChatSelector | Generated options:", options);
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
                            token: tokenData.id || null, // 프로토타입 토큰 ID가 있다면 사용
                            alias: tokenData.name || actor.name
                        } : {
                            scene: game.scenes.current?.id,
                            actor: actor.id,
                            token: null,
                            alias: actor.name
                        },
                        content: message
                    };
                    return ChatMessage.create(chatData);
                };
    
                ui.notifications.info(`화자가 ${actor.name}(으)로 변경되었습니다.${speakAsToken ? ' (토큰 모드)' : ''}`);
            }
        } else {
            console.log("ChatSelector | Resetting to default");
            
            // 기본 상태로 완전히 복구
            const originalProcessMessage = ui.chat.constructor.prototype.processMessage;
            ui.chat.processMessage = originalProcessMessage;
            delete ChatMessage.implementation.prototype._getChatSpeakerData;
            
            ui.notifications.info("기본 화자로 초기화되었습니다.");
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
}