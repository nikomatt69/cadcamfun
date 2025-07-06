#!/bin/bash

# CADCAM FUN - macOS Build Script
# Builds the Tauri application for macOS (Intel and Apple Silicon)

set -e

echo "🍎 Starting macOS build for CADCAM FUN..."
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    print_error "This script must be run on macOS"
    exit 1
fi

# Check dependencies
print_status "Checking dependencies..."

# Check for Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check for Rust
if ! command -v rustc &> /dev/null; then
    print_error "Rust is not installed. Please install Rust from https://rustup.rs/"
    exit 1
fi

# Check for Tauri CLI
if ! command -v cargo-tauri &> /dev/null; then
    print_warning "Tauri CLI not found. Installing..."
    cargo install tauri-cli
fi

# Check for yarn
if ! command -v yarn &> /dev/null; then
    print_warning "Yarn not found. Installing..."
    npm install -g yarn
fi

# Detect architecture
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
    print_status "Detected Apple Silicon (ARM64)"
    TARGETS=("aarch64-apple-darwin")
elif [[ "$ARCH" == "x86_64" ]]; then
    print_status "Detected Intel (x86_64)"
    TARGETS=("x86_64-apple-darwin")
else
    print_error "Unsupported architecture: $ARCH"
    exit 1
fi

# Option to build universal binary
read -p "Do you want to build a universal binary (Intel + Apple Silicon)? [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Building universal binary..."
    TARGETS=("x86_64-apple-darwin" "aarch64-apple-darwin")
    UNIVERSAL=true
else
    UNIVERSAL=false
fi

# Install Rust targets
for target in "${TARGETS[@]}"; do
    print_status "Adding Rust target: $target"
    rustup target add "$target"
done

# Install dependencies
print_status "Installing Node.js dependencies..."
yarn install

# Build frontend
print_status "Building frontend..."
yarn build:export

# Build for each target
for target in "${TARGETS[@]}"; do
    print_status "Building for target: $target"
    cargo tauri build --target "$target"
done

# Create universal binary if requested
if [[ "$UNIVERSAL" == true ]]; then
    print_status "Creating universal binary..."
    
    # Paths to the built binaries
    INTEL_BINARY="src-tauri/target/x86_64-apple-darwin/release/cadcamfun-desktop"
    ARM_BINARY="src-tauri/target/aarch64-apple-darwin/release/cadcamfun-desktop"
    UNIVERSAL_BINARY="src-tauri/target/universal-apple-darwin/release/cadcamfun-desktop"
    
    # Create universal directory
    mkdir -p "src-tauri/target/universal-apple-darwin/release"
    
    # Create universal binary using lipo
    lipo -create "$INTEL_BINARY" "$ARM_BINARY" -output "$UNIVERSAL_BINARY"
    
    print_success "Universal binary created at: $UNIVERSAL_BINARY"
    
    # Create universal app bundle
    print_status "Creating universal app bundle..."
    
    # Copy one of the app bundles as base
    cp -r "src-tauri/target/x86_64-apple-darwin/release/bundle/macos/CADCAM FUN.app" \
          "src-tauri/target/universal-apple-darwin/release/"
    
    # Replace the binary in the app bundle
    cp "$UNIVERSAL_BINARY" \
       "src-tauri/target/universal-apple-darwin/release/CADCAM FUN.app/Contents/MacOS/cadcamfun-desktop"
    
    print_success "Universal app bundle created!"
fi

# Code signing (optional)
read -p "Do you want to code sign the application? [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Code signing..."
    
    # Get signing identity
    SIGNING_IDENTITIES=$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1)
    
    if [[ -z "$SIGNING_IDENTITIES" ]]; then
        print_warning "No Developer ID Application certificate found. Skipping code signing."
    else
        SIGNING_IDENTITY=$(echo "$SIGNING_IDENTITIES" | sed 's/.*"\(.*\)".*/\1/')
        print_status "Using signing identity: $SIGNING_IDENTITY"
        
        for target in "${TARGETS[@]}"; do
            APP_PATH="src-tauri/target/$target/release/bundle/macos/CADCAM FUN.app"
            if [[ -d "$APP_PATH" ]]; then
                print_status "Signing $APP_PATH..."
                codesign --force --options runtime --sign "$SIGNING_IDENTITY" "$APP_PATH"
            fi
        done
        
        if [[ "$UNIVERSAL" == true ]]; then
            UNIVERSAL_APP="src-tauri/target/universal-apple-darwin/release/CADCAM FUN.app"
            if [[ -d "$UNIVERSAL_APP" ]]; then
                print_status "Signing universal app..."
                codesign --force --options runtime --sign "$SIGNING_IDENTITY" "$UNIVERSAL_APP"
            fi
        fi
        
        print_success "Code signing completed!"
    fi
