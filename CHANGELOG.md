# Changelog

<!-- UNRELEASED:START -->
<!-- UNRELEASED:END -->

## v0.1.41 (October 2026)

## Desktop

- Build and Plan primaries, shared sessions between desktop and phone, prompt system alignment

## v0.1.40 (October 2026)

- No notable changes

## v0.1.39 (October 2026)

## Core

- Core/cad: failed features with checked remedies, skipped dependents (spec 58 T5)
- Core/cam/post: Klartext checked against the TNC 640 manuals; sources on the Okuma and Mazak posts
- Core/cam/post: Okuma OSP and Mazak EIA posts, Klartext inch and presets, smoothing end to end
- Core/cad: timeline suppress, rollback and lineage (spec 58 T1-T3)
- Core/cam/post: NC conversion kernel replaces the fake advanced post-processor
- Corpus, bench and parity scorecard (spec 55 E1-E3)
- Core/cam/post: LinuxCNC post, native Klartext circles, contour smoothing
- Ai/sidecar: kernel jobs run on Effect; tool handlers share one runtime bridge
- Core/cam/post: Klartext label subprograms
- Core/brep: IGES transformation matrices (124)
- Core/cad: one exact replay per rebuild, advanced on demand

## Desktop

- Spec 58 T7: timeline in the desktop panel, assistant action, sidecar
- Desktop/cam: picking a target no longer resets what the program is written for
- Desktop/cam: one post selection across ribbon, page and Post-Processor tab
- Desktop/cam: post-processor panel on the panel design system

## Sidecar

- Fallible promises are typed failures; silent catches log or narrow
- Api/sidecar: live events are defined once, as an API schema
- The turn enters Effect as CurrentTurn at the nikcli edge; a cancelled turn is TurnCancelled

## API

- Document smoothing, regenerate clients, snapshot and harness inventory; spec 58 T7 state

## AI

- Provider retries are an Effect Schedule; the chat turn's pauses are Effect sleeps

## v0.1.38 (October 2026)

## Mobile

- Add tag management and filtering for projects and conversations; implement keyboard avoidance in chat screen

## v0.1.37 (October 2026)

## Sidecar

- A paired phone acts as the desktop account that paired it — the gateway forwards a short-lived session token for the device's account (the phone's own identity token still wins), devices paired signed out are adopted when the signed-in desktop opens the companion screen; projects and conversations now match the desktop

## Mobile

- IOS project points REACT_NATIVE_PATH at the installed react-native build

## v0.1.36 (October 2026)

## Mobile

- The conversation is a pushed page without the tab bar — Assistant tab opens on the conversations list (project picker, filter, New); chat moves to assistant/chat with back on the left; shared ProjectPickerSheet

## v0.1.35 (October 2026)

- No notable changes

## v0.1.34 (October 2026)

## Desktop

- Fix placement references and validate CAD/CAM keyboard flows

## v0.1.33 (October 2026)

- No notable changes

## v0.1.32 (October 2026)

## Desktop

- Two-click drawing tools (L line, C circle, B rectangle); snap tolerance in pixels; the line's start point reaches the relative snaps

## Mobile

- Assistant screen after nikcli's session screen — glass header, status line, photo previews in the transcript
- Composer as a glass capsule with a bare-icon toolbar, after nikcli's SessionComposer

## v0.1.31 (October 2026)

## Desktop

- The elements list keeps its keys on its panel; guards against stray key listeners; import/export tested

## v0.1.30 (October 2026)

## Mobile

- Redesign chat composer as a single-row card with an Add context sheet

## v0.1.29 (October 2026)

- No notable changes

## v0.1.28 (October 2026)

## Desktop

- The native menu follows the keymap, creation keys, per-platform Ctrl/Cmd, exhaustive validation

## v0.1.27 (October 2026)

## Desktop

- Keybindings validated on the real pages and in a real browser; fixes found on the way

## v0.1.26 (October 2026)

## Desktop

- One command catalog, keymap, Effect service and listener for the shell, CAD and CAM; remappable in Settings, synced through the sidecar

## v0.1.25 (October 2026)

## Desktop

- A panel over the canvas keeps its own wheel: the camera rig only navigates events that land on the canvas

## v0.1.24 (October 2026)

## Desktop

- Both 3D views name the grid spacing in a corner label (Grid 10 cm, 1 mm...)
- Toolpath view: the program readout folds to its three counts (remembered)
- CAD canvas: orientation cube, four views, double click frames the selection
- Toolpath view: the orientation cube replaces the row of view buttons

## v0.1.23 (October 2026)

## Core

- Refactor CADCanvas and keyboard shortcuts for improved functionality

## Desktop

- A little closer to the earlier look: fainter edges, balanced lights nearer the plain ones, a touch more selection glow
- The look-tier setting test no longer depends on which test file loaded the module first
- CAD canvas: a selected part keeps its colour
- Toolpath view: a faint ghost of the cut path shows through the stock
- Fit-to-view frames the bounding sphere: the eye never ends up inside a cube seen along its diagonal
- CAD canvas: grey translucent edges, halfway look tier, camera rig, grid fixes
- Toolpath view: wire the camera rig (zoom to cursor, pivot orbit, adaptive near/far); no depth fighting at Z0
- Add a balanced look tier and make it the default
- Toolpath view: feed-direction arrows with start/end marks; softer viewport chrome
- Add adaptive shader grid to the CAD and toolpath viewports
- Update macOS CI workflows to target macOS 15 and introduce auto-resume feature in simulation timeline

## Documentation

- Update README.md to enhance project description and structure

## v0.1.22 (October 2026)

## Desktop

- Enhance CADCanvas and preview components with improved rendering and look settings
- Enhance update handling and UI components
- Assistant keeps going when a run's step budget is spent; one error card, provider buttons only for provider errors
- Assistant page keeps the composer in place; rename the dock class that collided with the docked panel
- Assistant dock: agent questions answered in the composer dock, like permissions
- Assistant dock: one shared width for permissions, error and composer; compact permission card
- Assistant UI: fixed composer dock with permissions, always follow the latest turn

## Build and release

- Update CI workflow to use newer versions of cargo-deny and cargo-audit

## v0.1.21 (October 2026)

## Core

- Add performance benchmarking script and enhance CI workflows

## v0.1.20 (October 2026)

## Desktop

- Improve updater shutdown and mobile production cost settings

## v0.1.19 (October 2026)

## Core

- Save remaining CAM request and surface generation changes
- Complete native Tauri integration and restrict plugin capabilities

## v0.1.18 (October 2026)

## Core

- Add title block functionality to CAD and CAM workflows
- Huge generations are bounded and measured: the print evidence runs 3x faster, the replay, operations, panel generator and slicer have explicit budgets that answer with the reason, and kernel jobs get a 5-minute deadline, a worker semaphore, single-flight, a byte-bounded result cache and instant detection of a killed worker (new packages/util)
- The ellipse and spline tests have a 60 s timeout: their exact rebuilds take seconds on a loaded machine

## Desktop

- The CAD canvas redraws as soon as it is shown again: it marks the scene dirty on return, handles WebGL context loss and restore, and redraws when it becomes visible
- The shell's menus reach the app: the webview listens to the menu event (native menu bar, tray recents, Save, Open, Show Logs Folder, Check for Updates); the real native menu and its handler are tested on the mock runtime
- The toolpath visualizer can run the whole program: a button plays it from the start, rests briefly at each collision stop and goes on by itself
- Machine configurations get full detail pages: every profile figure in data-sheet sections, a 3D envelope, built-in presets open read-only and can be duplicated; component previews draw revolutions, extrusions and the rest through the editor's builder
- A real dialog (checking, up to date, notes, live progress, restart now), the menu bar and Settings ask for a check and are answered, a release put off stays quiet; native Check for Updates and Release Notes items
- The resource detail previews draw again: the frame scheduler no longer calls requestAnimationFrame as its own method (Illegal invocation left the stage empty)

## Sidecar

- The sidecar's free-form offset test has its own 300 s timeout: the approximate edits take minutes on a loaded machine

## v0.1.17 (October 2026)

## Core

- Free-form face edits are bounded: move, offset and draft stop at the long time budget with the solid unchanged, a trimmed move takes its volume check from the footprint's area, and the offset reuses its fill slab

## v0.1.16 (October 2026)

## Core

- Open and non-level smooth walls and trimmed free-form faces are edited: chain offset over open chains and sloped planes, footprint-cut move/offset/draft with the deviation reported (spec 40 U2)

## v0.1.15 (October 2026)

## Core

- Enhance CI pipeline for release management by introducing reusable jobs for validation, desktop builds, and release publication. Update README to reflect changes in workflow structure and clarify release process. Modify scripts to trigger the new CI pipeline and ensure proper versioning and asset verification before publishing. Add tests for CI publication dependencies.

## v0.1.14 (October 2026)

## Core

- Offset, draft and chain-offset free-form and smooth walls; the last caps and corners are decided (spec 40 U2)
- Push and pull a ball on a neck and the round cavity behind a bore exactly; read the ball in the shadow (spec 40 U2)

## v0.1.13 (October 2026)

## Core

- Move a free-form patch face along a direction exactly, from the edit, the assistant and the panel (spec 40 U2)

## v0.1.12 (October 2026)

## Core

- Give a fillet band a new radius from the exact edit, the assistant and the panel (spec 40 U2)

## v0.1.11 (October 2026)

## Core

