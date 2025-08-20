#!/bin/bash

# RepoVista Distribution Package Builder
# This script builds Docker images and creates a deployable package

set -e

# Configuration
VERSION="${1:-v1.0.0}"
DIST_DIR="dist"
PACKAGE_NAME="repovista-${VERSION}"
PACKAGE_DIR="${DIST_DIR}/${PACKAGE_NAME}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_color() {
    printf "${2}${1}${NC}\n"
}

# Function to print header
print_header() {
    echo ""
    print_color "========================================" "$BLUE"
    print_color "$1" "$BLUE"
    print_color "========================================" "$BLUE"
    echo ""
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_color "❌ Docker is not installed!" "$RED"
        exit 1
    fi
    print_color "✅ Docker is installed" "$GREEN"
    
    # Check Docker daemon
    if ! docker info &> /dev/null; then
        print_color "❌ Docker daemon is not running!" "$RED"
        exit 1
    fi
    print_color "✅ Docker daemon is running" "$GREEN"
    
    # Check if backend directory exists
    if [ ! -d "backend" ]; then
        print_color "❌ backend directory not found!" "$RED"
        exit 1
    fi
    print_color "✅ backend directory found" "$GREEN"
    
    # Check if frontend directory exists
    if [ ! -d "frontend" ]; then
        print_color "❌ frontend directory not found!" "$RED"
        exit 1
    fi
    print_color "✅ frontend directory found" "$GREEN"
}

# Clean and prepare directories
prepare_directories() {
    print_header "Preparing Distribution Directories"
    
    # Create dist directory if not exists
    mkdir -p ${DIST_DIR}
    
    # Clean previous build
    if [ -d "${PACKAGE_DIR}" ]; then
        print_color "Cleaning previous build..." "$YELLOW"
        rm -rf ${PACKAGE_DIR}
    fi
    
    # Create package structure
    mkdir -p ${PACKAGE_DIR}/{images,config,scripts}
    print_color "✅ Created package directory structure" "$GREEN"
}

# Build Docker images
build_docker_images() {
    print_header "Building Docker Images"
    
    # Build backend image
    print_color "Building backend image..." "$YELLOW"
    docker build -f Dockerfile.backend -t repovista-backend:${VERSION} . || {
        print_color "❌ Failed to build backend image" "$RED"
        exit 1
    }
    print_color "✅ Backend image built: repovista-backend:${VERSION}" "$GREEN"
    
    # Build frontend image
    print_color "Building frontend image..." "$YELLOW"
    docker build -f Dockerfile.frontend -t repovista-frontend:${VERSION} . || {
        print_color "❌ Failed to build frontend image" "$RED"
        exit 1
    }
    print_color "✅ Frontend image built: repovista-frontend:${VERSION}" "$GREEN"
}

# Save Docker images to tar files
save_docker_images() {
    print_header "Saving Docker Images"
    
    # Save backend image
    print_color "Saving backend image..." "$YELLOW"
    docker save repovista-backend:${VERSION} | gzip > ${PACKAGE_DIR}/images/repovista-backend.tar.gz || {
        print_color "❌ Failed to save backend image" "$RED"
        exit 1
    }
    BACKEND_SIZE=$(du -h ${PACKAGE_DIR}/images/repovista-backend.tar.gz | cut -f1)
    print_color "✅ Backend image saved (${BACKEND_SIZE})" "$GREEN"
    
    # Save frontend image
    print_color "Saving frontend image..." "$YELLOW"
    docker save repovista-frontend:${VERSION} | gzip > ${PACKAGE_DIR}/images/repovista-frontend.tar.gz || {
        print_color "❌ Failed to save frontend image" "$RED"
        exit 1
    }
    FRONTEND_SIZE=$(du -h ${PACKAGE_DIR}/images/repovista-frontend.tar.gz | cut -f1)
    print_color "✅ Frontend image saved (${FRONTEND_SIZE})" "$GREEN"
}

