/**
 * Chat Optimizer for Character Chat Selector
 * Based on the less-chat module by Trent Piepho (© 2025)
 * Adapted to work within CCS's module architecture.
 *
 * This replaces all ChatLog prototype methods that reference private variables
 * (#lastId, #renderingQueue, #renderingBatch, etc.) with public equivalents,
 * enabling proper message pruning, batch rendering, and scroll-based lazy loading.
 */
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

        if (!game.settings.get(this.ID, this.SETTINGS.ENABLE_OPTIMIZATION)) {
            return;
        }

        this._patchChatLog();
        console.log("Character Chat Selector | Chat optimization enabled (less-chat compatible)");

        Hooks.once('ready', () => {
            CONFIG.ChatMessage.batchSize = game.settings.get(this.ID, this.SETTINGS.BATCH_SIZE);
        });
    }

    static updateMax() {
        ui.chat?.updateMax?.();
    }

    static updateBatchSize() {
        CONFIG.ChatMessage.batchSize = game.settings.get(this.ID, this.SETTINGS.BATCH_SIZE);
    }

    static _patchChatLog() {
        const ChatLog = foundry.applications.sidebar.tabs.ChatLog;
        const self = this;

        ChatLog.prototype.prune = function () {
            const log = this.element.querySelector(".chat-log");
            const max = game.settings.get(self.ID, self.SETTINGS.MAX_MESSAGES);
            if (!log || log.childElementCount <= max) return;

            if (!this.isAtBottom) {
                this.schedulePrune(1000);
                return;
            }
            this.renderingQueue.add(async () => {
                const count = log.childElementCount;
                const toRemove = [...log.children].slice(0, count - max);
                toRemove.forEach((li) => {
                    const msg = game.messages.get(li.dataset.messageId);
                    if (msg) msg.logged = false;
                    log.removeChild(li);
                });
                this._lastId = (() => {
                    for (const next of log.children) {
                        if (game.messages.get(next.dataset.messageId)?.logged) return next.dataset.messageId;
                    }
                    return null;
                })();
            });
        };

        ChatLog.prototype.schedulePrune = function (timeout = 250) {
            if (this._ccsPruneTimeout) {
                window.clearTimeout(this._ccsPruneTimeout);
                this._ccsPruneTimeout = null;
            }
            this._ccsPruneTimeout = window.setTimeout(() => {
                this._ccsPruneTimeout = null;
                this.prune();
            }, timeout);
        };

        ChatLog.prototype.scheduleExpand = function (timeout = 250) {
            if (this._ccsExpandTimeout) {
                window.clearTimeout(this._ccsExpandTimeout);
                this._ccsExpandTimeout = null;
            }
            this._ccsExpandTimeout = window.setTimeout(() => {
                this._ccsExpandTimeout = null;
                this.updateMax();
            }, timeout);
        };

        ChatLog.prototype.updateMax = async function () {
            const log = this.element?.querySelector(".chat-log");
            if (!log) return;
            const count = log.childElementCount;
            const max = game.settings.get(self.ID, self.SETTINGS.MAX_MESSAGES);
            if (count < max) {
                this.renderBatch(max - count);
            } else if (count > max) {
                this.schedulePrune();
            }
        };

        ChatLog.prototype.__attachLogListeners = ChatLog.prototype._attachLogListeners;
        ChatLog.prototype.__onClose = ChatLog.prototype._onClose;

        ChatLog.prototype.postOne = async function (message, options = {}) {
            if (!message.visible) return;
            return this.renderingQueue.add(this._ccsPostOne.bind(this), message, options);
        };

        ChatLog.prototype._ccsPostOne = async function (message, { before, notify = false } = {}) {
            if (!this.rendered) return;
            message.logged = true;

            if (!this._lastId) this._lastId = message.id;
            if ((message.whisper || []).includes(game.user.id) && !message.isRoll) {
                this._lastWhisper = message;
            }

            const html = await this.constructor.renderMessage(message);
            const log = this.element.querySelector(".chat-log");

            const existing = before ? log.querySelector(`.message[data-message-id="${before}"]`) : null;
            if (existing) {
                existing.insertAdjacentElement("beforebegin", html);
            } else {
                log.append(html);
                if (this.isAtBottom || message.author._id === game.user._id) this.scrollBottom({ waitImages: true });
            }

            if (notify) this.notify(message, { existing: html, newMessage: true });

            await this.popout?._ccsPostOne(message, { before, notify: false });
            if (this.isPopout) this.setPosition();
            else this.overflowingDebounce();

            this.schedulePrune();
        };

        ChatLog.prototype.renderBatch = async function (size) {
            if (this.renderingBatch) return;
            this.renderingBatch = true;
            return this.renderingQueue.add(async () => {
                if (!this.rendered) {
                    this.renderingBatch = false;
                    return;
                }

                const messages = this.collection.contents;
                let lastIdx = messages.findIndex((m) => m.id === this._lastId);
                lastIdx = lastIdx > -1 ? lastIdx : messages.length;

                if (lastIdx !== 0) {
                    const targetIdx = Math.max(lastIdx - size, 0);
                    const elements = [];
                    for (let i = targetIdx; i < lastIdx; i++) {
                        const message = messages[i];
                        if (!message.visible) continue;
                        message.logged = true;
                        try {
                            elements.push(await this.constructor.renderMessage(message));
                        } catch (err) {
                            Hooks.onError("ChatLog##doRenderBatch(CCS)", err, {
                                msg: `Chat message ${message.id} failed to render`,
                                log: "error",
                            });
                        }
                    }

                    const log = this.element.querySelector(".chat-log");
                    if (log.scrollTop === 0) log.scrollTo({ top: 1, behavior: "instant" });
                    log.prepend(...elements);
                    this._lastId = messages[targetIdx].id;
                }
                this.renderingBatch = false;
                if (!this.isPopout) this.overflowingDebounce();
                this.schedulePrune(5000);
            });
        };

        ChatLog.prototype.deleteMessage = function (messageId, { deleteAll = false } = {}) {
            return this.renderingQueue.add(async () => {
                if (!this.rendered) return;

                const message = game.messages.get(messageId);
                if (message) message.logged = false;

                const li = this.element.querySelector(`.message[data-message-id="${messageId}"]`);
                if (!li) return;

                if (deleteAll) {
                    this._lastId = null;
                } else if (messageId === this._lastId) {
                    this._lastId = (() => {
                        let next = li;
                        while ((next = next.nextElementSibling)) {
                            if (game.messages.get(next.dataset.messageId)?.logged) return next.dataset.messageId;
                        }
                        return null;
                    })();
                }

                li.classList.add("deleting");
                li.animate(
                    { height: [`${li.getBoundingClientRect().height}px`, "0"] },
                    { duration: 100, easing: "ease" },
                ).finished.then(() => {
                    li.remove();
                    this.scheduleExpand();
                    this._ccsOnScrollLog();
                });

                if (!this.isPopout) {
                    const notificationsElement = document.getElementById("chat-notifications");
                    notificationsElement?.querySelector(`.message[data-message-id="${messageId}"]`)?.remove();
                }

                this.popout?.deleteMessage(messageId, { deleteAll });
                if (this.isPopout) this.setPosition();
                else this.overflowingDebounce();
            });
        };

        ChatLog.prototype.updateMessage = async function (message, options = {}) {
            return this.renderingQueue.add(this._ccsUpdateMessage.bind(this), message, options);
        };

        ChatLog.prototype._ccsUpdateMessage = async function (message, { notify = false } = {}) {
            const li = this.element.querySelector(`.message[data-message-id="${message.id}"]`);
            if (li) {
                await this._ccsRerenderMessage(message, li);
            } else {
                const messages = game.messages.contents;
                const messageIndex = messages.findIndex((m) => m === message);
                let nextMessage;
                for (let i = messageIndex + 1; i < messages.length; i++) {
                    if (messages[i].visible) {
                        nextMessage = messages[i];
                        break;
                    }
                }
                await this._ccsPostOne(message, { before: nextMessage?.id, notify: false });
            }

            if (!this.isPopout) {
                const notificationsElement = document.getElementById("chat-notifications");
                const existing = notificationsElement?.querySelector(`.message[data-message-id="${message.id}"]`);
                if (existing) await this._ccsRerenderMessage(message, existing, { canDelete: false, canClose: true });
            }

            if (notify) this.notify(message);

            await this.popout?.updateMessage(message, { notify: false });
            if (this.isPopout) this.setPosition();
            else this.overflowingDebounce();
        };

        ChatLog.prototype._ccsRerenderMessage = async function (message, existing, options = {}) {
            const replacement = await this.constructor.renderMessage(message, options);
            const expanded = Array.from(existing.querySelectorAll('[data-action="expandRoll"]')).map((el) =>
                el.classList.contains("expanded"),
            );
            replacement
                .querySelectorAll('[data-action="expandRoll"]')
                .forEach((r, i) => r.classList.toggle("expanded", expanded[i]));
            replacement.hidden = existing.hidden;
            replacement.style.opacity = existing.style.opacity;
            existing.replaceChildren(...replacement.childNodes);
            existing.className = replacement.className;
        };

        ChatLog.prototype._ccsOnScrollLog = function (event) {
            if (!this.rendered) return;
            if (!this._jumpToBottomElement) this._jumpToBottomElement = this.element.querySelector(".jump-to-bottom");

            const log = event?.currentTarget ?? this.element.querySelector(".chat-scroll");
            this.isAtBottom = log.scrollHeight - log.clientHeight - log.scrollTop < 2;
            if (!this.isAtBottom && log.scrollTop < 100) {
                this.renderBatch(CONFIG.ChatMessage.batchSize);
            }
            log.classList.toggle("scrolled", !this.isAtBottom);
            this._jumpToBottomElement?.toggleAttribute("hidden", this.isAtBottom);
        };

        ChatLog.prototype._attachLogListeners = function (element, options) {
            const elementWrapper = {
                addEventListener: (e, f, o) => {
                    if (e !== "scroll") element.addEventListener(e, f, o);
                },
            };
            element.addEventListener("scroll", this._ccsOnScrollLog.bind(this), { passive: true });
            this.__attachLogListeners(elementWrapper, options);
        };

        ChatLog.prototype._onClose = function (options) {
            this.__onClose(options);
            this._lastId = null;
        };

        Object.defineProperty(ChatLog.prototype, "renderingBatch", { value: false, writable: true, enumerable: true });
        Object.defineProperty(ChatLog.prototype, "renderingQueue", {
            get() {
                return this._renderingQueue ?? (this._renderingQueue = new foundry.utils.Semaphore(1));
            },
        });
        Object.defineProperty(ChatLog.prototype, "overflowingDebounce", {
            get() {
                return (
                    this._overflowingDebounce ??
                    (this._overflowingDebounce = new foundry.utils.debounce(() => {
                        const scroll = this.element.querySelector(".chat-scroll");
                        if (scroll) scroll.classList.toggle("overflowed", scroll.scrollHeight > scroll.offsetHeight);
                    }, 100))
                );
            },
        });
        Object.defineProperty(ChatLog.prototype, "isAtBottom", { value: true, writable: true, enumerable: true });
    }
}
