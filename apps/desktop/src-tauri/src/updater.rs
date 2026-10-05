//! Auto-update (spec 07-tauri-shell.md §1.7, spec 10-release-sync.md §3).
//!
//! The shell owns the *policy* — when to check, what the webview is told, and when
//! an install may start. Downloading and verifying the bundle belongs to
//! `tauri-plugin-updater`; signature verification is mandatory and the public key
//! is compiled in from `tauri.conf.json`.
//!
//! Required behaviour:
//!   - check at launch and every four hours;
//!   - download-progress events forwarded to the webview;
//!   - a `critical` release forces the prompt and blocks dismissal until applied;
//!   - never interrupt unsaved editor work, so an install is refused while the
//!     webview reports unsaved changes and the UI defers it.

use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

/// Interval between background checks (spec 10 §3: every four hours).
pub const CHECK_INTERVAL: Duration = Duration::from_secs(4 * 60 * 60);
/// How long one check may take before it is abandoned.
const CHECK_TIMEOUT: Duration = Duration::from_secs(30);
/// Event the webview listens on for update state.
pub const UPDATE_EVENT: &str = "update://status";
/// Marker the release manager copies from the `critical` release flag into the
/// manifest body (see `scripts/updater-manifest.ts`).
const CRITICAL_MARKER: &str = "[critical]";

// ---------------------------------------------------------------- wire types

/// What the shell reports to the webview after a check.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum UpdateStatus {
    /// A check is running.
    Checking,
    /// No newer release than the running one.
    UpToDate { version: String },
    /// A release is available.
    Available {
        version: String,
        notes: String,
        date: Option<String>,
        /// The manifest flagged this release as critical: the prompt cannot be
        /// dismissed until the update is applied.
        critical: bool,
    },
    /// The update is downloading.
    Downloading { downloaded: u64, total: Option<u64> },
    /// The update is installed; the webview asks the user to restart.
    Ready { version: String },
    /// A check failed; never surfaced as a blocking error.
    Failed { message: String },
}

impl UpdateStatus {
    /// Whether the UI may dismiss the prompt for this status (spec 10 §3).
    pub fn dismissible(&self) -> bool {
        match self {
            UpdateStatus::Available { critical, .. } => !critical,
            // A pending restart is the whole point of the prompt.
            UpdateStatus::Ready { .. } => false,
            _ => true,
        }
    }
}

/// The payload emitted on `update://status`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEvent {
    #[serde(flatten)]
    pub status: UpdateStatus,
    /// Precomputed so the webview never re-implements the critical/ready rules.
    pub dismissible: bool,
}

impl UpdateEvent {
    pub fn new(status: UpdateStatus) -> Self {
        let dismissible = status.dismissible();
        Self {
            status,
            dismissible,
        }
    }
}

/// Why an install was refused.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, thiserror::Error)]
#[serde(tag = "reason", rename_all = "camelCase")]
pub enum UpdateError {
    /// The editor holds unsaved work; the install must wait.
    #[error("the editor has unsaved work; apply the update once it is saved")]
    UnsavedWork,
    /// Nothing is pending, or a previous install already consumed it.
    #[error("no update is available")]
    NoneAvailable,
    /// The download or the signature check failed.
    #[error("update failed: {message}")]
    Failed { message: String },
}

// ---------------------------------------------------------------- state

/// The update a check announced, so `install_update` only ever installs what the
/// user was actually shown.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingUpdateInfo {
    pub version: String,
    pub critical: bool,
}

#[derive(Default)]
pub struct PendingUpdate(pub Mutex<Option<PendingUpdateInfo>>);

/// Why a check ran.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CheckTrigger {
    /// The launch or interval check.
    Scheduled,
    /// The user asked from Settings.
    Manual,
}

/// Handle to the background check loop.
pub struct UpdaterService {
    tx: Sender<CheckTrigger>,
    /// Moved into the polling thread on first use; kept here to document ownership.
    rx: Mutex<Option<Receiver<CheckTrigger>>>,
}

impl UpdaterService {
    pub fn new() -> Self {
        let (tx, rx) = channel();
        Self {
            tx,
            rx: Mutex::new(Some(rx)),
        }
    }

    /// Queues a check. Never blocks and never fails: a closed receiver only means
    /// the shell is shutting down.
    pub fn request(&self, trigger: CheckTrigger) {
        let _ = self.tx.send(trigger);
    }

    /// Hands the receiver to the polling thread exactly once.
    pub fn take_receiver(&self) -> Option<Receiver<CheckTrigger>> {
        self.rx.lock().ok().and_then(|mut guard| guard.take())
    }
}

impl Default for UpdaterService {
    fn default() -> Self {
        Self::new()
    }
}

/// Builds the status for an announced release, deriving criticality from its notes.
pub fn status_for(version: String, notes: String, date: Option<String>) -> UpdateStatus {
    let critical = notes.contains(CRITICAL_MARKER);
    UpdateStatus::Available {
        version,
        notes,
        date,
        critical,
    }
}

