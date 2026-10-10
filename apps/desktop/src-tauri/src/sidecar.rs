//! Sidecar lifecycle: spawn, ready-line handshake, restart-once supervision, shutdown.
//!
//! Contract (see `specs/05-api-sidecar.md` section 1): the shell generates a random
//! token, passes it in `CADCAMFUN_TOKEN`, and reads one JSON line
//! `{"event":"ready","port":N}` from the sidecar's stdout. The sidecar exits when its
//! stdin closes, which is how it learns that the shell died.

use std::borrow::Cow;
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use thiserror::Error;
use tokio::sync::{mpsc, watch};
use tokio::time::timeout;

/// File name of the sidecar next to the app executable (`externalBin` minus its folder
/// and target-triple suffix; the Tauri bundler strips the suffix).
const SIDECAR_BIN: &str = "sidecar";
/// How long the sidecar may take to print its ready line.
pub const READY_TIMEOUT: Duration = Duration::from_secs(60);
/// The sidecar is restarted at most this many times after a failure.
pub const MAX_RESTARTS: u32 = 1;
/// Event name the webview listens to for sidecar state changes.
pub const STATUS_EVENT: &str = "sidecar-status";
const REDACTED: &str = "[redacted: line may contain credentials]";
pub const SHUTDOWN_COMMAND: &[u8] = b"{\"event\":\"shutdown\"}\n";
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(2);
const REAP_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_LINE_BYTES: usize = 16 * 1024;
/// Number of random bytes behind [`generate_token`].
pub const TOKEN_LEN: usize = 32;

/// Failure of the per-launch token generator. `getrandom::Error` implements `Display`
/// but deliberately not `std::error::Error`, so this wrapper carries it across the
/// boundary and lets callers convert it into any error type they use.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
#[error("could not read {len} random bytes for the sidecar token: {source}")]
pub struct TokenError {
    pub len: usize,
    #[source]
    pub source: getrandom::Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Error, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "snake_case")]
pub enum SidecarError {
    #[error("failed to spawn the sidecar: {0}")]
    Spawn(String),
    #[error("the sidecar did not become ready within {0} seconds")]
    ReadyTimeout(u64),
    #[error("the sidecar exited before becoming ready: {0}")]
    ExitedEarly(String),
    #[error("the sidecar stopped unexpectedly: {0}")]
    Crashed(String),
    #[error("the sidecar reported an error: {0}")]
    Reported(String),
    #[error("the sidecar crashed and could not be restarted: {0}")]
    Failed(String),
    #[error("the sidecar is shutting down")]
    ShuttingDown,
    #[error("the sidecar could not be stopped: {0}")]
    ShutdownFailed(String),
}

/// Connection details handed to the webview.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarEndpoint {
    pub base_url: String,
    pub token: String,
}

/// Lifecycle state, mirrored to the webview through [`STATUS_EVENT`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum SidecarStatus {
    Starting,
    Ready { port: u16 },
    Restarting,
    Failed { message: String },
}

/// One decoded line of sidecar stdout.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StdoutLine {
    Ready { port: u16 },
    Error { message: String },
    Other,
}

#[derive(Deserialize)]
struct RawLine {
    event: String,
    port: Option<u16>,
    message: Option<String>,
}

/// Decodes a stdout line. Anything that is not a well-formed protocol line (log output,
/// a ready line without a usable port) is [`StdoutLine::Other`].
pub fn parse_stdout_line(line: &str) -> StdoutLine {
    let Ok(raw) = serde_json::from_str::<RawLine>(line.trim()) else {
        return StdoutLine::Other;
    };
    match (raw.event.as_str(), raw.port, raw.message) {
        ("ready", Some(port), _) if port != 0 => StdoutLine::Ready { port },
        ("error", _, message) => StdoutLine::Error {
            message: message.unwrap_or_else(|| "unspecified error".to_owned()),
        },
        _ => StdoutLine::Other,
    }
}

/// Bounded newline framing; oversized lines are discarded through the next newline.
#[derive(Default)]
struct LineBuffer {
    pending: Vec<u8>,
    discarding: bool,
}

impl LineBuffer {
    fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        let mut lines = Vec::new();
        for &byte in chunk {
            if byte == b'\n' {
                if !self.discarding {
                    lines.push(String::from_utf8_lossy(&self.pending).into_owned());
                }
                self.pending.clear();
                self.discarding = false;
            } else if !self.discarding {
                if self.pending.len() == MAX_LINE_BYTES {
                    self.pending.clear();
                    self.discarding = true;
                } else {
                    self.pending.push(byte);
                }
            }
        }
        lines
    }
}

/// 32 random bytes, hex encoded (64 characters). Generated per launch, never persisted.
pub fn generate_token() -> Result<String, TokenError> {
    let mut bytes = [0u8; TOKEN_LEN];
    getrandom::fill(&mut bytes).map_err(|source| TokenError {
        len: TOKEN_LEN,
        source,
    })?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// Replaces lines that may carry credentials. Matching is case-insensitive on `Bearer`,
/// and also on the token itself so a sidecar that echoes its env cannot leak it.
pub fn redact_line<'a>(line: &'a str, token: &str) -> Cow<'a, str> {
    let leaks_token = !token.is_empty() && line.contains(token);
    let lower = line.to_ascii_lowercase();
    if leaks_token
        || [
            "bearer",
            "authorization",
            "api_key",
            "api-key",
            "apikey",
            "password",
            "secret",
            "cadcamfun_token",
        ]
        .iter()
        .any(|marker| lower.contains(marker))
    {
        Cow::Borrowed(REDACTED)
    } else {
        Cow::Borrowed(line)
    }
}

