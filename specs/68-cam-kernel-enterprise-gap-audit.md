# 68 — CAM kernel vs an enterprise (hyperMILL-class) kernel: gap audit, 2026-10-29

Status: written 2026-10-29 (owner request: "analyse the CAM kernel and list every gap to cover for an enterprise hyperMILL CAM kernel").
This document **builds nothing**. It reads `packages/core/src/cam` (42 k lines, 97 test files; kernel + operations + post ≈ 17.8 k lines)
against what an enterprise CAM kernel has to do, and it extends [57](57-parity-ledger-2026-10-25.md) §2.7–2.10 and
[62](62-execution-plan-2026-q4.md) with gaps those documents do not name. Nothing here is a parity claim; the vocabulary of
[55](55-evidence-performance-qualification.md) §5 still applies and the scorecard has **no CAM row above level 2**.

The ordered, individually closable steps that cover these gaps are in [spec 69](69-cam-enterprise-step-plan.md).

## 1. Method and limits

- **(checked)** = read in the source tree on 2026-10-29 (file named). **(ledger)** = taken from spec 57 / 62 / 67 and *not* re-verified today.
  **(ref)** = what a hyperMILL-class system does, from public product knowledge; it is a yardstick, not a measured comparison, and the
  scorecard's hyperMILL column is still empty.
- Run today: `bun test packages/core/src/cam/kernel/{kernel,stock,turning}.test.ts` → 49 pass, 0 fail. No other suite, no benchmark.
- "Enterprise" is defined here by five properties, in this order of importance: **(T) trust** (a released program is provably safe),
  **(M) model** (jobs, setups, stock, fixtures, tools as first-class data), **(S) strategies** (breadth and quality of toolpaths),
  **(A) automation / associativity**, **(Q) qualification and scale**.

## 2. Verdict

The kernel is a **solid, honest 3-axis + indexed + simple trunnion 5-axis milling kernel with strong evidence for 2.5D prismatic parts**:
11 operation strategies, feature planning from the exact B-rep (holes, pockets with islands, bosses/bars/domes by shadow), Kienzle-based cutting
data with power/torque/deflection limits, 7 posts + post-as-data, an independent NC replay with claims, rest machining from a carried height
field, swarf, collision checks as modules. It is **not** at enterprise level, and the distance is dominated by four things, not by missing
strategies:

1. **The release gate cannot be reached by the interesting programs** (§3.1): every 5-axis program, every program in a non-`+Z` setup, and every
   program with hidden surfaces ends at `preview` by construction.
2. **A job is one setup** (§3.2): no setup list, no fixtures, no stock carried between setups, no stock other than a box.
3. **Surface machining is a height field** (§3.3): undercuts and overhangs are *left*, not cut; there is no limit/avoid geometry; there is no tri-dexel stock.
4. **No associativity or automation** (§3.7): a program does not know the model changed; no user templates (specs 59/60/61: nothing built, per 67 **checked**).

## 3. Gaps by domain

IDs `EG-nn` are new and unique to this document. Size: S one session, M 1–3, L several with convergence risk. "Ref" = spec that already covers it.

### 3.1 Trust: proof and release (T)

