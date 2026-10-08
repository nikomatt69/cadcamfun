//! iOS shell of the CADCAM FUN companion.
//!
//! The webview never talks to the desktop itself: a webview `fetch` cannot pin a self-signed certificate. Every call goes
//! through [`companion_request`] / [`companion_stream`], which use the certificate-pinned client of `cadcamfun-companion-net`.
//! The pairing (token + fingerprint) is stored through [`secret_get`] / [`secret_set`] in the Keychain.

use cadcamfun_companion_net as net;
use serde::Serialize;
use tauri::ipc::Channel;

/// Events of a streamed response, in order: one `head`, any number of `chunk`s, then `end` (or `error`).
#[derive(Serialize, Clone)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
enum StreamEvent {
    Head(net::Head),
    Chunk(Vec<u8>),
    End,
}

#[tauri::command]
async fn companion_request(
    fingerprint: String,
    request: net::Request,
) -> Result<net::Response, net::NetError> {
    net::request(&fingerprint, &request).await
}

#[tauri::command]
async fn companion_stream(
    fingerprint: String,
    request: net::Request,
    on_event: Channel<StreamEvent>,
) -> Result<(), net::NetError> {
    net::stream(
        &fingerprint,
        &request,
        |head| {
            let _ = on_event.send(StreamEvent::Head(head));
        },
        |chunk| {
            let _ = on_event.send(StreamEvent::Chunk(chunk.to_vec()));
        },
    )
    .await?;
    let _ = on_event.send(StreamEvent::End);
    Ok(())
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
mod keychain {
    const SERVICE: &str = "com.cadcamfun.companion";

    fn entry(key: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(SERVICE, key).map_err(|e| e.to_string())
    }

    pub fn get(key: &str) -> Result<Option<String>, String> {
        match entry(key)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn set(key: &str, value: &str) -> Result<(), String> {
        entry(key)?.set_password(value).map_err(|e| e.to_string())
    }

    pub fn delete(key: &str) -> Result<(), String> {
        match entry(key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

// Off Apple platforms (a desktop `cargo check`) there is no Keychain; the commands exist so the app links, and refuse.
#[cfg(not(any(target_os = "ios", target_os = "macos")))]
mod keychain {
    const UNAVAILABLE: &str = "secure storage is only available on Apple platforms";
    pub fn get(_: &str) -> Result<Option<String>, String> {
        Err(UNAVAILABLE.into())
    }
    pub fn set(_: &str, _: &str) -> Result<(), String> {
        Err(UNAVAILABLE.into())
    }
    pub fn delete(_: &str) -> Result<(), String> {
        Err(UNAVAILABLE.into())
    }
}

#[tauri::command]
fn secret_get(key: String) -> Result<Option<String>, String> {
    keychain::get(&key)
}

#[tauri::command]
fn secret_set(key: String, value: String) -> Result<(), String> {
    keychain::set(&key, &value)
}

#[tauri::command]
fn secret_delete(key: String) -> Result<(), String> {
    keychain::delete(&key)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().invoke_handler(tauri::generate_handler![
        companion_request,
        companion_stream,
        secret_get,
        secret_set,
        secret_delete
    ]);
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init());
    builder
        .run(tauri::generate_context!())
        .expect("error while running the CADCAM FUN companion");
}
