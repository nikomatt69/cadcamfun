//! Secure storage in the OS keychain (macOS Keychain, Windows Credential Manager,
//! Secret Service on Linux). Secrets never touch SQLite or plain files.
//!
//! Every function returns a typed [`SecretError`]; nothing here panics.

use serde::Serialize;
use thiserror::Error;

pub const SERVICE: &str = "com.cadcamfun.app";
const MAX_KEY_LEN: usize = 128;

#[derive(Debug, Clone, PartialEq, Eq, Error, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "snake_case")]
pub enum SecretError {
    #[error("invalid secret key: {0}")]
    InvalidKey(String),
    #[error("secure storage is unavailable: {0}")]
    Unavailable(String),
    #[error("access to secure storage was denied: {0}")]
    AccessDenied(String),
    #[error("secure storage failed: {0}")]
    Storage(String),
}

/// Keys are short, printable identifiers such as `ai.anthropic.apiKey`.
pub fn validate_key(key: &str) -> Result<(), SecretError> {
    if key.is_empty() {
        return Err(SecretError::InvalidKey("key must not be empty".to_owned()));
    }
    if key.len() > MAX_KEY_LEN {
        return Err(SecretError::InvalidKey(format!(
            "key must be at most {MAX_KEY_LEN} bytes"
        )));
    }
    if !key
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | ':'))
    {
        return Err(SecretError::InvalidKey(
            "key may only contain ASCII letters, digits and . _ - :".to_owned(),
        ));
    }
    Ok(())
}

fn map_error(err: keyring::Error) -> SecretError {
    match err {
        keyring::Error::NoStorageAccess(inner) => SecretError::AccessDenied(inner.to_string()),
        keyring::Error::PlatformFailure(inner) => SecretError::Unavailable(inner.to_string()),
        keyring::Error::TooLong(attr, max) => {
            SecretError::InvalidKey(format!("{attr} exceeds {max} characters"))
        }
        keyring::Error::Invalid(attr, reason) => {
            SecretError::InvalidKey(format!("{attr}: {reason}"))
        }
        other => SecretError::Storage(other.to_string()),
    }
}

fn entry(key: &str) -> Result<keyring::Entry, SecretError> {
    validate_key(key)?;
    keyring::Entry::new(SERVICE, key).map_err(map_error)
}

/// Returns `None` when the key has never been set.
pub fn get(key: &str) -> Result<Option<String>, SecretError> {
    match entry(key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(map_error(err)),
    }
}

pub fn set(key: &str, value: &str) -> Result<(), SecretError> {
    entry(key)?.set_password(value).map_err(map_error)
}

/// Deleting a key that does not exist is not an error.
pub fn delete(key: &str) -> Result<(), SecretError> {
    match entry(key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(map_error(err)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_reasonable_keys() {
        for key in ["ai.anthropic.apiKey", "a", "token:github", "x_y-z.1"] {
            assert_eq!(validate_key(key), Ok(()), "key: {key}");
        }
    }

    #[test]
    fn rejects_bad_keys() {
        let too_long = "k".repeat(MAX_KEY_LEN + 1);
        for key in [
            "",
            "has space",
            "slash/key",
            "emoji\u{1F511}",
            "new\nline",
            too_long.as_str(),
        ] {
            assert!(
                matches!(validate_key(key), Err(SecretError::InvalidKey(_))),
                "key: {key:?}"
            );
        }
    }

    #[test]
    fn invalid_key_never_reaches_the_keychain() {
        assert!(matches!(get(""), Err(SecretError::InvalidKey(_))));
        assert!(matches!(
            set("bad key", "v"),
            Err(SecretError::InvalidKey(_))
        ));
        assert!(matches!(delete("bad/key"), Err(SecretError::InvalidKey(_))));
    }

    #[test]
    fn errors_serialise_with_stable_kind() {
        let json = serde_json::to_string(&SecretError::Unavailable("locked".into())).expect("json");
        assert_eq!(json, r#"{"kind":"unavailable","message":"locked"}"#);
    }

    /// Touches the real OS keychain, so it is opt-in: `cargo test -- --ignored`.
    #[test]
    #[ignore = "uses the real OS keychain"]
    fn keychain_round_trip() {
        let key = "test.roundtrip";
        delete(key).expect("initial delete");
        assert_eq!(get(key), Ok(None));
        set(key, "s3cret").expect("set");
        assert_eq!(get(key), Ok(Some("s3cret".to_owned())));
        set(key, "rotated").expect("overwrite");
        assert_eq!(get(key), Ok(Some("rotated".to_owned())));
        delete(key).expect("delete");
        assert_eq!(get(key), Ok(None));
        delete(key).expect("idempotent delete");
    }
}
