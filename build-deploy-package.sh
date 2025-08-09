#!/bin/bash

# RepoVista Deployment Package Builder
# This script creates a complete deployment package for offline installation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to print colored output
print_color() {
    printf "${2}${1}${NC}\n"
}

# Version and package info
VERSION=${1:-v1.0.0}
PACKAGE_NAME="repovista-deploy-${VERSION}.tar.gz"

print_color "==========================================" "$BLUE"
print_color "   RepoVista Deployment Package Builder   " "$BLUE"
print_color "==========================================" "$BLUE"
echo ""
print_color "Version: $VERSION" "$YELLOW"
print_color "Package: $PACKAGE_NAME" "$YELLOW"
echo ""

# Check if deploy directory exists
if [ ! -d "deploy" ]; then
    print_color "❌ Deploy directory not found! Please run this script from the project root." "$RED"
    exit 1
fi

# Step 1: Check if Docker images exist, if not build them
print_color "📦 Step 1: Checking Docker images..." "$YELLOW"

if [ ! -f "deploy/images/repovista-backend.tar" ] || [ ! -f "deploy/images/repovista-frontend.tar" ]; then
    print_color "   Building Docker images..." "$YELLOW"
    docker-compose build
    
    print_color "   Saving Docker images..." "$YELLOW"
    docker save repovista-backend:latest -o deploy/images/repovista-backend.tar
    docker save repovista-frontend:latest -o deploy/images/repovista-frontend.tar
    print_color "   ✅ Images saved" "$GREEN"
else
    print_color "   ✅ Images already exist" "$GREEN"
fi

# Step 2: Make scripts executable
print_color "" "$NC"
print_color "🔧 Step 2: Setting script permissions..." "$YELLOW"
chmod +x deploy/scripts/*.sh
print_color "   ✅ Scripts are executable" "$GREEN"

# Step 3: Check image sizes
print_color "" "$NC"
print_color "📊 Step 3: Checking package size..." "$YELLOW"
backend_size=$(du -h deploy/images/repovista-backend.tar | cut -f1)
frontend_size=$(du -h deploy/images/repovista-frontend.tar | cut -f1)
print_color "   Backend image:  $backend_size" "$NC"
print_color "   Frontend image: $frontend_size" "$NC"

# Step 4: Create the package
print_color "" "$NC"
print_color "📦 Step 4: Creating deployment package..." "$YELLOW"

# Remove old package if exists
rm -f "$PACKAGE_NAME"

# Create tar.gz package
tar -czf "$PACKAGE_NAME" \
    --transform 's,^deploy,repovista,' \
    deploy/

print_color "   ✅ Package created" "$GREEN"

# Step 5: Verify package
print_color "" "$NC"
print_color "✔️  Step 5: Verifying package..." "$YELLOW"
package_size=$(du -h "$PACKAGE_NAME" | cut -f1)
print_color "   Package size: $package_size" "$NC"

# List contents (first 10 files)
print_color "   Package contents:" "$NC"
tar -tzf "$PACKAGE_NAME" | head -10 | sed 's/^/      /'
echo "      ..."

# Step 6: Create checksum
print_color "" "$NC"
print_color "🔐 Step 6: Creating checksum..." "$YELLOW"
sha256sum "$PACKAGE_NAME" > "${PACKAGE_NAME}.sha256"
print_color "   ✅ Checksum created" "$GREEN"

# Success message
print_color "" "$NC"
print_color "==========================================" "$GREEN"
print_color "   🎉 Package Build Complete!            " "$GREEN"
print_color "==========================================" "$GREEN"
echo ""
print_color "📦 Package: $PACKAGE_NAME ($package_size)" "$BLUE"
print_color "🔐 Checksum: ${PACKAGE_NAME}.sha256" "$BLUE"
echo ""
print_color "📋 Installation Instructions:" "$YELLOW"
print_color "   1. Copy $PACKAGE_NAME to target server" "$NC"
print_color "   2. Extract: tar -xzf $PACKAGE_NAME" "$NC"
print_color "   3. Go to directory: cd repovista" "$NC"
print_color "   4. Run installer: ./scripts/install.sh" "$NC"
echo ""
print_color "📝 Package includes:" "$YELLOW"
print_color "   • Pre-built Docker images (offline installation)" "$NC"
print_color "   • Installation and management scripts" "$NC"
print_color "   • Configuration templates" "$NC"
print_color "   • Complete documentation" "$NC"
echo ""