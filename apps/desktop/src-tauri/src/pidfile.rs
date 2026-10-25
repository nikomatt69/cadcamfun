//! The sidecar's pidfile (spec 56 phase F).
//!
//! The sidecar exits when its stdin closes, which is how it learns that the shell died. A sidecar that is wedged at that moment never
//! reads the EOF and lives on, holding the database lock and a port. The shell records the sidecar's pid in the data directory after
//! every spawn and removes it after a confirmed stop; the next launch reads a leftover file before it spawns and stops that process.
//!
//! A pid alone is not an identity: it may have been reused by an unrelated program. A process is only stopped when it is still alive,
//! is not a zombie, has the sidecar's executable name **and** the start time recorded next to the pid (where the system reports one).
//! Anything else is left alone and the file is dropped.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread::sleep;
use std::time::{Duration, Instant};

/// Next to the database, inside the app data directory (`tauri dev` has its own `.dev` directory, so it never sees the real file).
pub const FILE_NAME: &str = "sidecar.pid";

/// How long to wait after each signal, and how often to look.
#[derive(Debug, Clone, Copy)]
pub struct Patience {
    pub poll: Duration,
    /// After the polite request (SIGTERM, `taskkill`): the sidecar flushes SQLite on it.
    pub graceful: Duration,
    /// After the forced kill.
    pub forced: Duration,
}

pub const PATIENCE: Patience = Patience {
    poll: Duration::from_millis(50),
    graceful: Duration::from_secs(3),
    forced: Duration::from_secs(2),
};

/// What the pidfile says: the process id and, where the system reports one, when that process started.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Record {
    pub pid: u32,
    pub started: Option<String>,
}

/// What the system reports about a live process.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessInfo {
    /// Executable path or name as the system prints it.
    pub image: String,
    pub started: Option<String>,
    /// Exited but not yet reaped by its parent: nothing left to stop.
    pub zombie: bool,
}

/// The operating system, behind a trait so the decisions are tested without killing anything.
pub trait Processes {
    /// `None`: no such process.
    fn inspect(&self, pid: u32) -> Option<ProcessInfo>;
    /// Asks the process to end (`force` kills it). True when the request was delivered.
    fn terminate(&self, pid: u32, force: bool) -> bool;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Reclaim {
    NoFile,
    /// The recorded process is gone (or the file was unreadable): the file was removed.
    Stale,
    /// The pid is alive but is not our sidecar (reused pid): left untouched, the file was removed.
    NotOurs {
        pid: u32,
    },
    /// A leftover sidecar was stopped.
    Stopped {
        pid: u32,
        forced: bool,
    },
    /// A leftover sidecar survived even the forced kill: the caller must not spawn another one.
    Stuck {
        pid: u32,
    },
}

pub fn path(data_dir: &Path) -> PathBuf {
    data_dir.join(FILE_NAME)
}

pub fn render(record: &Record) -> String {
    format!(
        "{}\n{}\n",
        record.pid,
        record.started.as_deref().unwrap_or("")
    )
}

pub fn parse(text: &str) -> Option<Record> {
    let mut lines = text.lines();
    let pid = lines.next()?.trim().parse::<u32>().ok()?;
    let started = lines
        .next()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_owned);
    Some(Record { pid, started })
}

/// The file name of a process image (`/Applications/X.app/Contents/MacOS/sidecar`, `C:\x\sidecar.exe`) without `.exe`.
fn image_name(image: &str) -> &str {
    let name = image.rsplit(['/', '\\']).next().unwrap_or(image);
    name.strip_suffix(".exe")
        .or_else(|| name.strip_suffix(".EXE"))
        .unwrap_or(name)
}

/// Decides whether `info` is the process `record` was written for.
fn is_ours(record: &Record, info: &ProcessInfo, expected_image: &str) -> bool {
    image_name(&info.image).eq_ignore_ascii_case(expected_image)
        && match (&record.started, &info.started) {
            (Some(recorded), Some(current)) => recorded == current,
            (Some(_), None) => false,
            (None, _) => true,
        }
}

