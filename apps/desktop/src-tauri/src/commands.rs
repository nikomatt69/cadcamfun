//! `#[tauri::command]`s exposed to the webview. Every error is a typed, serialisable
//! value; no command panics. Commands are opt-in per capability (see `build.rs`).

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use thiserror::Error;
use tokio::sync::oneshot;

use crate::secrets::{self, SecretError};
use crate::sidecar::{SidecarEndpoint, SidecarError, SidecarHandle, READY_TIMEOUT};
use crate::tray;
use crate::updater;

/// Extensions that would execute code if "opened" by the OS shell.
const EXECUTABLE_EXTENSIONS: &[&str] = &[
    "app", "bat", "cmd", "com", "command", "dmg", "exe", "jar", "msi", "pkg", "ps1", "scr", "sh",
    "vbs",
];

#[derive(Debug, Clone, PartialEq, Eq, Error, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "snake_case")]
pub enum CommandError {
    #[error("{0}")]
    Sidecar(SidecarError),
    #[error("invalid path: {0}")]
    InvalidPath(String),
    #[error("i/o error: {0}")]
    Io(String),
    #[error("dialog error: {0}")]
    Dialog(String),
    #[error("path resolution failed: {0}")]
    Path(String),
    #[error(transparent)]
    Update(#[from] updater::UpdateError),
}

impl From<SidecarError> for CommandError {
    fn from(err: SidecarError) -> Self {
        Self::Sidecar(err)
    }
}

/// Waits long enough to cover one restart (two ready timeouts) plus slack.
const ENDPOINT_WAIT: Duration = Duration::from_secs(READY_TIMEOUT.as_secs() * 2 + 5);

#[tauri::command]
pub async fn get_sidecar_endpoint(
    sidecar: State<'_, Arc<SidecarHandle>>,
) -> Result<SidecarEndpoint, CommandError> {
    Ok(sidecar.endpoint(ENDPOINT_WAIT).await?)
}

#[tauri::command]
pub fn get_logs_dir(app: AppHandle) -> Result<String, CommandError> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|e| CommandError::Path(e.to_string()))?;
    Ok(dir.to_string_lossy().into_owned())
}

/// Roots the webview may reveal or open files from.
fn open_roots(app: &AppHandle) -> Vec<PathBuf> {
    let resolver = app.path();
    [
        resolver.app_data_dir(),
        resolver.app_log_dir(),
        resolver.document_dir(),
        resolver.download_dir(),
        resolver.desktop_dir(),
    ]
    .into_iter()
    .filter_map(Result::ok)
    .collect()
}

/// Accepts only existing absolute paths under `roots` that are not executable types.
/// Both sides are canonicalised so `..` and symlinks cannot escape the roots.
pub fn validate_open_path(path: &str, roots: &[PathBuf]) -> Result<PathBuf, CommandError> {
    let raw = Path::new(path);
    if !raw.is_absolute() {
        return Err(CommandError::InvalidPath(
            "path must be absolute".to_owned(),
        ));
    }
    let canonical = raw
        .canonicalize()
        .map_err(|e| CommandError::InvalidPath(format!("cannot resolve path: {e}")))?;
    let extension = canonical
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    if EXECUTABLE_EXTENSIONS.contains(&extension.as_str()) {
        return Err(CommandError::InvalidPath(
            "executable file types cannot be opened".to_owned(),
        ));
    }
    let allowed = roots
        .iter()
        .filter_map(|root| root.canonicalize().ok())
        .any(|root| canonical.starts_with(root));
    if allowed {
        Ok(canonical)
    } else {
        Err(CommandError::InvalidPath(
            "path is outside the allowed folders".to_owned(),
        ))
    }
}

#[tauri::command]
pub fn open_path(app: AppHandle, path: String) -> Result<(), CommandError> {
    let validated = validate_open_path(&path, &open_roots(&app))?;
    app.opener()
        .open_path(validated.to_string_lossy(), None::<&str>)
        .map_err(|e| CommandError::Io(e.to_string()))
}

#[tauri::command]
pub async fn secret_get(key: String) -> Result<Option<String>, SecretError> {
    secrets::get(&key)
}

#[tauri::command]
pub async fn secret_set(key: String, value: String) -> Result<(), SecretError> {
    secrets::set(&key, &value)
}

