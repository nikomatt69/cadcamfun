use std::time::{SystemTime, UNIX_EPOCH};
use anyhow::{anyhow, Result};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use tracing::{info, warn, error, debug};
use reqwest::Client;
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // Subject (user ID)
    pub name: String,
    pub email: String,
    pub exp: usize, // Expiration time
    pub iat: usize, // Issued at
    pub iss: String, // Issuer
    pub aud: String, // Audience
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BetterAuthSession {
    pub id: String,
    pub user_id: String,
    pub expires_at: String,
    pub user: BetterAuthUser,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BetterAuthUser {
    pub id: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub image: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DesktopAuthRequest {
    pub email: String,
    pub password: String,
    pub device_id: Option<String>,
    pub platform: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DesktopAuthResponse {
    pub success: bool,
    pub session: Option<BetterAuthSession>,
    pub token: Option<String>,
    pub error: Option<String>,
    pub sync_data: Option<SyncMetadata>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncMetadata {
    pub last_sync: String,
    pub version: String,
    pub offline_mode: bool,
}

#[derive(Debug)]
pub struct AuthManager {
    jwt_secret: String,
    http_client: Client,
    base_url: String,
    offline_mode: bool,
    cached_session: Option<BetterAuthSession>,
}

impl AuthManager {
    pub fn new() -> Self {
        let base_url = std::env::var("NEXTAUTH_URL")
            .unwrap_or_else(|_| "http://localhost:3001".to_string());

        Self {
            jwt_secret: std::env::var("NEXTAUTH_SECRET")
                .unwrap_or_else(|_| "default-desktop-secret-change-in-production".to_string()),
            http_client: Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .cookie_store(true) // Enable cookie handling for Better Auth
                .build()
                .unwrap_or_else(|_| Client::new()),
            base_url,
            offline_mode: false,
            cached_session: None,
        }
    }

    /// Authenticate using Better Auth API
    pub async fn authenticate(&mut self, email: &str, password: &str) -> Result<String> {
        info!("🔐 Attempting Better Auth authentication for user: {}", email);

        // Try online authentication first
        match self.authenticate_online(email, password).await {
            Ok(response) => {
                if response.success {
                    if let Some(session) = response.session {
                        self.cached_session = Some(session);
                        self.offline_mode = false;
                        
                        if let Some(token) = response.token {
                            info!("✅ Better Auth authentication successful");
                            return Ok(token);
                        }
                    }
                }
                
                let error_msg = response.error.unwrap_or_else(|| "Authentication failed".to_string());
                warn!("❌ Better Auth authentication failed: {}", error_msg);
                Err(anyhow!(error_msg))
            }
            Err(e) => {
                error!("🔌 Better Auth server unreachable: {}", e);
                
                // Fallback to offline authentication
                self.offline_mode = true;
                self.authenticate_offline(email, password).await
            }
        }
    }

    /// Online authentication via Better Auth API
    async fn authenticate_online(&self, email: &str, password: &str) -> Result<DesktopAuthResponse> {
        let auth_url = format!("{}/api/auth/signin", self.base_url);
        
        let request_data = DesktopAuthRequest {
            email: email.to_string(),
            password: password.to_string(),
            device_id: Some(self.get_device_id()),
            platform: Some("tauri-desktop".to_string()),
        };

        debug!("🌐 Making auth request to: {}", auth_url);

        let response = self.http_client
            .post(&auth_url)
            .json(&request_data)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .header("User-Agent", "CADCAMFun-Desktop/1.1.0")
            .send()
            .await
            .map_err(|e| anyhow!("Network request failed: {}", e))?;

        let status = response.status();
        let response_text = response.text().await
            .map_err(|e| anyhow!("Failed to read response: {}", e))?;

        debug!("📥 Auth response status: {}, body: {}", status, response_text);

        if status.is_success() {
            let auth_response: DesktopAuthResponse = serde_json::from_str(&response_text)
                .map_err(|e| anyhow!("Failed to parse auth response: {}", e))?;
            
            Ok(auth_response)
        } else {
            // Try to parse error response
            if let Ok(error_response) = serde_json::from_str::<DesktopAuthResponse>(&response_text) {
                Ok(error_response)
            } else {
                Err(anyhow!("Authentication failed with status: {}", status))
            }
        }
    }

    /// Fallback offline authentication
    async fn authenticate_offline(&self, email: &str, password: &str) -> Result<String> {
        warn!("📱 Using offline authentication for user: {}", email);
        
        // Simple demo authentication for offline mode
        if email == "demo@cadcamfun.xyz" && password == "demo123" {
            let token = self.generate_offline_token(email, "Demo User")?;
            info!("✅ Offline authentication successful for demo user");
            Ok(token)
        } else {
            Err(anyhow!("Invalid credentials (offline mode). Use demo@cadcamfun.xyz / demo123"))
        }
    }

    /// Generate offline token
    fn generate_offline_token(&self, email: &str, name: &str) -> Result<String> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as usize;

        let claims = Claims {
            sub: format!("offline-{}", email),
            name: name.to_string(),
            email: email.to_string(),
            exp: now + 3600 * 24 * 7, // 7 days
            iat: now,
            iss: "cadcamfun-desktop-offline".to_string(),
            aud: "cadcamfun-app".to_string(),
        };

        let header = jsonwebtoken::Header::new(Algorithm::HS256);
        let encoding_key = jsonwebtoken::EncodingKey::from_secret(self.jwt_secret.as_ref());

        jsonwebtoken::encode(&header, &claims, &encoding_key)
            .map_err(|e| anyhow!("Failed to generate offline token: {}", e))
    }

    /// Validate token (works for both online and offline tokens)
    pub fn validate_token(&self, token: &str) -> bool {
        let decoding_key = DecodingKey::from_secret(self.jwt_secret.as_ref());
        let validation = Validation::new(Algorithm::HS256);

        match decode::<Claims>(token, &decoding_key, &validation) {
            Ok(token_data) => {
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as usize;

                if token_data.claims.exp > now {
                    debug!("✅ Token validation successful for user: {}", token_data.claims.sub);
                    true
                } else {
                    warn!("⏰ Token expired for user: {}", token_data.claims.sub);
                    false
                }
            }
            Err(e) => {
                warn!("❌ Token validation failed: {}", e);
                false
            }
        }
    }

    /// Get claims from token
    pub fn get_claims(&self, token: &str) -> Result<Claims> {
        let decoding_key = DecodingKey::from_secret(self.jwt_secret.as_ref());
        let validation = Validation::new(Algorithm::HS256);

        let token_data = decode::<Claims>(token, &decoding_key, &validation)
            .map_err(|e| anyhow!("Failed to decode token: {}", e))?;

        Ok(token_data.claims)
    }

    /// Check session status via Better Auth API
    pub async fn check_session(&mut self) -> Result<Option<BetterAuthSession>> {
        if self.offline_mode {
            debug!("🔌 Offline mode: returning cached session");
            return Ok(self.cached_session.clone());
        }

        let session_url = format!("{}/api/auth/get-session", self.base_url);
        
        debug!("🔍 Checking session at: {}", session_url);

        match self.http_client
            .get(&session_url)
            .header("Accept", "application/json")
            .header("User-Agent", "CADCAMFun-Desktop/1.1.0")
            .send()
            .await
        {
            Ok(response) => {
                if response.status().is_success() {
                    let session_text = response.text().await
                        .map_err(|e| anyhow!("Failed to read session response: {}", e))?;
                    
                    debug!("📥 Session response: {}", session_text);

                    if let Ok(session_data) = serde_json::from_str::<HashMap<String, serde_json::Value>>(&session_text) {
                        if let Some(session_value) = session_data.get("session") {
                            if let Ok(session) = serde_json::from_value::<BetterAuthSession>(session_value.clone()) {
                                self.cached_session = Some(session.clone());
                                return Ok(Some(session));
                            }
                        }
                    }
                    
                    // No valid session found
                    self.cached_session = None;
                    Ok(None)
                } else {
                    debug!("📭 No active session (status: {})", response.status());
                    self.cached_session = None;
                    Ok(None)
                }
            }
            Err(e) => {
                warn!("🔌 Session check failed, switching to offline mode: {}", e);
                self.offline_mode = true;
                Ok(self.cached_session.clone())
            }
        }
    }

    /// Sign out via Better Auth API
    pub async fn sign_out(&mut self) -> Result<()> {
        if !self.offline_mode {
            let signout_url = format!("{}/api/auth/signout", self.base_url);
            
            debug!("👋 Signing out at: {}", signout_url);

            match self.http_client
                .post(&signout_url)
                .header("Accept", "application/json")
                .header("User-Agent", "CADCAMFun-Desktop/1.1.0")
                .send()
                .await
            {
                Ok(response) => {
                    if response.status().is_success() {
                        info!("✅ Better Auth sign out successful");
                    } else {
                        warn!("⚠️ Better Auth sign out failed with status: {}", response.status());
                    }
                }
                Err(e) => {
                    warn!("❌ Sign out request failed: {}", e);
                }
            }
        }

        // Always clear cached session
        self.cached_session = None;
        info!("🧹 Session cache cleared");
        
        Ok(())
    }

    /// Get device ID (consistent across app restarts)
    fn get_device_id(&self) -> String {
        // Try to get a consistent device ID
        std::env::var("CADCAMFUN_DEVICE_ID")
            .unwrap_or_else(|_| {
                use std::collections::hash_map::DefaultHasher;
                use std::hash::{Hash, Hasher};
                
                let mut hasher = DefaultHasher::new();
                
                // Use hostname and user for device ID
                if let Ok(hostname) = std::env::var("COMPUTERNAME")
                    .or_else(|_| std::env::var("HOSTNAME"))
                    .or_else(|_| std::env::var("HOST")) {
                    hostname.hash(&mut hasher);
                }
                
                if let Ok(user) = std::env::var("USERNAME")
                    .or_else(|_| std::env::var("USER")) {
                    user.hash(&mut hasher);
                }
                
                format!("desktop-{:x}", hasher.finish())
            })
    }

    /// Check if in offline mode
    pub fn is_offline(&self) -> bool {
        self.offline_mode
    }

    /// Get cached session
    pub fn get_cached_session(&self) -> Option<&BetterAuthSession> {
        self.cached_session.as_ref()
    }

    /// Try to reconnect to Better Auth
    pub async fn try_reconnect(&mut self) -> Result<bool> {
        if !self.offline_mode {
            debug!("✅ Already online");
            return Ok(true);
        }

        info!("🔄 Attempting to reconnect to Better Auth...");

        // Try to check session to test connectivity
        match self.check_session().await {
            Ok(_) => {
                self.offline_mode = false;
                info!("✅ Reconnected to Better Auth successfully");
                Ok(true)
            }
            Err(e) => {
                warn!("❌ Reconnection failed: {}", e);
                Ok(false)
            }
        }
    }

    /// Get sync metadata
    pub fn get_sync_metadata(&self) -> SyncMetadata {
        SyncMetadata {
            last_sync: chrono::Utc::now().to_rfc3339(),
            version: "1.1.0".to_string(),
            offline_mode: self.offline_mode,
        }
    }
}