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

## Guards

- No screen listens to the whole window for its own commands: `keybindings-ui.test.ts` scans the sources and fails on a new
  window/document `keydown` listener outside an explicit list of widget listeners (modals, menus, the recorder, held
  modifiers), each with its reason. The elements list used to read arrows/Enter/Esc from the window; it now keeps them on
  its panel.
- Persistence and sync were checked in a real browser: a rebind is saved locally and published to `ui.keybindings`,
  survives a reload, is adopted by a machine with empty storage, and Reset all is published; with a Windows platform the
  command key is Ctrl (title bar, dialog, palette, undo/redo, boolean chord) and the Windows key is not.

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

## Drawing tools

`cad.draw.line` (L), `cad.draw.circle` (C), `cad.draw.rectangle` (B) start a two-click tool on the work plane
(`features/cad/lib/draw-tools.ts`, handlers in `CADCanvas`): click the first point, a rubber band follows the cursor, click
the second and the element is added (a line carries on from its end). Esc drops the point, a second Esc leaves the tool.
The clicks snap; the start of a line is the anchor that perpendicular, tangent and parallel need, so those three now
apply while drawing a line. Checked in a real browser: a line drawn from a start point with perpendicular on ends exactly
on the wall (same x, y on the wall).

## Snap points

Each kind of the Snap Settings panel is a command (`cad.snap.type.*`, Alt+G/E/M/I/C/Q/N/T/P; `Alt+S` is the master
switch) and the panel shows the user's chord. The engine (`features/cad/lib/enanchedSnapService.ts`) is covered by
`cad-snap.test.ts`: grid, endpoint, midpoint, centre, quadrant, nearest, intersection, horizontal/vertical, equidistant on
lines, circles, rectangles, cubes, spheres, cylinders, cones and tori, plus perpendicular, tangent and parallel, which are
relative to a start point (`snapPoint(point, elements, settings, anchor)`); the panel marks them with an arrow, and the
line tool supplies the start point. The tolerance of the panel is in pixels: the canvas converts it to model units with the
scale of the work plane under the cursor, so a snap pulls the same distance on screen at any zoom. Snapping runs
while a part is dragged over the canvas or placed, and while a part is moved with the gizmo: its pivot catches the named
points of the other parts (`snapPointAlongAxes`, distance measured on the dragged axes only; the grid and `nearest` stay
out of a drag) and the marker shows which one. Checked in a real browser: dragging a cube's X handle toward another cube
stops at its corner exactly (x = 50).
Fixed on the way: line-circle crossings (computed perpendicular to the line), tangent points (asin instead of acos),
`nearest` shadowing every other snap, equidistant dropping far-apart pairs, no marker for quadrant/nearest/parallel.

## Open

- Click-to-place after a creation key is not a mode (the form takes the position).

## Library placement and relative move snaps

Built-in structural library records are converted at the desktop library adapter into parametric histories. Preview and
placement use the same geometry, dimensions, axis convention and boolean cuts; editor-authored component documents retain
their own transforms and children. Placement targets the geometric centre of the part, as it does for saved components.
The adapter preserves the solids described by the catalogue; it does not invent unspecified grooves or mounting holes.

The gizmo supplies its initial pivot as the reference for perpendicular, tangent and parallel snaps. Named-point alignment
continues to measure distance only on the dragged axes. Relative snaps must also satisfy the locked coordinates: projecting
an unreachable tangent or perpendicular point onto a locked axis would falsely advertise a geometric relation.
Placement uses the previous placed part's pivot as its reference, excluding that part from self-snapping. Cancelling clears
the placement reference; removing the reference part leaves no anchor. Model coordinates remain independent of the scene's
origin offset. Pure geometry stays synchronous; the existing Effect keybinding and sidecar services keep their contracts.

## Change log

- 2026-10-26: resumed validation of structural-part placement and relative snaps for placement and gizmo movement.