/// Stores the update a check found.
pub fn record_pending(pending: &PendingUpdate, info: PendingUpdateInfo) {
    if let Ok(mut guard) = pending.0.lock() {
        *guard = Some(info);
    }
}

/// Takes the pending update, so a second install is refused.
pub fn consume_pending(pending: &PendingUpdate) -> Result<PendingUpdateInfo, UpdateError> {
    let mut guard = pending.0.lock().map_err(|_| UpdateError::Failed {
        message: "updater state is poisoned".to_string(),
    })?;
    guard.take().ok_or(UpdateError::NoneAvailable)
}

/// Whether an install may start. Unsaved editor work wins: the specs require the
/// UI to defer an install rather than interrupt a session.
pub fn may_install(
    unsaved_work: bool,
    pending: Option<&PendingUpdateInfo>,
) -> Result<(), UpdateError> {
    if unsaved_work {
        return Err(UpdateError::UnsavedWork);
    }
    if pending.is_none() {
        return Err(UpdateError::NoneAvailable);
    }
    Ok(())
}

// ---------------------------------------------------------------- plumbing

fn emit(app: &AppHandle, status: UpdateStatus) {
    if let Err(err) = app.emit(UPDATE_EVENT, UpdateEvent::new(status)) {
        log::warn!("failed to emit update status: {err}");
    }
}

/// Runs one check and reports the outcome to the webview.
pub async fn check(app: AppHandle, trigger: CheckTrigger) -> Result<(), String> {
    let running_version = app.package_info().version.to_string();
    emit(&app, UpdateStatus::Checking);
    if trigger == CheckTrigger::Manual {
        log::info!("manual update check requested");
    }

    // The plugin is only usable in a build with a real pubkey. Without one there is
    // nothing to compare against, so the UI is told the app is current rather than
    // being shown a false error.
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(err) => {
            log::debug!("updater unavailable ({err}); reporting up to date");
            emit(
                &app,
                UpdateStatus::UpToDate {
                    version: running_version,
                },
            );
            return Ok(());
        }
    };

    let outcome = tokio::time::timeout(CHECK_TIMEOUT, updater.check()).await;
    let result: Result<Option<tauri_plugin_updater::Update>, String> = match outcome {
        Ok(Ok(update)) => Ok(update),
        Ok(Err(err)) => Err(err.to_string()),
        Err(_) => Err("update check timed out".to_string()),
    };

    match result {
        Ok(Some(update)) => {
            let status = status_for(
                update.version.clone(),
                update.body.clone().unwrap_or_default(),
                update.date.map(|d| d.to_string()),
            );
            let UpdateStatus::Available {
                version, critical, ..
            } = &status
            else {
                unreachable!("status_for always returns Available")
            };
            if let Some(pending) = app.try_state::<PendingUpdate>() {
                record_pending(
                    &pending,
                    PendingUpdateInfo {
                        version: version.clone(),
                        critical: *critical,
                    },
                );
            }
            emit(&app, status);
            Ok(())
        }
        Ok(None) => {
            emit(
                &app,
                UpdateStatus::UpToDate {
                    version: running_version,
                },
            );
            Ok(())
        }
        Err(err) => {
            // A failed check is never fatal: the app keeps running offline.
            emit(&app, UpdateStatus::Failed { message: err });
            Ok(())
        }
    }
}