- Update release process to unify macOS installers, enhance release documentation, and implement push/pull functionality for fillet edits in CAD models.

## v0.1.10 (October 2026)

## Core

- Push and pull the spherical bottom of a bore and the hemispherical end of a pin (spec 40 U2)
- List the flank-cut walls of an exact solid and add one to the plan from the kernel panel (spec 51 F4)
- Check the shank and the holder of the cutter in the swarf operation (spec 51 F4)
- Read flat walls as rulings for the swarf operation (spec 51 F4)
- Build threads of more than 24 turns exactly when the caller can wait (spec 40 U1)
- Read a bar and a dome from above in the shadow solid (spec 54 R1)
- Flank-cut a cone or cylinder wall with a five-axis swarf operation (spec 51 F4)
- Fix the refusal expected for a sphere on a plate
- Push and pull the dome that ends a round boss exactly (spec 40 U2)
- Push, pull and draft the side of a conical boss, a ball and a ring exactly (spec 40 U2)
- Store post definitions in the library and run a kernel job with one (spec 54 C1)
- Describe a post as data and check it through the API (spec 54 C1)
- Write the tool-centre-point commands of each control around a five-axis section (spec 51 F9)
- Push and pull the wall of a hole and the side of a boss exactly (spec 40 U2)
- Draft the wall of a hole and the side of a boss exactly from the history (spec 40 U2)
- Give the modelled thread an exact model (spec 40 U1)

## Desktop

- Name a post on a saved machine and in the assistant's manufacture input (spec 54 C1)
- Edit, check, use and store a post definition in the desktop kernel panel (spec 54 C1)
- CAM page test: the cycle fields are prefixed cycle-<name> since the UI refactor

## v0.1.9 (October 2026)

## Core

- Read a part one side at a time from its shadow, and share the line-of-sight test (spec 54 R4)
- Derive one tessellation per body and share it (spec 40 U6)

## Integrations

- Rebuild the hello-gear plugin bundle with the current core

## v0.1.8 (October 2026)

## Core

- Refactor authentication screens to use new UI components and improve layout
- Draft the wall of a hole or boss, and audit what the assistant stores (spec 40 U2)
- Hand out the setup sheet of a kernel program (spec 54 H1)
- Resize a boss or shaft section of any exact solid (spec 33 C8)
- Leave a boss standing in a pocket to the exact recognition, and prove the island program persists
- Resize or fill a recognised hole of any exact solid (spec 33 C8)
- Recognise islands standing in a pocket of an exact solid and machine around them (spec 54 R1)
- Plan the manual three-axis setups of a part from its exact model (spec 54 R4)

## v0.1.7 (October 2026)

## Core

- Refactor CAD component structure and styling for improved usability
- Refactor CAD component styles and structure for improved consistency
- Add the exactness coverage matrix (spec 40 U0) and fix transformBrep under scaling

## Desktop

- Enhance UI components and improve styling consistency
- Enhance UI and functionality across various components
- Test the desktop close, destroy and update wiring through Tauri's real JS API over a mocked IPC
- Make the assistant's drawing write a compare-and-swap and prove the autosave interval with real timers
- Specify the path to Fusion/SolidWorks/Creo/hyperMILL parity: master plan and specs 40-55
- Close the open items of project saving: toolpath compare-and-swap, retention policy, updater and close guard
- Add autosave, safe project saves and restore points for the CAD drawing and the CAM program
- Let the stock follow the selected parts, with a switch to keep a manual stock

## Documentation

- Record the real-browser verification of project saving in spec 38

## v0.1.6 (October 2026)

## Desktop

- Enhance CAD element selection and stock management features. Added a multi-part selection interface in CadElementPicker for improved user experience. Updated OperationSection to display part sizes and stock dimensions dynamically. Enhanced job logic to calculate stock based on selected elements and their dimensions, ensuring accurate machining depth and workpiece configuration.

## v0.1.5 (October 2026)

## Desktop

- Add animated exploded view feature with controls for separation and direction

## Desktop (Tauri shell)

- Enhance download experience by adding a dedicated download page and updating navigation links. The download page provides access to desktop installers for macOS, Windows, and Linux, along with checksums and Homebrew installation instructions. Additionally, the documentation has been updated to include guides for installation and account management.

## Documentation

- Document exploded view verification

## v0.1.4 (October 2026)

## Desktop (Tauri shell)

- Refactor menu.rs to consolidate imports by including Manager in the main import statement.
- Ship Linux desktop builds as Debian and RPM packages.
- Update menu.rs to conditionally import Manager for debug builds

## v0.1.3 (October 2026)

## Build and release

- Install the Linux ARM tools AppImage bundling needs.

## v0.1.2 (October 2026)

## Build and release

- Accept the release tag the publish pipeline passes in.

## v0.1.1 (October 2026)

## Build and release

- Fix the Windows ARM desktop install.

## v0.1.0 (October 2026)

## Core

