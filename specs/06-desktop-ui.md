# WP6 + WP7 — Desktop UI (`apps/desktop`)

## Assistant controls (2026-10-10)

See `24-assistant-control-flow.md`: WP6 adds role/domain/thinking selectors, manual context compaction, interactive native question replies and background task cancellation in the existing assistant. Controls remain bound to the active session/project and generated API; context follows host limits, with unknown values explicit. Status: in progress. Change log: 2026-10-10 — registered assistant control UI ownership before implementation.

## Bootstrap and graphics performance alignment (2026-10-09)

WP6/WP7 follow-up from `23-ai-runtime-architecture.md`: each bootstrap attempt owns late-acquired resources and cancellable network work; credentials belong to a client instance. Meshing jobs are bounded, errors/timeouts close pending work, superseded scene work is terminated, and static views avoid redundant GPU rendering. Preserve existing controls, editor behavior and display appearance. CADCanvas owns a demand-driven frame scheduler: idle scenes schedule no frames, hidden documents suspend rendering, and orbit damping wakes only until settled. Scene teardown releases owned geometries, materials and textures once and cancels pointer/fullscreen callbacks.


Status: core flows implemented and tested (83 desktop tests). Boot/runtime with the generated typed client and the browser fake, the app shell, and the Projects, CAD, CAM, Library and Settings screens are working end to end against the contract; the 3D viewport plays back toolpaths, and the 2D editor drives the tool state machines. Remaining work is the long tail of legacy pages, which are still generated stubs rather than implemented screens.

Visual status (2026-10-08): compact CAD/CAM workstation chrome implemented in WP6-owned components; geometry, state and viewport rendering remain unchanged.

Both workspaces also share the generator inspector's blue glass tab treatment and the CAD quick-navigation menu, now available at the bottom of the CAM sidebar. Navigation and panel content scroll independently; collapse controls stay available.

- **WP6** owns `apps/desktop/src/app/`, `src/screens/`, `src/components/`, `src/state/`, `src/i18n/` — app shell, navigation, project/library screens, forms, API wiring.
- **WP7** owns `apps/desktop/src/viewport/` — 2D drawing canvas, 3D viewport, toolpath preview.
- Shared by both (edited only by whoever creates it first, then frozen): `apps/desktop/package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`.

Stack: **SolidJS** (`solid-js`, `@solidjs/router`, `vite-plugin-solid`), TypeScript strict, Tailwind CSS, Solid signals/stores for UI state, plain Three.js (no React wrappers) for 3D, Canvas2D or Pixi for the 2D editor (WP7 decides, documents it here). **Parity requirement:** the UI is visually and functionally identical to the legacy React UI (`.reference/src/components`, `.reference/src/pages`, `.reference/src/styles`, tailwind config, fonts and icons from `public/`) — same layout, screens, routes, copy, shortcuts and styling — re-implemented component-by-component in Solid (no React, no Next.js). Tests use `@solidjs/testing-library`. Data access only through `ApiClient` from `@cadcamfun/api` (typed, Effect-based); the UI runs effects with a single app `ManagedRuntime`.

Legacy reference (behaviour/layout inspiration only): `.reference/src/components/{cad,cam,layout,library,materials,production-costs,simulation,settings,ai}/`, `.reference/public/cursors/`, `.reference/src/store/`, `.reference/src/hooks/canvas/`.

## 1. App shell (WP6)

