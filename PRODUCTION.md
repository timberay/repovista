# Production Deployment Guide

## Overview

RepoVista is a **read-only web UI client** for Docker Registry. It provides a user-friendly interface to browse and manage Docker images stored in your existing Registry.

**Important**: RepoVista does NOT include or manage a Docker Registry. You must have a Docker Registry already running and accessible.

## Prerequisites

- ✅ Docker Registry (v2 API) already running and accessible
- ✅ Docker and Docker Compose installed on the deployment server
- ✅ Registry URL and credentials (if authentication is required)
- ✅ Network connectivity between RepoVista and your Registry

## Supported Docker Registries

RepoVista works with any Docker Registry v2 API compatible registry:

- Docker Registry 2.0+
- Harbor
- AWS ECR
- Azure Container Registry
- Google Container Registry
- GitLab Container Registry
- JFrog Artifactory
- Sonatype Nexus

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/repovista.git
cd repovista
```

### 2. Configure Registry Connection

```bash
cp .env.example .env
```

Edit `.env` file with your Registry details:

```bash
# Your existing Docker Registry URL
REGISTRY_URL=https://registry.your-company.com

# Authentication (if required)
REGISTRY_USERNAME=readonly_user
REGISTRY_PASSWORD=secure_password

# Service Ports (internal container ports - DO NOT CHANGE)
# Host ports are configured in docker-compose.yml
API_PORT=8000
FRONTEND_PORT=80

# CORS Origins (add your domain)
CORS_ORIGINS=https://repovista.your-company.com
```

### 3. Test Registry Connection

Before deploying, verify Registry connectivity:

```bash
# Test Registry API endpoint
curl -u username:password https://registry.your-company.com/v2/_catalog

# Should return JSON with repository list
{"repositories":["app1","app2","app3"]}
```

### 4. Deploy RepoVista

```bash
docker-compose up -d
```

### 5. Access the Application

- **Frontend UI**: http://your-server:8083
- **Backend API**: http://your-server:3033
- **API Documentation**: http://your-server:3033/api/docs

## Configuration Details

### Environment Variables

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `REGISTRY_URL` | Docker Registry URL | ✅ Yes | `https://registry.company.com` |
| `REGISTRY_USERNAME` | Registry username | No | `readonly_user` |
| `REGISTRY_PASSWORD` | Registry password | No | `secure_token` |
| `CORS_ORIGINS` | Allowed CORS origins | No | `https://app.company.com` |
| `LOG_LEVEL` | Logging level | No | `INFO` |

### Network Configuration

Ensure proper network connectivity:

1. **From Container to Registry**: RepoVista containers must reach your Registry
2. **From Browser to RepoVista**: Users must access both frontend (8083) and backend (3033) ports

### SSL/TLS Configuration

For production deployments with HTTPS:

1. Use a reverse proxy (nginx, Traefik, etc.)
2. Configure SSL certificates
3. Update CORS_ORIGINS in `.env`

Example nginx configuration:

```nginx
server {
    listen 443 ssl;
    server_name repovista.your-company.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:8083;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /api {
        proxy_pass http://localhost:3033;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Security Considerations

### Read-Only Access

RepoVista is designed as a **read-only** interface:
- Cannot push, delete, or modify images
- Cannot change Registry configuration
- Only queries Registry for information

### Authentication Best Practices

1. **Create a dedicated read-only user** in your Registry for RepoVista
2. **Use tokens instead of passwords** when possible
3. **Rotate credentials regularly**
4. **Never use admin credentials**

Example: Creating read-only user in Harbor:

```bash
# In Harbor UI:
# 1. Create new user: repovista_readonly
# 2. Assign "Guest" role to all projects
# 3. Generate CLI secret/token
```

### Network Security

1. **Restrict access** to RepoVista ports using firewall rules
2. **Use VPN or private network** for internal deployments
3. **Enable HTTPS** for production deployments
4. **Implement rate limiting** at reverse proxy level

## Monitoring

### Health Checks

RepoVista includes built-in health check endpoints:

```bash
# Check frontend health
curl http://localhost:8083/nginx-health

# Check backend health
curl http://localhost:3033/api/health

# Check Registry connectivity
curl http://localhost:3033/api/repositories/config
```

### Logging

View application logs:

```bash
# All services
docker-compose logs -f

# Backend only
docker-compose logs -f backend

# Frontend only
docker-compose logs -f frontend
```

### Metrics

Monitor key metrics:
- Registry API response times
- Cache hit/miss rates
- Error rates and types
- Concurrent user sessions

## Troubleshooting

### Registry Connection Issues

```bash
# Test from RepoVista container
docker-compose exec backend curl -v $REGISTRY_URL/v2/

# Common issues:
# - Wrong REGISTRY_URL format (missing https://)
# - Network connectivity blocked
# - Invalid credentials
# - Registry certificate issues
```

### CORS Errors

If seeing CORS errors in browser:
1. Check CORS_ORIGINS in `.env` includes your domain
2. Restart services: `docker-compose restart`
3. Clear browser cache

### Performance Issues

1. **Enable caching** (enabled by default)
2. **Increase backend workers** in Dockerfile.backend
3. **Add Redis** for distributed caching (future enhancement)

## Backup and Recovery

RepoVista is stateless and doesn't store data:
- No database to backup
- Configuration in `.env` file only
- Can be redeployed anytime without data loss

Backup only the configuration:
```bash
cp .env .env.backup
```

## Updates and Maintenance

### Updating RepoVista

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Zero-Downtime Updates

For zero-downtime updates, use blue-green deployment:

1. Deploy new version to different ports
2. Test new version
3. Switch load balancer/proxy to new version
4. Remove old version

## Support

### Documentation

- [README.md](README.md) - General overview
- [DEVELOPMENT.md](DEVELOPMENT.md) - Development setup
- [API Documentation](http://localhost:3033/api/docs) - Interactive API docs

### Common Registry Endpoints

Test these endpoints directly on your Registry:

```bash
# List repositories
curl -u user:pass https://registry/v2/_catalog

# List tags
curl -u user:pass https://registry/v2/repository/tags/list

# Get manifest
curl -u user:pass https://registry/v2/repository/manifests/tag
```

## License

[Your License Here]

---

**Remember**: RepoVista is a UI client for your existing Docker Registry. Ensure your Registry is properly configured and accessible before deploying RepoVista.