# 3D-printing parity audit

Date: 2026-10-22. Source: the current working tree at HEAD `d7a2808`, including pre-existing uncommitted changes. Scope: FDM/FFF printing, compared with the milling and turning implementations in this repository. This is an analysis, not an implementation contract, roadmap step, or printer qualification. No application source, dependency, API schema, existing spec, or roadmap status was changed by this audit.

## Verdict

**3D printing is not at parity with milling, or with the stronger parts of turning.** It is a legacy-style, primitive-based G-code generator with a useful machine-aware preview. It is not an additive manufacturing kernel. Its UI exposes capabilities that do not reach the emitted program, and some generated programs have reproducible coordinate and extrusion defects.

The comparison must not overstate the baseline: milling has typed planning, mesh/B-rep part input, machine/cutter constraints, NC-bound claims and a release gate; not every milling configuration is verified. Native turning is an external-profile preview with analytic stock/pass volumes and machine limits, explicitly `release: "preview"`. The shared verification adapter rejects both turning and printing. Bringing printing to parity means matching the architecture and truthful evidence of those modules, not claiming that lathe verification is already complete.

## What already works

- Shared generator request schemas, authenticated HTTP generation, parsing and suggestions exist; the UI and assistant use the core implementation. Printing is not missing an HTTP path altogether.
- Cube, cylinder, sphere, cone and torus shells, filament-length calculations, temperature/start/end words, and bed placement for individual supported primitives exist.
- Composite printing has polygon outlines, inward shell offsets and clipped rectilinear `lines` infill. These are limited implementations, not a general slicer.
- The interpreter handles M82/M83, E deltas, G92 and G28 for preview. A parallel `MotionTrack` preserves extrusion that the geometric IR does not carry.
- The main 3D scene has a bed, build-volume wireframe, nozzle, travel/extrusion distinction, progressive deposition, a partial current segment and layer filtering. Printer checks detect extrusion outside the rectangular bed, above build height and an excessively high first layer.
- The generator has a CAD part picker, printer parameters, bed origin/size, kinematics/build-height settings, and generic save/export infrastructure. Portable CAM documents include `settings` and `printer` extras. Assistant operation creation/update/generation splits and preserves the six printer extras.

Evidence: the existing core, sidecar and desktop checks listed below; `packages/core/src/cam/viewer/{machine-setup,printer-layers,setup-checks}.ts`; `apps/desktop/src/viewport/view3d/machine-scene.ts:304`; `packages/api/src/cam-program.ts:23`; `apps/sidecar/src/services/ai.ts:211` and `:808`.

## End-to-end paths

1. Generator: `ToolpathGenerator.tsx` -> `features/cam/lib/job.ts` -> `POST /api/toolpaths/generate` -> `generator/index.ts:124` -> primitive/composite text -> common text post-passes -> `analyseGcode` -> geometric `Program` plus generic `ProgramRecord`.
2. Preview: `CamPage.tsx:170` reparses ordinary G-code with `POST /api/toolpaths/parse` -> `Program + MotionTrack` -> timeline -> printer deposits and setup findings -> Three.js scene. Generation itself does not return `motion`; the normal page reparses to recover it.
3. Native milling: `POST /api/toolpaths/manufacture` -> `services/cam-program.ts` -> native job preparation/planning/execution -> exact emitted NC, operation outcomes, claims, identity and release. Printer profiles are refused by `kernelMachineOfProfile`; the operation/artifact schemas describe subtractive strategies.
4. Turning: the legacy generator plus separate native `planTurning` / `cam.turn` / `cam_edit.turn`, with a preview-only stock/pass model. No equivalent additive plan/artifact interface exists.

## Critical defects reproduced

### P0-01 — Generic success evidence can contradict actual print errors

`generator/index.ts:101` extracts only comments starting exactly with `; Warning:`. Several printer paths emit uppercase `; WARNING:`, `; ERROR:` or TODO comments, so they never become response warnings. `generator/evidence.ts:165` marks the milling replay checks `not-run` for printers; `:198` then allows an overall `passed`. It does not incorporate the printer setup findings.

Reproduction: a 20 × 20 × 1 mm cube on a 10 × 10 mm bed with build height 0.5 returns HTTP 200, `warnings=[]`, `evidence.result=passed`. Independently running the preview checks reports `PRINTER_OFF_BED` and `PRINTER_ABOVE_VOLUME`. Default composite grid infill is also missing while evidence says passed.

