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

        // 모든 채팅 로그(사이드바 + v13 접힘 상태)를 찾기 위한 헬퍼
        const getAllChatLogs = () => document.querySelectorAll('.chat-log');

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
                    document.querySelectorAll(".chat-scroll").forEach(scroll => {
                        scroll.classList.toggle("overflowed", scroll.scrollHeight > scroll.offsetHeight);
                    });
                }, 100));
            }
        });

        // Prune
        ChatLog.prototype.ccsPrune = function () {
            const max = game.settings.get(self.ID, self.SETTINGS.MAX_MESSAGES);
            const logs = getAllChatLogs();

            logs.forEach(log => {
                if (log.childElementCount > max) {
                    const scroll = log.closest('.chat-scroll') || log.parentElement;
                    if (!scroll) return;

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

                        if (log.closest('#sidebar')) {
                            this._ccsLastId = (() => {
                                for (const next of log.children) {
                                    if (game.messages.get(next.dataset.messageId)?._ccsLogged) return next.dataset.messageId;
                                }
                                return null;
                            })();
                        }
                    });
                }
            });
        };

        ChatLog.prototype.ccsSchedulePrune = function (timeout = 250) {
            if (this._ccsPruneTimeout) {
                window.clearTimeout(this._ccsPruneTimeout);
            }
            this._ccsPruneTimeout = window.setTimeout(() => {
                this._ccsPruneTimeout = null;
                this.ccsPrune();
            }, timeout);
        };

        // Render Batch
        ChatLog.prototype.ccsRenderBatch = function (size) {
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
                            // [수정] getHTML -> renderHTML (v13 호환성)
                            const html = await message.renderHTML();
                            const node = (html instanceof HTMLElement) ? html : html[0];
                            if (node) elements.push(node);
                        } catch (err) {
                            console.error(`ChatSelector | Failed to render message ${message.id}`, err);
                        }
                    }

                    const logs = getAllChatLogs();
                    logs.forEach(log => {
                        const scroll = log.closest('.chat-scroll') || log.parentElement;
                        if (!scroll) return;

                        const prevHeight = scroll.scrollHeight;
                        const prevTop = scroll.scrollTop;

                        elements.forEach(el => {
                            log.prepend(el.cloneNode(true));
                        });

                        const newHeight = scroll.scrollHeight;
                        const heightDiff = newHeight - prevHeight;
                        scroll.scrollTop = prevTop + heightDiff;
                    });

                    if (messages[targetIdx]) {
                        this._ccsLastId = messages[targetIdx].id;
                    }
                }

                this._ccsRenderingBatch = false;
                if (!this.isPopout) this.ccsOverflowDebounce();
                this.ccsSchedulePrune(5000);
            });
        };

        // postOne
        ChatLog.prototype.postOne = async function (message, notify = false) {
            if (!message.visible) return;

            return this.ccsRenderingQueue.add(async () => {
                if (!this.rendered) return;

                message._ccsLogged = true;
                if (!this._ccsLastId) this._ccsLastId = message.id;

                // [수정] getHTML -> renderHTML (v13 호환성)
                const html = await message.renderHTML();
                const logs = getAllChatLogs();

                if (logs.length === 0) return;

                const node = (html instanceof HTMLElement) ? html : html[0];
                if (!node) return;

                logs.forEach(log => {
                    const scroll = log.closest('.chat-scroll') || log.parentElement;
                    if (!scroll) return;

                    const dist = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop;
                    const wasAtBottom = dist < 20;

                    log.append(node.cloneNode(true));

                    if (wasAtBottom || message.isAuthor) {
                        scroll.scrollTop = scroll.scrollHeight;
                    }
                });

                if (notify) this.notify(message);

                if (this.isPopout) this.setPosition();
                else this.ccsOverflowDebounce();

                this.ccsSchedulePrune();
            });
        };

        // _onScrollLog
        ChatLog.prototype._onScrollLog = function (event) {
            if (!this.rendered) return;

            const scroll = event?.currentTarget;
            if (!scroll) return;

            const el = scroll.closest('#sidebar') || scroll.closest('.overflow') || scroll.parentElement;
            const jumpEl = el?.querySelector(".jump-to-bottom");

            const isAtBottom = (scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop) < 50;

            if (scroll.scrollTop < 50 && !this._ccsRenderingBatch) {
                const batchSize = game.settings.get(self.ID, self.SETTINGS.BATCH_SIZE);
                this.ccsRenderBatch(batchSize);
            }

            if (jumpEl) {
                if (isAtBottom) jumpEl.classList.add("hidden");
                else jumpEl.classList.remove("hidden");
            }
        };

        // deleteMessage
        ChatLog.prototype.deleteMessage = function(messageId, { deleteAll = false } = {}) {

            const now = Date.now();
            const diff = now - (this._ccsLastReqTime || 0);
            this._ccsLastReqTime = now;
            
            const isRapid = diff < 100; 

            return this.ccsRenderingQueue.add(async () => {
                if (!this.rendered) return;

                if (deleteAll) {
                    this._ccsLastId = null;
                    const logs = document.querySelectorAll('.chat-log');
                    logs.forEach(log => log.innerHTML = ""); 
                    return; 
                }

                const message = game.messages.get(messageId);
                if (message) message._ccsLogged = false;

                const logs = document.querySelectorAll('.chat-log');
                const targets = [];

                logs.forEach(log => {
                     const li = log.querySelector(`.message[data-message-id="${messageId}"]`);
                     if (li) {
                         if (messageId === this._ccsLastId && log.closest('#sidebar')) {
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

                         if (isRapid) {
                             li.remove(); 
                         } else {
                             li.style.height = `${li.offsetHeight}px`;
                             li.classList.add("deleting");
                             targets.push(li);
                         }
                     }
                });

                if (targets.length > 0) {
                    await new Promise(r => setTimeout(r, 100));
                    targets.forEach(li => li.style.height = "0");
                    await new Promise(r => setTimeout(r, 100));
                    targets.forEach(li => li.remove());
                }
            });
        };

        const originalAttachListeners = ChatLog.prototype._attachLogListeners;
        ChatLog.prototype._attachLogListeners = function (html) {
            originalAttachListeners.call(this, html);
            const $html = (html instanceof HTMLElement) ? $(html) : html;
            const scrollEl = $html.find(".chat-scroll");
            scrollEl.off("scroll");
            scrollEl.on("scroll", this._onScrollLog.bind(this));
        };
    }
}