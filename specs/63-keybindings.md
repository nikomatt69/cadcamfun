# 63 — Keybindings (CAD, CAM, shell)

One command catalog, one keymap, one keyboard listener. Code: `apps/desktop/src/shared/keybindings/`.

## Model

- **Catalog** (`catalog.ts`): every command has an id (`domain.action`), a scope (`global` | `cad` | `cam`), a group, default
  chords and flags (`inText`, `overDialog`, `repeat`). Labels are i18n keys `keys.cmd.<id>` (`en.keys.json`).
  The same id means the same thing on both pages: `file.save`, `file.export`, `file.import`, `edit.undo`, `edit.redo`,
  `edit.cancel`, `view.zoomIn/Out/Fit` are global and each page registers *how* it answers.
- **Chords** (`chord.ts`): canonical text (`Mod+Shift+Z`); `Mod` is Cmd on macOS, Ctrl elsewhere. Shifted symbols are the
  symbol itself (`?`), macOS Option letters are read from the physical key.
- **Keymap** (`keymap.ts`): defaults + the user's overrides. A user chord beats a default; invalid, reserved or clashing
  stored chords are dropped and reported in `issues`, never thrown. Clashes are checked per scope overlap
  (CAD and CAM may share a chord; a page and `global` may not). Reserved: quit, close, devtools, cut…
- **Service** (`service.ts`, Effect): `Keybindings` (rebind / reset / resetAll / export / import / reconcile) over the
  `KeybindingStore` port. Errors are tagged (`UnknownCommand`, `InvalidChord`, `ChordConflict`, `InvalidDocument`).
  Boot reads the **local** copy synchronously (`localStorage`); the sidecar copy (`kv` key `ui.keybindings`) is only read
  by `reconcile` once the sidecar is ready, newest `updatedAt` wins, writes are detached. A slow or absent sidecar must
  never block the boot or a rebind (regression test: `booting without the sidecar`).
- **Controller** (`controller.ts`): the only `keydown` listener (`AppState.keys`). Handlers stack per command (page over
  shell); returning `false` hands the key down. Chords with a command modifier are handled in the capture phase, plain
  keys in the bubble phase (a menu that took Esc keeps it). Guards live here: typing in a field, open dialogs,
  Space/Enter on a focused button, auto-repeat.

## Screens

- Shell: palette (lists the live commands with the user's chords), shortcuts dialog (`?`/`F1`, built from the keymap),
  native menu routing. `NATIVE_MENU` mirrors `menu.rs`: on macOS the menu bar owns its accelerators, so those menu items
  run the command (`menuCommand`) and no default may reuse their chords (tests guard both).
- Settings > Keyboard: record or type a chord, conflict with the owner's name and Reassign, reset one/all, JSON
  export/import.
- CAD canvas/page, CAM page and the 3D viewer register handlers; none of them names a key.

## Validation

- Unit: chords, catalog invariants (no default clash, no reserved chord, no native-menu chord reused, every command has
  its labels), keymap rules, the Effect service, the dispatcher (`test/keybindings.test.ts`).
- Screens: every catalog command has a registered handler (`keybindings-ui.test.ts`); CAM and CAD pages over the real
  sidecar handlers with keys pressed on the window (`keybindings-pages.test.ts`).
- Real browser (Chromium + WebGL, real sidecar): 36 checks on 2026-10-26 - CAD transform modes, select all/escape,
  boolean union and undo/redo, duplicate/delete, views, grid, snap, help dialog, palette, Settings > Keyboard rebind and
  conflict, CAM tabs (also from inside the editor), simulation Space, library, save. Recipe: standalone sidecar
  (`CADCAMFUN_TOKEN`, `CADCAMFUN_DATA_DIR`, `CADCAMFUN_MIGRATIONS_DIR`, stdin kept open), `vite --port 5199` with
  `VITE_SIDECAR_URL/TOKEN`, playwright-core with the cached chromium headless shell and `--use-angle=swiftshader`.

## Open

- Native menu accelerators are fixed in Rust; rebinding does not change them.
- Drawing-tool letter keys (L, C, …) are not commands yet (the old dialog listed keys nothing answered).
