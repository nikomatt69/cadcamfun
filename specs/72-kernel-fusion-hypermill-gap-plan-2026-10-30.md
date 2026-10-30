# 72 — Kernel and connected chain vs Fusion 360 / hyperMILL: measured gap inventory and action plan, 2026-10-30

Status: analysis written 2026-10-30 (owner request: "il kernel e ciò a cui è collegato deve essere al livello di
Fusion360/hyperMILL — trovami ogni gap e crea un plan di azione, analizza tutto al minimo dettaglio, dimmi cosa manca,
non cose che non hai analizzato"). This document **builds nothing** and claims no parity.

## 0. Method, evidence rule, limits

- Six parallel source audits opened implementation and test files directly (not search-only) in:
  `packages/core/src/cad/brep`, `packages/core/src/cad` + `drawing`, `packages/core/src/cam/operations` + `cam/kernel`,
  `packages/core/src/cam/kernel` (5-axis/turning/stock/posts), the connected chain
  (`packages/core` exports → `packages/api` → `apps/sidecar` → `apps/desktop` → `packages/ai`), and
  evidence/performance/automation (`packages/core/test/corpus`, `scripts`, `.github/workflows`).
- Independent checks run by the integrating agent on this tree: `bun run scorecard`,
  `bun run --filter @cadcamfun/api coverage` → **121/184 (66 %)**, `grep` on `cam/kernel/execute.ts` (release gate,
  no tri-dexel import), `ls` negatives (no `packages/core/src/sim-fea`, no `cam/kernel/{template,associativity,process}.ts`),
  `bun test packages/core/src/cam/kernel/{tridexel,engagement}.test.ts` → **20 pass** (modules work, unwired — see P0-3/P3-3).
- **Evidence rule.** Every gap below carries a `file:symbol` or a verified `ls`/`grep` negative from an opened scope.
  Anything not opened is listed in §8 UNVERIFIED and is **not** counted as a gap or as coverage.
- **Reference column.** "Fusion 360 / hyperMILL behaviour" is vendor-class reference behaviour from public product
  knowledge. It is a yardstick, **never measured** against those products in this repo. The scorecard vendor columns
  are all `—` (P4-8).
- Specs 33/57/67/68/70 are partly **stale** against this tree (tri-dexel, engagement, feed-optimise, Boolean counters,
  per-face shell walls, naming resolution, `flatPatternDxf` reachability all exist now). Where spec and code disagree,
  **code wins**; stale rows are named in §7.
- Verdicts: EXISTS = code + dispatch present; PARTIAL = subset / legacy-only / built-but-unwired; ABSENT = searched in
  the opened scope, not found. Sizes: S ≤ 1 step, M = 1 work package, L = multi-package / kernel-level.
  Priorities: **P0** trust/release, **P1** model/multi-setup, **P2** strategies, **P3** automation/associativity,
  **P4** breadth/qualification.

### 0.1 Measured headline numbers

| Measure | Value | Source |
| --- | --- | --- |
| Scorecard capabilities | 77 caps: **L0 = 46, L1 = 20, L2 = 9, L3 = 2, L4 = 0** | `bun run scorecard` on this tree; `packages/core/test/corpus/parity.json` |
| Only L3 rows | `history.pattern`, `revolve.exact` | scorecard output |
| API contract coverage | **121/184 (66 %)** legacy route files | `bun run --filter @cadcamfun/api coverage` |
| Corpus | 9 entries, sets (a)+(c) only; `c-plate-200-holes` 29 801 ms vs 10 000 ms budget | `packages/core/test/corpus/corpus.json`, `data/corpus-report.json` |
| CAM strategies wired in kernel | 2.5D set + 9 surface modes + `parallel/contour/swarf` multiaxis | §3, audit of `cam/operations`, `cam/kernel/contracts.ts` |
| Release ceiling today | `verified-program` unreachable for any 5-axis job and any non-`+Z` setup (by construction) | `cam/kernel/execute.ts:1121-1162` (P0-1, P0-2) |

**Verdict in one line:** a real, test-backed exact B-rep core and an honest 3-axis + indexed + narrow trunnion 5-axis
milling kernel, connected end-to-end for single-setup jobs — blocked from Fusion 360 / hyperMILL class first by the
**release/verification spine (P0)**, then by the **missing multi-setup program model (P1)**, not primarily by strategy count.

## 1. P0 — Trust and release (fix first; nothing later can be called verified without this spine)

| # | Gap | Evidence (opened) | Reference behaviour (not measured) | Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| P0-1 | 5-axis jobs can never reach `verified-program`: `no-gouge` and `material-removed` are forced `unresolved` when `turnedMoves > 0` | `cam/kernel/execute.ts:1121,1123`; behaviour asserted in `cam/kernel/five-axis-job.test.ts` | Fusion 360 / hyperMILL: simultaneous 5-axis programs are stock-verified and releasable | L | P0-3, P0-6 |
| P0-2 | Non-`+Z` setups can never reach `verified-program`: `setup-workholding` and `part-coverage` forced `unresolved` for `setupOrientation ≠ "+Z"`; hidden downward triangles or `skippedSamples > 0` also block | `cam/kernel/execute.ts:1149-1160` | Fusion / hyperMILL: multi-orientation setups verify against stock + fixtures | L | P0-3 |
| P0-3 | **Tri-dexel stock exists but is unwired (root blocker).** `TriDexel` module + tests pass (20 tests with engagement), yet zero imports outside itself/tests, not exported from `cam/kernel/index.ts`; release replay still uses the height field plus a `voxelStock(...,2)` *bracket* (a bracket is not a gouge verdict) | `cam/kernel/tridexel.ts:90,535,672`; `cam/kernel/execute.ts:896-905,1196`; `cam/kernel/stock.ts:65,92,222`; integrating-agent grep: no `tridexel` in `execute.ts`/`stock.ts` | hyperMILL: an exact stock model underpins every verification claim | L | — |
| P0-4 | Tolerance budget is computed but never gates release; no fault-injection sensitivity corpus (seeded overcuts vs clean fixtures, spec 53 V2 / EG-06), so the false-negative rate of replay is unknown | `cam/kernel/execute.ts:1187` (budget returned only), `:1162` (release rule never reads it); no fault-injection symbol found in kernel (grep-negative, see §8) | hyperMILL: verification sensitivity is qualified on seeded-fault corpora | M | P0-3 |
| P0-5 | No NC-byte verification entry point: `verifyNc(ncBytes, machine, part, stock, tol)` (spec 53 V2) does not exist; only post-conversion and self-replay of own NC | `cam/post/convert.ts:145,309`; `cam/kernel/execute.ts:1130`; `cam/verify/verify.ts:121` (verifies toolpaths, not NC vs B-rep + tri-dexel) | hyperMILL Virtual Machining / Fusion NC verification: foreign NC checked against part + stock + machine | L | P0-3 |
| P0-6 | Collision checking is post-hoc and cutter-only in generation: the simultaneous-motion planner is built but has only test callers; generation checks the cutter envelope only (no shank/holder/head/table/fixture), no search over orientation sets; release clearance is table-only, no fixture bodies | `cam/kernel/motion.ts:83`; `cam/operations/multiaxis.ts:16-17,189-214`; `cam/kernel/collision.ts:252`; `cam/kernel/execute.ts:926-977,1135-1137`; `cam/kernel/machine-clearance.ts:96` | hyperMILL: full machine + holder + fixture collision in generation and in verification | L | P0-3 |
| P0-7 | Evidence chain is not enforced: corpus/bench/scorecard run only manually; no `schedule:` nightly and no corpus/bench job in any workflow; the committed bench artifact is load-invalid and over-budget; scorecard levels derive from file *existence*, not from passing gates | `.github/workflows/ci.yml` (install/typecheck/test only); `data/bench.json` (2026-10-27); `packages/core/test/corpus/scorecard.ts:4,44`; `scripts/bench.ts` | Internal process gap; reference = spec 55 E8 / spec 69 J2 as written | S | — |
| P0-8 | Corpus is incomplete and one stress case fails its budget: 9 entries, sets (a)+(c) only; set (b) public STEP/IGES ≥ 30 parts and set (d) CAM reference parts = 0; `CorpusEntry.kind` is only `"history"` | `packages/core/test/corpus/corpus.json`; `runner.ts:34-46,107-132`; `data/corpus-report.json` (pass 8, slow 1); `parity.json` (`cam.reference-set` open) | Reference: spec 55 §2 sets (b)/(d) as specified | M | P0-7 |
| P0-9 | Boolean degenerate handling is **displacement, not designed coincidence**: operand B is nudged 3e-6…3e-3 × extent with a warning, guarded by volume identities + Halton sampling; spec 42 R2/R3/R4 (adaptive predicates, same-domain merge, analytic tangent contact) absent; general NURBS×NURBS singular/branch SSI only partial | `cad/brep/boolean.ts:1213,1246,1289,1362`; strict pipeline EXISTS `boolean.ts:335,44-62,98-111`; tests `boolean/degenerate/fuzz/gates.test.ts` | Fusion 360 (ASM-class kernel): coincident/tangent Booleans solved in place without moving operands | L | — |
| P0-10 | Healing is 3 passes only (weld vertices, weld duplicate edges, drop collapsed uses) and never moves geometry; no gap/overlap repair, no re-projection tightening, no tolerance-loose flag (spec 42 R6) | `cad/brep/heal.ts:36,3-11`; test `heal.test.ts` | Fusion 360: imported-body heal repairs gaps/overlaps within tolerance | M | P0-9 |

## 2. P1 — Model and multi-setup (the connected product shape)

| # | Gap | Evidence (opened) | Reference behaviour (not measured) | Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| P1-1 | **WP14 multi-op program layer absent at every leg:** no `cam/program/{op,setup,tooltable,plan,programs}.ts`, no `cam.program` export, no API `cam-setup.ts` group, no sidecar handler, no desktop `setupStore.ts`; desktop multi-op today is G-code string concatenation (explicitly forbidden by spec 14) | `packages/core/src/cam/index.ts:1-32` (no program namespace; integrating-agent grep confirms); `apps/desktop/src/features/cam/lib/multiToolpath.ts:245`; `multiToolpathStore.ts:98`; `specs/14-multi-op-setup.md:3,77-92`; RM-02 still `pending` in `specs/roadmap/README.md:25` | Fusion 360: setups group operations into one posted program per setup with a tool table and tool changes | L | P1-2 |
| P1-2 | Setup model is planning-only: `planSetups` and the `cadExact.setups` report exist, but there is no program emission, no persistence, no write action; the desktop setup choice only sets a single `setupOrientation` | `cam/setup.ts:21-110`; `cam/setup-plan.ts:41-122`; `apps/desktop/src/features/cam/.../KernelSetups.tsx:11-12,33,74`; `packages/ai/src/actions/cam.ts:38,90` (read-only reports) | Fusion: a setup is a persistent, editable program node | M | — |
| P1-3 | No HTTP route rebuilds a parametric history (spec 33 §3 still true): `cad-exact` exposes only `analyze/step/assembly/setups/hole` on scenes; rebuild is desktop-local or via the AI host only | `packages/api/src/groups/cad-exact.ts:13-17`; `apps/desktop/.../ParametricPanel.tsx:49,244` (local core); `packages/ai/src/actions/cad.ts:150-247` | Fusion-class: API rebuild parity for non-AI clients | M | — |
| P1-4 | API contract coverage 121/184 (66 %), and that count is contract-only; handler/payload parity needs separate HTTP tests | `packages/api/scripts/coverage.ts:1`; reproduced by the integrating agent (`121/184 legacy route files`) | n/a (internal) | M | — |
| P1-5 | Dual mesh + exact replay divergence risk (structural): two independent implementations per feature; parity is test-enforced, not structural; known non-exact cases: non-coaxial curved blends, ellipsoid/gear catalogue bodies, over-budget modelled threads, some curved draft/push-pull | `cad/history.ts:15,851,877`; `cad/history-brep.ts:14,212,618,636`; `history-exactness.test.ts` (the U0 coverage guard) | Fusion: one exact kernel drives display, CAM and drawings | L | — |
| P1-6 | Incremental rebuild absent (spec 58 T4): every edit replays from the top; no `ReplayState`/`resume`/checkpoint symbol in `history.ts`/`history-brep.ts`; this also blocks partial CAM regeneration (spec 59) and an operation cache | `specs/58-parametric-timeline.md:3`; grep-negative in the opened history files; scorecard `cam.operation-cache` L0 | Fusion: timeline edits rebuild only downstream features | L | P1-5 |
| P1-7 | Persistent naming is partial at the history level: the kernel side EXISTS (`topologyKeys`, `resolveKey`, `resolveAcross` with 5 outcomes, `uniqueFaceNames`, provenance lineage), but features store face **name strings**, not `Ref[]`; fillet/chamfer still select geometrically, shell open faces are still a `"top"\|"bottom"` enum, and drawing/CAM refs are absent in core (drawing dimensions are re-derived from features) | `cad/brep/naming-keys.ts:71,176,199,253`; `cad/brep/naming.ts:31,73`; `cad/brep/provenance.ts:101,134,164`; `cad/history.ts:216,400,418,947`; `drawing/dimensions.ts:101` | Fusion: persistent topological names survive edits for every consumer (features, drawings, CAM) | M | — |
| P1-8 | Head and head-table machines are absent from `runJob`: head kinematics exist module-only, there is no head preset, and the kernel forces table layouts ("A head that tilts is not modelled") | `cam/kernel/head.ts:37,46,85`; `cam/five-axis.ts:19-20,73`; `cam/kernel/execute.ts:663-684`; `cam/kernel/machines.ts:20,106,112` (all `table-*`) | hyperMILL / Fusion: head, table and head-table kinematics are all postable and verifiable | M | P0-6 |
| P1-9 | Turning is preview-only and mill-turn is absent: ideal point tool, no insert geometry or nose-radius compensation, no grooving/threading/parting cycles, no live tools, no C/Y axis, no sub-spindle or turret map, no turning `OperationSpec`; explicit G1 NC, no canned cycles. A lathe machine is refused by the milling kernel | `cam/kernel/turning.ts:48,91,202,235-236,238`; `cam/kernel/contracts.ts:149-175`; `cam/kernel/execute.ts:148-149`; `cam/kernel/machines.ts:124` (3 lathe presets) | Fusion Turning / hyperMILL mill-turn: full turning + live-tool programs with evidence | L | P1-1 |
| P1-10 | Assembly model is flat: no `PartDefinition`/`Occurrence`, no sub-assemblies, no in-context (occurrence-path) refs; rigid mates are one face-to-face joint per body with no mate-constraint solver; configurations are primitive (parameters + suppressed set), no named configuration store or design table. (Kinematic joints incl. closed loops, interference, clearance and BOM EXIST) | `cad/assembly-analysis.ts:10,53,98,139,183`; `cad/history.ts:434`; `cad/kinematics.ts:20,138,301` | Fusion: occurrences, a mate solver, configurations/design tables | L | P1-7 |
| P1-11 | Plugin SDK host is not exposed over HTTP: the host exists in the sidecar service layer (capability-checked RPC) and management HTTP exists, but there is no HTTP RPC invocation endpoint | `packages/plugin-sdk/src/index.ts:1`; `apps/sidecar/src/plugins/host.ts:284-335`; `apps/sidecar/src/services/ai-plugins.ts:137` (only caller); `packages/api/src/groups/plugins.ts:61-91`; `packages/ai/src/tools/plugin-tool.ts:1` | n/a (internal; RM-11 in progress) | M | — |

## 3. P2 — Strategies (machining and modelling operations)

| # | Gap | Evidence (opened) | Reference behaviour (not measured) | Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| P2-1 | Surface strategy breadth: 9 modes exist (roughing, rest, parallel, waterline, steep-shallow, scallop, spiral, radial, flat); flowline, morph-between-curves, projection, isoparametric and equidistant-on-boundary are absent; there is no standalone pencil (it is a side effect of parallel/waterline + rest only); no machining boundaries / avoid areas / containment / face selection (EG-14) and no per-face allowance (EG-23) | `cam/kernel/contracts.ts:170-175,199`; `cam/operations/surface.ts:16-20,48,52-59`; `cam/operations/rest.ts:119` | hyperMILL: full 3D strategy set with boundaries, per-face stock, dedicated pencil/finishing passes | L | P1-7 |
| P2-2 | Height-field ceiling: 3D roughing cannot cut undercuts (material is left, never cut); the drop-cutter is conservative-sampled, not exact (error ≤ slope·cell/2, `MAX_SURFACE_SAMPLES = 8e7` budget throws); no multi-orientation roughing | `cam/operations/surface.ts:5-7`; `cam/operations/surface-field.ts:96-160`; `cam/model/model.ts:74-146` | hyperMILL: exact, undercut-capable 3D roughing on a solid stock model | L | P0-3 |
| P2-3 | No cutter compensation (G41/G42) from the kernel (legacy generator only); spring/multi-pass finishing deferred; roughing breadth partial (no plunge, high-feed, trochoidal-slot or peel strategies). Tabs and lead types DO exist in `operations/profile.ts` | grep-negative in `cam/kernel/` + `cam/operations/`; `cam/operations/profile.ts:7,73-100`; `cam/generator/mill.ts:60-81`; `cam/kernel/contracts.ts:156,179-197` | Fusion / hyperMILL: cutter compensation emitted by the kernel and covered by verification | M | — |
| P2-4 | Cutter catalogue is narrow (11 kinds: flat, ball, bull, chamfer, spot, drill, facemill, threadmill, engraver, tap, reamer); barrel/tapered/lollipop/T-slot/dovetail/boring-bar/form tools absent; no swept-profile cutter model; the stepped holder assembly is not used by `execute` (only via the verify path), no holder library, no stick-out search; the planner is a fixed code sequence, not a rule engine | `cam/kernel/cutters.ts:13-26,98-108,149-151`; `cam/kernel/assembly.ts:20-60`; `cam/kernel/planner.ts` (~460 lines); `cam/operations/drill.ts:31-35,70-83`; `cam/operations/bore-mill.ts:29` | hyperMILL: arbitrary tool profiles, holder libraries, stick-out optimisation | L | P0-6 |
| P2-5 | Hole-making and feature recognition are partial: back-boring, gun/deep-hole drilling, a dedicated countersink cycle and tilted (5-axis) drilling are absent; slots/steps/grooves/chamfer and fillet bands are not named features with face refs; no 40-part recognition recall corpus | `cam/kernel/planner.ts:304-402`; `cam/kernel/execute.ts:579-581`; `cam/generator/history-features.ts:41-93`; `cam/model/brep-part.ts:176-305` | Fusion / hyperMILL: feature recognition with measured recall on reference parts | M | P2-1, P0-8 |
| P2-6 | 5-axis strategies are narrow: `parallel \| contour \| swarf` only, tool axis `normal \| lead`; contacts are vertical-ray based (no B-rep closest-point / undercut contacts); no 5-axis flowline/morph/projection, roughing, pencil or tilted drilling; singularity handling partial (no pole-bypass cone, no rate/jerk smoothing, no G93 inverse-time output from the kernel) | `cam/operations/multiaxis.ts:31,34,266,314,369`; `cam/operations/swarf.ts:70,110`; `cam/operations/swarf-walls.ts:26,154,172`; `cam/kernel/kinematics.ts:63,99,140`; `cam/post/grbl.ts:8` (mention only) | hyperMILL: full 5-axis strategy set with singularity and feed management | L | P0-6, P2-2 |
| P2-7 | General rolling-ball blend absent: blends exist only on straight plane–plane edges and closed coaxial rims; variable radius is straight-edge only (refused verbatim: "a variable radius needs a straight edge"); no tangent-chain propagation, no face-face/full-round fillet, no setback vertex blend, no general vertex blend. Failures are refused with reasons, never approximated. (Fillet-band re-radius edit EXISTS separately) | `cad/brep/blend.ts:115,201,267,447,491,607-608`; `cad/blend-spec.ts`; `cad/brep/fillet-edit.ts:198,209` | Fusion: rolling-ball fillets on arbitrary face pairs, variable radius, setback corners | L | P0-9 |
| P2-8 | Shell/offset work on analytic faces only: NURBS, revolution and extrusion faces are refused verbatim; no shell/offset of an arbitrary Boolean/loft body, no inward-offset API, no `cornerStyle sharp\|round` | `cad/brep/shell.ts:36-42,130,279,303,314,336`; `cad/brep/sweep.ts:319,337` | Fusion: shell and offset of arbitrary bodies | L | P2-7 |
| P2-9 | Surface modelling breadth: trim is isoparametric-rectangle only; thicken is translational only (a general NURBS normal offset is refused); loft has no guide rails, no G1/G2 end conditions, no closed loft, and spline sections are refused; sweep has no two-rail/twist/scale/guide-surface forms; no general trim-by-SSI with holes, no fill/Coons/n-sided patch, no extend/untrim/replace-face, no continuity/curvature/zebra/draft analysis. The NURBS offset/draft that exists is a fitted approximation (deviation returned, refused above 4× tolerance) | `cad/brep/surface-patch.ts:46,70,75,80,105,116`; `cad/brep/loft.ts:34,170,202,211`; `cad/brep/sweep.ts:412,499`; `cad/brep/path-sweep.ts:55,80,98,124`; `cad/brep/nurbs-offset.ts:175,223,253,262`; `cad/brep/topology.ts:42` (p-curve representable, no trim operation) | Fusion: a full surfacing workspace with continuity analysis | L | P0-9 |
| P2-10 | Sketch and direct-edit depth: no 2D offset/mirror/pattern/fillet sketch tools, no 3D sketch, no project/intersect of model edges into a sketch, no sketch blocks; no delete-face/replace-face/split-face history operations, no extrude until-next/to-body, no direct edit of an imported STEP body as history. (Sketch solver with 25 constraint kinds, drag API, trim/extend, push/pull and draft EXIST) | `cad/sketch-edit.ts:84,103,183`; `cad/sketch-model.ts:10,22`; `cad/sketch-solver.ts:434,586,707`; `cad/sketch.ts:103`; `cad/history.ts:91,391,412,510`; `cad/face-edit.ts:68`; `cad/smooth-face.ts:36` | Fusion: full sketcher plus direct editing (Press Pull, delete face) on any body, imported or native | L | P1-7 |

## 4. P3 — Automation and associativity

| # | Gap | Evidence (opened) | Reference behaviour (not measured) | Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| P3-1 | CAD→CAM associativity absent (spec 59): no `associativity.ts`, no `partFingerprint`, no `programStatus` anywhere in the opened kernel; the kernel hashes all element JSON (the exact pattern spec 59 §1 calls unusable); no stale status, selective regeneration, program diff or `matchOperations` at any layer | grep 0 hits in `cam/kernel` (audit 1); `cam/kernel/snapshot.ts:71`; `cam/kernel/execute.ts:1117` | Fusion: a model edit flags the affected operations stale and regenerates selectively | L | P1-6, P1-7 |
| P3-2 | CAM templates absent (spec 60): no `template.ts`, `CamTemplate`, `applyTemplate` or `selectTool`; the planner remains a fixed code sequence | grep 0 hits in `cam/kernel`; `cam/kernel/planner.ts`; scorecard `cam.templates` L0 | Fusion / hyperMILL: operation templates and libraries applied by rule | M | P3-1, P2-5 |
| P3-3 | Process physics is half-wired: engagement (Z1) and feed-optimise (Z2/Z3) modules + tests exist and pass, but have zero hits in `execute`/`contracts`/`schema` — no request field, the cutting-data claim stays a per-operation warning instead of a per-move measured claim, and there is no NC-replay check of optimised feeds; Z4–Z7 (chatter stability lobes, Taylor tool life, calibration, accel/jerk cycle-time model) absent; all values stay `uncalibrated` | `cam/kernel/engagement.ts:1-20` (512 lines); `cam/kernel/feed-optimise.ts:1-25` (389 lines); `cam/kernel/cutting-data.ts`; `cam/kernel/contracts.ts:309`; `cam/kernel/execute.ts:507,732,1087,1165`; grep-negative `stabilityLobes\|toolLife\|taylor`; integrating-agent test run: engagement tests pass | hyperMILL MAXX-class: feed optimisation driven by measured engagement on the posted path | M (wire) / L (Z4–Z7) | P0-5 |
| P3-4 | Linking optimisation is partial: drill nearest-neighbour + 2-opt and stay-down links exist; no global cross-operation TSP, no minimal-retract / lowest-safe linking policy, and the −15 % air-time target is unmeasured | `cam/geometry.ts:231-245`; `cam/operations/drill.ts:69`; `cam/operations/pocket.ts:96,264-317`; `cam/operations/adaptive.ts:254-416` | hyperMILL: global link optimisation with measured air-time reduction | M | P0-8 |
| P3-5 | Scale evidence absent: spec 55 §4 targets are still unmeasured targets; no 5 000-face / 500-operation / 10⁷-cell fixtures; `boolean.scale` open | `specs/55-evidence-performance-qualification.md` §4; `packages/core/test/bench/cases.ts`; `scripts/cam-performance.ts` (one 500×400 height-field case) | Reference: spec 55 §4 table as specified | M | P0-7 |

## 5. P4 — Breadth and qualification

| # | Gap | Evidence (opened) | Reference behaviour (not measured) | Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| P4-1 | Exchange: STEP **write is AP214 only** (read claims AP203/214/242 geometry); no AP242 export, no semantic PMI, no colour/layer, no validation properties. IGES 5.3 partial (rigid transforms only, transform on shared topology refused, Parasolid refused with a diagnostic) | `cad/brep/step.ts:2,594-753,623,786,885,908`; `cad/brep/iges.ts:37,126,166,253,284,290` | Fusion: AP242 with PMI and colour round-trip | L | — |
| P4-2 | Drawings partial: views come from mesh projection (exact edges preferred, tessellated for occlusion); no auxiliary/half/offset/aligned/revolved/broken-out/break/crop/exploded views; annotations anchor to caller-supplied world points, not entity refs, so they do not follow geometry; dimensions are dropped for transformed features; overlap is reported, not solved; GD&T lacks composite frames, datum targets, surface-texture and weld symbols; no automatic BOM table on the sheet; **no PDF writer** (grep over `packages/core/src`: none); A4/A3/A2 sheet sizes only | `drawing/project.ts:172`; `drawing/sheet.ts:54,188,202,392,400`; `drawing/section.ts:140,189`; `drawing/dimensions.ts:101,206`; `drawing/gdt.ts:4,18,46,94`; `drawing/title-block.ts:79` | Fusion Drawings: associative annotations, full view set, vector PDF export | L | P1-7 |
| P4-3 | PMI/MBD absent end-to-end: no `pmi` in History, no 3D annotation captures, no AP242 semantic PMI | audit of `cad/history.ts` + `cad/brep/step.ts` (no PMI/COLOUR entities) | Fusion MBD: model-based definition published to AP242 | M | P4-1 |
| P4-4 | Industrial workspaces absent or thin: sheet metal is a 2D-profile body only (no true sheet body, flange on any edge, 3D unfold/refold, DFM rules); weldments, mold tools and FEA/simulation are entirely absent | `cad/sheet-metal.ts:110,148,211,242,269,296`; `cad/history.ts:321`; `specs/47-industrial-cad-modules.md:14`; `specs/48-simulation-fea.md:4`; `ls` negative: no `packages/core/src/sim-fea` (integrating agent) | Fusion: Sheet Metal and Simulation workspaces | L each | — |
| P4-5 | Assembly breadth: exploded views, large-assembly LOD/BVH, assembly features and motor/spring motion absent; interference is O(n²) pair Booleans with a bbox pre-filter | `cad/kinematics.ts`; `cad/assembly-analysis.ts` (grep-negatives in audit 3 §6) | Fusion: exploded views, large-assembly performance modes | M | P1-10 |
| P4-6 | Post breadth: 9 posts exist with TCP words (G43.4/G234/TRAORI/M128) but the kernel emits `tcp: false` by default; `CYCLE800` / `PLANE SPATIAL` / `CYCL DEF 19` generation absent (import detection only); turning cycles absent; Mitsubishi/Brother/DMG dialects absent; cycle time is kinematic-only (no acceleration/jerk/look-ahead model) | `cam/post/index.ts:30-40`; `cam/post/fanuc.ts:39`; `cam/post/siemens.ts:29,31`; `cam/post/heidenhain.ts:28`; `cam/kernel/execute.ts:757,1165`; `cam/post/convert.ts:181-183,242`; `cam/indexing.ts:23`; `cam/kernel/machines.ts:24` | hyperMILL / Fusion posts: full tilted-workplane cycles and TCP on posted 5-axis programs | M | P1-8, P1-9 |
| P4-7 | Probing absent in the kernel: no probing `OperationSpec`; probing exists only in the legacy generator plus a probe tool model, and post-conversion refuses probing moves | `cam/kernel/contracts.ts:149-175`; `cam/kernel/machine-profile.ts:152`; `cam/generator/probe.ts` (characterised via spec 52 — body UNVERIFIED, §8); `cam/post/convert.ts:183` | Fusion / hyperMILL: in-process probing cycles, posted and simulated | M | P4-6 |
| P4-8 | Qualification (owner decision D7) absent by construction: no `qualification/` directory, schema, validator or example; scorecard L4 unreachable (0/77); vendor columns (Fusion/SolidWorks/Creo/hyperMILL) all `—`, unresearched; milling capped at `verified-model`, turning at `preview` | `ls qualification/` negative; `packages/core/test/corpus/scorecard.ts:8`; `packages/core/test/corpus/parity.json` (L0=46, L1=20, L2=9, L3=2, L4=0) | Reference: spec 55 §6/E7 record as specified | M | P0-4, P0-8 |
| P4-9 | Tool/material data exchange partial: ISO material groups + Kienzle cutting data exist; ISO 13399 tool exchange, presetter export (Zoller/Haimer/Speroni class), tool-life/sister-tool management and user-versioned cutting-data tables absent | `cam/kernel/materials.ts:19,109,409`; grep-negatives in audit 4 (EG-17/18) | hyperMILL: ISO 13399 tool-database exchange with presetters | M | P2-4 |

## 6. Action plan (ordered; each step closes with a gate, not with a claim)

Rules inherited from spec 39 §2 and spec 62: no parity word without scorecard evidence; refusal over silent
approximation; every step adds a test that fails on the pre-change behaviour; independent oracle (analytic volume,
OpenCascade reader, grid/Monte-Carlo truth) for exactness claims; contract changes go through the owning spec, then
`packages/api` → sidecar → AI schema → desktop, regenerating the web API reference
(`bun --no-env-file packages/web/script/generate-api-reference.mjs`) before the workspace typecheck.
Do not start a later RM step out of order (`specs/roadmap/README.md`); this plan sequences **kernel** work and names
the RM step it feeds. Owners: WP1 `packages/core/src/cad`, WP2 `packages/core/src/cam`, WP3 `packages/api`,
WP4 `apps/sidecar`, WP6/WP7 `apps/desktop`, WP8 `packages/ai`.

### Wave 0 — Make the release claim reachable and measurable (P0; feeds RM-09)

| Step | Work | Closes | Gate (must fail before, pass after) |
| --- | --- | --- | --- |
| 0.1 | Enforce the evidence chain in CI: nightly `schedule:` job running `bun run corpus`, `bun run bench`, `bun run scorecard`; fail on a load-invalid bench artifact; scorecard levels must derive from passing gates, not file existence | P0-7 | CI job exists and is green for 7 consecutive nights; `scorecard.ts` reads gate results |
| 0.2 | Complete the corpus: set (b) ≥ 30 public STEP/IGES parts, set (d) CAM reference parts with annotated features; fix or re-budget `c-plate-200-holes` (29.8 s vs 10 s) with a measured split of Boolean vs tessellation time | P0-8, P3-5 (part) | `bun run corpus`: 0 wrong, 0 refused-unexpected, 0 slow; report committed |
| 0.3 | Wire `TriDexel` into `execute.ts` replay: replace the `voxelStock(...,2)` bracket for turned/tilted moves with a tri-dexel gouge + residual verdict at a declared tolerance; export it from `cam/kernel/index.ts` | P0-3 | New tests: a seeded tilted-tool overcut is detected (fails on the bracket code); `tridexel.test.ts` stays green; scorecard `cam.stock-tridexel` ≥ L2 |
| 0.4 | Make the tolerance budget a gate: `verified-program` requires budget terms measured (not worst-case sums) and within the job tolerance; add the fault-injection set (100 seeded overcuts must all be caught, 30 clean fixtures must all pass) | P0-4 | Fault-injection suite in CI with 0 false negatives / 0 false positives on the fixture set |
| 0.5 | Release 5-axis and multi-orientation jobs: `no-gouge`/`material-removed`/`part-coverage`/`setup-workholding` computed on the tri-dexel + fixture bodies (fixture bodies enter the job model here — vise/jaw/clamp solids, checked in `machine-clearance`) | P0-1, P0-2, P0-6 (release half) | A 5-axis fixture job and a flipped (+Z/−Z) two-setup job both reach `verified-program`; the same jobs with a seeded collision reach `blocked` |
| 0.6 | `verifyNc(ncBytes, machine, part, stock, tol)`: replay foreign NC against part + tri-dexel stock + machine limits; expose in kernel, then API/sidecar (WP3/WP4) | P0-5 | A hand-written NC with a 0.1 mm overcut is reported with move index; own posted NC verifies clean |

### Wave 1 — Multi-setup program model (P1; this is RM-02, after RM-01/RM-03 per roadmap)

| Step | Work | Closes | Gate |
| --- | --- | --- | --- |
| 1.1 | `packages/core/src/cam/program/`: operation → setup (WCS, stock carried from previous setup, fixture refs) → program with tool table and tool changes; export `cam.program`; delete the desktop G-code concatenation path | P1-1, P1-2 | Spec 14 acceptance: one setup with 2 tools posts one program with `M06` tool changes; stock of setup 2 = residual stock of setup 1 (tri-dexel equality within tolerance) |
| 1.2 | API `camSetup` group + sidecar handler + persistence (WP0 revision/receipt via RM-03) + desktop `setupStore` + AI setup write actions (WP8) | P1-1 (adapters) | End-to-end test: create setup via HTTP, post via desktop store, same NC bytes from AI action |
| 1.3 | HTTP parametric rebuild route (`POST /api/cad/history/rebuild` or equivalent on the cad-exact group) so non-AI clients rebuild without the assistant | P1-3 | HTTP test: rebuild returns the same exact body hash as desktop-local `rebuildExact` |
| 1.4 | History-level persistent refs: fillet/chamfer/shell/draft/push-pull store `Ref[]` (N4/N5); drawings and CAM face selections consume refs (N6); AI `ref` schema + desktop stale-ref badge (N7/N8, after verifying §8 items) | P1-7 | Rename/reorder test: an upstream rename keeps every downstream selection; a split face resolves `split`, never nearest |
| 1.5 | Head and head-table machines in `runJob` (wire `kernel/head.ts`, add presets, post + verify) | P1-8 | Head-machine 5-axis job posts and verifies; table-machine outputs byte-identical |
| 1.6 | Turning as kernel operations: insert geometry + nose-radius compensation, ID turning, grooving, threading, parting; canned cycles in posts; mill-turn stays refused until live tools land | P1-9 (turning half) | Analytic-volume tests per operation (removed + remaining + unmachined = stock); release stays `preview` until P0-4 fault injection covers turning |

### Wave 2 — Kernel depth (P0-9/P0-10, P1-5/P1-6; feeds RM-09)

| Step | Work | Closes | Gate |
| --- | --- | --- | --- |
| 2.1 | Designed-coincidence Booleans: same-domain face merge, analytic tangent contact, adaptive predicates (spec 42 R2–R4) so aligned cases solve in place; displacement recovery stays only as a reported fallback | P0-9 | The spec 33 §7.1 R1–R5 cases pass with **no** displacement warning; fuzz suite (aligned + generic) 0 allowed failures |
| 2.2 | Healing that moves geometry within tolerance: gap/overlap repair, re-projection, tolerance-loose flag on healed faces (spec 42 R6); route imported STEP bodies through it into a history base feature | P0-10, P2-10 (import half) | Exploded-STEP fixture heals to a valid solid and accepts a Boolean; unrepairable bodies still refused with diagnostics |
| 2.3 | Single exact truth, phase by phase (spec 40): make the exact replay the source for display tessellation and CAM on the covered feature matrix; keep the mesh replay only behind an explicit `legacyMesh` flag (owner decision D1) | P1-5 | `history-exactness.test.ts` matrix at 100 % exact-or-refused; mesh/exact volume agreement tests deleted because the second implementation is gone for covered kinds |
| 2.4 | Incremental rebuild (spec 58 T4): checkpoint per feature, resume from the first dirty feature; expose per-operation regeneration on top of it | P1-6 | Edit-last-feature rebuild time ≤ 10 % of full replay on the corpus histories; results identical to full replay |

### Wave 3 — Strategies (P2; each family lands with its own verification on the Wave-0 spine)

| Step | Work | Closes | Gate |
| --- | --- | --- | --- |
| 3.1 | Machining limits first: boundary/avoid/containment geometry and per-face allowance on `surface`/`multiaxis` (needs P1-7 refs) | P2-1 (limits half) | A bounded finish pass touches only the selected faces (tri-dexel residual proof) |
| 3.2 | Surface breadth: flowline, morph, projection, isoparametric, standalone pencil; exact B-rep drop-cutter contact as an alternative to the sampled field with a declared error | P2-1, P2-2 | Scallop-height error measured against analytic surfaces within declared tolerance; undercut fixture machined by multi-orientation roughing |
| 3.3 | Kernel cutter compensation (G41/G42) + spring passes; swept-profile cutter model; barrel/lollipop/T-slot tools; stepped holder + stick-out search wired into `execute` | P2-3, P2-4 | Compensated profile verifies on the tri-dexel; minimum stick-out chosen per operation in planner tests |
| 3.4 | Hole-making breadth (back-boring, deep-hole, countersink cycle, tilted drilling) + named feature recognition (slots, steps, grooves, bands) with the 40-part recall corpus from step 0.2 | P2-5 | Recall/precision reported per feature kind on the corpus; no silent fallback strategies |
| 3.5 | 5-axis breadth: B-rep closest-point contacts, tool-axis by point/line/curve/surface, auto-tilt with generation-time collision (holder/head/fixtures, orientation search), singularity cone + rate smoothing + G93 output | P2-6, P0-6 (generation half) | Collision-free tool-axis on the impeller-like fixture (non-specialist); a path through the pole is rerouted or refused, never singular |
| 3.6 | General blends and surfaces: rolling-ball between arbitrary faces, tangent chains, face-face and setback blends; any-body shell/offset; general trim/fill/rail-loft; continuity (G1/G2), curvature and draft analysis | P2-7, P2-8, P2-9 | Analytic-volume tests per family; OpenCascade reader agrees on exported STEP within 0.1 % (the §7.22 oracle rule) |
| 3.7 | Sketch/direct-edit completion: sketch offset/mirror/pattern/fillet, project/intersect, 3D sketch; delete/replace/split face and extrude-to-body as history operations on native and imported bodies | P2-10 | Direct-edit round trip: imported STEP → delete face + heal → exact volume matches analytic expectation |

### Wave 4 — Automation (P3; needs Waves 0–1)

| Step | Work | Closes | Gate |
| --- | --- | --- | --- |
| 4.1 | Associativity (spec 59): part fingerprint from feature ids + parameters (not element JSON), `programStatus`, selective regeneration with program diff, `matchOperations` | P3-1 | Edit one hole diameter: only its operations regenerate; NC diff names them; untouched operations byte-identical |
| 4.2 | Templates and rules (spec 60): user-owned `CamTemplate`, rule-based planner replacing the fixed sequence per feature kind, tool selection by stick-out | P3-2, P2-4 (planner half) | A template applied to two corpus parts produces the recorded operation sets; planner decisions cite their rule |
| 4.3 | Wire process physics: engagement per move in `execute`, feed optimisation as a measured claim on the replayed NC, then Z4–Z7 (stability lobes, tool life, calibration records, accel/jerk cycle-time) | P3-3 | Optimised program's replayed peak load within limits on every move; cycle-time error vs the bench machine model reported |
| 4.4 | Global linking optimisation with measured air-time on the CAM reference set | P3-4 | ≥ 15 % air-time reduction on the reference set with identical cut moves, or the step reports the measured number and stops |

### Wave 5 — Breadth and qualification (P4)

| Step | Work | Closes | Gate |
| --- | --- | --- | --- |
| 5.1 | AP242 export with semantic PMI and colour; PMI/MBD authoring in history; IGES trimmed-surface depth; mesh import (STL/OBJ/3MF) with faceted-to-analytic recovery where refused today | P4-1, P4-3 | AP242 round trip through the OpenCascade reader keeps PMI datums and colours |
| 5.2 | Drawings: entity-ref annotations, remaining view kinds, auto BOM, vector PDF writer | P4-2 | A drawing survives a parameter edit with every annotation still attached to its entity; PDF is vector (text selectable) |
| 5.3 | Industrial modules in owner-chosen order (D3/D5 decisions first): true sheet-metal body, weldments, mold tools, FEA (spec 48 solver decision) | P4-4 | Per-module analytic gates (developed length, cut list, cavity volume, FEA benchmark vs known solution) |
| 5.4 | Assembly breadth: occurrences/sub-assemblies, mate solver, named configurations, exploded views, LOD for large assemblies | P1-10, P4-5 | 1 000-occurrence fixture opens and solves within the spec 55 scale budget |
| 5.5 | Posts and shop floor: tilted-workplane cycles (CYCLE800, PLANE SPATIAL, CYCL DEF 19), TCP on by default for 5-axis, probing operations, ISO 13399 + presetter export | P4-6, P4-7, P4-9 | Posted 3+2 program uses the control's swivel cycle and verifies via `verifyNc` (step 0.6) |
| 5.6 | Qualification pack (needs owner decision D7): qualification record schema + example, controller-accepted NC evidence, vendor scorecard columns researched | P4-8 | First capability reaches scorecard L4 through `bun run scorecard`, or D7 stays open and L4 stays 0 — reported, not claimed |

## 7. Stale spec rows found while auditing (fix with the next header pass; code wins)

| Spec row | Says | Code today |
| --- | --- | --- |
| 57 / 42 ledger | Boolean counters absent | `BooleanCounters`/`booleanCounters` exist (`cad/brep/boolean.ts:72-96`) |
| 57 O4 | per-face shell wall open | `shellBrep(..., { wallByFace })` exists with tests (`cad/brep/shell.ts:36-42`, `shell.test.ts:85`) |
| 67 §3.3 / 41 header | naming "everything open" | Kernel keys/resolution/lineage exist (§2 P1-7); the open part is history-level `Ref[]` storage and consumers |
| 33 §3 | `flatPatternDxf` unreachable from any layer | Reachable from AI report and desktop ParametricPanel (audit 2) |
| 68 (2026-10-29) | tri-dexel / engagement absent | Modules exist and pass tests; the gap is wiring (P0-3, P3-3) |
| 70 | spec 61 has no code | Z1–Z3 modules exist unwired (P3-3) |
| roadmap README | RM-02 pending, WP14 absent | Confirmed still true on this tree (P1-1) |

## 8. UNVERIFIED — not analysed, therefore not claimed as gaps or as coverage

Per the owner's rule, the following were **not** opened in this audit. They are named so nobody reads silence as coverage:

- CAD kernel bodies: `cad/brep/classify.ts`, `mass.ts`, `primitives.ts`, `cdt.ts`, and the middles of
  `boolean.ts`/`intersect.ts`/`tessellate.ts` (headers/imports only). Consequence: the adaptive-predicate absence in
  P0-9 is unverified inside `classify.ts`; NURBS×NURBS SSI branch handling beyond `intersect.ts` headers is unopened.
- AI/desktop naming consumers (spec 41 N7/N8) and the desktop sketcher UI (spec 45 K8): outside the opened
  `packages/core` scope. Step 1.4 must verify them before promising the badge/schema work.
- Legacy `cam/generator/lathe.ts` and `cam/generator/probe.ts` bodies: characterised via spec 52 only (P1-9/P4-7
  legacy claims). The fault-injection absence (P0-4) is a grep-negative, not a full test-tree read.
- Integration: the workflow step executor beyond `project/*`, the body of `packages/api/src/groups/drawings.ts`,
  and the body of the desktop `KernelSection.tsx` were not opened.
- Test-suite state: this audit ran `tridexel` + `engagement` kernel tests (20 pass), the scorecard and the API
  coverage script. It did **not** run the full core/api/sidecar/desktop suites; pass/fail of untouched areas is
  unverified here, and scorecard/bench figures come from the committed artifacts plus the scorecard re-run.
- External comparison: no Fusion 360 or hyperMILL installation, licence or vendor test was available; every
  reference-behaviour statement is public product knowledge used as a yardstick, exactly as in spec 68 §6.

## 9. Change log

- 2026-10-30: created from six parallel source audits plus integrating-agent checks (scorecard, API coverage,
  release-gate grep, targeted kernel tests). No code changed.


