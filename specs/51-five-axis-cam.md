# 51 — Five-axis CAM: swarf, multi-axis roughing, automatic tilting, head machines, collision-aware generation

Status: specified 2026-10-24 (not built). Part of [spec 39](39-professional-parity-master-plan.md). Closes M5 and K4 of
[spec 33](33-kernel-gap-analysis.md). Owner: WP2 (`cam/{five-axis,indexing}.ts`, `cam/operations/multiaxis.ts`,
`cam/kernel/{head,kinematics,collision,motion,machine-clearance}.ts`, `cam/post/*`); adapters WP3/WP4/WP6/WP8. Depends on
[53](53-stock-simulation-verification.md) (stock and proof of the final NC).

## 1. Where it stands (verified)

- Indexed 3+2 (AC / BC trunnion) in `cam/indexing.ts` with an `Orient` move in the IR.
- Kernel `multiaxis` operation with `mode: "parallel" | "contour"` (K4 first increment): contact generation by vertical-ray
  search, retract-and-restart over unreachable intervals, `part-coverage` unresolved when required samples were unreachable.
- Modules **not yet in the release gate**: `kernel/collision.ts` (joint-move collision with certified clearance: holder as
  capsules, conservative), `kernel/motion.ts` (simultaneous five-axis plan: table poses via `planTable`, joint blocks from
  interpolation tolerance, collision per block), `kernel/head.ts` (head B and head AB kinematics, module only), `stock.ts`
  (voxel bracket). `machine-clearance` is in the gate for linear / arc moves; rotary moves are reported unsupported.
- Presets: trunnion A/C and B/C (BT40), KERN Micro HD HSK25/40 (B/C table, Heidenhain), Mazak INTEGREX i-200 and Okuma
  MULTUS B300II class mill-turns (`kernel/machines.ts`, `LATHES`).
- Posts: Fanuc, Haas, Heidenhain, Siemens, GRBL, generic. TCP words (`TRAORI`, `M128`, `G43.4`) are **not** produced by
  generation yet (confirm per post before claiming).

## 2. Work items