# Create configuration files
create_config_files() {
    print_header "Creating Configuration Files"
    
    # Create docker-compose.yml for production (using images)
    cat > ${PACKAGE_DIR}/config/docker-compose.yml << 'EOF'
version: '3.8'

services:
  backend:
    image: repovista-backend:VERSION_PLACEHOLDER
    container_name: repovista-backend
    restart: unless-stopped
    ports:
      - "${API_PORT:-3033}:8000"
    environment:
      - REGISTRY_URL=${REGISTRY_URL}
      - REGISTRY_USERNAME=${REGISTRY_USERNAME}
      - REGISTRY_PASSWORD=${REGISTRY_PASSWORD}
      - CORS_ORIGINS=${CORS_ORIGINS:-http://localhost}
      - LOG_LEVEL=${LOG_LEVEL:-INFO}
      - APP_ENV=production
      - DEBUG=false
    env_file:
      - .env
    networks:
      - repovista-network
    volumes:
      - backend-logs:/app/logs
      - backend-cache:/app/.cache
    healthcheck:
      test: ["CMD", "python", "-c", "import requests; requests.get('http://localhost:8000/api/health')"]
      interval: 30s
      timeout: 3s
      start_period: 10s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 256M

  frontend:
    image: repovista-frontend:VERSION_PLACEHOLDER
    container_name: repovista-frontend
    restart: unless-stopped
    ports:
      - "${FRONTEND_PORT:-8083}:80"
    depends_on:
      - backend
    networks:
      - repovista-network
    volumes:
      - nginx-logs:/var/log/nginx
      - nginx-cache:/var/cache/nginx
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/nginx-health"]
      interval: 30s
      timeout: 3s
      start_period: 5s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 128M

networks:
  repovista-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16
    driver_opts:
      com.docker.network.bridge.name: br-repovista

volumes:
  backend-logs:
    driver: local
  backend-cache:
    driver: local
  nginx-logs:
    driver: local
  nginx-cache:
    driver: local
EOF
    
    # Replace version placeholder
    sed -i "s/VERSION_PLACEHOLDER/${VERSION}/g" ${PACKAGE_DIR}/config/docker-compose.yml
    print_color "✅ Created docker-compose.yml" "$GREEN"
    
    # Create .env.example
    cat > ${PACKAGE_DIR}/config/.env.example << 'EOF'
# RepoVista Configuration
# Copy this file to .env and configure your settings

# Docker Registry Configuration
# Your existing Docker Registry URL (required)
REGISTRY_URL=https://registry.example.com

# Registry Authentication (optional)
# Create a read-only user in your registry for RepoVista
REGISTRY_USERNAME=readonly_user
REGISTRY_PASSWORD=your_secure_password

# Service Ports
# Modify these if the default ports are already in use
API_PORT=3033
FRONTEND_PORT=8083

# CORS Configuration
# Add your domain(s) for production deployment
# Multiple origins: http://domain1.com,https://domain2.com
CORS_ORIGINS=http://localhost:8083

# Logging
# Options: DEBUG, INFO, WARNING, ERROR, CRITICAL
LOG_LEVEL=INFO

# Cache Settings (optional)
# Cache TTL in seconds (default: 300)
CACHE_TTL=300

# Max items in cache (default: 1000)
CACHE_MAX_SIZE=1000

# Performance Tuning (optional)
# Number of worker processes for backend
# WORKERS=2

# Request timeout in seconds
# REQUEST_TIMEOUT=30

# Security Headers (optional)
# Content Security Policy
# CSP_HEADER="default-src 'self'"

# Additional Registry Configuration (optional)
# For registries with non-standard configurations
# REGISTRY_VERIFY_SSL=true
# REGISTRY_API_VERSION=v2
EOF
    print_color "✅ Created .env.example" "$GREEN"
}

# Create operation scripts
create_scripts() {
    print_header "Creating Operation Scripts"
    
    # Create main deployment script
    cat > ${PACKAGE_DIR}/scripts/deploy.sh << 'EOF'
#!/bin/bash

# RepoVista Deployment Manager
set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="${BASE_DIR}/config"
IMAGES_DIR="${BASE_DIR}/images"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_color() {
    printf "${2}${1}${NC}\n"
}

# Load Docker images
load_images() {
    print_color "Loading Docker images..." "$YELLOW"
    
    if [ -f "${IMAGES_DIR}/repovista-backend.tar.gz" ]; then
        print_color "Loading backend image..." "$YELLOW"
        docker load < "${IMAGES_DIR}/repovista-backend.tar.gz"
        print_color "✅ Backend image loaded" "$GREEN"
    else
        print_color "❌ Backend image not found!" "$RED"
        exit 1
    fi
    
    if [ -f "${IMAGES_DIR}/repovista-frontend.tar.gz" ]; then
        print_color "Loading frontend image..." "$YELLOW"
        docker load < "${IMAGES_DIR}/repovista-frontend.tar.gz"
        print_color "✅ Frontend image loaded" "$GREEN"
    else
        print_color "❌ Frontend image not found!" "$RED"
        exit 1
    fi
}

# Check environment file
check_env() {
    if [ ! -f "${CONFIG_DIR}/.env" ]; then
        print_color "❌ .env file not found!" "$RED"
        print_color "Please copy .env.example to .env and configure it:" "$YELLOW"
        print_color "  cp ${CONFIG_DIR}/.env.example ${CONFIG_DIR}/.env" "$YELLOW"
        exit 1
    fi
}

# Start services
start_services() {
    check_env
    print_color "Starting RepoVista services..." "$YELLOW"
    cd "${CONFIG_DIR}"
    docker-compose up -d
    print_color "✅ Services started" "$GREEN"
    
    # Wait for services to be healthy
    sleep 5
    
    # Check health
    "${SCRIPT_DIR}/health-check.sh"
}

# Stop services
stop_services() {
    print_color "Stopping RepoVista services..." "$YELLOW"
    cd "${CONFIG_DIR}"
    docker-compose down
    print_color "✅ Services stopped" "$GREEN"
}

# Restart services
restart_services() {
    stop_services
    sleep 2
    start_services
}

# Show logs
show_logs() {
    cd "${CONFIG_DIR}"
    if [ -z "$1" ]; then
        docker-compose logs -f
    else
        docker-compose logs -f "$1"
    fi
}

# Show status
show_status() {
    cd "${CONFIG_DIR}"
    docker-compose ps
}

# Backup configuration
backup_config() {
    BACKUP_FILE="config-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    print_color "Creating backup: ${BACKUP_FILE}" "$YELLOW"
    cd "${BASE_DIR}"
    tar -czf "${BACKUP_FILE}" config/.env
    print_color "✅ Backup created: ${BASE_DIR}/${BACKUP_FILE}" "$GREEN"
}

# Main script
case "$1" in
    install)
        load_images
        print_color "✅ Installation complete!" "$GREEN"
        print_color "Next steps:" "$BLUE"
        print_color "1. Configure environment: cp ${CONFIG_DIR}/.env.example ${CONFIG_DIR}/.env" "$BLUE"
        print_color "2. Edit .env file with your registry settings" "$BLUE"
        print_color "3. Start services: $0 start" "$BLUE"
        ;;
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "$2"
        ;;
    backup)
        backup_config
        ;;
    health)
        "${SCRIPT_DIR}/health-check.sh"
        ;;
    *)
        echo "Usage: $0 {install|start|stop|restart|status|logs [service]|backup|health}"
        echo ""
        echo "Commands:"
        echo "  install   - Load Docker images from tar files"
        echo "  start     - Start all services"
        echo "  stop      - Stop all services"
        echo "  restart   - Restart all services"
        echo "  status    - Show service status"
        echo "  logs      - Show logs (optional: specify service)"
        echo "  backup    - Backup configuration"
        echo "  health    - Check service health"
        echo ""
        echo "Examples:"
        echo "  $0 install              # First time setup"
        echo "  $0 start                # Start services"
        echo "  $0 logs backend         # View backend logs"
        echo "  $0 health               # Check health status"
        exit 1
        ;;
