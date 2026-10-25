//! Files the operating system handed to the app (double-click, "Open With", a second launch with a path). The webview may not be
//! listening yet when the OS delivers one, so the paths wait in a queue until it asks (`take_opened_files`), and the contents of such
//! a file are served only for a path that was delivered: the webview has no general permission to read the user's folders.

use std::collections::VecDeque;
use std::io::Read;
use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};

use thiserror::Error;

/// File extensions the app registers for (`fileAssociations` in `tauri.conf.json`); used to pick paths out of launch arguments.
pub const OPENABLE_EXTENSIONS: &[&str] = &["cadcam", "nc", "gcode"];

/// The largest file served to the webview. G-code of a long print is the biggest realistic case.
pub const MAX_OPENED_BYTES: u64 = 64 * 1024 * 1024;

/// Paths remembered per list; a flood of launches cannot grow the state without bound.
const MAX_REMEMBERED: usize = 256;

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum OpenedFileError {
    #[error("this file was not opened through the operating system")]
    NotDelivered,
    #[error("only {} files can be opened this way", OPENABLE_EXTENSIONS.join(", "))]
    UnsupportedType,
    #[error("not a regular file")]
    NotAFile,
    #[error("the file is larger than {} MiB", MAX_OPENED_BYTES / (1024 * 1024))]
    TooLarge,
    #[error("{0}")]
    Io(String),
}

