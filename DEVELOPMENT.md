# Development Environment Setup

## Overview

This guide helps you set up a local development environment for RepoVista. For production deployment, see [PRODUCTION.md](PRODUCTION.md).

## Prerequisites

- Python 3.11+
- Node.js 18+
- Docker and Docker Compose
- Git

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/repovista.git
cd repovista
```

### 2. Choose Your Registry Setup

You have three options for development:

#### Option A: Use Existing Registry (Recommended)

If you have access to a test/staging Registry:

```bash
cp .env.example .env
# Edit .env with your test Registry URL and credentials
```

#### Option B: Run Local Registry for Testing

Use the provided development script:

```bash
# This script sets up a local Registry with sample images
./dev-tools/setup-local-registry.sh

# This creates a .env.local-registry file
cp .env.local-registry .env
# Note: Update ports in .env if needed:
# API_PORT=3033 (for host mapping)
# FRONTEND_PORT=8083 (for host mapping)
```

**Note**: The local Registry is for development only. In production, RepoVista connects to an existing Registry.

#### Option C: Use Mock Data (Development/Testing)

Enable mock data mode (no Registry required):

```bash
cp .env.example .env
# Edit .env and set:
USE_MOCK_DATA=true
```

This mode provides realistic mock data for:
- 50+ sample repositories
- Multiple tags per repository
- Realistic size and date information
- Perfect for UI development and testing

### 3. Backend Development

#### Setup Python Environment

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt  # Development dependencies
```

#### Run Backend Server

```bash
# Run with auto-reload (using non-standard port to avoid conflicts)
uvicorn backend.main:app --reload --host 0.0.0.0 --port 3033

# Run with mock data mode
USE_MOCK_DATA=true uvicorn backend.main:app --reload --host 0.0.0.0 --port 3033

# Or use the development script
python -m backend.main

# Enable debug logging
LOG_LEVEL=DEBUG uvicorn backend.main:app --reload --host 0.0.0.0 --port 3033
```

#### Run Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=backend --cov-report=html

# Run specific test file
pytest tests/test_registry_client.py -v

# Run with live output
pytest -s -v
```

### 4. Frontend Development

The frontend uses vanilla JavaScript (no build step required):

```bash
# Option 1: Use Python's built-in server (using non-standard port)
python -m http.server 8083 --directory frontend

# Option 2: Use Node.js http-server
npx http-server frontend -p 8083

# Option 3: Use Live Server VS Code extension
# Right-click index.html → "Open with Live Server" (configure port to 8083)
```

Access frontend at: http://localhost:8083

### 5. Full Stack Development

Run both frontend and backend with Docker Compose:

```bash
# Build and run all services
docker-compose up --build

# Run in background
docker-compose up -d

# View logs
docker-compose logs -f

# Rebuild after changes
docker-compose down
docker-compose build --no-cache
docker-compose up
```

## Development Workflow

### 1. Making Backend Changes

```bash
# 1. Activate virtual environment
source venv/bin/activate

# 2. Make your changes
# 3. Run tests
pytest tests/

# 4. Check code quality
black backend/
flake8 backend/
mypy backend/

# 5. Test with curl
curl http://localhost:3033/api/repositories
```

### 2. Making Frontend Changes

```bash
# 1. Edit files in frontend/
# 2. Refresh browser (no build needed)
# 3. Check browser console for errors
# 4. Test with different screen sizes
```

### 3. Testing API Integration

```bash
# Test backend endpoints
curl http://localhost:3033/api/health
curl http://localhost:3033/api/repositories
curl http://localhost:3033/api/repositories/nginx/tags

