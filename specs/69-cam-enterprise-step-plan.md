# 69 — CAM kernel to enterprise level: step-by-step plan

Status: written 2026-10-29. Turns the 70 gaps of [spec 68](68-cam-kernel-enterprise-gap-audit.md) (`EG-nn`) into ordered, individually
closable steps. It is the CAM chapter of [spec 62](62-execution-plan-2026-q4.md) (lane M = CAM kernel, lane I = CAM intelligence, lane E = evidence) and
**does not replace** the design of specs 29, 41, 51–55, 58–61, which stay the detail. Where this plan and spec 62 disagree on CAM order, this plan wins. Interleaving with the platform/AI roadmap, adapter windows and the order of the first items across lanes are in [spec 70](70-integrated-next-steps-2026-10-29.md).
This document **builds nothing** and claims no parity; a level moves only through `bun run scorecard` (spec 55 §5).

## 1. Rules for every step

1. **One step = one vertical slice**: core → API contract → sidecar → DB (only if persistence changes) → AI action → desktop panel → tests. Steps marked
   *core only* say so. Adapter work is serialised in an *adapter window* (spec 62 §2): one lane regenerates clients at a time
   (`cd packages/api && bun run generate`, `bun test packages/api -u`, harness inventory by script).
2. **Gate first**: the gate test is written, fails, then the step is built. No step is closed by regenerating a golden or a baseline.
3. **Read-compatible schemas**: `KERNEL_SCHEMA_VERSION` changes only as a superset; a stored v1 request still replays (spec 38 stored kernel programs).
4. **Refusal over fiction**: what a step does not cover is refused with its reason and recorded in `corpus/refusals.json` and the spec's honest-limits list.
5. **Close ritual** (spec 62 §8): `bun check -p packages/core/tsconfig.json` clean; touched adapter packages typecheck; existing suites of the area green and
   listed; row updated in spec 57 and in `packages/core/test/corpus/parity.json`; `bun run scorecard`; no commit unless asked.
6. **Test discipline** (lessons of earlier rounds): run kernel suites per file under 110 s; never `git stash` in the shared checkout; stage explicit paths; judge timings against
   the budgets of `bench.config.json`, not history.
7. A step that needs an owner decision says so; its default stands until answered.

Sizes: **S** one session, **M** 1–3, **L** several with a convergence risk.

## 2. The steps

### Phase A — Quick honesty slices (no dependency, any order)

| Step | Work | Files (owner) | Gate | Size | EG |
|---|---|---|---|---|---|
| A1 | **Built 2026-10-29** (spring pass moved to A1b): profile **tabs** (`width` = standing material, the window is one diameter longer), **lead-in** type and radius in `OperationSpec`; `quality.tabs` makes the planner hold a through-cut outline; the replay expects tab material (`declaredLeft`); the closed-contour step-down ramp no longer cuts through a tab (found by the gate); API `tabs`, assistant `cam.manufacture`, desktop `#kernel-tabs`. Evidence: `kernel/profile-tabs.test.ts`, sidecar `cam-kernel.test.ts`, desktop `cam-kernel-tabs.test.ts`. Original text: expose tabs, lead-in / lead-out type and length, multi-pass finish / spring pass; the planner adds tabs to a through-cut outline instead of a note | `cam/kernel/{contracts,snapshot,schema,execute,planner}.ts`; adapters | `kernel.test`: through-cut outline leaves tab material in the replay, `no-gouge` passed, plan has no "hold by tabs" note | S | EG-31 |
| A2 | **Cutter compensation output** (`G41/G42`, `D`/`H` register, `G40`) from the kernel for profile and pocket-finish, per post; a `compensation: "program" \| "control" \| "wear"` option | `cam/operations/profile.ts`, `kernel/execute.ts`, posts; interpreter already replays comp (`testing/cutter-comp.ts`) | NC replay with `control` comp equals the program-offset path within the path term of the budget; goldens of `program` mode byte-identical | M | EG-30 |
| A3 | **Stepped tool assembly in the executor**: `execute.ts` builds the holder/shank profile from `kernel/assembly.ts` for `holder-clearance`, `machine-clearance` and collisions | `kernel/{execute,assembly,cutters}.ts` | a stepped holder collides where the single cylinder did not; existing `holder-clearance` tests unchanged | M | EG-15 |
| A4 | **Rotary moves get a machine-clearance verdict**: run the existing `checkMotion` trunnion scene over turned moves instead of `unsupported` | `kernel/execute.ts`, `kernel/{motion,collision}.ts` | a 5-axis swarf job reports `machine-clearance` `passed`/`failed` (never `unsupported`) with the part envelope and table | M | EG-01, 03 |
| A5 | **Replay degrades with a declared bound** instead of halting four claims at the budget: coarser cell, bound added to the tolerance term | `kernel/execute.ts` (`replayCell`) | a big fixture finishes with cell × 2 and `stock-replay` term grown, claims stay `passed`; cancellation still works | S | EG-04, 82 |

