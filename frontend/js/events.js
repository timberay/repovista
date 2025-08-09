/**
 * 이벤트 관리 시스템
 * @version 1.0.0
 */

class EventEmitter {
    constructor() {
        this.events = {};
    }

    // 이벤트 리스너 등록
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
        
        // 구독 해제 함수 반환
        return () => this.off(event, callback);
    }

    // 이벤트 리스너 제거
    off(event, callback) {
        if (!this.events[event]) return;
        
        if (callback) {
            this.events[event] = this.events[event].filter(cb => cb !== callback);
        } else {
            delete this.events[event];
        }
    }

    // 이벤트 발생
    emit(event, ...args) {
        if (!this.events[event]) return;
        
        this.events[event].forEach(callback => {
            try {
                callback(...args);
            } catch (error) {
                console.error(`이벤트 핸들러 오류 (${event}):`, error);
            }
        });
    }

    // 모든 이벤트 리스너 제거
    clear() {
        this.events = {};
    }

    // 특정 이벤트의 리스너 수 반환
    listenerCount(event) {
        return this.events[event] ? this.events[event].length : 0;
    }
}

// 전역 이벤트 버스
class EventBus extends EventEmitter {
    constructor() {
        super();
        this.middleware = [];
    }

    // 미들웨어 추가
    use(middleware) {
        this.middleware.push(middleware);
    }

    // 이벤트 발생 (미들웨어 적용)
    emit(event, ...args) {
        let data = { event, args };
        
        // 미들웨어 체인 실행
        for (const mw of this.middleware) {
            data = mw(data);
            if (!data) return; // 미들웨어에서 이벤트 중단
        }
        
        super.emit(data.event, ...data.args);
    }
}

// 애플리케이션 이벤트 관리자
class AppEventManager {
    constructor() {
        this.eventBus = new EventBus();
        this.setupDefaultEvents();
    }

    // 기본 이벤트 설정
    setupDefaultEvents() {
        // 로딩 상태 변경 이벤트
        this.on('loading:start', () => {
            document.body.classList.add('loading');
        });

        this.on('loading:end', () => {
            document.body.classList.remove('loading');
        });

        // 에러 이벤트
        this.on('error', (error) => {
            console.error('애플리케이션 오류:', error);
            this.showErrorNotification(error);
        });

        // 성공 이벤트
        this.on('success', (message) => {
            this.showSuccessNotification(message);
        });

        // 경고 이벤트
        this.on('warning', (message) => {
            this.showWarningNotification(message);
        });

        // 정보 이벤트
        this.on('info', (message) => {
            this.showInfoNotification(message);
        });
    }

    // 이벤트 리스너 등록
    on(event, callback) {
        return this.eventBus.on(event, callback);
    }

    // 이벤트 리스너 제거
    off(event, callback) {
        this.eventBus.off(event, callback);
    }

    // 이벤트 발생
    emit(event, ...args) {
        this.eventBus.emit(event, ...args);
    }

    // 알림 표시 함수들
    showErrorNotification(error) {
        const message = error.message || error;
        this.showNotification(message, 'error');
    }

    showSuccessNotification(message) {
        this.showNotification(message, 'success');
    }

    showWarningNotification(message) {
        this.showNotification(message, 'warning');
    }

    showInfoNotification(message) {
        this.showNotification(message, 'info');
    }

    showNotification(message, type = 'info') {
        // 알림 컨테이너 생성 또는 찾기
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            container.className = 'notification-container';
            document.body.appendChild(container);
        }

