# 73 — Probing, work offsets, 5-axis probing and in-process inspection

Status: built, see the status notes per section and the Change log (2026-11-05). Owners: core (cam/program, cam/kernel), db, api, sidecar, ai, desktop, web apiGroups.
Planned by three planners (core; desktop + visualizer + DB; API + sidecar + AI), built by two implementers.

## 0. Starting point (already on main before this spec)

- `packages/core/src/cam/program/probing.ts`: `ProbeOperation` (z-surface, edge, corner, bore, boss) → neutral `ProbeStep`s,
  `emitProbeSteps` (fanuc G31, linuxcnc G38.2, siemens MEAS), `runProbeSteps` against a modelled part. Tests in
  `probing.test.ts` and `packages/core/test/cam/probing-origins.test.ts`.
- `cam.viewer.MoveClass` has `"probe"` (`MOVE_CLASS_COLORS.probe`), the interpreter parses G38.x/G31 into `state.probe`.
- `cam.ToolModel` has `ProbeModel` / `SetterModel`; `apps/desktop/src/viewport/view3d/tool-object.ts` draws them.
- Machine profile (`kernel/machine-profile.ts`) has `probing {cycles, stylusRadius, feed, dialect}` and
  `workOffsets {available, default}`, stored in `MachineConfig.config` JSON.
- `POST /api/cam/probe/plan` and `/api/cam/probe/emit` (`camSetup.probePlan` / `probeEmit`).
- Legacy generator op `probing` in the desktop generator (`OperationSection.tsx` `ProbeSettings`) — stays, links to the new panel.
- `library_edit.upsert_machine_config` already accepts `probing` and `workOffsets`.

## 1. Decisions (conflicts between the plans, resolved)

| Topic | Decision |
| --- | --- |
| HTTP prefix | New group `camProbing` under `/api/cam/probing/*`. `/api/cam/probe/plan|emit` stay, marked `OpenApi.Deprecated`, and delegate to the new service. |
| Work-offset tables | Machine state, not project state: stored in `MachineConfig.config.workOffsetTable = { entries, bySetup: Record<setupId, entries> }`. Routes `GET/PUT /api/machine-configs/:id/work-offsets?setupId=`. `updateIfCurrent` + `baseUpdatedAt` → 409. Version history comes from `LibraryRowVersion`. |
| Machine probe config | `MachineConfig.config.probing` (extended), `config.toolSetter`, `config.rotaryCalibration`. Routes `GET/PUT /api/machine-configs/:id/probe`; the generic `PUT /api/machine-configs/:id` keeps working. |
| Probe operations | One concept: a probe op is a manufacturing-job operation (`OperationSpec` with `strategy: "probe"`) and, when stored alone, a `Toolpath` row with `operationType: "probing"`, `data.format: "cadcamfun-probe"`. Desktop: `ElementToolpath.probe?: ProbeOperation` in `multiToolpathStore`. |
| Reports | Table `ProbeReport` (**done**, migration `20261104185152_brave_white_tiger`): project cascade; drawing / toolpath / machine set null; `kind part|rotary|stylus|tool-setter`, `source simulated|machine|imported`, `verdict pass|warn|fail|missed|incomplete`, `workOffset`, `programHash`, `sourceRevision`, `data` JSON. Routes `GET/POST /api/projects/:id/probe-reports`, `GET/DELETE /api/projects/:id/probe-reports/:reportId`. |
| Stylus key | Profile keeps `stylusRadius` for compatibility and gains `stylusDiameter`; `settingsFromMachine` prefers the diameter. UI shows the diameter. |
| Tool setter | Top-level `config.toolSetter` (not under `probing`). |
| Contacts | Every simulated contact carries the 1-based NC `line` of its touch block, so the visualizer places contacts and offset changes in time on the parsed program. |
| Degrees | Wire and UI in degrees; core converts. |
| AI | Extend `cam_edit` with `probe`, `probe_run`, `probe_apply` (no new tool); machine probe config through `library_edit.upsert_machine_config`. New skill `probing-and-inspection`. |

## 2. Core (packages/core) — see §5 for the planner 1 detail

## 3. API, sidecar, AI — planner 3

Measured budgets on main (2026-11-04): tool catalogue 35 668 / 35 900; `cam_edit` prompt 3 326 / 5 300; `cam` 5 227 / 5 300
(nothing goes into `cam.txt`); descriptions 37 245 / 37 800; skill descriptions 3 213 / 3 300.

### 3.1 API (`packages/api`)
**Status: done, one exception.** Group, schemas, events, deprecated routes, clients, snapshot, web reference and `CamKernelArtifact` (`probe` strategy and cut, operation summary, `probing` claim, `probing` block) are built and tested. The hand-written `CamProbeSettings/Operation/Step` stay: they describe the legacy `/api/cam/probe/*` body and the core has no schema of that shape to alias. Those two routes are marked deprecated and run the core's legacy adapter directly, not the `Probing` service.

- `src/cam-probing.ts` (new): re-exports core Effect Schemas; transport wrappers `CamProbingSettingsInput` (partial settings +
  `machineConfig?`), `CamProbingFeatureRef {elements (Json records, 1..2000), elementId, ref?, hint?}`, `CamProbingPlanRequest`
  (exactly one of `operation` / `feature`; `settings`, `frame?`, `checks?` ≤50), `CamProbingPlan {operation, cycle, chosenBecause?,
  settings, steps, moves, checks, notes, warnings}`, `CamProbingEmitRequest` (+ `dialect`, `options {orientSpindle?, programNumber?,
  lineNumbers?}`), `CamProbingProgram {dialect, nc, identity {nc sha256}, lines, steps, notes, warnings}`,
  `CamProbingSimulateRequest {elements, operations [{operation, checks?}] 1..50, settings, frame?, workOffsets?, misplacement?
  {x,y,z,a,b,c}, progress?: CamProgressTarget}`, `CamProbingSimulation` (= core `ProbeReport` + `offsetTable?` + `identity`),
  `CamRotaryCalibrationRequest/Result`, `WorkOffsetTableBody/Document`, `MachineProbeConfigBody/Document`,
  `ProbeReportSummary/Document/RunBody`. Replace the hand-written `CamProbeSettings/Operation/Step` in `cam-program-tools.ts`
  with aliases of the core schemas (names kept).
