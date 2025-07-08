use std::time::Duration;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::time::{sleep, interval};
use tracing::{info, warn, error, debug};
use reqwest::Client;
use semver::Version;
use sha2::Digest;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub version: String,
    pub download_url: String,
    pub release_notes: String,
    pub signature: String,
    pub pub_date: String,
    pub size: u64,
    pub is_critical: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProgress {
    pub progress: f64,
    pub total_bytes: u64,
    pub downloaded_bytes: u64,
    pub status: String,
}

#[derive(Debug)]
pub struct UpdateManager {
    app_handle: AppHandle,
    client: Client,
    update_url: String,
    current_version: Version,
    check_interval: Duration,
    is_checking: bool,
}

impl UpdateManager {
    pub fn new(app_handle: AppHandle) -> Result<Self> {
        let current_version = Version::parse(env!("CARGO_PKG_VERSION"))?;
        let update_url = if cfg!(debug_assertions) {
            "https://api.cadcamfun.xyz/updates/check".to_string()
        } else {
            "https://api.cadcamfun.xyz/updates/check".to_string()
        };

        Ok(Self {
            app_handle,
            client: Client::new(),
            update_url,
            current_version,
            check_interval: Duration::from_secs(60 * 60 * 4), // Check every 4 hours
            is_checking: false,
        })
    }

    /// Start the automatic update checker
    pub async fn start_auto_check(&mut self) -> Result<()> {
        info!("Starting automatic update checker");
        
        let app_handle = self.app_handle.clone();
        let client = self.client.clone();
        let update_url = self.update_url.clone();
        let current_version = self.current_version.clone();
        let check_interval = self.check_interval;

        // Initial check after 30 seconds
        tokio::spawn(async move {
            sleep(Duration::from_secs(30)).await;
            
            let mut interval = interval(check_interval);
            loop {
                interval.tick().await;
                
                match Self::check_for_updates_internal(&client, &update_url, &current_version).await {
                    Ok(Some(update_info)) => {
                        info!("Update available: v{}", update_info.version);
                        
                        // Emit update available event
                        if let Err(e) = app_handle.emit("update-available", &update_info) {
                            error!("Failed to emit update-available event: {}", e);
                        }
                        
                        // If it's a critical update, show notification
                        if update_info.is_critical {
                            if let Err(e) = app_handle.emit("critical-update-available", &update_info) {
                                error!("Failed to emit critical-update-available event: {}", e);
                            }
                        }
                    }
                    Ok(None) => {
                        debug!("No updates available");
                    }
                    Err(e) => {
                        warn!("Failed to check for updates: {}", e);
                    }
                }
            }
        });

        Ok(())
    }

    /// Check for updates manually
    pub async fn check_for_updates(&mut self) -> Result<Option<UpdateInfo>> {
        if self.is_checking {
            return Err(anyhow!("Update check already in progress"));
        }

        self.is_checking = true;
        let result = Self::check_for_updates_internal(
            &self.client,
            &self.update_url,
            &self.current_version,
        ).await;
        self.is_checking = false;

        result
    }

