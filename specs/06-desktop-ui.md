# WP6 + WP7 — Desktop UI (`apps/desktop`)

## CAD/CAM refinement and operation tooling (2026-10-26)

Status: in progress. Owner-requested refinement covers CADCanvas, CadPage, CamPage,
ToolpathVisualizer and their shared viewport chrome, locale and regression checks.
WP6/WP7 also own the tool-source adapters in the CAM page and viewport. Every
operation must replay with its own configured cutter/model. Imported NC uses
declared tool headers, then unambiguous cycle/probe evidence from the shared CAM
resolver (WP2 contract in `04-core-cam.md`), then an explicitly assumed model.
Do not substitute the current generator's tool into unrelated imported operations.
Preserve explicit tools even when incompatible and report their operation issues.
Drawing, stock removal, collision checks and active-tool readout must agree.
Manual simulation navigation cancels automatic resumption; timeline seeking works
with pointer and keyboard. Overlay controls must fit the available stage without
overlapping the shared viewport controls. Late loads/parses cannot replace newer
editor work. Verify targeted geometry/DOM regressions, typecheck and production build,
plus rendered views where computer access is available. No API contracts change.

## Native desktop boundary (2026-10-25)

[Spec 56](56-native-shell-integration.md) authorizes frontend OS-file routing, sidecar transport port following, shared native
export/clipboard helpers and their feature callers. Browser mode keeps download/clipboard fallbacks. External NC is detached from
the previous stored resource after saving current work, so subsequent autosave cannot overwrite it. OS drawings are added to the
active layer. Native permission/manifest configuration and Rust tests live in the linked shell spec.

## Workspace page panels and headers (2026-10-24)

Status: implemented; desktop typecheck and all 32 targeted UI regressions pass.
Visual review remains pending because no browser surface is available and native
computer-use access was denied. Owner-requested WP6 refinement covers the shared page toolbar,
panel headers, filter rails, resource cards and empty states, including tools,
materials, configurations and components. Use opaque theme-aware surfaces, aligned
actions, clear title/description hierarchy and consistent field spacing. Filter
panels fit their contents, scroll independently on desktop and stack above results
when the available page column is narrow. Reuse shared empty states, card banners
and view controls. Keep navigation, filtering, creation and assistant actions intact.
This increment owns `shared/components/WorkspacePage.tsx`, `styles/workspace-page.css`,
resource, costs and activity screens, shell locale and corresponding desktop checks. API, persistence,
geometry and CAD/CAM viewport behavior stay unchanged.

Change log: 2026-10-25 — aligned list/detail toolbars, panel headings, controls and
resource surfaces with shared theme tokens. Filter panels fit their contents and
stack above results in narrow page columns; resource grids follow available space.
Resources reuse shared empty states, card banners, view controls and aligned data
rows. Costs and activity rails retain meaningful, nonduplicated headings. Updated
existing DOM checks for the filter surface and semantic resource statistics.
The API reference was regenerated and its freshness check passes. The two toolpath
checks that exceeded the default five-second limit during the combined run pass
when rerun separately with a 30-second timeout. An earlier production build passed;
the final full build was interrupted after prolonged dependency transformation
without further progress, so final production bundle verification remains pending.

## Print deposition evidence (2026-10-24)

The printing continuation owns only the existing print result/kernel/evidence panels and CAM
locale for showing independent deposition measures and support/connectivity checks. Display
the replay's actual cell size, occupied and extruded volume distinctly, and unsupported
bearing area. Preserve preview/blocked releases and explain unqualified bridge evidence.
No sidebar, boot, layout-system or CAD-panel changes belong to this increment.

## Unified CAD and CAM panels (2026-10-24)

Status: in progress. Owner extension: both left and right sidebars, including every
internal panel in CAD and CAM, receive the care and CSS approach of the Toolpath
Generator. WP6 owns the shared panel/sidebar primitives and styles, CAD/CAM page
inspector chrome and panel components, locale and corresponding desktop tests.
Build on the left-sidebar refinement below; extend it to CAD Properties, Modeling,
Drawing, Settings, Plugins and Assembly, and CAM Generator, Cycles and Verify.
Use the same tabs, independent scrolling, collapse controls, compact sections,
fields, buttons, theme tokens and focus/selection/error states. Remove oversized
spacing, glass surfaces and decorative per-control motion. Preserve editing,
validation and every panel action. Verify both themes, narrow columns, panel
switching and keyboard flows, then run the desktop typecheck/build and targeted
regressions. API, geometry and persistence contracts stay unchanged.

Further owner extension: apply the same shared panel CSS and information quality
to the central CAM G-code editor and post-processor, including all controller
options, presets and results. Add concise context derived from the current input
and processing state; avoid static capability catalogues. Keep the toolpath
visualization unchanged. Preserve editing, processing, controller selection and
export behavior, and verify readable contrast in the supplied dark-theme case.

Owner screenshot follow-up: CAD viewport Section View, assistant and fullscreen
controls currently share absolute bottom-right coordinates. WP6/WP7 may edit
CADCanvas overlay markup/CSS and the page's assistant placement to give them one
bounded footer layout. The expanded section controls wrap above the action row;
no button may overlap at narrow sizes or while sectioning is enabled. Keep scene,
camera, rendering and toolpath visualization behavior unchanged.

Owner selection follow-up: the CAD selection rectangle must track viewport-local
CSS pixels, independently of the drawing plane and camera orientation. Preserve
left-to-right containment and right-to-left crossing, multi-select/modifier
behavior, locked/hidden exclusion and click selection. Overlay controls must not
start a canvas gesture; releasing outside the canvas and Escape must end it
cleanly. Test transformed 3D bounds and screen-space drag behavior.

