//! Keeps the operating system from throttling a running CAM or kernel job (spec 56 phase F).
//!
//! macOS App Nap slows timers and I/O of an app whose window is hidden or covered, which is exactly when a long toolpath run is left
//! alone. The webview reports each `cam.progress` frame it receives (`begin_job_activity`) and the end of the run (`end_job_activity`);
//! while at least one run is active, the shell holds a `userInitiated` activity (`NSProcessInfo.performActivity`, which also keeps
//! the machine from idle sleep). Other systems have no equivalent that needs holding, so the commands only keep the bookkeeping there.
//!
//! A run that never reports its end (a lost frame, a crashed webview) must not keep the machine awake for ever: every report renews a
//! lease, and a sweeper ends runs whose lease ran out.

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use thiserror::Error;

/// A run is considered finished when no frame renewed it for this long (a kernel stage can be quiet for a while).
pub const LEASE: Duration = Duration::from_secs(90);
/// How often the sweeper looks for runs whose lease ran out.
pub const SWEEP_INTERVAL: Duration = Duration::from_secs(15);
/// Runs tracked at once; the webview cannot grow the state without bound.
const MAX_RUNS: usize = 32;
const MAX_RUN_ID_BYTES: usize = 128;
/// Shown in Activity Monitor next to the "Preventing App Nap" column.
#[cfg(target_os = "macos")]
const REASON: &str = "CAD/CAM job in progress";

#[derive(Debug, Clone, PartialEq, Eq, Error, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "snake_case")]
pub enum PowerError {
    #[error("the run id must be 1 to {MAX_RUN_ID_BYTES} bytes")]
    InvalidRunId,
    #[error("more than {MAX_RUNS} runs are active")]
    TooManyRuns,
}

/// What a report changed about the shell's hold on the system.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Change {
    Unchanged,
    /// The first run started: take the hold.
    Began,
    /// The last run ended: release the hold.
    Ended,
}

/// The runs that need the machine awake, each with the time of its last report. Pure: callers pass the clock.
#[derive(Default)]
struct JobActivity {
    runs: HashMap<String, Instant>,
}

impl JobActivity {
    fn touch(&mut self, run_id: &str, now: Instant) -> Result<Change, PowerError> {
        if run_id.is_empty() || run_id.len() > MAX_RUN_ID_BYTES {
            return Err(PowerError::InvalidRunId);
        }
        if !self.runs.contains_key(run_id) && self.runs.len() >= MAX_RUNS {
            return Err(PowerError::TooManyRuns);
        }
        let first = self.runs.is_empty();
        self.runs.insert(run_id.to_owned(), now);
        Ok(if first {
            Change::Began
        } else {
            Change::Unchanged
        })
    }

    fn finish(&mut self, run_id: &str) -> Change {
        if self.runs.remove(run_id).is_some() && self.runs.is_empty() {
            Change::Ended
        } else {
            Change::Unchanged
        }
    }

    fn expire(&mut self, now: Instant) -> Change {
        if self.runs.is_empty() {
            return Change::Unchanged;
        }
        self.runs
            .retain(|_, seen| now.saturating_duration_since(*seen) < LEASE);
        if self.runs.is_empty() {
            Change::Ended
        } else {
            Change::Unchanged
        }
    }
}

/// The system hold. Dropping it releases the activity.
#[cfg(target_os = "macos")]
mod hold {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{mpsc, Arc};

