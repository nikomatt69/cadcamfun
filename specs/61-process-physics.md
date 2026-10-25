# 61 — Process physics: engagement along the path, force-limited feed, stability, tool life

Status: specified 2026-10-25 (not built). Part of [spec 39](39-professional-parity-master-plan.md); gap G4 of [spec 57](57-parity-ledger-2026-10-25.md). Extends
[spec 54](54-cam-breadth.md) L2 / L3 / Q2 and [spec 53](53-stock-simulation-verification.md) V8; it adds no geometry. Owner: WP2 (`packages/core/src/cam/kernel`,
new `engagement.ts`, `process.ts`); adapters WP0 (only if tool columns are added), WP3, WP4, WP6, WP8.

## 1. Where it stands (verified 2026-10-25)

- `cam/kernel/cutting-data.ts` (`cuttingData(req)`, called per operation at `execute.ts:507`) computes for **one nominal cut**: spindle speed from Vc and the effective
  diameter, feed per tooth with chip thinning (`chipThinning`, `engagementAngle`), ap / ae limits, the Kienzle chain (`h_m`, `kc = kc11·h_m^-mc`, `Pc`, `Mc`, `Fc`), a
  stepped-cantilever tool deflection (`deflection`), and reduces ap then feed when power, torque or deflection exceed the machine or the quality limit; every adjustment is in
  `limitedBy`, what cannot be met is in `exceeded`. Its own reference basis says the numbers are *handbook starting values (order of magnitude of supplier tables), not a
  supplier's certified data* (`REFERENCE_BASIS`, `CuttingReference` traces the table row and factors).
- The claim `cutting-data` exists in the contract (`contracts.ts`, claim ids) and is raised from `execute.ts` as a **warning** issue per operation, not as a measured property of the path.
- Engagement-bounded clearing is geometry: `operations/adaptive.ts` keeps the radial engagement at a chosen percentage (`engagement`, default 12 %) by level sets of a distance
  field; it does not compute the engagement of any other operation.
- `adaptFeeds(gcode, toolDiameter)` (`generator/postpass.ts`) is a **text transformation of a program**: it slows moves into corners and small-radius curves by geometry
  (to half at 90°, in proportion to the radius below 1.5 tool diameters, never below 40 %). It knows nothing about the stock, so a corner in air is slowed and a full-width slot is not.
- Stock models: Z-dexel (`cam/model/dexel.ts`), height field (`cam/verify/heightfield.ts`), voxel bracket (`kernel/stock.ts`); there is no tri-dexel (spec 53 V1).
- No stability (chatter) model, no tool-life model, no calibration record anywhere in `packages/core/src` (searched `lobe|chatter|taylor|calibrat` in `packages/core/src`: the only hits are a gyroid infill calibration, spline Taylor coefficients and machine-datum calibration notes, none of them process physics). Tools are rows of
  `toolTable` in `packages/db` (`apps/sidecar/src/http/tools*.ts`); the table has no life or Taylor columns.
- Time: `cycleTimeSeconds` is in the artifact; whether it models acceleration and jerk was not judged (spec 57 §2.8 V8 n/v).

## 2. Target

hyperMILL MAXX Machining / Fusion adaptive-feed class behaviour, stated as what the kernel can prove: the feed of every move follows the **measured engagement of that move** so that
chip thickness or spindle power stays at a target without exceeding any limit; the program says where the limits bind; spindle speeds can be picked from a stable window **when a
measured transfer function is supplied**; a tool's expected life is reported and a program cannot silently use a tool past it. Everything is labelled `uncalibrated` unless a calibration
record of §3.6 covers the machine, tool and material.

## 3. Design

### 3.1 Engagement along the path (Z1)

`engagementAlong(moves, stock, cutter)` returns per move (and per arc sub-step, by `stepsForTolerance`): radial engagement `ae`, axial engagement `ap`, entry and exit angles
(`φ_in`, `φ_out`), and the cut area. For 3-axis it samples the carried stock (height field or Z-dexel, the same one `rest` machining uses) as the tool moves; the error bound is declared
(`½ cell diagonal`, as spec 53 V1) and returned with each value. For rotary / five-axis moves it returns `unresolved` with the reason until spec 53 V1 gives a tilted-axis stock; it is
never extrapolated from a 3-axis value.

### 3.2 Load per move (Z2)

The Kienzle chain of `cutting-data.ts` is factored into a function of `(fz, ae, ap, φ, cutter, material)` used by both the nominal call and the per-move call, so the two **cannot drift**
(the nominal result is a per-move result at constant engagement, asserted by a test). Output per move: peak and mean `Fc`, `Pc`, `Mc`, deflection, chip thickness. A move whose load
exceeds a limit at the programmed feed is reported with the limit that binds.