- `src/groups/cam-probing.ts`: `CamProbingGroup = HttpApiGroup.make("camProbing")`:

| id | route | success |
|---|---|---|
| plan | POST /api/cam/probing/plan | CamProbingPlan |
| emit | POST /api/cam/probing/emit | CamProbingProgram |
| simulate | POST /api/cam/probing/simulate | CamProbingSimulation |
| calibrateRotary | POST /api/cam/probing/calibrate-rotary | CamRotaryCalibrationResult |
| workOffsetsGet / Put | GET/PUT /api/machine-configs/:id/work-offsets (?setupId) | WorkOffsetTableDocument (PUT: 403/404/409) |
| probeConfigGet / Put | GET/PUT /api/machine-configs/:id/probe | MachineProbeConfigDocument (PUT: 403/404/409) |
| reportsList | GET /api/projects/:id/probe-reports (?operationId,limit,before) | ProbeReportSummary[] |
| reportsGet | GET /api/projects/:id/probe-reports/:reportId | ProbeReportDocument |
| reportsRun | POST /api/projects/:id/probe-reports (201) | ProbeReportDocument (simulates a stored probe op, persists) |
| reportsSave | PUT /api/projects/:id/probe-reports (201) | ProbeReportDocument (desktop saves a report it holds) |
| reportsRemove | DELETE /api/projects/:id/probe-reports/:reportId | — |

- Plain typed errors (BadRequest/Forbidden/NotFound/Conflict/InternalError), not the legacy `Env*` envelope. Add to `index.ts`
  after `CamSetupGroup`. Deprecate `camSetup.probePlan/probeEmit`.
- Manufacturing job: `OperationSpecSchema` gains the probe member, `CutterSchema.kind` gains `"probe"`, hand-written
  `CamKernelArtifact` gets `cut: "probe"` and `probing?`; `CamProgress.stage` gains `"probe"` (`groups/events.ts`).
- Live events (`groups/events.ts`, add to `PUBLISHED`): `probe.progress {projectId, runId, phase running|done|cancelled, stage?
  queued|plan|touch|check|offsets|record, operationId?, index?, count?, ahead?}`, `probe.result {projectId, runId, reportId?,
  operationId?, verdict, checks, failed, maxDeviationMm?, offsetsUpdated, kind part|rotary}`.
- Regenerate: `bun run generate` (+ `generate:check`), `bun test packages/api/test/contracts.test.ts --update-snapshots` (diff must
  only add), `packages/web/src/data/apiGroups.ts` entry `camProbing`, `bun run --filter @cadcamfun/web generate:api-reference`.
- Tests: `packages/api/test/cam-probing.test.ts` (round trips, operation/feature exclusivity, `G60` rejected, negative tolerance
  rejected), `contracts.test.ts` asserts (routes exist, 409/201 declared, deprecated flag), live-event decode.

### 3.2 Sidecar (`apps/sidecar`) and kernel jobs (`packages/ai`)
**Status: done, with limits.** Repos, `Probing`, progress, handlers and tests are built. There is no `storeOperation` on the service: `ai-probing.ts` stores the operation. Offsets write through `WorkOffsetStore`; the rotary calibration is stored at `config.rotary.calibration`, as the core reads it, not `config.rotaryCalibration`. A `workOrigin` for tool setter cycles comes from the machine's table, so a machine without that offset is refused with the reason. With a `dialect`, `simulate` and `reports.run` answer the program and every contact and offset change carries the line of its block (§1). `reports.run` keeps the kind of a calibration (`stylus`, `rotary`, `tool-setter`). Limit: a calibration artefact stands in the cycle's own coordinates, not on the part, so a calibration run is not shifted by the work offset (the service leaves the table out; `camProbeSimulate` does not place artefacts with it).

- `packages/ai/src/cam-probe.ts`: `camProbePlan`, `camProbeSimulate(…, report)`, `camProbeCalibrate(…, report)`; kernel jobs
  `cam-probe-plan`, `cam-probe-simulate`, `cam-probe-calibrate` in `kernel-jobs.ts` (`KERNEL_JOBS`, `CACHEABLE`,
  `ProbeJobProgress {stage:"probe", step {index,count}, label?}`). Explicit-operation plan/emit run inline; feature resolution
  goes through the job.
- `repos/probe-report-repo.ts` (`ProbeReportRepo`: list/get/create/remove/latestFor/prune keep 200 per op),
  `repos/work-offset-store.ts` (`WorkOffsetStore` over `MachineConfigRepo.find/updateIfCurrent`; read = hasAccess, write = owner).
  `project-repo.ts` delete cascade handled by the FK.
- `services/probing.ts`: `Probing` service (`Context.Service`, `Layer.effect`, `Effect.fn("Probing.x")`) with plan, emit,
  simulate, calibrateRotary, workOffsets.get/put, probeConfig.get/put, reports.list/get/run/save/remove, storeOperation.
  `resolveSettings` = request > machine profile (`settingsFromMachine`) > core default, then `validateProbeSettings` (400 with
  reasons). Writes publish `resources.changed`. Kernel failures via `explainKernelFailure` / `kernelRun`.
- `services/probe-progress.ts` (mirrors `cam-progress.ts`), `http/cam-probing.ts` handlers, `layers.ts` wiring;
  `http/cam-setup.ts` probePlan/probeEmit delegate (legacy test stays green).
