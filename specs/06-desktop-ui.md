# WP6 + WP7 — Desktop UI (`apps/desktop`)

Status: core flows implemented and tested (83 desktop tests). Boot/runtime with the generated typed client and the browser fake, the app shell, and the Projects, CAD, CAM, Library and Settings screens are working end to end against the contract; the 3D viewport plays back toolpaths, and the 2D editor drives the tool state machines. Remaining work is the long tail of legacy pages, which are still generated stubs rather than implemented screens.

- **WP6** owns `apps/desktop/src/app/`, `src/screens/`, `src/components/`, `src/state/`, `src/i18n/` — app shell, navigation, project/library screens, forms, API wiring.
- **WP7** owns `apps/desktop/src/viewport/` — 2D drawing canvas, 3D viewport, toolpath preview.
- Shared by both (edited only by whoever creates it first, then frozen): `apps/desktop/package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`.

Stack: **SolidJS** (`solid-js`, `@solidjs/router`, `vite-plugin-solid`), TypeScript strict, Tailwind CSS, Solid signals/stores for UI state, plain Three.js (no React wrappers) for 3D, Canvas2D or Pixi for the 2D editor (WP7 decides, documents it here). **Parity requirement:** the UI is visually and functionally identical to the legacy React UI (`.reference/src/components`, `.reference/src/pages`, `.reference/src/styles`, tailwind config, fonts and icons from `public/`) — same layout, screens, routes, copy, shortcuts and styling — re-implemented component-by-component in Solid (no React, no Next.js). Tests use `@solidjs/testing-library`. Data access only through `ApiClient` from `@cadcamfun/api` (typed, Effect-based); the UI runs effects with a single app `ManagedRuntime`.

Legacy reference (behaviour/layout inspiration only): `.reference/src/components/{cad,cam,layout,library,materials,production-costs,simulation,settings,ai}/`, `.reference/public/cursors/`, `.reference/src/store/`, `.reference/src/hooks/canvas/`.

## 1. App shell (WP6)

- Boot sequence: Tauri command `get_sidecar_endpoint` → `{ baseUrl, token }` → build `ApiClient.layer` → `GET /health` → render. Show a splash with error and "Retry"/"View logs" if the sidecar isn't ready within 15 s.
- Layout: title bar (native menus from the shell, in-window fallback on Windows/Linux), left activity bar (Projects, CAD, CAM, Library, Costs, AI, Plugins, Settings), main area, bottom status bar (units, snap state, cursor coords, sidecar status).
- Screens: **Projects** (list/create/open/rename/delete, recent), **CAD editor** (WP7 canvas + tool palette, layers panel, properties panel), **CAM workspace** (operation list, parameters form generated from WP2 Schemas, toolpath preview, G-code view with export), **Library** (materials, tools, machine configs, components), **Costs** (estimate form + breakdown), **AI panel** (docked chat, streaming), **Plugins**, **Settings** (units, theme, locale, post-processor defaults).
- Forms are generated from the Effect Schemas where possible (one small `SchemaForm` component) so parameters never drift from the core definitions.
- State: server data lives in the API (no duplicated caches beyond a lightweight query cache keyed by endpoint + params); undo/redo history for the editor is client state (command pattern over `Drawing` patches, max 200 steps).
- Theming: light/dark/system via CSS variables; every colour as a token; keyboard-first (command palette `Cmd/Ctrl+K`, shortcuts table in settings).
- i18n: `src/i18n/en.json` only for v6.0, keyed strings, no inline literals in components (lint rule).
- Accessibility: all interactive controls keyboard reachable and labelled; focus ring visible.

## 2. Viewport (WP7)

2D editor (`viewport/editor2d/`):
- Pan/zoom (wheel, pinch, space-drag), grid (dots/lines, major spacing) and rulers, units-aware.
- Tools: select (click, box, add/remove), line, polyline, rectangle, circle, arc (3-point and centre-start-end), ellipse, text, dimension, move/rotate/scale/mirror, offset, trim/extend, fillet/chamfer — each tool is a small state machine `{ onPointerDown, onPointerMove, onPointerUp, onKey, preview() }` that emits **commands** (pure patches) executed against the document; tools never mutate state directly.
- Snapping uses `findSnap` from `@cadcamfun/core`; render snap markers; 60 fps with 10 000 entities (spatial index: uniform grid or R-tree in `viewport/spatial/`).
- Cursors from `public/cursors/*.svg` (kept in the repo).

3D viewport (`viewport/view3d/`):
- Three.js scene with orbit/pan/zoom, view presets (perspective, top, front, right, isometric, four-view), axes gizmo, grid plane, stock box, workpiece origin marker.
- Renders `meshOf(solid)` output from WP1 and tessellated drawing entities extruded on demand.
- Toolpath preview: draws the WP2 IR as line segments (rapids dashed/colour-coded, cuts solid, arcs tessellated), with a scrub slider and play/pause animating a tool marker along the path; no material-removal simulation in v6.0.
- All geometry buffers built off the main thread when > 50 000 vertices (Worker with transferable `Float32Array`).

Performance budget: first interactive paint < 1.5 s after sidecar ready on a 2020 laptop; no frame over 16 ms during pan/zoom with the reference drawing in `apps/desktop/test/fixtures/large-drawing.json` (WP7 creates it).

## 3. Testing