| ID | Gap (evidence) | Why it matters | Ref / size |
|---|---|---|---|
| EG-01 | `release = "verified-program"` only if **every** claim is `passed` (only `machine-travel: unsupported` is tolerated) — `kernel/execute.ts:1082`. `machine-clearance` is `unsupported` as soon as one move turns a rotary axis (`:1056`), `no-gouge` and `material-removed` are `unresolved` when `turnedMoves > 0` (`:1041-1043`). **A 5-axis program can never be `verified-program`** (checked) | the headline capability of the class has no release path | 53 V1–V4, 51 F10 / L |
| EG-02 | `setup-workholding` is pushed `unresolved` for every `setupOrientation ≠ "+Z"` (`:1077`) and `part-coverage` is `unresolved` whenever a downward-facing triangle is hidden or a 5-axis sample was skipped (`:1063-1075`). Multi-side parts therefore never verify (checked) | enterprise parts are multi-side | EG-10, 54 R4 / M |
| EG-03 | `machine-clearance` exists only when the machine carries a `table`; otherwise `unsupported` → `preview`. Presets with a table: 9 entries in `kernel/machines.ts` (checked). No vise / fixture / clamp body in the check | collisions with workholding are the #1 real-world crash | EG-10 / M |
| EG-04 | Replay stock is a **height field** (cell ≤ 0.5 mm default, `REPLAY_WORK_LIMIT 1.5e10`, `MAX_REPLAY_CELLS 8e6`) plus a voxel *bracket* for turned moves. When the replay budget is hit, four claims become `unresolved` (`:1062`). No tri-dexel, no bound on the gate statement | an overcut under a tilted tool is invisible to a Z-map | 53 V1 / L |
| EG-05 | `ToleranceBudget` is informational and does not change the release (`contracts.ts:343-346`). Terms are worst-case sums; none measured | a promised tolerance with no gate is a label | 53 V5 / M |
| EG-06 | No fault-injection set (100 seeded overcuts, 0 false positives on 30 clean fixtures) — the false-negative rate of the replay is unknown | the gate has no measured sensitivity | 53 V2 / L |
| EG-07 | Machine simulation parity is partial: rotary-only block replay, no IK tip-error gate, no all-pairs machine-collision claim, head machines not in `execute.ts` (`kernel/head.ts` is referenced only by `collision.ts` and `index.ts`, checked) | "virtual machine" is the hyperMILL VIRTUAL Machining class | 53 V3/V4, 51 F7 / L |
| EG-08 | The IR has **no tool-change, probe, macro/variable or conditional move** (`Move` = Rapid, Linear, Arc, Dwell, Comment, Cycle, Orient; checked in `ir.ts`). Replay of a real controller program (subprograms, `#` variables, `IF`) is the interpreter's job, not part of the kernel's generated program | needed for probing, in-process measurement, family-of-parts macros | 54 Q4 / M |
| EG-09 | No machine-qualification record: no controller-accepted NC, no cutting test, no partner (D7). Level 4 of the scorecard is impossible | an enterprise buyer asks for this first | 55 E6–E8, D7 / L, owner |

### 3.2 Job model: setups, stock, fixtures, tools (M)

| ID | Gap (evidence) | Ref / size |
|---|---|---|
| EG-10 | **`ManufacturingJob` carries one `setupOrientation`, one `origin`, one `workOffset`** (`contracts.ts:226-249`). No list of setups/WCS, no per-operation coordinate system, no stock transferred between setups, no flip/refixture with carried stock. `planSetups` exists (`cam/setup-plan.ts`) but yields advice, not a multi-setup job. Orientations are the 6 signed permutations (`SETUP_ORIENTATIONS`): no arbitrary tilted workplane (3+2) | 54 R4, 53 V6 / L |
| EG-11 | `StockBox` is the only stock (`contracts.ts:22`). No cylinder/bar, no casting / near-net-shape / forging mesh, no stock from a previous job, no stock from STL scan | M |
| EG-12 | Fixtures, vises, clamps, jaws, pallets, tombstones: not modelled as bodies anywhere in the kernel; only a rectangular `table` footprint and an unresolved `setup-workholding` claim | EG-03 / L |
| EG-13 | Operations are an ordered list with `tool` ids. No operation dependencies, no per-op stock/coordinate system/tolerance, no operation grouping, copy/transform/mirror/pattern of a job (hyperMILL "transform job"), no enable/disable | M |
| EG-14 | **Machining limits are missing from the contract**: `surface` and `multiaxis` have no boundary curve, avoid area, containment or "machine only these faces/areas" (`OperationSpec`, `contracts.ts:166-171`). Face selection (by face refs) needs spec 41 | 41, 54 R1 / M |
| EG-15 | Tool = `Cutter` with one `Holder {diameter, length}` cylinder (`cutters.ts`). `kernel/assembly.ts` (stepped profile) exists but **`execute.ts` does not use it** (grep empty, checked). No holder/extension library, no stick-out search | 54 R3 / M |
| EG-16 | Cutter kinds: flat, ball, bull, chamfer, spot, drill, facemill, threadmill, engraver, tap, reamer. Missing: barrel (oval/lens/circle-segment), tapered end/ball mill, lollipop, T-slot, dovetail, boring bar, back-spot-facer, insert-based mills (round/button), taper-shank profile mill, form tools; the replay `VerifyTool` maps tap/reamer to cylinders | M (needs a swept-profile cutter model) |
| EG-17 | No ISO 13399, no tool list import/export (CSV/XML/presetter formats: Zoller, Haimer, Speroni), no vendor catalogue ingestion, no tool life/wear counters, no sister tools, no tool crib/inventory in the kernel (the app has `ToolSection` outside it) | 54 L1/L3 / L |
| EG-18 | Cutting data: handbook defaults with Kienzle; no user-editable versioned table (L2), no calibration (D11); the table is per operation, not per move (see EG-45) | 54 L2, 61 / M |

### 3.3 3D and surface machining (S)