esac
EOF
    chmod +x ${PACKAGE_DIR}/scripts/deploy.sh
    print_color "✅ Created deploy.sh" "$GREEN"
    
    # Create health check script
    cat > ${PACKAGE_DIR}/scripts/health-check.sh << 'EOF'
#!/bin/bash

# Health Check Script
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_color() {
    printf "${2}${1}${NC}\n"
}

# Load environment variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$(dirname "$SCRIPT_DIR")/config"

if [ -f "${CONFIG_DIR}/.env" ]; then
    export $(grep -v '^#' "${CONFIG_DIR}/.env" | xargs)
fi

# Default ports if not set
API_PORT=${API_PORT:-3033}
FRONTEND_PORT=${FRONTEND_PORT:-8083}

print_color "\nChecking RepoVista Health Status..." "$YELLOW"
print_color "=====================================" "$YELLOW"

# Check backend health
echo -n "Backend API (port ${API_PORT}): "
if curl -f -s http://localhost:${API_PORT}/api/health > /dev/null 2>&1; then
    print_color "✅ Healthy" "$GREEN"
    
    # Check registry connectivity
    echo -n "Registry Connection: "
    if curl -f -s http://localhost:${API_PORT}/api/repositories/config > /dev/null 2>&1; then
        print_color "✅ Connected" "$GREEN"
    else
        print_color "⚠️  Not configured or unreachable" "$YELLOW"
    fi
