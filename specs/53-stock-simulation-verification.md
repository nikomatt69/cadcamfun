# 53 — Stock, simulation and verification evidence with physical bounds

Status: specified 2026-10-24 (not built). Part of [spec 39](39-professional-parity-master-plan.md). Closes K5, M4 and the
remainder of M9 of [spec 33](33-kernel-gap-analysis.md); complements [spec 32](32-machine-simulation-parity.md) (the simulator,
owned by the collaborating session) and [spec 29](29-native-cam-kernel.md) (claims and release levels). Owner: WP2
(`cam/{model,sim,verify,kernel}`). **Spec 32 stays the authority on simulator internals; this spec fixes the evidence
semantics both rely on.**

Verified state of every item (2026-10-25): see [spec 57](57-parity-ledger-2026-10-25.md); it supersedes the status line above.

## 1. Where it stands (verified)

- `cam/model/dexel.ts`: **Z-dexel** model (columns of material intervals over an XY grid, exact interval Booleans per column,
  top = visible surface for 3-axis); `heightfield.ts` in `cam/verify`; `cam/sim/{stock-sim,voxel-sim,cutters,simulation}.ts`;
  `kernel/stock.ts`: voxel stock with a sure / possible removal bracket, 3-axis tip paths; `carryHeightField` seeds a rotary
  replay from the 3-axis stock (K5 first seed).
- Verification: height-field replay, gouge against part meshes, rapid-in-stock, holder / shank, below-stock, machine table
  clearance on linear / arc moves, travel limits. The kernel is certified by *claims* (`no-gouge`, `material-removed`,
  `part-coverage`, `machine-clearance`, `machine-limits`) with `pass / fail / unresolved`.
- The tolerance budget in the public contract is **informational**: its value is not a measured physical error. Five-axis moves
  are not written into the carried stock field; `no-gouge` is `unresolved` for turned moves and `material-removed` is not passed
  for the bracket.

## 2. Principle

A claim is `pass` only when a **bound** on the error exists, is computed, and is smaller than the declared tolerance. Otherwise
it is `unresolved` with the bound reported. No claim is promoted by repeating a strategy name or a test that merely ran.

## 3. Work items

| ID | Item | Gate |
|---|---|---|
| V1 | **Tri-dexel stock** (X, Y, Z dexel grids) for 3-, 4- and 5-axis removal, with the error bound = ½ cell diagonal (declared and returned); tool sweep of a cutter (flat, ball, bull, tapered, barrel) along a linear / arc / rotary move as a set of swept volumes (exact for the profile of revolution by stepping poses within `stepsForTolerance`); parallel/worker-friendly tiling; memory ceiling declared. The Z-dexel remains the 3-axis fast path. | tilted pocket (30° tool axis): removed volume equals the analytic volume within (cell bound × surface area); cutting a sphere with a ball tool leaves a surface within one cell of the exact sphere |
| V2 | **Final-NC proof.** The independent verifier parses the *generated NC bytes* (the interpreter of spec 32 P1/P2), applies controller modes (offsets, tool length, cycles, units, arc planes, TCP), simulates it with V1 and compares the result to the part B-rep: **gouge** (stock inside the part by more than tol), **residual** (material left above the allowance), **uncut** regions, with the numeric extremes and positions. Claims `no-gouge`, `material-removed`, `stock-allowance` are `pass` only when the extremes plus the V1 bound are inside the tolerance. | fixtures with injected faults: 100 seeded 0.05 mm overcuts (≥ 0.05 mm + bound) are all detected, and 0 false positives on the 30 clean fixtures |
| V3 | **Kinematic replay**: inverse kinematics from machine axes to tool tip / axis for trunnion, head-table, head-head and mill-turn, with limit checks and TCP modes; used to check the NC against the planned contacts. | tip error ≤ 0.005 mm over a 5-axis fixture in both TCP and non-TCP output |
| V4 | **Machine simulation completeness** (with spec 32 owner): bodies from the preset (spindle, head, column, table, trunnion, chuck, tailstock, fixture, vise), body-vs-body collision with the swept cutter and holder, rapid / feed classification, tool-change positions, probing cycles; collision report as claim `machine-collision` with `pass` only when every body pair is checked for every move. | seeded collision fixtures found; clean fixtures pass |
| V5 | **Physical tolerance budget.** The program evidence carries an error budget: tessellation of the part (spec 40 U6), dexel cell, interpolation / kinematic error (`stepsForTolerance`), arc fitting (`cam/arc-fit.ts` tolerance), numerical post precision (decimals); the sum is the declared bound used by V2. Changing the *public contract* semantics of the existing informational budget goes through spec 29 and the API first. | evidence JSON lists each term; the claim thresholds use the sum |
| V6 | **Stock between operations and setups.** Stock after operation A is the input of B (rest from the actual stock, not only a previous tool diameter); **setup transfer** declares a rigid transform (re-clamping, flip) between setups with the stock carried; sub-stock after probing cycles. | rest finishing after a flip removes exactly the stock the previous setup left (bounded) |
| V7 | **Deviation maps and measurements**: stock vs part colour map, cross-section, thickness, volume removed per tool; export as arrays for the viewport (extends `cam/sim/deviation-colors.ts`). | maps equal the exact distance within the bound on a sphere fixture |
| V8 | **Cycle-time estimate with machine dynamics**: acceleration / jerk limits, rapid traverse, tool change time, spindle ramps; blended corner look-ahead model per controller class. | estimate within a stated margin of a recorded real run when a measurement exists (see spec 55 §6), otherwise reported with `uncalibrated` |

## 4. Interfaces

`runJob` evidence keeps its structure; claims gain `bound` fields; `verifyNc(ncBytes, machine, part, stock, tolerance)` is the
single entry for V2; the sidecar `POST /api/toolpaths/verify` and the assistant `cam.verify` call it; the desktop Verify tab shows
the bound. Contract changes go through `packages/api` with the generated clients refreshed.

## 5. Honest limits

- Dexel / voxel models carry an error of one cell; reducing the cell is a cost / memory trade-off declared in the result.
- Verification proves the program against the *model* (part, stock, machine preset); it does not prove the machine's behaviour
  (controller look-ahead, servo lag, deflection). That is qualification (spec 55 §6).

## 6. Order

V1 → V2 → V5 → V3 → V6 → V4 → V7 → V8. V1/V2 unblock specs 51 (F5, F10) and 52 (M4).