- `services/ai-probing.ts`: `probeOperation`, `probeRun`, `probeApply` handlers (exact names — the harness inventory scans them);
  spread into `ai.ts`; `reviewOperation` handles `data.format === "cadcamfun-probe"` (latest verdict / stale / unverified).
  Audit names `ai.cam.probe_saved`, `ai.cam.probe_report`, `ai.cam.work_offsets_set`, `ai.cam.rotary_calibration_applied`.
- Tests: `cam-probing.test.ts` (explicit bore; feature plate-with-hole → bore, top face → z-surface, outside corner → corner;
  stylus too big → 400; emit has no M3/M4, has M19 with orientSpindle; misplacement {0.3,-0.2,0.05} recovered to 1e-3; tilted
  frame {a:30} recovered in base WCS; rotary pivot error recovered; progress frames), `machine-probe-config.test.ts`
  (round trip, setupId scope, 403/404/409, history row, resources.changed), `probe-reports.test.ts`.

### 3.3 AI (`packages/api` action contracts + `packages/ai`)
**Status: done, budgets differ.** `cam_edit probe/probe_run/probe_apply`, `reviewOperation`, widened `library_edit` input, skill and inventory are built and tested. Measured after the change: catalogue limit 36 300 and `descriptions` 38 100 (spec said 36 200 and 38 000), because `library_edit` had to name the new machine fields. `probe` adds `update` and `tolerance` to the spec's fields. `probe` takes `native` (machine macro style; answer carries the word and `claims.probing: unresolved`). Calibration runs as a job operation with its record in the report; `probe_apply` writes rotary and stylus records to the machine. `calibrationError` alone goes through the calibration route, because a job operation measures the table the control believes.

- `packages/api/src/ai-cam-probe.ts`: `cam_edit.probe {operationId?, feature?, operation?, checks? ≤20, workOffset?, frame? deg
  −120..120, dialect?, machineConfig?, settings?, expectedRevision?}`, `cam_edit.probe_run {operationId, misplace?, machineConfig?,
  setupId?, calibrationError?, runId?}`, `cam_edit.probe_apply {machineConfig, reportId? | entries? ≤12, setupId?, mode add|set,
  baseUpdatedAt?}`. Merge into `CAM_ACTION_INPUTS`. Widen `probing` in `ai-action-inputs.ts` and add `toolSetter`,
  `workOffsetTable`, `rotaryCalibration`.
- Results in `ai-action-results.ts` (`probeStored`, `probeReported`, `probeApplied`; refusals `{ok:false,error,status?}`).
- `packages/ai/src/actions/cam-probe.ts` (`CAM_PROBE_ACTIONS`, `defineWireAction`), registered in `actions/catalogue.ts`;
  optional handlers in `tools/handlers.ts`.
- Rules in the handlers: stale revision refused; emission asserted free of M3/M4; `probe_apply` refuses fail/missed/stale
  reports, reports of another machine, rotary report with setupId; 409 → `status: "conflict"`.
- Prompt `cam_edit.txt` ≤ +480 chars (three action lines, result line). Budgets: tool catalogue 35 900 → 36 200,
  `descriptions` → 38 000 (comment each raise). Skill `probing-and-inspection` (`skills/index.ts`, text ≤ 17 000 chars;
  description < 100 chars; shorten `machines-and-axes` description to stay ≤ 3 300). Skill outline: probe is a sensor (no
  spindle, missed touch = alarm); cycle from feature table; stylus radius compensation; approach from outside; work offsets;
  inspection checks (PMI / ISO 286); 5-axis tilted frame then transform back; M19 orient; rotary calibration; tool setter;
  machine config; loop probe → probe_run → probe_apply → cam review; dialects.
- Regenerate `specs/ai/11-harness-inventory.md` (`bun --no-env-file packages/ai/test/helpers/harness-inventory.ts --write`).
- Tests: `packages/ai/test/cam-probe-actions.test.ts`, `cam-probe-jobs.test.ts`, prompt/budget/skill tests,
  `apps/sidecar/test/ai-probing.test.ts` (hole → bore, run with misplace → pass + offsets, apply → GET shows it, failed/stale
  refused, upsert_machine_config round trip, cam review reads the verdict).

## 4. Desktop, visualizer, settings, i18n — planner 2

All imports of core probing names go through `apps/desktop/src/features/cam/lib/probing/contract.ts`.

**Status: done, not seen in the running app.** Built and tested: pure libs, API client, stores, every component, CamPage and ribbon wiring, 3D overlay, library, settings, 11 locales. Write program, Simulate, Show in 3D and calibration write-back (stylus and rotary) run against the real routes (`test/probing-live.test.ts`, real sidecar and kernel). Added beyond the plan: simulated part offset fields in the program section. Simulate sends the dialect and keeps the program it answers, so the 3D view plays the same text the lines refer to: contacts appear in time and the WCS triad moves at the offset block (`probing-live.test.ts`, real parse, real timeline). The program section has `GCodeViewer` above the numbered listing (kept for the touch marks) and a native checkbox enabled by the machine's macro style, with the unresolved claim stated. A native cycle with a deadband or limit is refused by the core with the reason; the panel does not clear those for you. Not checked in the running app: tests only, no screenshot.

- Pure logic `features/cam/lib/probing/`: `cycle-palette.data.ts` (groups setup / five-axis / calibration / tool-setter /
  inspection; `availability(entry, profile)` with reason keys), `cycle-fields.ts` (stable `fieldsOf(kind)`, `defaultSpecOf`,
  `validateSpec`, deg↔rad only here), `probe-targets.ts` (`targetsOf(part, elements)`, `targetAt(hit, targets)`, `applyTarget`),
  `resolve.ts` (cycle > machine > settings defaults > core), `inspection.ts` (`statusOf` with warn band, fail-first sort, CSV
  3 decimals), `work-offsets.ts` (seed from profile, G54.1 bounds per control, applyMeasured, diff), `contact-times.ts`
  (contact → timeline seconds via NC line), `cycles.ts` (`addProbeCycle`, `updateProbeCycle`, `probeCycles`).