        // 알림 요소 생성
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span class="notification-message">${message}</span>
            <button class="notification-close">&times;</button>
        `;

        // 닫기 버튼 이벤트
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            notification.remove();
        });

        // 자동 제거 (5초 후)
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);

        container.appendChild(notification);
    }
}

// 저장소 관련 이벤트
class RepositoryEvents {
    constructor(eventManager) {
        this.eventManager = eventManager;
    }

    // 저장소 목록 로드 시작
    loadStart() {
        this.eventManager.emit('repositories:load:start');
    }

    // 저장소 목록 로드 완료
    loadComplete(repositories) {
        this.eventManager.emit('repositories:load:complete', repositories);
    }

    // 저장소 목록 로드 실패
    loadError(error) {
        this.eventManager.emit('repositories:load:error', error);
    }

    // 저장소 검색
    search(query) {
        this.eventManager.emit('repositories:search', query);
    }

    // 저장소 정렬
    sort(criteria) {
        this.eventManager.emit('repositories:sort', criteria);
    }

    // 저장소 필터링
    filter(filters) {
        this.eventManager.emit('repositories:filter', filters);
    }

    // 저장소 선택
    select(repository) {
        this.eventManager.emit('repositories:select', repository);
    }

    // 저장소 상세 보기
    viewDetails(repository) {
        this.eventManager.emit('repositories:view:details', repository);
    }
}

// 태그 관련 이벤트
class TagEvents {
    constructor(eventManager) {
        this.eventManager = eventManager;
    }

    // 태그 목록 로드 시작
    loadStart() {
        this.eventManager.emit('tags:load:start');
    }

    // 태그 목록 로드 완료
    loadComplete(tags) {
        this.eventManager.emit('tags:load:complete', tags);
    }

    // 태그 목록 로드 실패
    loadError(error) {
        this.eventManager.emit('tags:load:error', error);
    }

    // 태그 선택
    select(tag) {
        this.eventManager.emit('tags:select', tag);
    }

    // 태그 필터링
    filter(tag) {
        this.eventManager.emit('tags:filter', tag);
    }

    // 태그 생성
    create(tagData) {
        this.eventManager.emit('tags:create', tagData);
    }

    // 태그 수정
    update(tagId, tagData) {
        this.eventManager.emit('tags:update', tagId, tagData);
    }

    // 태그 삭제
    delete(tagId) {
        this.eventManager.emit('tags:delete', tagId);
    }
}

// UI 관련 이벤트
class UIEvents {
    constructor(eventManager) {
        this.eventManager = eventManager;
    }

    // 모달 열기
    openModal(modalData) {
        this.eventManager.emit('ui:modal:open', modalData);
    }

    // 모달 닫기
    closeModal() {
        this.eventManager.emit('ui:modal:close');
    }

    // 사이드바 토글
    toggleSidebar() {
        this.eventManager.emit('ui:sidebar:toggle');
    }

    // 테마 변경
    changeTheme(theme) {
        this.eventManager.emit('ui:theme:change', theme);
    }

    // 언어 변경
    changeLanguage(language) {
        this.eventManager.emit('ui:language:change', language);
    }

    // 페이지 변경
    changePage(page) {
        this.eventManager.emit('ui:page:change', page);
    }

    // 검색 시작
    searchStart(query) {
        this.eventManager.emit('ui:search:start', query);
    }

    // 검색 완료
    searchComplete(results) {
        this.eventManager.emit('ui:search:complete', results);
    }

    // 검색 취소
    searchCancel() {
        this.eventManager.emit('ui:search:cancel');
    }
}

// 네트워크 관련 이벤트
class NetworkEvents {
    constructor(eventManager) {
        this.eventManager = eventManager;
    }

    // 요청 시작
    requestStart(url) {
        this.eventManager.emit('network:request:start', url);
    }

    // 요청 완료
    requestComplete(url, response) {
        this.eventManager.emit('network:request:complete', url, response);
    }

    // 요청 실패
    requestError(url, error) {
        this.eventManager.emit('network:request:error', url, error);
    }

    // 오프라인 상태
    offline() {
        this.eventManager.emit('network:offline');
    }

    // 온라인 상태
    online() {
        this.eventManager.emit('network:online');
    }
}

// 전역 이벤트 매니저 인스턴스 생성
const eventManager = new AppEventManager();

// 이벤트 클래스들 인스턴스 생성
const repositoryEvents = new RepositoryEvents(eventManager);
const tagEvents = new TagEvents(eventManager);
const uiEvents = new UIEvents(eventManager);
const networkEvents = new NetworkEvents(eventManager);

// 전역으로 노출
window.events = {
    eventManager,
    repositoryEvents,
    tagEvents,
    uiEvents,
    networkEvents,
    EventEmitter,
    EventBus
};

// 네트워크 상태 모니터링
window.addEventListener('online', () => {
    networkEvents.online();
});

window.addEventListener('offline', () => {
    networkEvents.offline();
});
