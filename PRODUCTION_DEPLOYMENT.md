# 🚀 CADCAMFUN Desktop - Production Deployment Guide

This guide provides step-by-step instructions for deploying CADCAMFUN Desktop to production environments with automated CI/CD, code signing, and distribution.

## 📋 Pre-Deployment Checklist

### ✅ Code Quality & Security
- [ ] All tests pass (`yarn test`)
- [ ] Linting passes without errors (`yarn lint`)
- [ ] Security vulnerabilities scanned and resolved
- [ ] Dependencies updated to latest stable versions
- [ ] No hardcoded secrets or API keys in source code
- [ ] Environment variables properly configured
- [ ] Database migrations tested and working

### ✅ Build System
- [ ] Frontend builds successfully (`yarn build:export`)
- [ ] Plugins build without errors (`yarn build-plugins`)
- [ ] Tauri builds for all target platforms
- [ ] Build artifacts are under 150MB per platform
- [ ] All required icons and assets are present
- [ ] Build script permissions set (`chmod +x scripts/build-desktop.sh`)

### ✅ Configuration
- [ ] Production environment variables configured
- [ ] Database connection strings updated
- [ ] API endpoints point to production servers
- [ ] Authentication providers configured
- [ ] Auto-updater endpoint configured
- [ ] Error tracking and analytics configured

### ✅ Code Signing & Security
- [ ] Code signing certificates obtained and configured
- [ ] Private keys securely stored in CI/CD secrets
- [ ] Update signatures configured for auto-updater
- [ ] Security policies reviewed and implemented
- [ ] CSP headers configured appropriately

### ✅ Distribution
- [ ] Release channels defined (stable, beta, alpha)
- [ ] Update server infrastructure ready
- [ ] Download servers configured
- [ ] CDN configured for global distribution
- [ ] Analytics and download tracking implemented

## 🔧 Environment Setup

### Required Secrets for CI/CD

Configure these secrets in your GitHub repository settings:

#### Code Signing (macOS)
```bash
APPLE_CERTIFICATE              # Base64 encoded .p12 certificate
APPLE_CERTIFICATE_PASSWORD     # Certificate password
APPLE_SIGNING_IDENTITY         # Developer ID Application: Your Name
APPLE_ID                       # Apple ID email
APPLE_PASSWORD                 # App-specific password
APPLE_TEAM_ID                  # Team ID from Apple Developer
```

#### Code Signing (Windows)
```bash
WINDOWS_CERTIFICATE            # Base64 encoded .pfx certificate
WINDOWS_CERTIFICATE_PASSWORD   # Certificate password
```

#### Tauri Update Signing
```bash
TAURI_SIGNING_PRIVATE_KEY      # Private key for update signatures
TAURI_SIGNING_PRIVATE_KEY_PASSWORD # Private key password
```

#### Update Server
```bash
UPDATE_SERVER_WEBHOOK_URL      # Webhook URL for update notifications
UPDATE_SERVER_TOKEN           # Authentication token for update server
```

### Generate Tauri Signing Keys

```bash
# Generate new signing keys for Tauri updater
tauri signer generate -w ~/.tauri/myapp.key

# Get the public key for tauri.conf.json
tauri signer sign -k ~/.tauri/myapp.key --password "your-password" "dummy-file"
```

Add the public key to `tauri.conf.json`:

```json
{
  "updater": {
    "active": true,
    "endpoints": ["https://api.cadcamfun.xyz/updates/{{target}}/{{arch}}/{{current_version}}"],
    "dialog": true,
    "pubkey": "YOUR_PUBLIC_KEY_HERE"
  }
}
```

## 🏗️ Automated Build Process

### GitHub Actions Workflow

The automated CI/CD pipeline (`/.github/workflows/desktop-build.yml`) handles:

1. **Testing & Linting**: Ensures code quality
2. **Multi-Platform Building**: Windows, macOS, Linux
3. **Code Signing**: Automatic signing for all platforms
4. **Release Creation**: GitHub releases with assets
5. **Update Notification**: Notifies update server

### Triggering Builds

#### Development Builds
```bash
# Push to main or develop branch
git push origin main
```

#### Release Builds
```bash
# Create and push a version tag
git tag v1.2.0
git push origin v1.2.0
```

#### Manual Builds
```bash
# Use GitHub Actions web interface
# Go to Actions > Desktop App Build & Release > Run workflow
```

## 📦 Manual Build Process

### Prerequisites Installation

```bash
# Install build dependencies
./scripts/build-desktop.sh --check-only

# Or manually:
# Node.js 18+
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18

# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Tauri CLI
cargo install tauri-cli --version "^2.0" --locked
```

### Platform-Specific Setup

#### macOS
```bash
# Install Xcode command line tools
xcode-select --install

# Import signing certificate
security import certificate.p12 -k ~/Library/Keychains/login.keychain-db
```

#### Windows
```bash
# Install Visual Studio Build Tools
# Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/

# Import signing certificate
certlm.msc # Import .pfx certificate
```

#### Linux
```bash
# Install dependencies
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

### Build Commands

```bash
# Automated build (recommended)
chmod +x scripts/build-desktop.sh
./scripts/build-desktop.sh