### Phase B — Proof: stock and verification (lane M; spec 53)

| Step | Work | Files | Depends | Gate | Size | EG |
|---|---|---|---|---|---|---|
| B1 | **Tri-dexel stock** with a declared bound (core only) | new `cam/kernel/tridexel.ts` (beside `stock.ts`, `model/dexel.ts`) | — | tilted pocket volume within cell × area; ball cut on a sphere within one cell; sure/possible bracket kept | L | EG-04 |
| B2 | **Replay of rotary moves on the tri-dexel**: `no-gouge` and `material-removed` decided for turned moves | `kernel/execute.ts` | B1, A4 | a 5-axis fixture reaches **`verified-program`** with every claim `passed`; an injected overcut makes it `failed` | L | EG-01 |
| B3 | **Fault-injection set**: 100 seeded overcuts / undercuts over 30 clean fixtures; sensitivity and false-positive rate written to the corpus report | `packages/core/test/corpus/` (lane E) | B2 | 100/100 detected, 0 false positives (targets; the measured figures are written even if lower) | M | EG-06 |
| B4 | **Tolerance budget as a gate**: claim `tolerance` passed/failed against `quality.tolerance`; release rule updated | `kernel/{contracts,execute}.ts` | B2 | tightening `quality.tolerance` below the budget blocks release with the term named | M | EG-05 |
| B5 | **Machine-collision claim, all pairs**, spindle housing, table, fixtures (after C3), tool assembly | `kernel/{collision,execute}.ts`, `viewer/machine-bodies.ts` | B2, C3 | a deliberately colliding fixture fails; claim lists the pair | L | EG-07 |
| B6 | **IK tip-error gate** for TCP words: replay vs. planned tip within 0.005 mm | `kernel/{kinematics,motion}.ts`, interpreter | B2 | gate figure measured and written | M | EG-07 |

### Phase C — Job model (lane M, adapter window per step)

