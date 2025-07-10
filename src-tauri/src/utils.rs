use std::time::{SystemTime, UNIX_EPOCH};
use anyhow::{anyhow, Result};
use tracing::{info, warn};
use sysinfo::System;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AppInfo {
    pub info: String,
}
/// Get system information
#[tauri::command]
pub async fn get_app_info() -> Result<AppInfo, String> {
    let mut sys = System::new_all();
    sys.refresh_all();

    let info = serde_json::json!({
        "os": {
            "name": System::name().unwrap_or_default(),
            "version": System::os_version().unwrap_or_default(),
            "kernel_version": System::kernel_version().unwrap_or_default(),
            "hostname": System::host_name().unwrap_or_default(),
        },
        "hardware": {
            "total_memory": sys.total_memory(),
            "available_memory": sys.available_memory(),
            "used_memory": sys.used_memory(),
            "total_swap": sys.total_swap(),
            "used_swap": sys.used_swap(),
            "cpu_count": sys.cpus().len(),
            "cpu_brand": sys.cpus().first().map(|cpu| cpu.brand()).unwrap_or("Unknown"),
        },
        "uptime": System::uptime(),
        "boot_time": System::boot_time(),
    });

    Ok(AppInfo {
        info: info.to_string(),
    })
}

/// Check if a process is running by name
pub fn is_process_running(process_name: &str) -> bool {
    let mut sys = System::new();
    sys.refresh_processes();

    sys.processes()
        .values()
        .any(|process| process.name().contains(process_name))
}

/// Get running processes by name pattern
pub fn get_processes_by_name(name_pattern: &str) -> Vec<(u32, String)> {
    let mut sys = System::new();
    sys.refresh_processes();

    sys.processes()
        .iter()
        .filter_map(|(pid, process)| {
            if process.name().contains(name_pattern) {
                Some((pid.as_u32(), process.name().to_string()))
            } else {
                None
            }
        })
        .collect()
}

/// Kill process by PID
pub fn kill_process(pid: u32) -> Result<()> {
    #[cfg(unix)]
    {
        use std::process::Command;
        let output = Command::new("kill")
            .arg("-9")
            .arg(pid.to_string())
            .output()
            .map_err(|e| anyhow!("Failed to execute kill command: {}", e))?;

        if !output.status.success() {
            return Err(anyhow!("Failed to kill process {}: {}", pid, 
                String::from_utf8_lossy(&output.stderr)));
        }
    }

    #[cfg(windows)]
    {
        use std::process::Command;
        let output = Command::new("taskkill")
            .arg("/F")
            .arg("/PID")
            .arg(pid.to_string())
            .output()
            .map_err(|e| anyhow!("Failed to execute taskkill command: {}", e))?;

        if !output.status.success() {
            return Err(anyhow!("Failed to kill process {}: {}", pid, 
                String::from_utf8_lossy(&output.stderr)));
        }
    }

    info!("Process {} killed successfully", pid);
    Ok(())
}

/// Generate a unique ID
pub fn generate_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Generate a short ID (8 characters)
pub fn generate_short_id() -> String {
    uuid::Uuid::new_v4().to_string()[..8].to_string()
}

/// Get current timestamp in milliseconds
pub fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

/// Get current timestamp in seconds
pub fn current_timestamp_sec() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

/// Format timestamp to human readable string
pub fn format_timestamp(timestamp: u64) -> String {
    let datetime = chrono::DateTime::from_timestamp(timestamp as i64, 0)
        .unwrap_or_else(|| chrono::Utc::now());
    datetime.format("%Y-%m-%d %H:%M:%S UTC").to_string()
}

/// Calculate file size in human readable format
pub fn format_file_size(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut size = bytes as f64;
    let mut unit_index = 0;

    while size >= 1024.0 && unit_index < UNITS.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }

    if unit_index == 0 {
        format!("{} {}", bytes, UNITS[unit_index])
    } else {
        format!("{:.2} {}", size, UNITS[unit_index])
    }
}

