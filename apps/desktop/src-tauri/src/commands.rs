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

use crate::opened_files::{OpenedFileError, OpenedFiles};
use crate::secrets::{self, SecretError};
use crate::sidecar::{SidecarEndpoint, SidecarError, SidecarHandle, READY_TIMEOUT};
use crate::tray;
use crate::updater;
use crate::viewport_geometry::{self, ViewportPreparation};

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
    #[error("invalid viewport preparation request: {0}")]
    Viewport(String),
    #[error("native viewport preparation is busy")]
    ViewportBusy,
    #[error(transparent)]
    Update(#[from] updater::UpdateError),
}

impl From<OpenedFileError> for CommandError {
    fn from(err: OpenedFileError) -> Self {
        match err {
            OpenedFileError::Io(message) => Self::Io(message),
            other => Self::InvalidPath(other.to_string()),
        }
    }
}

impl From<SidecarError> for CommandError {
    fn from(err: SidecarError) -> Self {
        Self::Sidecar(err)
    }
}

/// Waits long enough to cover one restart (two ready timeouts) plus slack.
const ENDPOINT_WAIT: Duration = Duration::from_secs(READY_TIMEOUT.as_secs() * 2 + 5);

/// Raw CGE1 in, raw CEL1 out: no large JSON arrays across the webview seam.
#[tauri::command]
pub async fn prepare_viewport_edges(
    request: tauri::ipc::Request<'_>,
    jobs: State<'_, ViewportPreparation>,
) -> Result<tauri::ipc::Response, CommandError> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) if bytes.len() <= viewport_geometry::MAX_INPUT_BYTES => {
            bytes
        }
        _ => {
            return Err(CommandError::Viewport(
                "expected a bounded raw CGE1 body".into(),
            ))
        }
    };
    let permit = jobs.try_admit().ok_or(CommandError::ViewportBusy)?;
    let owned = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        viewport_geometry::prepare_edges(&owned)
            .map(tauri::ipc::Response::new)
            .map_err(|error| CommandError::Viewport(error.to_string()))
    })
    .await
    .map_err(|error| CommandError::Viewport(error.to_string()))?
}

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
pub async fn open_path(app: AppHandle, path: String) -> Result<(), CommandError> {
    let roots = open_roots(&app);
    let validated = tauri::async_runtime::spawn_blocking(move || validate_open_path(&path, &roots))
        .await
        .map_err(|e| CommandError::Io(e.to_string()))??;
    app.opener()
        .open_path(validated.to_string_lossy(), None::<&str>)
        .map_err(|e| CommandError::Io(e.to_string()))
}

#[tauri::command]
pub async fn secret_get(key: String) -> Result<Option<String>, SecretError> {
    tauri::async_runtime::spawn_blocking(move || secrets::get(&key))
        .await
        .map_err(|e| SecretError::Storage(e.to_string()))?
}

#[tauri::command]
pub async fn secret_set(key: String, value: String) -> Result<(), SecretError> {
    tauri::async_runtime::spawn_blocking(move || secrets::set(&key, &value))
        .await
        .map_err(|e| SecretError::Storage(e.to_string()))?
}