| Step | Work | Files | Depends | Gate | Size | EG |
|---|---|---|---|---|---|---|
| C1 | **Setups list**: `ManufacturingJob.setups[]` (orientation incl. arbitrary workplane / 3+2, origin, work offset, operations per setup); v1 jobs load as one setup | `kernel/{contracts,snapshot,schema,execute,planner}.ts`, `setup.ts` | — | v1 stored program replays byte-identical; two-setup job emits two work offsets and one program; tilted workplane writes the control's plane command | L | EG-10 |
| C2 | **Stock model**: bar/cylinder, mesh stock (casting, scan), box; stock from a previous setup or job | `kernel/{contracts,stock,prepare}.ts` | B1 | stock volume equals closed form (bar) and mesh volume (scan); rest uses it | M | EG-11, 24 |
| C3 | **Fixture bodies**: vise, jaws, clamps, pallet, tombstone as boxes / cylinders / meshes per setup; collision input of A3/B5; `setup-workholding` becomes decidable | new `kernel/fixtures.ts` | C1 | a clamp in the path fails `machine-clearance`; no fixture keeps the claim `unresolved` as today | L | EG-12, 02, 03 |
| C4 | **Stock carried between setups** (flip / refixture) | `kernel/execute.ts` | C1, C2, B1 | setup 2 rests-machines what setup 1 left; total removal = sum within the bound | L | EG-10, 24 |
| C5 | **Cross-setup `part-coverage`**: union of reached faces (from `planSetups` and the replay) decides the claim | `cam/setup-plan.ts`, `execute.ts` | C1 | six-side fixture: `part-coverage` passed only when the union covers every face | M | EG-02 |
| C6 | **Operation model**: ids with dependencies, enable/disable, copy/mirror/pattern of operations and of a whole setup (transform job) | contracts, planner, desktop list | C1 | transformed job's NC equals the translated original | M | EG-13 |
| C7 | **Machining limits**: boundary / avoid / containment regions (XY, then face refs after E3) on `surface` and `multiaxis` | `operations/{surface,multiaxis}.ts`, contracts | — | no cut outside the boundary in the replay; avoid areas keep their stock | M | EG-14 |
| C8 | Adapter window for A1–C7: API contracts, sidecar routes, assistant actions (`cam.setups`, `cam.fixture`, …), desktop setup list and fixture editor, stored request keeps the new fields | `packages/api`, `apps/sidecar`, `packages/ai`, `apps/desktop` | per step | real-sidecar tests (as `cam-kernel.test.ts`), happy-dom panel tests, one real-browser run recorded | M each | — |

### Phase D — Tools and cutting data

| Step | Work | Files | Depends | Gate | Size | EG |
|---|---|---|---|---|---|---|
| D1 | **Swept-profile cutter model** and kinds: tapered end/ball, barrel (oval, lens, circle segment), lollipop, T-slot, dovetail, boring bar; replay and drop-cutter use the profile | `kernel/cutters.ts`, `verify/tool-model.ts`, `operations/surface-field.ts` | A3 | analytic envelope of each kind within 1 µm; replay cuts the T-slot exactly | L | EG-16 |
| D2 | **Holder / extension library** and the **minimum stick-out** search (spec 54 R3) | `kernel/{assembly,planner}.ts` | A3 | shortest holder passing collision; deeper pocket raises it | M | EG-15 |
| D3 | **Tool data I/O**: ISO 13399 (GTC/P21/XML) import-export, CSV and presetter list export, vendor catalogue by user file | new `kernel/tool-io.ts` | D1 | sample end-mill file imports with matching geometry; round trip keeps fields | L | EG-17 |
| D4 | **Cutting-data library** user-editable and versioned; **tool life counters**, sister tools, magazine reorder | `kernel/{cutting-data,materials}.ts`, WP0 decision for columns | — | table change changes the plan deterministically; magazine limit reorders when possible | M | EG-17, 18 |

### Phase E — Naming and associativity (lane T then I; the hub)

| Step | Work | Depends | Gate | Size | EG |
|---|---|---|---|---|---|
| E1 | Spec 41 **N1–N3** provenance, edge/vertex keys, `resolve(ref)` | 58 T3 | every result face maps to an operand face or `new`; keys stable under a 20 % upstream change | L | EG-63 |
| E2 | Spec 59 **A1–A2** part fingerprint, `programStatus` (`current / stale / unknown`), stale badge | — (A1 may start before E1) | class table test; legacy programs `unknown` | S | EG-60 |
| E3 | **Face refs in operations** (features and limits name faces, not coordinates); per-face allowance and tolerance | E1 | edit an upstream dimension: the same operation re-targets the same face | L | EG-23, 14 |
| E4 | Spec 59 **A3–A5** regenerate, diff, operation matching | E2, E3 | unchanged project regenerates identical NC bytes; changed dimension gives a diff naming operations | M | EG-60 |
| E5 | **Operation cache / incremental regeneration** per operation by input digest | E4 | edit one pocket: only its operations rerun (counter in the test) | M | EG-64 |
| E6 | Owner decisions D9 (regeneration policy), D12 (legacy generator programs) answered (2026-10-29: D9 `ask`, D12 legacy programs stay read-only with status `unknown`, **no conversion or retirement**; an explicit "regenerate with the kernel" action may follow, see spec 70 §6), then the remaining work of this step is that action | D9, D12 | one structure: every program has an artifact | M | EG-62 |