    use block2::RcBlock;
    use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};

    pub struct Hold {
        /// Dropping the sender ends the blocking call below, which ends the activity.
        _release: mpsc::Sender<()>,
        /// Read by the test that proves the activity begins and ends.
        #[cfg_attr(not(test), allow(dead_code))]
        active: Arc<AtomicBool>,
    }

    impl Hold {
        pub fn acquire() -> Option<Self> {
            let (release, wait) = mpsc::channel::<()>();
            let active = Arc::new(AtomicBool::new(false));
            let flag = Arc::clone(&active);
            // `performActivity` is the block form of `beginActivity`/`endActivity`: the activity lasts exactly as long as the block
            // runs, so a thread parks in it until the hold is dropped. (`endActivity` is unsafe in the bindings; this is not.)
            std::thread::Builder::new()
                .name("job-activity".into())
                .spawn(move || {
                    let reason = NSString::from_str(super::REASON);
                    let block = RcBlock::new(move || {
                        flag.store(true, Ordering::SeqCst);
                        let _ = wait.recv();
                        flag.store(false, Ordering::SeqCst);
                    });
                    NSProcessInfo::processInfo().performActivityWithOptions_reason_usingBlock(
                        NSActivityOptions::UserInitiated,
                        &reason,
                        &block,
                    );
                })
                .ok()
                .map(|_| Self {
                    _release: release,
                    active,
                })
        }

        #[cfg(test)]
        pub fn is_active(&self) -> bool {
            self.active.load(Ordering::SeqCst)
        }

        #[cfg(test)]
        pub fn flag(&self) -> Arc<AtomicBool> {
            Arc::clone(&self.active)
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::time::{Duration, Instant};

        fn wait_for(probe: impl Fn() -> bool) -> bool {
            let deadline = Instant::now() + Duration::from_secs(5);
            while Instant::now() < deadline {
                if probe() {
                    return true;
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            probe()
        }

        #[test]
        fn the_activity_lasts_exactly_as_long_as_the_hold() {
            let hold = Hold::acquire().expect("hold");
            assert!(wait_for(|| hold.is_active()), "activity begins");
            let flag = hold.flag();
            drop(hold);
            assert!(wait_for(|| !flag.load(Ordering::SeqCst)), "activity ends");
        }
    }
}

/// Windows and Linux do not throttle a hidden window the way App Nap does, so there is nothing to hold.
#[cfg(not(target_os = "macos"))]
mod hold {
    pub struct Hold;

    impl Hold {
        pub fn acquire() -> Option<Self> {
            Some(Self)
        }
    }
}

use hold::Hold;

#[derive(Default)]
struct Inner {
    activity: JobActivity,
    hold: Option<Hold>,
    sweeping: bool,
}

/// Managed state behind `begin_job_activity` and `end_job_activity`.
#[derive(Default)]
pub struct JobPower {
    inner: Mutex<Inner>,
}

impl JobPower {
    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Records a report for `run_id`. Returns true when the caller has to start the sweeper.
    fn report(&self, run_id: &str, now: Instant) -> Result<bool, PowerError> {
        let mut inner = self.lock();
        let change = inner.activity.touch(run_id, now)?;
        Self::apply(&mut inner, change);
        let start_sweeper = !inner.sweeping;
        inner.sweeping = true;
        Ok(start_sweeper)
    }

    fn end(&self, run_id: &str) {
        let mut inner = self.lock();
        let change = inner.activity.finish(run_id);
        Self::apply(&mut inner, change);
    }

    /// One sweeper pass. Returns false when nothing is left to watch (the sweeper stops).
    fn sweep(&self, now: Instant) -> bool {
        let mut inner = self.lock();
        let change = inner.activity.expire(now);
        Self::apply(&mut inner, change);
        if inner.activity.runs.is_empty() {
            inner.sweeping = false;
        }
        inner.sweeping
    }

    fn apply(inner: &mut Inner, change: Change) {
        match change {
            Change::Began => {
                inner.hold = Hold::acquire();
                if inner.hold.is_none() {
                    log::warn!(target: "power", "could not start the job activity thread; the job runs without the App Nap guard");
                }
            }
            Change::Ended => inner.hold = None,
            Change::Unchanged => {}
        }
    }

    #[cfg(test)]
    fn holding(&self) -> bool {
        self.lock().hold.is_some()
    }
}

fn spawn_sweeper(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(SWEEP_INTERVAL).await;
            let Some(power) = app.try_state::<JobPower>() else {
                return;
            };
            if !power.sweep(Instant::now()) {
                return;
            }
        }
    });
}