- API client `features/cam/api/probing.ts` (`makeProbingService`, 409 → `WorkOffsetConflict`), mirrors `api/setup.ts`.
- Stores: probe cycles are `ElementToolpath` with `settings.operationType = "probing"` and `probe` set (one source of truth);
  `store/probingStore.ts` (UI/result state), `store/workOffsetStore.ts`, `store/inspectionStore.ts`.
- Components `components/probing/`: `ProbingTab` (sections cycles / offsets / inspection / program), `ProbeCyclePalette`,
  `ProbeCycleList`, `ProbeCycleEditor` (NumberField only, update mode, work offset select, tilted plane A/B/C),
  `ProbeTargetPicker` (dropdown + pick on model), `WorkOffsetTable`, `InspectionList` (status pill with text+icon),
  `ProbeProgramPreview` (dialect, GCodeViewer, Simulate, Show in 3D, Insert), `ProbeIcons` (one stroke, currentColor).
- Wiring: `camStore` `RightTab` + `"probing"`; `CamPage.tsx` inspector tab (Crosshair icon); ribbon route `right-probing`;
  legacy `ProbeSettings` link "Open probing panel".
- 3D: `viewport/view3d/probe-overlay.ts` (`probeOverlayModel` pure + `createProbeOverlay` with children `probe:contact`,
  `probe:deviation`, `probe:wcs` (moves before → after at `switchAt`), `probe:frame`, `probe:calibration`); extract `triad()` from
  `machine-scene.ts` into `viewport/view3d/triad.ts`; `view3d.tsx` props `probeOverlay`, `surfacePick` (raycast the part,
  BVH); `toolpath-colors.ts` probe override + legend; `tool-object.ts` names `probe:ball`, pulse on contact; `tool-models.ts`
  `probeModelOf(machineProbing)`; `ToolpathVisualizer.tsx` "Probing" settings group and contact readout.
- Library: `features/library/lib/machine-probing.ts` (`probingFormOf`, `writeProbing`, `probingIssues`),
  `components/MachineProbingFields.tsx` (spindle probe, calibration, rotary calibration read-only, tool setter) mounted after
  `MachineProfileFields`; `machine-details.ts` facts.
- Settings: `shared/state/settings.ts` `probing: ProbingDefaults` (touchFeed 100, fastFeed 1000, clearance 5, safeHeight 25,
  search 10, overtravel 2, defaultUpdateMode set-offset, defaultWorkOffset G54, defaultTolerance 0.05, deviationScale 100) with
  per-field decode; `features/settings/components/probing-settings.tsx`; settings tab `machining`.
- i18n: all 11 locales (`cam.json`, `library.json`, `settings.json`), sentence case, `i18n-literals` baseline must not grow.
- Tests (desktop `test/`): palette, fields, targets, resolve, inspection, work offsets, contact times, overlay (no WebGL),
  toolpath colours, machine probing, settings decode, stores, API client 409, DOM tests (ProbingTab has no `input[type=number]`,
  NumberField accepts "12,5"; WorkOffsetTable save; InspectionList fail-first; MachineProbingFields patch).

## 5. Core detail — planner 1

Core names win over the names in §3/§4: cycle union `ProbeCycle` (`kind`), update modes
`set | report | update-within-tolerance | alarm-outside-tolerance`, offsets as `WorkOffsetRef` + `WorkOffsetTable`. The API wraps
these as Effect Schemas from `kernel/schema.ts`; the desktop shim `contract.ts` maps them. Everything below is pure, mm and
radians (degrees only at emission and on the wire). Vendor syntax tables carry "read from the vendor manual, not run on a control".

### 5.0 Bugs in the existing module (fix, update the tests that pin them)
**Status: done.** Bracketed midpoint, Siemens `$P_UIFR[n,X,TR]` + re-select, Fanuc miss alarm, armed descent, size in a register.
- Fanuc/LinuxCNC `G0 X[#524 + #525] / 2` → `X[[#524+#525]/2]`; Siemens `X(R14 + R15) / 2` → `X=(R14+R15)/2`.
- Siemens `$P_UIFR[1]:X` → `$P_UIFR[n,X,TR]`, then re-select the offset (G54) to activate.
- Fanuc G31 that touches nothing is never detected; `report-size` is only a comment; the descent near the part is an
  unprotected G0 (`expectedZ+5`) → protected probe move.

### 5.1 Layout
**Status: partial.** Every new file exists, plus `probing/calibration.ts`. `program/probing.ts` stays as it is, not the thin adapter asked for: it serves only the deprecated `camSetup.probePlan/probeEmit`, its bugs are fixed (§5.0), and rewriting it would churn its tests with no user-visible gain.
New `packages/core/src/cam/probing/`: `device.ts`, `fit.ts`, `cycles.ts`, `actions.ts`, `native.ts`, `sphere-cast.ts`,
`world.ts`, `simulate.ts`, `rotary-cal.ts`, `features.ts` (feature → cycle, see 5.13), `index.ts`. Plus `cam/work-offset.ts`,
`testing/probe-machine.ts`, `testing/frames.ts` (frame builders extracted from the interpreter, no behaviour change),
`kernel/probing.ts`. `program/probing.ts` becomes a thin adapter (names kept) over the new core and the real posts.

### 5.2 IR (`cam/ir.ts`, `cam/macro.ts`)
**Status: done.** Also `OffsetUpdate.reads` (GRBL `G10 L20`). `lowerExprDepth` runs in the writer on toolpaths that probe (depth 4, Klartext 6); a test holds Fanuc and LinuxCNC to five brackets on the deepest cycles.
- New moves: `Probe {to, direction (unit), overtravel, feed, kind touch|protected, onMiss alarm|flag, store? {x?,y?,z?: VarRef},
  flag?}`, `OffsetUpdate {target work{ref} | tool{tool, quantity length|radius, part geometry|wear}, axis X|Y|Z|A|B|C|R,
  mode set|add, value: Expr}`, `Alarm {code 1..999, text}`, `Report {label, values [{name, value: Expr}]}`, `Stop {optional}`.