### Phase F — Strategies (lane M; each on the stock of Phase B)

| Step | Work | Depends | Gate | Size | EG |
|---|---|---|---|---|---|
| F1 | **Mesh drop-cutter** (triangle BVH) for finishing instead of the sampled height field; undercut-safe contact | B1 | cusp/contact error ≤ declared bound on sphere, cone, fillet fixtures; height-field results unchanged where no undercut | L | EG-21, 20 |
| F2 | **Undercut and multi-orientation roughing** with the T-slot / lollipop cutters; planner picks orientations (`planSetups`) | F1, D1, C4 | undercut fixture fully cleared, no gouge | L | EG-20 (51 F5) |
| F3 | **3D finishing breadth**: flowline, morph between curves, projection, isoparametric, equidistant on boundary, bi-tangent pencil, 3D engraving by projection, 3D edge deburring | F1, C7 | pencil leaves ≤ allowance in internal corners; no gouge on each strategy | L | EG-22 |
| F4 | **Tool-axis strategies**: by point / line / curve / surface, auto-tilt for the shortest tool, lead/tilt limits | — | tool-axis rule satisfied at every sample; table within limits | L | EG-40 (51 F1–F2) |
| F5 | **Collision-aware generation**: tilt away or skip with a reported reason, using assembly, part, fixtures; axis smoothing | F4, A3, C3 | fixture with a wall next to the surface: path generated without collision where F4 alone collides | L | EG-41 (51 F3) |
| F6 | **Head machines** in `execute.ts` (head-table, head-head), unwired `head.ts` | F5 | head-B job emits TCP words and passes the IK gate | L | EG-42 (51 F7) |
| F7 | **4-axis strategies** and rotary policy: wrap, indexed, unwinding, pole bypass, joint-limit avoidance, inverse-time feed (`G93`) | F6, B6 | rotary-wrap fixture within tolerance; no pole flip; feed words per control | M | EG-43 |
| F8 | **5-axis roughing, Z-level, profiling of tilted walls, 5-axis drilling, 3+2 operations in tilted workplanes** | F5, C1 | each operation passes B2 on its fixture | L | EG-40, 33 |
| F9 | **2.5D breadth**: trochoidal / dynamic slot, peel, plunge roughing, high-feed, corner rest, open-pocket entry rules, thin-wall strategy | A5 | engagement bounded in the replay; time lower than the contour pocket on the fixture | M | EG-25, 32 |
| F10 | **Hole-making breadth**: back boring, counterbore and countersink cycles, gun/deep drilling, helical hole milling variants, hole-pattern optimisation | F8 | each cycle replays through the interpreter with the right depth | M | EG-33 |
| F11 | **Global linking and ordering** (2-opt + or-opt, minimal retracts, stay-down, arc/spiral links) | — | non-cut time −15 % on the fixture set (target), safety claims unchanged | M | EG-33 (54 Q1) |
| F12 | **Feature recognition breadth** (slots, steps, grooves, chamfer bands, bosses with threads, fillet bands) and **rule-based planner**; the annotated corpus (G1) is its gate | E3, G1 | recall ≥ 95 % on the 40-part set (target), 0 wrong-depth | L | EG-34, 35 |

