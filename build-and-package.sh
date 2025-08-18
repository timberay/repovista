#!/bin/bash

# RepoVista Build and Package Script
# This script builds Docker images and creates a deployment package

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PACKAGE_NAME="repovista-deploy"
VERSION=$(date +%Y%m%d-%H%M%S)
OUTPUT_DIR="dist"
DEPLOY_DIR="deploy"
IMAGE_PREFIX="repovista"

# Function to print colored output
print_color() {
    printf "${2}${1}${NC}\n"
}

# Function to print header
print_header() {
    echo ""
    print_color "============================================" "$BLUE"
    print_color "    RepoVista Build and Package Creator" "$BLUE"
    print_color "============================================" "$BLUE"
    echo ""
}

# Function to build Docker images
build_docker_images() {
    print_color "Building Docker images..." "$YELLOW"
    
    # Build backend image
    print_color "Building backend image..." "$YELLOW"
    docker build -f Dockerfile.backend -t ${IMAGE_PREFIX}-backend:${VERSION} -t ${IMAGE_PREFIX}-backend:latest .
    
    # Build frontend image
    print_color "Building frontend image..." "$YELLOW"
    docker build -f Dockerfile.frontend -t ${IMAGE_PREFIX}-frontend:${VERSION} -t ${IMAGE_PREFIX}-frontend:latest .
    
    print_color "Docker images built successfully!" "$GREEN"
}

# Function to save Docker images
save_docker_images() {
    print_color "Saving Docker images to files..." "$YELLOW"
    
    # Create images directory in deploy folder
    mkdir -p $DEPLOY_DIR/images
    
    # Save backend image
    print_color "Saving backend image..." "$YELLOW"
    docker save ${IMAGE_PREFIX}-backend:latest | gzip > $DEPLOY_DIR/images/backend.tar.gz
    
    # Save frontend image
    print_color "Saving frontend image..." "$YELLOW"
    docker save ${IMAGE_PREFIX}-frontend:latest | gzip > $DEPLOY_DIR/images/frontend.tar.gz
    
    print_color "Docker images saved successfully!" "$GREEN"
    
    # Show image sizes
    local backend_size=$(du -h $DEPLOY_DIR/images/backend.tar.gz | cut -f1)
    local frontend_size=$(du -h $DEPLOY_DIR/images/frontend.tar.gz | cut -f1)
    print_color "Backend image size: $backend_size" "$BLUE"
    print_color "Frontend image size: $frontend_size" "$BLUE"
}

# Function to prepare deployment package
prepare_deployment() {
    print_color "Preparing deployment package..." "$YELLOW"
    
    # Clean and create deploy directory
    rm -rf $DEPLOY_DIR
    mkdir -p $DEPLOY_DIR/{images,scripts,config}
    
    # Copy deployment files only (no source code)
    print_color "Copying deployment files..." "$YELLOW"
    
    # Create docker-compose.yml for deployment (using pre-built images)
    cat > $DEPLOY_DIR/docker-compose.yml << 'EOF'
version: '3.8'

services:
  backend:
    image: repovista-backend:latest
    container_name: repovista-backend
    ports:
      - "${API_PORT:-3032}:8000"
    environment:
      - REGISTRY_URL=${REGISTRY_URL}
      - REGISTRY_USERNAME=${REGISTRY_USERNAME}
      - REGISTRY_PASSWORD=${REGISTRY_PASSWORD}
      - API_PREFIX=${API_PREFIX:-/api}
      - CORS_ORIGINS=${CORS_ORIGINS:-["http://localhost:8082"]}
      - LOG_LEVEL=${LOG_LEVEL:-INFO}
    restart: unless-stopped
    networks:
      - repovista-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    image: repovista-frontend:latest
    container_name: repovista-frontend
    ports:
      - "${FRONTEND_PORT:-8082}:80"
    depends_on:
      - backend
    environment:
      - API_URL=http://backend:8000
    restart: unless-stopped
    networks:
      - repovista-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80/nginx-health"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  repovista-network:
    driver: bridge
EOF
    
    # Create load script
    cat > $DEPLOY_DIR/load-images.sh << 'EOF'
#!/bin/bash

# Load Docker images from files

set -e

echo "Loading Docker images..."

# Load backend image
echo "Loading backend image..."
docker load < images/backend.tar.gz

# Load frontend image
echo "Loading frontend image..."
docker load < images/frontend.tar.gz

echo "Docker images loaded successfully!"

# List loaded images
docker images | grep repovista
EOF
    
    chmod +x $DEPLOY_DIR/load-images.sh
    
    # Create environment template
    cat > $DEPLOY_DIR/.env.template << 'EOF'
# RepoVista Environment Configuration
# Copy this file to .env and configure for your environment

# Docker Registry Configuration
REGISTRY_URL=https://registry.example.com
REGISTRY_USERNAME=
REGISTRY_PASSWORD=

# Service Ports
API_PORT=3032
FRONTEND_PORT=8082

# API Configuration  
API_PREFIX=/api
CORS_ORIGINS=["http://localhost:8082"]

# Logging
LOG_LEVEL=INFO
EOF
    
    # Create install script
    cat > $DEPLOY_DIR/install.sh << 'EOF'
#!/bin/bash

# RepoVista Installation Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_color() {
    printf "${2}${1}${NC}\n"
}