/// Writes the pidfile for the sidecar that was just spawned (atomically: a crash never leaves half a line).
pub fn write(data_dir: &Path, procs: &impl Processes, pid: u32) -> io::Result<()> {
    let record = Record {
        pid,
        started: procs.inspect(pid).and_then(|info| info.started),
    };
    let target = path(data_dir);
    let temp = data_dir.join(format!("{FILE_NAME}.tmp"));
    fs::write(&temp, render(&record))?;
    fs::rename(&temp, target)
}

/// Removes the pidfile after a confirmed stop, but only when it still names `pid` (never someone else's record).
pub fn clear(data_dir: &Path, pid: u32) {
    let target = path(data_dir);
    let names_pid = fs::read_to_string(&target)
        .ok()
        .and_then(|text| parse(&text))
        .is_some_and(|record| record.pid == pid);
    if names_pid {
        let _ = fs::remove_file(target);
    }
}

fn wait_gone(procs: &impl Processes, pid: u32, limit: Duration, poll: Duration) -> bool {
    let deadline = Instant::now() + limit;
    loop {
        if procs.inspect(pid).is_none_or(|info| info.zombie) {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        sleep(poll);
    }
}

/// Reads a leftover pidfile and stops the process it names when it is verifiably our sidecar. Call before every spawn.
pub fn reclaim(
    data_dir: &Path,
    procs: &impl Processes,
    expected_image: &str,
    patience: Patience,
) -> io::Result<Reclaim> {
    let target = path(data_dir);
    let text = match fs::read_to_string(&target) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Reclaim::NoFile),
        Err(error) => return Err(error),
    };
    let Some(record) = parse(&text) else {
        fs::remove_file(&target)?;
        return Ok(Reclaim::Stale);
    };
    let pid = record.pid;
    let Some(info) = procs.inspect(pid).filter(|info| !info.zombie) else {
        fs::remove_file(&target)?;
        return Ok(Reclaim::Stale);
    };
    // Pids 0 and 1 and the shell itself are never a sidecar, whatever the file claims.
    if pid <= 1 || pid == std::process::id() || !is_ours(&record, &info, expected_image) {
        fs::remove_file(&target)?;
        return Ok(Reclaim::NotOurs { pid });
    }
    procs.terminate(pid, false);
    let mut forced = false;
    if !wait_gone(procs, pid, patience.graceful, patience.poll) {
        forced = true;
        procs.terminate(pid, true);
        if !wait_gone(procs, pid, patience.forced, patience.poll) {
            return Ok(Reclaim::Stuck { pid });
        }
    }
    fs::remove_file(&target)?;
    Ok(Reclaim::Stopped { pid, forced })
}

/// The real process table: `ps` and `kill` on Unix, `tasklist` and `taskkill` on Windows. No `unsafe` and no extra crate.
pub struct SystemProcesses;

/// `stat lstart(5 words) command…`, as `ps -o stat=,lstart=,comm=` prints it.
#[cfg(any(unix, test))]
fn parse_ps(output: &str) -> Option<ProcessInfo> {
    let mut words = output.split_whitespace();
    let stat = words.next()?;
    let started = words.by_ref().take(5).collect::<Vec<_>>();
    let image = words.collect::<Vec<_>>().join(" ");
    if started.len() < 5 || image.is_empty() {
        return None;
    }
    Some(ProcessInfo {
        image,
        started: Some(started.join(" ")),
        zombie: stat.starts_with('Z'),
    })
}

/// First field of a `tasklist /FO CSV /NH` row: `"sidecar.exe","1234",...`.
#[cfg(any(windows, test))]
fn parse_tasklist(output: &str) -> Option<ProcessInfo> {
    let row = output.lines().find(|line| line.starts_with('"'))?;
    let image = row.trim_start_matches('"').split('"').next()?;
    (!image.is_empty()).then(|| ProcessInfo {
        image: image.to_owned(),
        started: None,
        zombie: false,
    })
}