# Test with authentication
curl -u username:password http://localhost:3033/api/repositories
```

## Project Structure

```
repovista/
├── backend/                 # Python FastAPI backend
│   ├── api/                # API endpoints
│   │   ├── repositories.py # Repository endpoints
│   │   └── tags.py        # Tag endpoints
│   ├── services/           # Business logic
│   │   ├── registry.py    # Registry client
│   │   ├── mock_registry.py # Mock data provider
│   │   ├── repository_service.py # Business logic
│   │   ├── sqlite_cache.py # SQLite caching
│   │   └── cache.py       # Cache interface
│   ├── models/             # Data models
│   │   ├── schemas.py     # Pydantic schemas
│   │   └── database.py    # Database models
│   ├── utils/              # Utility functions
│   │   ├── pagination.py  # Pagination helpers
│   │   ├── search.py      # Search functionality
│   │   └── sorting.py     # Sorting utilities
│   ├── config.py          # Configuration
│   └── main.py            # Application entry
├── frontend/               # Vanilla JS frontend
│   ├── index.html         # Main HTML
│   ├── css/               # Stylesheets
│   │   └── styles.css     # Main styles (with dark mode)
│   ├── js/                # JavaScript
│   │   └── app.js         # Main application (all-in-one)
│   ├── components/        # Component templates
│   └── assets/            # Static assets
├── e2e-tests/              # Playwright E2E tests
│   ├── repository-listing.spec.js
│   ├── tag-details.spec.js
│   ├── search-filter.spec.js
│   ├── pagination.spec.js
│   ├── sorting.spec.js
│   └── cross-browser.spec.js
├── performance-tests/      # Performance testing
│   └── load-test.js       # Load testing script
├── tests/                  # Unit tests
│   ├── conftest.py        # Test fixtures
│   └── test_*.py          # Test modules
├── dev-tools/              # Development utilities
│   └── setup-local-registry.sh
├── docker-compose.yml      # Docker composition
├── playwright.config.js    # Playwright config
├── package.json           # Node dependencies
├── requirements.txt        # Python dependencies
└── .env.example           # Environment template
```

## Code Style and Standards

### Python (Backend)

- **Style**: PEP 8
- **Formatter**: Black
- **Linter**: Flake8
- **Type Checker**: MyPy
- **Docstrings**: Google style

```bash
# Format code
black backend/ --line-length 88

# Check style
flake8 backend/ --max-line-length 88

# Check types
mypy backend/
```

### JavaScript (Frontend)

- **Style**: Airbnb guide (adapted for vanilla JS)
- **Features**: ES6+ (no transpilation)
- **Comments**: JSDoc style

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/your-feature

# Make changes and commit
git add .
git commit -m "feat: add new feature"

# Push and create PR
git push origin feature/your-feature
```

Commit message format:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `style:` Code style
- `refactor:` Refactoring
- `test:` Tests
- `chore:` Maintenance

## Testing

### Unit Tests

```bash
# Run all unit tests
pytest tests/unit/

# Run with debugging
pytest tests/unit/ -vv --tb=short
```

### Integration Tests

```bash
# Run integration tests (requires Registry)
pytest tests/integration/

# Skip integration tests
pytest -m "not integration"
```

### E2E Tests

```bash
# Install Playwright and dependencies
npm install
npx playwright install  # Install browser binaries

# Run all E2E tests
npx playwright test

# Run with UI (interactive mode)
npx playwright test --ui

# Run specific test file
npx playwright test e2e-tests/repository-listing.spec.js

# Run specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Run in headed mode (see browser)
npx playwright test --headed

# Generate test report
npx playwright test --reporter=html
npx playwright show-report
```

### Manual Testing Checklist

- [ ] Repository list loads correctly
- [ ] Search functionality works (real-time filtering)
- [ ] Pagination works (20/50/100 items per page)
- [ ] Sorting works (name/date, asc/desc)
- [ ] Tag expansion shows correct data
- [ ] Copy buttons work for pull commands
- [ ] Dark mode toggle works and persists
- [ ] Theme follows system preference
- [ ] Error states display correctly
- [ ] Loading states show appropriately
- [ ] Mock data mode works (USE_MOCK_DATA=true)
- [ ] SQLite cache is created and used
- [ ] Cross-browser compatibility (Chrome, Firefox, Safari, Edge)

## Debugging

### Backend Debugging

```python
# Add breakpoints in code
import pdb; pdb.set_trace()

# Or use VS Code debugger with launch.json:
{
  "name": "FastAPI",
  "type": "python",
  "request": "launch",
  "module": "uvicorn",
  "args": ["backend.main:app", "--reload"]
}
```

### Frontend Debugging

