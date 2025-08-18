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
# API_PORT=3032 (for host mapping)
# FRONTEND_PORT=8082 (for host mapping)
```

**Note**: The local Registry is for development only. In production, RepoVista connects to an existing Registry.

#### Option C: Use Mock Data

Enable mock data mode (no Registry required):

```bash
cp .env.example .env
# Edit .env and set:
USE_MOCK_DATA=true
```

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
uvicorn backend.main:app --reload --host 0.0.0.0 --port 3032

# Or use the development script
python -m backend.main
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
python -m http.server 8082 --directory frontend

# Option 2: Use Node.js http-server
npx http-server frontend -p 8082

# Option 3: Use Live Server VS Code extension
# Right-click index.html → "Open with Live Server" (configure port to 8082)
```

Access frontend at: http://localhost:8082

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
curl http://localhost:3032/api/repositories
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
curl http://localhost:3032/api/health
curl http://localhost:3032/api/repositories
curl http://localhost:3032/api/repositories/nginx/tags

# Test with authentication
curl -u username:password http://localhost:3032/api/repositories
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
│   │   └── cache.py       # Caching service
│   ├── models/             # Data models
│   │   └── schemas.py     # Pydantic schemas
│   ├── config.py          # Configuration
│   └── main.py            # Application entry
├── frontend/               # Vanilla JS frontend
│   ├── index.html         # Main HTML
│   ├── css/               # Stylesheets
│   │   └── styles.css     # Main styles
│   ├── js/                # JavaScript
│   │   └── app.js         # Main application
│   └── assets/            # Static assets
├── tests/                  # Test files
│   ├── conftest.py        # Test fixtures
│   ├── test_*.py          # Test modules
│   └── mocks/             # Mock data
├── dev-tools/              # Development utilities
│   └── setup-local-registry.sh
├── docker-compose.yml      # Docker composition
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
# Install Playwright
npm install

# Run E2E tests
npx playwright test

# Run with UI
npx playwright test --ui

# Run specific browser
npx playwright test --project=chromium
```

### Manual Testing Checklist

- [ ] Repository list loads correctly
- [ ] Search functionality works
- [ ] Pagination works
- [ ] Tag expansion shows correct data
- [ ] Copy buttons work
- [ ] Dark mode toggle works
- [ ] Error states display correctly
- [ ] Loading states show appropriately

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
// Use React DevTools for component inspection
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
# Install k6
brew install k6  # macOS
# or download from https://k6.io

# Run load test
k6 run performance-tests/load-test.js
```

### Browser Performance

1. Open Chrome DevTools
2. Go to Performance tab
3. Record while using the application
4. Analyze results

## Environment Variables

### Development Variables

```bash
# Development-specific settings
LOG_LEVEL=DEBUG                    # Verbose logging
USE_MOCK_DATA=false                # Use mock data instead of Registry
RELOAD=true                        # Auto-reload on changes
CACHE_TTL_REPOSITORIES=60          # Shorter cache for development
CACHE_TTL_TAGS=60                  # Shorter cache for development
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
lsof -i :3032  # macOS/Linux (backend)
lsof -i :8082  # macOS/Linux (frontend)
netstat -ano | findstr :3032  # Windows (backend)
netstat -ano | findstr :8082  # Windows (frontend)

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