| ID | Gap (evidence) | Ref / size |
|---|---|---|
| EG-20 | `surface` strategies run on a **height field** from the tessellation (`operations/surface.ts` header): roughing "leaves what the part's walls overhang, never cuts it". No undercut roughing, no T-slot/lollipop access, no multi-orientation roughing | 51 F5 / L |
| EG-21 | No true mesh or B-rep drop-cutter: the contact is sampled on a grid, and the tolerance budget carries `part-model = cell` (`execute.ts:1095`). No NURBS-face contact (curvature-aware stepover, trimmed patches), no exact tool-surface offset | L |
| EG-22 | Surface strategies present: roughing, rest, parallel, waterline, steep-shallow, scallop, spiral, radial, flat (9). Missing: **flowline / morph between curves / projection / isoparametric**, equidistant on boundary, bi-tangent pencil (pencil is rest finishing), 3D engraving / curve projection on surface, 3D chamfer/deburring along model edges (deburr = 2D chamfer on outlines), edge-following finishing | 54 Q3 / L |
| EG-23 | Per-face allowance and per-face tolerance: only a global `allowance` per op; no "leave 0.2 on this face, 0 on that one" | needs face refs, 41 / M |
| EG-24 | Rest from an arbitrary *stock model*: rest uses `restFrom` (a previous *tool*) or the carried height field of the same job. No rest from an imported/previous-setup stock, no 3D rest by tri-dexel | EG-04, EG-10 / M |
| EG-25 | Roughing: adaptive (constant engagement) and contour pocket. Missing: plunge roughing (Z-axis plunge / "drilling" clearing), high-feed roughing with insert geometry, dynamic/trochoidal slot milling, peel milling, per-move engagement-aware feed | 54 Q2, 61 / M |
| EG-26 | Surface jobs are slow and refusable by budget (a +X surface job was 5 601 s before the shadow reader, `54 R4`); the 200-hole plate takes 43.8 s against a 10 s budget (`67 §3.4`). `OperationBudgetError` refuses instead of degrading | 55 E2 / M |

### 3.4 2.5D and hole making (S)

| ID | Gap (evidence) | Ref / size |
|---|---|---|
| EG-30 | **No cutter compensation output from the kernel**: `G41/G42` appear only in the legacy `generator/mill.ts` and `cycles/templates.ts` (checked); `operations/profile.ts:7` states "onLine … no tool compensation". Wear compensation (finish passes adjusted at the control) is the shop-floor norm | M |
| EG-31 | `profile` in `OperationSpec` has no `tabs`/`bridges`, no `leadIn` type or `leadOut` choice, no multi-pass finish or spring pass, although `operations/profile.ts` implements tabs and lead types; the planner only *notes* "hold by tabs" (`planner.ts:256`) | S (expose) |
| EG-32 | No slot-milling operation (full-width slot with trochoidal), no open-pocket side entry rule set, no corner clearing/rest in 2.5D (rest only in 3D), no thin-wall or deep-pocket stability strategy | 54 Q2, R1 / M |
| EG-33 | Hole making: drill/spot/peck/tap/ream/thread-mill/bore. Missing: back boring, counter-boring as a cycle (planner uses an end mill), gun/deep-hole drilling, circular/helical hole milling variants, countersinking as a cycle, drilling in tilted workplanes (5-axis drilling), hole-pattern optimisation by tool (only `optimizedOrder` 2-opt) | 54 Q1 / M |
| EG-34 | Feature recognition covers holes, pockets with islands, bosses, bars/domes (shadow). Missing as named features with face refs: slots, steps, grooves, chamfer bands, threads on bosses, fillet bands; no 40-part annotated corpus, recall unmeasured | 54 R1, 55 E4–E5 / L |
| EG-35 | Planner is branches in `planner.ts` (≈450 lines), not rules; no user-defined strategy per feature, no tool-choice by minimum stick-out, no operation sequencing by tool/setup optimisation beyond grouping | 54 R2/R3, 60 / L |

### 3.5 Five-axis, 4-axis and head machines (S)

