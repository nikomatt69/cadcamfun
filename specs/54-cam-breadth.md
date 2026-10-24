# 54 — CAM breadth: posts, feature recognition, tool library, linking, other processes

Status: specified 2026-10-24 (not built). Part of [spec 39](39-professional-parity-master-plan.md). Closes M6–M8 of
[spec 33](33-kernel-gap-analysis.md). Owner: WP2 (`cam/{post,operations,kernel,generator}`); adapters WP3/WP4/WP6/WP8. Depends
on [53](53-stock-simulation-verification.md) (proof) and [41](41-persistent-topological-naming.md) (feature face refs).

## 1. Where it stands (verified)

- Posts: `generic` (LinuxCNC), `fanuc`, `haas`, `grbl`, `heidenhain` (with `advanced/`), `siemens`; subprograms; a post is a
  function with options, not a user-editable definition.
- Feature planning from history or B-rep: hole recognition (`brep/features.ts` `recognizeHoles`), hole making in the kernel
  (drill, spot, peck, tap, ream, thread mill), stay-down links in adaptive clearing, `optimizedOrder` (2-opt over nearest
  neighbour) used by drill; pencil as rest finishing after a larger ball.
- Tools: cutters with assemblies (`kernel/{cutters,assembly}.ts`), materials ISO P/M/K/N/S/H with cutting data, power / torque /
  deflection limits (`cutting-data.ts`); fixed stick-out per cutter.
- Processes: milling, drilling, turning (legacy + preview), FDM printing (`cam/print`), probing (`generator/probe.ts`).
- Not present: other controller dialects, a post builder, pocket / boss / slot recognition, ISO 13399 tool data, setup sheets,
  wire EDM, laser / plasma / waterjet, nesting.

## 2. Work items

### 2.1 Posts

| ID | Item | Gate |
|---|---|---|
| C1 | **Post definition format.** A declarative post (TypeScript object / JSON validated by an Effect Schema): word formats, line numbering, modal rules, arcs (IJK vs R, plane), tool change, coolant codes, work offsets, canned-cycle map, spindle & feed modes, rotary conventions, TCP codes, program header/footer, comments & character set, decimal rules. Existing posts are re-expressed as definitions **with their goldens unchanged byte for byte**. | all existing golden NC files identical; a definition with an error yields a path-located message |
| C2 | **New controller dialects**: Mazak ISO/EIA (and Mazatrol export note), Okuma OSP, Mitsubishi M8x, Mori/DMG (Siemens/Fanuc variants), Siemens ShopMill/840D cycles (`CYCLE81…`), Fanuc with macro B probing, Brother, Tormach (LinuxCNC), Marlin/Klipper for printers (already in `cam/print`). Each dialect = a definition + golden fixtures + replay by the interpreter (spec 32 P1). | per dialect: golden NC for drilling, pocket, arc, tool change, rotary 3+2; the interpreter replays each golden and reproduces the toolpath bounds |
| C3 | **Post tester in the UI/CLI**: run a post on a standard test part set and diff against a user's expected output; report unsupported words. | CLI run on the set outputs a pass / diff table |

### 2.2 Feature recognition and planning

