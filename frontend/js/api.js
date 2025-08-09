/**
 * API 통신 모듈
 * @version 1.0.0
 */

class ApiClient {
    constructor(baseURL = '/api') {
        this.baseURL = baseURL;
        this.defaultHeaders = {
            'Content-Type': 'application/json',
        };
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            headers: { ...this.defaultHeaders, ...options.headers },
            ...options
        };

        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            
            return await response.text();
        } catch (error) {
            console.error(`API 요청 실패 (${endpoint}):`, error);
            throw error;
        }
    }

    // GET 요청
    async get(endpoint, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        return this.request(url, { method: 'GET' });
    }

    // POST 요청
    async post(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    // PUT 요청
    async put(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    // DELETE 요청
    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }
}

// 저장소 관련 API
class RepositoryAPI extends ApiClient {
    constructor() {
        super('/api');
    }

    // 저장소 목록 조회
    async getRepositories(params = {}) {
        return this.get('/repositories', params);
    }

    // 저장소 상세 조회
    async getRepository(id) {
        return this.get(`/repositories/${id}`);
    }

    // 저장소 검색
    async searchRepositories(query, params = {}) {
        return this.get('/repositories/search', { q: query, ...params });
    }

    // 저장소 생성
    async createRepository(data) {
        return this.post('/repositories', data);
    }

    // 저장소 수정
    async updateRepository(id, data) {
        return this.put(`/repositories/${id}`, data);
    }

    // 저장소 삭제
    async deleteRepository(id) {
        return this.delete(`/repositories/${id}`);
    }

    // 저장소 태그 추가
    async addTagToRepository(repoId, tagId) {
        return this.post(`/repositories/${repoId}/tags`, { tag_id: tagId });
    }

    // 저장소 태그 제거
    async removeTagFromRepository(repoId, tagId) {
        return this.delete(`/repositories/${repoId}/tags/${tagId}`);
    }
}

// 태그 관련 API
class TagAPI extends ApiClient {
    constructor() {
        super('/api');
    }

    // 태그 목록 조회
    async getTags(params = {}) {
        return this.get('/tags', params);
    }

    // 태그 상세 조회
    async getTag(id) {
        return this.get(`/tags/${id}`);
    }

    // 태그 생성
    async createTag(data) {
        return this.post('/tags', data);
    }

    // 태그 수정
    async updateTag(id, data) {
        return this.put(`/tags/${id}`, data);
    }

    // 태그 삭제
    async deleteTag(id) {
        return this.delete(`/tags/${id}`);
    }

    // 태그별 저장소 조회
    async getRepositoriesByTag(tagId, params = {}) {
        return this.get(`/tags/${tagId}/repositories`, params);
    }
}

// 레지스트리 관련 API
class RegistryAPI extends ApiClient {
    constructor() {
        super('/api');
    }

    // 레지스트리 상태 확인
    async getStatus() {
        return this.get('/registry/status');
    }

    // 레지스트리 통계
    async getStats() {
        return this.get('/registry/stats');
    }

    // 레지스트리 설정 조회
    async getConfig() {
        return this.get('/registry/config');
    }

    // 레지스트리 설정 업데이트
    async updateConfig(data) {
        return this.put('/registry/config', data);
    }
}

// API 인스턴스 생성
const api = {
    repositories: new RepositoryAPI(),
    tags: new TagAPI(),
    registry: new RegistryAPI()
};

// 전역으로 노출
window.api = api;

// 기존 함수들과의 호환성을 위한 래퍼 함수들
window.getRepositories = (params) => api.repositories.getRepositories(params);
window.getRepository = (id) => api.repositories.getRepository(id);
window.searchRepositories = (query, params) => api.repositories.searchRepositories(query, params);
window.getTags = (params) => api.tags.getTags(params);
window.getTag = (id) => api.tags.getTag(id);
