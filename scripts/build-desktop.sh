#!/bin/bash

# CADCAMFUN Desktop Build Script
# Automated build script for production-ready desktop applications
# Supports Windows, macOS, and Linux with platform-specific optimizations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="CADCAMFUN"
VERSION=$(node -p "require('./package.json').version")
BUILD_DIR="dist-desktop"
ASSETS_DIR="src-tauri/icons"

# Platform detection
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    PLATFORM="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="macos"
elif [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "msys" ]]; then
    PLATFORM="windows"
else
    echo -e "${RED}❌ Unsupported platform: $OSTYPE${NC}"
    exit 1
fi

echo -e "${BLUE}🚀 Building ${APP_NAME} v${VERSION} for ${PLATFORM}${NC}"

# Function to print status
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    echo -e "${BLUE}🔍 Checking prerequisites...${NC}"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is required but not installed"
        exit 1
    fi
    
    # Check Yarn
    if ! command -v yarn &> /dev/null; then
        print_error "Yarn is required but not installed"
        exit 1
    fi
    
    # Check Rust
    if ! command -v rustc &> /dev/null; then
        print_error "Rust is required but not installed"
        exit 1
    fi
    
    # Check Tauri CLI
    if ! command -v tauri &> /dev/null; then
        print_warning "Tauri CLI not found, installing..."
        cargo install tauri-cli --version "^2.0" --locked
    fi
    
    print_status "All prerequisites satisfied"
}

# Clean previous builds
clean_build() {
    echo -e "${BLUE}🧹 Cleaning previous builds...${NC}"
    
    # Clean Next.js build
    rm -rf .next
    rm -rf out
    
    # Clean Tauri build
    rm -rf src-tauri/target/release
    rm -rf src-tauri/target/debug
    
    # Clean custom build directory
    rm -rf "$BUILD_DIR"
    mkdir -p "$BUILD_DIR"
    
    print_status "Build directories cleaned"
}

# Generate optimized icons
generate_icons() {
    echo -e "${BLUE}🎨 Generating optimized icons...${NC}"
    
    mkdir -p "$ASSETS_DIR"
    
    # Check if source icon exists
    if [ ! -f "public/icon.png" ]; then
        print_error "Source icon not found at public/icon.png"
        exit 1
    fi
    
    # Ensure the main icon file is present for the build context
    cp public/icon.png "$ASSETS_DIR/icon.png"
    
    # Generate icons for different platforms
    if command -v convert &> /dev/null; then
        # Using ImageMagick
        convert public/icon.png -resize 32x32 "$ASSETS_DIR/32x32.png"
        convert public/icon.png -resize 128x128 "$ASSETS_DIR/128x128.png"
        convert public/icon.png -resize 256x256 "$ASSETS_DIR/128x128@2x.png"
        
        # macOS specific
        convert public/icon.png -resize 512x512 "$ASSETS_DIR/icon.icns"
        
        # Windows specific
        convert public/icon.png -resize 256x256 "$ASSETS_DIR/icon.ico"
        
        print_status "Icons generated with ImageMagick"
    else
        print_warning "ImageMagick not found, using existing icons"
    fi
}

# Build frontend
build_frontend() {
    echo -e "${BLUE}🏗️  Building frontend...${NC}"
    
    # Install dependencies
    yarn install 
    
    # Generate Prisma client
    yarn prisma:generate
    
    # Build optimized export
    NODE_ENV=production yarn build:export
    
    print_status "Frontend built successfully"
}

# Build Tauri application
build_tauri() {
    echo -e "${BLUE}🦀 Building Tauri application...${NC}"
    
    # Platform-specific build flags
    BUILD_FLAGS=""
    
    if [[ "$PLATFORM" == "macos" ]]; then
        BUILD_FLAGS="--target universal-apple-darwin"
    elif [[ "$PLATFORM" == "windows" ]]; then
        BUILD_FLAGS="--target x86_64-pc-windows-msvc"
    elif [[ "$PLATFORM" == "linux" ]]; then
        BUILD_FLAGS="--target x86_64-unknown-linux-gnu"
    fi
    
    # Build with optimizations
    tauri build $BUILD_FLAGS --verbose
    
    print_status "Tauri application built successfully"
}

