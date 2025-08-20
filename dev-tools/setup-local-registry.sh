#!/bin/bash

# ============================================================================
# DEVELOPMENT/TESTING ONLY
# This script is for local development and testing purposes only.
# In production, RepoVista connects to an existing Docker Registry.
# ============================================================================

# Setup script for local Docker registry with test images
set -e

echo "=== Setting up Local Docker Registry ==="

# Configuration
REGISTRY_PORT=5000
REGISTRY_NAME="local-registry"
REGISTRY_URL="localhost:${REGISTRY_PORT}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_info() {
    echo -e "${YELLOW}[ℹ]${NC} $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    print_error "Docker daemon is not running. Please start Docker."
    exit 1
fi

# Stop and remove existing registry if it exists
print_info "Checking for existing registry container..."
if docker ps -a | grep -q ${REGISTRY_NAME}; then
    print_info "Removing existing registry container..."
    docker stop ${REGISTRY_NAME} 2>/dev/null || true
    docker rm ${REGISTRY_NAME} 2>/dev/null || true
    print_status "Existing registry removed"
fi

# Start local Docker registry
print_info "Starting Docker registry on port ${REGISTRY_PORT}..."
docker run -d \
    --restart=always \
    --name ${REGISTRY_NAME} \
    -p ${REGISTRY_PORT}:5000 \
    -v registry-data:/var/lib/registry \
    registry:2

# Wait for registry to be ready
print_info "Waiting for registry to be ready..."
max_attempts=30
attempt=0
while ! curl -s http://${REGISTRY_URL}/v2/_catalog > /dev/null 2>&1; do
    if [ $attempt -eq $max_attempts ]; then
        print_error "Registry failed to start after ${max_attempts} seconds"
        exit 1
    fi
    sleep 1
    attempt=$((attempt + 1))
done
print_status "Registry is ready at http://${REGISTRY_URL}"

# Test registry
print_info "Testing registry API..."
response=$(curl -s http://${REGISTRY_URL}/v2/_catalog)
if echo "$response" | grep -q "repositories"; then
    print_status "Registry API is working"
else
    print_error "Registry API test failed"
    exit 1
fi

echo ""
echo "=== Pulling and Pushing Test Images ==="

# List of popular images to pull and push to local registry
declare -a images=(
    "nginx:latest"
    "nginx:1.25"
    "postgres:16"
    "postgres:15"
    "redis:7-alpine"
    "redis:6-alpine"
    "node:20-alpine"
    "node:18-alpine"
    "python:3.12-slim"
    "python:3.11-slim"
    "ubuntu:22.04"
    "ubuntu:20.04"
    "alpine:latest"
    "busybox:latest"
)

# Function to pull, tag and push image
push_to_local_registry() {
    local image=$1
    local image_name=$(echo $image | cut -d: -f1)
    local image_tag=$(echo $image | cut -d: -f2)
    local local_image="${REGISTRY_URL}/${image_name}:${image_tag}"
    
    print_info "Processing ${image}..."
    
    # Pull from Docker Hub
    if docker pull ${image} > /dev/null 2>&1; then
        print_status "Pulled ${image}"
    else
        print_error "Failed to pull ${image}"
        return 1
    fi
    
    # Tag for local registry
    docker tag ${image} ${local_image}
    print_status "Tagged as ${local_image}"
    
    # Push to local registry
    if docker push ${local_image} > /dev/null 2>&1; then
        print_status "Pushed to local registry"
    else
        print_error "Failed to push ${local_image}"
        return 1
    fi
    
    # Clean up local image to save space (optional)
    # docker rmi ${image} ${local_image} > /dev/null 2>&1
    
    return 0
}

# Push all images to local registry
success_count=0
failed_count=0
for image in "${images[@]}"; do
    if push_to_local_registry "$image"; then
        success_count=$((success_count + 1))
    else
        failed_count=$((failed_count + 1))
    fi
    echo ""
done

echo "=== Summary ==="
print_status "Successfully pushed ${success_count} images to local registry"
if [ $failed_count -gt 0 ]; then
    print_info "${failed_count} images failed to push"
fi

# List all repositories in the registry
echo ""
echo "=== Repositories in Local Registry ==="
print_info "Fetching repository list..."
repos=$(curl -s http://${REGISTRY_URL}/v2/_catalog | python3 -m json.tool 2>/dev/null || echo "{}")
echo "$repos"

# Show example commands
echo ""
echo "=== Example Commands ==="
echo "List repositories:"
echo "  curl http://${REGISTRY_URL}/v2/_catalog"
echo ""
echo "List tags for a repository:"
echo "  curl http://${REGISTRY_URL}/v2/nginx/tags/list"
echo ""
echo "Pull from local registry:"
echo "  docker pull ${REGISTRY_URL}/nginx:latest"
echo ""
echo "Registry URL for RepoVista configuration:"
echo "  http://${REGISTRY_URL}"

# Create .env file for RepoVista
echo ""
echo "=== Creating .env Configuration ==="
cat > .env.local-registry << EOF
# Local Docker Registry Configuration
REGISTRY_URL=http://${REGISTRY_URL}
REGISTRY_USERNAME=
REGISTRY_PASSWORD=
API_PORT=8000
FRONTEND_PORT=80
CORS_ORIGINS=http://localhost:8083,http://localhost:3033,http://localhost
EOF

print_status "Created .env.local-registry file"
echo ""
print_info "To use the local registry with RepoVista:"
echo "  cp .env.local-registry .env"
echo "  docker-compose up -d"
echo ""
print_info "Access RepoVista at:"
echo "  Frontend: http://localhost:8083"
echo "  Backend API: http://localhost:3033"
echo ""
print_status "Local registry setup complete!"