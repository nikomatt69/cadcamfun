//! Native application menu. Items emit a `menu` event to the webview carrying the
//! stable item id (for example `file.new`); the UI maps ids to commands.

use tauri::menu::{Menu, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Runtime};
#[cfg(debug_assertions)]
use tauri::Manager;

/// Event name the webview listens to for menu activations.
pub const MENU_EVENT: &str = "menu";

/// Stable ids forwarded to the webview, with label and optional accelerator.
/// Ids are part of the UI contract: never rename one without updating the UI.
const FILE_ITEMS: &[(&str, &str, Option<&str>)] = &[
    ("file.new", "New", Some("CmdOrCtrl+N")),
    ("file.open", "Open...", Some("CmdOrCtrl+O")),
    ("file.save", "Save", Some("CmdOrCtrl+S")),
    (
        "file.export_gcode",
        "Export G-code...",
        Some("CmdOrCtrl+Shift+E"),
    ),
];

const VIEW_ITEMS: &[(&str, &str, Option<&str>)] = &[
    ("view.zoom_in", "Zoom In", Some("CmdOrCtrl+=")),
    ("view.zoom_out", "Zoom Out", Some("CmdOrCtrl+-")),
    ("view.zoom_fit", "Zoom to Fit", Some("CmdOrCtrl+0")),
    ("view.preset_top", "Top View", Some("CmdOrCtrl+1")),
    ("view.preset_front", "Front View", Some("CmdOrCtrl+2")),
    ("view.preset_right", "Right View", Some("CmdOrCtrl+3")),
    ("view.preset_iso", "Isometric View", Some("CmdOrCtrl+4")),
    (
        "view.toggle_left_panel",
        "Toggle Left Panel",
        Some("CmdOrCtrl+B"),
    ),
    (
        "view.toggle_right_panel",
        "Toggle Right Panel",
        Some("CmdOrCtrl+Alt+B"),
    ),
    ("view.toggle_console", "Toggle Console", Some("CmdOrCtrl+J")),
];

const HELP_ITEMS: &[(&str, &str, Option<&str>)] = &[
    ("help.documentation", "Documentation", None),
    ("help.open_logs", "Show Logs Folder", None),
];

/// Handled natively in debug builds only; never forwarded.
const DEVTOOLS_ID: &str = "view.devtools";

/// Ids that are forwarded to the webview verbatim.
pub fn is_forwarded_id(id: &str) -> bool {
    [FILE_ITEMS, VIEW_ITEMS, HELP_ITEMS]
        .iter()
        .flat_map(|items| items.iter())
        .any(|(item_id, _, _)| *item_id == id)
        || id.starts_with("tray.recent.")
}

fn add_items<'a, R: Runtime, M: tauri::Manager<R>>(
    mut builder: SubmenuBuilder<'a, R, M>,
    manager: &M,
    items: &[(&str, &str, Option<&str>)],
) -> tauri::Result<SubmenuBuilder<'a, R, M>> {
    for (id, label, accelerator) in items {
        let mut item = MenuItemBuilder::with_id(*id, *label);
        if let Some(accelerator) = accelerator {
            item = item.accelerator(*accelerator);
        }
        builder = builder.item(&item.build(manager)?);
    }
    Ok(builder)
}

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let mut file = SubmenuBuilder::new(app, "File");
    file = add_items(file, app, FILE_ITEMS)?;
    if !cfg!(target_os = "macos") {
        file = file.separator().quit();
    }

    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all();

    let mut view = SubmenuBuilder::new(app, "View");
    view = add_items(view, app, VIEW_ITEMS)?;
    if cfg!(debug_assertions) {
        let devtools = MenuItemBuilder::with_id(DEVTOOLS_ID, "Toggle Developer Tools")
            .accelerator("CmdOrCtrl+Alt+I")
            .build(app)?;
        view = view.separator().item(&devtools);
    }

    let window = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window();

    let mut help = SubmenuBuilder::new(app, "Help");
    help = add_items(help, app, HELP_ITEMS)?;

    let menu = Menu::new(app)?;
    if cfg!(target_os = "macos") {
        let application = SubmenuBuilder::new(app, "CADCAM FUN")
            .about(None)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?;
        menu.append(&application)?;
    }
    menu.append(&file.build()?)?;
    menu.append(&edit.build()?)?;
    menu.append(&view.build()?)?;
    menu.append(&window.build()?)?;
    menu.append(&help.build()?)?;
    Ok(menu)
}

/// Application-level menu handler. Tray ids are handled in `tray.rs`.
pub fn handle_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if id.starts_with("tray.") {
        return;
    }
    #[cfg(debug_assertions)]
    if id == DEVTOOLS_ID {
        if let Some(window) = app.get_webview_window("main") {
            if window.is_devtools_open() {
                window.close_devtools();
            } else {
                window.open_devtools();
            }
        }
        return;
    }
    if is_forwarded_id(id) {
        if let Err(err) = app.emit(MENU_EVENT, id) {
            log::warn!("failed to emit menu event {id}: {err}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn ids_are_unique_and_namespaced() {
        let mut seen = HashSet::new();
        for (id, _, _) in [FILE_ITEMS, VIEW_ITEMS, HELP_ITEMS]
            .iter()
            .flat_map(|items| items.iter())
        {
            assert!(seen.insert(*id), "duplicate menu id {id}");
            assert!(id.contains('.'), "menu id {id} must be namespaced");
        }
    }

    #[test]
    fn forwards_only_known_ids() {
        assert!(is_forwarded_id("file.new"));
        assert!(is_forwarded_id("view.zoom_in"));
        assert!(is_forwarded_id("tray.recent.abc"));
        assert!(!is_forwarded_id(DEVTOOLS_ID));
        assert!(!is_forwarded_id("tray.quit"));
        assert!(!is_forwarded_id("1234"));
    }
}
