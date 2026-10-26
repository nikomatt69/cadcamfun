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
- Exhaustive: every default chord of every command on macOS and Windows/Linux, the text-field and page guards, and a
  rebind-then-reset of every command (`keybindings.test.ts`).
- Rust: `cargo test --test native_menu` (accelerator update).
- Real browser (Chromium + WebGL, real sidecar): 41 checks on 2026-10-26 - CAD transform modes, select all/escape,
  boolean union and undo/redo, duplicate/delete, views, grid, snap, help dialog, palette, Settings > Keyboard rebind and
  conflict, CAM tabs (also from inside the editor), simulation Space, library, save. Recipe: standalone sidecar
  (`CADCAMFUN_TOKEN`, `CADCAMFUN_DATA_DIR`, `CADCAMFUN_MIGRATIONS_DIR`, stdin kept open), `vite --port 5199` with
  `VITE_SIDECAR_URL/TOKEN`, playwright-core with the cached chromium headless shell and `--use-angle=swiftshader`.

## Native menu

`NATIVE_MENU` (catalog) lists the menu items that are commands. At boot and on every change the shell sends the keymap to
the menu bar (`app/native-menu.ts` -> Rust `set_menu_accelerators`): each item shows, and takes, the first chord of its
command that has a command modifier (a plain key would be taken away from text fields). The static Rust accelerators
are only the pre-sync defaults. The in-window menu of Windows/Linux shows the same chords.

## Creation keys

`cad.create.*` (Shift+L line, C circle, R rectangle, B box, Y cylinder, O sphere, N cone, T torus, P parametric) open
the same part form as the ribbon buttons, whose tooltips show the user's chord. Plain letters stay with the transform
commands (G/R/S/X/Y/Z) and F (fit).

## Platform keys

`Mod` is the platform's command key. Typing `Ctrl+K` on Windows/Linux or `Cmd+K` on macOS names `Mod+K`; `Ctrl` on macOS
and `Meta`/`Win` elsewhere are separate keys.

## Snap points

Each kind of the Snap Settings panel is a command (`cad.snap.type.*`, Alt+G/E/M/I/C/Q/N/T/P; `Alt+S` is the master
switch) and the panel shows the user's chord. The engine (`features/cad/lib/enanchedSnapService.ts`) is covered by
`cad-snap.test.ts`: grid, endpoint, midpoint, centre, quadrant, nearest, intersection, horizontal/vertical, equidistant on
lines, circles, rectangles, cubes, spheres, cylinders, cones and tori, plus perpendicular, tangent and parallel, which are
relative to a start point (`snapPoint(point, elements, settings, anchor)`); the panel marks them with an arrow because
nothing in the canvas supplies a start point yet (no interactive line drawing), so they never apply there. Snapping runs
while a part is dragged over the canvas or placed; moving with the gizmo only has the grid constraint.
Fixed on the way: line-circle crossings (computed perpendicular to the line), tangent points (asin instead of acos),
`nearest` shadowing every other snap, equidistant dropping far-apart pairs, no marker for quadrant/nearest/parallel.

## Open

- Click-to-place after a creation key is not a mode (the form takes the position).
- Perpendicular/tangent/parallel need a start point: they apply once a flow supplies one (interactive line drawing).
- The gizmo move does not use the point snaps (endpoint, midpoint...), only the grid constraint.
- The built-in library components of type `extrusion` have no 3D preview, so "Place" does not start a placement for them.
