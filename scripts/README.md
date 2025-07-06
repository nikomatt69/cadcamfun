# 🛠️ CADCAM FUN - Build Scripts

Questo directory contiene gli script di build per tutte le piattaforme supportate da CADCAM FUN.

## 📁 Script Disponibili

### 🐧 Linux - `build-linux.sh`
Script per costruire l'applicazione su sistemi Linux con supporto per multiple architetture.

**Caratteristiche:**
- Supporto per x86_64, ARM64, e ARMv7
- Rilevamento automatico del package manager (apt, yum, dnf, pacman, zypper)
- Installazione automatica delle dipendenze di sistema
- Creazione di pacchetti .deb e .rpm
- Generazione di archivi portabili
- Configurazioni per Flatpak e Snap

**Uso:**
```bash
chmod +x scripts/build-linux.sh
./scripts/build-linux.sh
```

### 🍎 macOS - `build-macos.sh`
Script per costruire l'applicazione su macOS con supporto per Intel e Apple Silicon.

**Caratteristiche:**
- Supporto per x86_64 (Intel) e ARM64 (Apple Silicon)
- Opzione per binary universali
- Code signing automatico (opzionale)
- Creazione di file DMG per distribuzione
- Rilevamento automatico dell'architettura

**Uso:**
```bash
chmod +x scripts/build-macos.sh
./scripts/build-macos.sh
```

### 🪟 Windows - `build-windows.bat`
Script batch per costruire l'applicazione su Windows con supporto per multiple architetture.

**Caratteristiche:**
- Supporto per x86_64, x86, e ARM64
- Creazione di installer MSI e NSIS
- Versioni portabili
- Archivi ZIP per distribuzione
- Rilevamento automatico dell'architettura

**Uso:**
```cmd
scripts\build-windows.bat
```

## 🔧 Prerequisiti

### Tutti i Sistemi
- **Node.js** (v16 o superiore) - https://nodejs.org/
- **Rust** (latest stable) - https://rustup.rs/
- **Yarn** (verrà installato automaticamente se mancante)

### Linux
- **Dipendenze di sistema** (verranno installate automaticamente):
  - pkg-config
  - libglib2.0-dev
  - libgtk-3-dev
  - libwebkit2gtk-4.0-dev
  - libayatana-appindicator3-dev
  - librsvg2-dev
  - libssl-dev
  - xdg-utils

### macOS
- **Xcode Command Line Tools**:
  ```bash
  xcode-select --install
  ```
- **Homebrew** (per create-dmg, opzionale):
  ```bash
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  ```

### Windows
- **Visual Studio Build Tools** o **Visual Studio Community**
- **WebView2** (solitamente già installato su Windows 10/11)

## 🚀 Guida Rapida

### 1. Preparazione
```bash
# Clona il repository
git clone <repository-url>
cd cadcam-fun

# Installa le dipendenze
yarn install
```

### 2. Build per la Tua Piattaforma

#### Linux:
```bash
./scripts/build-linux.sh
```

#### macOS:
```bash
./scripts/build-macos.sh
```

#### Windows:
```cmd
scripts\build-windows.bat
```

### 3. Trova i File Generati

I file compilati si troveranno in:
- **Linux**: `src-tauri/target/x86_64-unknown-linux-gnu/release/`
- **macOS**: `src-tauri/target/x86_64-apple-darwin/release/` (o aarch64-apple-darwin)
- **Windows**: `src-tauri\target\x86_64-pc-windows-msvc\release\`

## 📦 Formati di Output

### Linux
- **Eseguibile**: `cadcamfun-desktop`
- **Pacchetto Debian**: `CADCAM FUN_1.1.0_amd64.deb`
- **Pacchetto RPM**: `CADCAM FUN-1.1.0-1.x86_64.rpm`
- **AppImage**: `CADCAM FUN_1.1.0_amd64.AppImage` (se disponibile)
- **Archivio Portabile**: `CADCAM-FUN-1.1.0-<target>.tar.gz`

### macOS
- **App Bundle**: `CADCAM FUN.app`
- **DMG Installer**: `CADCAM-FUN-<target>.dmg`
- **Binary Universale**: (se richiesto)

### Windows
- **Eseguibile**: `cadcamfun-desktop.exe`
- **Installer MSI**: `CADCAM FUN_1.1.0_x64_en-US.msi`
- **Installer NSIS**: `CADCAM FUN_1.1.0_x64-setup.exe`
- **Versione Portabile**: cartella `portable/`
- **Archivi ZIP**: `CADCAM-FUN-1.1.0-<target>.zip`

## 🔍 Risoluzione Problemi

### Errori Comuni

#### "comando non trovato: cargo-tauri"
```bash
cargo install tauri-cli
```

#### Errori di dipendenze su Linux
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install build-essential pkg-config libssl-dev

# Red Hat/Fedora
sudo dnf install gcc gcc-c++ openssl-devel

# Arch Linux
sudo pacman -S base-devel openssl
```

#### Errori di firma su macOS
- Assicurati di avere un certificato Developer ID
- Oppure salta la firma quando richiesto

#### Errori WebView2 su Windows
- Installa WebView2 Runtime da Microsoft
- Oppure usa Windows 10/11 aggiornato

### Performance Tips

#### Linux
- Aggiungi la cartella del progetto alle esclusioni dell'antivirus
- Usa SSD per migliori prestazioni di build

#### macOS
- Chiudi applicazioni non necessarie durante il build
- Assicurati di avere almeno 4GB di RAM liberi

#### Windows
- Aggiungi la cartella del progetto alle esclusioni di Windows Defender
- Usa PowerShell come amministratore se necessario

## 📋 Checklist Pre-Build

- [ ] Node.js installato e funzionante
- [ ] Rust installato con `rustup`
- [ ] Yarn disponibile
- [ ] Dipendenze di sistema installate
- [ ] Spazio disco sufficiente (almeno 2GB liberi)
- [ ] Connessione internet per scaricare dipendenze

## 🆘 Supporto

Se incontri problemi con gli script di build:

1. **Controlla i prerequisiti** - Assicurati che tutti i requisiti siano soddisfatti
2. **Leggi i messaggi di errore** - Gli script forniscono informazioni dettagliate
3. **Controlla i log** - I file di log sono disponibili in `src-tauri/target/`
4. **Pulisci e riprova** - Esegui `cargo clean` e riprova
5. **Aggiorna le dipendenze** - Esegui `yarn install` e `cargo update`

## 📝 Note Aggiuntive

- **Cross-compilation**: Gli script supportano la cross-compilation dove possibile
- **CI/CD**: Questi script possono essere utilizzati in pipeline CI/CD
- **Personalizzazione**: Puoi modificare gli script per adattarli alle tue esigenze
- **Versioning**: Gli script usano la versione definita in `src-tauri/Cargo.toml`

---

**Ultimo aggiornamento**: 2025-07-06  
**Versione script**: 1.0.0  
**Compatibilità**: Tauri 2.x, Node.js 16+, Rust 1.70+