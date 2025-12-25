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

        Hooks.once('ready', () => {
            if (game.settings.get(this.ID, this.SETTINGS.ENABLE_OPTIMIZATION)) {
                this._injectOptimization();
            }
        });
    }

    static _injectOptimization() {
        console.log("Character Chat Selector | Injecting V13-Safe Chat Optimization...");

        const ChatLog = foundry.applications.sidebar.tabs.ChatLog;
        const self = this;

        const originalPostOne = ChatLog.prototype.postOne;
        const originalScroll = ChatLog.prototype._onScrollLog;

        Object.defineProperty(CONFIG.ChatMessage, 'batchSize', {
            get: () => game.settings.get(self.ID, self.SETTINGS.BATCH_SIZE),
            configurable: true 
        });

        ChatLog.prototype.ccsPrune = function() {
            const max = game.settings.get(self.ID, self.SETTINGS.MAX_MESSAGES);
            const log = document.getElementById("chat-log");
            if (!log) return;
            const dist = log.scrollHeight - log.clientHeight - log.scrollTop;
            if (dist > 200) return; 
            if (log.childElementCount > max) {
                const toRemoveCount = log.childElementCount - max;
                if (toRemoveCount <= 0) return;
                for (let i = 0; i < toRemoveCount; i++) {
                    if (log.firstElementChild) {
                        log.firstElementChild.remove();
                    }
                }
            }
        };

        ChatLog.prototype.ccsSchedulePrune = function(timeout = 100) {
            if (this._ccsPruneTimeout) {
                window.clearTimeout(this._ccsPruneTimeout);
            }
            this._ccsPruneTimeout = window.setTimeout(() => {
                this._ccsPruneTimeout = null;
                this.ccsPrune();
            }, timeout);
        };

        ChatLog.prototype.postOne = async function(message, notify = false) {
            const result = await originalPostOne.call(this, message, notify);
            this.ccsSchedulePrune();

            return result;
        };

        ChatLog.prototype._onScrollLog = function(event) {
            if (originalScroll) originalScroll.call(this, event);

            const log = event.target;
            if (!log) return;
        };
        
        const originalDelete = ChatLog.prototype.deleteMessage;
        ChatLog.prototype.deleteMessage = function(messageId, { deleteAll = false } = {}) {
            if (deleteAll) {
                const log = this.element.find('#chat-log');
                if (log.length) log.html('');
                return originalDelete.call(this, messageId, { deleteAll });
            }
            return originalDelete.call(this, messageId, { deleteAll });
        };
    }
}