print_header() {
    echo ""
    print_color "============================================" "$BLUE"
    print_color "    RepoVista Docker Registry UI Installer" "$BLUE"
    print_color "============================================" "$BLUE"
    echo ""
}

check_prerequisites() {
    print_color "Checking prerequisites..." "$YELLOW"
    
    local prereq_ok=true
    
    # Check Docker
    if command -v docker &> /dev/null; then
        docker_version=$(docker --version | cut -d' ' -f3 | cut -d',' -f1)
        print_color "✓ Docker $docker_version found" "$GREEN"
    else
        print_color "✗ Docker is not installed" "$RED"
        prereq_ok=false
    fi
    
    # Check Docker Compose
    if command -v docker-compose &> /dev/null; then
        compose_version=$(docker-compose --version | cut -d' ' -f3 | cut -d',' -f1)
        print_color "✓ Docker Compose $compose_version found" "$GREEN"
    else
        print_color "✗ Docker Compose is not installed" "$RED"
        prereq_ok=false
    fi
    
    if [ "$prereq_ok" = false ]; then
        echo ""
        print_color "Please install missing prerequisites before continuing." "$RED"
        exit 1
    fi
    
    echo ""
    print_color "All prerequisites satisfied!" "$GREEN"
}

configure_environment() {
    print_color "Configuring environment..." "$YELLOW"
    
    if [ -f .env ]; then
        print_color "Existing .env file found. Would you like to:" "$YELLOW"
        echo "  1) Keep existing configuration"
        echo "  2) Reconfigure"
        echo -n "Choice [1]: "
        read choice
        
        if [ "$choice" != "2" ]; then
            print_color "Keeping existing configuration." "$GREEN"
            return
        fi
        
        cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
        print_color "Existing .env backed up" "$YELLOW"
    fi
    
    if [ ! -f .env ]; then
        cp .env.template .env
    fi
    
    echo ""
    print_color "Please provide configuration details:" "$YELLOW"
    echo ""
    
    echo -n "Docker Registry URL [https://registry.example.com]: "
    read registry_url
    registry_url=${registry_url:-https://registry.example.com}
    
    echo -n "Registry Username (leave empty for anonymous access): "
    read registry_username
    
    if [ ! -z "$registry_username" ]; then
        echo -n "Registry Password: "
        read -s registry_password
        echo ""
    fi
    
    echo -n "Backend API Port [3032]: "
    read api_port
    api_port=${api_port:-3032}
    
    echo -n "Frontend Port [8082]: "
    read frontend_port
    frontend_port=${frontend_port:-8082}
    
    cat > .env << EOL
# Docker Registry Configuration
REGISTRY_URL=$registry_url
REGISTRY_USERNAME=$registry_username
REGISTRY_PASSWORD=$registry_password

# Service Ports
API_PORT=$api_port
FRONTEND_PORT=$frontend_port

# API Configuration
API_PREFIX=/api
CORS_ORIGINS=["http://localhost:$frontend_port"]

# Logging
LOG_LEVEL=INFO
EOL
    
    print_color "Configuration saved to .env" "$GREEN"
}

start_services() {
    print_color "Starting services..." "$YELLOW"
    
    # Load Docker images if they exist
    if [ -f "load-images.sh" ]; then
        print_color "Loading pre-built Docker images..." "$YELLOW"
        ./load-images.sh
    fi
    
    # Start services
    docker-compose up -d
    
    print_color "Services started successfully!" "$GREEN"
}

check_health() {
    print_color "Checking service health..." "$YELLOW"
    
    sleep 5
    
    source .env
    
    local health_ok=true
    
    if curl -f -s http://localhost:${API_PORT}/api/health > /dev/null 2>&1; then
        print_color "✓ Backend API is healthy (port ${API_PORT})" "$GREEN"
    else
        print_color "✗ Backend API is not responding (port ${API_PORT})" "$RED"
        health_ok=false
    fi
    
    if curl -f -s http://localhost:${FRONTEND_PORT} > /dev/null 2>&1; then
        print_color "✓ Frontend is healthy (port ${FRONTEND_PORT})" "$GREEN"
    else
        print_color "✗ Frontend is not responding (port ${FRONTEND_PORT})" "$RED"
        health_ok=false
    fi
    
    if [ "$health_ok" = false ]; then
        echo ""
        print_color "Some services are not healthy. Check logs with:" "$YELLOW"
        print_color "  docker-compose logs" "$YELLOW"
        return 1
    fi
    
    return 0
}

show_completion() {
    source .env
    
    echo ""
    print_color "============================================" "$GREEN"
    print_color "    RepoVista Installation Complete!" "$GREEN"
    print_color "============================================" "$GREEN"
    echo ""
    print_color "Access RepoVista at:" "$YELLOW"
    print_color "  http://localhost:${FRONTEND_PORT}" "$BLUE"
    echo ""
    print_color "API Documentation at:" "$YELLOW"
    print_color "  http://localhost:${API_PORT}/docs" "$BLUE"
    echo ""
}

# Main
print_header
check_prerequisites
configure_environment
start_services

if check_health; then
    show_completion
else
    print_color "Installation completed with warnings. Please check service status." "$YELLOW"
fi
EOF
    
    chmod +x $DEPLOY_DIR/install.sh
    
    print_color "Deployment package prepared!" "$GREEN"
}