### 3.3 Feed optimisation (Z3)

`optimizeFeeds(moves, engagement, limits, target)` writes a **per-move feed** (the IR already carries the feed of each move; posts emit modal `F` only when it changes): the largest feed such that
(a) chip thickness equals the target `h_ex` (constant chip load, default), or (b) spindle power equals a fraction of the limit (constant power); never above the machine's maximum feed,
the tool's rating, or the feed at which any load limit binds; never below a floor fraction (default 40 %, as `adaptFeeds`); with a slew limit between consecutive moves so feeds do not
oscillate; arcs and corners keep the geometric slowdown of `adaptFeeds` as a lower bound. Request field `process.feedOptimisation: "off" | "chip" | "power"`; `off` is byte-for-byte today's program.
The claim `cutting-data` becomes a **measured** claim for programs with 3-axis engagement: `passed` only when every move's load is inside every limit with the engagement bound added;
`unresolved` when the engagement bound is unknown (five-axis, no stock); `failed` otherwise. No new claim word (spec 51 §3 rule).
`adaptFeeds` stays for the legacy generator; the kernel path does not apply it on top of Z3.

### 3.3.1 Independent check

The check of the final program is the NC replay of spec 53 V2: the interpreter reads the generated bytes, the height-field replay recomputes engagement from the NC, and Z2 judges
that, so the planner's engagement and the verifier's engagement are two computations of the same quantity; their difference is reported (and bounded in the gate).

### 3.4 Stability (Z4)

`stabilityLobes({ cutter, assembly, material, frf? })` implements the classical single-degree-of-freedom regenerative model: the tool-tip transfer function from either a **measured FRF** supplied by
the user (natural frequency, damping ratio, stiffness per mode) or, without one, an **estimate** from the stepped-cantilever stiffness of the tool and holder (`deflection` model) and an assumed damping range.
Output: the limiting axial depth `a_lim` against spindle speed, the lobe numbers, and recommended speed windows. With an estimate the result is `indicative` and only produces a warning (and
a note in the setup sheet); only with a measured FRF may `cutting-data` nudge the spindle speed (at most ±10 % of nominal) into a stable window, and the change is listed in `limitedBy`.

### 3.5 Tool life (Z5)

Taylor's relation `V·T^n = C` per tool material, coating and workpiece group, with defaults from a table that cites its source and is flagged `uncalibrated`, overridable per tool (optional
`taylorN`, `taylorC` on the tool record: a **WP0 migration** of `toolTable`, decision recorded before it starts; until then the values travel in the request, not the row). Per operation:
cutting time × a wear factor from the move loads of Z2 → `lifeUsed` fraction; per tool across the program; an operation that would exceed the tool's life is split with a tool change (spec 54 L3
magazine rules apply) or reported, never silently run. The artifact gets additive `tools[i].lifeUsed`; counters of real usage on a machine are not part of this spec.

### 3.6 Calibration record (Z6)

`ProcessCalibration` (Effect Schema, shape shared with the qualification record of spec 55 E7): machine, tool, material, date, source (`measured` / `vendor` / `estimate`), the measured force,
power, FRF or wear points, and the **validity range** (diameter, ae, ap, rpm, feed). A prediction inside the range is scaled so the recorded measurement is reproduced within its recorded
tolerance and carries `calibrated: true` with the record id; outside the range it reverts to `uncalibrated`. Decision D11: where the data comes from; the default is none.

### 3.7 Cycle time (Z7)

With per-move feeds, the time estimate sums `length / feed` per move with acceleration and jerk limits of the machine preset (spec 53 V8) and the controller class's look-ahead blending;
`uncalibrated` until compared with a recorded run.

## 4. Work items

