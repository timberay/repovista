#!/bin/bash

# RepoVista Deployment Package Creator
# This script creates a deployment package with all necessary files

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PACKAGE_NAME="repovista-deploy"
VERSION=$(date +%Y%m%d-%H%M%S)
OUTPUT_DIR="dist"
DEPLOY_DIR="deploy"

# Function to print colored output
print_color() {
    printf "${2}${1}${NC}\n"
}

# Function to print header
print_header() {
    echo ""
    print_color "============================================" "$BLUE"
    print_color "    RepoVista Deployment Package Creator" "$BLUE"
    print_color "============================================" "$BLUE"
    echo ""
}

# Function to check if deploy directory exists
check_deploy_dir() {
    if [ ! -d "$DEPLOY_DIR" ]; then
        print_color "Deploy directory not found. Creating deployment structure..." "$YELLOW"
        
        # Create deploy directory structure
        mkdir -p $DEPLOY_DIR/{scripts,config}
        
        # Copy only deployment files (no source code)
        print_color "Copying deployment files..." "$YELLOW"
        
        # Copy Docker Compose file
        cp docker-compose.yml $DEPLOY_DIR/
        
        # Copy install script and environment template if they exist
        if [ -f "deploy/install.sh" ]; then
            cp deploy/install.sh $DEPLOY_DIR/
        fi
        
        if [ -f "deploy/.env.template" ]; then
            cp deploy/.env.template $DEPLOY_DIR/
        fi
        
        if [ -f "deploy/README.md" ]; then
            cp deploy/README.md $DEPLOY_DIR/
        fi
        
        print_color "Deploy directory created successfully!" "$GREEN"
    else
        print_color "Deploy directory found." "$GREEN"
    fi
}

# Function to clean previous builds
clean_previous() {
    print_color "Cleaning previous builds..." "$YELLOW"
    
    # Create output directory if not exists
    mkdir -p $OUTPUT_DIR
    
    # Remove old packages
    rm -f $OUTPUT_DIR/${PACKAGE_NAME}*.tar.gz
    rm -f $OUTPUT_DIR/${PACKAGE_NAME}*.zip
    
    print_color "Previous builds cleaned." "$GREEN"
}