#[cfg(unix)]
impl Processes for SystemProcesses {
    fn inspect(&self, pid: u32) -> Option<ProcessInfo> {
        let output = Command::new("ps")
            .args(["-o", "stat=,lstart=,comm=", "-p", &pid.to_string()])
            // `lstart` is locale dependent: a fixed locale keeps the recorded value comparable between runs.
            .env("LC_ALL", "C")
            .output()
            .ok()
            .filter(|output| output.status.success())?;
        parse_ps(&String::from_utf8_lossy(&output.stdout))
    }

    fn terminate(&self, pid: u32, force: bool) -> bool {
        Command::new("kill")
            .args([if force { "-KILL" } else { "-TERM" }, &pid.to_string()])
            .status()
            .is_ok_and(|status| status.success())
    }
}

#[cfg(windows)]
impl Processes for SystemProcesses {
    fn inspect(&self, pid: u32) -> Option<ProcessInfo> {
        let output = Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
            .output()
            .ok()
            .filter(|output| output.status.success())?;
        parse_tasklist(&String::from_utf8_lossy(&output.stdout))
    }

    fn terminate(&self, pid: u32, force: bool) -> bool {
        let mut command = Command::new("taskkill");
        command.args(["/PID", &pid.to_string()]);
        if force {
            command.arg("/F");
        }
        command.status().is_ok_and(|status| status.success())
    }
}

#[cfg(not(any(unix, windows)))]
impl Processes for SystemProcesses {
    fn inspect(&self, _pid: u32) -> Option<ProcessInfo> {
        None
    }

    fn terminate(&self, _pid: u32, _force: bool) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    const FAST: Patience = Patience {
        poll: Duration::from_millis(1),
        graceful: Duration::from_millis(10),
        forced: Duration::from_millis(10),
    };

    /// One scripted process: how it answers to each signal.
    struct Fake {
        info: RefCell<Option<ProcessInfo>>,
        dies_on_term: bool,
        dies_on_kill: bool,
        signals: RefCell<Vec<bool>>,
    }

    impl Fake {
        fn alive(image: &str, started: &str, dies_on_term: bool, dies_on_kill: bool) -> Self {
            Self {
                info: RefCell::new(Some(ProcessInfo {
                    image: image.to_owned(),
                    started: Some(started.to_owned()),
                    zombie: false,
                })),
                dies_on_term,
                dies_on_kill,
                signals: RefCell::default(),
            }
        }
    }

    impl Processes for Fake {
        fn inspect(&self, _pid: u32) -> Option<ProcessInfo> {
            self.info.borrow().clone()
        }

        fn terminate(&self, _pid: u32, force: bool) -> bool {
            self.signals.borrow_mut().push(force);
            if (force && self.dies_on_kill) || (!force && self.dies_on_term) {
                *self.info.borrow_mut() = None;
            }
            true
        }
    }

    fn data_dir_with(record: &Record) -> tempfile::TempDir {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::write(path(dir.path()), render(record)).expect("write");
        dir
    }

    fn record(pid: u32, started: &str) -> Record {
        Record {
            pid,
            started: Some(started.to_owned()),
        }
    }

    const STARTED: &str = "Sat Oct 25 12:00:00 2026";

    #[test]
    fn a_record_round_trips_and_garbage_is_not_a_record() {
        let with = record(4242, STARTED);
        assert_eq!(parse(&render(&with)), Some(with));
        let without = Record {
            pid: 7,
            started: None,
        };
        assert_eq!(parse(&render(&without)), Some(without));
        assert_eq!(parse(""), None);
        assert_eq!(parse("not a pid\n"), None);
        assert_eq!(parse("-5\n"), None);
    }

