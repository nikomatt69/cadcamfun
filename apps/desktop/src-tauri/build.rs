// The app manifest makes every custom command opt-in: a command is callable from
// the webview only if a capability lists its `allow-<command>` permission.
const COMMANDS: &[&str] = &[
    "get_sidecar_endpoint",
    "prepare_viewport_edges",
    "get_logs_dir",
    "open_path",
    "secret_get",
    "secret_set",
    "secret_delete",
    "pick_file",
    "save_file",
    "take_opened_files",
    "read_opened_file",
    "set_recent_projects",
    "check_for_updates",
    "get_update_status",
    "install_update",
    "apply_update",
    "restart_app",
    "open_release_notes",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