```javascript
// Use browser DevTools
console.log('Debug info:', data);
debugger;  // Breakpoint

// Check network tab for API calls
// Check Application tab for localStorage (theme preference)
// Use Console for JavaScript errors
// Use Elements tab to inspect DOM and CSS

// Dark mode debugging
localStorage.getItem('theme');  // Check current theme
localStorage.setItem('theme', 'dark');  // Force dark mode
localStorage.setItem('theme', 'light');  // Force light mode
```

### Docker Debugging

```bash
# View container logs
docker-compose logs backend -f

# Execute commands in container
docker-compose exec backend bash
docker-compose exec backend python -c "import requests; print(requests.get('http://localhost:8000/api/health').json())"
# Note: Inside container, backend still runs on port 8000

# Inspect container
docker inspect repovista-backend
```

## Performance Testing

### Load Testing

```bash
# Run load test with Node.js (no k6 required)
node performance-tests/load-test.js

# The test simulates:
# - Concurrent users (default: 10)
# - Multiple requests per user
# - Repository listing and tag fetching
# - Reports response times and success rates

# Custom parameters:
CONCURRENT_USERS=20 node performance-tests/load-test.js
REQUESTS_PER_USER=50 node performance-tests/load-test.js
```

### Browser Performance

1. Open Chrome DevTools
2. Go to Performance tab
3. Record while using the application
4. Analyze results

## Environment Variables

### Development Variables

```bash
# Core settings
API_PORT=3033                      # Backend API port
FRONTEND_PORT=8083                 # Frontend server port
REGISTRY_URL=http://localhost:5000 # Registry URL
REGISTRY_USERNAME=readonly_user    # Registry username
REGISTRY_PASSWORD=secure_password  # Registry password

# Development-specific settings
LOG_LEVEL=DEBUG                    # Verbose logging
USE_MOCK_DATA=false                # Use mock data instead of Registry
RELOAD=true                        # Auto-reload on changes

# Cache settings
CACHE_TTL=300                      # Cache TTL in seconds (5 minutes)
CACHE_DB_PATH=./cache.db           # SQLite cache database path

# CORS settings
CORS_ORIGINS=http://localhost:8083,http://localhost:8080
```

### Test Variables

```bash
# Test-specific settings
TESTING=true
TEST_REGISTRY_URL=http://localhost:5000
TEST_USERNAME=testuser
TEST_PASSWORD=testpass
```

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Find process using port
lsof -i :3033  # macOS/Linux (backend)
lsof -i :8083  # macOS/Linux (frontend)
netstat -ano | findstr :3033  # Windows (backend)
netstat -ano | findstr :8083  # Windows (frontend)

# Kill process
kill -9 <PID>
```

#### Python Import Errors

```bash
# Ensure virtual environment is activated
which python  # Should show venv path

# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

#### Docker Registry Connection Failed

```bash
# Check Registry is running
docker ps | grep registry

# Test Registry directly
curl http://localhost:5000/v2/_catalog

# Check network
docker network ls
docker network inspect repovista-network
```

#### CORS Errors

```bash
# Check backend CORS settings
grep CORS .env

# Ensure frontend and backend ports match
# Frontend should call correct backend URL
```

## IDE Setup

### VS Code

Recommended extensions:
- Python
- Pylance
- Black Formatter
- ESLint
- Live Server
- Docker
- GitLens

Settings (.vscode/settings.json):
```json
{
  "python.linting.enabled": true,
  "python.linting.flake8Enabled": true,
  "python.formatting.provider": "black",
  "editor.formatOnSave": true,
  "python.testing.pytestEnabled": true
}
```

### PyCharm

1. Set Python interpreter to venv
2. Configure Flask/FastAPI run configuration
3. Enable Black formatter
4. Set test runner to pytest

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Code of conduct
- How to submit issues
- How to submit pull requests
- Coding standards
- Review process

## Resources

### Documentation

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Docker Registry API](https://docs.docker.com/registry/spec/api/)
- [Pydantic Documentation](https://pydantic-docs.helpmanual.io/)
- [Docker Compose](https://docs.docker.com/compose/)

### Tools

- [Postman](https://www.postman.com/) - API testing
- [Docker Desktop](https://www.docker.com/products/docker-desktop) - Container management
- [Table Plus](https://tableplus.com/) - Database viewer (if adding DB later)

## License

[Your License Here]

---

**Note**: This is a development guide. For production deployment, see [PRODUCTION.md](PRODUCTION.md).