- Boot sequence: Tauri command `get_sidecar_endpoint` → `{ baseUrl, token }` → build `ApiClient.layer` → `GET /health` → render. Show a splash with error and "Retry"/"View logs" only after the sidecar has stayed unreachable for 150 s: until then the splash keeps re-resolving the endpoint and retrying (the shell waits up to 60 s for each start, and the host's SDK is loaded lazily so the API answers first), showing the seconds waited and a readable reason.
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

- 2026-10-10: WP6 floating-tool refinement owns `src/cad/components/FloatingToolbar.tsx`: captured pointer drag isolated from canvas input, layout-coordinate bounds, re-clamping on canvas/tool-window resize, keyboard movement and a single compact content scroller. The AI tab opens the existing assistant dock.

- 2026-10-10: WP6 owns the compact CAD ribbon in `src/cad/components/CadRibbon.tsx`, its integration in `src/cad/CadPage.tsx`, controlled operation selection in `src/cad/components/SurfacingPanel.tsx`, CAD locale entries and shared workstation styling. The 54px strip exposes existing modeling operations, booleans and section controls, with parameters in the inspector; no geometry or renderer changes are required. WP6 also owns the container-responsive layout of `src/cam/components/MachineCycles.tsx`: stacked configuration at sidebar widths, readable cycle rows and two columns only in wide containers.

- 2026-10-10: restored an opaque blue primary-button backdrop when the calmer finish removes gradients; native glass neutral surfaces now pair their foreground with the light/dark theme. This fixes white labels disappearing on the white dashboard surface without changing navigation or layout.

- 2026-10-10: visual refinement complete in shared desktop styles: opaque white light-theme shell, native glass chrome, page cards and workspace panels; compact shared surface radii, square joined workspace edges and stable tab radii across hover/focus. Dark-theme colors, viewport rendering, layout and behavior are preserved. Verification: both workstation tests pass and `git diff --check` passes; the full desktop test run encountered timeouts, and typecheck/build have not returned a result. Native visual verification remains outstanding.

- 2026-10-08: shared page-consistency stylesheet applies compact surface/control radii, neutral borders, aligned controls and generator-style glass tabs to page and standalone route containers; CAD/CAM workspace-specific styles remain isolated. Individual route visual verification remains outstanding; no browser control used.

- 2026-10-08 follow-up: extracted the existing CAD quick-navigation routes into keyboard-reachable `components/workspace-navigation.tsx` and reused them in CAM. All sidebar/inspector tabs and CAM workspace tabs share the generator inspector's neutral inactive, outlined charcoal hover/focus, and translucent blue selected rectangle with bottom underline. Added source-contract regression tests for shared navigation, tab styling and narrow-window stage protection; browser verification intentionally not performed per user instruction.
- 2026-10-08: library indexes and material/tool/machine detail cards use shared screen headers, neutral theme surfaces, compact controls and responsive data rows. Legacy CAM/toolpath chrome now uses shell surfaces and compact panel/button radii; Quick Navigation matches sidebar control spacing and contrast without hover translation. No API or machining behavior changes.
- 2026-10-08: component index/detail styling aligned with shared screen headers, card/form controls, brand and gray theme tokens, responsive spacing, visible link focus, and bounded data panels; API calls and interactions are unchanged. Route audit: `/components` and `/components/:id` use `legacy-components.tsx`; `/materials`, `/tools`, `/machine` use `library.tsx` and their detail routes use `library-detail-screen.tsx` (separately owned); `/toolpaths` and `/toolpaths/:id` both still use `screens/cam.tsx`, left unchanged to preserve the CAM workspace.
- 2026-10-08: modest CAD/CAM visual polish, preserving blue accents and light/dark identity. Shared `components/workstation.css` reduces toolbar padding, panel gaps, shadows and radii, aligns 12px control typography, and gives properties/generator sections clearer hierarchy. Sidebars use responsive CSS widths without delayed slide-away transforms; narrow windows retain a 320px minimum stage in a horizontally scrollable workspace with all collapse controls preserved. CAD browser type metadata moves below the name, CAM inline assignment actions wrap, and shared row actions remain visible on keyboard focus and touch. No geometry, state, API, or viewport rendering changes; existing dirty `AdvancedSection.tsx` and `project-detail.tsx` edits are untouched.
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
  - Units and tolerance: the display unit (mm, µm, cm, m, inch, thou; everything stays millimetres inside) and the drawing tolerance are selected in the "Document & Origin" block of both sidebars and shown in the strip. `state/document-settings.ts` is the one place that changes them: settings, the 3D view (curves are meshed to the tolerance), the CAM generator and the verification default, and the stored drawing carry the same values.
  - Generator panel by machine: the origin section shows the mill's work offset and origin, the lathe's Z zero, or the printer's plate origin and size; mills can pick a touch probe or tool setter and the probing operation with its cycle settings.
  - Request bodies built from editor elements go through `state/json-safe.ts`, so an element holding `undefined`, NaN, typed arrays or cycles can no longer stop the generator ("Expected JSON value at ...").

## Folder roles (`src/pages`, `src/screens`, `src/cad`, `src/cam`)

- `src/pages/` holds one-line route adapters, one file per legacy Next.js page path (66 routes; `test/app-mount.test.ts` checks the route table against these files). A page only re-exports a screen or a feature page; it contains no logic.
- `src/screens/` holds the implemented screens of the app shell (projects, library, costs, plugins, auth, ...), all through the typed `ApiClient`.
- `src/cad/` and `src/cam/` are feature folders (editor and CAM workspace with their own stores, components and viewport code); their entry points are re-exported by `pages/cad.tsx` and `pages/cam.tsx`.
- New logic goes in a screen or a feature folder, never in `pages/`.
- Sessions and billing: `state/session.ts` keeps the session token (a `Ref` read per request by the client middleware, mirrored to `localStorage`) and `startSession` / `endSession` switch accounts and drop the query cache. Sign-in, sign-up (signs in right after creating the account), magic-link verification and sign-out use them; the navbar shows the acting account with Sign in / Sign out. The pricing page renders the same plan catalogue as the subscription card (`screens/plans.ts`), marks the current plan, starts the Pro trial through `POST /api/subscriptions` and says plainly when paid checkout is unavailable.

Secondary resources follow nikcli ownership: queries accept cancellation through the app Effect runtime, superseded requests and unmounted views interrupt their fibers, and hidden CAD plugin panels do not fetch a registry. AI catalogue resources are loaded when their accessor is first used; connected models are preferred, and providers are sorted by configured status.

- 2026-10-10: compact CAD commands also expose Edit (Duplicate / Copy / Paste), Parametric part, Sketch (Line / Circle / Rectangle) and Solids (Box / Cylinder / Sphere / Cone / Torus), reusing ElementForm and the element clipboard. Creation respects the active layer lock. Remaining Italian user-facing strings in CAD simulation, CAM generator examples/errors, and settings feedback are translated to English.