| ID | Item | Gate |
|---|---|---|
| R1 | **Machining feature recognition from the B-rep**: pockets (open / closed / through), slots, steps, bosses, islands, floors, side walls, chamfers, fillet bands, holes (exists), threads (cosmetic or modelled), grooves; built from the face adjacency graph (convexity of edges, parallelism to the machining axis, loops), with direction (setup axis) and depth; each feature lists face refs (spec 41). | 40-part fixture set (recipes + STEP corpus parts): ≥ 95 % of annotated features found (target), 0 wrong-depth results; unrecognised faces reported |
|  | **State (2026-10-24): islands built.** `brepFeatures` (`cam/brep-part.ts`) no longer refuses material standing inside a pocket: the pocket carries `islands` (nesting depth 2 of the slab sections; slabs merge only with equal loop and equal islands, so a low island splits a pocket in two); a pocket cut into an island is still refused. The planner roughs around them (adaptive / pocket regions), finishes their walls, limits the cutter to the narrowest gap (`corridorWidth`), and the profile operation takes an optional `within` region so lead-ins never swing into an island (found by the gouge claim: a 5 mm arc lead-in plunged into the island). `exact` analysis reports `machining.islands`. **Still open:** bosses/steps/slots/grooves/chamfer bands as named features, face refs (spec 41), a tolerance for recognising features on non-prismatic parts, the 40-part annotated corpus and its recall figure. | `bun test packages/core/src/cam/brep-part.test.ts packages/core/src/cad/scene-analysis.test.ts` |
| R2 | **Automatic operation planning from features**: per feature: operation sequence (rough, semi-finish, finish; drilling then boring; tapping), tool choice from the library (diameter ≤ corner radius, length ≥ depth with holder stick-out rule), cutting data from materials, order by tool & setup, and rest strategy. Replaces the hand-written planner branches by rules that cite their reasoning in the plan. | for 10 reference parts the plan has no warnings and the final verified program passes spec 53 V2 |
| R3 | **Minimum stick-out / holder-aware tool length** (M8): choose the shortest holder / extension such that depth + clearance is reached without collision, using the tool assembly bodies. | chosen stick-out = minimal that passes collision; deeper pockets raise it step by step |
| R4 | **Setup planning**: choose the work coordinate frames from feature directions (faces to machine from each side), minimise setups, fixture / vise clearance with the part envelope. Extends spec 34 (oriented setups). | a six-sided part gets ≥ 2 and ≤ 3 setups with all features reachable |
|  | **State (2026-10-24): the orientation half is built** — `cam/setup-plan.ts` `planSetups` (route `POST /api/cad/exact/setups`, assistant action `cad.setups`, desktop "Setup planner" in the kernel panel). It ray-casts every triangle of the exact tessellation along the six axes with the exact surface normal, finds the smallest orientation subset reaching the most face area (exhaustive over 63 subsets), assigns recognised holes to the setup that drills them, reports faces no three-axis setup reaches and holes that need 3+2 indexing, and asks `brepFeatures` per orientation. Tested against closed-form areas (`setup-plan.test.ts`). **Per-setup recognition (same day):** a hole drilled along another axis than the setup's is plugged (`editHole` fill, retried on three seam positions) before the 2.5D sections are cut, so the setup keeps its features and counts the others in `sideHoles` (a +Z program of a plate with a side hole went from a 1 382 s surface job to 10 feature operations in 151 s, checked in a real browser). **Not built:** the same plugging for *pockets, bosses and islands of the other sides* (the +X setup of a plate with a pocket on top is still a refused surface job, `blocked` by its claims), work coordinate frames from feature directions, fixture / vise clearance with the part envelope, tool-aware reach (a face seen but inside a slot narrower than every tool counts as reachable), 3+2 tilted setups. | `bun test packages/core/src/cam/setup-plan.test.ts apps/sidecar/test/cad-exact.test.ts apps/desktop/test/cam-setups.test.ts` |

### 2.3 Tool and cutting data

| ID | Item | Gate |
|---|---|---|
| L1 | **ISO 13399 import/export** (GTC, P21 / XML) for cutting tools, holders and assemblies; mapping of generic cutter parameters; vendor catalogue ingestion as a separate, user-supplied step (no vendor data bundled). | a sample 13399 file for an end mill imports to the kernel cutter with matching geometry; round trip keeps the fields |
| L2 | **Cutting-data library**: per material × tool × operation tables (feed per tooth, surface speed, ae/ap limits, chip thinning, tool life), user-editable and versioned in the project; the existing `cutting-data.ts` becomes the default table. | a change of the table changes the plan deterministically; limits (power, torque, deflection) remain checked |
| L3 | **Tool life, wear and tool management**: tool list with life counters, tool change optimisation by minimising changes (existing grouping) and magazine capacity (already a blocking claim), sister tools. | magazine limit blocks release (existing test) and the planner reorders to fit when possible |