    #[test]
    fn image_names_ignore_directories_and_exe() {
        assert_eq!(
            image_name("/Applications/A B.app/Contents/MacOS/sidecar"),
            "sidecar"
        );
        assert_eq!(image_name("C:\\Program Files\\x\\sidecar.exe"), "sidecar");
        assert_eq!(image_name("sidecar"), "sidecar");
    }

    #[test]
    fn ps_and_tasklist_output_is_parsed() {
        let info = parse_ps(
            "S     Sat Oct 25 12:00:00 2026 /Applications/CAD CAM.app/Contents/MacOS/sidecar\n",
        )
        .expect("ps row");
        assert_eq!(
            info.image,
            "/Applications/CAD CAM.app/Contents/MacOS/sidecar"
        );
        assert_eq!(info.started.as_deref(), Some(STARTED));
        assert!(!info.zombie);
        assert!(
            parse_ps("Z+    Sat Oct 25 12:00:00 2026 sidecar\n")
                .expect("row")
                .zombie
        );
        assert_eq!(parse_ps(""), None);
        assert_eq!(parse_ps("S Sat Oct 25\n"), None);
        let task = parse_tasklist("\"sidecar.exe\",\"1234\",\"Console\",\"1\",\"12,345 K\"\r\n")
            .expect("row");
        assert_eq!(task.image, "sidecar.exe");
        assert_eq!(
            parse_tasklist("INFO: No tasks are running which match the specified criteria.\r\n"),
            None
        );
    }

    #[test]
    fn no_file_means_nothing_to_do() {
        let dir = tempfile::tempdir().expect("tempdir");
        let fake = Fake::alive("sidecar", STARTED, true, true);
        assert_eq!(
            reclaim(dir.path(), &fake, "sidecar", FAST).expect("reclaim"),
            Reclaim::NoFile
        );
        assert!(fake.signals.borrow().is_empty());
    }

    #[test]
    fn an_unreadable_file_or_a_dead_process_is_stale_and_removed() {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::write(path(dir.path()), "garbage").expect("write");
        let fake = Fake::alive("sidecar", STARTED, true, true);
        assert_eq!(
            reclaim(dir.path(), &fake, "sidecar", FAST).expect("reclaim"),
            Reclaim::Stale
        );
        assert!(!path(dir.path()).exists());

        let dir = data_dir_with(&record(4242, STARTED));
        let gone = Fake {
            info: RefCell::new(None),
            ..Fake::alive("x", STARTED, true, true)
        };
        assert_eq!(
            reclaim(dir.path(), &gone, "sidecar", FAST).expect("reclaim"),
            Reclaim::Stale
        );
        assert!(!path(dir.path()).exists());
    }

    #[test]
    fn a_wedged_sidecar_gets_a_polite_request_first() {
        let dir = data_dir_with(&record(4242, STARTED));
        let fake = Fake::alive("/x/MacOS/sidecar", STARTED, true, true);
        assert_eq!(
            reclaim(dir.path(), &fake, "sidecar", FAST).expect("reclaim"),
            Reclaim::Stopped {
                pid: 4242,
                forced: false
            }
        );
        assert_eq!(*fake.signals.borrow(), vec![false]);
        assert!(!path(dir.path()).exists());
    }

    #[test]
    fn a_sidecar_that_ignores_the_request_is_killed() {
        let dir = data_dir_with(&record(4242, STARTED));
        let fake = Fake::alive("sidecar", STARTED, false, true);
        assert_eq!(
            reclaim(dir.path(), &fake, "sidecar", FAST).expect("reclaim"),
            Reclaim::Stopped {
                pid: 4242,
                forced: true
            }
        );
        assert_eq!(*fake.signals.borrow(), vec![false, true]);
    }

    #[test]
    fn a_sidecar_that_survives_everything_blocks_the_spawn_and_keeps_the_file() {
        let dir = data_dir_with(&record(4242, STARTED));
        let fake = Fake::alive("sidecar", STARTED, false, false);
        assert_eq!(
            reclaim(dir.path(), &fake, "sidecar", FAST).expect("reclaim"),
            Reclaim::Stuck { pid: 4242 }
        );
        assert!(path(dir.path()).exists());
    }

