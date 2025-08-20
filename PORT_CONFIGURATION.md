# RepoVista Port Configuration

## Overview
RepoVista uses specific ports for frontend and backend services to avoid conflicts with common services.

## Port Mapping

### Production Configuration

| Service | Host Port | Container Port | Description |
|---------|-----------|---------------|-------------|
| Frontend | 8083 | 80 | Nginx web server serving the UI |
| Backend | 3033 | 8000 | FastAPI backend service |

### Important Notes

1. **Single Port Exposure**: Each service exposes ONLY ONE port to the host:
   - Frontend: Only port 8083 is exposed (maps to internal port 80)
   - Backend: Only port 3033 is exposed (maps to internal port 8000)

2. **Internal Communication**: 
   - Inside Docker network, services communicate using container ports (80 and 8000)
   - Frontend nginx proxies `/api` requests to `backend:8000`

3. **Docker Compose Configuration**:
   ```yaml
   # docker-compose.yml
   services:
     backend:
       ports:
         - "${API_PORT:-3033}:8000"  # Host:Container
     
     frontend:
       ports:
         - "${FRONTEND_PORT:-8083}:80"  # Host:Container
   ```

4. **Override Configuration**:
   ```yaml
   # docker-compose.override.yml
   services:
     backend:
       ports:
         - "3033:8000"
     
     frontend:
       ports:
         - "8083:80"
   ```

## Accessing Services

- **Frontend UI**: http://localhost:8083
- **Backend API**: http://localhost:3033/api
- **API Documentation**: http://localhost:3033/api/docs

## Environment Variables

Set in `.env` file:
```bash
API_PORT=3033         # Backend host port
FRONTEND_PORT=8083    # Frontend host port
```

## Testing the Configuration

Start services:
```bash
docker compose up -d
```

Verify port bindings:
```bash
docker compose ps
# Should show:
# repovista-backend: 0.0.0.0:3033->8000/tcp
# repovista-frontend: 0.0.0.0:8083->80/tcp
```

Test endpoints:
```bash
# Frontend
curl http://localhost:8083

# Backend API
curl http://localhost:3033/api/health
```

## Troubleshooting

If you see duplicate port bindings (e.g., both 80 and 8083, or both 8000 and 3033):

1. Stop all containers:
   ```bash
   docker compose down
   ```

2. Remove any conflicting containers:
   ```bash
   docker ps -a | grep repovista
   docker rm repovista-frontend repovista-backend
   ```

3. Rebuild and start:
   ```bash
   docker compose build --no-cache
   docker compose up -d
   ```

4. Verify correct ports:
   ```bash
   docker ps --format "table {{.Names}}\t{{.Ports}}"
   ```

## Security Considerations

- The internal ports (80, 8000) are NOT exposed to the host
- Only the mapped ports (8083, 3033) are accessible from outside Docker
- This provides an additional layer of security and port isolation