# Function to prepare package
prepare_package() {
    print_color "Preparing deployment package..." "$YELLOW" >&2
    
    # Create temporary package directory
    TEMP_DIR=$(mktemp -d)
    PACKAGE_DIR="$TEMP_DIR/$PACKAGE_NAME"
    
    # Copy deploy directory to temp
    cp -r $DEPLOY_DIR $PACKAGE_DIR
    
    # Ensure scripts are executable
    chmod +x $PACKAGE_DIR/install.sh 2>/dev/null || true
    chmod +x $PACKAGE_DIR/scripts/*.sh 2>/dev/null || true
    
    # Create version file
    cat > $PACKAGE_DIR/VERSION << EOF
RepoVista Deployment Package
Version: $VERSION
Build Date: $(date)
EOF
    
    # Remove unnecessary files
    find $PACKAGE_DIR -type f -name "*.pyc" -delete
    find $PACKAGE_DIR -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    find $PACKAGE_DIR -type d -name ".git" -exec rm -rf {} + 2>/dev/null || true
    find $PACKAGE_DIR -type f -name ".DS_Store" -delete 2>/dev/null || true
    
    print_color "Package prepared successfully." "$GREEN" >&2
    
    echo $PACKAGE_DIR
}

# Function to create tar.gz package
create_targz() {
    local package_dir=$1
    local output_file="$OUTPUT_DIR/${PACKAGE_NAME}-${VERSION}.tar.gz"
    
    print_color "Creating tar.gz package..." "$YELLOW"
    
    # Ensure output directory exists
    mkdir -p $OUTPUT_DIR
    
    # Get absolute path for output file
    output_file=$(realpath "$OUTPUT_DIR")/${PACKAGE_NAME}-${VERSION}.tar.gz
    
    # Create tar.gz
    cd $(dirname $package_dir)
    tar -czf "$output_file" $(basename $package_dir)
    cd - > /dev/null
    
    # Create symlink to latest
    cd $OUTPUT_DIR
    ln -sf $(basename $output_file) ${PACKAGE_NAME}-latest.tar.gz
    cd - > /dev/null
    
    print_color "Package created: $output_file" "$GREEN"
    
    # Show package info
    local size=$(du -h $output_file | cut -f1)
    print_color "Package size: $size" "$BLUE"
}

# Function to create zip package (optional)
create_zip() {
    local package_dir=$1
    local output_file="$OUTPUT_DIR/${PACKAGE_NAME}-${VERSION}.zip"
    
    print_color "Creating zip package..." "$YELLOW"
    
    # Check if zip is available
    if ! command -v zip &> /dev/null; then
        print_color "zip command not found. Skipping zip creation." "$YELLOW"
        return
    fi
    
    # Create zip
    cd $(dirname $package_dir)
    zip -qr $output_file $(basename $package_dir)
    cd - > /dev/null
    
    # Create symlink to latest
    cd $OUTPUT_DIR
    ln -sf $(basename $output_file) ${PACKAGE_NAME}-latest.zip
    cd - > /dev/null
    
    print_color "Package created: $output_file" "$GREEN"
}

# Function to create checksum
create_checksum() {
    print_color "Creating checksums..." "$YELLOW"
    
    cd $OUTPUT_DIR
    
    # Create SHA256 checksums
    for file in ${PACKAGE_NAME}-${VERSION}.*; do
        if [ -f "$file" ]; then
            sha256sum $file > ${file}.sha256
            print_color "Checksum created: ${file}.sha256" "$GREEN"
        fi
    done
    
    cd - > /dev/null
}

# Function to show completion message
show_completion() {
    echo ""
    print_color "============================================" "$GREEN"
    print_color "    Package Creation Complete!" "$GREEN"
    print_color "============================================" "$GREEN"
    echo ""
    print_color "Packages created in: $OUTPUT_DIR/" "$YELLOW"
    echo ""
    
    # List created files
    print_color "Created files:" "$BLUE"
    ls -lh $OUTPUT_DIR/${PACKAGE_NAME}* | awk '{print "  " $NF " (" $5 ")"}'
    
    echo ""
    print_color "Deployment instructions:" "$YELLOW"
    print_color "1. Copy package to target server" "$NC"
    print_color "   scp $OUTPUT_DIR/${PACKAGE_NAME}-latest.tar.gz user@server:/path/" "$NC"
    echo ""
    print_color "2. Extract and install on target server" "$NC"
    print_color "   tar -xzf ${PACKAGE_NAME}-latest.tar.gz" "$NC"
    print_color "   cd $PACKAGE_NAME" "$NC"
    print_color "   ./install.sh" "$NC"
    echo ""
}

# Function to cleanup
cleanup() {
    if [ ! -z "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
        rm -rf $TEMP_DIR
    fi
}

# Main script
main() {
    # Set cleanup trap
    trap cleanup EXIT
    
    # Show header
    print_header
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --version)
                VERSION="$2"
                shift 2
                ;;
            --output)
                OUTPUT_DIR="$2"
                shift 2
                ;;
            --zip)
                CREATE_ZIP=true
                shift
                ;;
            *)
                print_color "Unknown option: $1" "$RED"
                echo "Usage: $0 [--version VERSION] [--output DIR] [--zip]"
                exit 1
                ;;
        esac
    done
    
    # Check and prepare deploy directory
    check_deploy_dir
    
    # Clean previous builds
    clean_previous
    
    # Prepare package
    PACKAGE_DIR=$(prepare_package)
    
    # Create packages
    create_targz $PACKAGE_DIR
    
    if [ "$CREATE_ZIP" = true ]; then
        create_zip $PACKAGE_DIR
    fi
    
    # Create checksums
    create_checksum
    
    # Show completion
    show_completion
}

# Run main function
main "$@"