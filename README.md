# CADCAMFUN Desktop Application

Professional CAD/CAM Desktop Application built with Tauri v2, Next.js, and TypeScript. Combines the power of web technologies with native desktop performance for advanced 3D modeling, toolpath generation, and CNC machining.

## 🚀 Features

### Core Capabilities
- **Professional CAD/CAM Suite**: Complete 3D modeling and CNC toolpath generation
- **Offline-First Architecture**: Local SQLite database with cloud synchronization
- **Advanced 3D Rendering**: WebGL-powered Three.js with WASM optimizations
- **Plugin System**: Extensible architecture with comprehensive SDK
- **Multi-Platform**: Native apps for Windows, macOS, and Linux
- **Auto-Updates**: Secure automatic updates with digital signatures

### Desktop-Specific Features
- **Native File System**: Deep OS integration for file operations
- **System Tray**: Background operation with system tray support
- **Native Menus**: Platform-native menu bars and context menus
- **Hardware Access**: Direct GPU acceleration and hardware optimization
- **Secure Storage**: OS-integrated credential and token storage

## 📋 System Requirements

### Minimum Requirements
- **Memory**: 4GB RAM
- **Storage**: 2GB free space
- **Graphics**: OpenGL 3.3 compatible GPU
- **OS**: Windows 10+, macOS 10.13+, or modern Linux (Ubuntu 18.04+)

### Recommended Requirements
- **Memory**: 8GB RAM or more
- **Storage**: 4GB free space
- **Graphics**: Dedicated GPU with 2GB VRAM
- **CPU**: Multi-core processor (4+ cores)

## 🛠️ Development Setup

### Prerequisites

```bash
# Install Bun (the package manager and runtime this repo uses)
curl -fsSL https://bun.sh/install | bash

# Install Rust (required for Tauri)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Install Tauri CLI
cargo install tauri-cli --version "^2.0" --locked

# Platform-specific dependencies
# macOS: Install Xcode command line tools
xcode-select --install

# Linux: Install system dependencies
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

### Clone and Setup

```bash
# Clone the repository
git clone https://github.com/nikomatt69/cad-cam-app-main-prod.git
cd cad-cam-app-main-prod

# Install dependencies
bun install

# Setup environment variables
cp .env.example .env.local
# Edit .env.local with your configurations

# Generate Prisma client
bun prisma:generate

# Run database migrations
bun prisma:migrate
```

### Development Commands

```bash
# Start development server (web)
bun dev

# Start Tauri development (desktop)
bun tauri:dev

# Build for production (web)
bun build

# Build desktop application
bun build:desktop

# Run linting
bun lint

# Build plugins
bun build-plugins
```

## 🏗️ Production Build

### Automated Build Script

Use the comprehensive build script for production deployment:

```bash
# Make the script executable
chmod +x scripts/build-desktop.sh

# Run the automated build
./scripts/build-desktop.sh
```

The build script will:
- ✅ Check all prerequisites
- 🧹 Clean previous builds
- 🎨 Generate optimized icons
- 🏗️ Build frontend with optimizations
- 🦀 Compile Tauri application
- 📦 Package for distribution
- 🔒 Generate checksums
- � Create release notes

### Manual Build Steps

```bash
# 1. Install dependencies and build frontend
bun install --frozen-lockfile
bun build-plugins
bun prisma:generate
NODE_ENV=production bun build:export

# 2. Build Tauri application
tauri build --verbose

# 3. Find build artifacts in:
# - Windows: src-tauri/target/release/bundle/msi/
# - macOS: src-tauri/target/release/bundle/dmg/
# - Linux: src-tauri/target/release/bundle/deb/ or /rpm/
```

## � Distribution

### Build Artifacts

After building, you'll find platform-specific installers:

- **Windows**: `.msi` and `.exe` installers
- **macOS**: `.dmg` disk image and `.app` bundle
- **Linux**: `.deb`, `.rpm`, and `.AppImage` packages

### Code Signing (Production)

For production releases, configure code signing:

```bash
# Windows: Set certificate in tauri.conf.json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "YOUR_CERT_THUMBPRINT"
    }
  }
}

