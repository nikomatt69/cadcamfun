//! The native menu bar as the shell builds it, on Tauri's mock runtime (no window opens). A native menu can only be created on the
//! main thread, so this test has its own `main` instead of the default harness.

use cadcamfun_desktop_lib::menu::{build, CHECK_UPDATES_ID, QUIT_ID, RELEASE_NOTES_ID};
use tauri::menu::{Menu, MenuItemKind};
use tauri::test::{mock_app, MockRuntime};

/// The text of a menu item (one level down: the items sit in the submenus of the bar).
fn find(menu: &Menu<MockRuntime>, id: &str) -> Option<String> {
    for kind in menu.items().expect("menu items") {
        if let MenuItemKind::Submenu(submenu) = kind {
            if let Some(MenuItemKind::MenuItem(item)) = submenu.get(id) {
                return item.text().ok();
            }
        }
    }
    None
}

fn main() {
    let app = mock_app();
    let menu = build(app.handle()).expect("the menu builds");

    // Help carries the update items, and the existing items are still there.
    assert_eq!(
        find(&menu, CHECK_UPDATES_ID).as_deref(),
        Some("Check for Updates...")
    );
    assert_eq!(
        find(&menu, RELEASE_NOTES_ID).as_deref(),
        Some("Release Notes")
    );
    assert!(
        find(&menu, "file.new").is_some(),
        "File > New is in the menu"
    );
    assert!(
        find(&menu, "help.open_logs").is_some(),
        "Help > Show Logs Folder is in the menu"
    );

    // Quit is the shell's own item on every platform (the predefined one skips the window's close request on macOS).
    assert_eq!(find(&menu, QUIT_ID).as_deref(), Some("Quit CADCAM FUN"));

    // On macOS the application menu (the first one) has Check for Updates too, as the platform expects.
    #[cfg(target_os = "macos")]
    {
        let first = menu
            .items()
            .expect("items")
            .into_iter()
            .next()
            .expect("the application menu");
        let MenuItemKind::Submenu(application) = first else {
            panic!("the first menu is the application menu")
        };
        assert!(
            matches!(
                application.get(CHECK_UPDATES_ID),
                Some(MenuItemKind::MenuItem(_))
            ),
            "the application menu has Check for Updates"
        );
    }
    println!("native menu: ok");
}
