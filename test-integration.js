/**
 * RepoVista 통합 테스트 스크립트
 * 백엔드 API와 프론트엔드 연동을 테스트합니다.
 */

const API_BASE_URL = 'http://localhost:8000/api';
const FRONTEND_URL = 'http://localhost';

// 테스트 결과를 저장할 객체
const testResults = {
    passed: 0,
    failed: 0,
    errors: []
};

// 테스트 헬퍼 함수들
const test = {
    async api(endpoint, options = {}) {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            throw new Error(`API 요청 실패 (${endpoint}): ${error.message}`);
        }
    },

    assert(condition, message) {
        if (condition) {
            console.log(`✅ ${message}`);
            testResults.passed++;
        } else {
            console.log(`❌ ${message}`);
            testResults.failed++;
            testResults.errors.push(message);
        }
    },

    async assertApiResponse(endpoint, expectedStatus = 200, message) {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`);
            this.assert(response.status === expectedStatus, `${message} (상태: ${response.status})`);
        } catch (error) {
            this.assert(false, `${message} (오류: ${error.message})`);
        }
    }
};

// 테스트 케이스들
const testCases = {
    // 백엔드 API 테스트
    async testBackendHealth() {
        console.log('\n🔍 백엔드 헬스 체크 테스트');
        await test.assertApiResponse('/health', 200, '헬스 체크 엔드포인트 응답');
    },

    async testRepositoriesAPI() {
        console.log('\n📦 저장소 API 테스트');
        
        try {
            const response = await test.api('/repositories/');
            test.assert(response.repositories !== undefined, '저장소 목록 응답 구조 확인');
            test.assert(Array.isArray(response.repositories), '저장소 목록이 배열인지 확인');
            test.assert(response.pagination !== undefined, '페이지네이션 정보 포함 확인');
        } catch (error) {
            test.assert(false, `저장소 API 테스트 실패: ${error.message}`);
        }
    },

    async testSearchAPI() {
        console.log('\n🔍 검색 API 테스트');
        
        try {
            const response = await test.api('/repositories/?search=test');
            test.assert(response.repositories !== undefined, '검색 결과 응답 구조 확인');
            test.assert(Array.isArray(response.repositories), '검색 결과가 배열인지 확인');
        } catch (error) {
            test.assert(false, `검색 API 테스트 실패: ${error.message}`);
        }
    },

    async testSortAPI() {
        console.log('\n📊 정렬 API 테스트');
        
        try {
            const response = await test.api('/repositories/?sort_by=name&sort_order=asc');
            test.assert(response.repositories !== undefined, '정렬 결과 응답 구조 확인');
            test.assert(Array.isArray(response.repositories), '정렬 결과가 배열인지 확인');
        } catch (error) {
            test.assert(false, `정렬 API 테스트 실패: ${error.message}`);
        }
    },

    async testPaginationAPI() {
        console.log('\n📄 페이지네이션 API 테스트');
        
        try {
            const response = await test.api('/repositories/?page=1&page_size=10');
            test.assert(response.pagination !== undefined, '페이지네이션 정보 포함 확인');
            test.assert(response.pagination.page === 1, '페이지 번호 확인');
            test.assert(response.pagination.page_size === 10, '페이지 크기 확인');
        } catch (error) {
            test.assert(false, `페이지네이션 API 테스트 실패: ${error.message}`);
        }
    },

    // 프론트엔드 테스트
    async testFrontendAccess() {
        console.log('\n🌐 프론트엔드 접근 테스트');
        
        try {
            const response = await fetch(FRONTEND_URL);
            test.assert(response.status === 200, '프론트엔드 페이지 접근 가능');
        } catch (error) {
            test.assert(false, `프론트엔드 접근 실패: ${error.message}`);
        }
    },

    async testFrontendAssets() {
        console.log('\n📁 프론트엔드 자산 테스트');
        
        const assets = [
            '/css/styles.css',
            '/js/app.js',
            '/js/api.js',
            '/js/utils.js',
            '/js/components.js',
            '/js/events.js',
            '/js/store.js'
        ];

        for (const asset of assets) {
            try {
                const response = await fetch(`${FRONTEND_URL}${asset}`);
                test.assert(response.status === 200, `${asset} 로드 가능`);
            } catch (error) {
                test.assert(false, `${asset} 로드 실패: ${error.message}`);
            }
        }
    },

    // 통합 테스트
    async testAPIIntegration() {
        console.log('\n🔗 API 통합 테스트');
        
        try {
            // 저장소 목록 가져오기
            const reposResponse = await test.api('/repositories/');
            
            if (reposResponse.repositories && reposResponse.repositories.length > 0) {
                const firstRepo = reposResponse.repositories[0];
                
                // 첫 번째 저장소의 태그 목록 가져오기
                const tagsResponse = await test.api(`/repositories/${encodeURIComponent(firstRepo.name)}/tags`);
                test.assert(tagsResponse.tags !== undefined, '태그 목록 응답 구조 확인');
                test.assert(Array.isArray(tagsResponse.tags), '태그 목록이 배열인지 확인');
            } else {
                console.log('⚠️  테스트할 저장소가 없습니다.');
            }
        } catch (error) {
            test.assert(false, `API 통합 테스트 실패: ${error.message}`);
        }
    }
};

// 메인 테스트 실행 함수
async function runTests() {
    console.log('🚀 RepoVista 통합 테스트 시작\n');
    console.log(`API URL: ${API_BASE_URL}`);
    console.log(`Frontend URL: ${FRONTEND_URL}\n`);

    const startTime = Date.now();

    try {
        // 백엔드 테스트
        await testCases.testBackendHealth();
        await testCases.testRepositoriesAPI();
        await testCases.testSearchAPI();
        await testCases.testSortAPI();
        await testCases.testPaginationAPI();

        // 프론트엔드 테스트
        await testCases.testFrontendAccess();
        await testCases.testFrontendAssets();

        // 통합 테스트
        await testCases.testAPIIntegration();

    } catch (error) {
        console.error('❌ 테스트 실행 중 오류 발생:', error);
        testResults.failed++;
        testResults.errors.push(`테스트 실행 오류: ${error.message}`);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // 결과 출력
    console.log('\n' + '='.repeat(50));
    console.log('📊 테스트 결과');
    console.log('='.repeat(50));
    console.log(`✅ 통과: ${testResults.passed}`);
    console.log(`❌ 실패: ${testResults.failed}`);
    console.log(`⏱️  소요시간: ${duration}ms`);
    
    if (testResults.errors.length > 0) {
        console.log('\n❌ 오류 목록:');
        testResults.errors.forEach((error, index) => {
            console.log(`${index + 1}. ${error}`);
        });
    }

    if (testResults.failed === 0) {
        console.log('\n🎉 모든 테스트가 통과했습니다!');
        process.exit(0);
    } else {
        console.log('\n💥 일부 테스트가 실패했습니다.');
        process.exit(1);
    }
}

// 스크립트 실행
if (require.main === module) {
    runTests().catch(error => {
        console.error('❌ 테스트 실행 실패:', error);
        process.exit(1);
    });
}

module.exports = { test, testCases, runTests };
