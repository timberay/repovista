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
