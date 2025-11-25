import { ChatAutocomplete } from './chatAutocomplete.js';

class ChatEditorApp extends Application {
    constructor(message, options = {}) {
        super(options);
        this.message = message;
        this.selectedActorId = message.speaker.actor || "";
        this.allActors = []; 
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "chat-editor-app",
            title: "Edit Message",
            width: 720,
            height: 500,
            resizable: true,
            classes: ["chat-editor-window"],
            minimizable: true
        });
    }

    getData() {
        if (this.allActors.length === 0) {
            const cachedActors = ChatAutocomplete.actors;
            
            const defaultImg = game.user.avatar || "icons/svg/mystery-man.svg";
            const defaultName = game.i18n.localize("CHATSELECTOR.Default");
            
            const defaultOption = {
                id: "",
                name: defaultName,
                img: defaultImg,
                nameLower: defaultName.toLowerCase()
            };

            this.allActors = [defaultOption, ...cachedActors];
        }

        const currentActor = this.allActors.find(a => a.id === this.selectedActorId);

        return {
            message: this.message,
            content: this.message.content,
            currentActorId: this.selectedActorId,
            currentImg: currentActor ? currentActor.img : (game.user.avatar || "icons/svg/mystery-man.svg"),
            currentName: currentActor ? currentActor.name : game.i18n.localize("CHATSELECTOR.Default"),
        };
    }

    async _renderInner(data) {
        const htmlContent = `
        <style>
            .chat-editor-window.app { background: #1e1e1e !important; border: 1px solid #333 !important; box-shadow: 0 0 20px rgba(0,0,0,0.8) !important; color: #f0f0f0 !important; }
            .chat-editor-window .window-header { background: #252525 !important; border-bottom: 1px solid #333 !important; color: #f0f0f0 !important; flex: 0 0 auto !important; }
            .chat-editor-window .window-content { padding: 0 !important; background-color: #1e1e1e !important; background-image: none !important; color: #f0f0f0 !important; overflow: hidden !important; }
            .editor-layout { display: flex; height: 100%; width: 100%; background-color: #1e1e1e; }
            .editor-sidebar { width: 240px; background-color: #181818 !important; border-right: 1px solid #333; display: flex; flex-direction: column; flex-shrink: 0; z-index: 1; }
            .search-box { padding: 10px; border-bottom: 1px solid #333; background-color: #181818; }
            .search-box input { background: #2a2a2a !important; border: 1px solid #444 !important; color: #ffffff !important; width: 100%; border-radius: 4px; padding: 6px 10px; }
            .search-box input::placeholder { color: #888 !important; }
            .search-box input:focus { box-shadow: 0 0 5px #5e97ff; border-color: #5e97ff !important; }
            .actor-list { flex: 1; overflow-y: auto; padding: 5px; background-color: #181818; }
            .actor-list::-webkit-scrollbar { width: 8px; background: #181818; }
            .actor-list::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
            .actor-item { display: flex; align-items: center; padding: 8px; gap: 10px; cursor: pointer; border-radius: 4px; margin-bottom: 4px; background-color: #2a2a2a !important; border: 1px solid #333 !important; color: #eeeeee !important; transition: all 0.2s; font-weight: 500; }
            .actor-item:hover { background-color: #333333 !important; border-color: #555 !important; color: #ffffff !important; transform: translateX(2px); }
            .actor-item.selected { background-color: #38485e !important; color: #ffffff !important; border: 1px solid #5e97ff !important; box-shadow: 0 0 5px rgba(94, 151, 255, 0.3); }
            .actor-item img { width: 36px; height: 36px; border-radius: 4px; border: 1px solid #000; object-fit: cover; background: #000; }
            .editor-main { flex: 1; display: flex; flex-direction: column; padding: 20px; background-color: #1e1e1e !important; min-width: 0; color: #f0f0f0; }
            .speaker-header { display: flex; align-items: center; gap: 15px; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #333; }
            .header-portrait { width: 56px; height: 56px; border-radius: 8px; border: 2px solid #444; box-shadow: 0 2px 8px rgba(0,0,0,0.5); }
            .header-info h3 { margin: 0; font-size: 18px; border: none; color: #ffffff !important; font-weight: bold; }
            .header-info span { color: #888888 !important; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold; }
            .editor-area { flex: 1; display: flex; flex-direction: column; }
            .editor-area textarea { flex: 1; width: 100%; background: #252525 !important; border: 1px solid #333 !important; color: #f0f0f0 !important; padding: 15px; border-radius: 6px; resize: none; font-family: inherit; font-size: 14px; line-height: 1.5; box-shadow: inset 0 2px 5px rgba(0,0,0,0.2); }
            .editor-area textarea:focus { outline: none; border-color: #5e97ff !important; background: #2a2a2a !important; }
            .editor-footer { margin-top: 15px; display: flex; justify-content: flex-end; gap: 10px; }
            .btn { padding: 8px 20px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
            .btn-cancel { background: transparent; border: 1px solid #555 !important; color: #aaaaaa !important; }
            .btn-cancel:hover { border-color: #888 !important; color: #ffffff !important; background: rgba(255,255,255,0.05); }
            .btn-save { background: #4a7cce !important; color: #ffffff !important; }
            .btn-save:hover { background: #5e97ff !important; box-shadow: 0 0 10px rgba(94, 151, 255, 0.3); transform: translateY(-1px); }
        </style>

        <div class="editor-layout">
            <div class="editor-sidebar">
                <div class="search-box">
                    <input type="text" placeholder="Search actors..." id="actorSearch">
                </div>
                <div class="actor-list" id="actorList">
                    <!-- JS로 동적 로딩 -->
                </div>
            </div>

            <div class="editor-main">
                <div class="speaker-header">
                    <img class="header-portrait" id="headerPortrait" src="${data.currentImg}">
                    <div class="header-info">
                        <span>Speaking As</span>
                        <h3 id="headerName">${data.currentName}</h3>
                    </div>
                </div>

                <div class="editor-area">
                    <textarea id="messageContent" placeholder="Type your message here...">${data.content}</textarea>
                </div>

                <div class="editor-footer">
                    <button type="button" class="btn btn-cancel" id="btnCancel">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                    <button type="button" class="btn btn-save" id="btnSave">
                        <i class="fas fa-check"></i> Save Changes
                    </button>
                </div>
            </div>
        </div>
        `;

        return $(htmlContent);
    }

    activateListeners(html) {
        super.activateListeners(html);

        const searchInput = html.find('#actorSearch');
        const actorList = html.find('#actorList');
        const headerPortrait = html.find('#headerPortrait');
        const headerName = html.find('#headerName');
        const textarea = html.find('#messageContent');

        // [최적화] 리스트 렌더링 함수 (상위 50개만 렌더링)
        const renderActorList = (query = "") => {
            const q = query.toLowerCase();

            // 1. 필터링 (가벼운 객체 순회)
            let matches = this.allActors;
            if (q) {
                matches = this.allActors.filter(a => a.nameLower.includes(q));
            }

            // 2. 상위 50개만 자르기
            const LIMIT = 50;
            const sliced = matches.slice(0, LIMIT);

            // 3. HTML 생성
            let listHtml = "";
            sliced.forEach(a => {
                const selected = a.id === this.selectedActorId ? 'selected' : '';
                listHtml += `
                    <div class="actor-item ${selected}" data-value="${a.id}" data-img="${a.img}" data-name="${a.name}">
                        <img src="${a.img}">
                        <span>${a.name}</span>
                    </div>
                `;
            });

            if (matches.length > LIMIT) {
                listHtml += `<div style="padding:10px; text-align:center; color:#666; font-style:italic;">...and ${matches.length - LIMIT} more</div>`;
            }
            if (matches.length === 0) {
                listHtml += `<div style="padding:10px; text-align:center; color:#666;">No matches found</div>`;
            }

            actorList.html(listHtml);
        };

        // 초기 렌더링
        renderActorList();

        let searchTimer;
        searchInput.on('input', (e) => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                renderActorList(e.target.value);
            }, 100);
        });

        actorList.on('click', '.actor-item', (e) => {
            const item = $(e.currentTarget);
            this.selectedActorId = item.data('value');
            const img = item.data('img');
            const name = item.data('name');

            headerPortrait.attr('src', img);
            headerName.text(name);

            actorList.find('.actor-item').removeClass('selected');
            item.addClass('selected');
        });

        html.find('#btnSave').on('click', async () => {
            const newContent = textarea.val();
            const newActorId = this.selectedActorId;
            const currentActorId = this.message.speaker.actor || "";

            const updateData = { content: newContent };

            if (newActorId !== currentActorId || (newActorId && !this.message.speaker.actor)) {
                if (newActorId) {
                    const actor = game.actors.get(newActorId);
                    if (actor) {
                        updateData.speaker = {
                            actor: actor.id,
                            alias: actor.name,
                            scene: game.scenes.current?.id,
                            token: null
                        };
                    }
                } else {
                    updateData.speaker = {
                        actor: null,
                        alias: game.user.name,
                        token: null,
                        scene: null
                    };
                }
            }

            await this.message.update(updateData);
            this.close();
        });

        html.find('#btnCancel').on('click', () => this.close());
        setTimeout(() => textarea.focus(), 50);
    }
}

