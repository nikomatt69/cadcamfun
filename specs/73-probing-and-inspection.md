# 73 — Probing, work offsets, 5-axis probing and in-process inspection

Status: in progress (2026-11-04). Owners: core (cam/program, cam/kernel), db, api, sidecar, ai, desktop, web apiGroups.
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
| Reports | Table `ProbeReport` (**done**, commit 7d8318a5, migration `20261104185152_brave_white_tiger`): project cascade; drawing / toolpath / machine set null; `kind part|rotary|stylus|tool-setter`, `source simulated|machine|imported`, `verdict pass|warn|fail|missed|incomplete`, `workOffset`, `programHash`, `sourceRevision`, `data` JSON. Routes `GET/POST /api/projects/:id/probe-reports`, `GET/DELETE /api/projects/:id/probe-reports/:reportId`. |
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

## Change log

- 2026-11-04: spec written from three plans; `ProbeReport` table built (7d8318a5).