fi

# Create DMG (optional)
read -p "Do you want to create a DMG installer? [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Creating DMG installer..."
    
    # Check if create-dmg is installed
    if ! command -v create-dmg &> /dev/null; then
        print_warning "create-dmg not found. Installing via Homebrew..."
        if command -v brew &> /dev/null; then
            brew install create-dmg
        else
            print_error "Homebrew not found. Please install create-dmg manually or install Homebrew."
            exit 1
        fi
    fi
    
    # Create DMG for each target
    for target in "${TARGETS[@]}"; do
        APP_PATH="src-tauri/target/$target/release/bundle/macos/CADCAM FUN.app"
        if [[ -d "$APP_PATH" ]]; then
            DMG_PATH="src-tauri/target/$target/release/bundle/macos/CADCAM-FUN-${target}.dmg"
            print_status "Creating DMG for $target..."
            
            create-dmg \
                --volname "CADCAM FUN" \
                --window-pos 200 120 \
                --window-size 800 400 \
                --icon-size 100 \
                --icon "CADCAM FUN.app" 200 190 \
                --hide-extension "CADCAM FUN.app" \
                --app-drop-link 600 185 \
                "$DMG_PATH" \
                "$APP_PATH"
            
            print_success "DMG created: $DMG_PATH"
        fi
    done
    
    # Create universal DMG if applicable
    if [[ "$UNIVERSAL" == true ]]; then
        UNIVERSAL_APP="src-tauri/target/universal-apple-darwin/release/CADCAM FUN.app"
        if [[ -d "$UNIVERSAL_APP" ]]; then
            DMG_PATH="src-tauri/target/universal-apple-darwin/release/CADCAM-FUN-Universal.dmg"
            print_status "Creating universal DMG..."
            
            create-dmg \
                --volname "CADCAM FUN" \
                --window-pos 200 120 \
                --window-size 800 400 \
                --icon-size 100 \
                --icon "CADCAM FUN.app" 200 190 \
                --hide-extension "CADCAM FUN.app" \
                --app-drop-link 600 185 \
                "$DMG_PATH" \
                "$UNIVERSAL_APP"
            
            print_success "Universal DMG created: $DMG_PATH"
        fi
    fi
fi

# Summary
echo ""
echo "=================================================="
print_success "macOS build completed successfully!"
echo "=================================================="

print_status "Built artifacts:"
for target in "${TARGETS[@]}"; do
    APP_PATH="src-tauri/target/$target/release/bundle/macos/CADCAM FUN.app"
    if [[ -d "$APP_PATH" ]]; then
        echo "  - $APP_PATH"
    fi
    
    DMG_PATH="src-tauri/target/$target/release/bundle/macos/CADCAM-FUN-${target}.dmg"
    if [[ -f "$DMG_PATH" ]]; then
        echo "  - $DMG_PATH"
    fi
done

if [[ "$UNIVERSAL" == true ]]; then
    UNIVERSAL_APP="src-tauri/target/universal-apple-darwin/release/CADCAM FUN.app"
    if [[ -d "$UNIVERSAL_APP" ]]; then
        echo "  - $UNIVERSAL_APP"
    fi
    
    UNIVERSAL_DMG="src-tauri/target/universal-apple-darwin/release/CADCAM-FUN-Universal.dmg"
    if [[ -f "$UNIVERSAL_DMG" ]]; then
        echo "  - $UNIVERSAL_DMG"
    fi
fi

echo ""
print_status "Installation instructions:"
echo "  1. Double-click the .app file to run directly"
echo "  2. Or mount the .dmg file and drag the app to Applications folder"
echo "  3. If you get a security warning, go to System Preferences > Security & Privacy"
echo ""

print_success "🎉 macOS build process completed!"