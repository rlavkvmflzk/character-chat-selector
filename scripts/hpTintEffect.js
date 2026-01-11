export class HpTintEffect {
    static SETTINGS = {
        USE_HP_TINT: 'useHpTint',
        HP_TINT_INTENSITY: 'hpTintIntensity',
        HP_CURRENT_PATH: 'hpCurrentPath',
        HP_MAX_PATH: 'hpMaxPath'
    };

    static initialize() {        
        // 1. 액터(캐릭터 시트) 업데이트 감지
        Hooks.on('updateActor', (actor, changes, options, userId) => {
            if (this._hasHpChanged(changes)) {
                this._refreshTintsByActor(actor);
            }
        });

        // 2. 토큰 업데이트 감지 (맵 상에서 바 조작 등)
        Hooks.on('updateToken', (tokenDoc, changes, options, userId) => {
            if (changes.actorData || changes.bar1 || changes.bar2 || this._hasHpChanged(changes)) {
                this._refreshTintsByToken(tokenDoc);
            }
        });
    }

    static _getSystemDefaults() {
        const system = game.system.id;
        const defaults = {
            'dnd5e': { current: 'system.attributes.hp.value', max: 'system.attributes.hp.max' },
            'pf2e': { current: 'system.attributes.hp.value', max: 'system.attributes.hp.max' },
            'custom-system-builder': { current: 'system.props.hpvalue', max: 'system.props.hp' }
        };
        return defaults[system] || { current: 'system.attributes.hp.value', max: 'system.attributes.hp.max' };
    }

    static _getNestedValue(obj, path) {
        if (!obj || !path) return undefined;
        return path.split('.').reduce((current, part) => current && current[part], obj);
    }

    static _hasHpChanged(changes) {
        return !!(changes.system || changes.data || changes.actorData);
    }

    // [핵심 수정] 사용자의 요구사항을 반영한 액터 추출 로직
    static _getActorFromSpeaker(speaker) {
        if (!speaker) return null;
        
        // Case A: 메시지에 특정 토큰 ID가 있는 경우 (Default 모드 or 맵 토큰 클릭)
        // -> 연결 여부와 상관없이 무조건 그 토큰의 정보를 가져옴
        if (speaker.token) {
            const scene = game.scenes.get(speaker.scene || canvas.scene?.id);
            if (scene) {
                const tokenDoc = scene.tokens.get(speaker.token);
                if (tokenDoc && tokenDoc.actor) return tokenDoc.actor;
            }
            // 토큰 ID가 있지만 찾을 수 없는 경우(삭제됨 등) null 반환
            return null;
        }

        // Case B: 토큰 ID가 없고 액터 ID만 있는 경우 (Chat Selector로 선택함)
        if (speaker.actor) {
            const actor = game.actors.get(speaker.actor);
            if (!actor) return null;

            // [중요 조건] 프로토타입 토큰이 'Link Actor Data'인지 확인
            const isLinked = actor.prototypeToken.actorLink;

            if (isLinked) {
                // 1. 연결된 토큰(PC 등): 시트와 정보가 같으므로 틴트 적용
                return actor;
            } else {
                // 2. 연결되지 않은 토큰(Unlinked, 몬스터 등): 
                // 맵 상의 어떤 개체인지 특정할 수 없으므로, 사이드바의 원본 데이터를 쓰지 않음.
                // 따라서 틴트를 적용하지 않음 (null 반환)
                return null;
            }
        }
        
        return null;
    }

    static _getHpRatio(actor) {
        // actor가 null이면 1(만피/효과없음) 반환
        if (!actor) return 1;

        const currentPath = game.settings.get('character-chat-selector', this.SETTINGS.HP_CURRENT_PATH);
        const maxPath = game.settings.get('character-chat-selector', this.SETTINGS.HP_MAX_PATH);

        const currentHp = this._getNestedValue(actor, currentPath);
        const maxHp = this._getNestedValue(actor, maxPath);

        if (typeof currentHp !== 'number' || typeof maxHp !== 'number') return 1;
        if (maxHp <= 0) return 1;

        return Math.max(0, Math.min(1, currentHp / maxHp));
    }

    static _refreshTintsByActor(updatedActor) {
        if (!game.settings.get('character-chat-selector', this.SETTINGS.USE_HP_TINT)) return;
        
        const containers = document.querySelectorAll('.chat-portrait-container');
        containers.forEach(container => {
            const messageId = container.dataset.messageId;
            if (!messageId) return;
            const message = game.messages.get(messageId);
            if (!message) return;

            if (message.speaker.actor === updatedActor.id) {
                // 메시지 화자 조건 재확인 (Unlinked 액터 필터링 등)
                const actorToUse = this._getActorFromSpeaker(message.speaker);
                this._updateTintForElement(container, actorToUse);
            }
        });
    }

    static _refreshTintsByToken(updatedTokenDoc) {
        if (!game.settings.get('character-chat-selector', this.SETTINGS.USE_HP_TINT)) return;

        const containers = document.querySelectorAll('.chat-portrait-container');
        containers.forEach(container => {
            const messageId = container.dataset.messageId;
            if (!messageId) return;
            const message = game.messages.get(messageId);
            if (!message) return;

            if (message.speaker.token === updatedTokenDoc.id) {
                const actorToUse = updatedTokenDoc.actor;
                this._updateTintForElement(container, actorToUse);
            }
        });
    }
    
    static _refreshAllTints() {
        const containers = document.querySelectorAll('.chat-portrait-container');
        containers.forEach(container => {
            const messageId = container.dataset.messageId;
            if (!messageId) return;
            const message = game.messages.get(messageId);
            if (!message) return;
            
            const actor = this._getActorFromSpeaker(message.speaker);
            this._updateTintForElement(container, actor);
        });
    }

    static _updateTintForElement(container, actor) {
        let hpOverlay = container.querySelector('.hp-overlay');
        
        if (!game.settings.get('character-chat-selector', this.SETTINGS.USE_HP_TINT)) {
            if (hpOverlay) hpOverlay.remove();
            return;
        }

        if (!hpOverlay) {
            hpOverlay = document.createElement('div');
            hpOverlay.classList.add('hp-overlay');
            container.appendChild(hpOverlay);
        }

        // actor가 null이면 ratio는 1이 됨 -> damagePercent 0 -> 투명
        const hpRatio = this._getHpRatio(actor);
        const intensity = game.settings.get('character-chat-selector', this.SETTINGS.HP_TINT_INTENSITY);
        const damagePercent = (1 - hpRatio) * 100;

        requestAnimationFrame(() => {
            if (damagePercent <= 0) {
                hpOverlay.style.background = 'transparent';
            } else {
                hpOverlay.style.background = `linear-gradient(to top, 
                    rgba(255, 0, 0, ${intensity}) 0%, 
                    rgba(255, 0, 0, ${intensity * 0.8}) ${damagePercent}%, 
                    transparent ${damagePercent + 10}%)`;
            }
        });
    }

    static applyTintToPortrait(portraitContainer, message) {
        // [수정] portraitContainer가 없으면(null이면) 중단하는 코드 추가
        if (!portraitContainer) return;

        portraitContainer.dataset.messageId = message.id;
        const actor = this._getActorFromSpeaker(message.speaker);
        this._updateTintForElement(portraitContainer, actor);
    }

    static injectStyles() {
        if (!document.querySelector('#hp-tint-styles')) {
            const style = document.createElement('style');
            style.id = 'hp-tint-styles';
            style.textContent = `
                .hp-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    mix-blend-mode: multiply;
                    transition: background 0.3s ease;
                    z-index: 20;
                    border-radius: inherit;
                }

                .portrait-cyber .hp-overlay {
                    clip-path: polygon(0 10%, 10% 0, 90% 0, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0 90%);
                }
            `;
            document.head.appendChild(style);
        }
    }
}