| ID | Gap (evidence) | Ref / size |
|---|---|---|
| EG-40 | Multiaxis strategies are `parallel`, `contour`, `swarf` only (`MultiaxisStrategySchema`); tool axis `normal` or `lead` (+ tilt). Contacts are vertical-ray based. No tool-axis control by point/line/curve/surface, no auto-tilt for shortest tool, no flowline/morph/projection/isoparametric 5-axis, no 5-axis roughing, no 5-axis Z-level/pencil, no 5-axis profiling of tilted walls with collision avoidance | 51 F1–F3, F6 / L |
| EG-41 | **No collision avoidance in generation**: `operations/multiaxis.ts` states holder collision and head machines are not covered; swarf counts poses where shank/holder would hit (`collided`) and drops them. `kernel/collision.ts` + `motion.ts` are checks | 51 F3 / L |
| EG-42 | Kinematics: `table-AC` and `table-BC` trunnions only (`KernelMachine.fiveAxis.layout`). Head-head (AC), head-table mixes, head B-only (`head.ts`) are not planned by `execute.ts`; no non-orthogonal axes; pivot/offsets are "preview assumptions" in presets | 51 F7 / L |
| EG-43 | No 4-axis strategies (rotary wrap, indexed 4th, rotary roughing); no automatic rotary-axis unwinding policy beyond swarf `C range`; no singularity/pole handling, no joint-limit avoidance, no inverse-time feed (G93 only in `post/grbl.ts` per grep), tip-error of controller interpolation checked only at move ends (`motion.ts` header) | 51 F8 / M |
| EG-44 | Specialist 5-axis packages (impeller/blisk, port, barrel, tube, tyre mould, dental) — owner decision D4, not started | D4 / L each |
| EG-45 | **Process physics is per operation, not per move**: no engagement-based feed optimisation, no MRR/force along the path, no chatter/stability, no thermal; `adaptFeeds` works on G-code text and tool diameter, not on the stock (ledger G4). This is the hyperMILL MAXX class | 61 Z1–Z7 / L |

### 3.6 Turning, mill-turn and other processes (S)

| ID | Gap (evidence) | Ref / size |
|---|---|---|
| EG-50 | `execute.ts:146-147` **refuses** a lathe machine ("Use the turning plan for it"). `kernel/turning.ts` (332 lines) is an external-turning *preview* with an ideal point tool; no insert geometry/nose radius compensation, no ID turning, grooving, parting, threading cycles, bar feed, tailstock/steady, sub-spindle transfer, C-axis milling, Y-axis, polar/cylindrical interpolation, live-tool ops, balanced turning, multi-turret sync | 52 T1–T7, M1–M4 / L |
| EG-51 | Two lathe machine presets (Mazak INTEGREX, Okuma MULTUS) and a plain lathe exist, but no kernel path produces their programs; legacy `generator/lathe.ts` has no evidence | 52 / L |
| EG-52 | Other processes not started: wire EDM, laser/plasma/waterjet, nesting, dispensing, metal additive (DED/WAAM), hybrid additive-subtractive. FDM printing exists (`cam/print`) | D5 / L each |
| EG-53 | Probing/inspection: `generator/probe.ts` (legacy) only; no probing ops in the kernel, no work-offset update, no tool setting, no in-process measurement, no inspection program | 54 Q4, EG-08 / M |

### 3.7 Associativity, automation, collaboration (A)

| ID | Gap | Ref / size |
|---|---|---|
| EG-60 | A program does not know the model changed: `identity.part` is a digest nobody compares; no stale flag, no re-targeting of operations by face refs, no regeneration policy, no diff of two programs (spec 67 **checked**: nothing built) | 59 / L, needs 41 |
| EG-61 | No user-owned operation templates, job lists, rule engine, batch regeneration, feature-based automation (hyperMILL Automation Center); no "family of parts" parametrisation | 60 / L |
| EG-62 | Two CAM paths: legacy `generator/*` programs have no artifact, no evidence, no stale detection (ledger G5, D12 unanswered) | D12 / M |
| EG-63 | Naming (spec 41 N1–N8) is the hub for EG-14, EG-23, EG-34, EG-60, EG-61 and is **entirely open** (only neighbour-keyed `uniqueFaceNames`) | 41 / L |
| EG-64 | No operation-level cache or incremental regeneration (the whole program is replanned/regenerated on a change; per-op reuse not found in `execute.ts`, **not verified** against the kernel job queue) | M |
| EG-65 | No scripting/extension API for third parties inside the kernel (custom strategies, custom checks, custom post steps); the HTTP API and plugin SDK sit outside it | 09 / M |

### 3.8 Posts, output and shop documentation

