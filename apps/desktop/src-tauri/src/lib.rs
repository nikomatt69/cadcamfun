//! CADCAM FUN desktop shell: window, menu, tray, secure storage and the lifecycle of
//! the Bun-compiled sidecar that hosts all application logic.

mod commands;
mod menu;
mod secrets;
mod sidecar;
mod tray;
mod updater;
mod viewport_geometry;

use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, RunEvent};

use crate::sidecar::{SidecarConfig, SidecarHandle};

/// File extensions the app registers for; used to pick paths out of launch arguments.
const OPENABLE_EXTENSIONS: &[&str] = &["cadcam", "nc", "gcode"];
/// Event name the webview listens to for files opened from the OS.
const OPEN_FILE_EVENT: &str = "open-file";

fn openable_paths<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .filter(|arg| {
            std::path::Path::new(arg)
                .extension()
                .map(|e| {
                    OPENABLE_EXTENSIONS.contains(&e.to_string_lossy().to_ascii_lowercase().as_str())
                })
                .unwrap_or(false)
        })
        .collect()
}

fn forward_open_files(app: &AppHandle, paths: Vec<String>) {
    if !paths.is_empty() {
        if let Err(err) = app.emit(OPEN_FILE_EVENT, paths) {
            log::warn!("failed to forward opened files: {err}");
        }
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
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        // Auto-update: the shell owns the policy, the plugin owns download and
        // signature verification. See updater.rs.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .menu(menu::build)
        .on_menu_event(|app, event| menu::handle_event(app, event.id().as_ref()))
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
            commands::set_recent_projects,
            commands::check_for_updates,
            commands::install_update,
        ])
        .build(tauri::generate_context!())
        .expect("error while building the CADCAM FUN shell");

    app.run(|app, event| match event {
        RunEvent::ExitRequested { api, .. } => {
            if let Some(updater) = app.try_state::<updater::UpdaterService>() {
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
            forward_open_files(app, openable_paths(paths));
        }
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
