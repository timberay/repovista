# RepoVista - Docker Registry Web UI

RepoVista는 Docker Registry를 위한 현대적이고 직관적인 웹 인터페이스입니다. 저장소와 태그를 쉽게 탐색하고 관리할 수 있습니다.

## 🚀 주요 기능

### 📦 저장소 관리
- Docker Registry의 모든 저장소 목록 조회
- 저장소별 상세 정보 (태그 수, 크기, 마지막 업데이트)
- 저장소 검색 및 필터링
- 다양한 정렬 옵션 (이름, 태그 수, 업데이트 날짜)

### 🏷️ 태그 관리
- 저장소별 태그 목록 조회
- 태그별 상세 정보 (크기, 아키텍처, OS)
- 태그 검색 및 정렬
- Pull 명령어 자동 생성

### 🔍 고급 검색
- 실시간 검색 (디바운싱 적용)
- 태그 기반 필터링
- 검색 제안 기능

### 📱 반응형 디자인
- 모바일, 태블릿, 데스크톱 지원
- 다크 테마 지원
- 접근성 고려

### ⚡ 성능 최적화
- 캐싱 시스템
- 페이지네이션
- 지연 로딩
- ETag 지원

## 🏗️ 아키텍처

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Docker        │
│   (React/Vue)   │◄──►│   (FastAPI)     │◄──►│   Registry      │
│                 │    │                 │    │                 │
│ - 저장소 목록    │    │ - API 엔드포인트 │    │ - 이미지 저장소  │
│ - 태그 관리      │    │ - 캐싱 시스템   │    │ - 태그 관리     │
│ - 검색 기능      │    │ - 인증 처리     │    │ - 메타데이터    │
│ - UI 컴포넌트    │    │ - 에러 핸들링   │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🛠️ 기술 스택

### Frontend
- **Vanilla JavaScript** - 모던 ES6+ 문법
- **CSS3** - CSS 변수, Flexbox, Grid
- **HTML5** - 시맨틱 마크업
- **모듈화된 아키텍처** - 컴포넌트 기반 구조

### Backend
- **FastAPI** - 고성능 Python 웹 프레임워크
- **Pydantic** - 데이터 검증
- **aiohttp** - 비동기 HTTP 클라이언트
- **Redis** - 캐싱 시스템

### Infrastructure
- **Docker** - 컨테이너화
- **Nginx** - 리버스 프록시
- **Docker Compose** - 오케스트레이션

## 📦 설치 및 실행

### 1. 저장소 클론
```bash
git clone https://github.com/your-username/repovista.git
cd repovista
```

### 2. 환경 변수 설정
```bash
cp env.example .env
# .env 파일을 편집하여 실제 값으로 수정
```

### 3. Docker Compose로 실행
```bash
docker-compose up -d
```

### 4. 접속
- Frontend: http://localhost
- Backend API: http://localhost:8000
- API 문서: http://localhost:8000/api/docs

## ⚙️ 설정

### 환경 변수

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `REGISTRY_URL` | Docker Registry URL | `http://localhost:5000` |
| `REGISTRY_USERNAME` | Registry 사용자명 | - |
| `REGISTRY_PASSWORD` | Registry 비밀번호 | - |
| `API_PORT` | 백엔드 API 포트 | `8000` |
| `FRONTEND_PORT` | 프론트엔드 포트 | `80` |
| `CORS_ORIGINS` | CORS 허용 도메인 | `http://localhost` |

### Docker Registry 설정

#### 로컬 Registry 실행
```bash
docker run -d -p 5000:5000 --name registry registry:2
```

#### 인증이 필요한 Registry
```bash
# .env 파일에 인증 정보 추가
REGISTRY_USERNAME=your-username
REGISTRY_PASSWORD=your-password
```

## 🔧 개발

### 로컬 개발 환경

#### 백엔드 개발
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### 프론트엔드 개발
```bash
cd frontend
# 정적 파일 서버 실행 (예: Python)
python -m http.server 3000
```

### 테스트 실행
```bash
# 통합 테스트
node test-integration.js

# 백엔드 테스트
cd backend
pytest

# 프론트엔드 테스트
# 브라우저에서 수동 테스트 또는 Playwright 사용
```

## 📚 API 문서

### 주요 엔드포인트