## CAD and CAM left sidebar refinement (2026-10-24)

Status: implemented; typecheck and interaction checks pass. Visual browser QA remains
pending because browser-control is unavailable and the desktop UI bridge fails to start.
Owner-requested WP6 refinement covers all CAD left tabs
(Tools, Explorer, Layers) and CAM left tabs (Explorer, Settings, Machine).
Reuse the generator's shared panel tokens, disclosure sections, numeric fields,
compact controls, selection and focus states in both themes. Keep model browser
commands, layer editing, machine selection, origin, stock, snapping, saved
operations, quick navigation and collapse available. Shared sidebar chrome and
styles live under `shared/components/panel` and `styles`; matching components,
locale and desktop checks are WP6-owned. No state or API contracts change.

Change log: 2026-10-24 — implemented shared sidebar tabs, collapse controls and generator
sections across all six tabs. Tool categories and layers have keyboard-operable disclosures;
collapsed tabs reopen the chosen panel. Stock and origin reuse expression-aware numeric
fields. Model browser rows fit narrow columns while preserving actions and assignment
status. Shared sections and the floating creation form carry their own theme tokens for
standalone use. Fourteen live UI/store tests and two workstation checks pass; the earlier
browser/machine-data/workstation run also passed all 22 tests. Desktop typecheck and API
reference regeneration pass. Native/browser screenshots could not be captured in this session. The production build
was interrupted after remaining in dependency transformation without further output;
production bundle verification remains pending.

## Generator contextual examples (2026-10-24)

Status: in progress. Owner-requested WP6 refinement owns the CAM generator components,
preview helpers, generator stylesheet, CAM locale and desktop tests. Remove the static
Production CAM Features catalogue and repeated explanatory/marketing panels. Show compact,
theme-aware isometric examples for the current operation, parametric geometry and milling
origin, beside their controls. Operation examples are explicitly illustrative, follow the
active machine and effective settings, and never masquerade as generated toolpaths.
Geometry preserves proportions and fits the panel at any supported dimension. Origin
markers follow the selected reference. Render only mounted/open sections, without animation
loops or GPU contexts; keep errors, setup warnings and generated evidence. Existing API,
generation and persistence contracts stay unchanged. Verify reactive switching, geometry
fitting, origin markers, generator flows, typecheck, build and rendered desktop/narrow views.

Integration repair (2026-10-24): remove the unreachable milling `face` example branch;
the generator's public operation schema has no such id. Preserve all supported examples
and the separate lathe `facing` example. The printing continuation verifies that its
shared bead-replay changes still compile and execute through the existing print panel.

## Animated exploded view (2026-10-23)

Status: implemented and verified with automated geometry and DOM tests. Owner reference: https://x.com/10_X_eng/status/2113448035430908412,
an assembly separating into its constituent parts. WP6/WP7 scope is `features/cad`, CAD
locale and matching desktop tests. Add an Inspect ribbon action with animated explode /
assemble, separation slider and automatic radial or X/Y/Z layouts. Recurse through
component/group children, keep each solid and its display edges together, and exclude
stock and scene helpers. Coincident part centres must still separate deterministically.
Use world-space bounds and convert offsets into each parent's frame, including rotated
and scaled nested components. Restore exact assembled poses on close, 2D switch and
unmount. Rendering offsets are transient: document/history, CAM and saved/exported CAD
keep assembled geometry. Hide viewport transform handles during presentation to avoid
committing display offsets. Reuse the demand-driven frame scheduler, support interrupted
transitions and reduced motion, and retain orbit/zoom and fit-to-view. Verify real geometry
and nested transforms, complete restoration and export isolation, scheduler convergence,
and the ribbon DOM flow. This concrete feature does not advance unrelated RM steps.

## Default manuals catalogue (2026-10-22)

Status: implemented and verified. Owner request: ship a `/manuals` section already populated with many official CNC machine/control manuals, CNC programming references, CAD/CAM and 3D modeling guides. Include FANUC, HEIDENHAIN, Siemens, Haas, Mazak, Okuma, Grbl and LinuxCNC; cover milling, turning, multi-axis machining, tooling, probing, additive manufacturing and supported geometry formats. Generic coding documentation is excluded. Latest owner clarification: documents are consulted on demand from their official sources, not downloaded or bundled in advance. The catalogue itself is included by default and requires no account, project or sidecar call. Opening a document explicitly launches its official URL in the system browser (Tauri) or a new browser tab. Never iframe third-party sites or bypass publisher authentication. Identify complete manuals, chapters, references and portals separately, with account requirements where known.

WP6 owns `features/manuals`, route/page, shell and CAD/CAM quick navigation, command palette, i18n, tests and a metadata-only catalogue refresh script. Refresh reads official documentation indexes, keeps title/URL/publisher/category metadata, and stores no manual bodies, PDFs or offline reader. Existing API/database contracts remain unchanged. Verify broad domain coverage, all exposed controller families, searching/filtering/pagination, explicit source opening, zero document requests on mount, and desktop build. This concrete owner request does not advance unrelated RM steps.

Owner-requested UI consistency: reuse `WorkspacePage`, its toolbar and filter rail, `PANEL`, `FIELD`, `TOOLBAR_BUTTON` and `StageEmpty` from the existing library screens. Feature CSS only arranges document metadata and consumes shell/page tokens; shared components own surfaces, controls, typography, theme behavior and entry motion.