- `Rapid.machine?: boolean` (G53 / SUPA / M91). `Program.workOffsetRef?`. `CycleBegin.family` + `siemens`, `renishaw`.
- Update `isControlNode`, `moveTarget`/`moveLength`/`expandMoves` (Probe → `to`), `estimateTime`, `validate` (probe feed ≤ device max).
- `lowerExprDepth(moves, maxDepth, temps)` in `macro.ts`: splits deep Exprs into scratch Assigns (fanuc/okuma/linuxcnc depth 4,
  heidenhain formula depth). Tests: value preserved under `evalExpr`, depth respected.

### 5.3 Work offsets (`cam/work-offset.ts`)
**Status: done.** `policyCondition` returns `write?: Condition | true`. A set-offset is applied along the machine axes: an offset that carries its own rotation is not corrected through it (stated in `actions.ts`).
```ts
type WorkOffsetRef = { kind: "g5x"; code: WorkOffset } | { kind: "extended"; p: number } | { kind: "frame"; n: number }
  | { kind: "linuxcnc"; p: 1..9 } | { kind: "preset"; row: number }
interface OffsetEntry { x; y; z; a?; b?; c?; rotation? /* rad about tool axis */ }
interface WorkOffsetTable { entries: Record<string, OffsetEntry> }   // key = offsetKey(ref)
offsetKey, refOf, parseOffsetRef ("G54.1 P3", "G505", "G59.2", "preset 4"), formatOffsetRef, getOffset, withOffset,
workToMachine, machineToWork
type OffsetFamily = fanuc|haas|mazak|mitsubishi|brother|okuma|siemens|heidenhain|linuxcnc|grbl
addressOf(ref, family, capacity) -> { select, read(axis), write: variable|g10|native-only|l20-only, g10P? } | { refused }
type UpdateMode = "set" | "report" | "update-within-tolerance" | "alarm-outside-tolerance"
interface UpdatePolicy { mode; tolerance?; angleTolerance?; deadband?; limit? }
applyCorrection(table, { ref, delta }, policy) -> { applied, alarm?, reason, table }
policyCondition(policy, magnitude: Expr) -> { write?: Condition; alarm?: Condition }
```
Addresses: Fanuc-like `#5221+20(n-1)+axis`, G54.1 P `#7001+20(p-1)` (P>48 `#14001`); Haas G154 P1..P99; Okuma `VZOFX[n]`;
Siemens `$P_UIFR[n,X,TR]` n=1..4, G505.. n=5..99, rotation `$P_UIFR[n,Z,RT]`, G58/G59 refused; LinuxCNC `G10 L2 P R`;
GRBL `G10 L20` after G38.2, `set` only; Heidenhain native cycles only (step-level preset write refused with the reason).
Semantics: |delta| > limit → alarm in every mode except report; report never writes; set writes unless < deadband;
update-within-tolerance writes when deadband ≤ |delta| ≤ tol; alarm-outside-tolerance alarms when > tol, else writes.
Tests: addresses per family, Siemens G58 refused, round trip with rotation, 4 modes × 4 cases, `policyCondition` ≡
`applyCorrection` on 1 000 seeded cases.

### 5.4 Devices and machine config (`probing/device.ts`, `kernel/machine-profile.ts`, `kernel/contracts.ts`)
**Status: done.** Profile side in `kernel/machine-probing.ts`.
`StylusCalibration {ballDiameter, effectiveRadius, directional? [{angle, radius}], zTrigger?, centreOffset?, artefact?,
calibratedAt?}`, `ProbeDevice {id, toolNumber, stylus {ballDiameter, length, shankDiameter}, body {diameter, length},
calibration?, overtravel {xy, z}, feeds {positioning, fast, touch, max}, backoff, doubleTouch, orientSpindle?, on?, off?}`,
`ToolSetter {kind contact|laser, position (machine), triggerZ, discDiameter?, maxToolDiameter, feeds {fast, touch},
radiusRpm?, brokenTolerance}`, `MacroStyle = inline|renishaw|heidenhain-ts|siemens-cycles`, `KernelProbing {probes,
toolSetter?, macroStyle, skipCode?, skipFrame program|work, tiltedPlane, offsets: OffsetCapacity, toolOffsets?, resultBase?,
scratch?, calibrationSource baked|variables}`; `effectiveRadius(device, dir)`, `resolveProbe(m, id)`,
`settingsFromMachine(profile, overrides)`. `KernelMachine.probing?`. `MachineProfile.probing` extended (all optional; legacy
`cycles/stylusRadius/feed/dialect` kept and mapped), top-level `toolSetter?`, `workOffsetTable?`, `MachineRotary.calibration?
{pivotMeasured?, axisError?, at}`. `probingOf` reads both shapes; `kernelMachineOfProfile` uses `pivotMeasured`.

### 5.5 Fits (`probing/fit.ts`)
**Status: done.**
`circleFrom3`, `fitCircle2` (Kasa + Gauss-Newton), `fitLine2` (PCA), `fitPlane` (Jacobi; flatness), `fitSphere`, `fitCircle3`,
`solveLinear`. Tests: exact to 1e-9, σ=1 µm noise within 3σ, degenerate inputs refused.