export class ChatEditor {
    static initialize() {
        Hooks.on('getChatMessageContextOptions', (app, menuItems) => {
            this._addContextOptions(menuItems);
        });
    }

    static _addContextOptions(menuItems) {
        if (!Array.isArray(menuItems)) return;
        if (menuItems.some(o => o.name === "CHATSELECTOR.Edit")) return;

        menuItems.push({
            name: "CHATSELECTOR.Edit",
            icon: '<i class="fas fa-edit"></i>',
            condition: (li) => this._canEdit(li),
            callback: (li) => this._startEditing(li)
        });
    }

    static _resolveMessage(li) {
        const element = (li instanceof HTMLElement) ? li : (li[0] || li);
        if (!element) return null;
        let messageId = element.dataset?.messageId || element.dataset?.documentId;
        if (!messageId) {
            const parent = element.closest('[data-message-id], [data-document-id]');
            if (parent) messageId = parent.dataset.messageId || parent.dataset.documentId;
        }
        if (!messageId) return null;
        return game.messages.get(messageId);
    }

    static _canEdit(li) {
        const message = this._resolveMessage(li);
        if (!message) return false;
        if (!message.content) return false;
        if (message.rolls && message.rolls.length > 0) return false;
        return game.user.isGM || message.isAuthor;
    }

    static _startEditing(li) {
        const message = this._resolveMessage(li);
        if (!message) return;
        new ChatEditorApp(message).render(true);
    }
}