### 2.4 Toolpath quality

| ID | Item | Gate |
|---|---|---|
| Q1 | **Linking and ordering** (M7): global ordering with TSP-style heuristics (2-opt + or-opt) across features, minimal-retract links at the lowest safe height, stay-down in 2.5D pockets (arcs and spirals between passes), helical / ramp entries chosen by geometry, lead-in/out. | cycle time (rapid + non-cut) reduced ≥ 15 % on the fixture set vs. the current order (target), while keeping safety checks |
| Q2 | **High-speed toolpaths**: trochoidal slot milling, corner slowing, peel/arc roll-in, constant-engagement finishing on parallel ops, smoothing of tangent discontinuities, **spline output** (`G5`, `G5.1`, `G6.2`) where the controller supports it, **arc fitting** tolerance (`arc-fit.ts` exists). | chordal error ≤ the declared tolerance; NC size reduced vs. line segments on the fixture set |
| Q3 | **Pencil, morph, flowline, projection finishing** as standalone strategies (pencil by bi-tangent curves; M6). | pencil leaves ≤ allowance in internal corners of a test part; no gouge |
| Q4 | **Probing in the process**: part set-up probing cycles (corner, bore, boss, plane), tool setting, in-process measurement with branching by macro variables, and update of work offsets (`generator/probe.ts` and `probing-origins.test.ts` exist); output per controller (Renishaw/Blum macros). | cycle output per post golden; the interpreter handles the macro variables |

### 2.5 Documentation

| ID | Item | Gate |
|---|---|---|
| H1 | **Setup sheets and shop documentation**: HTML/PDF: part & stock, WCS, tool list with thumbnails and stick-out, operation list with estimated times, thumbnails of toolpaths per operation, notes; template-based. | document generated from a job and matches the evidence (tool counts, times) |
|  | **State (2026-10-24): built for kernel programs.** `cam/kernel/setup-sheet.ts` (`setupSheetData` / `setupSheetHtml`): part and stock, work offset and zero, tools by number with stick-out, flute length, the operations that use each and their cutting time (inline SVG silhouette per tool), operations in program order with cutting data, time, cut length and removal, the evidence claims, notes, issues, identity digests; every value read from the artifact and escaped; a printer artifact is refused. `GET /api/toolpaths/:id/setup-sheet`, assistant `cam.setup_sheet`, "Setup sheet (HTML)" button in the kernel panel. Gate met on the numbers (tool count, operation list, cycle time and per-tool times equal the artifact; `setup-sheet.test.ts`, sidecar and desktop live tests). **Not built:** toolpath thumbnails per operation, PDF output, user templates, legacy-generator programs (no artifact). | `bun test packages/core/src/cam/kernel/setup-sheet.test.ts apps/sidecar/test/cam-kernel.test.ts apps/desktop/test/cam-setup-sheet.test.ts` |

## 3. Other processes (decision D5)

Wire EDM (2- and 4-axis with taper, skim cuts, tab/leave-slug), laser / plasma / waterjet 2D cutting (kerf compensation, lead-in /
lead-out, piercing, micro-joints, common-line cutting), true-shape 2D **nesting** with grain and sheet utilisation, dispensing.
Default order if approved: 2D laser/plasma + nesting first (reuses profile, leads, tabs from the milling kernel and the flat
patterns of spec 47 SM5). Each process gets its own spec once D5 is answered; no placeholder strategies are shipped
meanwhile.

## 4. Honest limits

- A post that passes golden + replay is verified against the *dialect description*, not a physical controller. Controller
  acceptance is spec 55 §6.
- Feature recognition is rule-based; free-form and mixed-feature regions are left to surface strategies and reported.

## 5. Order

C1 → R1 → R2 → C2 (one dialect at a time) → Q1 → R3 → L1/L2 → Q2 → Q3 → R4 → Q4 → H1 → L3 → C3.