/// Process output decoupled from `tauri_plugin_shell` so the handshake is unit-testable.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProcEvent {
    Stdout(Vec<u8>),
    Stderr(Vec<u8>),
    Error(String),
    Terminated(Option<i32>),
}

fn convert_event(event: CommandEvent) -> Option<ProcEvent> {
    match event {
        CommandEvent::Stdout(bytes) => Some(ProcEvent::Stdout(bytes)),
        CommandEvent::Stderr(bytes) => Some(ProcEvent::Stderr(bytes)),
        CommandEvent::Error(message) => Some(ProcEvent::Error(message)),
        CommandEvent::Terminated(payload) => Some(ProcEvent::Terminated(payload.code)),
        _ => None,
    }
}

fn proc_log_level(is_stderr: bool, line: &str) -> log::Level {
    let structured = serde_json::from_str::<serde_json::Value>(line).ok();
    match structured
        .as_ref()
        .and_then(|record| record.get("level"))
        .and_then(|level| level.as_str())
    {
        Some("TRACE") => log::Level::Trace,
        Some("DEBUG") => log::Level::Debug,
        Some("INFO") => log::Level::Info,
        Some("WARN") | Some("WARNING") => log::Level::Warn,
        Some("ERROR") | Some("FATAL") => log::Level::Error,
        _ if is_stderr => log::Level::Warn,
        _ => log::Level::Info,
    }
}

fn log_proc_line(is_stderr: bool, line: &str, token: &str) {
    let line = line.trim_end();
    if line.is_empty() {
        return;
    }
    let line = redact_line(line, token);
    log::log!(target: "sidecar", proc_log_level(is_stderr, &line), "{line}");
}

/// Reads events until the ready line arrives, the process dies, or `limit` elapses.
/// Other lines are logged (redacted) and skipped.
#[cfg(test)]
async fn wait_for_ready(
    rx: &mut mpsc::Receiver<ProcEvent>,
    limit: Duration,
    token: &str,
) -> Result<u16, SidecarError> {
    wait_for_ready_decoded(rx, limit, token, &mut OutputDecoder::default()).await
}

#[derive(Default)]
struct OutputDecoder {
    stdout: LineBuffer,
    stderr: LineBuffer,
    lines: VecDeque<String>,
}

async fn wait_for_ready_decoded(
    rx: &mut mpsc::Receiver<ProcEvent>,
    limit: Duration,
    token: &str,
    output: &mut OutputDecoder,
) -> Result<u16, SidecarError> {
    let handshake = async {
        loop {
            while let Some(line) = output.lines.pop_front() {
                match parse_stdout_line(&line) {
                    StdoutLine::Ready { port } => return Ok(port),
                    StdoutLine::Error { message } => {
                        return Err(SidecarError::Reported(
                            redact_line(&message, token).into_owned(),
                        ))
                    }
                    StdoutLine::Other => log_proc_line(false, &line, token),
                }
            }
            match rx.recv().await {
                Some(ProcEvent::Stdout(chunk)) => {
                    output.lines.extend(output.stdout.push(&chunk));
                }
                Some(ProcEvent::Stderr(chunk)) => {
                    for line in output.stderr.push(&chunk) {
                        log_proc_line(true, &line, token);
                    }
                }
                Some(ProcEvent::Error(message)) => {
                    return Err(SidecarError::ExitedEarly(
                        redact_line(&message, token).into_owned(),
                    ))
                }
                Some(ProcEvent::Terminated(code)) => {
                    return Err(SidecarError::ExitedEarly(format!("exit code {code:?}")))
                }
                None => return Err(SidecarError::ExitedEarly("output stream closed".to_owned())),
            }
        }
    };
    match timeout(limit, handshake).await {
        Ok(result) => result,
        Err(_) => Err(SidecarError::ReadyTimeout(limit.as_secs())),
    }
}

/// Drains events after the handshake, logging them, until the process terminates.
async fn monitor(
    rx: &mut mpsc::Receiver<ProcEvent>,
    token: &str,
    output: &mut OutputDecoder,
) -> String {
    for line in output.lines.drain(..) {
        log_proc_line(false, &line, token);
    }
    while let Some(event) = rx.recv().await {
        match event {
            ProcEvent::Stdout(chunk) => {
                for line in output.stdout.push(&chunk) {
                    log_proc_line(false, &line, token);
                }
            }
            ProcEvent::Stderr(chunk) => {
                for line in output.stderr.push(&chunk) {
                    log_proc_line(true, &line, token);
                }
            }
            ProcEvent::Error(message) => {
                log::error!(target: "sidecar", "{}", redact_line(&message, token))
            }
            ProcEvent::Terminated(code) => return format!("exit code {code:?}"),
        }
    }
    "output stream closed".to_owned()
}

/// Paths and identity the supervisor needs to (re)spawn the sidecar.
pub struct SidecarConfig {
    pub data_dir: PathBuf,
    pub migrations_dir: PathBuf,
}

/// Shared handle managed by Tauri. Cheap to clone through `Arc`.
pub struct SidecarHandle {
    token: String,
    status_tx: watch::Sender<SidecarStatus>,
    status_rx: watch::Receiver<SidecarStatus>,
    shutting_down: AtomicBool,
    shutdown_tx: watch::Sender<bool>,
    finished_tx: watch::Sender<bool>,
}