### 5.6 Cycles (`probing/cycles.ts`)
**Status: done.** All kinds. A nine-touch sphere is the closed form of the first five on the control and the host's least-squares fit of all nine in the report (`withHostFit`, `sphericity`). A touch retracts by a plain feed move: a control refuses an armed move that starts with the probe triggered. `skipFrame: "work"` under a tilted plane goes through the plane's axes.
`ProbeCycle` kinds: `z-surface {at, expectedZ}`, `edge {at: Vec3, normal: Vec2}`, `corner {corner, inside, xSense, ySense,
depth, inset?, touchesPerEdge? 1|2}`, `web|pocket {centre, width, angle, depth, top?}`, `rectangle {inside, centre, size, depth,
top?}`, `bore|boss {centre, diameter, depth, angles?, top?}` (3 angles = 3-point), `edge-angle {start, along, pitch, normal,
depth}`, `plane {points ≥3, expectedZ}`, `sphere {centre, diameter, touches? 5|9}`, `tool-length|tool-radius|broken-tool {tool,
nominalLength?, nominalRadius?}`, `stylus-calibrate {artefact ring|sphere|height, directions? 4|8|16}`, `rotary-axis {axis,
sphere, angles}`. `ProbeContext {probe, safeZ, clearance, search, prefix, frame?, setter?, calibrationVars?}`.
`planProbeCycle(cycle, ctx) -> ProbeRoutine {moves, contacts [{name, expected, direction}], results: Record<string, Expr>,
nominal: Record<string, number>, notes} | {refused}`. Common touch: protected move to start → (double touch: fast + backoff) →
slow touch storing tip → retract. Stylus: ball centre C = T + r·axis, surface S = C + r_eff(d)·d; Z uses the tip. Per-cycle
result formulas as in the plan (edge S·n; corner line intersection + rotation; web/pocket mid + width; bore/boss 4-touch with
re-centre or N-angle circumcircle / Cramer; plane LS with tilt A=atan(b), B=−atan(a), flatness; sphere 5-touch closed form;
setter L = Zcontact − triggerZ, R = (gap − disc)/2, broken |L − H| > tol; ring calibration r_eff(θ) = R_ring − |S−centre|).
Tests: every cycle reproduces `nominal` to 1e-9 on its analytic world; shifted/rotated part → exact shift/rotation; lobed
probe compensated; refusals (stylus does not fit, < 3 points, collinear plane, missing setter).

### 5.7 Actions (`probing/actions.ts`)
**Status: done.** `rotation via g68` writes the IR move `Rotation` (`G68 X Y R` on the Fanuc family, `G69` at the end of the program, refused under a tilted plane), turned about the nominal point of the measured feature, so it pairs with a `set-offset` before it. Siemens, Okuma, Klartext and LinuxCNC refuse it and name `offset-r` / `table-c`. Closed loop in `probing-job.test.ts`. `grblTouchOff` is the path of a control without variables.
`ProbeAction = set-offset {ref, axes, policy} | rotation {result, via g68|offset-r|table-c, ref?, policy} | tool-offset {tool,
quantity, result, part} | inspect {characteristics, onFail alarm|stop|flag|continue, flag?} | wear-comp {tool, quantity, result,
nominal, gain, deadband, limit, sense} | report {results}`; `Characteristic {name, kind size|position|true-position|flatness|angle,
result, nominal, lower, upper}`; `compileActions(routine, actions, ctx) -> Move[]`; `evaluateInspection(results, chars) ->
InspectionVerdict[] {name, measured, deviation, pass}`. Test: IR run by `runProbeMoves` agrees with
`evaluateInspection`/`applyCorrection` on seeded cases.

### 5.8 Posts (`post/types.ts`, `emitter.ts`, `macro-syntax.ts`, dialects)
**Status: done with limits.** Goldens for fanuc, haas, mazak, mitsubishi, brother, generic, okuma, linuxcnc, siemens, each replayed to the IR; heidenhain (bore + inspection, axis-parallel touches, no step-level preset write) and grbl (touch-off only) have their own. Report: Fanuc family (DPRNT), LinuxCNC (LOG), Siemens (WRITE, `DEF INT PERR` at the head). Klartext refuses it: FN 16 needs a format file on the control beside the program. Okuma refuses it too. Tool-table writes refused on okuma and heidenhain. Klartext protected moves are not armed: the TNC arms the probe only inside its cycles. Okuma variables (`VSKPX`, `VPPAX`, `VDOUT[992]`) are the shakiest of the tables: read from the manual as the author reads it, not run.
`Dialect.probing? {touch, contact(axis), triggered?, machineRapid, alarm, report?, toolOffset}`. Writer emits Probe (G91 search
vector), OffsetUpdate (variable / G10 L2 / refuse; Siemens re-select), Alarm (`#3000` / SETAL+MSG+M0 / FN 14 / abort), Report
(DPRNT / WRITE / FN 16 / LOG), Stop, machine rapid. Miss detection per control (Fanuc compare `#5061` to target, LinuxCNC G38.2,
Siemens `$AC_MEA[1]`); protected = G31 + triggered test / G38.3 + `#5070`. Dialects: fanuc, haas, mazak, mitsubishi, brother,
okuma, siemens, linuxcnc, heidenhain (TCH PROBE 0), grbl (G38.2 + L20), generic. `rejectUnwritable` refuses what a dialect
cannot write. Golden tests `post/probing-golden.test.ts` per dialect (bore + G54 update + inspection, corner + G54.1 P3/G505,
tool length), each replayed by `probe-machine` to the same results as `runProbeMoves`.

### 5.9 Native cycles (`probing/native.ts`)
**Status: partial.** `nativeCycle(cycle, actions, style, inlineMoves, ctx)`: Heidenhain 408-413, 417, 419, 481, 482; Siemens CYCLE977 / 978 in the classic `_MVAR` parameter form; Renishaw P9811, P9812, P9814 with the approach in the program's own armed moves. `native: true` runs end to end in the kernel; `probing` stays `unresolved` ("native cycle not replayed"), the program stays at `preview`, and the path evidence reads the inline expansion in the cycle's place. A cycle takes at most one unconditional `set-offset`. Any other action, a corner or a tilted plane is refused and the operation fails with the reason (no silent fallback: clear `native` for the inline touches). An inch program is written inline. Not built: 451 / CYCLE996, corners, 3-point macros. All syntax read from the vendor manuals, not run on a control.
`nativeCycle(cycle, actions, style)` wraps the inline expansion in CycleBegin/End (as cycles 208/262): Heidenhain 4xx/48x/451,
Siemens CYCLE97x/99x, Renishaw G65 P98xx. Claim `probing` is `unresolved` ("native cycle not replayed"). Lower priority.

