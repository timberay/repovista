#!/bin/bash

# RepoVista Installation Script
# This script installs RepoVista on an intranet server

set -e

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
    print_color "==========================================" "$BLUE"
    print_color "     RepoVista Installation Script        " "$BLUE"
    print_color "==========================================" "$BLUE"
    echo ""
}

# Function to check prerequisites
check_prerequisites() {
    print_color "⏳ Checking prerequisites..." "$YELLOW"
    
    local errors=0
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_color "❌ Docker is not installed!" "$RED"
        print_color "   Please install Docker first: https://docs.docker.com/get-docker/" "$RED"
        errors=$((errors + 1))
    else
        print_color "✅ Docker found: $(docker --version)" "$GREEN"
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_color "❌ Docker Compose is not installed!" "$RED"
        print_color "   Please install Docker Compose first" "$RED"
        errors=$((errors + 1))
    else
        if command -v docker-compose &> /dev/null; then
            print_color "✅ Docker Compose found: $(docker-compose --version)" "$GREEN"
        else
            print_color "✅ Docker Compose found: $(docker compose version)" "$GREEN"
        fi
    fi
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        print_color "❌ Docker daemon is not running!" "$RED"
        print_color "   Please start Docker service" "$RED"
        errors=$((errors + 1))
    else
        print_color "✅ Docker daemon is running" "$GREEN"
    fi
    
    if [ $errors -gt 0 ]; then
        print_color "" "$NC"
        print_color "❌ Prerequisites check failed. Please fix the issues above and try again." "$RED"
        exit 1
    fi
    
    print_color "" "$NC"
    print_color "✅ All prerequisites are met!" "$GREEN"
    echo ""
}

# Function to load Docker images
load_images() {
    print_color "⏳ Loading Docker images..." "$YELLOW"
    
    # Get the script directory
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
    
    # Load backend image
    if [ -f "$DEPLOY_DIR/images/repovista-backend.tar" ]; then
        print_color "   Loading backend image..." "$YELLOW"
        docker load -i "$DEPLOY_DIR/images/repovista-backend.tar"
        print_color "   ✅ Backend image loaded" "$GREEN"
    else
        print_color "   ❌ Backend image not found!" "$RED"
        exit 1
    fi
    
    # Load frontend image
    if [ -f "$DEPLOY_DIR/images/repovista-frontend.tar" ]; then
        print_color "   Loading frontend image..." "$YELLOW"
        docker load -i "$DEPLOY_DIR/images/repovista-frontend.tar"
        print_color "   ✅ Frontend image loaded" "$GREEN"
    else
        print_color "   ❌ Frontend image not found!" "$RED"
        exit 1
    fi
    
    print_color "" "$NC"
    print_color "✅ All images loaded successfully!" "$GREEN"
    echo ""
}

# Function to setup configuration
setup_configuration() {
    print_color "⏳ Setting up configuration..." "$YELLOW"
    
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
    
    # Check if .env already exists
    if [ -f "$DEPLOY_DIR/.env" ]; then
        print_color "   ⚠️  Configuration file already exists" "$YELLOW"
        read -p "   Do you want to overwrite it? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_color "   Keeping existing configuration" "$YELLOW"
            return
        fi
    fi
    
    # Copy template
    cp "$DEPLOY_DIR/config/.env.template" "$DEPLOY_DIR/.env"
    
    # Ask for Docker Registry URL
    print_color "" "$NC"
    print_color "📝 Please provide configuration values:" "$BLUE"
    read -p "   Docker Registry URL [http://localhost:5000]: " registry_url
    registry_url=${registry_url:-http://localhost:5000}
    
    read -p "   Registry Username (leave empty if not required): " registry_username
    read -sp "   Registry Password (leave empty if not required): " registry_password
    echo
    
    read -p "   Frontend Port [80]: " frontend_port
    frontend_port=${frontend_port:-80}
    
    read -p "   Backend API Port [8000]: " api_port
    api_port=${api_port:-8000}
    
    # Update .env file
    sed -i "s|REGISTRY_URL=.*|REGISTRY_URL=$registry_url|" "$DEPLOY_DIR/.env"
    sed -i "s|REGISTRY_USERNAME=.*|REGISTRY_USERNAME=$registry_username|" "$DEPLOY_DIR/.env"
    sed -i "s|REGISTRY_PASSWORD=.*|REGISTRY_PASSWORD=$registry_password|" "$DEPLOY_DIR/.env"
    sed -i "s|FRONTEND_PORT=.*|FRONTEND_PORT=$frontend_port|" "$DEPLOY_DIR/.env"
    sed -i "s|API_PORT=.*|API_PORT=$api_port|" "$DEPLOY_DIR/.env"
    
    # Set CORS origins based on server IP
    server_ip=$(hostname -I | awk '{print $1}')
    cors_origins="http://localhost,http://$server_ip"
    sed -i "s|CORS_ORIGINS=.*|CORS_ORIGINS=$cors_origins|" "$DEPLOY_DIR/.env"
    
    print_color "" "$NC"
    print_color "✅ Configuration completed!" "$GREEN"
    echo ""
}

# Function to start services
start_services() {
    print_color "⏳ Starting RepoVista services..." "$YELLOW"
    
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
    
    cd "$DEPLOY_DIR"
    
    # Use docker compose or docker-compose based on availability
    if docker compose version &> /dev/null; then
        docker compose up -d
    else
        docker-compose up -d
    fi
    
    print_color "" "$NC"
    print_color "⏳ Waiting for services to be ready..." "$YELLOW"
    sleep 10
    
    # Check service health
    print_color "" "$NC"
    print_color "🔍 Checking service health..." "$YELLOW"
    
    # Check backend
    if curl -f http://localhost:${api_port:-8000}/api/health &> /dev/null; then
        print_color "   ✅ Backend is healthy" "$GREEN"
    else
        print_color "   ⚠️  Backend is not responding yet (may need more time)" "$YELLOW"
    fi
    
    # Check frontend
    if curl -f http://localhost:${frontend_port:-80}/nginx-health &> /dev/null; then
        print_color "   ✅ Frontend is healthy" "$GREEN"
    else
        print_color "   ⚠️  Frontend is not responding yet (may need more time)" "$YELLOW"
    fi
    
    print_color "" "$NC"
    print_color "✅ Services started!" "$GREEN"
    echo ""
}

# Function to show completion message
show_completion() {
    server_ip=$(hostname -I | awk '{print $1}')
    frontend_port=${frontend_port:-80}
    api_port=${api_port:-8000}
    
    print_color "==========================================" "$GREEN"
    print_color "    🎉 RepoVista Installation Complete!   " "$GREEN"
    print_color "==========================================" "$GREEN"
    echo ""
    print_color "📌 Access URLs:" "$BLUE"
    print_color "   Web UI:  http://$server_ip:$frontend_port" "$NC"
    print_color "   API:     http://$server_ip:$api_port" "$NC"
    print_color "   API Docs: http://$server_ip:$api_port/api/docs" "$NC"
    echo ""
    print_color "📝 Management Commands:" "$BLUE"
    print_color "   Start:   ./scripts/start.sh" "$NC"
    print_color "   Stop:    ./scripts/stop.sh" "$NC"
    print_color "   Status:  ./scripts/status.sh" "$NC"
    print_color "   Logs:    ./scripts/logs.sh" "$NC"
    echo ""
    print_color "⚠️  Note: If services are not ready yet, wait a few moments and check status" "$YELLOW"
    echo ""
}

# Main installation flow
main() {
    print_header
    check_prerequisites
    load_images
    setup_configuration
    start_services
    show_completion
}

# Run main function
main "$@"