Verification: 343 default entries from 24 publishers in eight categories. The desktop suite passes (852 tests); seven targeted manuals/workstation tests pass after the final shared-UI alignment. Desktop typecheck and Vite production build pass; the generated API reference remains fresh. DOM flows exercise default availability without a sidecar or document fetch, official-link activation, combined filters, pagination, empty states, deep links and shared workspace components. No manual bodies or PDFs are shipped. Refresh with `bun --no-env-file apps/desktop/scripts/refresh-manual-catalogue.ts` to rebuild the metadata index; publisher access restrictions do not remove the curated access points.

## Subscription provider connections (2026-10-16)

Owner clarification: also provide OpenCode Zen (`opencode`) and Go (`opencode-go`) account-key connections. Their documented account/subscription access uses API keys, not an invented OAuth grant. WP8 owns explicit provider fallbacks and native session headers; WP6 owns console links and key guidance. Preserve models.dev per-model protocol routing. Reference: https://opencode.ai/v2/docs/console/go/ and https://opencode.ai/v2/docs/console/models/.

Integration authorized by 08-ai.md: Settings → AI offers ChatGPT/Codex and SuperGrok subscription login when native OAuth is available, opens the system browser, displays completion instructions and the optional xAI manual code input, and refreshes status/catalogue after connection or disconnection. API-key entry remains available. Status: implemented; typechecks and targeted provider/UI regressions pass.

## Assistant extensions (2026-10-16)

Owner-requested assistant extensions: WP6 owns a compact MCP/plugin settings disclosure in the existing assistant, project-local connection management, Worker plugin installation/enablement and links to existing CAD/CAM plugin pages. AI locale and desktop tests are included. Status: implemented and verified at source-runtime level.

## Component creation and library round-trip (2026-10-13)

Status: in progress. WP6 owns this editor increment in `features/cad/{components,lib,store,screens}`, `features/library/hooks`, locale entries and desktop tests. Create Component from the toolbar or canvas opens one in-editor dialog for the complete selection: name, description, tags, target layer, original retention and optional library saving (enabled by default), with local or project destination and project visibility. All descendant components and groups remain nested, with geometry, poses and metadata preserved. Preview the included hierarchy and counts. Persistence failures keep the dialog and original scene intact; creation is one undo step. Library placement and preview must use the complete stored geometry with fresh instance IDs, including legacy single-element records and project documents. Existing typed API contracts are reused.


## Assistant controls (2026-10-10)

See `completed/24-assistant-control-flow.md`: WP6 adds role/domain/thinking selectors, manual context compaction, interactive native question replies and background task cancellation in the existing assistant. Controls remain bound to the active session/project and generated API; context follows host limits, with unknown values explicit. Status: in progress. Change log: 2026-10-10 — registered assistant control UI ownership before implementation.

## Assistant streaming responsiveness (2026-10-15)

Status: implemented and regression-checked. WP6 owns the assistant transcript components, timeline derivation, store and desktop regression tests. Streaming updates preserve mounted message and timeline rows, including disclosure state, while updating text, tool status and recovered answers. Adjacent text/reasoning deltas are retained as one exact text run, preserving tool and session boundaries. Format raw tool evidence only when its disclosure is open; retain complete results for editor reconciliation. Coalesce follow-latest scrolling per animation frame and cancel pending scroll work on teardown. Scripted streams and DOM identity assertions verify behavior without requiring a live provider; native runtime profiling remains outstanding.

## Bootstrap and graphics performance alignment (2026-10-09)

WP6/WP7 follow-up from `23-ai-runtime-architecture.md`: each bootstrap attempt owns late-acquired resources and cancellable network work; credentials belong to a client instance. Meshing jobs are bounded, errors/timeouts close pending work, superseded scene work is terminated, and static views avoid redundant GPU rendering. Preserve existing controls, editor behavior and display appearance. CADCanvas owns a demand-driven frame scheduler: idle scenes schedule no frames, hidden documents suspend rendering, and orbit damping wakes only until settled. Scene teardown releases owned geometries, materials and textures once and cancels pointer/fullscreen callbacks.


Status: core flows implemented and tested (83 desktop tests). Boot/runtime with the generated typed client and the browser fake, the app shell, and the Projects, CAD, CAM, Library and Settings screens are working end to end against the contract; the 3D viewport plays back toolpaths, and the 2D editor drives the tool state machines. Remaining work is the long tail of legacy pages, which are still generated stubs rather than implemented screens.

Visual status (2026-10-08): compact CAD/CAM workstation chrome implemented in WP6-owned components; geometry, state and viewport rendering remain unchanged.

Both workspaces also share the generator inspector's blue glass tab treatment and the CAD quick-navigation menu, now available at the bottom of the CAM sidebar. Navigation and panel content scroll independently; collapse controls stay available.

- **WP6** owns `apps/desktop/src/app/`, `features/*/screens/`, `shared/components/`, `shared/state/`, `src/i18n/` — app shell, navigation, project/library screens, forms, API wiring.
- **WP7** owns `apps/desktop/src/viewport/` — 2D drawing canvas, 3D viewport, toolpath preview.
- Shared by both (edited only by whoever creates it first, then frozen): `apps/desktop/package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`.

Stack: **SolidJS** (`solid-js`, `@solidjs/router`, `vite-plugin-solid`), TypeScript strict, Tailwind CSS, Solid signals/stores for UI state, plain Three.js (no React wrappers) for 3D, Canvas2D or Pixi for the 2D editor (WP7 decides, documents it here). **Parity requirement:** the UI is visually and functionally identical to the legacy React UI (`.reference/src/components`, `.reference/src/pages`, `.reference/src/styles`, tailwind config, fonts and icons from `public/`) — same layout, screens, routes, copy, shortcuts and styling — re-implemented component-by-component in Solid (no React, no Next.js). Tests use `@solidjs/testing-library`. Data access only through `ApiClient` from `@cadcamfun/api` (typed, Effect-based); the UI runs effects with a single app `ManagedRuntime`.

