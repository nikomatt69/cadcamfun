# 74 — CAM programs with several operations and several workpieces (2026-11-05)

Goal (user): the CAM kernel and the assistant create, and the CAM page manages, real programs: many operations, many workpieces
per operation, several tools, complete machining cycles. This note records what was checked in the code, what is built, and what
still separates the product from hyperMILL / Fusion 360 on this axis. Every statement below was read in the code or run.

## 1. What existed before this round

| Area | State |
|---|---|
| Legacy setup (`core/cam/program`) | One stock, one work offset, N operations with one tool each, grouping single / perTool / perOperation, tool table with pockets, one post-emitted program per group (`T1 M6 … T2 M6 … M30`). Saved in the project (`cam-setups`), planned and generated over HTTP, planned/saved by the assistant (`cam.setup_plan`, `cam_edit.setup_save`). |
| Kernel (`core/cam/kernel`) | `ManufacturingJob.setups[]` (orientation, own offset, fixtures, stock), 3+2 work planes, `carryStock`, operation model (`dependsOn`, copy / mirror / pattern of operations, setups and jobs), `patternSetups` (1–6 copies on G54–G59). Verified NC with claims. |
| Adapters of the kernel job | `POST /api/cam/jobs` and the read-only `cam.job` action. `CamKernelRequest` (what `cam_edit.manufacture` stores) has **no `setups`**: a stored kernel program is one setup. |
| CAM page | Multi-toolpath panel + `SetupPanel` (plan, save, load saved setups). Generated programs were only **downloaded** as files; never stored as programs, never opened in the editor/viewport. |
| Posts | One work offset per program (`Program.workOffset`). |

## 2. Built in this round (all tested)

- **Workpieces.** `Setup.workpieces` (id, name, `workOffset` G54–G59, optional `placement`), `Setup.workpieceOrder`
  (`toolFirst` default: each tool loaded once and run over all parts; `partFirst`: one part complete before the next), and
  `Operation.workpieceIds` (an operation on some parts only). One operation is generated once; its moves are the same on every
  part, only the register differs. `runsOf` is the single ordering used by the planner and the generator.
- **IR + post.** `Toolpath.workOffset`. The writer closes cycles/compensation/TCP, retracts to the highest point reached, selects
  the register through the dialect's own word, forgets modal state and rewrites every axis word (verified on the Fanuc output:
  `G55`, then `G0 X.. Y.. Z..`, never a bare `Z`).
- **Refusals.** Two parts on one register, a duplicate id, or an operation naming a missing part: nothing is generated and the
  issue is listed (`workpieceIssues`). The converter still refuses several offsets by design.
- **Planner.** Tool changes counted over the runs; `partFirst` names the changes `toolFirst` would save.
- **Assistant.** `cam.setup_plan` / `cam_edit.setup_save` carry the new fields; `cam.setup_list` reports `workpieces`; new
  `cam_edit.setup_generate {setupId}` generates a saved setup from the drawing's elements and **stores one program per group** as
  a project program (portable `cadcamfun-cam` document with the IR, so the registers travel; `setupProgramDocument`, `stockOfSetup`).
  Refuses a missing element (by name), a drawing that changed (`expectedRevision`), a setup without any stock.
- **CAM page.** Workpiece editor in `SetupPanel` (add, remove, register, order). The rest of the UI (program list in the sidebar,
  open/save of the generated programs, placement preview, per-operation workpieces, CAD-side "use as workpieces") is being done by
  the desktop agent of this session; see the commit log for what landed.

Tests: `packages/core/test/cam/program.test.ts` (6 workpiece cases), `apps/sidecar/test/ai-cam-setups.test.ts` (plan, save,
read back, generate and store, refusals), `apps/desktop/test/cam-setup.test.ts`.

## 3. State at the end of the round (2026-11-05)

Everything below was read in the code or run; the test names are in the commit messages.

Built on top of §2:

- **Fixture.** Extended registers (G54.1 Pn, up to 48 parts), a blank and a rotary index per part (tombstone), `dependsOn`, `magazineSize`,
  placed blanks that overlap refused, both part orders timed (6 s per change, indicative).
- **Workholding.** `Setup.fixtures` (clamp boxes) and `Setup.envelope` (travel), both in the first part's datum frame: a blank in a clamp
  or past the travel is a `workpieceIssues` entry and nothing is generated. A generated toolpath that reaches a clamp (tool radius sideways,
  stick-out upwards from the tip, arcs by their box) is named once per operation, part and clamp. The clamp boxes are as exact as the
  operator made them: there is no holder/shank collision against the machine itself.
