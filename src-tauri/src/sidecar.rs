use std::process::{Child, Command, Stdio};
use std::time::Duration;
use anyhow::{anyhow, Result};
use tauri::{AppHandle, Manager};
use tokio::time::{sleep, timeout};
use tracing::{info, warn, debug};

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

        info!("Starting Next.js sidecar server...");

        // Find an available port
        let port = self.find_available_port().await?;
        
        // Get the app directory
        let resource_dir = app_handle
            .path()
            .resource_dir()
            .map_err(|e| anyhow!("Failed to get app resource directory: {}", e))?;
        
        let app_dir = resource_dir
            .parent()
            .ok_or_else(|| anyhow!("Failed to get parent directory"))?;

        info!("App directory: {:?}", app_dir);
        
        // Try different approaches to start the server
        let mut command = self.create_server_command(&app_dir, port)?;
        
        // Set environment variables for desktop mode
        command
            .env("NODE_ENV", "production")
            .env("IS_DESKTOP", "true")
            .env("NEXT_PUBLIC_IS_DESKTOP", "true")
            .env("PORT", port.to_string())
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
        if let Err(e) = self.wait_for_server_ready(port).await {
            warn!("Server may not be fully ready: {}", e);
            // Continue anyway, the server might still work
        }

        self.process = Some(child);
        self.port = Some(port);
        self.is_running = true;

        info!("Sidecar server started successfully on port {}", port);
        Ok(port)
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
    fn create_server_command(&self, app_dir: &std::path::Path, port: u16) -> Result<Command> {
        let mut command;

        // First, try to use yarn/npm in production mode
        if app_dir.join("package.json").exists() {
            // Try yarn first
            if which::which("yarn").is_ok() {
                command = Command::new("yarn");
                command.arg("start").current_dir(app_dir);
            } else if which::which("npm").is_ok() {
                command = Command::new("npm");
                command.arg("start").current_dir(app_dir);
            } else {
                return Err(anyhow!("Neither yarn nor npm found in PATH"));
            }
        } else {
            return Err(anyhow!("package.json not found in app directory"));
        }

        Ok(command)
    }

    /// Find an available port
    async fn find_available_port(&self) -> Result<u16> {
        // Try common ports for development
        let preferred_ports = [3001, 3002, 3003, 3004, 3005];
        
        for &port in &preferred_ports {
            if self.is_port_available(port).await {
                return Ok(port);
            }
        }

        // Try random ports if preferred ones are taken
        for port in 3006..4000 {
            if self.is_port_available(port).await {
                return Ok(port);
            }
        }

        Err(anyhow!("No available ports found"))
    }

    /// Check if a port is available
    async fn is_port_available(&self, port: u16) -> bool {
        use std::net::{SocketAddr, TcpListener};
        
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        TcpListener::bind(addr).is_ok()
    }

    /// Wait for the server to be ready
    async fn wait_for_server_ready(&self, port: u16) -> Result<()> {
        let url = format!("http://127.0.0.1:{}/api", port);
        let client = reqwest::Client::new();
        
        for attempt in 1..=30 {
            debug!("Checking server readiness, attempt {}/30", attempt);
            
            match client.get(&url).timeout(Duration::from_secs(2)).send().await {
                Ok(response) => {
                    if response.status().is_success() || response.status().as_u16() == 404 {
                        info!("Server is ready on port {}", port);
                        return Ok(());
                    }
                }
                Err(e) => {
                    debug!("Server not ready yet: {}", e);
                }
            }
            
            sleep(Duration::from_secs(1)).await;
        }

        Err(anyhow!("Server did not become ready within timeout"))
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        if let Some(mut child) = self.process.take() {
            let _ = child.kill();
        }
    }
}