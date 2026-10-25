# 48 — Simulation: linear static FEA, then modal and thermal

Status: specified 2026-10-24 (not built). Part of [spec 39](39-professional-parity-master-plan.md). New capability; no code
exists today (no FEA, stress or mesh-solver module in `packages/core`). Owner: new directory `packages/core/src/sim-fea/` (a
WP1 sibling; register it in [spec 00](00-overview.md) when started), adapters WP3/WP4/WP6/WP8. Depends on
[41](41-persistent-topological-naming.md) (loads and supports are named faces) and [40](40-single-exact-brep-truth.md).

Verified state of every item (2026-10-25): see [spec 57](57-parity-ledger-2026-10-25.md); it supersedes the status line above.

## 1. Scope and target

First product: **linear static stress** of a single part or a bonded assembly, with results a designer can trust for
screening: displacement, von Mises stress, principal stresses, reaction forces, safety factor. Then modal (natural
frequencies), then steady-state thermal. This is what Fusion's "Simulation" and SolidWorks Simulation Standard do at entry
level. Nonlinear, contact, dynamics, fatigue, CFD and topology optimisation are out of scope (§7).

## 2. Pipeline (each stage a pure function, tested alone)

1. **Study definition** (`Study`): body refs, material (E, ν, ρ, σy from the material library, `cam/kernel/materials.ts` has CAM
   grades; add an engineering library with the same ids), constraints (fixed, pin, roller, symmetry, prescribed displacement)
   and loads (force, pressure, torque, gravity, bearing, remote force) on **refs** (spec 41), units in SI-mm (N, MPa).
2. **Volume mesh** (`mesh-volume.ts`): tetrahedra from the B-rep surface tessellation: surface mesh (existing `tessellate.ts`
   with a size field) → constrained Delaunay / advancing-front volume meshing with quality control; element size by global
   size + curvature + local refinement at supports / loads; **quadratic tetrahedra (10-node)** as the default; mesh quality
   report (min Jacobian, aspect ratio, dihedral angles). Failure is a typed refusal with the offending faces.
3. **Assembly of K** (`assemble.ts`): isoparametric 10-node tetrahedron, 4-point Gauss quadrature, sparse symmetric matrix in
   CSR; bonded contact between touching occurrences by node merge or tied constraints.
4. **Solve** (`solve.ts`): sparse Cholesky (AMD ordering) for ≤ 300 k DOF, preconditioned CG (Jacobi / IC(0)) above; constraints
   by elimination; runs in a worker (the sidecar's thread must not block): `withBudget`-style cancellation checks and progress
   events (`study.progress` like `cam.progress`).
5. **Results** (`results.ts`): nodal displacement, stress recovery (superconvergent patch recovery, SPR), von Mises, principal,
   reactions, safety factor = σy / σvm, field arrays for the viewport (no rendering in core); probe at a point / along a path.
6. **Convergence tools**: h-refinement loop (`converge`): refine where the stress-recovery error indicator is largest; report
   the change of the max stress between meshes.

Modal: generalised eigenproblem K x = ω² M x (consistent mass), Lanczos / LOBPCG for the lowest n modes. Thermal: steady
conduction with convection / flux / temperature loads, then thermal stress as a static load.

## 3. Work items and gates (verification against closed-form solutions)

| ID | Item | Gate |
|---|---|---|
| F1 | Element + assembly + solver on a **patch test** (constant strain field reproduced exactly) and eigenvalue count of one element (6 zero rigid-body modes) | patch test error ≤ 1e-9 relative |
| F2 | Cantilever beam, end load: tip deflection against Euler–Bernoulli with shear correction | ≤ 2 % with the default mesh (target) |
| F3 | Plate with a central hole in tension: peak stress / nominal vs. the stress-concentration factor of the finite-width plate (Peterson chart value) | within 5 % at default mesh, within 2 % after one `converge` refinement (target) |
| F4 | Thick-walled pressurised cylinder against Lamé's equations (radial and hoop stress) | ≤ 2 % |
| F5 | Simply-supported beam / first bending frequencies and a free cube (6 rigid-body modes ≈ 0) | first bending frequency within 2 % of Euler–Bernoulli |
| F6 | Volume mesher on the exact fixtures of the kernel suites (recipes, STEP imports): all valid, quality thresholds met or refused | 100 % of the `recipes.ts` parts meshed with min Jacobian > 0 |
| F7 | Study persistence in the project (new `Study` entity in `packages/db` via a migration, owned by WP0) and ref resolution on rebuild: a changed dimension re-meshes and re-solves; broken refs are reported | rebuild after an upstream edit keeps loads on the same faces |
| F8 | API / AI / desktop: study CRUD, run with progress and cancel, result fields to the viewport (colour ramps from `cam/sim/deviation-colors.ts` style), report export (HTML / PDF) | sidecar test: run F2 end to end and cancel a long run within 1 s |
| F9 | Thermal steady-state; thermal stress | 1D slab and Lamé thermal cases within 2 % |

## 4. Performance targets (reference machine; measured by spec 55)

50 k-DOF static study in < 10 s; 300 k-DOF in < 90 s (Cholesky) in a worker, UI responsive; memory bound declared in the study
result.

## 5. Decisions for the owner

D3 (spec 39): TypeScript solver (default) or a WASM build of a sparse direct solver. A native dependency is not added without
recording it here. Mesh generation in TypeScript is the larger risk; the first milestone (F1–F4) uses a structured/graded
tetrahedralisation of simple shapes before the general mesher (F6).

## 6. Honest limits

- Results are screening-grade until the verification suite passes on the shipped build; every result report states mesh size,
  element order, and the convergence indicator.
- Singularities (sharp re-entrant corners, point loads) produce unbounded stress; the report flags the max-stress node as a
  possible singularity when the value keeps growing under refinement.

## 7. Non-goals

Nonlinear materials and geometry, contact with friction, dynamics, fatigue, buckling (until the modal infrastructure is proven),
CFD, electromagnetics, topology / generative optimisation.