/// Validate email format
pub fn is_valid_email(email: &str) -> bool {
    use regex::Regex;
    
    let email_regex = Regex::new(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
        .expect("Invalid email regex");
    
    email_regex.is_match(email)
}

/// Sanitize filename for safe storage
pub fn sanitize_filename(filename: &str) -> String {
    use regex::Regex;
    
    let invalid_chars = Regex::new(r#"[<>:"/\\|?*]"#)
        .expect("Invalid filename regex");
    
    invalid_chars.replace_all(filename, "_").to_string()
}

/// Check if a port is available on localhost
pub async fn is_port_available(port: u16) -> bool {
    use tokio::net::TcpListener;
    
    match TcpListener::bind(format!("127.0.0.1:{}", port)).await {
        Ok(_) => true,
        Err(_) => false,
    }
}

/// Find an available port in range
pub async fn find_available_port(start: u16, end: u16) -> Result<u16> {
    for port in start..=end {
        if is_port_available(port).await {
            return Ok(port);
        }
    }
    
    Err(anyhow!("No available ports in range {}-{}", start, end))
}

/// Check if a URL is reachable
pub async fn is_url_reachable(url: &str) -> bool {
    match reqwest::get(url).await {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

/// Get local IP address
pub fn get_local_ip() -> Result<String> {
    match local_ip_address::local_ip() {
        Ok(ip) => Ok(ip.to_string()),
        Err(e) => Err(anyhow!("Failed to get local IP: {}", e)),
    }
}

/// Create a backup of a file
pub fn backup_file(file_path: &std::path::Path) -> Result<std::path::PathBuf> {
    if !file_path.exists() {
        return Err(anyhow!("File does not exist: {:?}", file_path));
    }

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let backup_name = format!("{}.backup.{}", 
        file_path.file_name().unwrap().to_string_lossy(), 
        timestamp);
    
    let backup_path = file_path.with_file_name(backup_name);
    
    std::fs::copy(file_path, &backup_path)
        .map_err(|e| anyhow!("Failed to create backup: {}", e))?;
    
    info!("Backup created: {:?}", backup_path);
    Ok(backup_path)
}

/// Calculate hash of a file
pub fn calculate_file_hash(file_path: &std::path::Path) -> Result<String> {
    use std::fs::File;
    use std::io::{BufReader, Read};
    use sha2::{Sha256, Digest};

    let file = File::open(file_path)
        .map_err(|e| anyhow!("Failed to open file: {}", e))?;
    
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0; 8192];

    loop {
        let bytes_read = reader.read(&mut buffer)
            .map_err(|e| anyhow!("Failed to read file: {}", e))?;
        
        if bytes_read == 0 {
            break;
        }
        
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

/// Compress data using gzip
pub fn compress_data(data: &[u8]) -> Result<Vec<u8>> {
    use flate2::{Compression, write::GzEncoder};
    use std::io::Write;

    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(data)
        .map_err(|e| anyhow!("Failed to compress data: {}", e))?;
    
    encoder.finish()
        .map_err(|e| anyhow!("Failed to finish compression: {}", e))
}

/// Decompress gzip data
pub fn decompress_data(data: &[u8]) -> Result<Vec<u8>> {
    use flate2::read::GzDecoder;
    use std::io::Read;

    let mut decoder = GzDecoder::new(data);
    let mut decompressed = Vec::new();
    
    decoder.read_to_end(&mut decompressed)
        .map_err(|e| anyhow!("Failed to decompress data: {}", e))?;
    
    Ok(decompressed)
}

/// Get application data directory
pub fn get_app_data_dir() -> Result<std::path::PathBuf> {
    use directories::ProjectDirs;
    
    if let Some(proj_dirs) = ProjectDirs::from("com", "cadcamfun", "cadcamfun") {
        let data_dir = proj_dirs.data_dir();
        std::fs::create_dir_all(data_dir)
            .map_err(|e| anyhow!("Failed to create app data directory: {}", e))?;
        Ok(data_dir.to_path_buf())
    } else {
        Err(anyhow!("Failed to get project directories"))
    }
}

/// Retry a function with exponential backoff
pub async fn retry_with_backoff<F, T, E>(
    mut func: F,
    max_attempts: usize,
    initial_delay: tokio::time::Duration,
) -> Result<T>
where
    F: FnMut() -> Result<T, E>,
    E: std::fmt::Display,
{
    let mut delay = initial_delay;
    
    for attempt in 1..=max_attempts {
        match func() {
            Ok(result) => return Ok(result),
            Err(e) => {
                if attempt == max_attempts {
                    return Err(anyhow!("Failed after {} attempts: {}", max_attempts, e));
                }
                
                warn!("Attempt {} failed: {}. Retrying in {:?}", attempt, e, delay);
                tokio::time::sleep(delay).await;
                delay *= 2; // Exponential backoff
            }
        }
    }
    
    unreachable!()
}

/// Check if the application is running in development mode
pub fn is_development_mode() -> bool {
    cfg!(debug_assertions) || std::env::var("CADCAMFUN_DEV").is_ok()
}

/// Get application version
pub fn get_app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Get build information
pub fn get_build_info() -> serde_json::Value {
    serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "name": env!("CARGO_PKG_NAME"),
        "description": env!("CARGO_PKG_DESCRIPTION"),
        "authors": env!("CARGO_PKG_AUTHORS"),
        "homepage": env!("CARGO_PKG_HOMEPAGE"),
        "repository": env!("CARGO_PKG_REPOSITORY"),
        "license": env!("CARGO_PKG_LICENSE"),
        "debug": cfg!(debug_assertions),
        "target": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
    })
}