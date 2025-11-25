export class ChatOptimizer {
    static ID = 'character-chat-selector';
    static SETTINGS = {
        ENABLE_OPTIMIZATION: 'enableChatOptimization',
        MAX_MESSAGES: 'maxChatMessages',
        BATCH_SIZE: 'chatBatchSize'
    };

    static initialize() {
        if (game.modules.get("less-chat")?.active) {
            console.log("Character Chat Selector | 'Less Chat' module detected. Built-in optimization disabled.");
            return;
        }

        this.registerSettings();

        Hooks.once('ready', () => {
            if (game.settings.get(this.ID, this.SETTINGS.ENABLE_OPTIMIZATION)) {
                this._injectOptimization();
            }
        });
    }

    static registerSettings() {
        game.settings.register(this.ID, this.SETTINGS.ENABLE_OPTIMIZATION, {
            name: game.i18n.localize("CHATSELECTOR.Settings.EnableOptimization.Name"),
            hint: game.i18n.localize("CHATSELECTOR.Settings.EnableOptimization.Hint"),
            scope: "client",
            config: true,
            type: Boolean,
            default: true,
            requiresReload: true
        });

        game.settings.register(this.ID, this.SETTINGS.MAX_MESSAGES, {
            name: game.i18n.localize("CHATSELECTOR.Settings.MaxMessages.Name"),
            hint: game.i18n.localize("CHATSELECTOR.Settings.MaxMessages.Hint"),
            scope: "client",
            config: true,
            type: Number,
            default: 50,
            onChange: () => ui.chat?.render(true)
        });

        game.settings.register(this.ID, this.SETTINGS.BATCH_SIZE, {
            name: game.i18n.localize("CHATSELECTOR.Settings.BatchSize.Name"),
            hint: game.i18n.localize("CHATSELECTOR.Settings.BatchSize.Hint"),
            scope: "client",
            config: true,
            type: Number,
            default: 20
        });
    }

    static _injectOptimization() {
        console.log("Character Chat Selector | Injecting Chat Optimization...");

        const ChatLog = foundry.applications.sidebar.tabs.ChatLog;
        const self = this;

        const getElement = (app) => {
            if (!app.element) return null;
            return (app.element instanceof HTMLElement) ? app.element : app.element[0];
        };

        Object.defineProperty(CONFIG.ChatMessage, 'batchSize', {
            get: () => game.settings.get(self.ID, self.SETTINGS.BATCH_SIZE)
        });

        Object.defineProperty(ChatLog.prototype, "ccsRenderingQueue", {
            get() {
                return this._ccsRenderingQueue ?? (this._ccsRenderingQueue = new foundry.utils.Semaphore(1));
            }
        });

        Object.defineProperty(ChatLog.prototype, "ccsOverflowDebounce", {
            get() {
                return this._ccsOverflowDebounce ?? (this._ccsOverflowDebounce = foundry.utils.debounce(() => {
                    const el = getElement(this);
                    const scroll = el?.querySelector(".chat-scroll");
                    if(scroll) scroll.classList.toggle("overflowed", scroll.scrollHeight > scroll.offsetHeight);
                }, 100));
            }
        });

        // 3. 메서드 오버라이딩

        // [New] Prune
        ChatLog.prototype.ccsPrune = function() {
            const el = getElement(this);
            const log = el?.querySelector(".chat-log");
            const scroll = el?.querySelector(".chat-scroll");
            const max = game.settings.get(self.ID, self.SETTINGS.MAX_MESSAGES);

            if (log?.childElementCount > max) {
                // 현재 스크롤이 바닥 근처가 아니라면 삭제 보류 (사용자가 위쪽을 읽는 중일 수 있음)
                // 삭제 시 스크롤 튀는 현상 방지
                const dist = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop;
                if (dist > 50) {
                    this.ccsSchedulePrune(2000);
                    return;
                }

                this.ccsRenderingQueue.add(async () => {
                    const count = log.childElementCount;
                    const toRemoveCount = count - max;
                    if (toRemoveCount <= 0) return;

                    const children = [...log.children];
                    const toRemove = children.slice(0, toRemoveCount);

                    toRemove.forEach((li) => {
                        const msg = game.messages.get(li.dataset.messageId);
                        if (msg) msg._ccsLogged = false; 
                        li.remove();
                    });

                    this._ccsLastId = (() => {
                        for (const next of log.children) {
                            if (game.messages.get(next.dataset.messageId)?._ccsLogged) return next.dataset.messageId;
                        }
                        return null;
                    })();
                });
            }
        };

        // [New] Schedule Prune
        ChatLog.prototype.ccsSchedulePrune = function(timeout = 250) {
            if (this._ccsPruneTimeout) {
                window.clearTimeout(this._ccsPruneTimeout);
            }
            this._ccsPruneTimeout = window.setTimeout(() => {
                this._ccsPruneTimeout = null;
                this.ccsPrune();
            }, timeout);
        };

        // [New] Render Batch (무한 스크롤 - 핵심 수정)
        ChatLog.prototype.ccsRenderBatch = function(size) {
            if (this._ccsRenderingBatch) return;
            this._ccsRenderingBatch = true;

            return this.ccsRenderingQueue.add(async () => {
                if (!this.rendered) {
                    this._ccsRenderingBatch = false;
                    return;
                }

                const messages = this.collection.contents;
                let lastIdx = messages.findIndex((m) => m.id === this._ccsLastId);
                lastIdx = lastIdx > -1 ? lastIdx : messages.length;

                if (lastIdx !== 0) {
                    const targetIdx = Math.max(lastIdx - size, 0);
                    const elements = [];
                    
                    for (let i = targetIdx; i < lastIdx; i++) {
                        const message = messages[i];
                        if (!message.visible) continue;
                        
                        message._ccsLogged = true;
                        try {
                            const html = await message.getHTML();
                            const node = (html instanceof HTMLElement) ? html : html[0];
                            if(node) elements.push(node);
                        } catch (err) {
                            console.error(`ChatSelector | Failed to render message ${message.id}`, err);
                        }
                    }

                    const el = getElement(this);
                    const log = el?.querySelector(".chat-log");
                    const scroll = el?.querySelector(".chat-scroll");
                    
                    if (log && scroll) {
                        // [핵심] 높이 변화량만큼 스크롤 위치 보정 (Jitter 방지)
                        const prevHeight = scroll.scrollHeight;
                        const prevTop = scroll.scrollTop;

                        log.prepend(...elements);

                        const newHeight = scroll.scrollHeight;
                        const heightDiff = newHeight - prevHeight;
                        
                        // 내용이 추가된 만큼 스크롤을 아래로 밀어줌 -> 시각적 위치 고정
                        scroll.scrollTop = prevTop + heightDiff;
                        
                        this._ccsLastId = messages[targetIdx].id;
                    }
                }
                
                this._ccsRenderingBatch = false;
                if (!this.isPopout) this.ccsOverflowDebounce();
                this.ccsSchedulePrune(5000);
            });
        };

        // [Override] postOne: 메시지 추가 (강제 스크롤 방지 로직 강화)
        ChatLog.prototype.postOne = async function(message, notify = false) {
            if (!message.visible) return;

            return this.ccsRenderingQueue.add(async () => {
                if (!this.rendered) return;
                
                message._ccsLogged = true;
                if (!this._ccsLastId) this._ccsLastId = message.id;

                const html = await message.getHTML();
                const el = getElement(this);
                const list = el?.querySelector(".chat-log");
                const scroll = el?.querySelector(".chat-scroll");

                if (!list || !scroll) return; 

                // [중요] 변수에 의존하지 않고, 메시지를 추가하기 직전의 DOM 상태를 계산
                // 바닥에서 20px 이내에 있으면 '바닥을 보고 있다'고 판단 (좀 더 엄격하게)
                const dist = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop;
                const wasAtBottom = dist < 20;

                const node = (html instanceof HTMLElement) ? html : html[0];
                if (node) list.append(node);

                // 1. 내가 쓴 글이면 무조건 내림
                // 2. 내가 바닥을 보고 있었다면(wasAtBottom) 내림
                // -> 내가 위를 보고 있었다면(wasAtBottom == false) 절대 내리지 않음
                if (wasAtBottom || message.isAuthor) {
                    this.scrollBottom({ waitImages: true });
                }

                if (notify) this.notify(message);

                if (this.isPopout) this.setPosition();
                else this.ccsOverflowDebounce();

                this.ccsSchedulePrune();
            });
        };

        // [Override] _onScrollLog
        ChatLog.prototype._onScrollLog = function(event) {
            if (!this.rendered) return;
            
            const el = getElement(this);
            const scroll = event?.currentTarget ?? el?.querySelector(".chat-scroll");
            if(!scroll) return;

            const jumpEl = el?.querySelector(".jump-to-bottom");

            // 바닥 상태 체크 (UI 표시용)
            const isAtBottom = (scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop) < 50;

            // 위로 스크롤 시 배치 렌더링 (상단 50px 이내 진입 시)
            if (scroll.scrollTop < 50 && !this._ccsRenderingBatch) {
                const batchSize = game.settings.get(self.ID, self.SETTINGS.BATCH_SIZE);
                this.ccsRenderBatch(batchSize);
            }

            if (jumpEl) {
                if (isAtBottom) jumpEl.classList.add("hidden");
                else jumpEl.classList.remove("hidden");
            }
        };
        
        // [Override] deleteMessage
        ChatLog.prototype.deleteMessage = function(messageId, { deleteAll = false } = {}) {
            return this.ccsRenderingQueue.add(async () => {
                if (!this.rendered) return;

                const message = game.messages.get(messageId);
                if (message) message._ccsLogged = false;

                const el = getElement(this);
                const li = el?.querySelector(`.message[data-message-id="${messageId}"]`);
                if (!li) return;

                if (deleteAll) {
                    this._ccsLastId = null;
                } else if (messageId === this._ccsLastId) {
                    let next = li;
                    let foundNext = null;
                    while ((next = next.nextElementSibling)) {
                        if (game.messages.get(next.dataset.messageId)?._ccsLogged) {
                            foundNext = next.dataset.messageId;
                            break;
                        }
                    }
                    this._ccsLastId = foundNext;
                }

                li.style.height = `${li.offsetHeight}px`;
                li.classList.add("deleting");
                
                await new Promise(r => setTimeout(r, 100));
                li.style.height = "0";
                
                await new Promise(r => setTimeout(r, 100));
                li.remove();
            });
        };
        
        const originalAttachListeners = ChatLog.prototype._attachLogListeners;
        ChatLog.prototype._attachLogListeners = function(html) {
            originalAttachListeners.call(this, html);
            const $html = (html instanceof HTMLElement) ? $(html) : html;
            const scrollEl = $html.find(".chat-scroll");
            scrollEl.off("scroll"); 
            scrollEl.on("scroll", this._onScrollLog.bind(this));
        };
    }
}