else
    print_color "❌ Unhealthy or not running" "$RED"
fi

# Check frontend health
echo -n "Frontend UI (port ${FRONTEND_PORT}): "
if curl -f -s http://localhost:${FRONTEND_PORT}/nginx-health > /dev/null 2>&1; then
    print_color "✅ Healthy" "$GREEN"
else
    print_color "❌ Unhealthy or not running" "$RED"
fi

# Check Docker containers
echo -e "\nDocker Container Status:"
docker ps --filter "name=repovista" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
print_color "=====================================" "$YELLOW"
print_color "Access URLs:" "$GREEN"
print_color "  Frontend: http://localhost:${FRONTEND_PORT}" "$GREEN"
print_color "  API Docs: http://localhost:${API_PORT}/api/docs" "$GREEN"
EOF
    chmod +x ${PACKAGE_DIR}/scripts/health-check.sh
    print_color "✅ Created health-check.sh" "$GREEN"
    
    # Create quick install script
    cat > ${PACKAGE_DIR}/scripts/quick-install.sh << 'EOF'
#!/bin/bash

# Quick Installation Script
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_color() {
    printf "${2}${1}${NC}\n"
}

print_color "RepoVista Quick Installation" "$GREEN"
print_color "=============================" "$GREEN"

# Load images
"${SCRIPT_DIR}/deploy.sh" install

# Check for .env file
CONFIG_DIR="$(dirname "$SCRIPT_DIR")/config"
if [ ! -f "${CONFIG_DIR}/.env" ]; then
    print_color "\nCreating .env file from template..." "$YELLOW"
    cp "${CONFIG_DIR}/.env.example" "${CONFIG_DIR}/.env"
    
    print_color "\n⚠️  IMPORTANT: Please edit the .env file with your registry settings:" "$YELLOW"
    print_color "   nano ${CONFIG_DIR}/.env" "$YELLOW"
    print_color "\nPress Enter when you've updated the .env file..." "$YELLOW"
    read
fi

# Start services
"${SCRIPT_DIR}/deploy.sh" start

print_color "\n✅ Installation complete!" "$GREEN"
EOF
    chmod +x ${PACKAGE_DIR}/scripts/quick-install.sh
    print_color "✅ Created quick-install.sh" "$GREEN"
}