Legacy reference (behaviour/layout inspiration only): `.reference/src/components/{cad,cam,layout,library,materials,production-costs,simulation,settings,ai}/`, `.reference/public/cursors/`, `.reference/src/store/`, `.reference/src/hooks/canvas/`.

## Library visual refinement (2026-10-19)

Status: in progress. Owner-requested WP6 redesign owns the library dialog frame, CAD library browser, CAM library manager/browser, library stylesheet, library locale and desktop tests. Replace layered glass gradients, decorative animation and repeated headers with opaque theme-aware workstation surfaces, a single dialog heading, compact category/source navigation, aligned search/actions, restrained cards and explicit loading/empty/error states. Preserve selection, local-save callbacks and document events; filters must narrow displayed rows. Include keyboard navigation, dialog focus containment/return and reduced-motion support. API and persistence contracts stay unchanged.

## 1. App shell (WP6)

- Boot sequence: Tauri command `get_sidecar_endpoint` → `{ baseUrl, token }` → build `ApiClient.layer` → `GET /health` → render. Show a splash with error and "Retry"/"View logs" only after the sidecar has stayed unreachable for 150 s: until then the splash keeps re-resolving the endpoint and retrying (the shell waits up to 60 s for each start, and the host's SDK is loaded lazily so the API answers first), showing the seconds waited and a readable reason.
- Layout: title bar (native menus from the shell, in-window fallback on Windows/Linux), left activity bar (Projects, CAD, CAM, Library, Costs, AI, Plugins, Settings), main area, bottom status bar (units, snap state, cursor coords, sidecar status).
- Screens: **Projects** (list/create/open/rename/delete, recent), **CAD editor** (WP7 canvas + tool palette, layers panel, properties panel), **CAM workspace** (operation list, parameters form generated from WP2 Schemas, toolpath preview, G-code view with export), **Library** (materials, tools, machine configs, components), **Costs** (estimate form + breakdown), **AI panel** (docked chat, streaming), **Plugins**, **Settings** (units, theme, locale, post-processor defaults).
- Forms are generated from the Effect Schemas where possible (one small `SchemaForm` component) so parameters never drift from the core definitions.
- State: server data lives in the API (no duplicated caches beyond a lightweight query cache keyed by endpoint + params); undo/redo history for the editor is client state (command pattern over `Drawing` patches, max 200 steps).
- Theming: light/dark/system via CSS variables; every colour as a token; keyboard-first (command palette `Cmd/Ctrl+K`, shortcuts table in settings).
- i18n: `src/i18n/locales/<code>/<vertical>.json` holds one table per vertical and per language; English (`locales/en/`) is the source of the keys, and the ten principal languages plus Italian ship as packs beside it. Keyed strings, no inline literals in components (lint rule). The language is a preference (`settings.locale`), picked in **Settings → Language**; the pack is loaded on demand and the whole app follows.
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
- CAM mini player: a compact footer immediately before Fullscreen, with play/pause, ±5-second seeking, an accessible scrub slider and elapsed/total time. It uses the existing CAM playback state and clock, restarts at the end, and pauses while scrubbing. WP6 owns the player and state wiring; WP7 exposes an optional footer slot so CAD controls remain unchanged.
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

- 2026-10-26: the title-block overlay imports its own viewport stylesheet, so opening CAM directly no longer depends on visiting CAD first. Verified the compact expanded card in the native app and the stylesheet in the production CAM chunk dependency graph. Added an explicit Auto-resume checkbox to the simulation timeline, connected to the existing short-pause/resume mode. Timeline seeking, stepping and NC-line navigation cancel pending resumption; this is separate from repeating a program. A DOM integration check drives a real collision stop, verifies automatic continuation, then verifies that manual stepping cancels a scheduled restart. Desktop typecheck and production build pass; native visual verification of the new checkbox requires an app running the updated bundle.

- 2026-10-24: printing integration repair removes an unreachable `face` example branch
  unsupported by the operation schema. Desktop typecheck passes (1,171 files); the combined
  generator/HTTP/live print-panel suite passes 93 tests. The bead preview consumes the shared
  modal replay without a new UI parser. Contextual-example layout validation remains separate.

- 2026-10-23: added Inspect → Exploded view with animated explode/assemble, a 0–300% separation slider, automatic radial layout (axial packing for concentric parts) and X/Y/Z packing. Nested component/group parts move in world space through rotated/nonuniform scaled parents; stock, hidden children and display-edge helpers stay out of the part list. Rendering offsets never enter document history or CAM; scene export adapters clone assembled poses. The existing demand-driven scheduler owns transitions, reversal, reduced motion and cleanup; 2D restores immediately and viewport transform handles are hidden during presentation. Evidence: 13 targeted tests, all 858 desktop tests, desktop typecheck (1,135 files), Vite production build and generated API-reference freshness pass. The full suite requires local HTTP listeners outside the restricted sandbox. Native visual verification was not performed.

- 2026-10-22: shipped the default on-demand CAD/CAM and CNC manuals catalogue (343 entries, 24 publishers), official publisher access labels, metadata-only refresh tooling, search/filter/pagination, and shell/workstation/palette navigation. Reused library workspace components and theme tokens; verified desktop tests, final targeted UI flows, typecheck and production build.

- 2026-10-22: the CAM page registers a program sheet as its visual capture, so the assistant's vision tool sees the CAM in every tab and not only while the 3D preview is on screen. The sheet draws the toolpath (in the machine's own cutting plane), the G-code with its line numbers, the machine and the toolpaths; the preview's capture wins while it is mounted and the sheet travels with it. The layout is pure and the drawing is a canvas pass over it (`features/cam/lib/program-sheet.ts`). Evidence: `apps/desktop/test/cam-vision.test.ts` (8 pass) and desktop typecheck clean.

