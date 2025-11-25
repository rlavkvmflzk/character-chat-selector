import { ChatSelector } from './chatSelector.js';

export class ChatAutocomplete {
    static _cachedActors = []; // 중앙 캐시 저장소

    // 외부에서 캐시된 가벼운 데이터에 접근할 수 있게 getter 제공
    static get actors() {
        if (!this._cachedActors || this._cachedActors.length === 0) {
            this._updateCache();
        }
        return this._cachedActors;
    }

    static initialize() {
        // 초기 캐싱
        Hooks.once('ready', () => this._updateCache());

        // 데이터 변경 시 캐시 갱신 (디바운스 적용으로 과부하 방지)
        const debouncedUpdate = foundry.utils.debounce(() => this._updateCache(), 200);
        
        Hooks.on('createActor', debouncedUpdate);
        Hooks.on('deleteActor', debouncedUpdate);
        Hooks.on('updateActor', (actor, changes) => {
            // 이름, 이미지, 소유권이 변경될 때만 캐시 갱신
            if (changes.name || changes.img || changes.ownership) debouncedUpdate();
        });

        Hooks.on('renderChatLog', (app, html, data) => {
            const element = (html instanceof HTMLElement) ? html : (html[0] || html);
            this._setupAutocomplete(element);
        });
    }