# Create installation documentation
create_documentation() {
    print_header "Creating Documentation"
    
    cat > ${PACKAGE_DIR}/INSTALL.md << EOF
# RepoVista ${VERSION} - Installation Guide

## Overview

RepoVista is a **read-only web UI** for Docker Registry that provides an intuitive interface to browse and manage Docker images.

## Prerequisites

- Docker Engine 20.10+ installed and running
- Docker Compose 2.0+ (optional, for docker-compose commands)
- Access to a Docker Registry (v2 API)
- 2GB free disk space for images
- Ports 3033 and 8083 available (configurable)

## Quick Installation

For a guided installation, run:

\`\`\`bash
./scripts/quick-install.sh
\`\`\`

## Manual Installation

### Step 1: Load Docker Images

\`\`\`bash
./scripts/deploy.sh install
\`\`\`

This loads the pre-built Docker images into your local Docker daemon.

### Step 2: Configure Environment

Copy the environment template:

\`\`\`bash
cp config/.env.example config/.env
\`\`\`

Edit \`config/.env\` with your registry details:

\`\`\`bash
# Required: Your Docker Registry URL
REGISTRY_URL=https://registry.example.com

# Optional: Authentication (use read-only credentials)
REGISTRY_USERNAME=readonly_user
REGISTRY_PASSWORD=secure_password

# Optional: Change ports if needed
API_PORT=3033
FRONTEND_PORT=8083
\`\`\`

### Step 3: Start Services

\`\`\`bash
./scripts/deploy.sh start
\`\`\`

### Step 4: Verify Installation

Check service health:

\`\`\`bash
./scripts/deploy.sh health
\`\`\`

## Accessing RepoVista

- **Web UI**: http://localhost:8083
- **API**: http://localhost:3033
- **API Documentation**: http://localhost:3033/api/docs

## Service Management

### Start Services
\`\`\`bash
./scripts/deploy.sh start
\`\`\`

### Stop Services
\`\`\`bash
./scripts/deploy.sh stop
\`\`\`

### Restart Services
\`\`\`bash
./scripts/deploy.sh restart
\`\`\`

### View Logs
\`\`\`bash
# All services
./scripts/deploy.sh logs

# Specific service
./scripts/deploy.sh logs backend
./scripts/deploy.sh logs frontend
\`\`\`

### Check Status
\`\`\`bash
./scripts/deploy.sh status
\`\`\`

### Backup Configuration
\`\`\`bash
./scripts/deploy.sh backup
\`\`\`

## Troubleshooting

### Registry Connection Issues

1. Verify registry URL format (must include protocol):
   - ✅ \`https://registry.example.com\`
   - ❌ \`registry.example.com\`

2. Test registry connectivity:
   \`\`\`bash
   curl -u username:password https://registry.example.com/v2/_catalog
   \`\`\`

3. Check network connectivity from container:
   \`\`\`bash
   docker exec repovista-backend curl -v \$REGISTRY_URL/v2/
   \`\`\`

### Port Conflicts

If ports 3033 or 8083 are in use, modify in \`.env\`:

\`\`\`bash
API_PORT=3033
FRONTEND_PORT=8083
\`\`\`

### CORS Errors

Add your domain to CORS_ORIGINS in \`.env\`:

\`\`\`bash
CORS_ORIGINS=https://your-domain.com
\`\`\`

### Container Issues

Reset all containers and volumes:

\`\`\`bash
cd config
docker-compose down -v
docker-compose up -d
\`\`\`

## Security Notes

1. **Read-Only Access**: RepoVista only reads from your registry
2. **Use Dedicated Credentials**: Create a read-only user for RepoVista
3. **Network Security**: Use firewall rules to restrict access
4. **HTTPS**: For production, use a reverse proxy with SSL

## Uninstallation

To completely remove RepoVista:

\`\`\`bash
# Stop and remove containers
./scripts/deploy.sh stop
cd config && docker-compose down -v

# Remove Docker images
docker rmi repovista-backend:${VERSION}
docker rmi repovista-frontend:${VERSION}

# Remove files
cd ../.. && rm -rf repovista-${VERSION}
\`\`\`

## Support

For issues or questions:
- Check the [troubleshooting section](#troubleshooting)
- Review API documentation at http://localhost:3033/api/docs
- Verify registry compatibility (Docker Registry v2 API)

## Version Information

- **Version**: ${VERSION}
- **Build Date**: $(date +%Y-%m-%d)
- **Backend Image**: repovista-backend:${VERSION}
- **Frontend Image**: repovista-frontend:${VERSION}

---

© 2024 RepoVista - Docker Registry UI
EOF
    print_color "✅ Created INSTALL.md" "$GREEN"
    
    # Create README.txt for dist folder
    cat > ${DIST_DIR}/README.txt << EOF
RepoVista ${VERSION} - Docker Registry Web UI
============================================

This package contains a pre-built, production-ready deployment of RepoVista.

CONTENTS:
- repovista-${VERSION}.tar.gz : Main deployment package
- repovista-${VERSION}.tar.gz.sha256 : Checksum file

INSTALLATION:
1. Extract the package:
   tar -xzf repovista-${VERSION}.tar.gz

2. Navigate to extracted directory:
   cd repovista-${VERSION}

3. Run quick installation:
   ./scripts/quick-install.sh

4. Or follow manual steps in INSTALL.md

REQUIREMENTS:
- Docker 20.10+
- 2GB free disk space
- Access to a Docker Registry (v2 API)

For detailed instructions, see INSTALL.md after extraction.

Version: ${VERSION}
Build Date: $(date +%Y-%m-%d)
EOF
    print_color "✅ Created README.txt" "$GREEN"
}

# Create the distribution package
create_package() {
    print_header "Creating Distribution Package"
    
    cd ${DIST_DIR}
    
    # Create tar.gz package
    print_color "Creating package archive..." "$YELLOW"
    tar -czf ${PACKAGE_NAME}.tar.gz ${PACKAGE_NAME}/
    
    # Generate checksum
    print_color "Generating checksum..." "$YELLOW"
    sha256sum ${PACKAGE_NAME}.tar.gz > ${PACKAGE_NAME}.tar.gz.sha256
    
    # Get package size
    PACKAGE_SIZE=$(du -h ${PACKAGE_NAME}.tar.gz | cut -f1)
    
    # Clean up extracted directory (keep only tar.gz)
    rm -rf ${PACKAGE_NAME}/
    
    print_color "✅ Package created: ${PACKAGE_NAME}.tar.gz (${PACKAGE_SIZE})" "$GREEN"
    
    # Show checksum
    print_color "Checksum:" "$YELLOW"
    cat ${PACKAGE_NAME}.tar.gz.sha256
}

# Display summary
display_summary() {
    print_header "Build Summary"
    
    print_color "✅ Build completed successfully!" "$GREEN"
    echo ""
    print_color "Package Details:" "$BLUE"
    print_color "  Version: ${VERSION}" "$BLUE"
    print_color "  Location: ${DIST_DIR}/" "$BLUE"
    print_color "  Package: ${PACKAGE_NAME}.tar.gz" "$BLUE"
    
    if [ -f "${DIST_DIR}/${PACKAGE_NAME}.tar.gz" ]; then
        FINAL_SIZE=$(du -h ${DIST_DIR}/${PACKAGE_NAME}.tar.gz | cut -f1)
        print_color "  Size: ${FINAL_SIZE}" "$BLUE"
    fi
    
    echo ""
    print_color "Deployment Steps:" "$YELLOW"
    print_color "  1. Copy ${PACKAGE_NAME}.tar.gz to target server" "$YELLOW"
    print_color "  2. Extract: tar -xzf ${PACKAGE_NAME}.tar.gz" "$YELLOW"
    print_color "  3. Run: cd ${PACKAGE_NAME} && ./scripts/quick-install.sh" "$YELLOW"
    
    echo ""
    print_color "Docker Images Built:" "$GREEN"
    print_color "  - repovista-backend:${VERSION}" "$GREEN"
    print_color "  - repovista-frontend:${VERSION}" "$GREEN"
}

# Main execution
main() {
    print_header "RepoVista Distribution Builder"
    print_color "Version: ${VERSION}" "$BLUE"
    print_color "Timestamp: ${TIMESTAMP}" "$BLUE"
    
    check_prerequisites
    prepare_directories
    build_docker_images
    save_docker_images
    create_config_files
    create_scripts
    create_documentation
    create_package
    display_summary
}

# Run main function
main

# Exit successfully
exit 0