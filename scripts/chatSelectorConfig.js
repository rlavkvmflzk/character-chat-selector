import { ChatSelector } from './chatSelector.js'; 

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ChatSelectorConfig extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        tag: "form",
        id: "chat-selector-config",
        classes: ["ccs-settings"],
        window: {
            title: "CHATSELECTOR.Config.Title",
            icon: "fas fa-comment-dots",
            resizable: true,
            width: 750,
            height: 750 
        },
        position: { width: 750, height: 600 },
        actions: {
            save: ChatSelectorConfig.prototype._onSave,
            reset: ChatSelectorConfig.prototype._onReset,
            tabSwitch: ChatSelectorConfig.prototype._onTabSwitch
        }
    };

    static PARTS = {
        content: { template: "modules/character-chat-selector/templates/settings.hbs" }
    };

    async _prepareContext(options) {
        // 모든 설정값 로드
        const settings = {};
        const settingKeys = [
            'showSelector', 'speakAsToken', 
            'allowPersonalThemes', // World
            'showPortrait', 'portraitSize', 'portraitBorder', 'portraitBorderColor',
            'useUserColor', 'useUserBorder', 'chatBorderColor',
            'useSecondaryColor', 'secondaryColor',
            'useGlowEffect', 'glowColor', 'glowStrength',
            'useHpTint', 'hpTintIntensity', 'hpCurrentPath', 'hpMaxPath',
            'hideDnd5ePortrait', 'hideWfrp4ePortrait', 'allowedModuleFlags', // World
            'dropdownBackground', 'dropdownTextColor', 'dropdownBorderColor', 'dropdownHoverColor', 'enableThumbnailPreview',
            'enableRuby', 'rubyTextSize', 'rubyTextColor',
            'enableChatOptimization', 'maxChatMessages', 'chatBatchSize',
            'enableNotificationSound', 'playNotificationForSelf', 'notificationSoundPath', 'notificationVolume'
        ];

        settingKeys.forEach(key => {
            // 일부 설정은 존재하지 않을 수도 있으므로 try-catch 또는 기본값 처리
            try {
                settings[key] = game.settings.get('character-chat-selector', key);
            } catch (e) {
                // 설정이 아직 등록되지 않은 경우(구버전 등) 무시
            }
        });

        // 테두리 스타일 옵션
        const borderOptions = {
            'default': 'CHATSELECTOR.Settings.PortraitBorder.Choices.Default',
            'none': 'CHATSELECTOR.Settings.PortraitBorder.Choices.None',
            'square': 'CHATSELECTOR.Settings.PortraitBorder.Choices.Square',
            'circle': 'CHATSELECTOR.Settings.PortraitBorder.Choices.Circle',
            'minimalist': 'CHATSELECTOR.Settings.PortraitBorder.Choices.minimalist',
            'cyber': 'CHATSELECTOR.Settings.PortraitBorder.Choices.cyber'
        };

        return {
            settings,
            borderOptions,
            userColor: game.user.color,
            isGM: game.user.isGM,
            previewImg: game.user.avatar || "icons/svg/mystery-man.svg",
            systemId: game.system.id  
        };
    }

    _onRender(context, options) {
        // [수정] 통합 input 이벤트 리스너
        this.element.addEventListener("input", (e) => {
            const target = e.target;

            // 1. Range 슬라이더 숫자값 실시간 업데이트
            if (target.type === "range") {
                // 바로 옆(혹은 부모 내)의 .range-value 찾기
                const display = target.parentElement.querySelector(".range-value");
                
                if (display) {
                    let suffix = "";
                    // 픽셀 단위가 필요한 경우
                    if (target.name === "portraitSize") suffix = "px";
                    
                    display.textContent = target.value + suffix;
                }
            }

            // 2. 미리보기 화면 업데이트 (관련된 설정이 변경되었을 때만)
            if (target.name === "portraitSize" || 
                target.name === "glowStrength" || 
                target.name === "hpTintIntensity" ||
                target.type === "color" || 
                target.type === "checkbox" ||
                target.tagName === "SELECT") {
                
                this._updatePreview();
            }
            
            if (e.target.name.startsWith("dropdown") || e.target.name === "enableThumbnailPreview") {
                this._updatePreview();
            } else {
                // 기존 미리보기 업데이트 (Portrait 등)
                this._updatePreview();
            }
        });

        // change 이벤트 (색상 선택기 완료 시점 등 보완)
        this.element.addEventListener("change", (e) => {
             this._updatePreview();
        });
        
        // 초기 미리보기 설정
        this._updatePreview();
        
        // 탭 초기화
        this._activateTab("general");
    }

    _activateTab(tabName) {
        const navs = this.element.querySelectorAll(".ccs-tabs .item");
        const contents = this.element.querySelectorAll(".tab-content");

        navs.forEach(n => {
            if (n.dataset.tab === tabName) n.classList.add("active");
            else n.classList.remove("active");
        });

        contents.forEach(c => {
            if (c.dataset.tab === tabName) {
                c.classList.add("active");
                c.style.display = "block";
            } else {
                c.classList.remove("active");
                c.style.display = "none";
            }
        });
    }

    _onTabSwitch(event, target) {
        const tab = target.dataset.tab;
        this._activateTab(tab);
    }

    _updatePreview() {
        const formData = new FormDataExtended(this.element).object;
        
        // [추가] 드롭다운 스타일 실시간 주입 (실제 UI 변경)
        // 사용자가 설정창을 움직여 실제 드롭다운을 보면서 색을 고를 수 있게 함
        ChatSelector._updateDropdownStyles(formData);

        const previewContainer = this.element.querySelector('.ccs-preview-portrait');
        const previewMsg = this.element.querySelector('.ccs-preview-message');
        const hpOverlay = this.element.querySelector('.ccs-preview-hp');
        
        if (!previewContainer) return;

        // 1. 포트레잇 스타일 적용
        const size = formData.portraitSize || 36;
        const borderStyle = formData.portraitBorder || 'default';
        
        // 색상 결정 로직
        let primary = formData.portraitBorderColor;
        if (formData.useUserColor) primary = game.user.color;

        let secondary = formData.useSecondaryColor ? formData.secondaryColor : primary;
        let glow = formData.glowColor;
        let glowStrength = formData.useGlowEffect ? formData.glowStrength : 0;

        // CSS 변수 주입
        previewContainer.style.setProperty('--portrait-size', `${size}px`);
        previewContainer.style.setProperty('--primary-color', primary);
        previewContainer.style.setProperty('--secondary-color', secondary);
        previewContainer.style.setProperty('--glow-color', glow);
        previewContainer.style.setProperty('--glow-strength', `${glowStrength}px`);
        
        // Secondary Color 사용 여부 (Flag)
        previewContainer.style.setProperty('--use-secondary-color', formData.useSecondaryColor ? '1' : '0');

        // 클래스 재설정
        previewContainer.className = `ccs-preview-portrait chat-portrait-container portrait-${borderStyle}`;
        if (formData.useGlowEffect) previewContainer.classList.add('animated-glow');

        // 2. 채팅 메시지 테두리 적용
        if (previewMsg) {
            const chatBorder = formData.useUserBorder ? game.user.color : formData.chatBorderColor;
            
            // 변수 주입
            previewMsg.style.setProperty('--ccs-chat-border-color', chatBorder);
            
            // 미리보기용 강제 스타일 (CSS 파일 로드 여부와 관계없이 보이게)
            previewMsg.style.border = `1px solid ${chatBorder}`;
        }

        // 3. HP Tint 미리보기 (가상으로 50% 데미지 적용)
        if (hpOverlay) {
            if (formData.useHpTint) {
                const intensity = formData.hpTintIntensity || 0.6;
                const damagePercent = 50; // 예시값
                hpOverlay.style.background = `linear-gradient(to top, 
                    rgba(255, 0, 0, ${intensity}) 0%, 
                    rgba(255, 0, 0, ${intensity * 0.8}) ${damagePercent}%, 
                    transparent ${damagePercent + 10}%)`;
                hpOverlay.style.display = "block";
                
                // 사이버펑크 컷팅 적용
                if (borderStyle === 'cyber') {
                     hpOverlay.style.clipPath = "polygon(0 10%, 10% 0, 90% 0, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0 90%)";
                } else {
                     hpOverlay.style.clipPath = "none";
                }

            } else {
                hpOverlay.style.display = "none";
            }
        }
    }

    async _onSave(event, target) {
        event.preventDefault();
        const formData = new FormDataExtended(this.element).object;

        // 1. 설정값 저장 (onChange 훅들이 자동으로 트리거됨)
        for (const [key, value] of Object.entries(formData)) {
            try {
                await game.settings.set('character-chat-selector', key, value);
            } catch (e) {
                console.warn(`[CCS] Could not save setting ${key}:`, e);
            }
        }

        // 2. 테마 플래그 동기화
        await this._syncUserFlags(formData);

        // [수정] ui.chat.render(true) 대신 아래 메서드들 호출
        // 이미 렌더링된 메시지들의 스타일만 즉시 갱신
        ChatSelector.updateExistingMessages(); 
        // 선택기 UI 갱신
        ChatSelector.refreshSelector(); 

        this.close();
        ui.notifications.info(game.i18n.localize("CHATSELECTOR.Save") + " " + game.i18n.localize("CHATSELECTOR.Settings.Saved"));
    }

    async _syncUserFlags(data) {
        const themeData = {
            portraitSize: data.portraitSize,
            borderStyle: data.portraitBorder,
            useUserColor: data.useUserColor,
            borderColor: data.portraitBorderColor,
            useSecondary: data.useSecondaryColor,
            secondaryColor: data.secondaryColor,
            useGlow: data.useGlowEffect,
            glowColor: data.glowColor,
            glowStrength: data.glowStrength
        };
        await game.user.setFlag('character-chat-selector', 'userTheme', themeData);
    }

    async _onReset(event, target) {
        const confirm = await Dialog.confirm({
            title: game.i18n.localize("CHATSELECTOR.Settings.FactoryReset.ConfirmTitle"),
            content: game.i18n.localize("CHATSELECTOR.Settings.FactoryReset.ConfirmContent")
        });

        if (confirm) {
            // chatSelector.js에 있는 초기화 로직을 호출하거나 직접 수행
            const MODULE_ID = 'character-chat-selector';
            const allSettings = Array.from(game.settings.settings.keys());
            
            for (const key of allSettings) {
                if (key.startsWith(`${MODULE_ID}.`)) {
                    const settingName = key.split('.')[1];
                    const settingDef = game.settings.settings.get(key);
                    if (settingName === 'factoryReset') continue;

                    try {
                        if (settingDef.scope === 'world' && !game.user.isGM) continue;
                        await game.settings.set(MODULE_ID, settingName, settingDef.default);
                    } catch (err) { }
                }
            }
            
            await game.user.unsetFlag(MODULE_ID, "userTheme");
            
            ui.notifications.info("Reset complete. Reloading...");
            setTimeout(() => location.reload(), 1000);
        }
    }
}