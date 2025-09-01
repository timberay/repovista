# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**RepoVista** - A Docker Registry Web UI service that provides developers with an intuitive interface to browse and select Docker images for deployment.

## Technology Stack

### Backend

- **Language**: Python with FastAPI
- **API**: Docker Registry v2 API client
- **Authentication**: Read-only access to Docker Registry
- **Caching**: SQLite-based caching system for performance
- **Mock Data**: Built-in mock registry for development/testing

### Frontend

- **Pure JavaScript** (ES6+) - No frameworks
- **HTML5 & CSS3**
- **Fetch API** for HTTP communication
- **Dark Mode**: Theme toggle support with system preference detection
- **Components**: Modular component-based architecture

### Testing

- **E2E Testing**: Playwright for cross-browser testing
- **Performance Testing**: Load testing with K6
- **Unit Testing**: Pytest for backend services

### Deployment

- Docker & Docker Compose
- Production-ready configuration (no dev/prod separation)
- Multi-stage builds for optimized images

## Development Commands

```bash
# Backend development
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 3033

# Backend with mock data (development)
USE_MOCK_DATA=true uvicorn backend.main:app --reload --host 0.0.0.0 --port 3033

# Frontend development (separate terminal)
cd frontend
python -m http.server 8083

# Docker deployment
docker-compose up -d
docker-compose down
docker-compose logs -f

# Testing
pytest tests/
pytest tests/test_api.py -v  # Run specific test file

# E2E Testing
npm install
npx playwright test
npx playwright test --ui  # Interactive mode

# Performance Testing
node performance-tests/load-test.js
```

## Project Structure

```ini
repovista/
├── backend/
│   ├── main.py              # FastAPI application entry point
│   ├── api/                 # API routes
│   │   ├── __init__.py
│   │   ├── repositories.py  # Repository endpoints
│   │   └── tags.py         # Tag endpoints
│   ├── services/           # Business logic
│   │   ├── __init__.py
│   │   ├── registry.py     # Docker Registry client
│   │   ├── mock_registry.py# Mock data provider
│   │   ├── repository_service.py # Repository business logic
│   │   ├── sqlite_cache.py # SQLite caching implementation
│   │   └── cache.py       # Cache interface
│   ├── models/             # Data models
│   │   ├── __init__.py
│   │   ├── schemas.py      # Pydantic models
│   │   └── database.py     # Database models
│   ├── utils/              # Utility functions
│   │   ├── __init__.py
│   │   ├── pagination.py   # Pagination helpers
│   │   ├── repository.py   # Repository utilities
│   │   ├── search.py       # Search functionality
│   │   └── sorting.py      # Sorting utilities
│   └── config.py           # Configuration management
├── frontend/
│   ├── index.html          # Main HTML page
│   ├── css/
│   │   └── styles.css      # Application styles with dark mode
│   ├── js/
│   │   └── app.js          # Main application logic (all-in-one)
│   ├── components/         # Component templates (future use)
│   ├── assets/             # Static assets
│   └── favicon.ico         # Site favicon
├── e2e-tests/              # Playwright E2E tests
│   ├── repository-listing.spec.js
│   ├── tag-details.spec.js
│   ├── search-filter.spec.js
│   ├── pagination.spec.js
│   ├── sorting.spec.js
│   └── cross-browser.spec.js
├── performance-tests/      # Performance test suite
│   └── load-test.js       # K6-style load testing
├── tests/                  # Unit tests
│   ├── conftest.py        # Test configuration
│   ├── test_registry_api.py
│   ├── test_repositories_api.py
│   └── test_tags_api.py
├── docker-compose.yml      # Docker Compose configuration
├── docker-compose.local-registry.yml # Local registry setup
├── Dockerfile.backend      # Backend container
├── Dockerfile.frontend     # Frontend container (nginx)
├── playwright.config.js    # Playwright configuration
├── package.json           # Node dependencies
├── requirements.txt       # Python dependencies
├── .env.example           # Environment variables template
└── spec/                  # Specifications
    └── prd.md            # Product Requirements Document
```

## Key Implementation Notes

### API Design

- RESTful endpoints following Docker Registry v2 API patterns
- CORS configuration for frontend-backend communication
- Error handling with appropriate HTTP status codes
- Pagination support with limit/offset parameters

### Frontend Architecture

- Single-page application using vanilla JavaScript
- Component-based architecture with modular functions
- Accordion-style UI for repository details
- Event delegation for dynamic content
- Fetch API with proper error handling and loading states
- Dark mode support with localStorage persistence
- Responsive design with mobile considerations

### Docker Registry Integration

- Direct HTTP requests to Registry v2 API
- Handle authentication headers for private registries
- SQLite-based caching system for performance
- Implement retry logic for network failures
- Mock registry mode for development (USE_MOCK_DATA=true)
- Support for both local and remote registries

### UI/UX Requirements

- Clean, intuitive design with light/dark theme toggle
- Repository cards in responsive grid layout
- Accordion expansion for tag details
- Copy-to-clipboard for pull commands
- Loading states and error messages
- Desktop-optimized with mobile responsiveness
- Cross-browser support (Chrome, Firefox, Safari, Edge)
- System theme preference detection

## Core Features to Implement

1. **Repository Listing** (`GET /api/repositories`)
   - Paginated list with search and sorting
   - Display repository name, tag count, last updated

2. **Tag Details** (`GET /api/repositories/{name}/tags`)
   - List all tags for a repository
   - Show tag name, digest, size, created date
   - Generate pull commands

3. **Search & Filter**
   - Real-time search by repository name
   - Sort by name/date (ascending/descending)
   - Pagination controls (20/50/100 items)

## Development Guidelines

### Code Style

- Python: Follow PEP 8, use type hints
- JavaScript: ES6+ features, async/await for API calls
- CSS: BEM methodology for class naming
- Consistent error handling patterns

### Security Considerations

- Read-only access to Docker Registry
- No authentication UI (server-side configuration)
- Validate and sanitize all user inputs
- Use environment variables for registry configuration

### Performance Optimization

- SQLite caching with configurable TTL (default: 5 minutes)
- Lazy loading for large tag lists
- Debounce search input (300ms)
- Minimize API calls with proper state management
- Connection pooling for database operations
- Optimized Docker images with multi-stage builds
- Frontend asset minification in production

## Environment Configuration

```bash
# .env file structure
REGISTRY_URL=https://registry.example.com
REGISTRY_USERNAME=readonly_user
REGISTRY_PASSWORD=secure_password
API_PORT=3033                    # Backend API port
FRONTEND_PORT=8083               # Frontend web server port
USE_MOCK_DATA=false              # Enable mock registry for development
CACHE_TTL=300                    # Cache TTL in seconds (default: 5 minutes)
CACHE_DB_PATH=./cache.db         # SQLite cache database path
LOG_LEVEL=INFO                   # Logging level
CORS_ORIGINS=http://localhost:8083,http://localhost:8080
```

## Testing Strategy

- **Unit Tests**: Pytest for API endpoints and services
- **Integration Tests**: Registry communication with mock data
- **E2E Tests**: Playwright for UI interactions and user workflows
- **Performance Tests**: Load testing with simulated concurrent users
- **Cross-browser Testing**: Chrome, Firefox, Safari, Edge
- **Dark Mode Testing**: Theme persistence and visual regression
- Test with different registry configurations (local, remote, mock)

## Task Master AI Instructions

**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md

## Using git

- Use English to write a git commit message