//! System tray: Show/Hide, Recent projects, Quit. The sidecar keeps running while the
//! window is hidden because it is owned by the app process, not by the window.

use serde::Deserialize;
use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::menu::{request_quit, MENU_EVENT};

const TRAY_ID: &str = "main";
const SHOW_HIDE_ID: &str = "tray.show_hide";
const QUIT_ID: &str = "tray.quit";
const RECENT_PREFIX: &str = "tray.recent.";
const MAX_RECENT: usize = 10;

#[derive(Debug, Clone, Deserialize)]
pub struct RecentProject {
    pub id: String,
    pub name: String,
}

/// Menu id for a recent project; forwarded to the webview through the `menu` event.
pub fn recent_item_id(project_id: &str) -> String {
    format!("{RECENT_PREFIX}{project_id}")
}

fn build_menu<R: Runtime>(app: &AppHandle<R>, recent: &[RecentProject]) -> tauri::Result<Menu<R>> {
    let show_hide = MenuItemBuilder::with_id(SHOW_HIDE_ID, "Show / Hide").build(app)?;
    let mut recent_menu = SubmenuBuilder::new(app, "Recent projects");
    if recent.is_empty() {
        let empty = MenuItemBuilder::with_id("tray.recent_empty", "No recent projects")
            .enabled(false)
            .build(app)?;
        recent_menu = recent_menu.item(&empty);
    }
    for project in recent.iter().take(MAX_RECENT) {
        let item =
            MenuItemBuilder::with_id(recent_item_id(&project.id), &project.name).build(app)?;
        recent_menu = recent_menu.item(&item);
    }
    let quit = MenuItemBuilder::with_id(QUIT_ID, "Quit").build(app)?;
    Menu::with_items(
        app,
        &[
            &show_hide,
            &recent_menu.build()?,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )
}

pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = build_menu(app, &[])?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("CADCAM FUN")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| handle_event(app, event.id().as_ref()));
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

pub fn set_recent_projects<R: Runtime>(
    app: &AppHandle<R>,
    recent: &[RecentProject],
) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(build_menu(app, recent)?))?;
    }
    Ok(())
}

fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let visible = window.is_visible().unwrap_or(false);
    let result = if visible {
        window.hide()
    } else {
        window.show().and_then(|()| window.set_focus())
    };
    if let Err(err) = result {
        log::warn!("failed to toggle the main window: {err}");
    }
}

fn handle_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    match id {
        SHOW_HIDE_ID => toggle_main_window(app),
        QUIT_ID => request_quit(app),
        _ if id.starts_with(RECENT_PREFIX) => {
            if let Err(err) = app.emit(MENU_EVENT, id) {
                log::warn!("failed to emit tray event {id}: {err}");
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recent_ids_are_namespaced_for_the_webview() {
        assert_eq!(recent_item_id("p-1"), "tray.recent.p-1");
        assert!(crate::menu::is_forwarded_id(&recent_item_id("p-1")));
    }
}