- 2026-10-21: the Toolpath Generator can select CAD parts directly from its selected-geometry panel for mills, lathes and printers. The picker replaces both CAD selections, includes hidden/locked/grouped parts, follows CAD edits and preserves complete element data in generation requests. Regression tests cover selection, stale multi-selection, clearing and live drawing updates.

- 2026-10-17: added the compact CAM simulation player immediately before Fullscreen (play/pause, ±5 seconds, scrub position and time). Uses the shared CAM state in Preview and Toolpath, including fullscreen. Mini-player, viewport DOM and real-sidecar CAM page checks: 12 pass; desktop typecheck clean.

- 2026-10-16: Added ChatGPT/Codex and SuperGrok browser connections with xAI manual-code completion, plus OpenCode Zen/Go console links and account-key instructions. Provider settings tests cover all connection forms and clear entered secrets after success.

- 2026-10-16: The assistant overflow menu exposes MCP & plugins. Project MCP configuration/status/enablement/removal and Worker plugin installation/enablement/removal share the existing disclosure styling; CAD/CAM interface plugins link to the existing manager. The DOM flow installs an inert plugin, enables/disables its tools and removes it. Desktop typecheck and production build pass. Native visual verification was not performed.

- 2026-10-16: minor assistant composer spacing refinement (WP6): narrow docks use icon-only agent, mode, thinking and drawing triggers with accessible names and tooltips. The model name can shrink with ellipsis, secondary effort text collapses at narrow widths, and fixed icons retain their spacing. Layout and assistant behavior are preserved. Validation: desktop typecheck, production build and all 5 targeted assistant panel/agent tests pass; no native visual verification was performed.
- 2026-10-15: assistant streaming retains message/segment DOM nodes, memoizes unchanged Markdown and tool facts,
  defers raw JSON formatting until disclosure, coalesces scrolling per frame and compacts adjacent token events.
  Regression coverage includes 400 streamed fragments with 300 KB tool output, preserved disclosure state and unchanged
  Markdown descendants, plus exact text/order preservation for a 10,000-token burst. Desktop typecheck and production build pass.
  The full desktop run passes 707 tests; one specialist integration test exceeds its original 5-second cold-load timeout.
  Its timeout now matches the integration waits (30 seconds), and the specialist/streaming targeted rerun passes both tests.
- 2026-10-15: AI wire decoding preserves complete tool-result JSON for editor reconciliation instead of character slicing.
  Model preview and transcript-text budgets are separate. A temporary runtime probe verified an unshortened 300,000-character
  specialist result through the production decoder; no regression files were added or edited.
- 2026-10-14: composite CAM resource follow-up owns optional ordered operation snapshots in save/export/reopen, the toolpath details operation list and 3D component/toolpath preview, and a reusable read-only component preview/structure in component resource details. Follow the legacy component Preview/Structure and toolpath Details/G-code/Versions/Comments layout. Reuse CAD geometry factories and CAM playback, preserve nested component poses, and read saved geometry independently of the active workspace. Status: in progress.

- 2026-10-11: the WP6 assistant surface now owns a stable, context-aware header and a compact Codex-style composer. Project/drawing and companion-device disclosures use real typed API data; slash commands are keyboard-operable; proactive suggestions use dismissible toast cards; agent, domain, permission and thinking controls remain visible as a spaced icon rail whose custom menus open upward; and the model menu is right-anchored so it grows left inside narrow docks. Composer popovers sit above transcript toasts without clipping, while light/dark text fields and menus share the assistant surface tokens. The empty state and responsive layout were refined for both the full AI page and the docked CAD/CAM panel.

- 2026-10-11: the CAM Toolpath visualizer restores the legacy top-right visualization settings control. The Solid/Three.js implementation exposes live statistics, filterable move points and optional labels, point sizing, arc-center and radius helpers, arc tessellation tolerance, plus workpiece visibility and opacity. Inspection geometry is derived from the typed CAM IR in `src/viewport/view3d/toolpath-overlays.ts`; it is rendered by the shared demand-driven `View3D` scene and covered by focused geometry tests.

- 2026-10-11: the legacy Custom Elements subsystem is ported to the CAD editor (WP6-owned `features/cad/`, plus locale entries in `src/i18n/en.cad.json`). `features/cad/types/customElements.ts`, `features/cad/lib/customElements/{evaluate,templates}.ts` and `features/cad/store/customElementsStore.ts` carry the definitions, the geometry-script runner and the persisted store (same storage key as the legacy app); `features/cad/components/custom-elements/` holds the editor (code with the legacy snippet buttons, parameters, settings), the saved-elements browser, the parameter controls and the Three.js preview. The toolbar gains a Custom Elements button, and "Add to scene" places the element as `type: "custom"`, which `createThreeObject` draws by running its script with the saved parameters. Geometry bodies are the legacy ones verbatim; the React UI is re-expressed in Solid with the shared `Modal` kit.
- 2026-10-14: the custom-element editor grows into a wide, balanced workspace with an automatically framed 3D preview, a reachable template strip, and an in-modal AI author. The author uses the existing tool-free AI completion route to generate parametric definitions, validates them before loading, and leaves saving and placement to the user. Scope stays in the WP6 CAD feature, shared modal sizing, CAD locale and this spec.

