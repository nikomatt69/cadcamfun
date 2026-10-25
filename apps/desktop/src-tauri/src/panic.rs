//! A panic hook that records where and why the shell panicked (spec 56 phase F/G).
//!
//! The release profile sets `panic = "abort"`: a panic ends the process at once, so the only evidence is what the hook writes first. The
//! hook logs location, thread and message through `log` (the log plugin's file under `get_logs_dir`) and flushes it, then hands over to
//! the previous hook (the default one prints the message and the backtrace to stderr).

use std::any::Any;
use std::panic::PanicHookInfo;

/// `"panic at src/x.rs:10:5 in thread 'main': message"`.
fn describe(location: Option<(&str, u32, u32)>, thread: &str, message: &str) -> String {
    match location {
        Some((file, line, column)) => {
            format!("panic at {file}:{line}:{column} in thread '{thread}': {message}")
        }
        None => format!("panic at an unknown location in thread '{thread}': {message}"),
    }
}

/// `panic!("text")` carries a `&str`, `panic!("{x}")` a `String`; anything else has no readable message.
fn payload_message(payload: &(dyn Any + Send)) -> &str {
    payload
        .downcast_ref::<&str>()
        .copied()
        .or_else(|| payload.downcast_ref::<String>().map(String::as_str))
        .unwrap_or("non-string panic payload")
}

fn describe_hook_info(info: &PanicHookInfo<'_>) -> String {
    let thread = std::thread::current();
    describe(
        info.location()
            .map(|at| (at.file(), at.line(), at.column())),
        thread.name().unwrap_or("<unnamed>"),
        payload_message(info.payload()),
    )
}

/// Installs the hook once at startup. Safe to call before the log plugin exists: the line still reaches stderr through the previous
/// hook, and reaches the log file once a logger is installed.
pub fn install() {
    install_with(|line| {
        log::error!(target: "panic", "{line}");
        log::logger().flush();
    });
}

fn install_with(record: impl Fn(&str) + Send + Sync + 'static) {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        record(&describe_hook_info(info));
        previous(info);
    }));
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn the_line_names_location_thread_and_message() {
        assert_eq!(
            describe(Some(("src/sidecar.rs", 12, 5)), "main", "boom"),
            "panic at src/sidecar.rs:12:5 in thread 'main': boom"
        );
        assert_eq!(
            describe(None, "t", "boom"),
            "panic at an unknown location in thread 't': boom"
        );
    }

    #[test]
    fn payloads_of_both_panic_forms_are_readable() {
        let literal = std::panic::catch_unwind(|| panic!("literal")).expect_err("panics");
        assert_eq!(payload_message(literal.as_ref()), "literal");
        let value = 7;
        let formatted =
            std::panic::catch_unwind(|| panic!("formatted {value}")).expect_err("panics");
        assert_eq!(payload_message(formatted.as_ref()), "formatted 7");
        let other = std::panic::catch_unwind(|| std::panic::panic_any(7_u8)).expect_err("panics");
        assert_eq!(payload_message(other.as_ref()), "non-string panic payload");
    }

    #[test]
    fn the_installed_hook_records_before_the_previous_hook_runs() {
        let seen = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = Arc::clone(&seen);
        let original = std::panic::take_hook();
        std::panic::set_hook(Box::new(|_| {}));
        install_with(move |line| {
            if let Ok(mut lines) = sink.lock() {
                lines.push(line.to_owned());
            }
        });
        let _ = std::panic::catch_unwind(|| panic!("hook probe"));
        std::panic::set_hook(original);
        let lines = seen.lock().expect("lines");
        let probe = lines
            .iter()
            .find(|line| line.ends_with("hook probe"))
            .expect("the panic was recorded");
        assert!(probe.contains("src/panic.rs:"), "{probe}");
        assert!(probe.contains("in thread '"), "{probe}");
    }
}
