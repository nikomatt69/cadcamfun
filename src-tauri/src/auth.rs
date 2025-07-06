use std::time::{SystemTime, UNIX_EPOCH};
use anyhow::{anyhow, Result};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use argon2::password_hash::{rand_core::OsRng, SaltString};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use tracing::{info, warn, error};

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

#[derive(Debug)]
pub struct AuthManager {
    jwt_secret: String,
    argon2: Argon2<'static>,
}

impl AuthManager {
    pub fn new() -> Self {
        Self {
            jwt_secret: std::env::var("NEXTAUTH_SECRET")
                .unwrap_or_else(|_| "default-desktop-secret-change-in-production".to_string()),
            argon2: Argon2::default(),
        }
    }

    /// Authenticate user with username and password
    pub async fn authenticate(&self, username: &str, password: &str) -> Result<String> {
        info!("Attempting authentication for user: {}", username);

        // In a real implementation, you would:
        // 1. Query the database for the user
        // 2. Verify the password against the stored hash
        // 3. Generate a JWT token
        
        // For this demo, we'll use a simplified approach
        // that works with the existing Next.js authentication
        
        // Make a request to the sidecar server for authentication
        let client = reqwest::Client::new();
        let auth_url = "http://127.0.0.1:3001/api/auth/signin"; // Adjust port as needed
        
        let auth_data = serde_json::json!({
            "email": username,
            "password": password
        });

        match client.post(auth_url)
            .json(&auth_data)
            .send()
            .await
        {
            Ok(response) => {
                if response.status().is_success() {
                    let auth_result: serde_json::Value = response.json().await?;
                    
                    if auth_result["success"].as_bool().unwrap_or(false) {
                        // Extract user info and generate local token
                        let user_id = auth_result["user"]["id"].as_str()
                            .ok_or_else(|| anyhow!("Missing user ID"))?;
                        let user_name = auth_result["user"]["name"].as_str()
                            .unwrap_or("Unknown User");
                        let user_email = auth_result["user"]["email"].as_str()
                            .unwrap_or("unknown@example.com");

                        let token = self.generate_token(user_id, user_name, user_email)?;
                        info!("Authentication successful for user: {}", username);
                        Ok(token)
                    } else {
                        let error_msg = auth_result["error"].as_str()
                            .unwrap_or("Authentication failed");
                        warn!("Authentication failed for user {}: {}", username, error_msg);
                        Err(anyhow!("Authentication failed: {}", error_msg))
                    }
                } else {
                    warn!("Authentication request failed with status: {}", response.status());
                    Err(anyhow!("Authentication server error"))
                }
            }
            Err(e) => {
                error!("Failed to connect to authentication server: {}", e);
                // Fallback to local authentication for offline mode
                self.authenticate_offline(username, password).await
            }
        }
    }

    /// Fallback offline authentication
    async fn authenticate_offline(&self, username: &str, password: &str) -> Result<String> {
        warn!("Using offline authentication for user: {}", username);
        
        // In a real implementation, this would check against a local database
        // For now, we'll use a simple demo user
        if username == "demo@example.com" && password == "demo123" {
            let token = self.generate_token("demo-user", "Demo User", username)?;
            info!("Offline authentication successful for demo user");
            Ok(token)
        } else {
            Err(anyhow!("Invalid credentials (offline mode)"))
        }
    }

    /// Generate a JWT token
    pub fn generate_token(&self, user_id: &str, name: &str, email: &str) -> Result<String> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as usize;

        let claims = Claims {
            sub: user_id.to_string(),
            name: name.to_string(),
            email: email.to_string(),
            exp: now + 3600 * 24 * 7, // 7 days
            iat: now,
            iss: "cadcamfun-desktop".to_string(),
            aud: "cadcamfun-app".to_string(),
        };

        let header = Header::new(Algorithm::HS256);
        let encoding_key = EncodingKey::from_secret(self.jwt_secret.as_ref());

        encode(&header, &claims, &encoding_key)
            .map_err(|e| anyhow!("Failed to generate token: {}", e))
    }

    /// Validate a JWT token
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
                    info!("Token validation successful for user: {}", token_data.claims.sub);
                    true
                } else {
                    warn!("Token expired for user: {}", token_data.claims.sub);
                    false
                }
            }
            Err(e) => {
                warn!("Token validation failed: {}", e);
                false
            }
        }
    }

    /// Extract claims from a valid token
    pub fn get_claims(&self, token: &str) -> Result<Claims> {
        let decoding_key = DecodingKey::from_secret(self.jwt_secret.as_ref());
        let validation = Validation::new(Algorithm::HS256);

        let token_data = decode::<Claims>(token, &decoding_key, &validation)
            .map_err(|e| anyhow!("Failed to decode token: {}", e))?;

        Ok(token_data.claims)
    }

    /// Hash a password using Argon2
    pub fn hash_password(&self, password: &str) -> Result<String> {
        let salt = SaltString::generate(&mut OsRng);
        let password_hash = self.argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| anyhow!("Failed to hash password: {}", e))?;

        Ok(password_hash.to_string())
    }

    /// Verify a password against a hash
    pub fn verify_password(&self, password: &str, hash: &str) -> bool {
        match PasswordHash::new(hash) {
            Ok(parsed_hash) => {
                self.argon2.verify_password(password.as_bytes(), &parsed_hash).is_ok()
            }
            Err(_) => false,
        }
    }

    /// Refresh an existing token
    pub fn refresh_token(&self, token: &str) -> Result<String> {
        let claims = self.get_claims(token)?;
        self.generate_token(&claims.sub, &claims.name, &claims.email)
    }
}