### Phase G — Process physics, time and output

| Step | Work | Depends | Gate | Size | EG |
|---|---|---|---|---|---|
| G0 | Spec 61 **Z2 → Z1**: factored Kienzle chain, per-move engagement (3-axis first) | B1 | `cuttingData` unchanged on all tests; analytic engagement cases within bound | M | EG-45 |
| G0b | Spec 61 **Z3**: feed optimisation per move, `cutting-data` claim per move; `off` byte-identical | G0 | no move over a limit | L | EG-45 |
| G0c | Spec 61 **Z4–Z6**: stability (chatter lobes), tool-life model, calibration record (D11) | G0b | uncalibrated stays labelled | L | EG-45 |
| G1 | **CAM reference set** with annotated features (lane E; also the gate of F12, B3) | — | ≥ 30 entries with licences | M | EG-80 |
| G2 | **Cycle-time model** with acceleration, jerk, look-ahead per machine | — | estimate vs. interpreter-timed program within the declared error on 5 fixtures | M | EG-73 |
| G3 | **Spline output** (`G5`, `G5.1`, `G6.2`) with a spline `Move` in the IR; fitted within the chordal tolerance | — | chordal error ≤ tolerance; NC smaller than line segments | M | EG-72 |
| G4 | **Variables, macros and control flow in the IR and in every post** (state 2026-10-29: IR nodes `Assign`, `MacroCall`, `If/Else/EndIf`, `While/EndWhile`, `Message` and word expressions in `cam/macro.ts`; posts and interpreter in progress) (owner request 2026-10-29): `Variable` assignment and expressions, `Macro` call/definition, `If/Else/EndIf`, `While/EndWhile`, and jumps with labels (`Label`, `Goto` with or without a condition, forward / backward: Fanuc `GOTO n` / `IF [..] GOTO n`, Siemens `GOTOF` / `GOTOB` / `GOTO` / `GOTOC`, Klartext `FN 9-12 .. GOTO LBL n`, Okuma `IF [..] Nn`), system variables, tool change (`ToolChange`), probe, comments/messages. One IR vocabulary; per post the native words: Fanuc/Haas macro B (`#100=…`, `IF [..] GOTO`, `WHILE [..] DO1`, `G65 P..`, `M98/M99`), Siemens (`R` parameters, `DEF REAL`, `IF/ELSE/ENDIF`, `WHILE/ENDWHILE`, `CALL`/`CYCLE`, `GOTOF`), Heidenhain Klartext (`Q` parameters, `FN0-FN18`, `FN9 IF…GOTO`, `CALL LBL`, `CALL PGM`), Okuma OSP (`V` variables, `VC`, `IF/GOTO`, `CALL O`), Mazak EIA (`#` macro, `G65`), LinuxCNC (`#<name>`, `o100 if/while/sub/call`), GRBL (none: refused with the reason); interpreter evaluates all of them | G3 | per dialect: golden NC with variables, a loop and a macro call; the interpreter replays each golden and gets the same toolpath as the unrolled program; GRBL refuses a variable with its reason | L | EG-08 |
| G4c | (state 2026-10-29: **G4c.1 built for drilling**: IR drilling moves are cycles 200, 201, 202, 205 and 207 in Klartext, defined once and called with `M99`, replayed as the ISO cycle they equal (`post/klartext-cycles.ts`, `testing/heidenhain.ts`, `test/cam/klartext-cycles.test.ts`); inch programs keep the expansion; **G4c.2 built for bore milling**: cycle 208, the kernel's `bore` operation marked with `CycleBegin`/`CycleEnd` around the helical path of `operations/bore-mill.ts` when `nativeCycles` is set on a Heidenhain machine (API, sidecar and assistant field `nativeCycles`; no desktop switch yet), `kernel/native-bore.test.ts`; marker design: every other consumer sees the expansion, only the cycle's own post writes the cycle; **thread milling built too**: the kernel's `thread` operation is cycle 262 (inside) or 267 (outside) with one full-depth helix (`operations/thread-mill.ts`, `kernel/native-thread.test.ts`; the kernel's multi-pass thread moves keep their own path and, on a small plate, an NC-replay extent mismatch of 0.29 mm to look at); cycles 203, 204, 206, 209, 240, 241, 263-265, pockets / studs / slots 251-257, contour and OCM, patterns, transformations, `PLANE`, probing and every other post's cycles are open) **Every post has its own macros and fixed cycles, Heidenhain first** (owner request 2026-10-29: "molto importante che abbia tutte le sue macro e i suoi cicli fissi"). Heidenhain TNC 640 / iTNC 530 Klartext: Q/QL/QR/QS parameters and every `FN` (0-3 arithmetic, 4 divide, 5 root, 6 sin, 7 cos, 8 hypot, 9-12 compare-and-jump, 13 atan, 14 error, 15 print, 16 formatted print, 18 system data, 19 input, 20 wait, 25 preset, 26-29 table access, 37 export), `LBL`/`CALL LBL`/`CALL PGM`/`CYCL CALL`/`STOP`, `TOOL DEF`/`TOOL CALL`/`TOOL CALL` with `DL/DR`, and the fixed cycles: drilling and tapping (200 drilling, 201 reaming, 202 boring, 203 universal drilling, 204 back boring, 205 universal pecking, 206/207 tapping with/without compensating chuck, 208 bore milling, 209 tapping with chip breaking, 240 centring, 241 single-lip deep-hole), thread milling (262-267), pockets / studs / slots (251 rectangular pocket, 252 circular pocket, 253 slot, 254 circular slot, 256 rectangular stud, 257 circular stud, 255 irregular, 270 contour train data, 271 OCM contour data, 272 OCM roughing, 273/274 OCM finishing), contour (14 contour geometry, 20 contour data, 21-24 pilot drilling / roughing / floor / side finish), face milling (232), 230/231 multipass, 233, pattern cycles (220 polar, 221 cartesian), coordinate transforms (7 datum, 8 mirror, 10 rotation, 11 scaling, 19 working plane, 247 preset, 26 axis scaling), `PLANE SPATIAL/PROJECTED/EULER/VECTOR/POINTS/RELATIVE` with `STAY/MOVE/TURN`, `M128/M129/M126/M127`, probing (`TCH PROBE` 0-3, 400-499 incl. 408-419, 420-431 measuring, 480-483 TT) and `CYCL DEF 32` tolerance; **for each of the other posts the same**: Fanuc/Haas canned cycles G73-G89 with their macro-B probing (G65 P9810-9834 Renishaw / Haas `G65 P9810`), Haas `G187`/`G47`, Siemens `CYCLE81-89`, `CYCLE83` deep, `CYCLE84/840` tapping, `POCKET3/4`, `CYCLE72/76/77/78/79`, `CYCLE800`, `CYCLE832`, `CYCLE930`+, measuring `CYCLE971/977/978/979`; Okuma OSP cycles (`G71-G76` lathe, `G81-G89`, `VCCP`), Mazak EIA cycles, LinuxCNC `G81-G89`/`G76`/`G33.1`/`G38.x` with o-words; IR `FixedCycle { family, number, params }` so a post writes its native cycle or refuses with the reason; the interpreter replays each cycle into the same toolpath as its expansion | G4 | per cycle: golden NC from the IR, the interpreter replays it and removes the same volume as the expanded program (within the cell), and a parameter outside the cycle's documented range is refused with its name; the Heidenhain set is complete when every cycle above has a golden and a replay test | L (several sessions, one family per step: G4c.1 drilling/tapping, .2 pockets/studs/slots, .3 contour/OCM, .4 patterns/transforms/PLANE, .5 probing, .6 other posts) | EG-70 |
| G4b | **Visualizer reads tool changes and multi-tool operations** (owner request 2026-10-29): the viewer timeline marks every `T`/`M6` (and Heidenhain `TOOL CALL`, Siemens `T=`/`M6`), shows the tool in use, its number and name, tool-change stops in the scrubber, and an operation that uses more than one tool is one operation with tool segments (not several unrelated toolpaths); same for programs imported from NC | G4 | a program with 3 tools and an operation split over 2 tools: the timeline lists 3 tool changes, the operation shows 2 segments with their tools; machine view loads the right tool at each change | M | EG-08 |
| G5 | **Probing in the kernel**: setting cycles (corner, bore, boss, plane), tool setting, offset update, in-process measurement per control | G4 | cycle output per post golden; interpreter handles the macro variables | M | EG-53 |
| G6 | **Posts**: Siemens `CYCLE800` + ShopMill cycles, Heidenhain `PLANE SPATIAL` / `CYCL DEF 19`, Mitsubishi M8x, Brother, Mori/DMG, Fanuc macro-B; **post tester CLI**; definition fields (word formats, line numbers, modal rules) and Klartext via definitions | G4 | per dialect: golden NC for drilling, pocket, arc, tool change, rotary 3+2; the interpreter replays it | M each | EG-70, 71 |
| G7 | **NC import** (foreign G-code → `Program`) for re-verification | G4 | imported program replays and verifies | M | EG-75 |
| G8 | **Documentation**: setup-sheet PDF, toolpath thumbnails, templates, tool presetter list, inspection plan | D3 | document numbers equal the artifact | S | EG-74 |