impl SidecarHandle {
    pub fn new(token: String) -> Self {
        let (status_tx, status_rx) = watch::channel(SidecarStatus::Starting);
        let (shutdown_tx, _) = watch::channel(false);
        let (finished_tx, _) = watch::channel(false);
        Self {
            token,
            status_tx,
            status_rx,
            shutting_down: AtomicBool::new(false),
            shutdown_tx,
            finished_tx,
        }
    }

    fn set_status(&self, app: Option<&AppHandle>, status: SidecarStatus) {
        let status = match status {
            SidecarStatus::Failed { message } => SidecarStatus::Failed {
                message: redact_line(&message, &self.token).into_owned(),
            },
            status => status,
        };
        // `send_replace` also stores the value when no receiver is currently subscribed.
        self.status_tx.send_replace(status.clone());
        if let Some(app) = app {
            if let Err(err) = app.emit(STATUS_EVENT, status) {
                log::warn!(
                    "failed to emit sidecar status: {}",
                    redact_line(&err.to_string(), &self.token)
                );
            }
        }
    }

    /// Waits (up to `limit`) until the sidecar is ready or has permanently failed.
    pub async fn endpoint(&self, limit: Duration) -> Result<SidecarEndpoint, SidecarError> {
        let mut rx = self.status_rx.clone();
        let wait = async {
            loop {
                if self.is_shutting_down() {
                    return Err(SidecarError::ShuttingDown);
                }
                let current = rx.borrow_and_update().clone();
                match current {
                    SidecarStatus::Ready { port } => {
                        return Ok(SidecarEndpoint {
                            base_url: format!("http://127.0.0.1:{port}"),
                            token: self.token.clone(),
                        })
                    }
                    SidecarStatus::Failed { message } => {
                        return Err(SidecarError::Failed(
                            redact_line(&message, &self.token).into_owned(),
                        ))
                    }
                    SidecarStatus::Starting | SidecarStatus::Restarting => {}
                }
                if self.shutting_down.load(Ordering::SeqCst) || rx.changed().await.is_err() {
                    return Err(SidecarError::ShuttingDown);
                }
            }
        };
        match timeout(limit, wait).await {
            Ok(result) => result,
            Err(_) => Err(SidecarError::ReadyTimeout(limit.as_secs())),
        }
    }

    /// Returns true only for the first exit request.
    pub fn shutdown(&self) -> bool {
        let first = !self.shutting_down.swap(true, Ordering::SeqCst);
        self.shutdown_tx.send_replace(true);
        self.status_tx.send_replace(SidecarStatus::Failed {
            message: "the sidecar is shutting down".into(),
        });
        first
    }

    pub async fn wait_finished(&self) {
        let mut rx = self.finished_tx.subscribe();
        while !*rx.borrow_and_update() {
            if rx.changed().await.is_err() {
                break;
            }
        }
    }

    pub fn is_finished(&self) -> bool {
        *self.finished_tx.borrow()
    }

    fn is_shutting_down(&self) -> bool {
        self.shutting_down.load(Ordering::SeqCst)
    }
}

/// Starts the supervisor task. The first spawn happens immediately; the status moves
/// to `Ready` (or `Failed`) and every change is emitted as [`STATUS_EVENT`].
pub fn start(app: AppHandle, handle: Arc<SidecarHandle>, config: SidecarConfig) {
    tauri::async_runtime::spawn(async move {
        supervise(app, Arc::clone(&handle), config).await;
        handle.finished_tx.send_replace(true);
    });
}

async fn supervise(app: AppHandle, handle: Arc<SidecarHandle>, config: SidecarConfig) {
    let mut restarts = 0;
    loop {
        if handle.is_shutting_down() {
            return;
        }
        let failure = run_once(&app, &handle, &config).await;
        if handle.is_shutting_down() {
            return;
        }
        log::error!(target: "sidecar", "sidecar stopped: {failure}");
        if !matches!(failure, SidecarError::ShutdownFailed(_))
            && restart_after_failure(&handle, &mut restarts).is_some()
        {
            let remaining = MAX_RESTARTS - restarts;
            log::warn!(target: "sidecar", "restarting the sidecar ({remaining} restart(s) left)");
            handle.set_status(Some(&app), SidecarStatus::Restarting);
        } else {
            // Out of budget: the webview gets a permanent failure and no further spawn.
            handle.set_status(
                Some(&app),
                SidecarStatus::Failed {
                    message: failure.to_string(),
                },
            );
            return;
        }
    }
}

/// Consumes one restart from the budget. `None` means the sidecar already crashed
/// [`MAX_RESTARTS`] times and must not be spawned again.
fn take_restart(restarts: &mut u32) -> Option<u32> {
    if *restarts >= MAX_RESTARTS {
        return None;
    }
    *restarts += 1;
    Some(MAX_RESTARTS - *restarts)
}

fn restart_after_failure(handle: &SidecarHandle, restarts: &mut u32) -> Option<u32> {
    if handle.is_shutting_down() {
        None
    } else {
        take_restart(restarts)
    }
}