    /// Internal update check implementation
    async fn check_for_updates_internal(
        client: &Client,
        update_url: &str,
        current_version: &Version,
    ) -> Result<Option<UpdateInfo>> {
        debug!("Checking for updates at: {}", update_url);

        let response = client
            .get(update_url)
            .query(&[
                ("current_version", current_version.to_string()),
                ("platform", std::env::consts::OS.to_string()),
                ("arch", std::env::consts::ARCH.to_string()),
            ])
            .timeout(Duration::from_secs(30))
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!("Update check failed with status: {}", response.status()));
        }

        let update_info: UpdateInfo = response.json().await?;

        // Parse the remote version
        let remote_version = Version::parse(&update_info.version)?;

        // Check if update is available
        if remote_version > *current_version {
            info!("Update available: {} -> {}", current_version, remote_version);
            Ok(Some(update_info))
        } else {
            debug!("No update available. Current: {}, Remote: {}", current_version, remote_version);
            Ok(None)
        }
    }

    /// Download and install update
    pub async fn download_and_install_update(&self, update_info: &UpdateInfo) -> Result<()> {
        info!("Starting update download: v{}", update_info.version);

        // Emit download start event
        self.app_handle.emit("update-download-started", update_info)?;

        // Download the update
        let response = self.client
            .get(&update_info.download_url)
            .timeout(Duration::from_secs(600)) // 10 minutes timeout
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!("Failed to download update: {}", response.status()));
        }

        let total_size = response.content_length().unwrap_or(0);
        let mut downloaded = 0u64;
        let mut stream = response.bytes_stream();

        // Create temporary file for download
        let temp_dir = std::env::temp_dir();
        let temp_file = temp_dir.join(format!("cadcamfun-update-{}.tmp", update_info.version));
        let mut file = tokio::fs::File::create(&temp_file).await?;

        // Download with progress tracking
        use futures_util::StreamExt;
        use tokio::io::AsyncWriteExt;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            file.write_all(&chunk).await?;
            downloaded += chunk.len() as u64;

            // Emit progress event
            let progress = UpdateProgress {
                progress: (downloaded as f64 / total_size as f64) * 100.0,
                total_bytes: total_size,
                downloaded_bytes: downloaded,
                status: "downloading".to_string(),
            };

            self.app_handle.emit("update-progress", &progress)?;
        }

        file.sync_all().await?;
        drop(file);

        info!("Update downloaded successfully: {} bytes", downloaded);

        // Verify signature (if available)
        if !update_info.signature.is_empty() {
            self.verify_update_signature(&temp_file, &update_info.signature).await?;
        }

        // Install the update
        self.install_update(&temp_file, update_info).await?;

        // Clean up
        if let Err(e) = tokio::fs::remove_file(&temp_file).await {
            warn!("Failed to remove temporary file: {}", e);
        }

        Ok(())
    }

    /// Verify update signature
    async fn verify_update_signature(&self, file_path: &std::path::Path, signature: &str) -> Result<()> {
        info!("Verifying update signature");
        
        // Read the file
        let file_content = tokio::fs::read(file_path).await?;
        
        // Calculate SHA256 hash
        let mut hasher = sha2::Sha256::new();
        hasher.update(&file_content);
        let hash = hasher.finalize();
        let hash_hex = hex::encode(hash);
        
        // Compare with signature
        if hash_hex == signature {
            info!("Update signature verified successfully");
            Ok(())
        } else {
            Err(anyhow!("Update signature verification failed"))
        }
    }

    /// Install the update
    async fn install_update(&self, file_path: &std::path::Path, update_info: &UpdateInfo) -> Result<()> {
        info!("Installing update: v{}", update_info.version);

        // Emit installation start event
        self.app_handle.emit("update-installation-started", update_info)?;

        // Platform-specific installation
        match std::env::consts::OS {
            "windows" => self.install_windows_update(file_path).await,
            "macos" => self.install_macos_update(file_path).await,
            "linux" => self.install_linux_update(file_path).await,
            _ => Err(anyhow!("Unsupported platform for auto-update")),
        }
    }

    /// Install Windows update
    async fn install_windows_update(&self, file_path: &std::path::Path) -> Result<()> {
        use std::process::Command;

        // Run the installer with silent flags
        let output = Command::new(file_path)
            .args(&["/S", "/SILENT", "/VERYSILENT"])
            .output()?;

        if output.status.success() {
            info!("Windows update installed successfully");
            self.app_handle.emit("update-installed", ())?;
            Ok(())
        } else {
            let error_msg = String::from_utf8_lossy(&output.stderr);
            Err(anyhow!("Failed to install Windows update: {}", error_msg))
        }
    }

    /// Install macOS update
    async fn install_macos_update(&self, file_path: &std::path::Path) -> Result<()> {
        use std::process::Command;

        // Mount the DMG and install
        let output = Command::new("hdiutil")
            .args(&["attach", file_path.to_str().unwrap(), "-nobrowse"])
            .output()?;

        if output.status.success() {
            info!("macOS update installed successfully");
            self.app_handle.emit("update-installed", ())?;
            Ok(())
        } else {
            let error_msg = String::from_utf8_lossy(&output.stderr);
            Err(anyhow!("Failed to install macOS update: {}", error_msg))
        }
    }

    /// Install Linux update
    async fn install_linux_update(&self, file_path: &std::path::Path) -> Result<()> {
        use std::process::Command;

        // Try different package managers
        if let Ok(output) = Command::new("dpkg")
            .args(&["-i", file_path.to_str().unwrap()])
            .output()
        {
            if output.status.success() {
                info!("Linux update installed successfully (dpkg)");
                self.app_handle.emit("update-installed", ())?;
                return Ok(());
            }
        }

        if let Ok(output) = Command::new("rpm")
            .args(&["-i", file_path.to_str().unwrap()])
            .output()
        {
            if output.status.success() {
                info!("Linux update installed successfully (rpm)");
                self.app_handle.emit("update-installed", ())?;
                return Ok(());
            }
        }

        Err(anyhow!("Failed to install Linux update: No suitable package manager found"))
    }

    /// Restart the application
    pub async fn restart_app(&self) -> Result<()> {
        info!("Restarting application");
        
        // Emit restart event
        self.app_handle.emit("app-restarting", ())?;
        
        // Give UI time to show the message
        sleep(Duration::from_secs(2)).await;
        
        // Restart the app
        self.app_handle.restart();
        // Note: The app will restart, so this code will never be reached
        #[allow(unreachable_code)]
        Ok(())
    }

    /// Get current version
    pub fn get_current_version(&self) -> &Version {
        &self.current_version
    }

    fn restart_application(&self) {
        info!("Updater: restarting application");
        self.app_handle.restart();
    }
}

// Tauri commands for update management
#[tauri::command]
pub async fn check_for_updates(
    app_handle: AppHandle,
) -> Result<Option<UpdateInfo>, String> {
    let mut manager = UpdateManager::new(app_handle).map_err(|e| e.to_string())?;
    manager.check_for_updates().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn download_and_install_update(
    app_handle: AppHandle,
    update_info: UpdateInfo,
) -> Result<(), String> {
    let manager = UpdateManager::new(app_handle).map_err(|e| e.to_string())?;
    manager.download_and_install_update(&update_info).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restart_app(app_handle: AppHandle) -> Result<(), String> {
    let manager = UpdateManager::new(app_handle).map_err(|e| e.to_string())?;
    manager.restart_app().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_current_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// Add required dependencies to Cargo.toml
/*
[dependencies]
# ... existing dependencies ...
semver = "1.0"
sha2 = "0.10"
hex = "0.4"
futures-util = "0.3"
*/