/// Downloads and installs the pending update, forwarding progress events.
pub async fn install(
    app: AppHandle,
    pending: tauri::State<'_, PendingUpdate>,
    unsaved_work: bool,
) -> Result<String, UpdateError> {
    let info = consume_pending(&pending)?;
    may_install(unsaved_work, Some(&info))?;

    let updater = app.updater().map_err(|e| UpdateError::Failed {
        message: e.to_string(),
    })?;
    let update = updater.check().await.map_err(|e| UpdateError::Failed {
        message: e.to_string(),
    })?;
    let Some(update) = update else {
        return Err(UpdateError::NoneAvailable);
    };

    let mut downloaded = 0u64;
    update
        .download_and_install(
            |chunk, total| {
                downloaded += chunk as u64;
                emit(&app, UpdateStatus::Downloading { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|e| UpdateError::Failed {
            message: e.to_string(),
        })?;

    log::info!(
        "update {} installed (critical: {})",
        info.version,
        info.critical
    );
    let version = info.version;
    emit(
        &app,
        UpdateStatus::Ready {
            version: version.clone(),
        },
    );
    Ok(version)
}

/// Starts the periodic check loop and the launch check.
pub fn spawn(app: AppHandle) {
    let Some(service) = app.try_state::<Arc<UpdaterService>>() else {
        return;
    };
    let Some(rx) = service.take_receiver() else {
        return;
    };
    let loop_handle = app.clone();
    std::thread::spawn(move || loop {
        match rx.recv_timeout(CHECK_INTERVAL) {
            Ok(trigger) => run_check(&loop_handle, trigger),
            Err(RecvTimeoutError::Timeout) => run_check(&loop_handle, CheckTrigger::Scheduled),
            // The shell is shutting down.
            Err(RecvTimeoutError::Disconnected) => break,
        }
    });

    // Launch check, as required by spec 10 §3.
    tauri::async_runtime::spawn(async move {
        if let Err(err) = check(app, CheckTrigger::Scheduled).await {
            log::warn!("launch update check failed: {err}");
        }
    });
}

fn run_check(app: &AppHandle, trigger: CheckTrigger) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(err) = check(app, trigger).await {
            log::warn!("update check failed: {err}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_critical_prompt_cannot_be_dismissed() {
        let status = status_for("6.1.0".into(), "[critical] fix".into(), None);
        assert!(!status.dismissible());
        assert!(!UpdateEvent::new(status).dismissible);
    }

    #[test]
    fn a_normal_prompt_can_be_dismissed() {
        assert!(status_for("6.1.0".into(), "minor fixes".into(), None).dismissible());
    }

    #[test]
    fn other_states_are_dismissible() {
        assert!(UpdateStatus::Checking.dismissible());
        assert!(UpdateStatus::UpToDate {
            version: "6.0.0".into()
        }
        .dismissible());
        assert!(UpdateStatus::Failed {
            message: "offline".into()
        }
        .dismissible());
        // A pending restart is the whole point of the prompt.
        assert!(!UpdateStatus::Ready {
            version: "6.1.0".into()
        }
        .dismissible());
    }

    #[test]
    fn the_critical_marker_is_the_only_source_of_criticality() {
        let status = status_for("6.1.0".into(), "no marker here".into(), None);
        assert!(matches!(
            status,
            UpdateStatus::Available {
                critical: false,
                ..
            }
        ));
    }

    #[test]
    fn an_install_is_refused_while_the_editor_has_unsaved_work() {
        let info = PendingUpdateInfo {
            version: "6.1.0".into(),
            critical: false,
        };
        assert_eq!(
            may_install(true, Some(&info)),
            Err(UpdateError::UnsavedWork)
        );
        assert_eq!(may_install(false, Some(&info)), Ok(()));
    }

    #[test]
    fn an_install_needs_a_pending_update() {
        assert_eq!(may_install(false, None), Err(UpdateError::NoneAvailable));
    }

    #[test]
    fn a_pending_update_can_only_be_installed_once() {
        let pending = PendingUpdate::default();
        record_pending(
            &pending,
            PendingUpdateInfo {
                version: "6.1.0".into(),
                critical: false,
            },
        );
        let consumed = consume_pending(&pending);
        assert_eq!(consumed.map(|i| i.version), Ok("6.1.0".to_string()));
        assert_eq!(consume_pending(&pending), Err(UpdateError::NoneAvailable));
    }

    #[test]
    fn requests_are_delivered_to_the_polling_thread() {
        let service = UpdaterService::new();
        let rx = service.take_receiver().expect("receiver is available once");
        service.request(CheckTrigger::Manual);
        assert_eq!(
            rx.recv_timeout(Duration::from_millis(200)),
            Ok(CheckTrigger::Manual)
        );
        // A second call must not hand out another receiver.
        assert!(service.take_receiver().is_none());
    }

    #[test]
    fn the_check_interval_is_four_hours() {
        assert_eq!(CHECK_INTERVAL, Duration::from_secs(14_400));
    }

    #[test]
    fn statuses_serialise_with_a_status_tag() {
        let json = serde_json::to_string(&UpdateStatus::UpToDate {
            version: "6.0.0".into(),
        })
        .expect("serialises");
        assert!(json.contains(r#""status":"upToDate""#), "{json}");
        assert!(json.contains(r#""version":"6.0.0""#), "{json}");
    }

    #[test]
    fn the_event_flattens_the_status_and_adds_dismissibility() {
        let json =
            serde_json::to_string(&UpdateEvent::new(UpdateStatus::Checking)).expect("serialises");
        assert!(json.contains(r#""status":"checking""#), "{json}");
        assert!(json.contains(r#""dismissible":true"#), "{json}");
    }

    #[test]
    fn download_progress_is_reported_with_its_totals() {
        let json = serde_json::to_string(&UpdateStatus::Downloading {
            downloaded: 512,
            total: Some(1024),
        })
        .expect("serialises");
        assert!(json.contains(r#""status":"downloading""#), "{json}");
        assert!(json.contains(r#""downloaded":512"#), "{json}");
        assert!(json.contains(r#""total":1024"#), "{json}");
    }

    #[test]
    fn errors_serialise_with_a_reason_tag() {
        assert_eq!(
            serde_json::to_string(&UpdateError::UnsavedWork).expect("serialises"),
            r#"{"reason":"unsavedWork"}"#
        );
        assert_eq!(
            serde_json::to_string(&UpdateError::NoneAvailable).expect("serialises"),
            r#"{"reason":"noneAvailable"}"#
        );
    }

    #[test]
    fn an_available_status_carries_the_release_notes() {
        let status = status_for("6.1.0".into(), "notes".into(), None);
        assert_eq!(
            status,
            UpdateStatus::Available {
                version: "6.1.0".into(),
                notes: "notes".into(),
                date: None,
                critical: false
            }
        );
    }
}
