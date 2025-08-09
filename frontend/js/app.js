/**
 * RepoVista - 메인 애플리케이션
 * @version 1.0.0
 */

class RepoVistaApp {
    constructor() {
        this.config = {
            apiBaseUrl: '/api',
            debug: true
        };
        this.state = {
            repositories: [],
            tags: [],
            loading: false,
            error: null
        };
        this.init();
    }

    async init() {
        try {
            console.log('RepoVista 애플리케이션 초기화 중...');
            
            // 이벤트 리스너 등록
            this.setupEventListeners();
            
            // 초기 데이터 로드
            await this.loadInitialData();
            
            // UI 렌더링
            this.render();
            
            console.log('RepoVista 애플리케이션 초기화 완료');
        } catch (error) {
            console.error('애플리케이션 초기화 실패:', error);
            this.handleError(error);
        }
    }

    setupEventListeners() {
        // 검색 이벤트
        document.addEventListener('DOMContentLoaded', () => {
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.addEventListener('input', this.debounce(this.handleSearch.bind(this), 300));
            }

            // 정렬 이벤트
            const sortSelect = document.getElementById('sort-select');
            if (sortSelect) {
                sortSelect.addEventListener('change', this.handleSort.bind(this));
            }

            // 태그 필터 이벤트
            const tagFilters = document.querySelectorAll('.tag-filter');
            tagFilters.forEach(tag => {
                tag.addEventListener('click', this.handleTagFilter.bind(this));
            });
        });
    }

    async loadInitialData() {
        this.state.loading = true;
        this.render();

        try {
            const [repositories, tags] = await Promise.all([
                this.fetchRepositories(),
                this.fetchTags()
            ]);

            this.state.repositories = repositories;
            this.state.tags = tags;
        } catch (error) {
            this.state.error = error.message;
        } finally {
            this.state.loading = false;
        }
    }

    async fetchRepositories() {
        const response = await fetch(`${this.config.apiBaseUrl}/repositories`);
        if (!response.ok) {
            throw new Error('저장소 데이터를 불러올 수 없습니다.');
        }
        return await response.json();
    }

    async fetchTags() {
        const response = await fetch(`${this.config.apiBaseUrl}/tags`);
        if (!response.ok) {
            throw new Error('태그 데이터를 불러올 수 없습니다.');
        }
        return await response.json();
    }

    handleSearch(event) {
        const query = event.target.value.toLowerCase();
        const filteredRepos = this.state.repositories.filter(repo => 
            repo.name.toLowerCase().includes(query) ||
            repo.description?.toLowerCase().includes(query)
        );
        this.renderRepositories(filteredRepos);
    }

    handleSort(event) {
        const sortBy = event.target.value;
        const sortedRepos = [...this.state.repositories].sort((a, b) => {
            switch (sortBy) {
                case 'name':
                    return a.name.localeCompare(b.name);
                case 'stars':
                    return b.stars - a.stars;
                case 'updated':
                    return new Date(b.updated_at) - new Date(a.updated_at);
                default:
                    return 0;
            }
        });
        this.renderRepositories(sortedRepos);
    }

    handleTagFilter(event) {
        const selectedTag = event.target.dataset.tag;
        const filteredRepos = this.state.repositories.filter(repo => 
            repo.tags?.includes(selectedTag)
        );
        this.renderRepositories(filteredRepos);
    }

    render() {
        if (this.state.loading) {
            this.showLoading();
            return;
        }

        if (this.state.error) {
            this.showError(this.state.error);
            return;
        }

        this.renderHeader();
        this.renderSidebar();
        this.renderMainContent();
    }

    renderHeader() {
        const header = document.getElementById('header');
        if (!header) return;

        header.innerHTML = `
            <div class="header-content">
                <h1>RepoVista</h1>
                <div class="search-container">
                    <input type="text" id="search-input" placeholder="저장소 검색..." />
                </div>
                <div class="sort-container">
                    <select id="sort-select">
                        <option value="name">이름순</option>
                        <option value="stars">별표순</option>
                        <option value="updated">최신순</option>
                    </select>
                </div>
            </div>
        `;
    }

    renderSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        sidebar.innerHTML = `
            <div class="sidebar-content">
                <h3>태그</h3>
                <div class="tag-list">
                    ${this.state.tags.map(tag => `
                        <span class="tag-filter" data-tag="${tag.name}">${tag.name}</span>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderMainContent() {
        const main = document.getElementById('main');
        if (!main) return;

        main.innerHTML = `
            <div class="content-header">
                <h2>저장소 목록 (${this.state.repositories.length}개)</h2>
            </div>
            <div class="repository-grid" id="repository-grid">
                ${this.state.repositories.map(repo => this.renderRepositoryCard(repo)).join('')}
            </div>
        `;
    }

    renderRepositories(repositories) {
        const grid = document.getElementById('repository-grid');
        if (!grid) return;

        grid.innerHTML = repositories.map(repo => this.renderRepositoryCard(repo)).join('');
    }

    renderRepositoryCard(repo) {
        return `
            <div class="repository-card">
                <div class="repo-header">
                    <h3>${repo.name}</h3>
                    <div class="repo-stats">
                        <span class="stars">⭐ ${repo.stars || 0}</span>
                        <span class="forks">🔀 ${repo.forks || 0}</span>
                    </div>
                </div>
                <p class="repo-description">${repo.description || '설명 없음'}</p>
                <div class="repo-tags">
                    ${(repo.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
                <div class="repo-footer">
                    <span class="language">${repo.language || 'Unknown'}</span>
                    <span class="updated">${this.formatDate(repo.updated_at)}</span>
                </div>
            </div>
        `;
    }

    showLoading() {
        const main = document.getElementById('main');
        if (!main) return;

        main.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>데이터를 불러오는 중...</p>
            </div>
        `;
    }

    showError(message) {
        const main = document.getElementById('main');
        if (!main) return;

        main.innerHTML = `
            <div class="error">
                <h3>오류가 발생했습니다</h3>
                <p>${message}</p>
                <button onclick="location.reload()">다시 시도</button>
            </div>
        `;
    }

    handleError(error) {
        console.error('애플리케이션 오류:', error);
        this.state.error = error.message;
        this.render();
    }

    formatDate(dateString) {
        if (!dateString) return '날짜 없음';
        const date = new Date(dateString);
        return date.toLocaleDateString('ko-KR');
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// 애플리케이션 시작
document.addEventListener('DOMContentLoaded', () => {
    window.app = new RepoVistaApp();
});