- 2026-10-10: WP6 floating-tool refinement owns `features/cad/components/FloatingToolbar.tsx`: captured pointer drag isolated from canvas input, layout-coordinate bounds, re-clamping on canvas/tool-window resize, keyboard movement and a single compact content scroller. The AI tab opens the existing assistant dock.

- 2026-10-10: WP6 owns the compact CAD ribbon in `features/cad/components/CadRibbon.tsx`, its integration in `features/cad/CadPage.tsx`, controlled operation selection in `features/cad/components/SurfacingPanel.tsx`, CAD locale entries and shared workstation styling. The 54px strip exposes existing modeling operations, booleans and section controls, with parameters in the inspector; no geometry or renderer changes are required. WP6 also owns the container-responsive layout of `features/cam/components/MachineCycles.tsx`: stacked configuration at sidebar widths, readable cycle rows and two columns only in wide containers.

- 2026-10-10: restored an opaque blue primary-button backdrop when the calmer finish removes gradients; native glass neutral surfaces now pair their foreground with the light/dark theme. This fixes white labels disappearing on the white dashboard surface without changing navigation or layout.

- 2026-10-10: visual refinement complete in shared desktop styles: opaque white light-theme shell, native glass chrome, page cards and workspace panels; compact shared surface radii, square joined workspace edges and stable tab radii across hover/focus. Dark-theme colors, viewport rendering, layout and behavior are preserved. Verification: both workstation tests pass and `git diff --check` passes; the full desktop test run encountered timeouts, and typecheck/build have not returned a result. Native visual verification remains outstanding.

- 2026-10-08: shared page-consistency stylesheet applies compact surface/control radii, neutral borders, aligned controls and generator-style glass tabs to page and standalone route containers; CAD/CAM workspace-specific styles remain isolated. Individual route visual verification remains outstanding; no browser control used.

- 2026-10-08 follow-up: extracted the existing CAD quick-navigation routes into keyboard-reachable `components/workspace-navigation.tsx` and reused them in CAM. All sidebar/inspector tabs and CAM workspace tabs share the generator inspector's neutral inactive, outlined charcoal hover/focus, and translucent blue selected rectangle with bottom underline. Added source-contract regression tests for shared navigation, tab styling and narrow-window stage protection; browser verification intentionally not performed per user instruction.
- 2026-10-08: library indexes and material/tool/machine detail cards use shared screen headers, neutral theme surfaces, compact controls and responsive data rows. Legacy CAM/toolpath chrome now uses shell surfaces and compact panel/button radii; Quick Navigation matches sidebar control spacing and contrast without hover translation. No API or machining behavior changes.
- 2026-10-08: component index/detail styling aligned with shared screen headers, card/form controls, brand and gray theme tokens, responsive spacing, visible link focus, and bounded data panels; API calls and interactions are unchanged. Route audit: `/components` and `/components/:id` use `legacy-components.tsx`; `/materials`, `/tools`, `/machine` use `library.tsx` and their detail routes use `library-detail-screen.tsx` (separately owned); `/toolpaths` and `/toolpaths/:id` both still use `screens/cam.tsx`, left unchanged to preserve the CAM workspace.
- 2026-10-08: modest CAD/CAM visual polish, preserving blue accents and light/dark identity. Shared `components/workstation.css` reduces toolbar padding, panel gaps, shadows and radii, aligns 12px control typography, and gives properties/generator sections clearer hierarchy. Sidebars use responsive CSS widths without delayed slide-away transforms; narrow windows retain a 320px minimum stage in a horizontally scrollable workspace with all collapse controls preserved. CAD browser type metadata moves below the name, CAM inline assignment actions wrap, and shared row actions remain visible on keyboard focus and touch. No geometry, state, API, or viewport rendering changes; existing dirty `AdvancedSection.tsx` and `project-detail.tsx` edits are untouched.
- v1: initial spec.
- Editor core implemented and tested without a canvas or a DOM (`bun test`, 54 tests):
  - `shared/state/commands.ts` + `shared/state/history.ts`: the command pattern and a
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
  - `shared/components/schema-form.ts`: derives the CAM parameter form from the WP2
    `Schema.Class` AST — kinds, enum literals, bounds (including the *exclusive*
    `isGreaterThan` bounds used by `totalDepth`/`stepdown`) and which fields have
    constructor defaults. Decoding goes through `decodeUnknownExit`, so a bad value
    can never throw inside the editor.
- Conventions learned the hard way: `mirror(entity, origin, angle)` reflects about
  the line **through** `origin` at `angle` radians, so a vertical axis is `π/2`;
  `Schema.optional(X)` is a `Union` of `X` and `Undefined`, which the form
  description has to unwrap.
