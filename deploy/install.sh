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