- Unit tests (`bun test`) for tool state machines, command patches, undo/redo, SchemaForm, spatial index, cursor→snap pipeline (no DOM).
- Component tests with `@solidjs/testing-library` + `happy-dom` for screens against an in-memory fake `ApiClient`.
- One end-to-end smoke test (Playwright against the Vite dev server with the fake API) covering: create project → draw rectangle → create profile operation → see G-code.
- WP6/WP7 develop against a **fake `ApiClient`** (in-memory `Layer`) until WP4 lands; the fake lives in `apps/desktop/src/testing/fake-api.ts`.

## 4. Acceptance criteria

- `bun run --filter @cadcamfun/desktop dev` serves the UI in a browser with the fake API; `build` produces a static bundle for Tauri.
- All 2D tools above work with undo/redo, and the resulting `Drawing` round-trips through the WP1 Schema.
- Keyboard-only workflow for create project → draw → generate → export works.

## 5. Change log

- v1: initial spec.
- Editor core implemented and tested without a canvas or a DOM (`bun test`, 54 tests):
  - `src/state/commands.ts` + `src/state/history.ts`: the command pattern and a
    snapshot-based undo/redo capped at the spec's 200 steps. `undo` walks recorded
    documents backwards instead of deriving inverses, so an entity edited twice can
    never be restored to the wrong state; dropping the oldest steps keeps the base
    document and reports how many were dropped.
  - `src/viewport/spatial/grid.ts`: exact uniform-grid index. Items too large to
    enumerate per cell (a stock box) are tracked aside and still returned by every
    query; 10 000 entities build and query without a linear scan.
  - `src/viewport/editor2d/tools/`: tools as `{ onPointerDown, onPointerMove,
    onPointerUp, onKey, preview, command, status }` state machines that return
    `Command`s and never touch the document. Shift constrains lines and rectangles,
    gesture ids never collide, and a polyline commits only once it has two points.
  - `src/components/schema-form.ts`: derives the CAM parameter form from the WP2
    `Schema.Class` AST — kinds, enum literals, bounds (including the *exclusive*
    `isGreaterThan` bounds used by `totalDepth`/`stepdown`) and which fields have
    constructor defaults. Decoding goes through `decodeUnknownExit`, so a bad value
    can never throw inside the editor.
- Conventions learned the hard way: `mirror(entity, origin, angle)` reflects about
  the line **through** `origin` at `angle` radians, so a vertical axis is `π/2`;
  `Schema.optional(X)` is a `Union` of `X` and `Undefined`, which the form
  description has to unwrap.
- Integration screens for the groups the sidecar now serves, all through the typed `ApiClient` (`src/screens/`): `plugins.tsx` (`/plugins` list with enable/disable and zip install via multipart `FormData`, `/plugins/:id` with manifest, JSON configuration and uninstall), `costs.tsx` (`/costs`: pick a toolpath, calculate, save, saved estimates), `organizations.tsx` (`/organizations`, `/create`, `/:id`), `waitlist.tsx`, `auth.tsx` (forgot password, magic link, reset password, verify e-mail; they show the development link the sidecar echoes when `CADCAMFUN_DEBUG_LINKS` is on) and `analytics.tsx` (`/analytics`, sidecar metrics). `/costs` was missing from the route table and is now registered. `apps/sidecar/test/typed-client.test.ts` runs the generated client against the real handlers (including the multipart install), so a contract drift fails a test instead of a screen. Not covered yet: the in-memory fake (`testing/fake-api.ts`) still answers 501 for these groups, so they only work against a live sidecar; no DOM component tests exist for them.
- Model browser and status strips (CAD and CAM share them):
  - `cad/lib/browser.ts` holds the rules (Bodies / Sketches / Components by element type, grouping by type / layer / flat, isolate, show all, rename, bulk toggle); `cad/components/browser/` holds the shared state (`createBrowser()`) and the pieces (`BrowserToolbar`, `BrowserSections`, `RowActions`, `RenameName`, `OriginBlock`). The CAD `CADElementExplorer` and the CAM `CamElementExplorer` both render them, so every function (rename in place, lock, hide, duplicate, delete, isolate, show all, group / ungroup, move to layer, layer create / activate / hide / lock / delete, axes / grid / dimensions toggles) exists in both sidebars. CAM keeps its own tool, material and generate controls.
  - `components/workspace-strip.tsx` is the one-row (`h-6`, never wrapping) information strip. CAD (`StatusBar`): mode, transform tool, material, stock, grid / axes / dimensions toggles, layer, counts, selection (type, id, size), cursor, shortcuts. CAM (`CamStatusBar`): view, lines, moves, cut length, time, min Z, tool, rpm, feed, material, stock, post, work offset, selection, last verification verdict, simulation clock. The shell footer keeps units, snap and the sidecar state.
  - CAM sidebar "Verify" tab (`VerifyPanel`): holder fields (blank = not modelled), the verdict, issues worst first, volumes, the remaining-stock height map with gouges in red, a stale marker when the G-code changed after the report.
  - Assistant integration: the CAD and CAM pages share the open document with the assistant (`documentStore`), the assistant's context is built from the live stores, its CAD and CAM tool results are mirrored into the editor, the generator, the G-code editor and the Verify tab, and the browser toolbar and the Verify tab have "ask the assistant" buttons (spec 08, "Workspace integration"). The CAM page's editor follows `camStore.gcode`, so G-code set by the assistant appears without reloading.