### Phase H — Templates and automation (lane I)

| Step | Work | Depends | Gate | Size | EG |
|---|---|---|---|---|---|
| H1 | Spec 60 **P1, P3, P2** template format, application with trace, tool selection (D10 storage default: library item) | F12 | dry run lists matched rules, unmatched features, no-tool reasons | M | EG-61 |
| H2 | Spec 60 **P4–P5, P7** job lists, capture from an existing program, batch regeneration | H1, E4 | batch run over 5 parts, all verified or reported | M | EG-61 |
| H3 | Kernel **extension seam** (custom strategy / check / post step through the plugin SDK, sandboxed) | H1 | a plugin strategy runs through the same claims as a built-in | M | EG-65 |

### Phase I — Turning and mill-turn (lane M, own spec 52)

| Step | Work | Depends | Gate | Size | EG |
|---|---|---|---|---|---|
| I1 | **Turning job in the kernel**: insert geometry and nose-radius compensation, OD/ID roughing and finishing, grooving, parting, threading cycles, turned-stock replay, lathe release path (the milling refusal at `execute.ts:146` stays for mills) | B1 | volume of a turned profile within a declared bound; lathe `G70–G76` replay | L | EG-50 |
| I2 | **Mill-turn**: C-axis milling, Y axis, polar/cylindrical interpolation, B-head, live tools, sub-spindle transfer, multi-turret sync, balanced turning | I1, C1 | transfer program replays with the carried stock | L | EG-50, 51 |
| I3 | Presets of Mazak INTEGREX and Okuma MULTUS produce programs end to end | I2 | golden per control | M | EG-51 |

