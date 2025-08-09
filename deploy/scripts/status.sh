#!/bin/bash

# RepoVista Status Check Script

set -e

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}     RepoVista Service Status          ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

cd "$DEPLOY_DIR"

# Load environment variables
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check Docker containers
echo -e "${YELLOW}📦 Container Status:${NC}"
if docker compose version &> /dev/null; then
    docker compose ps
else
    docker-compose ps
fi

echo ""
echo -e "${YELLOW}🔍 Health Check:${NC}"

# Check backend health
if curl -f http://localhost:${API_PORT:-8000}/api/health &> /dev/null 2>&1; then
    echo -e "   Backend:  ${GREEN}✅ Healthy${NC}"
else
    echo -e "   Backend:  ${RED}❌ Not responding${NC}"
fi

# Check frontend health
if curl -f http://localhost:${FRONTEND_PORT:-80}/nginx-health &> /dev/null 2>&1; then
    echo -e "   Frontend: ${GREEN}✅ Healthy${NC}"
else
    echo -e "   Frontend: ${RED}❌ Not responding${NC}"
fi

echo ""
echo -e "${YELLOW}🌐 Access URLs:${NC}"
server_ip=$(hostname -I | awk '{print $1}')
echo -e "   Web UI:   http://$server_ip:${FRONTEND_PORT:-80}"
echo -e "   API:      http://$server_ip:${API_PORT:-8000}"
echo -e "   API Docs: http://$server_ip:${API_PORT:-8000}/api/docs"
echo ""