| ID | Item | Gate | Size |
|---|---|---|---|
| Z1 | `cam/kernel/engagement.ts`: per-move `ae`, `ap`, `φ` on the carried 3-axis stock with a declared bound; five-axis `unresolved` | analytic cases: a full-width slot has `ae = D` and `φ = π`; a shoulder cut at `ae` has `φ = acos(1 - 2ae/D)`; an inside corner of radius `r` peaks at the known value; each within the declared bound | M |
| Z2 | Factor the Kienzle chain into one function used by `cuttingData` and per move | `cuttingData` output unchanged on every existing test (no regression); per-move result at constant engagement equals the nominal one to 1e-12; a worked example from a cited handbook is reproduced (the citation is the comment of the test) | S |
| Z3 | `optimizeFeeds`, request `process.feedOptimisation`, claim `cutting-data` made per-move | `off` leaves NC bytes identical to today on every golden; on a fixture with corners and a slot, no move exceeds a limit, feed ≤ machine maximum, slew limit respected; cycle time reduced against the fixed-feed program (target ≥ 10 %, measured with the spec 55 harness, not a claim); geometry claims (`no-gouge`, `part-coverage`) unchanged | L |
| Z4 | `stabilityLobes` with measured-FRF and estimate paths | single-DOF closed form: the minimum limiting depth equals `1 / (2·Ks·|Re G|min)` and the lobe speeds equal `60·fn/(N + ε/2π)` for fixtures with given constants; an estimate never yields `passed`, only `indicative` | M |
| Z5 | `toolLife`, `lifeUsed` in the artifact, split-or-report | Taylor identity (`V1·T1^n = V2·T2^n`) holds; wear is monotonic in load; a program whose operation exceeds the tool's life gets a change or a reported issue | M |
| Z6 | `ProcessCalibration` + application | a record reproduces its own measurement within tolerance; a request outside the validity range is `uncalibrated` | S |
| Z7 | Cycle time with dynamics from per-move feeds | estimate equals the analytic trapezoid time for a straight move with given acceleration; marked `uncalibrated` without a recorded run | M |
| Z8 | Adapters of §5 | tests listed there | M |

## 5. Adapters (the real surfaces)

| Surface | Change | Test |
|---|---|---|
| `packages/core/src/cam/kernel/{cutting-data,execute,contracts}.ts`, `cam/ir.ts`, `cam/post/*` | per-move feed in the IR → posts (modal `F`); additive `process` evidence (peak load, margin to each limit, feed-optimisation statistics, `lifeUsed`); contract change through spec 29 then `packages/api` | existing kernel and post golden suites unchanged; new goldens only for `chip` / `power` |
| `cam/verify/heightfield.ts`, `cam/model/dexel.ts`, `kernel/stock.ts` | engagement sampling; spec 53 V2 replay recomputes it from the NC | difference planner-vs-verifier bounded in the gate |
| `packages/api/src/groups/toolpath-generator.ts` | `process` field in the manufacture request; evidence fields in the response; `bun run generate`, API snapshot | API snapshot, sidecar `cam-kernel.test.ts` |
| `apps/sidecar/src/http/{toolpath-generator,tools,tools-storage,materials}.ts`, `packages/db/src/schema.ts` (`toolTable`) | pass the field; optional Taylor columns only after the WP0 decision | sidecar tests reading a stored program back |
| `apps/desktop/src/features/cam/components/generator/CuttingSection.tsx` | feed optimisation selector (off / constant chip / constant power) and the target | happy-dom test against the real sidecar |
| `generator/EvidenceSection.tsx`, `VerifyPanel.tsx` | the `cutting-data` claim with margin per limit and the move where each limit binds; `uncalibrated` badge | panel test |
| `generator/ToolSection.tsx`, `features/library/components/ToolPreview3D.tsx` | Taylor constants and life used per tool | tool editor test |
| `features/cam/components/ToolpathVisualizer.tsx`, `SimulationTimeline.tsx` | colour the path by engagement / feed / load (same colour-ramp approach as `cam/sim/deviation-colors.ts`) and mark limit-bound moves on the timeline | visualizer test with a small program |
| `packages/core/src/cam/kernel/setup-sheet.ts` | tool life per tool and the process notes (indicative stability, uncalibrated labels) | `setup-sheet.test.ts` extended |
| `packages/ai` (`cam.cutting_data`, `cam.suggest` / `cam_suggest_parameters`, `cam.analyze`) | the assistant reads peak loads, margins and the labels; parameter names only (tool catalogue ceiling) | tool-prompts test; harness inventory regenerated |

## 6. Honest limits

- Kienzle constants and Taylor constants vary by supplier and lot; the bundled tables are starting values (stated in `REFERENCE_BASIS`). **No result of this spec is a prediction of a real machine
  until a calibration record covers it**; the UI and the setup sheet say `uncalibrated` otherwise.
- Stability needs the machine / holder / tool transfer function; an estimate is indicative and never a `passed` claim.
- The model ignores thermal effects, tool runout and wear progression within an operation, and process damping; engagement is exact only up to the stock cell bound.
- Five-axis moves have no engagement until tilted-axis stock exists (spec 53 V1): their `cutting-data` claim stays `unresolved`.
- Feed optimisation changes feeds only: it cannot change geometry, and a controller's own look-ahead and servo lag are outside the model (spec 55 §6 qualification).

## 7. Order

Z2 → Z1 → Z3 → Z8 (desktop selector and evidence) → Z5 → Z6 → Z4 → Z7. Z3 is the value; Z4 is last because it is only useful with a measured FRF.

## 8. Change log

- 2026-10-25: created.