#[tauri::command]
pub async fn secret_delete(key: String) -> Result<(), SecretError> {
    secrets::delete(&key)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

fn apply_filters<R: tauri::Runtime>(
    mut builder: tauri_plugin_dialog::FileDialogBuilder<R>,
    filters: &[FileFilter],
) -> tauri_plugin_dialog::FileDialogBuilder<R> {
    for filter in filters {
        let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
        builder = builder.add_filter(&filter.name, &extensions);
    }
    builder
}

fn into_path(path: tauri_plugin_dialog::FilePath) -> Result<PathBuf, CommandError> {
    path.into_path()
        .map_err(|e| CommandError::Dialog(e.to_string()))
}

/// Returns the chosen path, or `None` when the user cancels.
#[tauri::command]
pub async fn pick_file(
    app: AppHandle,
    filters: Vec<FileFilter>,
) -> Result<Option<String>, CommandError> {
    let (tx, rx) = oneshot::channel();
    apply_filters(app.dialog().file(), &filters).pick_file(move |picked| {
        let _ = tx.send(picked);
    });
    let picked = rx
        .await
        .map_err(|_| CommandError::Dialog("dialog closed unexpectedly".to_owned()))?;
    picked
        .map(|p| into_path(p).map(|p| p.to_string_lossy().into_owned()))
        .transpose()
}

/// Final component of a chosen path, or `None` when the text itself already rules out a
/// file (empty, `.`, `..`, or a trailing separator). Works on the raw text because
/// `Path::file_name` normalises all of those away: it reports `tmp` for both `/tmp/` and
/// `/tmp/.`. A bare `/tmp` cannot be told apart from a file called `tmp` by text alone;
/// that case is settled by [`validate_save_path`] looking at the filesystem.
fn target_file_name(path: &Path) -> Option<String> {
    let raw = path.as_os_str().to_string_lossy();
    if raw.ends_with(std::path::MAIN_SEPARATOR) || raw.ends_with('/') {
        return None;
    }
    let name = raw.rsplit(std::path::MAIN_SEPARATOR).next()?;
    (!name.is_empty() && name != "." && name != "..").then(|| name.to_owned())
}

/// Validates a path returned by the save dialog before writing to it. A dialog can be
/// pointed at anything and a write must not silently produce an executable or clobber a
/// directory.
pub fn validate_save_path(path: &Path) -> Result<PathBuf, CommandError> {
    let file_name = target_file_name(path)
        .ok_or_else(|| CommandError::InvalidPath("the chosen path is not a file".to_owned()))?;
    if path.is_dir() {
        return Err(CommandError::InvalidPath(format!(
            "{file_name} is a directory"
        )));
    }
    let extension = path
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    if EXECUTABLE_EXTENSIONS.contains(&extension.as_str()) {
        return Err(CommandError::InvalidPath(format!(
            "refusing to write an executable file ({file_name})"
        )));
    }
    Ok(path.to_path_buf())
}

/// Asks where to save, writes `contents` (UTF-8 text such as G-code), and returns the
/// chosen path, or `None` when the user cancels.
#[tauri::command]
pub async fn save_file(
    app: AppHandle,
    default_name: String,
    contents: String,
) -> Result<Option<String>, CommandError> {
    let (tx, rx) = oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(&default_name)
        .save_file(move |chosen| {
            let _ = tx.send(chosen);
        });
    let chosen = rx
        .await
        .map_err(|_| CommandError::Dialog("dialog closed unexpectedly".to_owned()))?;
    let Some(chosen) = chosen else {
        return Ok(None);
    };
    let path = validate_save_path(&into_path(chosen)?)?;
    let target = path.clone();
    tauri::async_runtime::spawn_blocking(move || std::fs::write(&target, contents))
        .await
        .map_err(|e| CommandError::Io(e.to_string()))?
        .map_err(|e| CommandError::Io(e.to_string()))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn set_recent_projects(
    app: AppHandle,
    projects: Vec<tray::RecentProject>,
) -> Result<(), CommandError> {
    tray::set_recent_projects(&app, &projects).map_err(|e| CommandError::Io(e.to_string()))
}

#[tauri::command]
pub fn check_for_updates(
    state: tauri::State<'_, updater::UpdaterService>,
) -> Result<(), CommandError> {
    // Never fails the caller: the UI learns the outcome from the `update://status`
    // event, and a failed check must not surface as a blocking error.
    state.request(updater::CheckTrigger::Manual);
    Ok(())
}

/// Downloads and installs the update a check found. `unsavedWork` is what keeps an
/// install from interrupting an open editor (spec 10 §3).
#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    pending: tauri::State<'_, updater::PendingUpdate>,
    unsaved_work: Option<bool>,
) -> Result<String, CommandError> {
    updater::install(app, pending, unsaved_work.unwrap_or(false))
        .await
        .map_err(CommandError::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("cadcamfun-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).expect("scratch dir");
            Self(dir)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn allows_files_inside_a_root() {
        let scratch = Scratch::new("open-ok");
        let file = scratch.0.join("part.nc");
        fs::write(&file, "G0").expect("write");
        let validated = validate_open_path(
            file.to_str().expect("utf8"),
            std::slice::from_ref(&scratch.0),
        )
        .expect("allowed");
        assert!(validated.ends_with("part.nc"));
    }

    #[test]
    fn rejects_relative_missing_outside_and_executable_paths() {
        let scratch = Scratch::new("open-bad");
        let other = Scratch::new("open-other");
        let roots = [scratch.0.clone()];
        let outside = other.0.join("a.txt");
        fs::write(&outside, "x").expect("write");
        let script = scratch.0.join("run.sh");
        fs::write(&script, "#!/bin/sh").expect("write");

        assert!(validate_open_path("relative/file.txt", &roots).is_err());
        assert!(validate_open_path(
            scratch.0.join("missing.txt").to_str().expect("utf8"),
            &roots
        )
        .is_err());
        assert!(validate_open_path(outside.to_str().expect("utf8"), &roots).is_err());
        assert!(validate_open_path(script.to_str().expect("utf8"), &roots).is_err());
    }

    #[test]
    fn rejects_dot_dot_escape() {
        let scratch = Scratch::new("open-dotdot");
        let other = Scratch::new("open-dotdot-other");
        let secret = other.0.join("s.txt");
        fs::write(&secret, "x").expect("write");
        let sneaky = scratch
            .0
            .join("..")
            .join(other.0.file_name().expect("name"))
            .join("s.txt");
        assert!(validate_open_path(
            sneaky.to_str().expect("utf8"),
            std::slice::from_ref(&scratch.0)
        )
        .is_err());
    }

    #[test]
    fn command_errors_serialise_with_kind() {
        let json = serde_json::to_string(&CommandError::InvalidPath("p".into())).expect("json");
        assert_eq!(json, r#"{"kind":"invalid_path","message":"p"}"#);
    }

    #[test]
    fn save_path_accepts_text_targets() {
        for path in [
            "/tmp/part.nc",
            "/tmp/part.GCODE",
            "/tmp/part",
            "/tmp/part.cadcam",
        ] {
            assert_eq!(
                validate_save_path(Path::new(path)),
                Ok(PathBuf::from(path)),
                "path: {path}"
            );
        }
    }

    #[test]
    fn save_path_rejects_executables_and_directories() {
        let scratch = Scratch::new("save-bad");
        for path in [
            "/tmp/installer.app",
            "/tmp/run.SH",
            "/tmp/hack.exe",
            "/tmp/",
            "/tmp/.",
            "/tmp/..",
            "..",
            ".",
            scratch.0.to_str().expect("utf8"),
        ] {
            assert!(
                matches!(
                    validate_save_path(Path::new(path)),
                    Err(CommandError::InvalidPath(_))
                ),
                "path: {path}"
            );
        }
    }

    #[test]
    fn target_file_name_keeps_the_raw_last_component() {
        assert_eq!(
            target_file_name(Path::new("/tmp/part.nc")).as_deref(),
            Some("part.nc")
        );
        assert_eq!(
            target_file_name(Path::new("part.nc")).as_deref(),
            Some("part.nc")
        );
        for path in ["/tmp/", "/tmp/.", "/tmp/..", "..", ".", ""] {
            assert_eq!(target_file_name(Path::new(path)), None, "path: {path:?}");
        }
    }
}