# Function to create final package
create_package() {
    print_color "Creating deployment package..." "$YELLOW"
    
    # Create output directory
    mkdir -p $OUTPUT_DIR
    
    # Create tar.gz package
    local package_file="$OUTPUT_DIR/${PACKAGE_NAME}-${VERSION}.tar.gz"
    tar -czf "$package_file" -C . $DEPLOY_DIR
    
    # Create symlink to latest
    cd $OUTPUT_DIR
    ln -sf $(basename "$package_file") ${PACKAGE_NAME}-latest.tar.gz
    cd - > /dev/null
    
    # Create checksum
    sha256sum "$package_file" > "${package_file}.sha256"
    
    # Show package info
    local size=$(du -h "$package_file" | cut -f1)
    print_color "Package created: $package_file" "$GREEN"
    print_color "Package size: $size" "$BLUE"
}

# Function to show completion
show_completion() {
    echo ""
    print_color "============================================" "$GREEN"
    print_color "    Build and Package Complete!" "$GREEN"
    print_color "============================================" "$GREEN"
    echo ""
    print_color "Package created: $OUTPUT_DIR/${PACKAGE_NAME}-latest.tar.gz" "$YELLOW"
    echo ""
    print_color "Deployment steps on target server:" "$YELLOW"
    print_color "1. Copy package to server:" "$NC"
    print_color "   scp $OUTPUT_DIR/${PACKAGE_NAME}-latest.tar.gz user@server:/path/" "$NC"
    echo ""
    print_color "2. Extract package:" "$NC"
    print_color "   tar -xzf ${PACKAGE_NAME}-latest.tar.gz" "$NC"
    echo ""
    print_color "3. Install and run:" "$NC"
    print_color "   cd deploy" "$NC"
    print_color "   ./install.sh" "$NC"
    echo ""
    print_color "The package includes:" "$BLUE"
    print_color "  - Pre-built Docker images (no source code)" "$NC"
    print_color "  - Docker Compose configuration" "$NC"
    print_color "  - Installation script" "$NC"
    print_color "  - Environment template" "$NC"
    echo ""
}

# Main function
main() {
    print_header
    
    # Parse arguments
    SKIP_BUILD=false
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --version)
                VERSION="$2"
                shift 2
                ;;
            *)
                print_color "Unknown option: $1" "$RED"
                echo "Usage: $0 [--skip-build] [--version VERSION]"
                exit 1
                ;;
        esac
    done
    
    # Build Docker images unless skipped
    if [ "$SKIP_BUILD" = false ]; then
        build_docker_images
    fi
    
    # Prepare deployment directory
    prepare_deployment
    
    # Save Docker images
    save_docker_images
    
    # Create final package
    create_package
    
    # Show completion message
    show_completion
}

# Run main function
main "$@"