| ID | Gap (evidence) | Ref / size |
|---|---|---|
| EG-70 | Posts: generic, fanuc, haas, grbl, heidenhain, siemens, linuxcnc, okuma, mazak (+ definitions). Missing: Mitsubishi M8x, Brother, Tormach-specific, Mori/DMG variants, **Siemens ShopMill/840D swivel (`CYCLE800`) and cycles**, Heidenhain `PLANE SPATIAL`/`CYCL DEF 19` generation for 3+2 (strings exist in `post/convert.ts` and the interpreter, not in the kernel's output), Fanuc macro-B probing | 54 C2 / M each |
| EG-71 | Post-as-data lacks word formats, line numbering and modal rules as fields; `base: "heidenhain"` definition still writes ISO text; no post tester CLI/diff (C3) | 54 C1/C3 / M |
| EG-72 | **No spline output**: `Move` has no spline/NURBS type; `G5.1`/`G6.2` are only referenced in `post/fanuc.ts` types; arc fitting exists (`arc-fit.ts`) | 54 Q2 / M |
| EG-73 | Cycle time = feed and rapid distances plus tool change seconds; no acceleration/jerk/look-ahead/block-processing model (grep: `jerk`/`acceleration` only in print/schema); estimate vs. machine time error unknown | 53 V8 / M |
| EG-74 | Setup sheet is HTML, kernel programs only: no PDF, no toolpath thumbnails, no templates, no tool presetter list, no legacy programs | 54 H1 / S |
| EG-75 | No NC import/reverse (parse a foreign G-code into a Program for re-verification and edit). The interpreter replays NC but there is no `importNc` (checked) | M |
| EG-76 | No CL/APT output and no STEP-NC (AP238) | L, low priority |
| EG-77 | No DNC / machine-connect / MTConnect / OPC UA, no post-to-shop-floor workflow (app level, not kernel) | L, out of core |

### 3.9 Evidence, performance, qualification (Q)

| ID | Gap | Ref / size |
|---|---|---|
| EG-80 | CAM corpus is the 9-entry history corpus; **no CAM reference set** (annotated features), no public STEP/IGES set | 55 E4–E5 / M |
| EG-81 | Bench has three `bench:cam` workloads; no drawing/CAM-plan/interference cases, no nightly job in `.github/workflows` | 55 E8 / S |
| EG-82 | No scale fixtures (large part, 500+ operations, 10⁷-cell stock) to bound memory and time; replay refuses/halts by budget rather than degrading | 55 E6 / M |
| EG-83 | Rust/WASM native compute for drop-cutter, height-field and replay is blocked on E2 numbers (spec 56 §7) | blocked |

## 4. What an enterprise buyer would hit first (in order)

1. A 5-axis part: no collision-free tool-axis, no verified release, no head machines → **EG-01, 40, 41, 42**.
2. A second side of the same part: no setup list, no carried stock, no fixtures → **EG-10, 11, 12, 02, 03**.
3. A mould or die with undercuts: height-field limits, no flowline/projection, no limits/avoid areas → **EG-20, 22, 14**.
4. A design change on Tuesday: program silently stale → **EG-60, 63**.
5. A turning job: refused → **EG-50**.
6. Tool library and presetter integration → **EG-16, 17**.
7. A machine acceptance: no qualification, no proof sensitivity → **EG-06, 09, 80**.

## 5. Proposed order (respects spec 62 lanes; M = lane M, I = lane I)

| Wave | Items | Why this order |
|---|---|---|
| 0 trust | EG-04+06 (tri-dexel + fault injection), EG-05 (budget as gate), EG-01 (5-axis claims on the tri-dexel), EG-31 (expose tabs/leads), EG-30 (compensation output) | nothing later can be called verified without it; EG-31 is a 1-session slice |
| 1 model | EG-10, 11, 12 (setup list, stock model, fixture bodies), EG-15/16 (assembly in `execute.ts`, new cutter kinds), EG-03 | unlocks multi-side parts and honest collision claims |
| 2 strategies | EG-40/41/42 (tool-axis strategies, collision-aware generation, head machines), EG-20/22/14 (limits, flowline/projection), EG-25/32/33, EG-45 | needs wave 0 for proof |
| 3 automation | spec 41 → EG-60/61/23/34/35, EG-62, EG-64 | needs naming |
| 4 breadth | EG-50/51 (turning), EG-70–73, EG-17, EG-53, EG-75 | large, mostly independent |
| 5 qualification | EG-80–82, EG-09 | needs D7 |
| horizon | EG-44, EG-52, EG-76, EG-83 | owner decisions D4, D5 |

Rule that holds throughout: no item is closed by a regenerated golden; each needs a gate test that fails first, and the scorecard row moves only through
`bun run scorecard`.

## 6. Honest uncertainties of this audit

- Rows marked **(ledger)** or "not verified" were not re-read; spec 57 may be ahead of or behind the tree for them.
- The hyperMILL yardstick is public product knowledge as remembered, not a comparison against current vendor documentation.
- No timing was measured today; EG-26 repeats earlier figures.
- Whether `execute.ts` or the kernel worker caches per operation (EG-64) was not traced through `apps/sidecar` job code.

## 7. Change log

- 2026-10-29: created (spec 67 was already taken by the real-state document; this is 68). Step plan: spec 69.