    #[test]
    fn an_unrelated_process_is_never_signalled() {
        // Reused pid with another program, another start time, the shell itself, init.
        for (pid, image, started) in [
            (4242, "/usr/bin/vim", STARTED),
            (4242, "sidecar", "Sun Oct 26 09:00:00 2026"),
            (std::process::id(), "sidecar", STARTED),
            (1, "sidecar", STARTED),
        ] {
            let dir = data_dir_with(&record(pid, STARTED));
            let fake = Fake::alive(image, started, true, true);
            assert_eq!(
                reclaim(dir.path(), &fake, "sidecar", FAST).expect("reclaim"),
                Reclaim::NotOurs { pid }
            );
            assert!(
                fake.signals.borrow().is_empty(),
                "{image} {started} was signalled"
            );
            assert!(fake.info.borrow().is_some());
            assert!(!path(dir.path()).exists());
        }
    }

    #[test]
    fn a_zombie_is_already_gone() {
        let dir = data_dir_with(&record(4242, STARTED));
        let fake = Fake::alive("sidecar", STARTED, true, true);
        fake.info.borrow_mut().as_mut().expect("info").zombie = true;
        assert_eq!(
            reclaim(dir.path(), &fake, "sidecar", FAST).expect("reclaim"),
            Reclaim::Stale
        );
        assert!(fake.signals.borrow().is_empty());
    }

    #[test]
    fn write_records_the_start_time_and_clear_only_removes_its_own_pid() {
        let dir = tempfile::tempdir().expect("tempdir");
        let fake = Fake::alive("sidecar", STARTED, true, true);
        write(dir.path(), &fake, 4242).expect("write");
        let text = fs::read_to_string(path(dir.path())).expect("read");
        assert_eq!(parse(&text), Some(record(4242, STARTED)));
        assert!(!dir.path().join(format!("{FILE_NAME}.tmp")).exists());
        clear(dir.path(), 9999);
        assert!(path(dir.path()).exists());
        clear(dir.path(), 4242);
        assert!(!path(dir.path()).exists());
    }

    /// The real `ps` and `kill` against a real process (Unix).
    #[cfg(unix)]
    mod system {
        use super::*;
        use std::process::Stdio;

        fn sleeper() -> std::process::Child {
            Command::new("sleep")
                .arg("300")
                .stdin(Stdio::null())
                .spawn()
                .expect("spawn sleep")
        }

        #[test]
        fn a_real_process_with_another_name_survives_a_reclaim() {
            let mut child = sleeper();
            let dir = tempfile::tempdir().expect("tempdir");
            write(dir.path(), &SystemProcesses, child.id()).expect("write");
            let outcome = reclaim(dir.path(), &SystemProcesses, "sidecar", FAST).expect("reclaim");
            assert_eq!(outcome, Reclaim::NotOurs { pid: child.id() });
            assert!(
                child.try_wait().expect("try_wait").is_none(),
                "the unrelated process is still running"
            );
            child.kill().expect("kill");
            child.wait().expect("wait");
        }

        #[test]
        fn a_real_leftover_process_with_the_expected_name_is_stopped() {
            let mut child = sleeper();
            let pid = child.id();
            let dir = tempfile::tempdir().expect("tempdir");
            write(dir.path(), &SystemProcesses, pid).expect("write");
            // The test is the parent: reap as soon as the signal lands (a leftover real sidecar has no live parent).
            let reaper = std::thread::spawn(move || child.wait().expect("wait"));
            let outcome =
                reclaim(dir.path(), &SystemProcesses, "sleep", PATIENCE).expect("reclaim");
            assert_eq!(outcome, Reclaim::Stopped { pid, forced: false });
            let status = reaper.join().expect("reaper");
            assert!(!status.success(), "terminated by the signal: {status:?}");
            assert!(!path(dir.path()).exists());
        }
    }
}