### Phase J — Qualification and scale (lane E)

| Step | Work | Depends | Gate | Size | EG |
|---|---|---|---|---|---|
| J1 | Spec 55 **E4–E5**: public STEP/IGES set and the annotated CAM reference set (= G1) | — | ≥ 30 entries with licences | M | EG-80 |
| J2 | Bench cases: CAM plan, interference, drawing; **nightly corpus / bench job** in `.github/workflows` | — | CI fails on `wrong` and on > 20 % budget regression | S | EG-81 |
| J3 | **Scale fixtures** (500+ operations, 10⁷-cell stock, large mesh) with memory and time budgets | A5, B1 | within budget or degraded with a declared bound | M | EG-82 |
| J4 | **Qualification schema and partner** (D7): controller-accepted NC, cutting test, record per machine | owner D7 | a record exists; level 4 possible for rows it covers | L | EG-09 |

### Horizon (owner decisions first)

D4 specialist 5-axis packages (impeller/blisk, port, barrel, tube) · D5 wire EDM, laser/plasma/waterjet, nesting, dispensing, metal additive ·
CL/APT and STEP-NC (EG-76) · DNC/MTConnect/OPC UA (EG-77, app level) · native compute for drop-cutter, tri-dexel and replay (EG-83, blocked on bench numbers).