### 5.10 World and executor (`probing/world.ts`, `sphere-cast.ts`, `simulate.ts`)
**Status: done.**
`ProbeWorld3.touch(from, to, stylus) -> {tip, normal} | undefined`; `meshWorld(meshes, placement?)` (BVH, swept sphere vs
face/edge/vertex), `boxWorld`, `cylinderWorld`, `sphereWorld`, `planeWorld`, `unionWorld`; `Placement {translate, rotate?}`;
`ProbeTruth {radius(dir), pretravel?, noise?}`; `SimMachine {offsets, active, tools?, kinematics? {layout, pivot, truePivot?},
frame?, probe, setter?}`; `runProbeMoves(moves, world, machine) -> ProbeSimOutcome {contacts [{name?, tip, moveIndex, line?}],
variables, results, offsets, updates [{ref, axis, before, after}], tools, inspections, alarms, reports, stopped?, path}`.
Frames: program → frame → work → machine (offset) → world (kinematics with truePivot); contacts reported in `skipFrame` with the
assumed pivot. Tests: sphere-cast exact, mesh box ≡ box world, misplaced stock (0.7, −0.4, 0.15, C 0.3°) recovered, miss
alarm, wear comp, broken tool.

### 5.11 NC text replay (`testing/macro-runtime.ts`, `testing/probe-machine.ts`, `gcode-interpreter.ts`)
**Status: done.** `simulateNc`, the macro host and the kernel replay; `GSegment.probe`, `InterpretOptions.workOffsets` and `frame: "program" | "machine"` (segments only: the motion samples stay in program coordinates; offsets are read once, so the probing blocks of a program that writes them are shown through the final values, the cut after them is exact), MEAS and TCH PROBE 0 without the host (with `probeMoves`). G54.1 / G154 / G505 / G59.x / G15 H1..50 selected. Byte-identical without the new options. The closed loop with a turned part reads the machine frame; the older translation test still shifts the program, its gouge verdict comes from the kernel claim.
`expandMacros(source, { system?: SystemVariables, onBlock? })`; parser learns `$NAME[...]`.
`simulateNc(text, { world, machine }) -> ProbeSimOutcome & { expanded }`: modal tracker, writes skip variables, rewrites probe
blocks to end at contact, offset writes go to the table (mirrored as G10 L2), alarms stop, reports collected. Interpreter:
`GSegment.probe?`, G10 L2 P1–9 and L20, extended selection words with `InterpretOptions.workOffsets?`, `frame?: program|machine`,
Siemens MEAS/MEAW, Klartext TCH PROBE 0; byte-identical without the new options. Tests: every 5.8 golden gives the same outcome as
`runProbeMoves`; interpreter suite unchanged.

### 5.12 Kernel operation (`kernel/contracts.ts`, `schema.ts`, `probing.ts`, `execute.ts`)
**Status: done.** The closed loop, tilted plane and refusals are in `probing-job.test.ts`. Stylus and rotary calibration run as operations (rotary needs `fiveAxis`, the ball in the work frame, table frame at zero): artefacts stand on the table in the replay world, the record is in `ProbeOperationRun.calibration` and the report; no machine parameter is written.
`ProbeOperationSpec {strategy: "probe", cycle, actions?, search?, clearance?, doubleTouch?, resultPrefix?, native?}` (`tool` =
device id) in `OperationSpec`; `CuttingOperationSpec = Exclude<…>`; `OperationOutcome.cut |= "probe"`, `.probe?:
ProbeOperationSummary {cycle, touches, device, nominal, variables, offsetTargets, native?}`; `CamArtifact.probing? {operations,
textReplay agrees|differs|not-replayed}`; claim `probing`; `JobSetup/ManufacturingJob.workOffsetRef?`. `probeToolpath(op, ctx)`,
`nominalProbeWorld(prepared)`, `simulateProbing(job | artifact, { placement, probeTruth, truePivot }) -> ProbeSimOutcome[]`.
`execute.ts`: early branch for probe ops (spindle 0, coolant off, M19/activation prefix, no stock removal, no gouge, shank/body
collision check with `ProbeModel`), replay with `probeMoves: true`, claim `probing` from `simulateNc` ≡ `runProbeMoves`; tilted
setup needs `probing.tiltedPlane`. `prepareJob` refusals (lathe/printer, unknown device, post without probing). planner never
plans probes; operation-model/match/template/program-diff/setup-sheet handle `"probe"`. Schemas in `kernel/schema.ts`:
`WorkOffsetRefSchema`, `ProbeCycleSchema`, `ProbeActionSchema`, `ProbeDeviceSchema`, `ToolSetterSchema`, `KernelProbingSchema`,
the `OperationSpecSchema` member, extended `MachineProfileSchema`. Tests `kernel/probing-job.test.ts`: probe bore + pocket on
fanuc/siemens/linuxcnc released with claim `probing` passed; closed loop (misplaced stock → G54 delta = misplacement 1e-6 → cut
replay in machine frame does not gouge, without probing it does); 5-axis bore on plane (0,−1,1)/√2 with G68.2 / CYCLE800 /
PLANE SPATIAL; refusals.

