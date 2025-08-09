/**
 * 상태 관리 시스템
 * @version 1.0.0
 */

// 상태 변경 구독자 인터페이스
class Subscriber {
    constructor(callback) {
        this.callback = callback;
        this.id = Math.random().toString(36).substr(2, 9);
    }

    notify(state, prevState) {
        this.callback(state, prevState);
    }
}

// 상태 관리자
class Store {
    constructor(initialState = {}) {
        this.state = initialState;
        this.subscribers = new Map();
        this.middleware = [];
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;
    }

    // 상태 구독
    subscribe(callback) {
        const subscriber = new Subscriber(callback);
        this.subscribers.set(subscriber.id, subscriber);
        
        // 구독 해제 함수 반환
        return () => {
            this.subscribers.delete(subscriber.id);
        };
    }

    // 상태 변경 알림
    notifySubscribers(prevState) {
        this.subscribers.forEach(subscriber => {
            subscriber.notify(this.state, prevState);
        });
    }

    // 상태 업데이트
    setState(newState, action = 'unknown') {
        const prevState = { ...this.state };
        
        // 미들웨어 체인 실행
        let processedState = newState;
        for (const mw of this.middleware) {
            processedState = mw(processedState, prevState, action);
            if (!processedState) return; // 미들웨어에서 상태 변경 중단
        }
        
        this.state = { ...this.state, ...processedState };
        
        // 히스토리에 추가
        this.addToHistory(prevState, action);
        
        // 구독자들에게 알림
        this.notifySubscribers(prevState);
    }

    // 히스토리에 추가
    addToHistory(prevState, action) {
        // 현재 인덱스 이후의 히스토리 제거
        this.history = this.history.slice(0, this.historyIndex + 1);
        
        // 새 히스토리 추가
        this.history.push({
            state: { ...this.state },
            prevState,
            action,
            timestamp: Date.now()
        });
        
        this.historyIndex++;
        
        // 히스토리 크기 제한
        if (this.history.length > this.maxHistory) {
            this.history.shift();
            this.historyIndex--;
        }
    }

    // 실행 취소
    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            const historyItem = this.history[this.historyIndex];
            this.state = { ...historyItem.state };
            this.notifySubscribers(historyItem.prevState);
            return true;
        }
        return false;
    }

    // 다시 실행
    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            const historyItem = this.history[this.historyIndex];
            this.state = { ...historyItem.state };
            this.notifySubscribers(historyItem.prevState);
            return true;
        }
        return false;
    }

    // 미들웨어 추가
    use(middleware) {
        this.middleware.push(middleware);
    }

    // 현재 상태 반환
    getState() {
        return { ...this.state };
    }

    // 특정 상태 값 반환
    get(path) {
        return path.split('.').reduce((obj, key) => obj?.[key], this.state);
    }

    // 히스토리 정보 반환
    getHistory() {
        return this.history.map(item => ({
            action: item.action,
            timestamp: item.timestamp
        }));
    }

    // 히스토리 초기화
    clearHistory() {
        this.history = [];
        this.historyIndex = -1;
    }
}

// 애플리케이션 상태 관리자
class AppStore extends Store {
    constructor() {
        super({
            // 사용자 관련 상태
            user: {
                isAuthenticated: false,
                profile: null,
                preferences: {}
            },
            
            // 저장소 관련 상태
            repositories: {
                items: [],
                loading: false,
                error: null,
                filters: {
                    search: '',
                    tags: [],
                    language: '',
                    sortBy: 'name',
                    sortOrder: 'asc'
                },
                pagination: {
                    currentPage: 1,
                    totalPages: 1,
                    itemsPerPage: 20,
                    totalItems: 0
                }
            },
            
            // 태그 관련 상태
            tags: {
                items: [],
                loading: false,
                error: null,
                selectedTags: []
            },
            
            // UI 관련 상태
            ui: {
                theme: 'light',
                language: 'ko',
                sidebarOpen: true,
                modal: {
                    isOpen: false,
                    type: null,
                    data: null
                },
                notifications: []
            },
            
            // 네트워크 관련 상태
            network: {
                isOnline: navigator.onLine,
                pendingRequests: 0,
                lastError: null
            }
        });

        this.setupActions();
    }