Needed: structured additive issues at their source; one shared print validation module for generation/API/AI/viewer; explicit unsupported/unresolved/not-run coverage in the result and release semantics. A generated-text check must not present itself as process validation.

### P0-02 — Final retraction uses the wrong E coordinate

`generator/printer-base.ts:40` selects absolute extrusion with M82. `:57` emits `G1 E-2` without an E reset or relative-extrusion switch. After the audited cube's final E26.07595, this requests **-28.07595 mm**, not a 2 mm retraction.

Needed: a deliberate absolute/relative E state model; end blocks derived from the final state; regression cases with different total extrusion, resets and firmware profiles. The preview currently omits timed E-only moves, so it does not expose this defect accurately.

### P0-03 — Composite placement declares a transform that children never receive

`printer.ts:196` computes bed placement through `shiftElement`; `generator/elements.ts:503` shifts the root fields/points, not nested members. `printer-composite.ts:131` then reads children directly and ignores the root placement.

Reproduction: a composite containing a cube with bottom Z5 declares `bottom at Z0`, but emits its first layer at **Z5.200**, with off-bed XY and high-first-layer preview findings. Individual-primitive placement tests do not prove composite placement.

Needed: resolve the full CAD scene transform once, including nested components/instances, before bounding, placement and slicing. Use the exact same placed geometry in the preview and generator.

### P0-04 — Unsupported CAD can produce a different part

`printer.ts:181` substitutes a cube for unsupported element types. Text emits an error comment and still prints a cube (`:161`). The cube dimensions come from a few element properties/defaults, not necessarily even the true mesh bounds. Composite outlines support only five primitive types (`printer-composite.ts:85`); unsupported members contribute no outline. Primitive rotation/scale fields are ignored: the audited cube with `rotationY:90, scaleX:2, scaleY:3, scaleZ:4` emits byte-identical NC.

Needed: share the resolved mesh/B-rep geometry adapter with subtractive CAM; slice actual transformed solids and imported meshes. Refuse unsupported/open/invalid geometry with a typed error. Do not substitute a printable box for the requested shape.

### P0-05 — Common text optimizations do not preserve extrusion

`generator/index.ts:144` and `:145` can apply the common optimizer/arc fitter to printer output. `postpass.ts:12` compares XYZ/feed/motion without E; a same-position extrusion is removed. `convertLinesToArcs` emits fitted G1/G2/G3 blocks without the source E words. Both losses are reproduced directly against these public functions. This proves those transformations are unsafe for extruding input; it does not claim every current closed primitive ring triggers arc fitting.

Needed: E-aware transformations with filament conservation and motion equivalence, or exclude printing until that invariant is supported. Printer arc emission also needs an explicit firmware capability.

## Functional and architectural gaps

### P1-01 — A real slicing module is missing

Primitive generation and composite generation are separate implementations. A primitive cube ignores infill density/pattern entirely (`printer.ts:39`); composites implement only `lines` (`printer-composite.ts:227`), while the default schema selects `grid` (`schema.ts:244`). Supports are comments (`printer-composite.ts:261`). There are no generated top/bottom solid skins, support interfaces, functional raft/brim stages or continuous-Z vase stage in this path. All six printer operation choices produce identical NC for the audited primitive.

Needed: one geometry-to-layers interface, robust ring union/hole topology and offsets, then shell/skin/infill/support/adhesion planning over those layers. At minimum, implement an honest supported subset and reject the rest. Overlapping identical composite members currently double shell extrusion instead of being unioned; this is also reproduced.

### P1-02 — Several UI options do not control generation

Changing `printResolution` or `printOrientation` does not change NC. Changing nozzle diameter alone leaves NC unchanged while `extrusionWidth` retains its default. Travel speed (150), retraction distance/speed (2/60), overhang angle/density (45/20), raft layers and brim width (0/0) are hardcoded in `generator/index.ts:75`. Most are not exposed in the shared request's printer extras. Primitive support and infill controls also have no effect, as above.

Needed: a capability-backed form; remove/disable unsupported choices, or connect them to implemented planners. Define nozzle/width/layer relationships explicitly, expose travel/retraction/flow/cooling/adhesion settings as supported, and make resolution control a measured slicing tolerance rather than a cosmetic label.

### P1-03 — Multi-part/build-plate semantics are missing

`generator/index.ts:125` takes only `selectedElements[0]`; adding a second selected part does not change NC. A composite is not an arranged build plate, does not union overlapping members, and has the placement defect above. Generic operation concatenation (`packages/api/src/cam-program.ts:13`) concatenates complete programs; repeated print startup/homing/E resets are not a coordinated multi-part print job.

