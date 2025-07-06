use anyhow::anyhow;
use anyhow::Result;
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tracing::{info, warn};
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub app: AppSettings,
    pub sidecar: SidecarSettings,
    pub database: DatabaseSettings,
    pub ui: UISettings,
    pub security: SecuritySettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub version: String,
    pub debug_mode: bool,
    pub auto_start_sidecar: bool,
    pub minimize_to_tray: bool,
    pub auto_save_interval: u64, // seconds
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidecarSettings {
    pub port_range_start: u16,
    pub port_range_end: u16,
    pub start_timeout: u64,         // seconds
    pub health_check_interval: u64, // seconds
    pub auto_restart: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseSettings {
    pub connection_timeout: u64, // seconds
    pub max_connections: u32,
    pub backup_interval: u64, // hours
    pub keep_backups: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UISettings {
    pub theme: String,
    pub language: String,
    pub window_width: u32,
    pub window_height: u32,
    pub remember_window_state: bool,
    pub show_tooltips: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecuritySettings {
    pub session_timeout: u64, // minutes
    pub auto_lock: bool,
    pub require_auth_for_sensitive: bool,
    pub log_level: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            app: AppSettings {
                version: env!("CARGO_PKG_VERSION").to_string(),
                debug_mode: cfg!(debug_assertions),
                auto_start_sidecar: true,
                minimize_to_tray: true,
                auto_save_interval: 300, // 5 minutes
            },
            sidecar: SidecarSettings {
                port_range_start: 3001,
                port_range_end: 3010,
                start_timeout: 30,
                health_check_interval: 30,
                auto_restart: true,
            },
            database: DatabaseSettings {
                connection_timeout: 30,
                max_connections: 10,
                backup_interval: 24, // 24 hours
                keep_backups: 7,
            },
            ui: UISettings {
                theme: "auto".to_string(),
                language: "en".to_string(),
                window_width: 1400,
                window_height: 900,
                remember_window_state: true,
                show_tooltips: true,
            },
            security: SecuritySettings {
                session_timeout: 480, // 8 hours
                auto_lock: false,
                require_auth_for_sensitive: true,
                log_level: if cfg!(debug_assertions) {
                    "debug".to_string()
                } else {
                    "info".to_string()
                },
            },
        }
    }
}

impl AppConfig {
    /// Load configuration from file or create default
    pub fn load() -> Result<Self> {
        let config_path = Self::get_config_path()?;

        if config_path.exists() {
            info!("Loading configuration from: {:?}", config_path);
            let content = std::fs::read_to_string(&config_path)
                .map_err(|e| anyhow!("Failed to read config file: {}", e))?;

            let mut config: AppConfig = toml::from_str(&content)
                .map_err(|e| anyhow!("Failed to parse config file: {}", e))?;

            // Update version if needed
            config.app.version = env!("CARGO_PKG_VERSION").to_string();

            Ok(config)
        } else {
            info!("Config file not found, creating default configuration");
            let config = Self::default();

            // Save default config
            if let Err(e) = config.save() {
                warn!("Failed to save default config: {}", e);
            }

            Ok(config)
        }
    }

    /// Save configuration to file
    pub fn save(&self) -> Result<()> {
        let config_path = Self::get_config_path()?;

        // Create parent directory if it doesn't exist
        if let Some(parent) = config_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| anyhow!("Failed to create config directory: {}", e))?;
        }

        let content = toml::to_string_pretty(self)
            .map_err(|e| anyhow!("Failed to serialize config: {}", e))?;

        std::fs::write(&config_path, content)
            .map_err(|e| anyhow!("Failed to write config file: {}", e))?;

        info!("Configuration saved to: {:?}", config_path);
        Ok(())
    }

    /// Get the configuration file path
    fn get_config_path() -> Result<PathBuf> {
        if let Some(proj_dirs) = ProjectDirs::from("com", "cadcamfun", "cadcamfun") {
            Ok(proj_dirs.config_dir().join("config.toml"))
        } else {
            // Fallback to current directory
            warn!("Failed to get project directories, using fallback");
            Ok(PathBuf::from("./cadcamfun-config.toml"))
        }
    }

    /// Update a specific setting
    pub fn update_setting(&mut self, key: &str, value: &str) -> Result<()> {
        match key {
            "app.debug_mode" => self.app.debug_mode = value.parse()?,
            "app.auto_start_sidecar" => self.app.auto_start_sidecar = value.parse()?,
            "app.minimize_to_tray" => self.app.minimize_to_tray = value.parse()?,
            "app.auto_save_interval" => self.app.auto_save_interval = value.parse()?,

            "sidecar.port_range_start" => self.sidecar.port_range_start = value.parse()?,
            "sidecar.port_range_end" => self.sidecar.port_range_end = value.parse()?,
            "sidecar.start_timeout" => self.sidecar.start_timeout = value.parse()?,
            "sidecar.health_check_interval" => {
                self.sidecar.health_check_interval = value.parse()?
            }
            "sidecar.auto_restart" => self.sidecar.auto_restart = value.parse()?,

            "database.connection_timeout" => self.database.connection_timeout = value.parse()?,
            "database.max_connections" => self.database.max_connections = value.parse()?,
            "database.backup_interval" => self.database.backup_interval = value.parse()?,
            "database.keep_backups" => self.database.keep_backups = value.parse()?,

            "ui.theme" => self.ui.theme = value.to_string(),
            "ui.language" => self.ui.language = value.to_string(),
            "ui.window_width" => self.ui.window_width = value.parse()?,
            "ui.window_height" => self.ui.window_height = value.parse()?,
            "ui.remember_window_state" => self.ui.remember_window_state = value.parse()?,
            "ui.show_tooltips" => self.ui.show_tooltips = value.parse()?,

            "security.session_timeout" => self.security.session_timeout = value.parse()?,
            "security.auto_lock" => self.security.auto_lock = value.parse()?,
            "security.require_auth_for_sensitive" => {
                self.security.require_auth_for_sensitive = value.parse()?
            }
            "security.log_level" => self.security.log_level = value.to_string(),

            _ => return Err(anyhow!("Unknown setting key: {}", key)),
        }

        Ok(())
    }

    /// Get a setting value as string
    pub fn get_setting(&self, key: &str) -> Result<String> {
        let value = match key {
            "app.version" => self.app.version.clone(),
            "app.debug_mode" => self.app.debug_mode.to_string(),
            "app.auto_start_sidecar" => self.app.auto_start_sidecar.to_string(),
            "app.minimize_to_tray" => self.app.minimize_to_tray.to_string(),
            "app.auto_save_interval" => self.app.auto_save_interval.to_string(),

            "sidecar.port_range_start" => self.sidecar.port_range_start.to_string(),
            "sidecar.port_range_end" => self.sidecar.port_range_end.to_string(),
            "sidecar.start_timeout" => self.sidecar.start_timeout.to_string(),
            "sidecar.health_check_interval" => self.sidecar.health_check_interval.to_string(),
            "sidecar.auto_restart" => self.sidecar.auto_restart.to_string(),

            "database.connection_timeout" => self.database.connection_timeout.to_string(),
            "database.max_connections" => self.database.max_connections.to_string(),
            "database.backup_interval" => self.database.backup_interval.to_string(),
            "database.keep_backups" => self.database.keep_backups.to_string(),

            "ui.theme" => self.ui.theme.clone(),
            "ui.language" => self.ui.language.clone(),
            "ui.window_width" => self.ui.window_width.to_string(),
            "ui.window_height" => self.ui.window_height.to_string(),
            "ui.remember_window_state" => self.ui.remember_window_state.to_string(),
            "ui.show_tooltips" => self.ui.show_tooltips.to_string(),

            "security.session_timeout" => self.security.session_timeout.to_string(),
            "security.auto_lock" => self.security.auto_lock.to_string(),
            "security.require_auth_for_sensitive" => {
                self.security.require_auth_for_sensitive.to_string()
            }
            "security.log_level" => self.security.log_level.clone(),

            _ => return Err(anyhow!("Unknown setting key: {}", key)),
        };

        Ok(value)
    }

    /// Reset to default configuration
    pub fn reset_to_default(&mut self) {
        *self = Self::default();
    }

    /// Validate configuration
    pub fn validate(&self) -> Result<()> {
        // Validate port range
        if self.sidecar.port_range_start >= self.sidecar.port_range_end {
            return Err(anyhow!("Invalid sidecar port range"));
        }

        // Validate window dimensions
        if self.ui.window_width < 800 || self.ui.window_height < 600 {
            return Err(anyhow!("Window dimensions too small"));
        }

        // Validate timeouts
        if self.sidecar.start_timeout == 0 || self.database.connection_timeout == 0 {
            return Err(anyhow!("Timeouts must be greater than 0"));
        }

        // Validate theme
        if !["light", "dark", "auto"].contains(&self.ui.theme.as_str()) {
            return Err(anyhow!("Invalid theme: {}", self.ui.theme));
        }

        // Validate log level
        if !["error", "warn", "info", "debug", "trace"].contains(&self.security.log_level.as_str())
        {
            return Err(anyhow!("Invalid log level: {}", self.security.log_level));
        }

        Ok(())
    }

    /// Merge with environment variables
    pub fn merge_with_env(&mut self) {
        // Override with environment variables if they exist
        if let Ok(debug) = std::env::var("CADCAMFUN_DEBUG") {
            if let Ok(value) = debug.parse() {
                self.app.debug_mode = value;
            }
        }

        if let Ok(port_start) = std::env::var("CADCAMFUN_PORT_START") {
            if let Ok(value) = port_start.parse() {
                self.sidecar.port_range_start = value;
            }
        }

        if let Ok(port_end) = std::env::var("CADCAMFUN_PORT_END") {
            if let Ok(value) = port_end.parse() {
                self.sidecar.port_range_end = value;
            }
        }

        if let Ok(theme) = std::env::var("CADCAMFUN_THEME") {
            self.ui.theme = theme;
        }

        if let Ok(language) = std::env::var("CADCAMFUN_LANGUAGE") {
            self.ui.language = language;
        }

        if let Ok(log_level) = std::env::var("CADCAMFUN_LOG_LEVEL") {
            self.security.log_level = log_level;
        }
    }

    /// Export configuration as JSON for frontend
    pub fn to_json(&self) -> Result<String> {
        serde_json::to_string_pretty(self)
            .map_err(|e| anyhow!("Failed to serialize config to JSON: {}", e))
    }
}
