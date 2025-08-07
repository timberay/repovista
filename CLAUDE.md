# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**RepoVista** - A Docker Registry Web UI service that provides developers with an intuitive interface to browse and select Docker images for deployment.

## Technology Stack

### Backend
- **Language**: Python with FastAPI
- **API**: Docker Registry v2 API client
- **Authentication**: Read-only access to Docker Registry

### Frontend
- **Pure JavaScript** (ES6+) - No frameworks
- **HTML5 & CSS3**
- **Fetch API** for HTTP communication

### Deployment
- Docker & Docker Compose
- Production-ready configuration (no dev/prod separation)

## Development Commands

```bash
# Backend development
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Docker deployment
docker-compose up -d
docker-compose down
docker-compose logs -f

# Testing
pytest tests/
pytest tests/test_api.py -v  # Run specific test file
```

## Project Structure

```
repovista/
├── backend/
│   ├── main.py              # FastAPI application entry point
│   ├── api/                 # API routes
│   │   ├── __init__.py
│   │   ├── repositories.py  # Repository endpoints
│   │   └── tags.py         # Tag endpoints
│   ├── services/           # Business logic
│   │   ├── __init__.py
│   │   └── registry.py     # Docker Registry client
│   ├── models/             # Data models
│   │   ├── __init__.py
│   │   └── schemas.py      # Pydantic models
│   └── config.py           # Configuration management
├── frontend/
│   ├── index.html          # Main HTML page
│   ├── css/
│   │   └── styles.css      # Application styles
│   ├── js/
│   │   ├── app.js          # Main application logic
│   │   ├── api.js          # API communication layer
│   │   └── utils.js        # Utility functions
│   └── assets/             # Static assets
├── docker-compose.yml      # Docker Compose configuration
├── Dockerfile.backend      # Backend container
├── Dockerfile.frontend     # Frontend container (nginx)
├── requirements.txt        # Python dependencies
├── tests/                  # Test files
└── spec/                   # Specifications
    └── prd.md             # Product Requirements Document
```

## Key Implementation Notes

### API Design
- RESTful endpoints following Docker Registry v2 API patterns
- CORS configuration for frontend-backend communication
- Error handling with appropriate HTTP status codes
- Pagination support with limit/offset parameters

### Frontend Architecture
- Single-page application using vanilla JavaScript
- Accordion-style UI for repository details
- Event delegation for dynamic content
- Fetch API with proper error handling and loading states

### Docker Registry Integration
- Use `python-registry-client` or direct HTTP requests to Registry v2 API
- Handle authentication headers for private registries
- Cache registry responses appropriately
- Implement retry logic for network failures

### UI/UX Requirements
- Clean, intuitive design with light theme
- Repository cards in grid layout
- Accordion expansion for tag details
- Copy-to-clipboard for pull commands
- Loading states and error messages
- Desktop-optimized (Chrome browser support)

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
- Implement caching for registry responses
- Lazy loading for large tag lists
- Debounce search input
- Minimize API calls with proper state management

## Environment Configuration

```bash
# .env file structure
REGISTRY_URL=https://registry.example.com
REGISTRY_USERNAME=readonly_user
REGISTRY_PASSWORD=secure_password
API_PORT=8000
FRONTEND_PORT=80
```

## Testing Strategy
- Unit tests for API endpoints and services
- Integration tests for Registry communication
- Manual testing for UI interactions
- Test with different registry configurations

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md