- Integration screens for the groups the sidecar now serves, all through the typed `ApiClient` (`features/*/screens/`): `plugins.tsx` (`/plugins` list with enable/disable and zip install via multipart `FormData`, `/plugins/:id` with manifest, JSON configuration and uninstall), `costs.tsx` (`/costs`: pick a toolpath, calculate, save, saved estimates), `organizations.tsx` (`/organizations`, `/create`, `/:id`), `waitlist.tsx`, `auth.tsx` (forgot password, magic link, reset password, verify e-mail; they show the development link the sidecar echoes when `CADCAMFUN_DEBUG_LINKS` is on) and `analytics.tsx` (`/analytics`, sidecar metrics). `/costs` was missing from the route table and is now registered. `apps/sidecar/test/typed-client.test.ts` runs the generated client against the real handlers (including the multipart install), so a contract drift fails a test instead of a screen. Not covered yet: the in-memory fake (`testing/fake-api.ts`) still answers 501 for these groups, so they only work against a live sidecar; no DOM component tests exist for them.
- Model browser and status strips (CAD and CAM share them):
  - `cad/lib/browser.ts` holds the rules (Bodies / Sketches / Components by element type, grouping by type / layer / flat, isolate, show all, rename, bulk toggle); `cad/components/browser/` holds the shared state (`createBrowser()`) and the pieces (`BrowserToolbar`, `BrowserSections`, `RowActions`, `RenameName`, `OriginBlock`). The CAD `CADElementExplorer` and the CAM `CamElementExplorer` both render them, so every function (rename in place, lock, hide, duplicate, delete, isolate, show all, group / ungroup, move to layer, layer create / activate / hide / lock / delete, axes / grid / dimensions toggles) exists in both sidebars. CAM keeps its own tool, material and generate controls.
  - `components/workspace-strip.tsx` is the one-row (`h-6`, never wrapping) information strip. CAD (`StatusBar`): mode, transform tool, material, stock, grid / axes / dimensions toggles, layer, counts, selection (type, id, size), cursor, shortcuts. CAM (`CamStatusBar`): view, lines, moves, cut length, time, min Z, tool, rpm, feed, material, stock, post, work offset, selection, last verification verdict, simulation clock. The shell footer keeps units, snap and the sidecar state.
  - CAM sidebar "Verify" tab (`VerifyPanel`): holder fields (blank = not modelled), the verdict, issues worst first, volumes, the remaining-stock height map with gouges in red, a stale marker when the G-code changed after the report.
  - Assistant integration: the CAD and CAM pages share the open document with the assistant (`documentStore`), the assistant's context is built from the live stores, its CAD and CAM tool results are mirrored into the editor, the generator, the G-code editor and the Verify tab, and the browser toolbar and the Verify tab have "ask the assistant" buttons (spec 08, "Workspace integration"). The CAM page's editor follows `camStore.gcode`, so G-code set by the assistant appears without reloading.
  - The CAM's visual capture: the assistant's vision tool reads the CAM through the same seam the CAD canvas uses (`features/ai/lib/viewport-capture.ts`). The 3D preview registers itself as the CAM's viewport, and the CAM page registers a **program sheet** (`features/cam/lib/program-sheet.ts`): the toolpath the program cuts, the G-code with its line numbers, the machine and the toolpaths. The editor opens on the G-code, so without the sheet the CAM would have nothing to show; the preview wins while it is on screen and the sheet travels with it. The sheet is drawn from the program the editor shows, never from a second model of it.
  - Units and tolerance: the display unit (mm, µm, cm, m, inch, thou; everything stays millimetres inside) and the drawing tolerance are selected in the "Document & Origin" block of both sidebars and shown in the strip. `state/document-settings.ts` is the one place that changes them: settings, the 3D view (curves are meshed to the tolerance), the CAM generator and the verification default, and the stored drawing carry the same values.
  - Generator panel by machine: the origin section shows the mill's work offset and origin, the lathe's Z zero, or the printer's plate origin and size; mills can pick a touch probe or tool setter and the probing operation with its cycle settings.
  - Request bodies built from editor elements go through `state/json-safe.ts`, so an element holding `undefined`, NaN, typed arrays or cycles can no longer stop the generator ("Expected JSON value at ...").

## Folder roles (`src/app`, `src/pages`, `src/features`, `src/shared`)

Owner-requested kernel integration (2026-10-14): enrich the current CAM generator with a native-kernel section, preserving its operation generator. Selection comes from the CAD stores; the authenticated sidecar returns the kernel program and evidence. Loading the result updates the existing editor and preview, resets previous verification and guards against stale geometry/settings/owner responses. Show stale evidence after NC edits. CADCanvas uses kernel geometry with one placement/gizmo transform and independently owned render resources.

The kernel uses the generator's shared collapsible card and field styles, with material/machine presets and an inner settings disclosure for origin, work offset, tolerance, finish allowance, scallop and automatic/manual stock replay resolution. Native settings belong to the generator store and CAM history; reopening a native saved or assistant program restores its captured request settings. Changes invalidate displayed evidence and abort obsolete generation. Browser/computer-use verification is disabled at the owner's request; use automated DOM flows and source-level layout checks.

Owner-requested CAM Save (2026-10-14): the existing toolbar/ribbon Save and generator Save as Toolpath open one dialog. Keep G-code export; add a portable, validated JSON toolpath containing the exact NC, parsed program, generator settings, stock and native artifact when its NC matches. Save to an existing project or create a private project with a captured CAD drawing; do not overwrite an existing drawing implicitly. Reopening from the toolpath library fetches the stored original and restores the program/settings. Updating that saved program preserves its previous data/NC through the existing version API before updating. A separate saved-program reference must not confuse preview path selection with a persisted toolpath ID. Preserve unrelated saved metadata; changed NC drops obsolete kernel/verification evidence. Existing toolpath detail/library pages manage versions, rename and deletion. Desktop owner scope includes `features/cam`, the toolpath hand-off, `features/ai/lib/cam-sync.ts`, CAM i18n and their tests; no new persistence model or migration.

Follow-up owner requirements: CAD and CAM export/save-project dialogs use the same shared layout, matching the CAD screenshot (file name/format, blue project card, Cancel/Export File footer). Project forms share name/description/organization/visibility, with additional destination/version controls for CAM and a rich contents summary for both editors. Owner scope additionally includes `shared/{ui,components}`, CAD export/project dialogs and their tests, i18n, and the shared UnifiedLibraryModal. The library overlay is portalled outside transformed workstation containers and must display its panel as well as its backdrop in both CAD and CAM; verify actual visible browser layout, not only DOM presence.