# Package application
package_app() {
    echo -e "${BLUE}📦 Packaging application...${NC}"
    
    # Copy build artifacts
    if [[ "$PLATFORM" == "macos" ]]; then
        cp -r "src-tauri/target/release/bundle/macos/"*.app "$BUILD_DIR/"
        cp -r "src-tauri/target/release/bundle/dmg/"*.dmg "$BUILD_DIR/" 2>/dev/null || true
    elif [[ "$PLATFORM" == "windows" ]]; then
        cp -r "src-tauri/target/release/bundle/msi/"*.msi "$BUILD_DIR/" 2>/dev/null || true
        cp -r "src-tauri/target/release/bundle/nsis/"*.exe "$BUILD_DIR/" 2>/dev/null || true
    elif [[ "$PLATFORM" == "linux" ]]; then
        cp -r "src-tauri/target/release/bundle/deb/"*.deb "$BUILD_DIR/" 2>/dev/null || true
        cp -r "src-tauri/target/release/bundle/rpm/"*.rpm "$BUILD_DIR/" 2>/dev/null || true
        cp -r "src-tauri/target/release/bundle/appimage/"*.AppImage "$BUILD_DIR/" 2>/dev/null || true
    fi
    
    # Create version info
    cat > "$BUILD_DIR/version.json" << EOF
{
  "version": "$VERSION",
  "platform": "$PLATFORM",
  "buildDate": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "commit": "$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
}
EOF
    
    print_status "Application packaged in $BUILD_DIR"
}

# Generate checksums
generate_checksums() {
    echo -e "${BLUE}🔒 Generating checksums...${NC}"
    
    cd "$BUILD_DIR"
    
    # Generate SHA256 checksums
    if command -v sha256sum &> /dev/null; then
        sha256sum * > checksums.txt
    elif command -v shasum &> /dev/null; then
        shasum -a 256 * > checksums.txt
    else
        print_warning "No checksum utility found"
    fi
    
    cd ..
    print_status "Checksums generated"
}

# Create release notes
create_release_notes() {
    echo -e "${BLUE}📝 Creating release notes...${NC}"
    
    cat > "$BUILD_DIR/RELEASE_NOTES.md" << EOF
# ${APP_NAME} v${VERSION} - ${PLATFORM}

## Build Information
- **Version**: ${VERSION}
- **Platform**: ${PLATFORM}
- **Build Date**: $(date -u +%Y-%m-%dT%H:%M:%SZ)
- **Git Commit**: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')

## Features
- Professional CAD/CAM Desktop Application
- Offline-first architecture with local SQLite database
- Advanced 3D modeling and toolpath generation
- Plugin system with SDK
- Native file system integration
- Secure authentication system

## Installation
Please refer to the platform-specific installation guide in the documentation.

## System Requirements
- **Memory**: 4GB RAM minimum, 8GB recommended
- **Storage**: 2GB free space
- **Graphics**: OpenGL 3.3 compatible GPU
- **OS**: Modern 64-bit operating system

## Support
For support, please visit: https://cadcamfun.xyz/support
EOF
    
    print_status "Release notes created"
}

# Main execution
main() {
    echo -e "${BLUE}🎯 Starting ${APP_NAME} Desktop Build Process${NC}"
    
    check_prerequisites
    clean_build
    generate_icons
    build_frontend
    build_tauri
    package_app
    generate_checksums
    create_release_notes
    
    echo -e "${GREEN}🎉 Build completed successfully!${NC}"
    echo -e "${GREEN}📦 Build artifacts available in: ${BUILD_DIR}${NC}"
    echo -e "${GREEN}🚀 Ready for production deployment!${NC}"
}

# Run main function
main "$@"