#!/bin/bash

# RepoVista Docker Deployment Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_color() {
    printf "${2}${1}${NC}\n"
}

# Function to check prerequisites
check_prerequisites() {
    print_color "Checking prerequisites..." "$YELLOW"
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_color "Docker is not installed!" "$RED"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        print_color "Docker Compose is not installed!" "$RED"
        exit 1
    fi
    
    # Check .env file
    if [ ! -f .env ]; then
        print_color ".env file not found! Creating from example..." "$YELLOW"
        cp .env.example .env
        print_color "Please configure .env file before deployment!" "$RED"
        exit 1
    fi
    
    print_color "Prerequisites check passed!" "$GREEN"
}

# Function to build images
build_images() {
    print_color "Building Docker images..." "$YELLOW"
    docker-compose build --no-cache
    print_color "Images built successfully!" "$GREEN"
}

# Function to start services
start_services() {
    print_color "Starting services..." "$YELLOW"
    
    if [ "$1" = "prod" ]; then
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
    else
        docker-compose up -d
    fi
    
    print_color "Services started!" "$GREEN"
}

# Function to stop services
stop_services() {
    print_color "Stopping services..." "$YELLOW"
    docker-compose down
    print_color "Services stopped!" "$GREEN"
}

# Function to view logs
view_logs() {
    docker-compose logs -f "$1"
}

# Function to check health
check_health() {
    print_color "Checking service health..." "$YELLOW"
    
    # Check backend health
    if curl -f http://localhost:8000/api/health &> /dev/null; then
        print_color "Backend: Healthy" "$GREEN"
    else
        print_color "Backend: Unhealthy" "$RED"
    fi
    
    # Check frontend health
    if curl -f http://localhost/nginx-health &> /dev/null; then
        print_color "Frontend: Healthy" "$GREEN"
    else
        print_color "Frontend: Unhealthy" "$RED"
    fi
}

# Function to clean up
cleanup() {
    print_color "Cleaning up Docker resources..." "$YELLOW"
    docker-compose down -v
    docker system prune -f
    print_color "Cleanup completed!" "$GREEN"
}

# Main script
case "$1" in
    build)
        check_prerequisites
        build_images
        ;;
    start)
        check_prerequisites
        start_services "$2"
        sleep 5
        check_health
        ;;
    stop)
        stop_services
        ;;
    restart)
        stop_services
        start_services "$2"
        sleep 5
        check_health
        ;;
    logs)
        view_logs "$2"
        ;;
    health)
        check_health
        ;;
    clean)
        cleanup
        ;;
    *)
        echo "Usage: $0 {build|start [prod]|stop|restart [prod]|logs [service]|health|clean}"
        echo ""
        echo "Commands:"
        echo "  build          - Build Docker images"
        echo "  start [prod]   - Start services (use 'prod' for production mode)"
        echo "  stop           - Stop services"
        echo "  restart [prod] - Restart services"
        echo "  logs [service] - View logs (optionally specify service: backend/frontend)"
        echo "  health         - Check service health"
        echo "  clean          - Clean up Docker resources"
        exit 1
        ;;
esac