- **Tool life and sister tools.** `Tool.lifeMinutes`, `Setup.sisters [{toolId, tool}]`. The cutting minutes of every run (programmed
  feeds, no acceleration) are counted over the whole setup with the kernel's life book (`consumeLife`, `pickSister`); when the next run
  would pass the life, the runs after it use the sister, on a pocket of its own, and the post calls it. Without a sister the program warns.
  `GeneratedSetup.toolLife` reports minutes against life. The magazine check counts the sisters. Life is explicit (an operator's number);
  the Taylor model of `process.ts` is not applied to legacy tools.
- **Replay evidence.** `cam_edit.setup_generate` replays every stored program once per work offset register (`verifyNc({register})`)
  against that part's own blank (its own `stock`, else the drawing's stock as the generator placed it, else the setup's block), the finished
  solid parts of the operations' elements (`setupReplay`), and the tools as kernel cutters (`cutterOfTool`, `Tool.holder`). The result
  per program is `release` (`blocked` on a gouge, a rapid through material or a travel violation; `verified-program` only when every register
  replayed completely against a solid part and every tool has its holder; otherwise `preview`) with the findings (NC line), gouge, leftover and
  the volume each blank lost. It is stored in the row (`data.setupEvidence`, with the hash of the replayed text) and `cam review` reads it
  back, `stale` when the drawing or the text changed. A replay that cannot finish is a preview with the reason, never a pass.
- **Multi-part removal.** Each register is cut from its own blank in its own frame (`VerifyNcResult.stockVolume/removedVolume`), so the
  figures are per part and not the sum of all parts on one blank.
- **Carried stock (kernel).** A carried job with a setup that cuts under an overhang (T-slot, dovetail, lollipop, back-boring bar)
  followed by another setup is run a second time on a tri-dexel (`RunOptions.solidCarry`, `solidOf`): every cutting move is replayed with
  the cutter's real solid, the stock a setup leaves is handed on as `ResidualStock.solid` and sampled into the next setup's frame
  (`TriDexel.fromSolid`, one cell of added declared error), so the void under the overhang is a gap in a ray and air for the next
  setup, whatever its orientation. `carriedColumns` reads the columns from that solid; the stock volume, the leftover figures and the
  coverage then start from the right material. `part-coverage` states the evidence (cell, declared error, what is left or cut below the
  part after the last setup) and is `passed` when every setup's replay was complete, `failed` when the chain cuts below the part,
  `unresolved` with the old `carryLimitsOf` sentence when a replay stopped (budget) or a carried solid was too large to sample. The setup that cuts the
  undercut itself is judged on its own tri-dexel (the replay exists whenever the program has a back-boring operation, carried or not): its
  `no-rapid-in-stock`, `holder-clearance`, `no-gouge` and `material-removed` are decided there, with the error declared. While the bar passes the
  pilot it is oriented and shifted by -Q (`backBoreShift`), and that pass is judged as the envelope the planner's own pilot rule assumes (the insert
  is one tooth towards +X: reach R - Q, body Q + body radius, about the hole axis), not as an insert all round; the shifts between the bar on the
  axis and the bar shifted judge the body only (the insert moves away from the wall it cut). Declared removal the mesh does not carry (drill
  points, chamfers, threads) is named in the claim: a replay that found no cut below the part beyond its error passes whatever is declared, one
  that found a cut cannot be told from the declared removal and stays `unresolved`. With the tri-dexel incomplete (budget) the claims stay
  `unresolved`. A job is `verified-program` when every claim of every setup passes and the facing coverage of all the setups is complete: a setup's
  own "faces that look away" part-coverage no longer holds the job at preview (the job's coverage replaces it), but an unfixed manual refixture
  (`setup-workholding`) still does, so the flipped setup needs fixture bodies that hold the stock. The next setup's start volume differs from
  the previous one's end volume by the sampling error (about 0.8 % in the back-bore job), asserted in the tests against the declared error times
  the stock's surface. Still the height field: the verdicts of a flat-table job without an undercut, and the lateral rest-stock figures.

- **HTTP generate replays on request.** `POST /api/cam/setups/generate` and `POST /api/projects/:id/cam-setups/:setupId/generate` take
  `evidence: true`: every returned program carries `evidence` (the same `SetupEvidence` as the assistant's, built from the same
  `setupReplayPlan`, one kernel job per work offset). The routes store nothing, so the caller stores the program with that evidence
  (`data.setupEvidence`); without the flag nothing is replayed (the replay costs a kernel job per register).
- **Parts seen together in one frame.** From two registers on, `SetupEvidence.fixture` places every blank at its `placement` in the first
  part's datum frame, carries the program's moves into that frame (`interpretGcode` with `frame: "machine"` and the placements as the
  offset table) and lists, per part, the blank there, the volume removed, the volume left (from that part's own replay) and where its
  feed moves reached. `crossings` are cuts of one register inside another part's blank (a wrong register or placement): they block the
  release. It needs a placement on every part after the first (else a note says so). The contacts are judged on a tri-dexel of what a register's
  own moves must not touch (the other parts' blanks and the setup's `fixtures` clamps, as one solid in that frame), with the tool as it is: the
  flutes and shank, and the holder when it is described, so the tool radius counts (a part whose blank the tool edge reaches while the axis is still
  outside it is a crossing). Rapids count too. Only moves whose tool comes near an obstacle are replayed, the holder separately (wide but high). A
  contact shallower than `errorBoundMm` is below the lattice's noise and is not reported; a replay that could not finish (`complete: false`,
  `reasons`) claims nothing and keeps the release at `preview`. A single part with clamps gets the view as well (`clamps`, crossings named by the
  clamp). The remaining volume is still the per-part figure of each part's own replay.

- **Operation templates.** `Setup.templates` (a named cycle of steps: tool, settings, `dependsOn`, `fromPreviousStock`) and `Setup.uses` (a
  template applied to elements: `perElement` one instance per element, `order` `perStep` or `perFeature`, `workpieceIds`, `position`
  among the setup's own operations, `overrides` of settings) are expanded by the pure `expandSetup` into ordinary operations
  (`<use>[<n>]:<step>` ids). `validateSetup` expands first and names a missing template, an empty use, an override that is not a setting
  or not valid, a clash of ids, a rest pass in a step-by-step order. The assistant (`setup_plan` / `setup_save` / `setup_generate`), the
  HTTP plan / generate routes (stateless and saved) expand before planning and generating. Not done: copy / mirror / pattern in
  geometry (the legacy operation names elements, the caller owns the geometry, so a pattern is a use over several elements); the
  desktop's setup panel does not edit templates (it reads the expanded operations where `validateSetup` is called, but `planPrograms` and
  `generateSetup` in the core still expect an expanded setup: a caller must call `expandSetup` first).
- **Datum probe of every part.** `Setup.partProbe` (cycles in the part's own frame: z-surface, edge, corner, bore, boss; probe pocket,
  stylus, feed, correction `limit`) and `partProbeProgram` write one program of the probe tool that, for each workpiece in fixture order,
  runs the cycles under that part's register (`G54..G59`, `G54.1 Pn`, the part's rotary index first) and adds the measured deviation to that
  register with the kernel's own cycles and actions (an alarm beyond `limit`, default 5 mm). `cam setup_plan` returns `probe` (tool
  number, register / touches / axes per part, or `refused`); `setup_generate` and the HTTP generate routes take `probePart: true` and put
  that program FIRST (`kind: "probe"`). It is a program of its own run before the cuts, not inline in each part's toolpaths (inline would
  put the probe in the cutting programs' tool table and magazine: `generateSetup` would have to place it). It has no material-removal
  replay (the kernel's `simulateProbing` is not run for it) and the touches of a part that is not where its placement says are the
  operator's to check.

Still not done:

1. Templates in the desktop panel, copy / mirror of a template over a symmetric fixture, templates from the tool library.
2. The remaining stock of ALL parts as one tri-dexel of the whole fixture: the figures per part still come from each part's own replay, and the
   contacts between parts and clamps are on a tri-dexel per register, not one solid carved by every register in program order.
3. The viewer does not draw the combined fixture view (the data is in the evidence).
4. The part probe inline in each part's toolpaths, simulated with `simulateProbing` against a misplaced blank, probing more than one
   cycle kind with angles (web, pocket, rotation correction) and a tilted-plane or rotary index probe.
5. Tool life by the Taylor model and chip-load limits for legacy tools; clamps as true solids (boxes only), holder collision against
   the machine; no controller qualification (a pass is the reference interpreter's, not a machine's).
