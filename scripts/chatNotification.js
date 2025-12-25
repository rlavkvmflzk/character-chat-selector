export class ChatNotification {
    static ID = 'character-chat-selector';
    static SETTINGS = {
        ENABLE_SOUND: 'enableNotificationSound',
        SOUND_PATH: 'notificationSoundPath',
        VOLUME: 'notificationVolume',
        PLAY_FOR_SELF: 'playNotificationForSelf'
    };

    static initialize() {        
        // 채팅 메시지가 생성(DB 등록)될 때 실행
        Hooks.on('createChatMessage', (message, options, userId) => {
            this._handleNotification(message, userId);
        });
    }

    static _handleNotification(message, userId) {
        // 1. 기능이 꺼져있으면 중단
        if (!game.settings.get(this.ID, this.SETTINGS.ENABLE_SOUND)) return;

        // 2. 현재 사용자가 볼 권한이 없는 메시지(비공개 귓속말 등)면 중단
        if (!message.visible) return;

        // 3. 내가 보낸 메시지인 경우 설정 확인
        const isMyMessage = (userId === game.user.id);
        const playForSelf = game.settings.get(this.ID, this.SETTINGS.PLAY_FOR_SELF);
        if (isMyMessage && !playForSelf) return;

        // 4. 소리 재생
        const soundPath = game.settings.get(this.ID, this.SETTINGS.SOUND_PATH);
        const volume = game.settings.get(this.ID, this.SETTINGS.VOLUME);

        if (soundPath) {
            AudioHelper.play({
                src: soundPath,
                volume: volume,
                autoplay: true,
                loop: false
            }, false);
        }
    }
}