Needed: explicit selected part IDs, transformed instances, joint plate placement, duplicate/overlap checks, print-by-layer versus sequential-part semantics, and sequential-print head clearance. Unsupported arrangements must be refused. Do not silently print only the first part.

### P1-04 — Additive job, artifact and process contracts are missing

`kernel/contracts.ts:28` models only mill/lathe machines. `kernel/schema.ts:43`, `packages/api/src/cam-kernel.ts` and `ai-cam.ts:41` describe cutters, stock removal and subtractive strategies. The general generator schema is a flat union: it accepts a printer with `operationType:pocket` and `toolType:endmill`, and accepts a layer height of 2 with a 0.2 nozzle. The HTTP incompatibility is reproduced with status 200.

Needed: a discriminated additive job/profile/plan/artifact with layers, path roles, extrusion/flow, temperatures, fan, retraction, placement, filament totals, machine/firmware limits, input/NC identity and coverage claims. This may be a separate additive implementation behind shared interfaces; do not force it into the milling heightfield or cutter schema.

### P1-05 — Additive verification and release are missing

`verify/request.ts:84` returns `Verification supports milling operations only`. The printer preview checks rectangular extrusion endpoints, not all travel, nozzle/body collision against deposited material, unsupported islands/bridging, deposit coverage, flow, thermal readiness or the full firmware state. A 100 mm-deep bed still receives the hardcoded end move to Y200 (`printer-base.ts:61`) with no `PRINTER_OFF_BED` finding because the move does not extrude.

Needed: additive replay from exact NC, all-motion bounds, build deposition, head/bed/part clearance, layer continuity/support checks, and process/firmware limits. Qualified/unsupported/unresolved must remain distinct. Temperature waits need an explicit timing assumption or unknown duration, not invented thermal certainty. This does not require claiming a physical thermal/mechanical simulation.

### P1-06 — Printer machine and material profiles stop short of the process

The Resources kind can be `printer`, and machine selection recognizes it. But `kernel/machine-config.ts:45` refuses it, the native built-in catalogue is mill/lathe, and `MachineForProgram` is used for multiaxis generation while other operations ignore it (`generator/schema.ts:284`). `MachineSelect.tsx:86` changes preview override/kernel settings; it does not apply the selected printer's bed, firmware, temperature or motion limits to the generator. `previewSetup` builds printers from generator settings. The material enum is generic machining material, not a typed filament profile.

Needed: canonical printer/firmware/nozzle/extruder/filament profiles with bed shape and origin, build height, motion/feed/acceleration/volumetric-flow and thermal limits. Wire one selected profile through generation, preview, persistence and AI. Delta currently shares rectangular bed checks; naming its kinematics is not a reachable-volume solver. Keep profiles distinct from generic free-form resource metadata.

### P1-07 — Extrusion is outside the main IR and portable operation model

`ir.ts:49`/`:56` geometric moves have no E, temperature, fan or path role. `MotionTrack` adds E for parsed text; `GenerateResponseSchema` omits that track while parse returns it. `CamProgramDocument` and `CamProgramOperation` preserve NC and geometric Program/settings but no motion track or per-operation printer extras. The ordinary page reparses its NC, so this is not a claim that its normal preview has no deposits. However, composed assistant operation results intentionally skip reparsing (`CamPage.tsx:172`) and clear motion (`camStore.ts:215`); a Program-only replay has zero printer beads, reproduced by the audit.

Needed: an additive process IR or a versioned companion event track carried through generation, composition, saving, restoring, mobile/AI readers and postprocessing. Require alignment and NC identity. Preserve per-operation printer settings when composition is supported.

### P1-08 — The small print preview depicts settings, not generated paths

`PrinterPreview.tsx:94` draws grid/triangles/honeycomb and `:135` draws schematic supports directly from form values, even when the generator produces none. It is separate from the NC-driven main visualizer. `PrinterSettings.tsx` and `PrinterParamsSection.tsx` duplicate layer/nozzle/speed/temperature controls with different bounds. The explorer assignment adapter forces `machineType:mill` (`elementJob.ts:65`), and `generateForElement` does not forward current printer extras.

Needed: preview the actual layer plan; label any schematic explicitly; use one printer parameter form; provide an additive explorer/build-plate flow instead of reusing milling tool/material assignment assumptions. Verify UI choices through emitted NC, not only through request construction.

### P1-09 — The visualizer has no deposited-volume verification or full printer mechanics

