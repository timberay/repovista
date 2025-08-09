#!/bin/bash

# RepoVista Logs Viewer Script

set -e

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
YELLOW='\033[1;33m'
NC='\033[0m'

cd "$DEPLOY_DIR"

# Parse arguments
SERVICE=$1
FOLLOW_FLAG=""

if [ "$1" == "-f" ] || [ "$2" == "-f" ]; then
    FOLLOW_FLAG="-f"
fi

if [ "$1" == "-f" ]; then
    SERVICE=$2
fi

# Show logs
if [ -z "$SERVICE" ]; then
    echo -e "${YELLOW}Showing logs for all services...${NC}"
    echo "Tip: Use './logs.sh backend' or './logs.sh frontend' for specific service"
    echo "     Add '-f' to follow logs in real-time"
    echo ""
    
    if docker compose version &> /dev/null; then
        docker compose logs $FOLLOW_FLAG --tail=100
    else
        docker-compose logs $FOLLOW_FLAG --tail=100
    fi
else
    echo -e "${YELLOW}Showing logs for $SERVICE...${NC}"
    
    if docker compose version &> /dev/null; then
        docker compose logs $FOLLOW_FLAG --tail=100 $SERVICE
    else
        docker-compose logs $FOLLOW_FLAG --tail=100 $SERVICE
    fi
fi