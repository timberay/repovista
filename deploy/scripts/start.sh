#!/bin/bash

# RepoVista Start Script

set -e

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Starting RepoVista services...${NC}"

cd "$DEPLOY_DIR"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Configuration file not found. Please run install.sh first.${NC}"
    exit 1
fi

# Start services
if docker compose version &> /dev/null; then
    docker compose up -d
else
    docker-compose up -d
fi

echo -e "${GREEN}Services started successfully!${NC}"
echo ""
echo "To check status, run: ./scripts/status.sh"
echo "To view logs, run: ./scripts/logs.sh"