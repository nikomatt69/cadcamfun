# 46 — Assemblies: components, loops, in-context design, configurations, scale

Status: specified 2026-10-24 (not built). Part of [spec 39](39-professional-parity-master-plan.md). Closes C11 of
[spec 33](33-kernel-gap-analysis.md). Owner: WP1 (`cad/{kinematics,assembly-analysis,smart-fasteners}.ts`, new
`cad/assembly/`); adapters WP3/WP4, desktop `features/cad` assembly panel (WP6).

## 1. Where it stands (verified)

- `kinematics.ts`: `KinematicModel` of parts and joints (fixed, revolute, prismatic, cylindrical, ball, planar), gear / rack
  couplings, limit violations, `solvePose` (a tree of joints driven by `drivers`), `motionStudy` with contact states.
- `assembly-analysis.ts`: exact interference (`assemblyInterference`), clearance (`assemblyClearance`), BOM; smart fasteners
  (ISO 273 / 4762 / 7089 / 4032) and joints inferred from holes; desktop `AssemblyAutomation.tsx`.
- History has one rigid `mate` per body (from exact faces); STEP carries assemblies through `MAPPED_ITEM` and
  `ITEM_DEFINED_TRANSFORMATION`.
- Absent: part definitions vs occurrences, closed kinematic loops, mates as constraints between arbitrary faces / edges /
  points, in-context references, configurations / design tables, exploded views, lightweight loading, assembly-level features.

## 2. Work items

| ID | Item | Gate |
|---|---|---|
| A1 | **Definition / occurrence model.** `PartDefinition` (history + exact body + properties) and `Occurrence { definition, transform, suppressed, visible, overrides }`; sub-assemblies nest; editing a definition updates all occurrences; "make independent" copies. The existing scene element list maps to occurrences without data loss (`migrate.ts`). | an assembly of 3 occurrences of one bolt: one definition stored; edit the definition → all update; old projects migrate to identical geometry |
| A2 | **Mates as constraints.** Mate kinds: coincident, concentric, parallel, perpendicular, tangent, distance, angle, lock, plus the joint kinds above; operands are refs (spec 41) to faces / edges / points / axes; a solver finds occurrence transforms from the constraints (Newton / LM on the rigid-body DOF, reuse of the sketch LM machinery, DOF count per occurrence, conflicting-mate diagnostics as in spec 45 K6). | 20 canonical mate combinations: residual ≤ 1e-9; pin-in-hole with concentric + coincident leaves one rotation DOF |
| A3 | **Closed loops.** Four-bar, slider-crank, rack-and-pinion, belt / chain (as a coupling): joint loops solved as a system; Grübler DOF check; singular configurations reported; a `drive` parameter animates the loop. The harness target (rack-and-pinion gripper) must pass. | four-bar with analytic transmission angle: output angle within 1e-6 rad over 360°; slider-crank position within 1e-9 mm; the gripper assembly builds and moves without interference through its range |
| A4 | **In-context design.** A feature of one part references geometry (refs) of another occurrence in the assembly; the reference is stored as (occurrence path, ref); out-of-context warnings when a referenced definition changes incompatibly (spec 41 resolution outcomes). | hole in part B positioned from a face of part A follows when A is resized; deleting A's face gives a `deleted` error on B's feature |
| A5 | **Configurations and design tables.** A configuration = named set of parameter values, feature suppression flags, occurrence visibility / suppression, mate overrides; a design table (CSV / grid) generates configurations; the BOM and drawings read the active configuration. The product configurator (specified in the project notes) uses the same structure. | 12-row table → 12 configurations that rebuild; each reports its mass; switch between them is deterministic |
| A6 | **Exploded views.** Explode steps (translate / rotate selected occurrences along axes) with trails, saved per configuration; animation as keyframes for the drawing (spec 49) and the viewport. | explode / collapse returns every occurrence to its pose to 1e-12 |
| A7 | **Large-assembly handling.** Lazy load: occurrences load their tessellation first and their exact B-rep on demand; level of detail; a shared BVH of occurrence bounds for interference screening (exact check only on candidate pairs); worker offload for interference; assembly-level mass properties by summing definitions (not by re-tessellating). | 500 occurrences (50 definitions) open to a first frame in ≤ 3 s and interference screening in ≤ 10 s (targets, reference machine; measured by the benchmark suite of spec 55) |
| A8 | **Assembly features** (cuts across components, patterns of components along a sketch or a face, mirror components), **mass properties with materials** (density library), centre of gravity, inertia tensor. | cut through two parts leaves each part cut; inertia of a box and a cylinder equals the closed-form tensor to 1e-9 |
| A9 | **Motion study with contact and driving laws** (motor profile, spring / damper, gravity) on top of `motionStudy`; export of the swept envelope. | pendulum period within 1 % of 2π√(L/g) for small angles at a 1 ms step (target) |
| A10 | **Interference policy** per pair (ignore fasteners, allow press-fit tolerance), with the result in the BOM and as a CI-friendly report. | press-fit pair within tolerance is not reported; beyond it is |

## 3. Interfaces

New module `cad/assembly/` holds A1, A2, A4, A5, A6; `kinematics.ts` stays the joint-tree solver and is generalised by A3
(`solveAssembly` calls it for tree parts and the constraint solver for loops). API: `packages/api` assembly group with
configuration list / activate; AI: `cad_assembly` actions (parameter names only); desktop assembly panel.

## 4. Honest limits

- The solver finds *a* solution near the previous pose (continuation); multiple assembly modes are reported, not enumerated.
- Contact dynamics beyond rigid bodies with simple friction are out of scope; FEA coupling is spec 48.

## 5. Order

A1 → A2 → A3 (the gripper target) → A5 → A4 → A6 → A7 → A8 → A9 → A10.