| ID | Item | Gate |
|---|---|---|
| F1 | **Contact generation on the B-rep.** Replace the vertical-ray contact search with closest-point / ray queries on the exact faces (and a tessellation BVH for speed), so surfaces hidden from above (undercuts, steep walls, turbine-like shapes) get contacts; each contact has the surface normal, curvature and the face ref (spec 41). | a part with a 70° undercut wall: coverage ≥ 99 % of the selected faces (target) against 38 % with the vertical ray on the same fixture (record both) |
| F2 | **Tool-axis strategies**: normal to surface, fixed lead/tilt (lead and side angles), tilt toward a point / away from a curve, interpolation between guide vectors, "tilt only where needed" (3-axis path tilted just enough to clear holder / avoid cutter centre at the tip), axis smoothing under a jerk / angular-rate limit, avoid singularity cones around the rotary poles. | angular velocity of the tool axis ≤ the machine limit over the whole path; lead/lag respected to 0.01° |
| F3 | **Collision-aware generation** (not only a release check): for each location the feasible orientation set = those free of holder/shank/spindle/table/fixture collision (`collision.ts`), the orientation path is chosen by dynamic programming over the feasible sets (cost = rotation change + deviation from preferred axis), links and retracts are planned in the feasible region; when infeasible the contour is split with a reason. | on the gate fixture set (deep pocket with holder risk, wall with fixture), generated programs pass `machine-clearance` for rotary moves too: 0 collisions in 100 % of fixtures |
| F4 | **Swarf (flank) milling**: detect ruled / developable faces (cone, cylinder, ruled NURBS, extrusion), compute the rail curves for the cutter axis (tilt to align the cylinder or cone flank to the surface along each ruling), apply to tapered cutters, enforce tolerance on both rails. | cone-wall part: flank deviation ≤ 0.01 mm over the swept height; gouge-free against the exact faces |
|  | **State (2026-10-24, F4 first slice): swarf of cone and cylinder walls built.** `cam/swarf-walls.ts` reads the rulings of a cone or cylinder face from the exact solid (`swarfWallOfFace`, `swarfWalls`, `swarfWallsNear` for a point on the wall; a trimmed wall, a pointed cone and any other surface are refused with the reason); `operations/swarf.ts` lays the cutter's axis along each ruling and moves it one radius off the wall along the normal, in bands up the wall as high as the flutes, with the C axis unwound (retract, rewind, resume) where it runs out of range; the cutter body, shrunk 0.02 mm, must be outside the part's material or the pose is left out and counted. Kernel: operation `{strategy: multiaxis, mode: swarf, near | walls}` (`contracts.ts`, `schema.ts`, `execute.ts`), the API and assistant take it through `OperationSpecSchema`. Test oracle: the signed distance of the cutter axis to the cone, closed form (`test/cam/swarf.test.ts`): flank gap 0 to 1e-6 mm at every pose, within 0.01 mm between poses, axis lean = wall angle, bands reach foot and top. Flat walls (vertical or leaning, convex, straight edges) are read too: rulings up the fall line at every vertex across the wall (`planarWall`), tested on a leaning side with the closed-form distance to the plane. **Not claimed:** NURBS ruled walls and concave flat faces, walls trimmed by other features, a wall longer than a ruling band at an angle (tapered cutters), holder and spindle collision, the swarf of a concave wall tighter than the cutter (refused), a stock claim (five-axis moves are bracketed, not carved: `no-gouge` stays unresolved), a desktop control to pick the wall. | `bun test ./packages/core/test/cam/swarf.test.ts packages/core/src/cam/kernel/swarf-job.test.ts apps/sidecar/test/cam-swarf.test.ts` |
| F5 | **Multi-axis roughing and rest**: 3+2 roughing in several orientations to clear undercuts (orientation selection from visibility analysis), tilted-plane adaptive clearing, rest milling from the stock bracket of spec 53 including tilted tools. | undercut pocket: residual stock after roughing + 3+2 is ≤ the declared allowance everywhere (checked by spec 53 V2) |
| F6 | **More finishing**: 5-axis contour, flowline / morph between two curves or surfaces, projection of curves onto a surface, drilling in tilted axes with a safe retract, deburr along an edge with a tilted chamfer tool. | each strategy has a gouge-free proof test against the exact part |
| F7 | **Head machines.** Wire `head.ts` into `runJob`: head-table (B head + C table), head-head (A/B head), with limits, pole singularities, and the choice among solutions (`headABFor` returns a list). Add machine bodies (head, spindle, table, column) for collision. | for a B-head + C-table preset the same F2/F3 fixtures pass |
| F8 | **Singularity handling & safe motion**: linearisation by joint-space interpolation with `stepsForTolerance`, intermediate poles bypass, safe rewinds when a rotary axis reaches a limit (retract → unwind → re-engage), rotary feed (inverse time `G93` or `F` conversion) policy per controller. | the tip deviation between sampled locations ≤ the tolerance over the *interior* of each move (not only the ends; closes the "not covered" in `motion.ts`) |
| F9 | **TCP / RTCP in posts.** Siemens `TRAORI`/`TRAFOOF`, Fanuc `G43.4` / `G43.5`, Heidenhain `M128`/`TCPM`, Haas `G234`; the post chooses between TCP-on (tip point positions) and table-compensated (machine-axis) output by machine config; each post's golden NC. | an inverse kinematics replay of the NC returns the tool tip within 0.005 mm of the planned contact (spec 53 V3) for both modes |
|  | **State (2026-10-24): built for Fanuc, Siemens and Heidenhain beside Haas.** `Dialect.tcp` is a tool-length-offset code (a string: Haas `G234`, Fanuc `G43.4`: `<code> H<n>` on, `G43 H<n>` off, `G49` at the end if open) or a pair of blocks (`TcpCodes`: Siemens `TRAORI` / `TRAFOOF`, Heidenhain Klartext `M128` / `M129`). `PostOptions.tcp: false` writes none of them: the generator passes it when the machine declares `tcp: "program"` (machine coordinates), and the kernel passes it by default (it writes indexed machine coordinates); a three-axis program is byte-for-byte unchanged. The replay interpreter reads every program back to the same motions (`test/cam/tcp-posts.test.ts`, `generator-multiaxis.test.ts`). **Not claimed:** Siemens uses the first kinematic transformation (`TRAORI` without a number: a machine with several needs its own post), Fanuc `G43.4` needs the tool tip control option and the builder's parameters, and none of it is qualified on a real control (spec 55 §6). `G43.5` (tool tip control type 2, tilted-plane commands) and `TCPM` of the newest TNC are not written. | `bun test packages/core/test/cam/tcp-posts.test.ts packages/core/test/cam/generator-multiaxis.test.ts` |
| F10 | **5-axis NC in simulation / replay**: tilted-axis stock removal (spec 53 V1) and rotary moves in the interpreter. | removal volume of a tilted pocket equals the analytic volume within the cell bound |

## 3. Gates (suite)

`cam/kernel/five-axis-job.test.ts` extended with F1–F3 fixtures; `cam/kernel/swarf.test.ts`; `cam/kernel/head-machines.test.ts`;
post goldens under `cam/post/*` for F9. **No release level above `preview` for five-axis programs until F3 + F8 + F9 + spec 53
V2 pass on the same fixtures.** The existing `release` claims (`part-coverage`, `no-gouge`, `machine-clearance`) are the vocabulary;
no new claim word without a check that can fail.

## 4. Honest limits

- Collision uses the machine bodies in the preset; a preset without bodies cannot certify collision and the claim stays
  `unresolved`.
- Optimal orientation planning is a DP over a discretised set: the result is feasible and smooth, not globally optimal.

## 5. Specialist packages (decision D4)

Impeller / blisk (hub-shroud-blade), port milling, tube-intersection, barrel (circle-segment) cutters, 5-axis shape-offset
roughing are product packages in hyperMILL. They are **not** prerequisites; each would be its own spec after F1–F8 and the
decision D4.

## 6. Order

F1 → F2 → F3 → F8 → F9 → F7 → F4 → F5 → F6 → F10.