#[tauri::command]
pub async fn secret_delete(key: String) -> Result<(), SecretError> {
    tauri::async_runtime::spawn_blocking(move || secrets::delete(&key))
        .await
        .map_err(|e| SecretError::Storage(e.to_string()))?
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

/// The largest export the webview may hand over in one call.
const MAX_SAVE_BYTES: usize = 256 * 1024 * 1024;
/// Request header that carries the suggested file name, percent-encoded (a header is ASCII, a file name is not).
const FILE_NAME_HEADER: &str = "x-file-name";

/// Decodes `%XX` escapes; `None` when an escape is malformed or the result is not UTF-8.
fn percent_decode(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = text.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// A suggestion for the dialog: only the last component, never a directory, falling back to `export`.
fn suggested_file_name(header: Option<&str>) -> String {
    header
        .and_then(percent_decode)
        .and_then(|name| {
            name.rsplit(['/', '\\'])
                .next()
                .map(str::trim)
                .filter(|n| !n.is_empty() && *n != "." && *n != "..")
                .map(str::to_owned)
        })
        .unwrap_or_else(|| "export".to_owned())
}

/// Writes `bytes` next to `target` and renames it into place, so a crash or a full disk never leaves a half-written file
/// where a good one was.
fn write_atomic(target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let dir = target
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let mut file = tempfile::NamedTempFile::new_in(dir)?;
    file.write_all(bytes)?;
    file.as_file().sync_all()?;
    file.persist(target).map_err(|error| error.error)?;
    Ok(())
}

/// Asks where to save and writes the request body (raw bytes: G-code, STEP, a PDF), returning the chosen path, or `None` when
/// the user cancels. The suggested name travels in the `x-file-name` header, percent-encoded.
#[tauri::command]
pub async fn save_file(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<Option<String>, CommandError> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) if bytes.len() <= MAX_SAVE_BYTES => bytes.clone(),
        _ => {
            return Err(CommandError::InvalidPath(
                "expected a bounded raw body".to_owned(),
            ))
        }
    };
    let default_name = suggested_file_name(
        request
            .headers()
            .get(FILE_NAME_HEADER)
            .and_then(|value| value.to_str().ok()),
    );
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
    let chosen_path = into_path(chosen)?;
    let path = tauri::async_runtime::spawn_blocking(move || validate_save_path(&chosen_path))
        .await
        .map_err(|e| CommandError::Io(e.to_string()))??;
    let target = path.clone();
    tauri::async_runtime::spawn_blocking(move || write_atomic(&target, &bytes))
        .await
        .map_err(|e| CommandError::Io(e.to_string()))?
        .map_err(|e| CommandError::Io(e.to_string()))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Paths the operating system delivered while the webview was not listening yet (a double-click that started the app).
#[tauri::command]
pub fn take_opened_files(opened: State<'_, OpenedFiles>) -> Vec<String> {
    opened.take()
}

/// Raw contents of a file the operating system delivered; any other path is refused.
#[tauri::command]
pub async fn read_opened_file(
    path: String,
    opened: State<'_, OpenedFiles>,
) -> Result<tauri::ipc::Response, CommandError> {
    let opened = opened.inner().clone();
    tauri::async_runtime::spawn_blocking(move || opened.read(&path))
        .await
        .map_err(|e| CommandError::Io(e.to_string()))?
        .map(tauri::ipc::Response::new)
        .map_err(CommandError::from)
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

/// Restarts into the installed update. The webview calls it after it wrote its unsaved work.
#[tauri::command]
pub async fn restart_app(app: AppHandle) -> Result<(), CommandError> {
    updater::restart(app).await;
    Ok(())
}

/// Opens the release notes page in the browser.
#[tauri::command]
pub fn open_release_notes(app: AppHandle) -> Result<(), CommandError> {
    updater::open_release_notes(&app);
    Ok(())
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
        assert_eq!(
            serde_json::to_string(&CommandError::ViewportBusy).expect("busy error"),
            r#"{"kind":"viewport_busy"}"#
        );
        assert_eq!(
            serde_json::to_string(&CommandError::Viewport("invalid".into()))
                .expect("viewport error"),
            r#"{"kind":"viewport","message":"invalid"}"#
        );
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
    fn percent_decoding_handles_utf8_and_rejects_bad_escapes() {
        assert_eq!(
            percent_decode("part%20one.nc").as_deref(),
            Some("part one.nc")
        );
        assert_eq!(
            percent_decode("caf%C3%A9.step").as_deref(),
            Some("café.step")
        );
        assert_eq!(percent_decode("plain").as_deref(), Some("plain"));
        assert_eq!(percent_decode("bad%2"), None);
        assert_eq!(percent_decode("bad%zz"), None);
        assert_eq!(percent_decode("%FF"), None);
    }

    #[test]
    fn the_suggested_name_is_one_component() {
        assert_eq!(suggested_file_name(Some("part%20one.nc")), "part one.nc");
        assert_eq!(
            suggested_file_name(Some("..%2F..%2Fetc%2Fpasswd")),
            "passwd"
        );
        assert_eq!(suggested_file_name(Some("a%5Cb.nc")), "b.nc");
        for header in [None, Some(""), Some(".."), Some("%2F"), Some("bad%2")] {
            assert_eq!(suggested_file_name(header), "export", "header: {header:?}");
        }
    }

    #[test]
    fn an_atomic_write_replaces_the_whole_file_and_leaves_no_temp() {
        let scratch = Scratch::new("atomic");
        let target = scratch.0.join("out.nc");
        fs::write(&target, "old contents that are longer").expect("seed");
        write_atomic(&target, b"G0 X1").expect("write");
        assert_eq!(fs::read(&target).expect("read"), b"G0 X1");
        let leftovers: Vec<_> = fs::read_dir(&scratch.0)
            .expect("dir")
            .filter_map(Result::ok)
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(leftovers, vec!["out.nc"]);
    }

    #[test]
    fn a_failed_atomic_write_keeps_the_old_file_and_cleans_up() {
        let scratch = Scratch::new("atomic-fail");
        let target = scratch.0.join("out.nc");
        fs::write(&target, "kept").expect("seed");
        // The directory of the target does not exist, so the temp file cannot be created.
        let missing = scratch.0.join("nope").join("out.nc");
        assert!(write_atomic(&missing, b"x").is_err());
        assert_eq!(fs::read(&target).expect("read"), b"kept");
        assert_eq!(fs::read_dir(&scratch.0).expect("dir").count(), 1);
    }

    #[test]
    fn simultaneous_atomic_writes_never_mix_contents() {
        let scratch = Scratch::new("atomic-concurrent");
        let target = scratch.0.join("out.nc");
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(4));
        std::thread::scope(|scope| {
            for value in 0..4u8 {
                let barrier = barrier.clone();
                let target = &target;
                scope.spawn(move || {
                    barrier.wait();
                    write_atomic(target, &vec![value; 128 * 1024]).expect("atomic write");
                });
            }
        });
        let bytes = fs::read(&target).expect("read");
        assert_eq!(bytes.len(), 128 * 1024);
        assert!(bytes.iter().all(|value| *value == bytes[0]));
        assert_eq!(fs::read_dir(&scratch.0).expect("dir").count(), 1);
    }

    #[test]
    fn opened_file_errors_map_to_typed_command_errors() {
        assert!(matches!(
            CommandError::from(OpenedFileError::NotDelivered),
            CommandError::InvalidPath(_)
        ));
        assert_eq!(
            CommandError::from(OpenedFileError::Io("x".into())),
            CommandError::Io("x".into())
        );
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