/// One spawn-to-exit cycle. Always returns the reason the cycle ended.
async fn run_once(
    app: &AppHandle,
    handle: &Arc<SidecarHandle>,
    config: &SidecarConfig,
) -> SidecarError {
    let spawned = app
        .shell()
        .sidecar(SIDECAR_BIN)
        .map(|cmd| {
            cmd.env("CADCAMFUN_TOKEN", &handle.token)
                .env("CADCAMFUN_DATA_DIR", &config.data_dir)
                .env("CADCAMFUN_MIGRATIONS_DIR", &config.migrations_dir)
                .set_raw_out(true)
        })
        .and_then(|cmd| cmd.spawn());
    let (mut raw_rx, child) = match spawned {
        Ok(pair) => pair,
        Err(err) => {
            return SidecarError::Spawn(redact_line(&err.to_string(), &handle.token).into_owned())
        }
    };

    let (tx, mut rx) = mpsc::channel(256);
    let (reaped_tx, mut reaped_rx) = watch::channel(false);
    tauri::async_runtime::spawn(async move {
        while let Some(event) = raw_rx.recv().await {
            if matches!(event, CommandEvent::Terminated(_)) {
                reaped_tx.send_replace(true);
            }
            if let Some(event) = convert_event(event) {
                // Keep draining even if the consumer disappears so the plugin can reap.
                let _ = tx.send(event).await;
            }
        }
    });

    let mut shutdown_rx = handle.shutdown_tx.subscribe();
    let mut output = OutputDecoder::default();
    let cycle = async {
        match wait_for_ready_decoded(&mut rx, READY_TIMEOUT, &handle.token, &mut output).await {
            Ok(port) => {
                log::info!(target: "sidecar", "sidecar ready on port {port}");
                handle.set_status(Some(app), SidecarStatus::Ready { port });
                SidecarError::Crashed(monitor(&mut rx, &handle.token, &mut output).await)
            }
            Err(err) => err,
        }
    };
    let outcome = tokio::select! {
        result = cycle => result,
        _ = async {
            while !*shutdown_rx.borrow_and_update() {
                if shutdown_rx.changed().await.is_err() { break; }
            }
        } => SidecarError::ShuttingDown,
    };

    match stop_child(child, &mut rx, &mut reaped_rx, &handle.token).await {
        Ok(()) => outcome,
        Err(error) => error,
    }
}

trait ChildControl {
    fn write(&mut self, bytes: &[u8]) -> Result<(), String>;
    fn kill(self) -> Result<(), String>;
}

impl ChildControl for CommandChild {
    fn write(&mut self, bytes: &[u8]) -> Result<(), String> {
        CommandChild::write(self, bytes).map_err(|err| err.to_string())
    }

    fn kill(self) -> Result<(), String> {
        CommandChild::kill(self).map_err(|err| err.to_string())
    }
}

async fn stop_child(
    mut child: impl ChildControl,
    rx: &mut mpsc::Receiver<ProcEvent>,
    reaped: &mut watch::Receiver<bool>,
    token: &str,
) -> Result<(), SidecarError> {
    if *reaped.borrow() {
        return Ok(());
    }
    if let Err(err) = child.write(SHUTDOWN_COMMAND) {
        log::warn!(
            "sidecar shutdown write failed: {}",
            redact_line(&err.to_string(), token)
        );
    }
    if timeout(SHUTDOWN_TIMEOUT, wait_reaped(rx, reaped))
        .await
        .is_err()
        || !*reaped.borrow()
    {
        let kill_error = child.kill().err();
        if let Some(err) = &kill_error {
            log::error!(
                "sidecar fallback kill failed: {}",
                redact_line(&err.to_string(), token)
            );
        }
        // A dead plugin event channel must never trap the shell in an infinite wait.
        if timeout(REAP_TIMEOUT, wait_reaped(rx, reaped))
            .await
            .is_err()
            || !*reaped.borrow()
        {
            return Err(SidecarError::ShutdownFailed(
                kill_error
                    .map(|error| redact_line(&error, token).into_owned())
                    .unwrap_or_else(|| "process exit was not confirmed after force-kill".into()),
            ));
        }
    }
    if !*reaped.borrow() {
        return Err(SidecarError::ShutdownFailed(
            "process wait channel closed without confirming exit".into(),
        ));
    }
    Ok(())
}

async fn wait_reaped(rx: &mut mpsc::Receiver<ProcEvent>, reaped: &mut watch::Receiver<bool>) {
    let mut output_open = true;
    while !*reaped.borrow_and_update() {
        tokio::select! {
            event = rx.recv(), if output_open => { output_open = event.is_some(); },
            changed = reaped.changed() => { if changed.is_err() { break; } },
        }
    }
}