    // [최적화] 무거운 Actor 객체 대신 {id, name, img}만 있는 가벼운 객체(POJO)로 변환하여 저장
    static _updateCache() {
        if (!game.user) return;
        
        // game.actors를 순회하는 것은 여기서 딱 한 번만 수행
        this._cachedActors = game.actors
            .filter(actor => {
                if (game.user.isGM) return true;
                return actor.ownership[game.user.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
            })
            .map(a => ({
                id: a.id,
                name: a.name,
                img: a.img,
                nameLower: a.name.toLowerCase() // 검색 속도 향상을 위해 미리 소문자 변환
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
            
        console.log(`Character Chat Selector | Cached ${this._cachedActors.length} actors for autocomplete.`);
    }

    static _setupAutocomplete(html) {
        let chatInput = html.querySelector ? html.querySelector('#chat-message') : null;
        if (!chatInput) chatInput = document.getElementById('chat-message');
        if (!chatInput) return;

        const existingList = document.getElementById('chat-autocomplete-list');
        if (existingList) existingList.remove();

        const listContainer = document.createElement('div');
        listContainer.id = 'chat-autocomplete-list';
        listContainer.className = 'autocomplete-list';
        listContainer.style.display = 'none';
        document.body.appendChild(listContainer);

        this.state = {
            visible: false,
            matches: [],
            selectedIndex: 0,
            query: ''
        };

        const updatePosition = () => {
            if (listContainer.style.display === 'none') return;
            const rect = chatInput.getBoundingClientRect();
            listContainer.style.position = 'fixed';
            listContainer.style.left = `${rect.left}px`;
            listContainer.style.width = `${rect.width}px`;
            listContainer.style.bottom = `${window.innerHeight - rect.top + 5}px`;
            listContainer.style.top = 'auto';
        };

        window.addEventListener('resize', updatePosition);

        let searchTimeout = null;

        const inputHandler = (e) => {
            const val = e.target.value;
            if (searchTimeout) clearTimeout(searchTimeout);

            searchTimeout = setTimeout(() => {
                const commandMatch = val.match(/^(!|\/c\s)(.*)/);
                if (commandMatch) {
                    const query = commandMatch[2];
                    this._searchAndRender(query, listContainer, chatInput);
                    updatePosition();
                } else {
                    this._closeList(listContainer);
                }
            }, 100); // 반응 속도를 위해 딜레이 약간 단축
        };

        chatInput.removeEventListener('input', inputHandler);
        chatInput.addEventListener('input', inputHandler);

        chatInput.addEventListener('keydown', (e) => {
            if (!this.state.visible) return;

            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    e.stopPropagation();
                    this._moveSelection(-1, listContainer);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    e.stopPropagation();
                    this._moveSelection(1, listContainer);
                    break;
                case 'Enter':
                case 'Tab':
                    if (this.state.matches.length > 0) {
                        if (e.isComposing) return;
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        this._selectItem(this.state.selectedIndex, chatInput, listContainer);
                    }
                    break;
                case 'Escape':
                    this._closeList(listContainer);
                    break;
            }
        }, { capture: true });

        chatInput.addEventListener('blur', () => {
            setTimeout(() => this._closeList(listContainer), 200);
        });
    }

    static _searchAndRender(query, listContainer, chatInput) {
        // [최적화] 이미 가볍게 변환된 this._cachedActors 사용
        let matches = [];
        
        if (!query || !query.trim()) {
            matches = this._cachedActors;
        } else {
            const q = query.toLowerCase();
            // 문자열 포함 여부만 빠르게 검사 (Levenshtein 등 무거운 연산 제외)
            matches = this._cachedActors.filter(a => a.nameLower.includes(q));
        }

        this.state.matches = matches;
        this.state.query = query;

        if (matches.length === 0) {
            this._closeList(listContainer);
            return;
        }

        this._renderList(matches, listContainer, chatInput);
    }

    static _renderList(matches, container, chatInput) {
        const fragment = document.createDocumentFragment();

        // DOM 과부하 방지를 위해 최대 표시 개수 제한
        const MAX_RESULTS = 20;
        const displayMatches = matches.slice(0, MAX_RESULTS);

        displayMatches.forEach((actor, index) => {
            const div = document.createElement('div');
            div.className = `autocomplete-item ${index === 0 ? 'active' : ''}`;
            div.dataset.index = index;
            
            div.innerHTML = `
            <img src="${actor.img}" width="24" height="24" style="border:none; vertical-align:middle;"/>
            <span>${actor.name}</span>
            `;

            div.addEventListener('click', () => {
                this._selectItem(index, chatInput, container);
            });

            div.addEventListener('mouseenter', () => {
                this.state.selectedIndex = index;
                const items = container.querySelectorAll('.autocomplete-item');
                items.forEach(item => item.classList.remove('active'));
                div.classList.add('active');
            });

            fragment.appendChild(div);
        });

        if (matches.length > MAX_RESULTS) {
            const moreDiv = document.createElement('div');
            moreDiv.className = 'autocomplete-item';
            moreDiv.style.fontStyle = 'italic';
            moreDiv.style.color = '#888';
            moreDiv.textContent = `...and ${matches.length - MAX_RESULTS} more`;
            moreDiv.style.pointerEvents = 'none'; 
            fragment.appendChild(moreDiv);
        }

        container.innerHTML = '';
        container.appendChild(fragment);
        container.style.display = 'flex';
        this.state.visible = true;
        this.state.selectedIndex = 0;
    }

    static _moveSelection(direction, container) {
        const max = Math.min(this.state.matches.length, 20); 
        if (max === 0) return;

        let newIndex = this.state.selectedIndex + direction;

        if (newIndex < 0) newIndex = max - 1;
        if (newIndex >= max) newIndex = 0;

        this.state.selectedIndex = newIndex;

        const items = container.querySelectorAll('.autocomplete-item');
        items.forEach(item => item.classList.remove('active'));
        
        if (items[newIndex] && !items[newIndex].textContent.startsWith('...and')) {
            items[newIndex].classList.add('active');
            items[newIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    static _selectItem(index, chatInput, container) {
        const actor = this.state.matches[index];
        if (!actor) return;

        const select = document.querySelector('.character-select');
        const customSelect = document.querySelector('.custom-select');

        if (select) {
            select.value = actor.id;
            if (customSelect) {
                const selectedDiv = customSelect.querySelector('.select-selected');
                if (selectedDiv) selectedDiv.textContent = actor.name;
            }
            ChatSelector._onCharacterSelect({ target: { value: actor.id } });
            ui.notifications.info(game.i18n.format("CHATSELECTOR.Info.CharacterChanged", { name: actor.name }));
        }

        chatInput.value = '';
        this._closeList(container);
        chatInput.focus();
    }

    static _closeList(container) {
        if (container) {
            container.style.display = 'none';
            container.innerHTML = '';
        }
        this.state.visible = false;
        this.state.matches = [];
    }
}