# Manual build steps
yarn install --frozen-lockfile
yarn build-plugins
yarn prisma:generate
NODE_ENV=production yarn build:export
tauri build --verbose

# Platform-specific builds
tauri build --target universal-apple-darwin  # macOS Universal
tauri build --target x86_64-pc-windows-msvc  # Windows x64
tauri build --target x86_64-unknown-linux-gnu # Linux x64
```

## 🚀 Release Process

### 1. Version Management

```bash
# Update version in package.json and Cargo.toml
npm version patch|minor|major

# Update version in tauri.conf.json
# Update CHANGELOG.md
```

### 2. Testing

```bash
# Run full test suite
yarn test

# Test build locally
yarn build:desktop

# Test installation
# Install and test the generated package
```

### 3. Create Release

```bash
# Create and push version tag
git tag -a v1.2.0 -m "Release version 1.2.0"
git push origin v1.2.0

# GitHub Actions will automatically:
# - Build for all platforms
# - Sign packages
# - Create GitHub release
# - Upload artifacts
# - Notify update server
```

### 4. Post-Release Verification

- [ ] Download and test installers from GitHub release
- [ ] Verify auto-updater detects new version
- [ ] Check download analytics and error tracking
- [ ] Monitor user feedback and error reports

## 🔄 Update Server Setup

### Update Server Implementation

```javascript
// Example update server endpoint
app.get('/updates/check', async (req, res) => {
  const { current_version, platform, arch } = req.query;
  
  // Check if update is available
  const latestVersion = await getLatestVersion(platform, arch);
  
  if (semver.gt(latestVersion.version, current_version)) {
    res.json({
      version: latestVersion.version,
      download_url: latestVersion.download_url,
      release_notes: latestVersion.release_notes,
      signature: latestVersion.signature,
      pub_date: latestVersion.pub_date,
      size: latestVersion.size,
      is_critical: latestVersion.is_critical
    });
  } else {
    res.status(204).send(); // No update available
  }
});
```

### Update Signature Generation

```bash
# Generate signature for update file
tauri signer sign -k ~/.tauri/myapp.key --password "your-password" "installer.msi"
```

## 📊 Monitoring & Analytics

### Error Tracking

Configure error tracking in production:

```typescript
// src/lib/errorTracking.ts
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [
    new Sentry.BrowserTracing(),
  ],
  tracesSampleRate: 1.0,
});
```

### Analytics

```typescript
// src/lib/analytics.ts
import { Analytics } from '@vercel/analytics/react';

export function trackEvent(event: string, properties?: object) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', event, properties);
  }
}
```

### Health Checks

```typescript
// src/lib/healthCheck.ts
export async function performHealthCheck() {
  const checks = [
    checkDatabaseConnection(),
    checkAPIEndpoints(),
    checkPluginSystem(),
    checkAutoUpdater(),
  ];
  
  const results = await Promise.allSettled(checks);
  return results.every(result => result.status === 'fulfilled');
}
```

## 🔐 Security Considerations

### Code Signing Best Practices

1. **Certificate Management**
   - Store certificates securely
   - Use hardware security modules (HSM) for production
   - Rotate certificates before expiration
   - Monitor certificate transparency logs

2. **Private Key Security**
   - Never commit private keys to source control
   - Use environment variables or secure vaults
   - Implement key rotation policies
   - Use separate keys for different environments

3. **Build Security**
   - Verify all dependencies
   - Scan for vulnerabilities
   - Use reproducible builds
   - Implement supply chain security

### Runtime Security

1. **Content Security Policy**
   - Restrict script sources
   - Prevent XSS attacks
   - Control resource loading
   - Monitor CSP violations

2. **Update Security**
   - Verify update signatures
   - Use HTTPS for all communications
   - Implement rollback mechanisms
   - Monitor update failures

## 🚨 Troubleshooting

### Common Build Issues

#### Rust compilation errors
```bash
# Update Rust toolchain
rustup update

# Clear cache
cargo clean
rm -rf target/
```

#### Node.js dependency issues
```bash
# Clear cache and reinstall
rm -rf node_modules yarn.lock
yarn install
```

#### Code signing failures
```bash
# Verify certificate installation
security find-identity -v -p codesigning  # macOS
certlm.msc  # Windows

# Check certificate validity
openssl pkcs12 -info -in certificate.p12
```

### Runtime Issues

#### Auto-updater not working
1. Check update server endpoint configuration
2. Verify signature validation
3. Check network connectivity
4. Review update server logs

#### Performance issues
1. Enable performance profiling
2. Check memory usage patterns
3. Monitor GPU utilization
4. Review WebGL context creation

### Deployment Issues

#### Release automation failures
1. Check GitHub Actions logs
2. Verify secret configuration
3. Test build locally
4. Check permissions and tokens

## 📞 Support & Resources

- **Documentation**: [https://docs.cadcamfun.xyz](https://docs.cadcamfun.xyz)
- **Issues**: [GitHub Issues](https://github.com/nikomatt69/cad-cam-app-main-prod/issues)
- **Tauri Docs**: [https://tauri.app/](https://tauri.app/)
- **Security**: security@cadcamfun.xyz

---

**Last Updated**: $(date -u +%Y-%m-%d)
**Version**: 1.0.0