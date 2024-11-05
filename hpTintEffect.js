// hpTintEffect.js
export class HpTintEffect {
    static SETTINGS = {
        USE_HP_TINT: 'useHpTint',
        HP_TINT_INTENSITY: 'hpTintIntensity',
        HP_CURRENT_PATH: 'hpCurrentPath',
        HP_MAX_PATH: 'hpMaxPath'
    };

    static initialize() {
        this.registerSettings();
    }

    static registerSettings() {
        game.settings.register('character-chat-selector', this.SETTINGS.USE_HP_TINT, {
            name: "HP 상태 표시",
            hint: "HP가 낮아질수록 초상화가 붉게 변합니다",
            scope: 'client',
            config: true,
            type: Boolean,
            default: true
        });

        game.settings.register('character-chat-selector', this.SETTINGS.HP_TINT_INTENSITY, {
            name: "HP 상태 표시 강도",
            hint: "HP 상태 표시의 붉은색 강도를 설정합니다",
            scope: 'client',
            config: true,
            type: Number,
            range: {
                min: 0,
                max: 1,
                step: 0.1
            },
            default: 0.5
        });

        game.settings.register('character-chat-selector', this.SETTINGS.HP_CURRENT_PATH, {
            name: "현재 HP 경로",
            hint: "현재 HP값이 저장된 actor 데이터의 경로를 입력하세요",
            scope: 'world',
            config: true,
            type: String,
            default: this._getSystemDefaults().current
        });

        game.settings.register('character-chat-selector', this.SETTINGS.HP_MAX_PATH, {
            name: "최대 HP 경로",
            hint: "최대 HP값이 저장된 actor 데이터의 경로를 입력하세요",
            scope: 'world',
            config: true,
            type: String,
            default: this._getSystemDefaults().max
        });
    }

    static _getSystemDefaults() {
        const system = game.system.id;
        const defaults = {
            'dnd5e': {
                current: 'system.attributes.hp.value',
                max: 'system.attributes.hp.max'
            },
            'pf2e': {
                current: 'system.attributes.hp.value',
                max: 'system.attributes.hp.max'
            },
            'custom-system-builder': {
                current: 'system.props.hpvalue',
                max: 'system.props.hp'
            }
        };

        return defaults[system] || {
            current: 'system.attributes.hp.value',
            max: 'system.attributes.hp.max'
        };
    }

    static _getNestedValue(obj, path) {
        return path.split('.').reduce((current, part) => current && current[part], obj);
    }

    static _getHpRatio(speaker) {
        if (!speaker) return 1;
        
        let actor = null;

        if (speaker.actor) {
            actor = game.actors.get(speaker.actor);
        }
        
        if (!actor && speaker.token) {
            const token = canvas.tokens.get(speaker.token);
            actor = token?.actor;
        }
        
        if (!actor && speaker.alias) {
            actor = game.actors.find(a => a.name === speaker.alias);
        }

        if (!actor && speaker.actorId) {
            actor = game.actors.get(speaker.actorId);
        }

        if (!actor) {
            console.debug("HpTintEffect | No actor found for HP calculation", speaker);
            return 1;
        }

        const currentPath = game.settings.get('character-chat-selector', this.SETTINGS.HP_CURRENT_PATH);
        const maxPath = game.settings.get('character-chat-selector', this.SETTINGS.HP_MAX_PATH);

        const currentHp = this._getNestedValue(actor, currentPath) ?? 0;
        const maxHp = this._getNestedValue(actor, maxPath) ?? 1;

        if (typeof currentHp !== 'number' || typeof maxHp !== 'number' || maxHp <= 0) {
            console.debug("HpTintEffect | Invalid HP values", { currentHp, maxHp });
            return 1;
        }

        return Math.max(0, Math.min(1, currentHp / maxHp));
    }

    static _checkPathChanged(changes, path) {
        const parts = path.split('.');
        let current = changes;
        
        for (let i = 0; i < parts.length; i++) {
            if (!current.hasOwnProperty(parts[i])) {
                return false;
            }
            current = current[parts[i]];
        }
        
        return true;
    }

    static applyTintToPortrait(portraitContainer, message) {
        const useHpTint = game.settings.get('character-chat-selector', this.SETTINGS.USE_HP_TINT);
        if (!useHpTint) return;

        const hpOverlay = document.createElement('div');
        hpOverlay.classList.add('hp-overlay');
        portraitContainer.appendChild(hpOverlay);

        const updateHpTint = () => {
            const speakerInfo = {
                ...message.speaker,
                actorId: message.speaker?.actor,
                alias: message.alias || message.speaker?.alias
            };

            const hpRatio = this._getHpRatio(speakerInfo);
            const tintIntensity = game.settings.get('character-chat-selector', this.SETTINGS.HP_TINT_INTENSITY);
            const redOpacity = (1 - hpRatio) * tintIntensity;
            requestAnimationFrame(() => {
                hpOverlay.style.backgroundColor = `rgba(255, 0, 0, ${redOpacity})`;
            });
        };

        updateHpTint();

        const actor = game.actors.get(message.speaker?.actor);
        if (actor) {
            const hookId = `HpTintEffect.updateHpTint.${message.id}`;
            Hooks.off('updateActor', hookId);
            
            Hooks.on('updateActor', hookId, (updatedActor, changes) => {
                if (updatedActor.id === actor.id || 
                    (actor.token && updatedActor.id === actor.token.id)) {
                    const currentPath = game.settings.get('character-chat-selector', this.SETTINGS.HP_CURRENT_PATH);
                    const maxPath = game.settings.get('character-chat-selector', this.SETTINGS.HP_MAX_PATH);
                    
                    if (this._checkPathChanged(changes, currentPath) || 
                        this._checkPathChanged(changes, maxPath)) {
                        updateHpTint();
                    }
                }
            });

            return hookId;  // 훅 ID 반환하여 나중에 정리할 수 있도록 함
        }

        return null;
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
                    transition: background-color 0.3s ease-in-out;
                    background-color: rgba(255, 0, 0, 0);
                }

                .portrait-circle .hp-overlay {
                    border-radius: 50%;
                }

                .portrait-cyber .hp-overlay {
                    clip-path: polygon(0 10%, 10% 0, 90% 0, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0 90%);
                }
            `;
            document.head.appendChild(style);
        }
    }
}