## 3. Order of execution

```
A1 A2 A3 A4 A5          (parallel, no dependency)
        │
        └─► B1 ─► B2 ─► B3, B4        C1 ─► C2 ─► C3 ─► C4, C5
                 │                         │
                 └──────────────► B5, B6   C6, C7        D1 D2 D3 D4 (parallel to B and C)
E1 ─► E3 ─► E4 ─► E5            F1 (after B1) ─► F2, F3     F4 ─► F5 ─► F6 ─► F7, F8
G0 ─► G0b ─► G0c                G1/J1 early (feeds B3, F12)  I1 after B1 ─► I2 ─► I3
```

Critical path to the first **credible enterprise claim** (5-axis multi-side part, verified, with fixtures): A3 → A4 → B1 → B2 → C1 → C2 → C3 → C4 → C5 → F4 → F5 (≈ 11 steps).
Critical path to **associativity**: E1 → E3 → E4 → E5 (spec 41 is the long pole).

Lanes (spec 62 §2) and what may run in parallel without touching the same directory: lane M (A, B, C, F, I), lane I (E2–E6, G0*, H), lane T (E1), lane E (B3, G1/J), lane N untouched.
`kernel/execute.ts` is shared by M and I: I only adds fields and claim bases, M changes the pipeline; the second to land runs `kernel.test`.

## 4. Owner decisions that gate steps

| Decision | Steps | If unanswered |
|---|---|---|
| D4 specialist 5-axis | Horizon | not started |
| D5 other processes | Horizon | not started |
| D7 qualification partner | J4 and every release level above `verified-model` | no level 4 |
| D9 regeneration policy | E4–E6 | `ask` |
| D10 template storage | H1 | library item |
| D11 calibration data | G0c | everything `uncalibrated` |
| D12 legacy generator programs | E6 | keep read-only, status `unknown` |
| WP0 columns for Taylor / tool life | D4, G0c | values travel in the request only |
| (new) D13 default stock for scans (mesh) | C2 | box from mesh bounds, `part-model` term labelled |
| (new) D14 fixture library source (user files vs. built-in vise set) | C3 | user-supplied bodies only, nothing bundled |

## 5. Milestones (what may be said when)

| Milestone | Steps done | Allowed statement |
|---|---|---|
| M1 trust | A1–A5, B1–B4 | "5-axis programs can reach `verified-program` on the corpus fixtures, with bounds" |
| M2 multi-side | C1–C5, D1–D2 | "A multi-setup part with fixtures verifies end to end" |
| M3 strategies | F1–F8 | "Undercuts and collision-aware 5-axis finishing are generated and verified" |
| M4 associative | E1–E5, H1–H2 | "A model change regenerates a program with a diff" |
| M5 breadth | F9–F12, G, I | "Turning, mill-turn, probing and 8 dialects are covered with goldens" |
| M6 qualified | J1–J4 | only the rows the qualification record covers |

Each milestone sentence is allowed only if the scorecard rows named by its steps are at the level that sentence needs (3 for "verified", 4 for "qualified").

## 6. Change log

- 2026-10-29: created from spec 68. Rows added to `parity.json` as `open` (level 0) for the new capabilities.
- 2026-10-29: cross-lane order and adapter windows moved to spec 70; E6 narrowed by the owner's D12 decision.