/// True when the extension of `path` is one the app registers for.
pub fn is_openable(path: &Path) -> bool {
    path.extension()
        .map(|e| OPENABLE_EXTENSIONS.contains(&e.to_string_lossy().to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// The launch arguments that name a file the app opens.
pub fn openable_paths<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .filter(|arg| is_openable(Path::new(arg)))
        .collect()
}

#[derive(Default)]
struct Inner {
    /// Delivered and not yet taken by the webview.
    pending: VecDeque<String>,
    /// Everything delivered, oldest first: the only paths `read` serves.
    delivered: VecDeque<String>,
}

/// Managed state. Cloning shares the same queue (it is moved into blocking tasks).
#[derive(Clone, Default)]
pub struct OpenedFiles {
    inner: Arc<Mutex<Inner>>,
}

fn push_bounded(list: &mut VecDeque<String>, path: &str) {
    if list.len() >= MAX_REMEMBERED {
        list.pop_front();
    }
    list.push_back(path.to_owned());
}

impl OpenedFiles {
    fn lock(&self) -> MutexGuard<'_, Inner> {
        // A panic while holding the lock leaves plain lists behind; they are still valid.
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Remembers paths the OS delivered. A path already waiting is not queued twice.
    pub fn record(&self, paths: &[String]) {
        let mut inner = self.lock();
        for path in paths {
            if !inner.pending.contains(path) {
                push_bounded(&mut inner.pending, path);
            }
            if !inner.delivered.contains(path) {
                push_bounded(&mut inner.delivered, path);
            }
        }
    }

    /// Hands the waiting paths to the webview, oldest first, and forgets that they were waiting.
    pub fn take(&self) -> Vec<String> {
        self.lock().pending.drain(..).collect()
    }

    /// Contents of a delivered file. The path must be exactly one the OS delivered, the target (symlinks resolved) must still be a
    /// registered type, and the file must be a regular file within [`MAX_OPENED_BYTES`].
    pub fn read(&self, path: &str) -> Result<Vec<u8>, OpenedFileError> {
        if !self.lock().delivered.iter().any(|p| p == path) {
            return Err(OpenedFileError::NotDelivered);
        }
        let canonical = Path::new(path)
            .canonicalize()
            .map_err(|e| OpenedFileError::Io(format!("cannot resolve the file: {e}")))?;
        if !is_openable(&canonical) {
            return Err(OpenedFileError::UnsupportedType);
        }
        let file =
            std::fs::File::open(&canonical).map_err(|e| OpenedFileError::Io(e.to_string()))?;
        let metadata = file
            .metadata()
            .map_err(|e| OpenedFileError::Io(e.to_string()))?;
        if !metadata.is_file() {
            return Err(OpenedFileError::NotAFile);
        }
        if metadata.len() > MAX_OPENED_BYTES {
            return Err(OpenedFileError::TooLarge);
        }
        let mut bytes = Vec::new();
        file.take(MAX_OPENED_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| OpenedFileError::Io(e.to_string()))?;
        if bytes.len() as u64 > MAX_OPENED_BYTES {
            return Err(OpenedFileError::TooLarge);
        }
        Ok(bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir()
                .join(format!("cadcamfun-opened-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).expect("scratch dir");
            Self(dir)
        }

        fn file(&self, name: &str, contents: &[u8]) -> String {
            let path = self.0.join(name);
            fs::write(&path, contents).expect("write");
            path.to_string_lossy().into_owned()
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn picks_only_registered_extensions_from_args() {
        let args = [
            "/app/cadcamfun",
            "/tmp/part.GCODE",
            "/tmp/a.cadcam",
            "/tmp/b.nc",
            "/tmp/c.txt",
            "--flag",
        ]
        .map(String::from);
        assert_eq!(
            openable_paths(args),
            vec!["/tmp/part.GCODE", "/tmp/a.cadcam", "/tmp/b.nc"]
        );
    }

    #[test]
    fn a_path_is_taken_once_and_in_order() {
        let opened = OpenedFiles::default();
        opened.record(&["/a.nc".into(), "/b.nc".into()]);
        opened.record(&["/a.nc".into()]);
        assert_eq!(opened.take(), vec!["/a.nc", "/b.nc"]);
        assert!(opened.take().is_empty());
    }

    #[test]
    fn a_path_delivered_before_the_webview_asks_is_not_lost() {
        let opened = OpenedFiles::default();
        opened.record(&["/early.gcode".into()]);
        let shared = opened.clone();
        assert_eq!(shared.take(), vec!["/early.gcode"]);
    }

    #[test]
    fn only_delivered_paths_are_served() {
        let scratch = Scratch::new("delivered");
        let delivered = scratch.file("part.nc", b"G0 X1");
        let other = scratch.file("other.nc", b"G0 X2");
        let opened = OpenedFiles::default();
        opened.record(std::slice::from_ref(&delivered));
        assert_eq!(opened.read(&delivered).expect("delivered"), b"G0 X1");
        assert_eq!(opened.read(&other), Err(OpenedFileError::NotDelivered));
        // Taking the queue does not revoke the right to read what was delivered.
        let _ = opened.take();
        assert!(opened.read(&delivered).is_ok());
    }

    #[test]
    fn a_dot_dot_spelling_of_a_delivered_path_is_not_the_delivered_path() {
        let scratch = Scratch::new("dotdot");
        let delivered = scratch.file("part.nc", b"x");
        let sneaky = format!(
            "{}/../{}/part.nc",
            scratch.0.display(),
            scratch.0.file_name().unwrap().to_string_lossy()
        );
        let opened = OpenedFiles::default();
        opened.record(&[delivered]);
        assert_eq!(opened.read(&sneaky), Err(OpenedFileError::NotDelivered));
    }

    #[test]
    fn unregistered_types_and_directories_are_refused() {
        let scratch = Scratch::new("types");
        let text = scratch.file("notes.txt", b"x");
        let dir = scratch.0.join("folder.nc");
        fs::create_dir_all(&dir).expect("dir");
        let dir = dir.to_string_lossy().into_owned();
        let opened = OpenedFiles::default();
        opened.record(&[text.clone(), dir.clone()]);
        assert_eq!(opened.read(&text), Err(OpenedFileError::UnsupportedType));
        assert_eq!(opened.read(&dir), Err(OpenedFileError::NotAFile));
    }

    #[cfg(unix)]
    #[test]
    fn a_registered_name_cannot_point_at_an_unregistered_target() {
        let scratch = Scratch::new("symlink");
        let secret = scratch.file("secret.txt", b"private");
        let link = scratch.0.join("innocent.nc");
        std::os::unix::fs::symlink(&secret, &link).expect("symlink");
        let link = link.to_string_lossy().into_owned();
        let opened = OpenedFiles::default();
        opened.record(std::slice::from_ref(&link));
        assert_eq!(opened.read(&link), Err(OpenedFileError::UnsupportedType));
    }

    #[test]
    fn a_missing_file_is_an_i_o_error_not_a_panic() {
        let opened = OpenedFiles::default();
        opened.record(&["/definitely/not/here.nc".into()]);
        assert!(matches!(
            opened.read("/definitely/not/here.nc"),
            Err(OpenedFileError::Io(_))
        ));
    }

    #[test]
    fn a_file_over_the_limit_is_refused_without_reading_it() {
        let scratch = Scratch::new("large");
        let path = scratch.file("huge.gcode", b"");
        // A sparse file: the length is real, no disk is used.
        fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .and_then(|f| f.set_len(MAX_OPENED_BYTES + 1))
            .expect("set_len");
        let opened = OpenedFiles::default();
        opened.record(std::slice::from_ref(&path));
        assert_eq!(opened.read(&path), Err(OpenedFileError::TooLarge));
    }

    #[test]
    fn the_remembered_lists_are_bounded() {
        let opened = OpenedFiles::default();
        let paths: Vec<String> = (0..MAX_REMEMBERED + 40)
            .map(|i| format!("/f{i}.nc"))
            .collect();
        opened.record(&paths);
        let taken = opened.take();
        assert_eq!(taken.len(), MAX_REMEMBERED);
        assert_eq!(taken.first().map(String::as_str), Some("/f40.nc"));
    }
}