CAM editing additionally owns bounded session history: Undo/Redo buttons and Cmd/Ctrl-Z, Shift-Z/Y restore NC, IR, operation results, native source/artifact, machining settings and stock as one snapshot. Playback stops and unrelated verification resets on restore. Parsing an edit updates that edit's program instead of adding a misleading separate operation. New edits after undo truncate redo; history is scoped to the active document and includes a selectable CAM History dialog. Saved DB versions remain managed through toolpath version APIs. Toolbar controls in both editors share their compact geometry (30 px control height, 16 px icons and 4 px gaps), including the new history controls.

- `src/app/` is the shell: `App.tsx`, `Shell.tsx`, `routes.tsx` (the route table), the API client and global services. Nothing feature-specific.
- `src/pages/` holds one-line route adapters, one file per legacy Next.js page path (61 routes; `test/app-mount.test.ts` checks the route table against these files). A page only re-exports a screen or a feature page; it contains no logic.
- `src/features/<name>/` is one folder per product area, with the same inner layout everywhere: `screens/` (route-level views), `components/`, `hooks/`, `lib/` (pure logic), `store/`, `types/`, `api/` and `styles/` only when the feature needs them. Current areas: `ai`, `analytics`, `auth`, `billing`, `cad`, `cam`, `chat`, `companion`, `costs`, `dashboard`, `legal`, `library`, `mcp`, `organizations`, `plugins`, `profile`, `projects`, `settings`, `toolpaths`, `admin`.
- `src/shared/` holds code used by several features: `ui/` (primitives such as button, modal, card), `components/` (shell chrome such as title bar, status bar, workspace navigation, screen parts), `state/` (session, settings, query cache, editor state).
- `src/styles/` holds the global stylesheets. Feature-specific CSS lives in `features/<name>/styles/`.
- `src/viewport/` (WP7) is the 2D/3D engine; `src/i18n/` the translation tables; `src/testing/` the fake API and core-flow tests.
- New logic goes in a feature folder or in `shared/` when it is used by two features, never in `pages/`.
- Sessions and billing: `shared/state/session.ts` keeps the session token (a `Ref` read per request by the client middleware, mirrored to `localStorage`) and `startSession` / `endSession` switch accounts and drop the query cache. Sign-in, sign-up (signs in right after creating the account), magic-link verification and sign-out use them; the navbar shows the acting account with Sign in / Sign out. The pricing page renders the same plan catalogue as the subscription card (`features/billing/lib/plans.ts`), marks the current plan, starts the Pro trial through `POST /api/subscriptions` and says plainly when paid checkout is unavailable.

Secondary resources follow nikcli ownership: queries accept cancellation through the app Effect runtime, superseded requests and unmounted views interrupt their fibers, and hidden CAD plugin panels do not fetch a registry. AI catalogue resources are loaded when their accessor is first used; connected models are preferred, and providers are sorted by configured status.

- 2026-10-10: compact CAD commands also expose Edit (Duplicate / Copy / Paste), Parametric part, Sketch (Line / Circle / Rectangle) and Solids (Box / Cylinder / Sphere / Cone / Torus), reusing ElementForm and the element clipboard. Creation respects the active layer lock. Remaining Italian user-facing strings in CAD simulation, CAM generator examples/errors, and settings feedback are translated to English.


## Account identity integration (2026-10-16)

Owner-requested cross-WP scope and verification are defined in `30-identity.md`. Add dedicated CADCAMFUN OAuth account sign-in to desktop and mobile while retaining scoped companion pairing and local profile access.

## Generator CAD selection (2026-10-21)

Status: implemented; 21 targeted tests pass, including DOM selection flows for all three machine families; desktop typecheck passes (1,122 files). API reference regenerated and its freshness check passes.

WP6 owns a CAD element picker directly in the Toolpath Generator's selected-geometry panel, shared by milling, turning and printing. List every CAD part in the live drawing, including hidden, locked and grouped elements; exclude stock and scene helpers. Choosing a part replaces both CAD selection stores so an earlier multi-selection cannot override the choice. Generation keeps the complete current element through the existing JSON-safe request boundary. External CAD selections and edits remain reactive; no new geometry or API contract is introduced. Verify with automated DOM selection-to-request flows.

## Interface languages (2026-10-28)

Status: implemented; the desktop typecheck passes, the locale and table checks pass
and the desktop bundle builds with one chunk per language.

The app ships the ten principal languages plus Italian. `src/i18n/locales/<code>/`
holds one table per vertical and per language; English (`locales/en/`) is the source
of the keys and the fallback, every other language is a pack beside it with the
same keys. `src/i18n/registry.ts` lists the languages (code, English name, name in
the language, writing direction), `src/i18n/packs.ts` holds the English table and
the loaders of the packs, and `src/i18n/index.ts` is the runtime.

- The language is a preference (`settings.locale`), stored with the other settings
  and picked in **Settings → Language**. The list shows every language by its own
  name; the pack is loaded on demand, the whole app follows and the document
  carries the language and its direction (Arabic is right-to-left).
- `t()` reads the table of the current language from a signal, so every screen
  re-renders on a language change; the translator therefore lives in the module
  and not in a context, which nothing mounted.
- A pack that fails to load leaves the current language alone and reports it.
- A key that a pack does not have falls back to English and the tables are checked
  against English (same keys, same placeholders, no empty string) in
  `apps/desktop/test/i18n-tables.test.ts`; the switch itself is checked in
  `apps/desktop/test/i18n-locale.test.ts`.
