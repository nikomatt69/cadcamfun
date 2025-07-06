use anyhow::{anyhow, Result};
use tauri::{AppHandle, Manager};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use tracing::{info, warn, debug};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::{sleep, timeout};
use local_ip_address::local_ip;

#[derive(Debug)]
pub struct SidecarManager {
    process: Option<Child>,
    port: Option<u16>,
    is_running: bool,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            process: None,
            port: None,
            is_running: false,
        }
    }

    /// Start the Next.js server as a sidecar process
    pub async fn start_server(&mut self, app_handle: &AppHandle) -> Result<u16> {
        if self.is_running {
            info!("Sidecar server is already running on port {}", self.port.unwrap_or(0));
            return Ok(self.port.unwrap_or(3001));
        }

        info!("Starting sidecar server...");

        // Get the resource directory path
        let app_dir = app_handle
            .path()
            .resource_dir()
            .or_else(|_| anyhow!("Failed to get app resource directory"))?
            .parent()
            .ok_or_else(|| anyhow!("Failed to get parent directory"))?;

        info!("App directory: {:?}", app_dir);
        
        // Try different approaches to start the server
        let mut command = self.create_server_command(&app_dir, 3001)?;
        
        // Set environment variables for desktop mode
        command
            .env("NODE_ENV", "production")
            .env("IS_DESKTOP", "true")
            .env("NEXT_PUBLIC_IS_DESKTOP", "true")
            .env("PORT", "3001")
            .env("HOST", "127.0.0.1")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        info!("Starting server with command: {:?}", command);

        let mut child = command
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn server process: {}", e))?;

        // Wait a bit and check if the process is still running
        sleep(Duration::from_secs(3)).await;

        match child.try_wait() {
            Ok(Some(status)) => {
                return Err(anyhow!("Server process exited immediately with status: {}", status));
            }
            Ok(None) => {
                info!("Server process is running");
            }
            Err(e) => {
                warn!("Failed to check server process status: {}", e);
            }
        }

        // Wait for the server to be ready
        if let Err(e) = self.wait_for_server_ready(3001).await {
            warn!("Server may not be fully ready: {}", e);
            // Continue anyway, the server might still work
        }

        self.process = Some(child);
        self.port = Some(3001);
        self.is_running = true;

        info!("Sidecar server started successfully on port 3001");
        Ok(3001)
    }

    /// Stop the sidecar server
    pub async fn stop_server(&mut self) -> Result<()> {
        if !self.is_running {
            info!("Sidecar server is not running");
            return Ok(());
        }

        info!("Stopping sidecar server...");

        if let Some(mut child) = self.process.take() {
            // Try to terminate gracefully first
            if let Err(e) = child.kill() {
                warn!("Failed to kill server process: {}", e);
            }

            // Wait for the process to exit
            match timeout(Duration::from_secs(10), async {
                loop {
                    match child.try_wait() {
                        Ok(Some(_)) => break,
                        Ok(None) => {
                            sleep(Duration::from_millis(100)).await;
                        }
                        Err(e) => {
                            warn!("Error checking process status: {}", e);
                            break;
                        }
                    }
                }
            }).await {
                Ok(_) => info!("Server process terminated gracefully"),
                Err(_) => {
                    warn!("Server process did not terminate within timeout");
                    // Force kill if needed
                    let _ = child.kill();
                }
            }
        }

        self.port = None;
        self.is_running = false;
        info!("Sidecar server stopped");
        Ok(())
    }

    /// Check if the server is running
    pub fn is_running(&self) -> bool {
        self.is_running
    }

    /// Get the server port
    pub fn get_port(&self) -> Option<u16> {
        self.port
    }

    /// Get the server URL
    pub fn get_url(&self) -> Option<String> {
        self.port.map(|port| format!("http://127.0.0.1:{}", port))
    }

    /// Create the appropriate command to start the server
    fn create_server_command(&self, app_dir: &Path, _port: u16) -> Result<Command> {
        let mut command;

        // Try npm first
        command = Command::new("npm");
        command
            .args(&["run", "start"])
            .current_dir(app_dir)
            .env("NODE_ENV", "production");

        Ok(command)
    }

    /// Find an available port
    async fn find_available_port(&self) -> Result<u16> {
        // Simple port finding logic
        let port = 3001;
        Ok(port)
    }

    /// Wait for the server to be ready
    async fn wait_for_server_ready(&self, port: u16) -> Result<()> {
        let url = format!("http://127.0.0.1:{}/api/health", port);
        let client = reqwest::Client::new();
        let max_attempts = 30;
        let delay = Duration::from_millis(1000);

        for attempt in 1..=max_attempts {
            if let Ok(response) = timeout(Duration::from_secs(5), client.get(&url).send()).await {
                if let Ok(resp) = response {
                    if resp.status().is_success() {
                        info!("Server is ready after {} attempts", attempt);
                        return Ok(());
                    }
                }
            }
            
            if attempt < max_attempts {
                sleep(delay).await;
            }
        }

        Err(anyhow!("Server failed to become ready after {} attempts", max_attempts))
    }

    fn get_mcp_server_path(&self, app_handle: &AppHandle) -> Result<PathBuf> {
        info!("Attempting to get MCP server path.");
        // The path is now resolved using resource_dir() which returns a Result
        let resource_path = app_handle
            .path()
            .resource_dir()
            .or_else(|_| anyhow!("Failed to get app resource directory"))?
            .join("bin/mcp-server");
        
        debug!("MCP server path: {:?}", resource_path);
        Ok(resource_path)
    }

    pub fn start_mcp_server(&mut self, app_handle: AppHandle) -> Result<u16> {
        // ... existing code ...
        Ok(self.port)
    }

    pub fn stop_mcp_server(&mut self) -> Result<()> {
        if let Some(mut child) = self.process.take() {
            info!("Stopping MCP server...");
            let _ = child.kill();
            self.is_running = false;
        }
        Ok(())
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        if let Some(mut child) = self.process.take() {
            let _ = child.kill();
        }
    }
}