`machine-scene.ts:315` renders deposits as `THREE.LineSegments` with a basic line material, not width/height-aware bead solids. There is no additive volume state or target-deviation check. `machine-model.ts:108` returns no model for a printer; the scene animates the nozzle and draws a bed/build volume, but does not implement CoreXY belts, bed-slinger bed travel or delta link motion. Kinematics labels do not imply those mechanics. E-only moves are absent from the timed timeline; the audit confirms zero moves/duration for a two-millimetre stationary retraction.

Needed: role/width/height-aware bead rendering, explicit retraction/prime events, per-layer process readout and head-versus-deposit collision evidence. Add physical printer links when the viewer promises machine-frame mechanics. Reuse the existing timeline/deposit batching; do not replace the working preview wholesale. Real WebGL appearance and 200k/1M-move performance were not measured in this audit.

### P1-10 — Printer postprocessing/firmware has no dedicated path

`PostProcessorTab.tsx:12` offers seven CNC controller dialects, no explicit Marlin/Klipper/RepRap printer profile. The printer directly emits one fixed start/end sequence, including fixed prime/park coordinates. Re-emitting its geometric Program through a milling post cannot reconstruct E/thermal state. The exact NC is preserved in the ordinary text/save path, so generic saving itself is not absent.

Needed: printer firmware capabilities and start/end profiles, extrusion mode/state correctness, bounds-aware park/prime, supported arcs and extrusion conservation across processing. Scope printer post options and export metadata to the active process.

### P2-01 — Estimates are disconnected from emitted work

`generator/estimates.ts:62` estimates from bounding dimensions and requested density/support, although those settings can generate no fill/support. For cubes it uses `height` (CAD Y) as layer count while generation uses `depth` (CAD Z). Weight uses generic material names, hardcoded shell thickness and density assumptions. NC geometric statistics also omit heater waits and E-only time.

Needed: filament length, deposited volume, mass and segment times from the actual additive plan/NC; separate warm-up/machine dynamics assumptions. Use measured filament density/cost and explicitly mark uncertain totals.

### P2-02 — Assistant integration exists, but its manufacturing depth is the same limited generator

Do not report printing as unavailable to AI: `services/ai.ts:211`, `:808`, `:905` create/update/generate printer operations and preserve extras. `cam.machine` / `cam.analyze` know printer axes, bed and preview findings. However, native `cam.manufacture`/`cam.turn` have no additive counterpart, generic generation returns statistics without an additive artifact, and setup comparisons rely on the milling verifier.

Needed: expose the same additive planning, validation, capability explanations, layer statistics and NC-bound release evidence to the assistant. Any new action must use the current catalogue and governance contracts; this audit does not change RM statuses or schedule later work ahead of its prerequisites.

### P2-03 — Current tests preserve legacy limitations; acceptance coverage is missing

`packages/core/test/cam/generator-parity.test.ts:145` checks support comments and `:202` checks TODO-only primitive infill/support. These are useful characterization tests but not evidence of printable support or fill. Existing CAD-picker tests verify complete request data, not that a mesh is sliced correctly. Existing machine-view tests inspect Three.js objects without WebGL.

Needed: geometry-to-layer fixtures for holes, overlapping unions, transformed/imported/parametric parts; flow/filament conservation; feature-sensitive NC assertions; composite placement; off-volume travel; printer profile selection; save/reopen/compose extrusion identity; API/AI agreement; real visual and large-print performance checks. Use an independent slicer/firmware oracle or analytically checked geometry where appropriate; that external comparison was not run here.

## Suggested implementation increments

These are dependency recommendations for a future authorized change, not a replacement roadmap.

1. **Truth and NC correctness:** P0-01 through P0-05; validate full motion bounds, correct end E, composite placement and unsupported geometry behavior. Gate: every concrete reproduction becomes an acceptance test for corrected behavior; unrelated NC remains stable.
2. **Contracts and process geometry:** P1-04/P1-06/P1-07; define shared additive interfaces and use resolved CAD geometry. Gate: typed decode rejects incompatible inputs; input/profile/NC identity survives UI/API/AI/save round trips.
3. **One real slicer:** P1-01/P1-02/P1-03; layer topology, shells/skins, supported infill, supports and adhesion, coordinated placement. Gate: holes/volumes/extrusion/coverage checked against known shapes, every advertised control demonstrably changes the right plan stage.
4. **Verification and visual fidelity:** P1-05/P1-08/P1-09/P1-10; shared additive replay, actual-plan UI, firmware post and scoped mechanics. Gate: UI/API/AI agree on the same findings, E-only timing retained, bead/head clearance and target coverage checked; real rendered scenes inspected.
5. **Finish integration:** P2 items; actual-plan estimates, assistant actions, printer resources and persistence/composition fixtures, large-print performance. Gate: full CAD selection -> generation -> preview -> save -> reopen -> export evidence chain on representative printers/parts.