#### 저장소 관련
- `GET /api/repositories/` - 저장소 목록 조회
- `GET /api/repositories/{name}` - 저장소 상세 정보
- `GET /api/repositories/{name}/tags` - 저장소 태그 목록

#### 태그 관련
- `GET /api/repositories/{name}/tags/{tag}` - 태그 상세 정보

#### 검색 및 정렬
- `GET /api/repositories/?search={query}` - 저장소 검색
- `GET /api/repositories/?sort_by={field}&sort_order={order}` - 정렬

### 응답 형식

#### 저장소 목록
```json
{
  "repositories": [
    {
      "name": "nginx",
      "tag_count": 15,
      "last_updated": "2023-12-01T12:00:00Z",
      "size_bytes": 142857600
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total_pages": 1,
    "total_items": 1,
    "has_next": false,
    "has_previous": false
  }
}
```

#### 태그 목록
```json
{
  "tags": [
    {
      "repository": "nginx",
      "tag": "latest",
      "digest": "sha256:...",
      "size_bytes": 142857600,
      "size_formatted": "136.2 MB",
      "created": "2023-12-01T12:00:00Z",
      "created_formatted": "2 days ago",
      "architecture": "amd64",
      "os": "linux",
      "pull_command": "docker pull localhost:5000/nginx:latest"
    }
  ],
  "page": 1,
  "page_size": 20,
  "total_count": 1,
  "total_pages": 1
}
```

## 🎨 UI 컴포넌트

### 주요 컴포넌트
- **RepositoryCard** - 저장소 정보 카드
- **TagList** - 태그 목록
- **SearchBar** - 검색 입력
- **Pagination** - 페이지네이션
- **Modal** - 모달 다이얼로그
- **Spinner** - 로딩 스피너

### 스타일 시스템
- CSS 변수 기반 테마 시스템
- 반응형 디자인
- 접근성 지원
- 다크 테마

## 🔍 사용법

### 1. 저장소 탐색
1. 메인 페이지에서 저장소 목록 확인
2. 검색창에 저장소 이름 입력하여 필터링
3. 정렬 드롭다운으로 정렬 기준 변경

### 2. 태그 관리
1. 저장소 카드 클릭하여 상세 정보 확인
2. 태그 목록에서 특정 태그 선택
3. Pull 명령어 복사하여 사용

### 3. 검색 및 필터링
1. 검색창에 키워드 입력 (실시간 검색)
2. 사이드바의 태그 클릭하여 태그별 필터링
3. 정렬 옵션으로 결과 정렬

## 🚀 성능 최적화

### 캐싱 전략
- Redis를 사용한 API 응답 캐싱
- ETag를 통한 조건부 요청
- 정적 자산 캐싱

### 프론트엔드 최적화
- 디바운싱을 통한 검색 최적화
- 지연 로딩
- 이미지 최적화

### 백엔드 최적화
- 비동기 처리
- 연결 풀링
- 에러 핸들링

## 🐛 문제 해결

### 일반적인 문제

#### 1. Registry 연결 실패
```bash
# Registry 상태 확인
curl http://localhost:5000/v2/

# 인증 정보 확인
docker login localhost:5000
```

#### 2. CORS 오류
```bash
# .env 파일에서 CORS_ORIGINS 설정 확인
CORS_ORIGINS=http://localhost,http://localhost:3000
```

#### 3. 포트 충돌
```bash
# 사용 중인 포트 확인
netstat -tulpn | grep :80
netstat -tulpn | grep :8000

# 포트 변경
API_PORT=8001
FRONTEND_PORT=8080
```

### 로그 확인
```bash
# 백엔드 로그
docker-compose logs backend

# 프론트엔드 로그
docker-compose logs frontend

# 실시간 로그
docker-compose logs -f
```

## 🤝 기여하기

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

## 🙏 감사의 말

- [Docker Registry](https://docs.docker.com/registry/) - 이미지 저장소
- [FastAPI](https://fastapi.tiangolo.com/) - 백엔드 프레임워크
- [Nginx](https://nginx.org/) - 웹 서버

## 📞 지원

문제가 있거나 질문이 있으시면 [Issues](https://github.com/your-username/repovista/issues)를 통해 문의해 주세요.

---

**RepoVista** - Docker Registry를 더 쉽게 관리하세요! 🐳