    // 액션 설정
    setupActions() {
        // 저장소 액션들
        this.actions = {
            // 저장소 목록 로드
            loadRepositories: async (params = {}) => {
                this.setState({ 
                    repositories: { ...this.state.repositories, loading: true, error: null }
                }, 'loadRepositories:start');

                try {
                    const response = await window.api.repositories.getRepositories(params);
                    this.setState({
                        repositories: {
                            ...this.state.repositories,
                            items: response.items || response,
                            loading: false,
                            pagination: response.pagination || this.state.repositories.pagination
                        }
                    }, 'loadRepositories:success');
                } catch (error) {
                    this.setState({
                        repositories: {
                            ...this.state.repositories,
                            loading: false,
                            error: error.message
                        }
                    }, 'loadRepositories:error');
                }
            },

            // 저장소 검색
            searchRepositories: async (query) => {
                this.setState({
                    repositories: {
                        ...this.state.repositories,
                        filters: { ...this.state.repositories.filters, search: query }
                    }
                }, 'searchRepositories');

                await this.actions.loadRepositories({ q: query });
            },

            // 저장소 정렬
            sortRepositories: (sortBy, sortOrder = 'asc') => {
                this.setState({
                    repositories: {
                        ...this.state.repositories,
                        filters: { 
                            ...this.state.repositories.filters, 
                            sortBy, 
                            sortOrder 
                        }
                    }
                }, 'sortRepositories');
            },

            // 저장소 필터링
            filterRepositories: (filters) => {
                this.setState({
                    repositories: {
                        ...this.state.repositories,
                        filters: { ...this.state.repositories.filters, ...filters }
                    }
                }, 'filterRepositories');
            },

            // 태그 목록 로드
            loadTags: async () => {
                this.setState({ 
                    tags: { ...this.state.tags, loading: true, error: null }
                }, 'loadTags:start');

                try {
                    const response = await window.api.tags.getTags();
                    this.setState({
                        tags: {
                            ...this.state.tags,
                            items: response,
                            loading: false
                        }
                    }, 'loadTags:success');
                } catch (error) {
                    this.setState({
                        tags: {
                            ...this.state.tags,
                            loading: false,
                            error: error.message
                        }
                    }, 'loadTags:error');
                }
            },

            // 태그 선택
            selectTag: (tag) => {
                const selectedTags = [...this.state.tags.selectedTags];
                const index = selectedTags.findIndex(t => t.id === tag.id);
                
                if (index > -1) {
                    selectedTags.splice(index, 1);
                } else {
                    selectedTags.push(tag);
                }

                this.setState({
                    tags: { ...this.state.tags, selectedTags }
                }, 'selectTag');
            },

            // UI 액션들
            toggleSidebar: () => {
                this.setState({
                    ui: { 
                        ...this.state.ui, 
                        sidebarOpen: !this.state.ui.sidebarOpen 
                    }
                }, 'toggleSidebar');
            },

            openModal: (type, data = null) => {
                this.setState({
                    ui: {
                        ...this.state.ui,
                        modal: { isOpen: true, type, data }
                    }
                }, 'openModal');
            },

            closeModal: () => {
                this.setState({
                    ui: {
                        ...this.state.ui,
                        modal: { isOpen: false, type: null, data: null }
                    }
                }, 'closeModal');
            },

            changeTheme: (theme) => {
                this.setState({
                    ui: { ...this.state.ui, theme }
                }, 'changeTheme');
            },

            addNotification: (notification) => {
                const notifications = [...this.state.ui.notifications, {
                    id: Math.random().toString(36).substr(2, 9),
                    timestamp: Date.now(),
                    ...notification
                }];

                this.setState({
                    ui: { ...this.state.ui, notifications }
                }, 'addNotification');
            },

            removeNotification: (id) => {
                const notifications = this.state.ui.notifications.filter(n => n.id !== id);
                this.setState({
                    ui: { ...this.state.ui, notifications }
                }, 'removeNotification');
            },

            // 네트워크 액션들
            setOnlineStatus: (isOnline) => {
                this.setState({
                    network: { ...this.state.network, isOnline }
                }, 'setOnlineStatus');
            },

            incrementPendingRequests: () => {
                this.setState({
                    network: { 
                        ...this.state.network, 
                        pendingRequests: this.state.network.pendingRequests + 1 
                    }
                }, 'incrementPendingRequests');
            },

            decrementPendingRequests: () => {
                this.setState({
                    network: { 
                        ...this.state.network, 
                        pendingRequests: Math.max(0, this.state.network.pendingRequests - 1) 
                    }
                }, 'decrementPendingRequests');
            },

            setLastError: (error) => {
                this.setState({
                    network: { ...this.state.network, lastError: error }
                }, 'setLastError');
            }
        };
    }

    // 상태 선택자들
    get selectors() {
        return {
            // 저장소 관련 선택자
            getRepositories: () => this.state.repositories.items,
            getRepositoriesLoading: () => this.state.repositories.loading,
            getRepositoriesError: () => this.state.repositories.error,
            getRepositoriesFilters: () => this.state.repositories.filters,
            getRepositoriesPagination: () => this.state.repositories.pagination,

            // 태그 관련 선택자
            getTags: () => this.state.tags.items,
            getTagsLoading: () => this.state.tags.loading,
            getTagsError: () => this.state.tags.error,
            getSelectedTags: () => this.state.tags.selectedTags,

            // UI 관련 선택자
            getTheme: () => this.state.ui.theme,
            getLanguage: () => this.state.ui.language,
            getSidebarOpen: () => this.state.ui.sidebarOpen,
            getModal: () => this.state.ui.modal,
            getNotifications: () => this.state.ui.notifications,

            // 네트워크 관련 선택자
            getIsOnline: () => this.state.network.isOnline,
            getPendingRequests: () => this.state.network.pendingRequests,
            getLastError: () => this.state.network.lastError,

            // 복합 선택자
            getFilteredRepositories: () => {
                const { items, filters } = this.state.repositories;
                let filtered = [...items];

                // 검색 필터
                if (filters.search) {
                    const searchLower = filters.search.toLowerCase();
                    filtered = filtered.filter(repo => 
                        repo.name.toLowerCase().includes(searchLower) ||
                        repo.description?.toLowerCase().includes(searchLower)
                    );
                }

                // 태그 필터
                if (filters.tags.length > 0) {
                    filtered = filtered.filter(repo => 
                        filters.tags.some(tag => repo.tags?.includes(tag))
                    );
                }

                // 언어 필터
                if (filters.language) {
                    filtered = filtered.filter(repo => 
                        repo.language === filters.language
                    );
                }

                // 정렬
                filtered.sort((a, b) => {
                    let aVal = a[filters.sortBy];
                    let bVal = b[filters.sortBy];

                    if (typeof aVal === 'string') {
                        aVal = aVal.toLowerCase();
                        bVal = bVal.toLowerCase();
                    }

                    if (filters.sortOrder === 'desc') {
                        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
                    }
                    return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                });

                return filtered;
            }
        };
    }
}

// 전역 스토어 인스턴스 생성
const appStore = new AppStore();

// 전역으로 노출
window.store = appStore;
window.actions = appStore.actions;
window.selectors = appStore.selectors;