Owners: WP2 pure CAM slicing/process/replay; WP1 resolved geometry seam; WP3 additive schemas; WP4 HTTP/worker/persistence adapters; WP6 generator/page/library; WP7 viewport/timeline; WP8 assistant catalogue. Update the owning design specs before changing cross-WP contracts. Keep Effect out of hot geometry loops; decode at the interfaces. Reuse the existing generator HTTP group and saved document adapters unless a demonstrated second consumer requires another seam.

## Verification and limits

Reproducible audit fixtures live beside this file. They assert **current defects**, not desired product behavior, and are deliberately outside the normal `bun test packages apps` suite. After a fix, replace the relevant characterization with acceptance assertions in the owning package.

Command:

```sh
bun --no-env-file test specs/audits/printing-parity/characterization.test.ts specs/audits/printing-parity/http-characterization.test.ts
```

Actual final output (exit 0):

```text
AUDIT HTTP oversized: status=200; warnings=[]; evidence=passed
AUDIT HTTP incompatible printer/pocket/endmill: status=200
AUDIT HTTP extrusion track: generate=absent; parse=present
AUDIT composite placement: says bottom at Z0; first layer=5.200; preview reports PRINTER_OFF_BED + PRINTER_FIRST_LAYER_HIGH
AUDIT composite-default: missing grid infill; warnings=[]; evidence=passed
AUDIT oversized: generation success; warnings=[]; evidence=passed; preview reports PRINTER_OFF_BED + PRINTER_ABOVE_VOLUME
AUDIT final-retraction: deltaE=-28.07595 mm; requested=2 mm
 23 pass
 0 fail
 48 expect() calls
Ran 23 tests across 2 files. [6.72s]
```

Existing baseline commands and actual summaries:

```sh
bun --no-env-file test packages/core/test/cam/generator.test.ts packages/core/test/cam/generator-parity.test.ts packages/core/test/cam/machine-view.test.ts packages/core/test/cam/machine.test.ts packages/core/src/cam/kernel/turning.test.ts packages/core/src/cam/kernel/kernel.test.ts
# exit 0: 175 pass; 0 fail; 13531 expect() calls
# Ran 175 tests across 6 files. [82.63s]

bun --no-env-file test apps/sidecar/test/toolpath-generator.test.ts
# exit 0: 16 pass; 0 fail; 41 expect() calls
# Ran 16 tests across 1 file. [16.94s]

bun --no-env-file test apps/desktop/test/generator-machines.test.ts apps/desktop/test/generator-payload.test.ts apps/desktop/test/generator-cad-selection.test.ts apps/desktop/test/cam-machine-view.test.ts apps/desktop/test/cam-save.test.ts apps/desktop/test/cam-verify.test.ts
# exit 1: 52 pass; 1 fail; 424 expect() calls
# Ran 53 tests across 6 files. [203.74s]
# error: timed out; page text: FileEditViewHelpCADCAM FUNCmd/Ctrl+KPlayCAD EditorLibraryCostsPreviewEditor G-CodeToolpathPost-ProcessorHomeSetupMachiningSimulationPostToolsProfile & PocketContourPocketFaceDrillThread Mill3D SurfaceZ-Level RoughParallel FinishWaterlineAdaptive ClearRest MachiningMulti-AxisIndex 3+24-Axis Continuou
# at apps/desktop/test/cam-save.test.ts:156:15

bun --no-env-file test apps/desktop/test/cam-save.test.ts --test-name-pattern 'CAM Save creates'
# exit 0: 1 pass; 6 filtered out; 0 fail; 19 expect() calls
# Ran 1 test across 1 file. [68.91s]
```

The save timeout passed in isolation; its cause is not established. It is not attributed to printing, and the failed batch is not presented as green. The audit covers current source, focused behavioral tests, authenticated in-process HTTP and DOM/Three.js-object tests. It does not certify a complete workspace build/typecheck, all repository tests, rendered WebGL, printer hardware, firmware execution, thermal behavior or an independent slicer comparison. No API contract was changed, so no API-reference generation was needed. Pre-existing working-tree changes were preserved.