- Fix the two tests that fail the validate job on main.
- Fix optional chaining in stock test to prevent runtime errors when accessing requested tolerance. Update test assertion to ensure robustness in handling undefined values.
- Update README and enhance CAD/CAM functionality with new tests and features. Refactor push/pull and draft operations to support named face references, ensuring better error handling for stale references. Introduce warnings in parametric reports and improve STEP file handling in tests. Add tests for multiaxis mode preservation in HTTP requests and refine ellipse handling in CAD operations.
- Finalize release automation and document the CADCAMFUN platform
- Enhance CAM functionality by introducing a program sheet as a visual capture for the assistant's vision tool. This allows the CAM page to display the G-code and toolpaths even when the 3D preview is not visible. Update related components to ensure the program sheet is registered and rendered correctly, improving the assistant's ability to provide context while editing. Additionally, update the changelog and documentation to reflect these changes.
- Enhance DirectModel with request timeout feature to prevent indefinite waits during stateless calls. Introduce requestTimeoutMs setting for controlling call duration and update related error handling for timeout scenarios. Add tests to ensure proper functionality and failure handling for provider inactivity.
- Refactor machine configuration handling to unify the profile reading process across various shapes. Update the machine profile to ensure it accurately reflects the configuration written by users, including optional fields for controller and axes. Enhance the UI components for selecting CAD elements and improve messaging for element selection in the generator. This change streamlines the interaction between the library, assistant, and kernel, ensuring consistency in machine data representation.
- CAM kernel: the tolerance budget's cases run the whole kernel, so they need more than the default timeout
- CAM kernel: the machine profile is the one place that reads a machine configuration, in whatever shape it was written
- Enhance CAM kernel with built-in and user-defined machine configurations. Introduce functionality to select machines from a combined list of built-in presets and user configurations, allowing for more flexible planning. Update related components to handle machine configurations in requests and improve UI to display built-in machines distinctly. Add tests to ensure proper integration of new machine selection features.
- Add foundational project documentation including Code of Conduct, Contributing guidelines, Governance, Privacy policy, Security policy, Support information, and Trademark policy. Update LICENSE and README to reflect mixed licensing terms. Introduce issue and pull request templates for better community engagement.
- CAM kernel: B/C trunnion preset, structured five-axis stock bracket and mill-turn lathe mode, connected through API, desktop and the assistant
- CAD kernel: exact shell of cones, spheres and tori (faces of revolution); slab margin retry; spec 33 §7.19
- CAM kernel: tolerance budget on the artifact, through the API and the desktop evidence
- CAM kernel: Siemens 840D post and machine preset
- CAM kernel: shank and holder checked against the live stock for moves with the table turned
- Exact analysis: face names (handles for cad.shell) and what healing would do for a solid that does not validate; API contract and snapshot additions
- CAD kernel: a pole within 2e-4 of the model size of the other solid goes to the verified recovery; spec 33 §7.18
- CAD kernel: ball and planar joints in the kinematics; spec 33 §7.17 (wider sweeps)
- CAD kernel: spurs of several samples on an intersection piece are removed (fuzz seed 14 closed); straight-span fallback for hooking fits; spec 33 §7.16
- Cad.distance (exact gap between two solids) and cad.shell (a paper shell: volumes, open faces by name); overlap of boxes sharing planes detected; prompt budgets and inventory updated
- CAD kernel: STL, OBJ, glTF and 3MF export of exact bodies; spec 33 §7.14 (outward offset tried, withdrawn)
- CAD kernel: exact shell of bodies made of planes and cylinders by dilation of the boundary (slabs, bands, edge cylinders and tori, vertex spheres); spec 33 §7.13
- CAD kernel: validation reports a face that gives no triangle (a silently missing share of the volume)
- CAD kernel: a sphere point within 0.5% of a pole takes u from its neighbours (fragments at a pole no longer tessellate to nothing); spec 33 §7.12
- CAD kernel: Boolean recovery guards against valid-but-wrong results (pole contact routing, sampled volume check, volume identities); spec 33 §7.11
- CAD kernel: exact variable-radius fillet on straight edges (loft of homothetic sections); spec 33 §7.10
- CAD kernel: assembly kinematics (joints with limits, gear and rack couplings, forward solver, motion study with exact clash checks); spec 33 §7.9
- GD&T feature control frames (14 characteristics), datum features and BOM balloons on the sheet; assistant options schema
- CAD kernel: clearance in the assembly report (core, API contract, assistant view); generated clients regenerate with the next commit that carries them
- CAD kernel: sketch intersections, trim and extend; spec 33 §7.8
- CAD kernel: faceByName and matchFaces (selections follow a rebuilt body)
- CAD kernel: blend fuzzing (bore, boss, dome bodies; fillet and chamfer of every edge)
- CAD kernel: tessellation of long thin cylinders follows the aspect (3.2 s -> 0.37 s), performance gates; spec 33 §7.7
- CAD kernel: exact minimum distance between solids and assembly clearance report
- CAD kernel: unique stable face names for exact bodies (neighbour-keyed, positional fallback); spec 33 §7.6
- CAD kernel: healBrep (vertex/edge welding, collapsed uses) wired into STEP import; spec 33 §7.5
- CAM kernel planner: rest roughing for freeform parts; a rest pass with nothing left is skipped, not failed
- CAD kernel: structured Boolean diagnostics (stage, operand, face, remedy, attempts) carried into the exact-replay reason
- CAD kernel: degenerate-alignment Booleans (sphere/torus seams, circle piece ranges, split vertices on samples), displacement recovery, seeded fuzz harness, gap analysis spec 33 §7
- CAM kernel: rest machining from the stock the earlier operations left
- Sync everything across desktop and phone, nikcli style
- Untrack local tool config and working folders, ignore them
- Enhance live stock replay functionality with new move limit
- Enhance workspace preview with feature tree integration
- Enhance CAD components and integrate PropertyEditorModal
- Update package manager to Bun 1.4.3 and replace typecheck commands with Bun's built-in checker
- Add library review page and integrate library management features
- Spec 32: collisions against the stock left at each moment (3-axis replay on the height field) and near misses within a clearance for rapids, holders and the machine's head
- Spec 32: singularities (C turning at the tilt pole) and C unwinding (over 180° in one move) on the timeline, for every rotary program
- Spec 32 P6: the live stock of rotary programs — a voxel stock cut by the tool along its own axis at the move's angles, back and forth by checkpoints, drawn as its air faces where the height field does not hold
- Spec 32 P8: ISO lathe inserts — C/D/V/S/T/W/R shapes with their tip angles and nose radius from the code, drawn as such; usual shapes per operation flagged assumed
- Spec 32 P8: tool holders as their outline — ER, shrink fit, hydraulic, Weldon, arbor, tapping chuck with the spindle flange; the assumed holder suits the tool; the collision reach takes the flange
- Spec 32 P7: collisions on the playback timeline — rapids into the stock, shank and holder deeper than the tool reaches, the machine's head against the table, trunnion, workholding and stock; markers, seekable events, stop at a collision; one tool rule for view, head and checks
- Spec 32 P5: machine models — VMC, 4th axis, trunnion AC/BC, head-table BC, fork head AC, gantry router; links posed in part or machine frame, machine axes in the DRO, travel and rotary limits on the timeline; rotary-only blocks are replayed; one-tool programs draw their header tool
- Spec 32 P3: an imported lathe program draws each tool's insert (threading, grooving, parting) from its own blocks; generator tool issues only for the generator's own program
- Enhance chamfer feature handling in ParametricPanel and ToolpathVisualizer
- CAD C12: exact holes on work planes, and the CAM sees them
- Add simulation timeline component and related functionality
- Mirror and pattern of whole bodies (Fusion Mirror/Pattern > Bodies), mesh and exact
- Spec 32 P2: interpreter replays tapping/boring cycles, G41/G42 cutter compensation, G52/G10/G54-59 offsets, G68/G68.2/CYCLE800 tilted planes, lathe G70-G76 cycles, U/W and G112 polar; Siemens statements no longer misread; generator no longer double-compensates
- CAM 3D finishing: constant scallop (3D offset), spiral, radial and flat-area strategies in the surface engine and the kernel
- Spec 32 P1: the right tool per operation — operation/tool table, lathe inserts follow the operation, per-operation tools in combined and lathe programs, tool issues in panel/preview/AI, tap/lollipop/barrel/back-chamfer/counterbore shapes; fix KernelSection multiaxis and turned-section diameters
- CAM kernel: five-axis moves remove material from a voxel stock and report its bracket
- CAM kernel: simultaneous five-axis finishing operation on a trunnion machine
- Enhance mobile preview functionality by integrating machine bodies and spindle dynamics. Update the PreviewViewport and ToolpathReview components to handle machine-specific attributes, including spin rates and collision detection. Refactor preview scene management to accommodate machine solids and improve rendering performance. Introduce new error handling for machine scene limits and update related tests for robustness.
- Companion preview: program arcs follow their centre, a corrupt element never fails or poisons a mesh, compact rounding, bounded LRU cache
- Mobile 3D viewer: desktop G-code parse, wide lines, exact framing
- Update mobile dependencies and enhance UI components
- Refactor AI and CAM components for enhanced tool modeling and visualization
- Machine-aware CAM preview: vise/table for mills, turning part in the chuck for lathes, bed and deposits for printers; AI kinematics run and context (spec 31)
- CAM core: machine-aware view model (lathe/printer interpreter words, motion track, setups, frames, bodies, turned profile, deposits, setup checks)
- Refactor desktop application components and remove marketplace features
- Add identity management and OAuth support to the application
- Draw the companion preview with a local Expo Metal module.
- Add a read-only 3D workspace to the mobile companion.
- Deep content for CAD, CAM, viewport, workflows, plugins, history; add interactive 3D viewer
- Implement new Astro documentation site in `packages/web`
- Fix main after #21: typecheck, stale tests, exact draft with a top hinge
- Kernel costs, exact model panel and subprogram replay helpers carried over from the integration session
- Exact fillets 2.5x faster: tessellation skips triangles that already passed, Booleans reuse face meshes, disjoint blend tools share one Boolean, corner seeds coarser
- Subprograms end to end: snapshot, API request, sidecar and assistant manufacture, desktop switch (restored from the stored request); tests through the real sidecar
- NC subprograms: repeated toolpaths (the same motion at another place) written once as an incremental M98 subprogram; the replay interprets O-programs, M98/M99, G91 and attributes sub motion to the call line
- Exact work under a time budget so reports never hold the sidecar; modelling skill teaches product-quality builds; structures sent as JSON text are accepted
- Exact kernel on the sidecar: cadExact API group (analyze / step / assembly) over a shared scene analysis in core; component automations moved from the desktop into core
- Exact loft: rational ruled columns (lines and arcs over a common denominator), planes and cones where columns are analytic, Catmull-Rom spans for smooth lofts; untrimmed NURBS faces integrated over their parameter rectangle; allocation-free NURBS evaluation
- Machining features read from the exact B-rep (STEP solids and rotated parts get holes, pockets, outlines in the planner)
- CAM kernel: volumetric stock removes along a tilted tool axis
- Exact push-pull and mate: face prisms sewn on or subtracted, rigid mate motion from exact centres of area (Green's moments over lines and arcs)
- CAM kernel: volumetric stock removes along a tilted tool axis
- CAM kernel: exact convex distance (GJK over hull vertices) and circumscribed prisms for cylinders with flat ends; spec records why the turning body is not yet in the gate
- Exact sweeps and sweep shells; sewing of solids that share a face
- Exact fillets and chamfers between curved faces of turned parts
- CAM kernel clearance: turning-table moves are counted and reported unsupported (the rotating part body needs an exact distance, not capsules); spec records the limit
- Exact drafts; no feature is skipped silently by the exact replay
- CAM kernel release gate: machine-clearance claim checks holder and shank against the machine table over every NC move; table geometry per machine preset; linear spindle translation in the collision scene; API claim id and snapshot
- CAM kernel: continuous collision of joint moves (certified clearance), simultaneous five-axis plan with block checks, voxel stock with sure/possible removal
- Exact shell of a full revolution; Boolean joins intersection curves broken by the triangle tests
- CAM kernel: tilting head with two tilts (A about X, then B about Y): axis, and the two solutions that reach a direction
- CAM kernel: tilting-head kinematics (B about Y): tool axis and tip with the gauge length, and the tilt that reaches a direction
- CAM kernel: controller joint-interpolation error of table moves and the block count that bounds it
- Rotated components placed exactly, joints inferred from coaxial holes
- CAM kernel: trunnion table kinematics (AC/BC): inverse candidates with branch and unwrapped C, cheapest table path
- Exact shell of an extrusion with an exact profile offset
- Exact extrusion edge treatments: end rims filleted or chamfered with blendBrep
- Component automations on the exact model: hole recognition, smart fasteners, interference, BOM
- Steep-and-shallow finishing (waterline on walls, raster on flats) in the generator, UI and kernel
- The Liquid mixer is exact: overlapping sketch loops, straight SSI lines, tighter gates
- Exact fillets and chamfers on the B-rep, enterprise gates, and a 40x faster Boolean
- CAM kernel: chamfer keeps its width at outside corners; plan editor, deburr and cutter library tested end to end
- Enhance Toolpath Visualizer and Kernel Section with Tool Management
- Publish the nikcli plugin under the @nikoemme_ npm scope
- Release one GitHub release per platform plus an updater index; publish the nikcli plugin to npm
- CAM evidence: every generated program carries a record of its exact NC; cutting data names its table row
- Draw sheets from the exact B-rep edges
- R
- Exact profile corner fillets and chamfers in the history's extrudes; longer timeouts for the kernel's desktop tests
- Add component assembly, element transforms and smooth-face editing; extend modeling features, thread and library store
- Add the native CAM kernel: materials, cutting data, feature planning, NC replay evidence
- Add ExactModelPanel for displaying B-rep model details
- Integrate the exact B-rep checkpoint: exact history replay, STEP from history/scene, AI parametric_exact
- Add drawing capabilities to CAD interface
- Enhance ParametricPanel with script execution capabilities and new features
- Engrave 3D text along a single-stroke font; the viewport draws the same strokes the CAM cuts
- Make an element parametric and the Fusion-style shortcuts; end-to-end checks of the generator and the action listing
- Parametric history: sketch shapes, curves, catalogue solids, coil, move, scale, split, combine; the CAM machines every element
- RM-11: the action catalogue's HTTP face and a standalone nikcli plugin
- Enhance AI context management and tool schemas
- Enhance AI task management and UI components
- Untrack local artifacts and refresh README
- Update dependencies and enhance CAD/CAM UI components
- Update dependencies and enhance CAD/CAM UI components
- Add redesign for AI Assistant UI and functionality
- Add 5-axis machining support and multiaxis operation
- Update dependencies and enhance CI workflows
- Enhance AI Assistant UI and functionality
- Add occt-import-js for CAD file handling and enhance attachment processing
- Remove package manager specification from package.json and add CamRibbon component with associated data structures for CAM workspace UI. Introduce StrategyPalette data module for organizing machining strategies, enhancing modularity and testability. Update CSS for CAM ribbon styling and add new translations for ribbon actions in i18n files.
- Refactor chamferCylinder functions and improve error handling
- Add detailed elevation roadmap for CAD/CAM instance and nikcli session loop analysis
- Implement parametric modeling features and enhance CADCanvas functionality
- Enhance workspace navigation and UI consistency
- Add companion gateway, pinned iOS client and desktop pairing screen
- Add git-style project history, pull requests, workflows and iOS companion scaffold
- Implement internationalization for Import/Export dialog
- Update dependencies, enhance UI, and implement Liquid Glass effect
- Add AI assistant features and UI enhancements
- Implement CAM tool enhancements and machine description functionality
- Implement document settings management for units and tolerance
- Enhance AI provider management and improve UI components
- Add AGENTS.md documentation, enhance AI context management, and improve CAD functionality
- Update dependencies, add AI components, and configure Turbo build system
- Add initial project structure and configuration files
- Rm
- Sdfsdfsd
- 5.5.0
- 5.0
- Implement Tauri HTTP plugin integration with desktop API client
- Checkpoint before follow-up message
- Implement Better Auth + Neon integration for Tauri desktop app
- Checkpoint before follow-up message
- Update local dev port and add deep link OAuth test documentation
- Add Tauri OAuth support with deep link integration
- Checkpoint before follow-up message
- Test4
- Test2
- Testt
- Remove single instance plugin and add updater configuration
- Checkpoint before follow-up message
- Checkpoint before follow-up message
- Checkpoint before follow-up message
- Checkpoint before follow-up message
- Update build manifest and static files with new build ID
- Checkpoint before follow-up message
- Yoooo
- R
- Yp

## Desktop

- Add default on-demand CAD/CAM and CNC manuals catalogue
- Remove flutes rendering from mill tools in the 3D viewport and update related tests to reflect this change. The flute strips are no longer drawn, ensuring a cleaner representation of mill types in the Resources page and machine scene.
- Closest parts (exact clearance) in the assembly automations
- Desktop tests: reset the kernel panel's settings between files
- CAM kernel progress on the live stream: cam.progress frames from the sidecar to the desktop and phone
- Enhance mobile assistant features and UI consistency
- Refresh open pages on cache invalidation, scope mobile state per account, harden VCS sync, separate dev data dir
- Refactor project and resource management by removing public access checks
- Machine view test: the first tilt off the pole with C turning is a singularity
- CAM page test: the collisions case leaves the editor tab open for the next case
- Spec 32 P8: path buffers in preallocated typed arrays with class lookup by toolpath and index — 1 M moves in 0.18 s instead of 1.19 s
- Refactor version control prompts and commands for clarity and consistency. Update descriptions to reflect that AI can commit on the checked-out branch, including `main`, without requiring a separate branch. Enhance git profile management by ensuring user identities are created and managed correctly. Implement initial commit functionality for projects without history, ensuring proper attribution for AI actors. Update tests to validate these changes.
- Enhance ToolpathVisualizer and CamPage with simulation player integration
- Property panel: fields read-only again until Edit Properties
- Fix dimension editing in the property panel
- Implement OAuth support for AI provider connections
- Enhance AI components with plugin and mod integration
- Enhance ExtensionsSettings component with improved error handling and styling
- Refactor AI components for improved styling and functionality
- Fix the three full-suite failures
- AI-11 Step 5: bind each turn to its drawing; compare-and-swap drawing writes
- Refactor AI tool handling to incorporate canonical tools and enhance action definitions
- AI-11 Step 1: declare CAM results; verdicts are answers
- Assistant harness the nikcli way: layered system prompt (one txt per layer) with an engineering-standards layer and an env block, industrial-standards skill, composed-form and exact-kernel guidance in the modelling skills, kernel-aware tool prompts, specialists and workspace context
- Material section: kernel grade, tool material and machine limits drive the recommended cutting data
- Refactor ResourceGeometryPreview and resource geometry handling
- Enhance CAM functionality with Save feature and file type support
- CAM page: programs the assistant generates add up, one preview colour per tool
- Preserve B-rep kernel test adjustments
- Preserve CAM kernel work in progress: camStore, OperationsList, CamPage, playback, cam-sync
- Three primary agents (general, cad, cam) over the nikcli subagents; bg tasks as cards in the chat
- Scoped, revocable tokens for a standalone nikcli
- Add nikcli's /goal: slash command, host goal command, goal controls
- Add new probe and prompt size scripts; enhance elements store with clearElements function
- Enhance AI Assistant functionality and Markdown rendering
- Remove resurrected old paths, hide scrollbars app-wide
- Reorganize desktop src into feature folders
- Update AGENTS.md and enhance Assistant UI components
- Refactor CSS and enhance DOM helper functions
- Give every workspace page the toolpaths layout
- Look up the page's own toolbar buttons inside the workspace in the resource detail test
- Fix the two failing tests that kept CI red
- Track everything linked to a project; add Version control screen and GitHub routes
- Revoke session tokens on sign-out, make reset and magic links single-use, polish pricing buttons
- Wire session auth and Stripe billing end to end
- Enhance ScreenHeader and EmptyState components, improve CSS transitions
- Add AI context management, CAD synchronization, and drawing context enhancements

## Desktop (Tauri shell)

- Add notification support and enhance settings UI

## Sidecar

- CAM kernel: a dropped request announces the run as cancelled on the live stream
- CAM kernel: progress and cancellation end to end, run in the scoped worker
- Test sync delivery to real members and terminal-driven writes reaching the live stream
- Fan machine-config changes out to organizations using them; test frame delivery per user
- Manage projects, project contents and resources from the phone
- First account adopts the local profile; phone can create projects
- Accept description on machine config upserts and test the Resources generator end to end
- Type the AI status host check in the phone endpoint test
- Phone conversation list and paged history: GET /api/ai/sessions?projectId= and GET /api/ai/sessions/:id/messages?before=&limit= (nikcli mobile session list/detail), owner-checked, bounded, allow-listed on the gateway
- Companion gateway: per-route body limits (413), response deadlines for non-stream routes (504), per-device request/write/stream budgets (429 + Retry-After), structured request logs, device attribution on VCS audit rows
- Stable newest-first order with an opaque nextCursor, bounded limit/offset, malformed paging is a 400 instead of a 500
- Session journal: 409 for a prompt to a running session, refusals stay out of the journal, a cut turn tells its followers, restart-safe cursors, character/idle bounds, lagging followers heal from the journal
- Workspace previews: content-hashed ETag with If-None-Match 304, encoded payloads cached in a bounded LRU
- Type the race in the phone endpoint test
- Phone endpoints: contract test against the API and the gateway, live read of every screen; busy from a turn's first event; empty history is []
- Phone assistant on the nikcli mobile architecture: POST sessions/prompt starts a detached desktop turn, GET sessions/:id/stream follows it
- Mobile assistant aligned with nikcli mobile: provider/model/thinking picker, per-project preferences, session inspector, stream recovery; CAD/CAM 3D viewer with studio shading, crease outline, floor grid, axes and standard views
- AI-11 Step 11: evaluation corpus, compiled sidecar smoke, token and cost sources
- AI-11 Step 10: dimensional acceptance and kernel jobs in a worker
- AI-11 Step 9: durable background-task journal and bounded recovery
- AI-11 Step 8: gate test for verification bound to the stored program
- AI-11 Step 6: one context assembly per turn
- AI-11 Step 1: CAD, parametric and inspection inputs declared once in Effect
- AI-11 Step 1 (part 1): action outcome contract and CAD family result schemas
- Assistant reads the exact kernel: cad.exact (per-solid validity, mass, holes, CAM machining mode) and cad.assembly (interference, BOM, joints, missing fasteners)
- Wire the CAM kernel into the assistant: materials, cutting_data, manufacture
- Offer the Fusion commands to the assistant and let it make drawn elements parametric
- Plugin AI tools: contributes.aiTools, a worker that runs the plugin's exports, and the production wiring
- Scope what an outside client sees with nikcli's policy statements
- Companion chat e2e: script the consolidated tools and approve the host's asks
- Test the assistant from the phone end to end; make the MiniMax endpoint configurable

## Mobile

- Mobile branding everywhere: pairing link, projects header and settings about
- Mobile branding: app icon and wordmark across the app, centred icon header
- Mobile UI polish pass 3: every remaining text on the type scale
- Mobile UI polish pass 2: shared UI, chat and workspace refinement
- Mobile UI polish pass 2: unified 16pt gutter, sheet grabber, press feedback, mono record meta, typing row
- Mobile UI polish pass 1: palette contrast, shared primitives, chat, project and workspace screens
- Forget assistant project, sessions and preferences for projects missing from the fresh desktop list
- Sign in with the CADCAMFUN account and send it to the paired desktop
- Enhance PreviewViewport with segment visibility tracking
- Mobile activity follows the desktop's nextCursor (no repeated or skipped rows, end decided by the cursor); offset paging stays for older desktops
- Mobile connection accessory: say how many messages wait in the outbox while the desktop is offline
- Mobile 3D reviews update in place: a new desktop revision keeps the previous model or path on screen while it loads (useRetained), with an updating note
- Mobile assistant on the 409 busy refusal: a prompt to a running session steers that turn; the outbox keeps a refused message unsubmitted for the next drain
- Mobile pull request: confirm merge with what lands where, add Close without merging, section headers for VoiceOver
- Mobile CAD/CAM reviews: landscape/iPad split with a full-height viewer, a part picked in 3D scrolls the element list and is announced, memoized G-code rows during playback; overview says when the desktop is offline
- Mobile assistant: compose offline into the outbox with waiting rows that settle on delivery, follow the session the outbox opened, jump-to-latest pill, offline/reconnecting strip, Stop progress state
- Mobile transcript: reasoning disclosure, tool renders with a zoomable viewer, finished tool runs grouped (nikcli ToolRunGroup), stable row ids and memoized rows, card-style turn errors
- Mobile assistant: agent roster through the cancellable resource hook; remove the unguarded useHostResource
- Mobile settings: discard queued offline messages with a confirmation (clearOfflineQueue); diagnostics read the typed AI host
- Mobile activity: older notifications load by server offset (no refetch of shown rows, overlap dropped by id, abortable); AI status typed and normalized against the API schema
- Mobile privacy cover: a native full-screen modal above open sheets and the 3D viewer; an immediate lock also covers the app switcher snapshot
- Mobile 3D viewer: the inline viewer stops following playhead and camera under the full-screen one; mesh, path and crease edges are prepared once and shared by both
- Mobile toolpath clock: rapids and feedless cuts at the desktop simulator's rates (RAPID_FEEDRATE_MM_MIN), guarded by a test against packages/core
- Mobile 3D viewer: fit to the viewport's aspect and re-fit on resize until the camera is moved
- Mobile app enterprise pass (shell, assistant presentation, settings, activity, projects, 3D)
- Fix mobile 3D preview: the line shader used the reserved MSL keyword `vertex` as a variable, so the shader library never compiled on device and every mesh/toolpath preview failed; compile the embedded shader with the iOS Metal compiler in tests
- Enhance mobile pairing and connection reliability
- Harden the companion Metal preview against untrusted geometry.
- IOS app: name it CADCAMFUN, use the CADCAMFUN logo as the app icon, add an install-on-device script
- README with the first-run steps for a physical iPhone and TestFlight
- Pair the simulator app with a real sidecar in CI and assert the round trip
- Compile and lint the iOS shell on the host; add it to CI

## API

- CAM M2: tapping and reaming reach the HTTP contract and the assistant
- Fix the phone assistant never answering: Automatic resolved catalogue providers (OpenRouter) to model id = provider id, and an interrupted prompt the host had already saved was resent five times
- Add mod support to AI components
- AI-11 Step 2: whole value for Code Mode, bounded text for the model
- AI-11 Step 1: every action declares its result; inputs move to Effect

## AI

- The machine configuration carries what the person wrote, and the controller is optional
- The library prompt documents the machine configuration the assistant writes, in the shape the kernel reads
- Spec 32 P9: cam.machine reports the simulation player's view — operations on the clock, move classes, the machine model's axes and limits, collisions
- AI-11 Step 7: every prompt and skill checked against the code
- AI-11 Step 4: per-Instance host configuration and lifecycle
- AI-11 Step 3: require a human for destructive tools in every permission mode
- AI-11 Step 0: harness execution guide, generated inventory and spec corrections
- Validation recovery: keep the history hint when a text history parses to an empty or partial object
- Host patch: fold delivered instructions before every step, so a skill loaded during a long turn (a /goal run) is sent once instead of in full on every step
- Refactor CAM editing prompts for clarity and conciseness
- Test the viewport image end to end on the Anthropic protocol
- Apply the nikcli media-in-tool-results patch when the sidecar is compiled

## Web

- Kernel deep-dive pages, 3D views on every page, nikcli-style API reference
- Deeper content pass and full verification (fix swallowed code-block endings, viewer render checks)
- Deep content for the remaining pages, real kernel output, 3D setup and native-job previews
- Deepen AI, streaming, sidecar, companion, mobile and desktop pages
- Enrich all docs pages with verified details from source
- Enrich desktop, sidecar, CAD and mobile pages with verified details
- Update documentation structure and add API reference generation

## Integrations

- Plugin SDK example bundle regenerated from the current core
- Restore hello-gear example output rewritten by the test run

## Build and release

- Implement cross-compilation for sidecar binaries in GitHub workflows. Add build-sidecars job to handle multiple target platforms using Bun, and update build job to utilize prebuilt sidecar artifacts. Ensure proper artifact handling and streamline the build process for Tauri integration.
- Remove obsolete codex session file and update build script to skip tests during the build process. The build steps now only include typechecking, enhancing clarity and efficiency in the build pipeline.
- Npm publish: fall back to @cadcamfun/cadcamfun when the @nikoemme_ scope is missing or not writable
- Ios workflow: launch the app in the iOS simulator and check it stays alive
- Add iOS simulator build workflow on a macOS runner
- Add cross-platform build scripts for Linux, macOS, and Windows

## Documentation

- CAD kernel: record the spec 33 increment in the history (the work landed in 76256b6 and b70e643)
- Spec 33 §7.15
- Spec 29: real-app evidence and the full desktop run
- Spec 32: parity checklist status after P1-P9 work
- Spec 33: M2 and C12 closed, the order of work moves to C4 and C2
- Point to spec 33
- Spec 33: measured CAD/CAM kernel gap inventory (kernels, HTTP/sidecar, desktop, assistant), integration defects found, order of work and what this pass closed
- Spec 32: machine simulation parity analysis — measured gaps (wrong tool per operation, tap/bore/comp/tilted-plane/lathe cycles not replayed, no machine model, no live removal) and phased plan
- Spec 13: phone backend hardening — busy 409, journal bounds and restarts, conversation list and history, conditional previews, gateway policy, notification paging
- Spec 31: machine-aware toolpath view (vise, chuck, printer bed) with verified baseline
- Add the native CAM kernel design contract (spec 29) and its pointers in specs 04 and 12
- RM-11: record the mod gate result and why the fallback already covers the mod's jobs
- Add native AI architecture and planning documentation
- Add WP14 multi-operation setups contract
- Record the verified simulator-to-desktop round trip
- The iOS app launches and stays alive in the iOS simulator on macOS CI
- Record the billing decision: Stripe

## Core

- Fix the two tests that fail the validate job on main.
- Fix optional chaining in stock test to prevent runtime errors when accessing requested tolerance. Update test assertion to ensure robustness in handling undefined values.
- Update README and enhance CAD/CAM functionality with new tests and features. Refactor push/pull and draft operations to support named face references, ensuring better error handling for stale references. Introduce warnings in parametric reports and improve STEP file handling in tests. Add tests for multiaxis mode preservation in HTTP requests and refine ellipse handling in CAD operations.
- Finalize release automation and document the CADCAMFUN platform
- Enhance CAM functionality by introducing a program sheet as a visual capture for the assistant's vision tool. This allows the CAM page to display the G-code and toolpaths even when the 3D preview is not visible. Update related components to ensure the program sheet is registered and rendered correctly, improving the assistant's ability to provide context while editing. Additionally, update the changelog and documentation to reflect these changes.
- Enhance DirectModel with request timeout feature to prevent indefinite waits during stateless calls. Introduce requestTimeoutMs setting for controlling call duration and update related error handling for timeout scenarios. Add tests to ensure proper functionality and failure handling for provider inactivity.
- Refactor machine configuration handling to unify the profile reading process across various shapes. Update the machine profile to ensure it accurately reflects the configuration written by users, including optional fields for controller and axes. Enhance the UI components for selecting CAD elements and improve messaging for element selection in the generator. This change streamlines the interaction between the library, assistant, and kernel, ensuring consistency in machine data representation.
- CAM kernel: the tolerance budget's cases run the whole kernel, so they need more than the default timeout
- CAM kernel: the machine profile is the one place that reads a machine configuration, in whatever shape it was written
- Enhance CAM kernel with built-in and user-defined machine configurations. Introduce functionality to select machines from a combined list of built-in presets and user configurations, allowing for more flexible planning. Update related components to handle machine configurations in requests and improve UI to display built-in machines distinctly. Add tests to ensure proper integration of new machine selection features.
- Add foundational project documentation including Code of Conduct, Contributing guidelines, Governance, Privacy policy, Security policy, Support information, and Trademark policy. Update LICENSE and README to reflect mixed licensing terms. Introduce issue and pull request templates for better community engagement.
- CAM kernel: B/C trunnion preset, structured five-axis stock bracket and mill-turn lathe mode, connected through API, desktop and the assistant
- CAD kernel: exact shell of cones, spheres and tori (faces of revolution); slab margin retry; spec 33 §7.19
- CAM kernel: tolerance budget on the artifact, through the API and the desktop evidence
- CAM kernel: Siemens 840D post and machine preset
- CAM kernel: shank and holder checked against the live stock for moves with the table turned
- Exact analysis: face names (handles for cad.shell) and what healing would do for a solid that does not validate; API contract and snapshot additions
- CAD kernel: a pole within 2e-4 of the model size of the other solid goes to the verified recovery; spec 33 §7.18
- CAD kernel: ball and planar joints in the kinematics; spec 33 §7.17 (wider sweeps)
- CAD kernel: spurs of several samples on an intersection piece are removed (fuzz seed 14 closed); straight-span fallback for hooking fits; spec 33 §7.16
- Cad.distance (exact gap between two solids) and cad.shell (a paper shell: volumes, open faces by name); overlap of boxes sharing planes detected; prompt budgets and inventory updated
- CAD kernel: STL, OBJ, glTF and 3MF export of exact bodies; spec 33 §7.14 (outward offset tried, withdrawn)
- CAD kernel: exact shell of bodies made of planes and cylinders by dilation of the boundary (slabs, bands, edge cylinders and tori, vertex spheres); spec 33 §7.13
- CAD kernel: validation reports a face that gives no triangle (a silently missing share of the volume)
- CAD kernel: a sphere point within 0.5% of a pole takes u from its neighbours (fragments at a pole no longer tessellate to nothing); spec 33 §7.12
- CAD kernel: Boolean recovery guards against valid-but-wrong results (pole contact routing, sampled volume check, volume identities); spec 33 §7.11
- CAD kernel: exact variable-radius fillet on straight edges (loft of homothetic sections); spec 33 §7.10
- CAD kernel: assembly kinematics (joints with limits, gear and rack couplings, forward solver, motion study with exact clash checks); spec 33 §7.9
- GD&T feature control frames (14 characteristics), datum features and BOM balloons on the sheet; assistant options schema
- CAD kernel: clearance in the assembly report (core, API contract, assistant view); generated clients regenerate with the next commit that carries them
- CAD kernel: sketch intersections, trim and extend; spec 33 §7.8
- CAD kernel: faceByName and matchFaces (selections follow a rebuilt body)
- CAD kernel: blend fuzzing (bore, boss, dome bodies; fillet and chamfer of every edge)
- CAD kernel: tessellation of long thin cylinders follows the aspect (3.2 s -> 0.37 s), performance gates; spec 33 §7.7
- CAD kernel: exact minimum distance between solids and assembly clearance report
- CAD kernel: unique stable face names for exact bodies (neighbour-keyed, positional fallback); spec 33 §7.6
- CAD kernel: healBrep (vertex/edge welding, collapsed uses) wired into STEP import; spec 33 §7.5
- CAM kernel planner: rest roughing for freeform parts; a rest pass with nothing left is skipped, not failed
- CAD kernel: structured Boolean diagnostics (stage, operand, face, remedy, attempts) carried into the exact-replay reason
- CAD kernel: degenerate-alignment Booleans (sphere/torus seams, circle piece ranges, split vertices on samples), displacement recovery, seeded fuzz harness, gap analysis spec 33 §7
- CAM kernel: rest machining from the stock the earlier operations left
- Sync everything across desktop and phone, nikcli style
- Untrack local tool config and working folders, ignore them
- Enhance live stock replay functionality with new move limit
- Enhance workspace preview with feature tree integration
- Enhance CAD components and integrate PropertyEditorModal
- Update package manager to Bun 1.4.3 and replace typecheck commands with Bun's built-in checker
- Add library review page and integrate library management features
- Spec 32: collisions against the stock left at each moment (3-axis replay on the height field) and near misses within a clearance for rapids, holders and the machine's head
- Spec 32: singularities (C turning at the tilt pole) and C unwinding (over 180° in one move) on the timeline, for every rotary program
- Spec 32 P6: the live stock of rotary programs — a voxel stock cut by the tool along its own axis at the move's angles, back and forth by checkpoints, drawn as its air faces where the height field does not hold
- Spec 32 P8: ISO lathe inserts — C/D/V/S/T/W/R shapes with their tip angles and nose radius from the code, drawn as such; usual shapes per operation flagged assumed
- Spec 32 P8: tool holders as their outline — ER, shrink fit, hydraulic, Weldon, arbor, tapping chuck with the spindle flange; the assumed holder suits the tool; the collision reach takes the flange
- Spec 32 P7: collisions on the playback timeline — rapids into the stock, shank and holder deeper than the tool reaches, the machine's head against the table, trunnion, workholding and stock; markers, seekable events, stop at a collision; one tool rule for view, head and checks
- Spec 32 P5: machine models — VMC, 4th axis, trunnion AC/BC, head-table BC, fork head AC, gantry router; links posed in part or machine frame, machine axes in the DRO, travel and rotary limits on the timeline; rotary-only blocks are replayed; one-tool programs draw their header tool
- Spec 32 P3: an imported lathe program draws each tool's insert (threading, grooving, parting) from its own blocks; generator tool issues only for the generator's own program
- Enhance chamfer feature handling in ParametricPanel and ToolpathVisualizer
- CAD C12: exact holes on work planes, and the CAM sees them
- Add simulation timeline component and related functionality
- Mirror and pattern of whole bodies (Fusion Mirror/Pattern > Bodies), mesh and exact
- Spec 32 P2: interpreter replays tapping/boring cycles, G41/G42 cutter compensation, G52/G10/G54-59 offsets, G68/G68.2/CYCLE800 tilted planes, lathe G70-G76 cycles, U/W and G112 polar; Siemens statements no longer misread; generator no longer double-compensates
- CAM 3D finishing: constant scallop (3D offset), spiral, radial and flat-area strategies in the surface engine and the kernel
- Spec 32 P1: the right tool per operation — operation/tool table, lathe inserts follow the operation, per-operation tools in combined and lathe programs, tool issues in panel/preview/AI, tap/lollipop/barrel/back-chamfer/counterbore shapes; fix KernelSection multiaxis and turned-section diameters
- CAM kernel: five-axis moves remove material from a voxel stock and report its bracket
- CAM kernel: simultaneous five-axis finishing operation on a trunnion machine
- Enhance mobile preview functionality by integrating machine bodies and spindle dynamics. Update the PreviewViewport and ToolpathReview components to handle machine-specific attributes, including spin rates and collision detection. Refactor preview scene management to accommodate machine solids and improve rendering performance. Introduce new error handling for machine scene limits and update related tests for robustness.
- Companion preview: program arcs follow their centre, a corrupt element never fails or poisons a mesh, compact rounding, bounded LRU cache
- Mobile 3D viewer: desktop G-code parse, wide lines, exact framing
- Update mobile dependencies and enhance UI components
- Refactor AI and CAM components for enhanced tool modeling and visualization
- Machine-aware CAM preview: vise/table for mills, turning part in the chuck for lathes, bed and deposits for printers; AI kinematics run and context (spec 31)
- CAM core: machine-aware view model (lathe/printer interpreter words, motion track, setups, frames, bodies, turned profile, deposits, setup checks)
- Refactor desktop application components and remove marketplace features
- Add identity management and OAuth support to the application
- Draw the companion preview with a local Expo Metal module.
- Add a read-only 3D workspace to the mobile companion.
- Deep content for CAD, CAM, viewport, workflows, plugins, history; add interactive 3D viewer
- Implement new Astro documentation site in `packages/web`
- Fix main after #21: typecheck, stale tests, exact draft with a top hinge
- Kernel costs, exact model panel and subprogram replay helpers carried over from the integration session
- Exact fillets 2.5x faster: tessellation skips triangles that already passed, Booleans reuse face meshes, disjoint blend tools share one Boolean, corner seeds coarser
- Subprograms end to end: snapshot, API request, sidecar and assistant manufacture, desktop switch (restored from the stored request); tests through the real sidecar
- NC subprograms: repeated toolpaths (the same motion at another place) written once as an incremental M98 subprogram; the replay interprets O-programs, M98/M99, G91 and attributes sub motion to the call line
- Exact work under a time budget so reports never hold the sidecar; modelling skill teaches product-quality builds; structures sent as JSON text are accepted
- Exact kernel on the sidecar: cadExact API group (analyze / step / assembly) over a shared scene analysis in core; component automations moved from the desktop into core
- Exact loft: rational ruled columns (lines and arcs over a common denominator), planes and cones where columns are analytic, Catmull-Rom spans for smooth lofts; untrimmed NURBS faces integrated over their parameter rectangle; allocation-free NURBS evaluation
- Machining features read from the exact B-rep (STEP solids and rotated parts get holes, pockets, outlines in the planner)
- CAM kernel: volumetric stock removes along a tilted tool axis
- Exact push-pull and mate: face prisms sewn on or subtracted, rigid mate motion from exact centres of area (Green's moments over lines and arcs)
- CAM kernel: volumetric stock removes along a tilted tool axis
- CAM kernel: exact convex distance (GJK over hull vertices) and circumscribed prisms for cylinders with flat ends; spec records why the turning body is not yet in the gate
- Exact sweeps and sweep shells; sewing of solids that share a face
- Exact fillets and chamfers between curved faces of turned parts
- CAM kernel clearance: turning-table moves are counted and reported unsupported (the rotating part body needs an exact distance, not capsules); spec records the limit
- Exact drafts; no feature is skipped silently by the exact replay
- CAM kernel release gate: machine-clearance claim checks holder and shank against the machine table over every NC move; table geometry per machine preset; linear spindle translation in the collision scene; API claim id and snapshot
- CAM kernel: continuous collision of joint moves (certified clearance), simultaneous five-axis plan with block checks, voxel stock with sure/possible removal
- Exact shell of a full revolution; Boolean joins intersection curves broken by the triangle tests
- CAM kernel: tilting head with two tilts (A about X, then B about Y): axis, and the two solutions that reach a direction
- CAM kernel: tilting-head kinematics (B about Y): tool axis and tip with the gauge length, and the tilt that reaches a direction
- CAM kernel: controller joint-interpolation error of table moves and the block count that bounds it
- Rotated components placed exactly, joints inferred from coaxial holes
- CAM kernel: trunnion table kinematics (AC/BC): inverse candidates with branch and unwrapped C, cheapest table path
- Exact shell of an extrusion with an exact profile offset
- Exact extrusion edge treatments: end rims filleted or chamfered with blendBrep
- Component automations on the exact model: hole recognition, smart fasteners, interference, BOM
- Steep-and-shallow finishing (waterline on walls, raster on flats) in the generator, UI and kernel
- The Liquid mixer is exact: overlapping sketch loops, straight SSI lines, tighter gates
- Exact fillets and chamfers on the B-rep, enterprise gates, and a 40x faster Boolean
- CAM kernel: chamfer keeps its width at outside corners; plan editor, deburr and cutter library tested end to end
- Enhance Toolpath Visualizer and Kernel Section with Tool Management
- Publish the nikcli plugin under the @nikoemme_ npm scope
- Release one GitHub release per platform plus an updater index; publish the nikcli plugin to npm
- CAM evidence: every generated program carries a record of its exact NC; cutting data names its table row
- Draw sheets from the exact B-rep edges
- R
- Exact profile corner fillets and chamfers in the history's extrudes; longer timeouts for the kernel's desktop tests
- Add component assembly, element transforms and smooth-face editing; extend modeling features, thread and library store
- Add the native CAM kernel: materials, cutting data, feature planning, NC replay evidence
- Add ExactModelPanel for displaying B-rep model details
- Integrate the exact B-rep checkpoint: exact history replay, STEP from history/scene, AI parametric_exact
- Add drawing capabilities to CAD interface
- Enhance ParametricPanel with script execution capabilities and new features
- Engrave 3D text along a single-stroke font; the viewport draws the same strokes the CAM cuts
- Make an element parametric and the Fusion-style shortcuts; end-to-end checks of the generator and the action listing
- Parametric history: sketch shapes, curves, catalogue solids, coil, move, scale, split, combine; the CAM machines every element
- RM-11: the action catalogue's HTTP face and a standalone nikcli plugin
- Enhance AI context management and tool schemas
- Enhance AI task management and UI components
- Untrack local artifacts and refresh README
- Update dependencies and enhance CAD/CAM UI components
- Update dependencies and enhance CAD/CAM UI components
- Add redesign for AI Assistant UI and functionality
- Add 5-axis machining support and multiaxis operation
- Update dependencies and enhance CI workflows
- Enhance AI Assistant UI and functionality
- Add occt-import-js for CAD file handling and enhance attachment processing
- Remove package manager specification from package.json and add CamRibbon component with associated data structures for CAM workspace UI. Introduce StrategyPalette data module for organizing machining strategies, enhancing modularity and testability. Update CSS for CAM ribbon styling and add new translations for ribbon actions in i18n files.
- Refactor chamferCylinder functions and improve error handling
- Add detailed elevation roadmap for CAD/CAM instance and nikcli session loop analysis
- Implement parametric modeling features and enhance CADCanvas functionality
- Enhance workspace navigation and UI consistency
- Add companion gateway, pinned iOS client and desktop pairing screen
- Add git-style project history, pull requests, workflows and iOS companion scaffold
- Implement internationalization for Import/Export dialog
- Update dependencies, enhance UI, and implement Liquid Glass effect
- Add AI assistant features and UI enhancements
- Implement CAM tool enhancements and machine description functionality
- Implement document settings management for units and tolerance
- Enhance AI provider management and improve UI components
- Add AGENTS.md documentation, enhance AI context management, and improve CAD functionality
- Update dependencies, add AI components, and configure Turbo build system
- Add initial project structure and configuration files
- Rm
- Sdfsdfsd
- 5.5.0
- 5.0
- Implement Tauri HTTP plugin integration with desktop API client
- Checkpoint before follow-up message
- Implement Better Auth + Neon integration for Tauri desktop app
- Checkpoint before follow-up message
- Update local dev port and add deep link OAuth test documentation
- Add Tauri OAuth support with deep link integration
- Checkpoint before follow-up message
- Test4
- Test2
- Testt
- Remove single instance plugin and add updater configuration
- Checkpoint before follow-up message
- Checkpoint before follow-up message
- Checkpoint before follow-up message
- Checkpoint before follow-up message
- Update build manifest and static files with new build ID
- Checkpoint before follow-up message
- Yoooo
- R
- Yp

## Desktop

- Add default on-demand CAD/CAM and CNC manuals catalogue
- Remove flutes rendering from mill tools in the 3D viewport and update related tests to reflect this change. The flute strips are no longer drawn, ensuring a cleaner representation of mill types in the Resources page and machine scene.
- Closest parts (exact clearance) in the assembly automations
- Desktop tests: reset the kernel panel's settings between files
- CAM kernel progress on the live stream: cam.progress frames from the sidecar to the desktop and phone
- Enhance mobile assistant features and UI consistency
- Refresh open pages on cache invalidation, scope mobile state per account, harden VCS sync, separate dev data dir
- Refactor project and resource management by removing public access checks
- Machine view test: the first tilt off the pole with C turning is a singularity
- CAM page test: the collisions case leaves the editor tab open for the next case
- Spec 32 P8: path buffers in preallocated typed arrays with class lookup by toolpath and index — 1 M moves in 0.18 s instead of 1.19 s
- Refactor version control prompts and commands for clarity and consistency. Update descriptions to reflect that AI can commit on the checked-out branch, including `main`, without requiring a separate branch. Enhance git profile management by ensuring user identities are created and managed correctly. Implement initial commit functionality for projects without history, ensuring proper attribution for AI actors. Update tests to validate these changes.
- Enhance ToolpathVisualizer and CamPage with simulation player integration
- Property panel: fields read-only again until Edit Properties
- Fix dimension editing in the property panel
- Implement OAuth support for AI provider connections
- Enhance AI components with plugin and mod integration
- Enhance ExtensionsSettings component with improved error handling and styling
- Refactor AI components for improved styling and functionality
- Fix the three full-suite failures
- AI-11 Step 5: bind each turn to its drawing; compare-and-swap drawing writes
- Refactor AI tool handling to incorporate canonical tools and enhance action definitions
- AI-11 Step 1: declare CAM results; verdicts are answers
- Assistant harness the nikcli way: layered system prompt (one txt per layer) with an engineering-standards layer and an env block, industrial-standards skill, composed-form and exact-kernel guidance in the modelling skills, kernel-aware tool prompts, specialists and workspace context
- Material section: kernel grade, tool material and machine limits drive the recommended cutting data
- Refactor ResourceGeometryPreview and resource geometry handling
- Enhance CAM functionality with Save feature and file type support
- CAM page: programs the assistant generates add up, one preview colour per tool
- Preserve B-rep kernel test adjustments
- Preserve CAM kernel work in progress: camStore, OperationsList, CamPage, playback, cam-sync
- Three primary agents (general, cad, cam) over the nikcli subagents; bg tasks as cards in the chat
- Scoped, revocable tokens for a standalone nikcli
- Add nikcli's /goal: slash command, host goal command, goal controls
- Add new probe and prompt size scripts; enhance elements store with clearElements function
- Enhance AI Assistant functionality and Markdown rendering
- Remove resurrected old paths, hide scrollbars app-wide
- Reorganize desktop src into feature folders
- Update AGENTS.md and enhance Assistant UI components
- Refactor CSS and enhance DOM helper functions
- Give every workspace page the toolpaths layout
- Look up the page's own toolbar buttons inside the workspace in the resource detail test
- Fix the two failing tests that kept CI red
- Track everything linked to a project; add Version control screen and GitHub routes
- Revoke session tokens on sign-out, make reset and magic links single-use, polish pricing buttons
- Wire session auth and Stripe billing end to end
- Enhance ScreenHeader and EmptyState components, improve CSS transitions
- Add AI context management, CAD synchronization, and drawing context enhancements

## Desktop (Tauri shell)

- Add notification support and enhance settings UI

## Sidecar

- CAM kernel: a dropped request announces the run as cancelled on the live stream
- CAM kernel: progress and cancellation end to end, run in the scoped worker
- Test sync delivery to real members and terminal-driven writes reaching the live stream
- Fan machine-config changes out to organizations using them; test frame delivery per user
- Manage projects, project contents and resources from the phone
- First account adopts the local profile; phone can create projects
- Accept description on machine config upserts and test the Resources generator end to end
- Type the AI status host check in the phone endpoint test
- Phone conversation list and paged history: GET /api/ai/sessions?projectId= and GET /api/ai/sessions/:id/messages?before=&limit= (nikcli mobile session list/detail), owner-checked, bounded, allow-listed on the gateway
- Companion gateway: per-route body limits (413), response deadlines for non-stream routes (504), per-device request/write/stream budgets (429 + Retry-After), structured request logs, device attribution on VCS audit rows
- Stable newest-first order with an opaque nextCursor, bounded limit/offset, malformed paging is a 400 instead of a 500
- Session journal: 409 for a prompt to a running session, refusals stay out of the journal, a cut turn tells its followers, restart-safe cursors, character/idle bounds, lagging followers heal from the journal
- Workspace previews: content-hashed ETag with If-None-Match 304, encoded payloads cached in a bounded LRU
- Type the race in the phone endpoint test
- Phone endpoints: contract test against the API and the gateway, live read of every screen; busy from a turn's first event; empty history is []
- Phone assistant on the nikcli mobile architecture: POST sessions/prompt starts a detached desktop turn, GET sessions/:id/stream follows it
- Mobile assistant aligned with nikcli mobile: provider/model/thinking picker, per-project preferences, session inspector, stream recovery; CAD/CAM 3D viewer with studio shading, crease outline, floor grid, axes and standard views
- AI-11 Step 11: evaluation corpus, compiled sidecar smoke, token and cost sources
- AI-11 Step 10: dimensional acceptance and kernel jobs in a worker
- AI-11 Step 9: durable background-task journal and bounded recovery
- AI-11 Step 8: gate test for verification bound to the stored program
- AI-11 Step 6: one context assembly per turn
- AI-11 Step 1: CAD, parametric and inspection inputs declared once in Effect
- AI-11 Step 1 (part 1): action outcome contract and CAD family result schemas
- Assistant reads the exact kernel: cad.exact (per-solid validity, mass, holes, CAM machining mode) and cad.assembly (interference, BOM, joints, missing fasteners)
- Wire the CAM kernel into the assistant: materials, cutting_data, manufacture
- Offer the Fusion commands to the assistant and let it make drawn elements parametric
- Plugin AI tools: contributes.aiTools, a worker that runs the plugin's exports, and the production wiring
- Scope what an outside client sees with nikcli's policy statements
- Companion chat e2e: script the consolidated tools and approve the host's asks
- Test the assistant from the phone end to end; make the MiniMax endpoint configurable

## Mobile

- Mobile branding everywhere: pairing link, projects header and settings about
- Mobile branding: app icon and wordmark across the app, centred icon header
- Mobile UI polish pass 3: every remaining text on the type scale
- Mobile UI polish pass 2: shared UI, chat and workspace refinement
- Mobile UI polish pass 2: unified 16pt gutter, sheet grabber, press feedback, mono record meta, typing row
- Mobile UI polish pass 1: palette contrast, shared primitives, chat, project and workspace screens
- Forget assistant project, sessions and preferences for projects missing from the fresh desktop list
- Sign in with the CADCAMFUN account and send it to the paired desktop
- Enhance PreviewViewport with segment visibility tracking
- Mobile activity follows the desktop's nextCursor (no repeated or skipped rows, end decided by the cursor); offset paging stays for older desktops
- Mobile connection accessory: say how many messages wait in the outbox while the desktop is offline
- Mobile 3D reviews update in place: a new desktop revision keeps the previous model or path on screen while it loads (useRetained), with an updating note
- Mobile assistant on the 409 busy refusal: a prompt to a running session steers that turn; the outbox keeps a refused message unsubmitted for the next drain
- Mobile pull request: confirm merge with what lands where, add Close without merging, section headers for VoiceOver
- Mobile CAD/CAM reviews: landscape/iPad split with a full-height viewer, a part picked in 3D scrolls the element list and is announced, memoized G-code rows during playback; overview says when the desktop is offline
- Mobile assistant: compose offline into the outbox with waiting rows that settle on delivery, follow the session the outbox opened, jump-to-latest pill, offline/reconnecting strip, Stop progress state
- Mobile transcript: reasoning disclosure, tool renders with a zoomable viewer, finished tool runs grouped (nikcli ToolRunGroup), stable row ids and memoized rows, card-style turn errors
- Mobile assistant: agent roster through the cancellable resource hook; remove the unguarded useHostResource
- Mobile settings: discard queued offline messages with a confirmation (clearOfflineQueue); diagnostics read the typed AI host
- Mobile activity: older notifications load by server offset (no refetch of shown rows, overlap dropped by id, abortable); AI status typed and normalized against the API schema
- Mobile privacy cover: a native full-screen modal above open sheets and the 3D viewer; an immediate lock also covers the app switcher snapshot
- Mobile 3D viewer: the inline viewer stops following playhead and camera under the full-screen one; mesh, path and crease edges are prepared once and shared by both
- Mobile toolpath clock: rapids and feedless cuts at the desktop simulator's rates (RAPID_FEEDRATE_MM_MIN), guarded by a test against packages/core
- Mobile 3D viewer: fit to the viewport's aspect and re-fit on resize until the camera is moved
- Mobile app enterprise pass (shell, assistant presentation, settings, activity, projects, 3D)
- Fix mobile 3D preview: the line shader used the reserved MSL keyword `vertex` as a variable, so the shader library never compiled on device and every mesh/toolpath preview failed; compile the embedded shader with the iOS Metal compiler in tests
- Enhance mobile pairing and connection reliability
- Harden the companion Metal preview against untrusted geometry.
- IOS app: name it CADCAMFUN, use the CADCAMFUN logo as the app icon, add an install-on-device script
- README with the first-run steps for a physical iPhone and TestFlight
- Pair the simulator app with a real sidecar in CI and assert the round trip
- Compile and lint the iOS shell on the host; add it to CI

## API

- CAM M2: tapping and reaming reach the HTTP contract and the assistant
- Fix the phone assistant never answering: Automatic resolved catalogue providers (OpenRouter) to model id = provider id, and an interrupted prompt the host had already saved was resent five times
- Add mod support to AI components
- AI-11 Step 2: whole value for Code Mode, bounded text for the model
- AI-11 Step 1: every action declares its result; inputs move to Effect

## AI

- The machine configuration carries what the person wrote, and the controller is optional
- The library prompt documents the machine configuration the assistant writes, in the shape the kernel reads
- Spec 32 P9: cam.machine reports the simulation player's view — operations on the clock, move classes, the machine model's axes and limits, collisions
- AI-11 Step 7: every prompt and skill checked against the code
- AI-11 Step 4: per-Instance host configuration and lifecycle
- AI-11 Step 3: require a human for destructive tools in every permission mode
- AI-11 Step 0: harness execution guide, generated inventory and spec corrections
- Validation recovery: keep the history hint when a text history parses to an empty or partial object
- Host patch: fold delivered instructions before every step, so a skill loaded during a long turn (a /goal run) is sent once instead of in full on every step
- Refactor CAM editing prompts for clarity and conciseness
- Test the viewport image end to end on the Anthropic protocol
- Apply the nikcli media-in-tool-results patch when the sidecar is compiled

## Web

- Kernel deep-dive pages, 3D views on every page, nikcli-style API reference
- Deeper content pass and full verification (fix swallowed code-block endings, viewer render checks)
- Deep content for the remaining pages, real kernel output, 3D setup and native-job previews
- Deepen AI, streaming, sidecar, companion, mobile and desktop pages
- Enrich all docs pages with verified details from source
- Enrich desktop, sidecar, CAD and mobile pages with verified details
- Update documentation structure and add API reference generation

## Integrations

- Plugin SDK example bundle regenerated from the current core
- Restore hello-gear example output rewritten by the test run

## Build and release

- Implement cross-compilation for sidecar binaries in GitHub workflows. Add build-sidecars job to handle multiple target platforms using Bun, and update build job to utilize prebuilt sidecar artifacts. Ensure proper artifact handling and streamline the build process for Tauri integration.
- Remove obsolete codex session file and update build script to skip tests during the build process. The build steps now only include typechecking, enhancing clarity and efficiency in the build pipeline.
- Npm publish: fall back to @cadcamfun/cadcamfun when the @nikoemme_ scope is missing or not writable
- Ios workflow: launch the app in the iOS simulator and check it stays alive
- Add iOS simulator build workflow on a macOS runner
- Add cross-platform build scripts for Linux, macOS, and Windows

## Documentation

- CAD kernel: record the spec 33 increment in the history (the work landed in 76256b6 and b70e643)
- Spec 33 §7.15
- Spec 29: real-app evidence and the full desktop run
- Spec 32: parity checklist status after P1-P9 work
- Spec 33: M2 and C12 closed, the order of work moves to C4 and C2
- Point to spec 33
- Spec 33: measured CAD/CAM kernel gap inventory (kernels, HTTP/sidecar, desktop, assistant), integration defects found, order of work and what this pass closed
- Spec 32: machine simulation parity analysis — measured gaps (wrong tool per operation, tap/bore/comp/tilted-plane/lathe cycles not replayed, no machine model, no live removal) and phased plan
- Spec 13: phone backend hardening — busy 409, journal bounds and restarts, conversation list and history, conditional previews, gateway policy, notification paging
- Spec 31: machine-aware toolpath view (vise, chuck, printer bed) with verified baseline
- Add the native CAM kernel design contract (spec 29) and its pointers in specs 04 and 12
- RM-11: record the mod gate result and why the fallback already covers the mod's jobs
- Add native AI architecture and planning documentation
- Add WP14 multi-operation setups contract
- Record the verified simulator-to-desktop round trip
- The iOS app launches and stays alive in the iOS simulator on macOS CI
- Record the billing decision: Stripe