# macOS: Set signing identity
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name"
    }
  }
}
```

## 🔧 Configuration

### Environment Variables

```bash
# Required
DATABASE_URL="your_database_url"
NEXTAUTH_SECRET="your_secret"
NEXTAUTH_URL="http://localhost:3000"

# Desktop-specific
IS_DESKTOP=true
NEXT_PUBLIC_IS_DESKTOP=true

# Optional integrations
OPENAI_API_KEY="your_openai_key"
ANTHROPIC_API_KEY="your_anthropic_key"
```

### Tauri Configuration

Key configuration in `tauri.conf.json`:

```json
{
  "productName": "CADCAM FUN",
  "identifier": "com.cadcamfun.app",
  "app": {
    "security": {
      "csp": {
        "default-src": ["'self'", "localhost:*", "cadcamfun.xyz"],
        "script-src": ["'self'", "'unsafe-eval'", "'unsafe-inline'"]
      }
    }
  },
  "plugins": {
    "fs": { "scope": ["$HOME/**", "$APPDATA/**"] },
    "dialog": { "all": true },
    "http": { "scope": ["https://cadcamfun.xyz/**"] }
  }
}
```

## 🔄 Auto-Updates

The application includes a comprehensive auto-update system:

### Features
- **Automatic Checking**: Checks for updates every 4 hours
- **Progress Tracking**: Real-time download and installation progress
- **Security**: Digital signature verification
- **User Control**: Optional updates with user confirmation
- **Critical Updates**: Forced updates for security issues

### Update Server Setup

Configure your update server endpoint in `src-tauri/src/updater.rs`:

```rust
let update_url = "https://api.cadcamfun.xyz/updates/check".to_string();
```

## 🧪 Testing

```bash
# Run unit tests
bun test

# Test desktop functionality
bun tauri:dev

# Build and test production bundle
bun build:desktop
# Install and test the generated installer
```

## 📱 Platform-Specific Features

### Windows
- **File Associations**: Register CAD file types
- **Windows Store**: Optional Microsoft Store distribution
- **System Integration**: Jump lists, progress bars

### macOS
- **Universal Binaries**: Support for Intel and Apple Silicon
- **App Store**: Mac App Store ready
- **Notarization**: Apple notarization support

### Linux
- **Package Managers**: APT, YUM, DNF compatible
- **Desktop Integration**: `.desktop` files and icons
- **AppImage**: Portable application format

## 🔍 Troubleshooting

### Common Issues

**Build fails with missing dependencies:**
```bash
# Install platform-specific dependencies (see Prerequisites)
# Clear cache and reinstall
rm -rf node_modules bun.lock
bun install
```

**Tauri build errors:**
```bash
# Update Rust toolchain
rustup update
# Clear Rust cache
cargo clean
```

**Runtime errors in desktop app:**
```bash
# Check logs in:
# Windows: %APPDATA%/cadcamfun/logs/
# macOS: ~/Library/Application Support/cadcamfun/logs/
# Linux: ~/.config/cadcamfun/logs/
```

### Debug Mode

Enable debug mode for detailed logging:

```bash
# Set environment variable
export TAURI_DEBUG=true
bun tauri:dev
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript/Rust best practices
- Maintain cross-platform compatibility
- Add tests for new features
- Update documentation
- Ensure security practices

## 📄 License

This project is licensed under a proprietary license. See the [LICENSE](LICENSE) file for details.

## 📞 Support

- **Documentation**: [https://docs.cadcamfun.xyz](https://docs.cadcamfun.xyz)
- **Issues**: [GitHub Issues](https://github.com/nikomatt69/cad-cam-app-main-prod/issues)
- **Community**: [Discord Server](https://discord.gg/cadcamfun)
- **Email**: support@cadcamfun.xyz

## 🎯 Roadmap

- [ ] Advanced CAM optimization algorithms
- [ ] Real-time collaboration features
- [ ] Mobile companion app
- [ ] Cloud rendering pipeline
- [ ] Extended plugin marketplace
- [ ] AR/VR visualization modes

---

**Built with ❤️ using Tauri, Next.js, and Three.js**