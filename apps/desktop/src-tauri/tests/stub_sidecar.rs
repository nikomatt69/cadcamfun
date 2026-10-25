//! The sidecar process contract, end to end on the stub (`stub/stub-sidecar.ts`, the same file `bun run stub-sidecar` compiles into
//! `binaries/sidecar-<triple>` for `tauri dev`): ready handshake, Bearer-protected loopback health, graceful stop on the shutdown
//! command and on stdin EOF, and the two failure shapes the supervisor reacts to (never ready, crash after ready).
//!
//! The stub is run with `bun` exactly as the shell would run the compiled binary: the token and data directory in the environment,
//! stdin piped, one JSON ready line on stdout. The shell's own supervisor (`sidecar.rs`) is a private module, so this test pins the
//! protocol it depends on rather than its state machine; the supervisor itself is covered by its unit tests with fake children.
//! Without `bun` the tests skip locally; with `CI` set they fail, so a missing runtime cannot pass the gate silently.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::time::{Duration, Instant};

/// What `sidecar::SHUTDOWN_COMMAND` writes (kept literal here: the constant lives in a private module).
const SHUTDOWN_COMMAND: &[u8] = b"{\"event\":\"shutdown\"}\n";
const TOKEN: &str = "integration-test-token-0123456789abcdef";
const STARTUP: Duration = Duration::from_secs(20);
const STOP: Duration = Duration::from_secs(5);

struct Stub {
    child: Child,
    lines: Receiver<String>,
}

impl Stub {
    /// Spawns the stub, or returns `None` (a skip) when `bun` is not installed and this is not CI.
    fn spawn(extra_env: &[(&str, &str)], token: Option<&str>) -> Option<Stub> {
        let script = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("stub/stub-sidecar.ts");
        let mut command = Command::new("bun");
        command
            .arg(script)
            .env_remove("CADCAMFUN_TOKEN")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        if let Some(token) = token {
            command.env("CADCAMFUN_TOKEN", token);
        }
        for (key, value) in extra_env {
            command.env(key, value);
        }
        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(err)
                if err.kind() == std::io::ErrorKind::NotFound
                    && std::env::var_os("CI").is_none() =>
            {
                eprintln!("skipped: bun is not installed");
                return None;
            }
            Err(err) => panic!("the stub sidecar needs `bun` on PATH: {err}"),
        };
        let stdout = child.stdout.take().expect("piped stdout");
        let (sender, lines) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if sender.send(line).is_err() {
                    break;
                }
            }
        });
        Some(Stub { child, lines })
    }

    /// The `port` of the `ready` event: the first stdout line, per specs/05 section 1.
    fn ready_port(&self) -> u16 {
        let line = self
            .lines
            .recv_timeout(STARTUP)
            .expect("a ready line on stdout");
        assert!(!line.contains(TOKEN), "the token must never be printed");
        let event: serde_json::Value = serde_json::from_str(&line).expect("the ready line is JSON");
        assert_eq!(event["event"], "ready", "unexpected first line: {line}");
        let port = event["port"]
            .as_u64()
            .expect("ready carries a numeric port");
        u16::try_from(port)
            .ok()
            .filter(|port| *port != 0)
            .expect("a real loopback port")
    }

    fn write_stdin(&mut self, bytes: &[u8]) {
        let stdin = self.child.stdin.as_mut().expect("piped stdin");
        stdin.write_all(bytes).expect("write to the stub");
        stdin.flush().expect("flush");
    }

    /// Waits for the process to exit within `limit`.
    fn wait_exit(&mut self, limit: Duration) -> Option<std::process::ExitStatus> {
        let deadline = Instant::now() + limit;
        while Instant::now() < deadline {
            if let Some(status) = self.child.try_wait().expect("try_wait") {
                return Some(status);
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        None
    }
}

impl Drop for Stub {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// A minimal HTTP/1.1 GET over a raw socket: status code and body. Raw on purpose, the shell's `/health` probe does the same.
fn get(port: u16, path: &str, authorization: Option<&str>) -> (u16, String) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect to the loopback port");
    stream.set_read_timeout(Some(STOP)).expect("read timeout");
    let auth = authorization
        .map(|value| format!("Authorization: {value}\r\n"))
        .unwrap_or_default();
    write!(
        stream,
        "GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\n{auth}Connection: close\r\n\r\n"
    )
    .expect("send the request");
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .expect("read the response");
    let status = response
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse().ok())
        .expect("an HTTP status line");
    let body = response
        .split("\r\n\r\n")
        .nth(1)
        .unwrap_or_default()
        .to_owned();
    (status, body)
}

#[test]
fn ready_handshake_then_bearer_protected_health() {
    let Some(stub) = Stub::spawn(&[], Some(TOKEN)) else {
        return;
    };
    let port = stub.ready_port();

    let (status, body) = get(port, "/health", Some(&format!("Bearer {TOKEN}")));
    assert_eq!(status, 200);
    assert!(body.contains("\"status\":\"ok\""), "health body: {body}");

    // The same endpoint without the token, or with another one, is refused and never echoes the secret.
    for authorization in [None, Some("Bearer wrong-token"), Some(TOKEN)] {
        let (status, body) = get(port, "/health", authorization);
        assert_eq!(status, 401, "authorization {authorization:?}");
        assert!(!body.contains(TOKEN));
    }
}

#[test]
fn shutdown_command_stops_the_process_cleanly() {
    let Some(mut stub) = Stub::spawn(&[], Some(TOKEN)) else {
        return;
    };
    stub.ready_port();
    stub.write_stdin(SHUTDOWN_COMMAND);
    let status = stub
        .wait_exit(STOP)
        .expect("the shutdown command stops the process without a kill");
    assert!(status.success(), "exit status {status}");
}

#[test]
fn closing_stdin_stops_the_process_when_the_shell_dies() {
    let Some(mut stub) = Stub::spawn(&[], Some(TOKEN)) else {
        return;
    };
    stub.ready_port();
    drop(stub.child.stdin.take());
    let status = stub
        .wait_exit(STOP)
        .expect("EOF on stdin stops the process");
    assert!(status.success(), "exit status {status}");
}

#[test]
fn a_sidecar_that_never_reports_ready_stays_silent_and_alive() {
    let Some(mut stub) = Stub::spawn(&[("STUB_NO_READY", "1")], Some(TOKEN)) else {
        return;
    };
    // The shell's ready timeout (60 s) is what ends this state; here the line must simply not arrive.
    assert!(
        stub.lines
            .recv_timeout(Duration::from_millis(1500))
            .is_err(),
        "no stdout line is expected"
    );
    assert!(
        stub.child.try_wait().expect("try_wait").is_none(),
        "the process keeps running"
    );
}

#[test]
fn a_crash_after_ready_exits_with_a_failure_code() {
    let Some(mut stub) = Stub::spawn(&[("STUB_CRASH_AFTER_MS", "300")], Some(TOKEN)) else {
        return;
    };
    stub.ready_port();
    let status = stub.wait_exit(STOP).expect("the stub crashes on its own");
    assert_eq!(status.code(), Some(1));
}

#[test]
fn a_missing_token_is_reported_on_stdout_and_exits_with_failure() {
    let Some(mut stub) = Stub::spawn(&[], None) else {
        return;
    };
    let line = stub.lines.recv_timeout(STARTUP).expect("an error event");
    let event: serde_json::Value = serde_json::from_str(&line).expect("the error line is JSON");
    assert_eq!(event["event"], "error");
    let status = stub.wait_exit(STOP).expect("the stub exits");
    assert_eq!(status.code(), Some(1));
}
