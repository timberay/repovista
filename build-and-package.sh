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
    
    # Copy install script
    if [ -f "deploy/install.sh" ]; then
        cp deploy/install.sh $DEPLOY_DIR/
    fi
    
    # Copy environment template
    if [ -f "deploy/.env.template" ]; then
        cp deploy/.env.template $DEPLOY_DIR/
    fi
    
    # Copy README
    if [ -f "deploy/README.md" ]; then
        cp deploy/README.md $DEPLOY_DIR/
    fi
    
    # Update install script to load images first
    if [ -f "$DEPLOY_DIR/install.sh" ]; then
        # Add image loading step to install script
        sed -i '/# Build and start services/i\
# Load Docker images\
print_color "Loading Docker images..." "$YELLOW"\
./load-images.sh\
' $DEPLOY_DIR/install.sh
        
        # Remove build step from install script
        sed -i '/docker-compose build/d' $DEPLOY_DIR/install.sh
    fi
    
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