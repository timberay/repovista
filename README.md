# RepoVista - Docker Registry Web UI

RepoVista is a modern, responsive web UI for browsing and managing Docker Registry repositories. It provides an intuitive interface to explore repositories, view tags, and generate pull commands.

## Features

- 📦 **Repository Browser**: Browse all repositories in your Docker Registry
- 🏷️ **Tag Management**: View all tags with detailed information (digest, size, creation date)
- 🔍 **Smart Search**: Real-time search with suggestions and relevance scoring
- 📊 **Advanced Sorting**: Sort by name, tag count, or last updated date
- 📄 **Pagination**: Efficient pagination with customizable page sizes
- 📋 **Copy Commands**: One-click copy for docker pull commands
- ⚡ **Performance**: Built-in caching with ETag support for optimal performance
- 🎨 **Responsive Design**: Works seamlessly on desktop and mobile devices
- 🔒 **Read-Only Access**: Safe, read-only interface to your registry

## Quick Start

### Using Docker Compose (Recommended)

1. Clone the repository:
```bash
git clone https://github.com/your-org/repovista.git
cd repovista
```

2. Create a `.env` file with your registry configuration:
```env
# Docker Registry Configuration
REGISTRY_URL=https://registry.example.com
REGISTRY_USERNAME=readonly_user
REGISTRY_PASSWORD=your_secure_password

# CORS Configuration (comma-separated origins)
CORS_ORIGINS=http://localhost,http://localhost:8080,https://yourdomain.com

# Optional: API Port (default: 8000)
API_PORT=8000

# Optional: Frontend Port (default: 8080)
FRONTEND_PORT=8080
```

3. Start the services:
```bash
docker-compose up -d
```

4. Access the UI at `http://localhost:8080`

### Production Deployment

For production deployment, use the optimized production configuration:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `REGISTRY_URL` | Docker Registry URL | - | Yes |
| `REGISTRY_USERNAME` | Registry username | - | No |
| `REGISTRY_PASSWORD` | Registry password | - | No |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | `http://localhost` | No |
| `API_PORT` | Backend API port | `8000` | No |
| `FRONTEND_PORT` | Frontend web server port | `8080` | No |

### Docker Registry Authentication

RepoVista supports multiple authentication methods:

1. **No Authentication**: For public registries
2. **Basic Authentication**: Username and password
3. **Token Authentication**: Bearer token support (automatic)

### SSL/TLS Configuration

For production deployments with HTTPS:

1. **Using a Reverse Proxy (Recommended)**:

```nginx
server {
    listen 443 ssl http2;
    server_name repovista.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

2. **Direct SSL Configuration**:

Modify `nginx.conf` to include SSL certificates:
```nginx
server {
    listen 443 ssl;
    ssl_certificate /etc/nginx/certs/cert.pem;
    ssl_certificate_key /etc/nginx/certs/key.pem;
    # ... rest of configuration
}
```

## Development

### Prerequisites

- Python 3.11+
- Node.js 18+ (for E2E tests)
- Docker & Docker Compose

### Backend Development

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Development

The frontend uses vanilla JavaScript and can be served with any static file server:

```bash
# Using Python's built-in server
python -m http.server 8080 --directory frontend

# Or using Node.js
npx serve frontend -l 8080
```

### Running Tests

```bash
# Backend unit tests with coverage
python -m pytest --cov=backend --cov-report=html

# E2E tests with Playwright
npm install
npx playwright install
npm run test:e2e

# Performance tests with k6
k6 run performance-tests/load-test.js
```

## API Documentation

The API documentation is available at:
- Swagger UI: `http://localhost:8000/api/docs`
- ReDoc: `http://localhost:8000/api/redoc`

### Key Endpoints

- `GET /api/repositories` - List repositories with pagination
- `GET /api/repositories/{name}` - Get repository details
- `GET /api/repositories/{name}/tags` - List tags for a repository
- `GET /api/cache/stats` - View cache statistics
- `POST /api/cache/clear` - Clear cache (manual refresh)

## Performance Optimization

RepoVista includes several performance optimizations:

1. **In-Memory Caching**: Reduces Registry API calls
2. **ETag Support**: Enables browser caching with 304 responses
3. **Pagination**: Efficient data loading
4. **Lazy Loading**: Tags are loaded on-demand
5. **Debounced Search**: Reduces API calls during typing

### Cache Configuration

The default cache TTL is:
- Repository list: 5 minutes (300 seconds)
- Repository with metadata: 1 minute (60 seconds)
- Tags: 5 minutes (300 seconds)

## Monitoring

### Health Checks

- Backend health: `http://localhost:8000/api/health`
- Cache statistics: `http://localhost:8000/api/cache/stats`

### Logging

Logs are available via Docker:
```bash
# View all logs
docker-compose logs

# View backend logs
docker-compose logs backend

# Follow logs in real-time
docker-compose logs -f
```

## Troubleshooting

### Common Issues

1. **Connection Refused to Registry**
   - Verify `REGISTRY_URL` is correct
   - Check network connectivity
   - Ensure registry allows connections

2. **Authentication Errors**
   - Verify credentials in `.env`
   - Check registry authentication method
   - Ensure user has read permissions

3. **CORS Errors**
   - Add your domain to `CORS_ORIGINS`
   - Restart the backend service

4. **Empty Repository List**
   - Check registry has repositories
   - Verify authentication is working
   - Check browser console for errors

### Debug Mode

Enable debug logging:
```bash
# In docker-compose.yml, add to backend service:
environment:
  - LOG_LEVEL=DEBUG
```

## System Requirements

### Minimum Requirements
- CPU: 1 core
- RAM: 512MB
- Disk: 100MB
- Docker: 20.10+
- Docker Compose: 2.0+

### Recommended for Production
- CPU: 2+ cores
- RAM: 2GB+
- Disk: 1GB+
- Load Balancer for HA
- Monitoring (Prometheus/Grafana)

## Security Considerations

1. **Read-Only Access**: RepoVista only requires read access to the registry
2. **HTTPS**: Always use HTTPS in production
3. **Authentication**: Use strong passwords and rotate regularly
4. **Network Isolation**: Keep RepoVista in a secure network segment
5. **Updates**: Regularly update dependencies and base images

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

For issues and feature requests, please use the [GitHub Issues](https://github.com/your-org/repovista/issues) page.

## Acknowledgments

- Built with FastAPI and vanilla JavaScript
- Inspired by Docker Hub and other registry UIs
- Icons from Heroicons and Feather Icons