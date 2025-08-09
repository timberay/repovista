#!/bin/bash

# RepoVista Uninstall Script

set -e

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}⚠️  RepoVista Uninstall Script${NC}"
echo ""
echo "This will:"
echo "  - Stop and remove all RepoVista containers"
echo "  - Remove Docker volumes (data will be lost)"
echo "  - Remove Docker images"
echo ""
read -p "Are you sure you want to uninstall RepoVista? (y/N): " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Uninstall cancelled.${NC}"
    exit 0
fi

cd "$DEPLOY_DIR"

echo -e "${YELLOW}Stopping services...${NC}"
if docker compose version &> /dev/null; then
    docker compose down -v
else
    docker-compose down -v
fi

echo -e "${YELLOW}Removing Docker images...${NC}"
docker rmi repovista-frontend:latest repovista-backend:latest 2>/dev/null || true

echo -e "${YELLOW}Cleaning up Docker system...${NC}"
docker system prune -f

echo ""
echo -e "${GREEN}✅ RepoVista has been uninstalled.${NC}"
echo ""
echo "Note: The deployment files are still in: $DEPLOY_DIR"
echo "You can safely delete this directory if you no longer need it."