### 5.13 Feature → cycle (`probing/features.ts`, needed by API/AI)
**Status: done.**
`planProbeForFeature(elements, { elementId, ref?, hint? }, ctx) -> { ok: true, cycle, chosenBecause } | { ok: false, reason }`:
hole/bore → bore, cylindrical boss → boss, planar face normal to Z → z-surface, side face → edge, outside corner → corner,
slot → pocket, rib → web, reference sphere → sphere; approaches from outside; refuses a stylus that does not fit. Also
`previewMoves(moves) -> [{kind rapid|probe|retract, from, to}]` for the desktop.

### 5.14 Rotary calibration (`probing/rotary-cal.ts`)
**Status: partial.** Routine and fit built, also as a job operation. On the control: C at N equally spaced angles (mean), A / B at 0, +a, -a (circle through three points), results `pivotX/Y/Z` in the axis' plane and in the Report; other patterns are host fit only. Native 451 / CYCLE996 are not built. One pivot for both axes.
`rotaryRoutine(cycle, ctx)` (per angle: orient, machine rapid, 5-touch sphere centre into `cal_<i>_*`, no TCP/frame);
`calibrateRotary(centres, assumed, axis) -> {pivot, axisDirection, pivotError, axisTilt, radius, rms} | {refused}`; in-macro
result for symmetric patterns, otherwise Report + host fit. Never writes machine parameters (report only; native 451/CYCLE996).
Tests: truePivot = assumed + (0.03, −0.02, 0.05) and 0.01° tilt recovered to 1e-6 (noise-free) / 3σ.

### 5.15 Order
1, 2, 4 in parallel → 3 and 9 → 5 → 6 → 7 + 10 (goldens gate both) → 11 → 13 (features) → 8 and 12 → legacy adapter.

## Change log

- 2026-11-04: spec written from three plans; `ProbeReport` table built (7d8318a5).
- 2026-11-04 (desktop, B): Probing tab (palette, cycle editor with NumberField only, target picker with pick-on-model, work-offset table with 409 handling, inspection list, program preview), probe cycles as `probing` toolpaths, stores, offset/report client over `camProbing`, `probe.progress` / `probe.result` / stale-table handling, 3D overlay + surface pick + probe colours in the visualizer, 11 locales, `camProbing` in the web reference; NOT built (waiting for the api schemas of plan / emit / simulate / calibrate-rotary / reports run, the events and the sidecar services behind them): the program calls (Write program, Simulate, Show in 3D data), calibration write-back.
- 2026-11-05 (core, A): §5.0-5.14 built, status per subsection above. This round: native cycles (`probing/native.ts`, `klartext-cycles.ts`, `nativeProbeLines`, `native: true` in the kernel with `unresolved` evidence), Okuma probing words, GRBL `G10 L20` touch-off (`OffsetUpdate.reads`, `grblTouchOff`), `lowerExprDepth` in the writer, every dialect in the goldens, plain retract off a contact (armed moves off a triggered probe fail on a control), `workOffsetRef` reaches the program, `skipFrame: "work"` under a tilted plane, Fanuc named variables go on at #500, Klartext refuses past Q0. ISO 13399 exchange takes every cutter kind and `formRadius` (a failing test on main).
- 2026-11-05 (API, sidecar, AI, desktop, B): `cam_edit probe/probe_run/probe_apply` with `services/ai-probing.ts`, `cam review` verdict, widened `library_edit`, skill `probing-and-inspection`, budgets, inventory. Desktop program calls and calibration write-back on the real routes, proven in `test/probing-live.test.ts`. Gaps found in the audit and fixed: a probe artifact did not decode through `CamKernelArtifact`; tool setter cycles were refused everywhere because nothing passed `workOrigin`; `reports.run` ignored the stored settings and frame and left `programHash` / `sourceRevision` empty. Open: NC line on simulated contacts (`packages/ai/src/cam-probe.ts`), status per area at the head of §3.1-3.3 and §4.
- 2026-11-05 (core, A, second round): stylus and rotary calibration as job operations with their records in the report; rotation via G68 with a closed loop on a turned part; nine-touch sphere and stylus calibration on a sphere; pivot on the control for symmetric patterns; interpreter `GSegment.probe`, `workOffsets`, `frame`, MEAS and TCH PROBE 0 without the host; native refusals say the operation fails; Siemens report with WRITE; `camProbeSimulate` with `dialect` posts and replays the program, so every contact and offset change has the line of its block in `program.nc` (§1); `camProbePlan` takes `native`, `macroStyle` and `assumed`.
- 2026-11-05 (last round, B): contact and offset lines through `simulate` and `reports.run`, the 3D view plays the simulated program and reveals contacts and the triad in time; `native` / `macroStyle` / `assumed` on plan, emit and simulate, `cam_edit.probe`, the program section; calibration read from the report's job records in the desktop and `cam_edit` (stylus write-back added to `probe_apply`), `probeOperation` no longer special-cases rotary; `GCodeViewer` in the preview; clients, snapshot, API reference, inventory regenerated.
- 2026-11-05 (lead, real-app check): ran the flow in the real app on a real sidecar (Vite + headless Chromium). Four bugs no test had caught, all fixed: (1) `simulate` built the part in drawing coordinates while the desktop plans in work coordinates, so a drawing whose stock top is not at CAD Z0 was touched in the wrong place: `partOrigin`; (2) simulating before anything is modelled was refused while the panel offered stock targets: `stockElement`, used by the worker only when the drawing has no closed solid, with a warning; (3) the default corner sent its rotation to `offset-r` on every control, so Fanuc refused the program and the 3D view stayed empty with no reason shown: `rotationViaOf` (G68 where the offset keeps no rotation), and a run without a program now says why; (4) a double touch reports two contacts per planned touch but they were paired by index, so the list and the deviation arrows were wrong: `expectedOfContacts`. Also: the first click on Show in 3D after a simulation switched the armed overlay off; a new cycle opened out of sight below the palette. Known limits: the viewer's parser reports "Partial preview: N lines not replayed" on macro lines of a probe program; calibration runs leave the work offset out because `camProbeSimulate` does not place artefacts with it; nothing has been run on a real control.