/// Resolves the bundled migrations directory. In debug builds the workspace copy is the
/// fallback, because `tauri dev` does not always populate the resource directory.
pub fn resolve_migrations_dir(app: &AppHandle) -> PathBuf {
    let bundled = app
        .path()
        .resource_dir()
        .ok()
        .map(|dir| dir.join("migrations"));
    if let Some(dir) = bundled.as_ref().filter(|dir| dir.is_dir()) {
        return dir.clone();
    }
    #[cfg(debug_assertions)]
    {
        let workspace =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../packages/db/drizzle");
        if workspace.is_dir() {
            return workspace;
        }
    }
    bundled.unwrap_or_else(|| PathBuf::from("migrations"))
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeChild {
        writes: Arc<std::sync::Mutex<Vec<Vec<u8>>>>,
        killed: Arc<AtomicBool>,
        reaped: watch::Sender<bool>,
        exits_on_write: bool,
        write_fails: bool,
    }

    impl ChildControl for FakeChild {
        fn write(&mut self, bytes: &[u8]) -> Result<(), String> {
            self.writes.lock().expect("writes").push(bytes.to_vec());
            if self.exits_on_write {
                self.reaped.send_replace(true);
            }
            if self.write_fails {
                Err("Authorization: Bearer private".into())
            } else {
                Ok(())
            }
        }

        fn kill(self) -> Result<(), String> {
            self.killed.store(true, Ordering::SeqCst);
            self.reaped.send_replace(true);
            Ok(())
        }
    }

    fn fake_child(exits_on_write: bool, write_fails: bool) -> (FakeChild, watch::Receiver<bool>) {
        let (reaped, rx) = watch::channel(false);
        (
            FakeChild {
                writes: Arc::default(),
                killed: Arc::default(),
                reaped,
                exits_on_write,
                write_fails,
            },
            rx,
        )
    }

    #[tokio::test]
    async fn graceful_shutdown_writes_exact_contract_without_kill() {
        let (child, mut reaped) = fake_child(true, false);
        let writes = Arc::clone(&child.writes);
        let killed = Arc::clone(&child.killed);
        let (_tx, mut rx) = mpsc::channel(1);
        stop_child(child, &mut rx, &mut reaped, "tok")
            .await
            .expect("stopped");
        assert_eq!(
            *writes.lock().expect("writes"),
            vec![b"{\"event\":\"shutdown\"}\n".to_vec()]
        );
        assert!(!killed.load(Ordering::SeqCst));
        assert!(*reaped.borrow());
    }

    struct UnresponsiveChild {
        _keep_wait_open: watch::Sender<bool>,
    }

    impl ChildControl for UnresponsiveChild {
        fn write(&mut self, _: &[u8]) -> Result<(), String> {
            Ok(())
        }
        fn kill(self) -> Result<(), String> {
            // A failed kill leaves the process wait channel alive with no exit event.
            std::mem::forget(self);
            Err("kill refused".into())
        }
    }

    #[tokio::test(start_paused = true)]
    async fn failed_kill_and_missing_exit_notification_are_bounded() {
        let (tx, mut rx) = mpsc::channel(1);
        drop(tx);
        let (reaped_tx, mut reaped) = watch::channel(false);
        let child = UnresponsiveChild {
            _keep_wait_open: reaped_tx,
        };
        let started = tokio::time::Instant::now();
        assert!(matches!(
            stop_child(child, &mut rx, &mut reaped, "tok").await,
            Err(SidecarError::ShutdownFailed(_))
        ));
        assert_eq!(started.elapsed(), SHUTDOWN_TIMEOUT + REAP_TIMEOUT);
    }

    #[tokio::test(start_paused = true)]
    async fn shutdown_kills_after_two_seconds_even_if_write_fails_or_output_closes() {
        for write_fails in [false, true] {
            let (child, mut reaped) = fake_child(false, write_fails);
            let killed = Arc::clone(&child.killed);
            let (tx, mut rx) = mpsc::channel(1);
            drop(tx);
            let started = tokio::time::Instant::now();
            stop_child(child, &mut rx, &mut reaped, "tok")
                .await
                .expect("stopped");
            assert_eq!(started.elapsed(), Duration::from_secs(2));
            assert!(killed.load(Ordering::SeqCst));
            assert!(*reaped.borrow());
        }
    }

    #[tokio::test]
    async fn shutdown_does_not_touch_an_already_reaped_child() {
        let (child, mut reaped) = fake_child(false, false);
        child.reaped.send_replace(true);
        let writes = Arc::clone(&child.writes);
        let killed = Arc::clone(&child.killed);
        let (_tx, mut rx) = mpsc::channel(1);
        stop_child(child, &mut rx, &mut reaped, "tok")
            .await
            .expect("stopped");
        assert!(writes.lock().expect("writes").is_empty());
        assert!(!killed.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn closed_output_is_not_proof_of_process_exit() {
        let (tx, mut rx) = mpsc::channel(1);
        drop(tx);
        let (reaped_tx, mut reaped) = watch::channel(false);
        let waiter = tokio::spawn(async move { wait_reaped(&mut rx, &mut reaped).await });
        tokio::task::yield_now().await;
        assert!(!waiter.is_finished());
        reaped_tx.send_replace(true);
        waiter.await.expect("reap waiter");
    }

    #[test]
    fn shutdown_prevents_restart_without_spending_budget() {
        let handle = SidecarHandle::new("tok".into());
        let mut restarts = 0;
        handle.shutdown();
        assert_eq!(restart_after_failure(&handle, &mut restarts), None);
        assert_eq!(restarts, 0);
    }

    #[tokio::test]
    async fn ready_handshake_handles_every_byte_split_and_preserves_following_output() {
        let line = b"noise\r\n{\"event\":\"ready\",\"port\":4242}\r\n";
        for split in 0..=line.len() {
            let mut rx = channel(vec![
                ProcEvent::Stdout(line[..split].to_vec()),
                ProcEvent::Stdout(line[split..].to_vec()),
            ]);
            assert_eq!(
                wait_for_ready(&mut rx, READY_TIMEOUT, "tok").await,
                Ok(4242)
            );
        }
        let mut rx = channel(vec![ProcEvent::Stdout(
            b"{\"event\":\"ready\",\"port\":42}\nnext\npart".to_vec(),
        )]);
        let mut output = OutputDecoder::default();
        assert_eq!(
            wait_for_ready_decoded(&mut rx, READY_TIMEOUT, "tok", &mut output).await,
            Ok(42)
        );
        assert_eq!(output.lines.pop_front().as_deref(), Some("next"));
        assert_eq!(output.stdout.push(b"ial\n"), vec!["partial"]);
    }

    #[tokio::test]
    async fn raw_utf8_fragmentation_does_not_corrupt_redaction() {
        let token = "private\u{e9}";
        let bytes = format!("{{\"event\":\"error\",\"message\":\"{token}\"}}\n").into_bytes();
        let split = bytes.iter().position(|byte| *byte == 0xc3).expect("UTF-8") + 1;
        let mut rx = channel(vec![
            convert_event(CommandEvent::Stdout(bytes[..split].to_vec())).expect("event"),
            convert_event(CommandEvent::Stdout(bytes[split..].to_vec())).expect("event"),
        ]);
        assert_eq!(
            wait_for_ready(&mut rx, READY_TIMEOUT, token).await,
            Err(SidecarError::Reported(REDACTED.into()))
        );
    }

    #[tokio::test]
    async fn failed_status_is_redacted_before_publication() {
        let handle = SidecarHandle::new("tok".into());
        handle.set_status(
            None,
            SidecarStatus::Failed {
                message: "private tok".into(),
            },
        );
        assert_eq!(
            *handle.status_rx.borrow(),
            SidecarStatus::Failed {
                message: REDACTED.into()
            }
        );
        assert_eq!(
            handle.endpoint(READY_TIMEOUT).await,
            Err(SidecarError::Failed(REDACTED.into()))
        );
    }

    #[test]
    fn parses_ready_line() {
        assert_eq!(
            parse_stdout_line(r#"{"event":"ready","port":53211}"#),
            StdoutLine::Ready { port: 53211 }
        );
        assert_eq!(
            parse_stdout_line("  {\"event\":\"ready\",\"port\":1}\r\n"),
            StdoutLine::Ready { port: 1 }
        );
    }

    #[test]
    fn parses_error_line() {
        assert_eq!(
            parse_stdout_line(r#"{"event":"error","message":"migration failed"}"#),
            StdoutLine::Error {
                message: "migration failed".to_owned()
            }
        );
        assert_eq!(
            parse_stdout_line(r#"{"event":"error"}"#),
            StdoutLine::Error {
                message: "unspecified error".to_owned()
            }
        );
    }

    #[test]
    fn ignores_everything_else() {
        for line in [
            "",
            "hello world",
            "{not json",
            r#"{"event":"ready"}"#,
            r#"{"event":"ready","port":0}"#,
            r#"{"event":"ready","port":70000}"#,
            r#"{"event":"ready","port":"80"}"#,
            r#"{"event":"started","port":80}"#,
            r#"{"port":80}"#,
            "[]",
        ] {
            assert_eq!(parse_stdout_line(line), StdoutLine::Other, "line: {line:?}");
        }
    }

    #[test]
    fn parses_every_whitespace_variant_of_a_ready_line() {
        for line in [
            r#"{"event":"ready","port":53211}"#,
            "{\"event\":\"ready\",\"port\":53211}",
            "  {\"event\":\"ready\",\"port\":53211}\r\n",
            "\n\t{\"event\":\"ready\",\"port\":53211}  ",
            "{\"event\": \"ready\", \"port\": 53211}",
            "{\"port\":53211,\"event\":\"ready\"}",
            "{\"event\":\"ready\",\"port\":53211,\"pid\":42}",
        ] {
            assert_eq!(
                parse_stdout_line(line),
                StdoutLine::Ready { port: 53211 },
                "line: {line:?}"
            );
        }
    }

    #[test]
    fn parses_error_lines_with_extra_fields() {
        assert_eq!(
            parse_stdout_line(r#" {"event":"error","message":"migration failed","port":1} "#),
            StdoutLine::Error {
                message: "migration failed".to_owned()
            }
        );
        // A message that is not a string is not a protocol line at all.
        assert_eq!(
            parse_stdout_line(r#"{"event":"error","message":42}"#),
            StdoutLine::Other
        );
    }

    #[test]
    fn chunk_reads_the_ready_line_out_of_interleaved_output() {
        let mut buffer = LineBuffer::default();
        let mut parse = |chunk: &str| {
            buffer
                .push(chunk.as_bytes())
                .iter()
                .map(|line| parse_stdout_line(line))
                .filter(|line| *line != StdoutLine::Other)
                .collect::<Vec<_>>()
        };
        assert_eq!(
            parse("app starting\n{\"event\":\"ready\",\"port\":1234}\n"),
            vec![StdoutLine::Ready { port: 1234 }]
        );
        assert_eq!(
            parse("app starting\n{\"event\":\"ready\",\"port\":1}\n{\"event\":\"error\",\"message\":\"x\"}\n"),
            vec![StdoutLine::Ready { port: 1 }, StdoutLine::Error { message: "x".to_owned() }]
        );
        assert_eq!(parse("only logs here\n"), Vec::new());
        assert_eq!(parse(""), Vec::new());
    }

    #[test]
    fn structured_stderr_preserves_effect_log_levels() {
        assert_eq!(
            proc_log_level(true, r#"{"level":"INFO","message":"request complete"}"#),
            log::Level::Info
        );
        assert_eq!(
            proc_log_level(true, r#"{"level":"ERROR","message":"failure"}"#),
            log::Level::Error
        );
        assert_eq!(
            proc_log_level(true, "unknown native diagnostic"),
            log::Level::Warn
        );
        assert_eq!(proc_log_level(false, "ordinary stdout"), log::Level::Info);
    }

    #[test]
    fn restart_budget_is_spent_once() {
        let mut restarts = 0;
        assert_eq!(take_restart(&mut restarts), Some(0));
        assert_eq!(
            take_restart(&mut restarts),
            None,
            "only one restart is allowed"
        );
        assert_eq!(restarts, MAX_RESTARTS);
        assert_eq!(MAX_RESTARTS, 1);
    }

    #[test]
    fn tokens_are_64_hex_chars_and_unique() {
        let a = generate_token().expect("token");
        let b = generate_token().expect("token");
        assert_eq!(TOKEN_LEN, 32);
        // 32 random bytes hex encoded is exactly 64 characters.
        assert_eq!(a.len(), TOKEN_LEN * 2);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }

    #[test]
    fn token_error_is_a_boxed_std_error_with_source() {
        let err = TokenError {
            len: TOKEN_LEN,
            source: getrandom::Error::UNSUPPORTED,
        };
        assert!(err.to_string().contains("32 random bytes"));
        let boxed: Box<dyn std::error::Error> = Box::new(err);
        assert!(
            boxed.source().is_some(),
            "the getrandom failure must be the source"
        );
    }

    #[test]
    fn redacts_bearer_lines_in_any_case() {
        for line in [
            "Authorization: Bearer abc123",
            "authorization: bearer abc123",
            "got header BEARER xyz",
        ] {
            assert_eq!(redact_line(line, "tok"), REDACTED, "line: {line:?}");
        }
        assert_eq!(
            redact_line("listening on 127.0.0.1", "tok"),
            "listening on 127.0.0.1"
        );
    }

    #[test]
    fn redacts_lines_containing_the_token() {
        assert_eq!(
            redact_line("env CADCAMFUN_TOKEN=s3cr3t", "s3cr3t"),
            REDACTED
        );
        // An empty token must not match every line.
        assert_eq!(redact_line("plain", ""), "plain");
    }

    fn channel(events: Vec<ProcEvent>) -> mpsc::Receiver<ProcEvent> {
        let (tx, rx) = mpsc::channel(16);
        for event in events {
            tx.try_send(event).expect("queue event");
        }
        // Keep the sender alive for tests that rely on the timeout.
        std::mem::forget(tx);
        rx
    }

    #[tokio::test]
    async fn handshake_skips_noise_and_returns_port() {
        let mut rx = channel(vec![
            ProcEvent::Stderr("warming up".into()),
            ProcEvent::Stdout("not protocol\n".into()),
            ProcEvent::Stdout("{\"event\":\"ready\",\"port\":4242}\n".into()),
        ]);
        assert_eq!(wait_for_ready(&mut rx, READY_TIMEOUT, "t").await, Ok(4242));
    }

    #[tokio::test]
    async fn handshake_reads_a_ready_line_sharing_a_chunk_with_logs() {
        let mut rx = channel(vec![ProcEvent::Stdout(
            "app starting\n{\"event\":\"ready\",\"port\":4242}\n".into(),
        )]);
        assert_eq!(wait_for_ready(&mut rx, READY_TIMEOUT, "t").await, Ok(4242));
    }

    #[tokio::test]
    async fn handshake_reports_sidecar_error() {
        let mut rx = channel(vec![ProcEvent::Stdout(
            "{\"event\":\"error\",\"message\":\"boom\"}\n".into(),
        )]);
        assert_eq!(
            wait_for_ready(&mut rx, READY_TIMEOUT, "t").await,
            Err(SidecarError::Reported("boom".into()))
        );
    }

    #[tokio::test]
    async fn handshake_fails_when_process_exits_first() {
        let mut rx = channel(vec![ProcEvent::Terminated(Some(1))]);
        assert!(matches!(
            wait_for_ready(&mut rx, READY_TIMEOUT, "t").await,
            Err(SidecarError::ExitedEarly(_))
        ));
    }

    #[tokio::test(start_paused = true)]
    async fn handshake_times_out_after_the_limit() {
        let mut rx = channel(vec![ProcEvent::Stdout("still starting".into())]);
        assert_eq!(
            wait_for_ready(&mut rx, READY_TIMEOUT, "t").await,
            Err(SidecarError::ReadyTimeout(60))
        );
    }

    #[tokio::test]
    async fn endpoint_resolves_once_ready() {
        let handle = Arc::new(SidecarHandle::new("tok".into()));
        let waiter = {
            let handle = Arc::clone(&handle);
            tokio::spawn(async move { handle.endpoint(Duration::from_secs(5)).await })
        };
        tokio::task::yield_now().await;
        handle.set_status(None, SidecarStatus::Ready { port: 8080 });
        let endpoint = waiter.await.expect("join").expect("endpoint");
        assert_eq!(endpoint.base_url, "http://127.0.0.1:8080");
        assert_eq!(endpoint.token, "tok");
    }

    #[tokio::test]
    async fn endpoint_surfaces_permanent_failure() {
        let handle = SidecarHandle::new("tok".into());
        handle.set_status(
            None,
            SidecarStatus::Failed {
                message: "dead".into(),
            },
        );
        assert_eq!(
            handle.endpoint(Duration::from_secs(1)).await,
            Err(SidecarError::Failed("dead".into()))
        );
    }

    #[tokio::test(start_paused = true)]
    async fn endpoint_times_out_while_starting() {
        let handle = SidecarHandle::new("tok".into());
        assert_eq!(
            handle.endpoint(Duration::from_secs(3)).await,
            Err(SidecarError::ReadyTimeout(3))
        );
    }

    #[test]
    fn status_serialises_with_camel_case_tag() {
        let json = serde_json::to_string(&SidecarStatus::Ready { port: 9 }).expect("json");
        assert_eq!(json, r#"{"state":"ready","port":9}"#);
        let json = serde_json::to_string(&SidecarEndpoint {
            base_url: "u".into(),
            token: "t".into(),
        })
        .expect("json");
        assert_eq!(json, r#"{"baseUrl":"u","token":"t"}"#);
    }

    #[test]
    fn framing_preserves_fragments_and_recovers_after_oversized_lines() {
        let mut buffer = LineBuffer::default();
        assert!(buffer.push(b"{\"event\":\"rea").is_empty());
        assert_eq!(
            buffer.push(b"dy\",\"port\":42}\r\n"),
            vec!["{\"event\":\"ready\",\"port\":42}\r"]
        );
        assert!(buffer.push(&vec![b'x'; MAX_LINE_BYTES + 100]).is_empty());
        assert!(buffer.pending.is_empty());
        assert_eq!(buffer.push(b"discarded\nnext\n"), vec!["next"]);
    }

    #[tokio::test]
    async fn handshake_preserves_fragmented_ready_and_redacts_fragmented_errors() {
        let mut rx = channel(vec![
            ProcEvent::Stdout("{\"event\":\"rea".into()),
            ProcEvent::Stdout("dy\",\"port\":42}\n".into()),
        ]);
        assert_eq!(wait_for_ready(&mut rx, READY_TIMEOUT, "tok").await, Ok(42));
        let mut rx = channel(vec![
            ProcEvent::Stdout("{\"event\":\"error\",\"message\":\"Authorization: Bea".into()),
            ProcEvent::Stdout("rer tok\"}\n".into()),
        ]);
        assert_eq!(
            wait_for_ready(&mut rx, READY_TIMEOUT, "tok").await,
            Err(SidecarError::Reported(REDACTED.into()))
        );
        let mut rx = channel(vec![ProcEvent::Error("API_KEY=private".into())]);
        assert_eq!(
            wait_for_ready(&mut rx, READY_TIMEOUT, "tok").await,
            Err(SidecarError::ExitedEarly(REDACTED.into()))
        );
    }

    #[tokio::test]
    async fn shutdown_is_idempotent_and_wakes_endpoint_waiters() {
        let handle = Arc::new(SidecarHandle::new("tok".into()));
        let waiter = {
            let handle = Arc::clone(&handle);
            tokio::spawn(async move { handle.endpoint(READY_TIMEOUT).await })
        };
        tokio::task::yield_now().await;
        assert!(handle.shutdown());
        assert!(!handle.shutdown());
        assert_eq!(waiter.await.expect("join"), Err(SidecarError::ShuttingDown));
    }

    #[test]
    #[ignore = "requires the compiled real sidecar binary; creates an isolated database"]
    fn real_binary_parent_contract() {
        use std::io::{BufRead, BufReader, Write};
        use std::process::{Command, Stdio};
        struct ChildGuard(std::process::Child);
        impl Drop for ChildGuard {
            fn drop(&mut self) {
                let _ = self.0.kill();
                let _ = self.0.wait();
            }
        }
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let binary = root.join("binaries/sidecar-aarch64-apple-darwin");
        let data = std::env::temp_dir().join(format!(
            "cadcamfun-native-test-{}",
            generate_token().expect("id")
        ));
        std::fs::create_dir_all(&data).expect("temp directory");
        let token = generate_token().expect("token");
        let mut child = ChildGuard(
            Command::new(binary)
                .env("CADCAMFUN_TOKEN", &token)
                .env("CADCAMFUN_DATA_DIR", &data)
                .env(
                    "CADCAMFUN_MIGRATIONS_DIR",
                    root.join("../../../packages/db/drizzle"),
                )
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()
                .expect("real binary"),
        );
        let stdout = child.0.stdout.take().expect("stdout");
        let (tx, rx) = std::sync::mpsc::channel();
        let reader = std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let StdoutLine::Ready { port } = parse_stdout_line(&line) {
                    let _ = tx.send(port);
                    break;
                }
            }
        });
        let port = rx
            .recv_timeout(READY_TIMEOUT)
            .expect("real ready handshake");
        assert_ne!(port, 0);
        reader.join().expect("reader");
        child
            .0
            .stdin
            .as_mut()
            .expect("stdin")
            .write_all(SHUTDOWN_COMMAND)
            .expect("shutdown command");
        let deadline = std::time::Instant::now() + SHUTDOWN_TIMEOUT;
        let mut graceful = false;
        while std::time::Instant::now() < deadline {
            if let Some(status) = child.0.try_wait().expect("wait") {
                assert!(status.success());
                graceful = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        if !graceful {
            child.0.kill().expect("fallback kill");
            child.0.wait().expect("fallback reap");
        }
        drop(child);
        std::fs::remove_dir_all(data).expect("cleanup");
        assert!(
            graceful,
            "WP4 binary must drain on the stdin shutdown command (fallback kill/reap succeeded)"
        );
    }
}