/// A kernel run is working (or still working): holds the system awake for it and renews its lease. Idempotent per run id.
#[tauri::command]
pub fn begin_job_activity(
    app: AppHandle,
    power: State<'_, JobPower>,
    run_id: String,
) -> Result<(), PowerError> {
    if power.report(&run_id, Instant::now())? {
        spawn_sweeper(app);
    }
    Ok(())
}

/// The run finished or was cancelled. Releases the hold when it was the last one.
#[tauri::command]
pub fn end_job_activity(power: State<'_, JobPower>, run_id: String) {
    power.end(&run_id);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(base: Instant, secs: u64) -> Instant {
        base + Duration::from_secs(secs)
    }

    #[test]
    fn the_first_run_begins_and_the_last_run_ends() {
        let now = Instant::now();
        let mut jobs = JobActivity::default();
        assert_eq!(jobs.touch("a", now), Ok(Change::Began));
        assert_eq!(jobs.touch("a", at(now, 1)), Ok(Change::Unchanged));
        assert_eq!(jobs.touch("b", at(now, 2)), Ok(Change::Unchanged));
        assert_eq!(jobs.finish("a"), Change::Unchanged);
        assert_eq!(jobs.finish("a"), Change::Unchanged);
        assert_eq!(jobs.finish("b"), Change::Ended);
        assert_eq!(jobs.touch("c", at(now, 3)), Ok(Change::Began));
    }

    #[test]
    fn a_run_that_stops_reporting_expires_and_a_renewed_one_does_not() {
        let now = Instant::now();
        let mut jobs = JobActivity::default();
        jobs.touch("lost", now).expect("touch");
        jobs.touch("live", now).expect("touch");
        jobs.touch("live", at(now, 80)).expect("renew");
        assert_eq!(jobs.expire(at(now, LEASE.as_secs() - 1)), Change::Unchanged);
        assert_eq!(jobs.expire(at(now, LEASE.as_secs())), Change::Unchanged);
        assert!(!jobs.runs.contains_key("lost"));
        assert_eq!(jobs.expire(at(now, 80 + LEASE.as_secs())), Change::Ended);
        assert_eq!(jobs.expire(at(now, 500)), Change::Unchanged);
    }

    #[test]
    fn ids_and_the_number_of_runs_are_bounded() {
        let now = Instant::now();
        let mut jobs = JobActivity::default();
        assert_eq!(jobs.touch("", now), Err(PowerError::InvalidRunId));
        assert_eq!(
            jobs.touch(&"x".repeat(MAX_RUN_ID_BYTES + 1), now),
            Err(PowerError::InvalidRunId)
        );
        for index in 0..MAX_RUNS {
            jobs.touch(&format!("run-{index}"), now).expect("room");
        }
        assert_eq!(jobs.touch("one-more", now), Err(PowerError::TooManyRuns));
        // A run that is already tracked can always renew.
        assert!(jobs.touch("run-0", at(now, 1)).is_ok());
    }

    #[test]
    fn the_hold_follows_the_runs_and_the_sweeper_lifecycle() {
        let now = Instant::now();
        let power = JobPower::default();
        assert!(
            power.report("a", now).expect("report"),
            "first report starts the sweeper"
        );
        assert!(power.holding());
        assert!(
            !power.report("b", at(now, 1)).expect("report"),
            "one sweeper is enough"
        );
        power.end("a");
        assert!(power.holding());
        // Run `b` stops reporting: the sweeper releases the hold and stops itself.
        assert!(power.sweep(at(now, 2)), "b is within its lease");
        assert!(!power.sweep(at(now, 1 + LEASE.as_secs())), "b expired");
        assert!(!power.holding());
        assert!(
            power.report("c", at(now, 200)).expect("report"),
            "a new run restarts the sweeper"
        );
        power.end("c");
        assert!(!power.holding());
    }
}
