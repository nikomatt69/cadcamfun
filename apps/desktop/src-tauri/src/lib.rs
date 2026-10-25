//! CADCAM FUN desktop shell: window, menu, tray, secure storage and the lifecycle of
//! the Bun-compiled sidecar that hosts all application logic.

mod commands;
// Public so the native-menu test (tests/native_menu.rs, a main-thread harness) can build the real menu.
pub mod menu;
mod opened_files;
mod secrets;
mod sidecar;
mod tray;
mod updater;
mod viewport_geometry;

use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, RunEvent};

use crate::opened_files::{openable_paths, OpenedFiles};
use crate::sidecar::{SidecarConfig, SidecarHandle};

/// Event name the webview listens to for files opened from the OS.
const OPEN_FILE_EVENT: &str = "open-file";

/// Remembers the paths first (a webview that is not listening yet takes them with `take_opened_files`), then tells a webview
/// that is.
fn forward_open_files(app: &AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    if let Some(opened) = app.try_state::<OpenedFiles>() {
        opened.record(&paths);
    }
    if let Err(err) = app.emit(OPEN_FILE_EVENT, paths) {
        log::warn!("failed to forward opened files: {err}");
    }
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let token = sidecar::generate_token()?;
    let handle = Arc::new(SidecarHandle::new(token));
    app.manage(Arc::clone(&handle));

    app.manage(OpenedFiles::default());
    // Windows and Linux hand a double-clicked file over as a launch argument (macOS sends `RunEvent::Opened`).
    forward_open_files(app.handle(), openable_paths(std::env::args().skip(1)));

    app.manage(updater::UpdaterService::new());
    app.manage(updater::PendingUpdate::default());
    app.manage(viewport_geometry::ViewportPreparation::default());

    let data_dir = app.path().app_data_dir()?;
    // `tauri dev` works on its own database next to the real one, so development never touches real data.
    let data_dir = if cfg!(debug_assertions) {
        let mut name = data_dir.file_name().unwrap_or_default().to_os_string();
        name.push(".dev");
        data_dir.with_file_name(name)
    } else {
        data_dir
    };
    std::fs::create_dir_all(&data_dir)?;
    let config = SidecarConfig {
        data_dir,
        migrations_dir: sidecar::resolve_migrations_dir(app.handle()),
    };
    sidecar::start(app.handle().clone(), handle, config);

    tray::create(app.handle())?;
    updater::spawn(app.handle().clone());
    Ok(())
}

/// A browser refresh bypasses the editor's native close/save guard. Keep every other keyboard and pointer action available.
#[cfg(any(not(debug_assertions), test))]
fn production_reload_guard<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_prevent_default::Builder::new()
        .with_flags(tauri_plugin_prevent_default::Flags::RELOAD)
        .build()
}

pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // Registered first so a second launch exits before touching anything else.
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            focus_main_window(app);
            forward_open_files(app, openable_paths(args));
        }));
        builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());
    }

    #[cfg(not(debug_assertions))]
    {
        builder = builder.plugin(production_reload_guard());
    }

    // Liquid Glass window material (macOS 26+, vibrancy before it); the webview asks for it once the UI has loaded.
    #[cfg(feature = "liquid-glass")]
    {
        builder = builder.plugin(tauri_plugin_liquid_glass::init());
    }

    let app = builder
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        // Native OS notifications: the webview decides when (synced Notification rows of
        // important types only); the shell only delivers them to the OS.
        .plugin(tauri_plugin_notification::init())
        // Auto-update: the shell owns the policy, the plugin owns download and
        // signature verification. See updater.rs.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .menu(menu::build)
        .on_menu_event(|app, event| menu::handle_event(app, event.id().as_ref()))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window
                    .app_handle()
                    .try_state::<updater::UpdaterService>()
                    .is_some_and(|service| service.is_installing())
                {
                    api.prevent_close();
                }
            }
        })
        .setup(setup)
        .invoke_handler(tauri::generate_handler![
            commands::get_sidecar_endpoint,
            commands::prepare_viewport_edges,
            commands::get_logs_dir,
            commands::open_path,
            commands::secret_get,
            commands::secret_set,
            commands::secret_delete,
            commands::pick_file,
            commands::save_file,
            commands::take_opened_files,
            commands::read_opened_file,
            commands::set_recent_projects,
            commands::check_for_updates,
            commands::get_update_status,
            commands::install_update,
            commands::apply_update,
            commands::restart_app,
            commands::open_release_notes,
        ])
        .build(tauri::generate_context!())
        .expect("error while building the CADCAM FUN shell");

    app.run(|app, event| match event {
        RunEvent::ExitRequested { api, .. } => {
            if let Some(updater) = app.try_state::<updater::UpdaterService>() {
                if updater.is_installing() {
                    api.prevent_exit();
                    return;
                }
                updater.shutdown();
            }
            if let Some(handle) = app.try_state::<Arc<SidecarHandle>>() {
                if !handle.is_finished() {
                    api.prevent_exit();
                    if handle.shutdown() {
                        let handle = Arc::clone(&handle);
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            handle.wait_finished().await;
                            app.exit(0);
                        });
                    }
                }
            }
        }
        RunEvent::Exit => {
            if let Some(handle) = app.try_state::<Arc<SidecarHandle>>() {
                handle.shutdown();
            }
        }
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        RunEvent::Opened { urls } => {
            let paths = urls
                .iter()
                .filter_map(|url| url.to_file_path().ok())
                .map(|path| path.to_string_lossy().into_owned());
            focus_main_window(app);
            forward_open_files(app, openable_paths(paths));
        }
        _ => {}
    });
}

#[cfg(test)]
mod reload_guard_tests {
    use super::production_reload_guard;
    use tauri::plugin::Plugin;
    use tauri::test::MockRuntime;

    #[test]
    fn reload_protection_preserves_accessibility_editing_and_native_actions() {
        let script = production_reload_guard::<MockRuntime>()
            .initialization_script()
            .expect("reload guard installs a webview script");
        assert!(script.contains("onKey('F5',"));
        assert!(script.contains("onKey('r',{ctrlKey:true"));
        // These are registrations in the generated script, rather than the Rust flag values: an upstream change cannot
        // silently turn off backwards focus traversal, find/print/open, or CAD/assistant shortcuts.
        for registration in [
            "onKey('Tab',",
            "onPointer('contextmenu'",
            "onKey('f',",
            "onKey('p',",
            "onKey('o',",
            "onKey('j',",
            "onKey('u',",
            "onKey('i',",
        ] {
            assert!(!script.contains(registration), "blocked {registration}");
        }
    }
}
