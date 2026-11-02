# Multi-setup and five-axis jobs: plan, run, read the verdict

Use cam action job to compose/check several fixings, bar/casting stock, fixtures and five-axis operations. The part is inline (part.elements or part.meshes); job stores nothing. cam_edit action manufacture is a separate persisted generation route, not an import of arbitrary job NC: replan supported setups through its schema and inspect its returned identity/claims. Report unsupported persistence instead of claiming the job was saved.

## The loop
1. `job` with `op: "plan"`: one entry per setup with the operations the kernel would run, what it cannot machine (`unmachined`), and the coverage of the orientations. Fix the setups until `uncoveredMm2` is 0 or you can say why the rest needs a rotary process.
2. `job` with `op: "run"`: every setup is generated, posted and replayed. Read in this order: `release`, `failed` (each with its reason), `unresolved` (what the kernel could not decide), `coverage`, then the per-setup `tolerance` terms.
3. Fix the cause named in the claim detail, run again. Never reword a failed or unresolved claim as passed, and never report `verified-program` for a job whose `failed` list is not empty.

## Setups
- `orientation` is the CAD direction facing the spindle (`+Z` top, `-Z` flip, `+X`, `-X`, `+Y`, `-Y`). Operations of a setup are in its own oriented coordinates. Leave `operations` out to let the planner choose them for that orientation.
- Each setup gets its own work offset (G54, G55, ...) and its own program: refixture and touch off between them. Two setups cannot share an offset.
- `part-coverage` of the job is passed only when every part of the surface faces the spindle (or stands vertical) in at least one setup. It is a facing test: undercuts and occlusion are decided by each setup's replay.
- The stock of a later setup is the raw stock again; what an earlier setup removed is not carried over, so removal volumes are not additive. Say so when you report them.

## Stock and fixtures
- `stock` is a box. `stockModel` is a `cylinder` (bar: centre, radius, z0, z1) or a closed `mesh` (casting, scan, or a roughed shape); its bounds replace `stock` and the replay starts from its shape. A part that does not fit is refused.
- `fixtures` are boxes (`id`, `min`, `max`, CAD world mm): vise jaws, clamps, parallels. The tool assembly (flutes, shank, holder) is checked against every one over the whole program, also with the table turned. A clean run makes `setup-workholding` passed; a hit makes it failed with the NC line and blocks the release; a box that cuts into the part is refused. Without fixtures `setup-workholding` stays unresolved: say that workholding is unchecked.
- Give the holder (`holder: {diameter, length, steps?}`, `steps` for a collet nut then a taper) and the real stick-out in `tools`. A wide holder low on a short tool is the usual `holder-clearance` failure: use a longer tool or a smaller holder, do not loosen the claim.

## Five-axis operations
- Use a machine with a rotary table (`cam materials` lists them; `trunnion-5ax`, `trunnion-5ax-bc`). Operations are `multiaxis` with a `mode` (`parallel`, `contour`, `swarf` with `walls` or `near`).
- Rough first with 3-axis operations and finish with the five-axis one: from a raw box the Ø10 shank of a finishing tool sits in uncut stock and `holder-clearance` and `no-rapid-in-stock` fail, correctly. A roughed shape can be given as a `stockModel` mesh.
- With the table turned, `no-gouge` and `material-removed` come from the tri-dexel replay of every move. Their detail states the declared error (cell plus sagitta, mm): a deviation under it is not reported and a pass does not claim more. A move the replay could not place keeps the claim `unresolved`.
- `machine-clearance` for turned moves is a verdict (passed/failed/unresolved), never "unsupported" on a machine with a rotary table.

## Tolerance
`quality.enforceTolerance: true` adds the claim `tolerance`: it passes only when the terms of the budget add up to the requested `tolerance` and none is unbounded; when it fails the detail names the largest term (usually the grid `resolution`: make it finer) and the release stays at `preview`. Without it the budget is informational. Report `achievedMm` against `requestedMm` and the unbounded sources either way.

## What to tell the user
State the release, the failed claims with their reasons, the unresolved ones, the declared error, and the open items: the stock is not carried between setups, workholding is only as good as the fixtures you were given, and a `preview` release is not a verified program.
