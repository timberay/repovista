#!/bin/bash

# RepoVista Stop Script

set -e

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Stopping RepoVista services...${NC}"

cd "$DEPLOY_DIR"

# Stop services
if docker compose version &> /dev/null; then
    docker compose down
else
    docker-compose down
fi

echo -e "${GREEN}Services stopped successfully!${NC}"