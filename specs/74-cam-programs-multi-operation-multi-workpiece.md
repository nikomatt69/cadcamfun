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
  pilot it is oriented and shifted by -Q (`backBoreShift`), and that pass is judged as the envelope the planner's own pilot rule assumes (`backBoreReach`: the
  farthest corner of any insert about the hole axis, or the body at Q + body radius; the bar has `flutes` inserts evenly spaced, the first towards +X, each
  `Cutter.insertWidth` wide, a point when absent, so a wider insert reaches farther with its corners and the shift is searched; two opposite inserts
  cannot pass a pilot narrower than the bar), not as an insert all round. The replay finds the hole's moves by position to 2 microns, since the NC
  carries three decimals (a non-round shift used to fall out of the envelope); the shifts between the bar on the
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
  release. It needs a placement on every part after the first (else a note says so). ONE tri-dexel holds the whole fixture in that frame (every blank and every
  clamp as one solid), and every register's feed moves are cut into it in program order, so each part's remaining stock (`bodyRemovedMm3`,
  `bodyRemainingMm3`, next to the per-part replay's own figures) and every contact are read from the same body in the state it is in when the move runs
  (`body`: its cell and declared error). A move of a register is checked against the rest of the body (its own blank is no obstacle to its own tool,
  except where another part's blank overlaps it): another part's blank on the lattice, with the tool as it is (flutes and shank, the holder when it is
  described, so the tool radius counts; rapids count too; a contact shallower than `errorBoundMm` is below the lattice's noise), the clamps EXACTLY, as
  boxes against the swept tool (`boxPenetration`, the tool sampled every 0.05 mm along the move, only where it can reach the box), so a graze of 0.3 mm
  into a clamp is a crossing although the lattice cell is 0.25 mm or more (`clampMethod: "exact-box"`, `clampErrorMm: 0.05`: a penetration of that
  much is never missed, one below 0.01 mm is the NC's own rounding). A replay that could not finish (`complete: false`, `reasons`: the cell grows until
  the solid can be sampled, the work budget is per register, the clamp check has its own) claims nothing and keeps the release at `preview`. A single
  part with clamps gets the view as well (`clamps`, crossings named by the clamp).

- **Operation templates.** `Setup.templates` (a named cycle of steps: tool, settings, `dependsOn`, `fromPreviousStock`) and `Setup.uses` (a
  template applied to elements: `perElement` one instance per element, `order` `perStep` or `perFeature`, `workpieceIds`, `position`
  among the setup's own operations, `overrides` of settings) are expanded by the pure `expandSetup` into ordinary operations
  (`<use>[<n>]:<step>` ids). `validateSetup` expands first and names a missing template, an empty use, an override that is not a setting
  or not valid, a clash of ids, a rest pass in a step-by-step order. The assistant (`setup_plan` / `setup_save` / `setup_generate`), the
  HTTP plan / generate routes (stateless and saved) expand before planning and generating. Not done: copy / mirror / pattern in
  geometry (the legacy operation names elements, the caller owns the geometry, so a pattern is a use over several elements); the
  desktop's setup panel does not edit templates (it reads the expanded operations where `validateSetup` is called, but `planPrograms` and
  `generateSetup` in the core still expect an expanded setup: a caller must call `expandSetup` first).
- **Datum probe of every part.** `Setup.partProbe` (cycles in the part's own frame: z-surface, edge, corner, bore, boss, web, pocket (an `angle` in
  radians from +X), rectangle, edge-angle; probe pocket, stylus, feed, correction `limit`, `rotation`) and `partProbeProgram` write one program of the
  probe tool that, for each workpiece in fixture order, runs the cycles under that part's register (`G54..G59`, `G54.1 Pn`, the part's rotary index
  first: the table turns so the part's frame is the machine's and its register was set at that pose) and adds the measured deviation to that register
  with the kernel's own cycles and actions (an alarm beyond `limit`, default 5 mm). A measured rotation (a corner with `touchesPerEdge: 2`, an
  `edge-angle`) is written when `rotation` says where: the register's own rotation (`offset-r`, which turns about the register's zero, so the datum
  belongs on the measured corner; the post must be able to write it: LinuxCNC and Siemens, not Fanuc), the control's coordinate rotation about the
  measured point (`g68`, right for any datum, stays on for what follows) or the table's C. `cam setup_plan` returns `probe` (tool number, register /
  touches / axes / `measured` axes per part, or `refused`); `setup_generate` and the HTTP generate routes take `probePart: true` and put that program
  FIRST (`kind: "probe"`). It is a program of its own run before the cuts, not inline in each part's toolpaths (inline would put the probe in the
  cutting programs' tool table and magazine: `generateSetup` would have to place it).
  **Replay.** Each part's probe moves are run on the simulator (`runProbeMoves`) against its blank (the part's own, else the setup's) placed with a
  displacement from where the setup believes it: default 0.8 / -0.6 / 0.3 mm on every part and 0.5 degrees when a rotation is written;
  `partProbe.replay.displacements` (per workpiece or for all) and `tolerance` (default 0.05 mm) say otherwise. A part on an indexed face runs with
  the table's pose (the blank is placed in the table's frame through `tablePose`, the pivot at the part's datum). `plan.probe.parts[].replay` says
  `within` (the corrected register puts the eight corners of the blank within the tolerance of where they are: `residualMm`, `beforeMm`, the
  corrected register, a G68 left on), `outside` (with the reason: an axis no touch measures, a rotation written to the register about the wrong
  point), `missed` (a touch found nothing), `stopped` (an alarm: the correction beyond `limit`, a contact on a protected move) or `unreplayed`
  (a write to the table's C axis is not modelled; no blank; a combination of features the replay does not build, below).
  **Features in the replayed blank.** The replay places the feature each cycle measures: through bores in the plate (`plateWorld`), one rectangular
  pocket cut into its top (a slot across X or across Y, an inside rectangle, an inside corner 40 mm into the part: `pocketWorld`), or the blank's
  own outline for a boss, a web or an outside rectangle that is not as wide as the part (a web or rectangle as wide as the part is the plain
  block). Not built, and said as `unreplayed`: bores with pockets or outlines in one probe, more than one pocket or outline, a slot or web at an
  angle that is not a quarter turn, and any feature on an indexed face (the feature is placed on a flat table only).
  **Rotation fallbacks.** A rotation is written the way the post can: `offset-r` on the Fanuc family (a register without a rotation) becomes G68
  about the measured point; `g68` on Siemens (no G68 word) becomes the frame's rotation, with the note that it turns about the frame's zero;
  LinuxCNC writes G68 with the Fanuc words and `G10 L2 R` for the register. The plan's `notes` say which one was used. A refusal remains only where
  neither exists (Okuma, Klartext, GRBL) and carries the post's own reason.
  A failed replay is a warning on the probe program. It has no material-removal replay and no tilted-plane (G68.2 / CYCLE800) frame: an index is
  the table turn.

Still not done:

1. Templates in the desktop panel, copy / mirror of a template over a symmetric fixture, templates from the tool library.
2. The viewer does not draw the combined fixture view's clamps (the data is in the evidence); the desktop does not send `fixtures` / `envelope` to the sidecar.
3. The probe inline in each part's toolpaths (the probe tool in the cutting programs' tool table and magazine); the probe replay on a tilted plane with
   the work offset in the table's frame (G68.2 / CYCLE800), on an indexed face with a feature, and a table-C write.
4. The insert of a back-boring bar is modelled as a body of revolution about the hole axis (its envelope), not as the oriented insert; the one
   tri-dexel of the fixture carves every register in one pass and its lattice (not the exact clamp test) limits the blank-to-blank contacts.
5. Tool life by the Taylor model and chip-load limits for legacy tools; clamps as true solids in the carving (they are exact boxes in the contact
   test, but the body's remaining stock does not subtract what a clamp occupies of the blank); holder collision against the machine; no controller
   qualification (a pass is the reference interpreter's, not a machine's).

## Note: the size of the API contracts snapshot (2026-11-06)

`packages/api/test/__snapshots__/contracts.test.ts.snap` is the whole OpenAPI document (about 166,000 lines). Its large diffs are legitimate, not
staleness: `cam.program.SetupSchema` has no identifier, so Effect inlines it at every place a setup travels (9 copies: plan, generate, saved
documents, the stateless and saved routes, the assistant's inputs), about 2,700 lines each, and every field added to a setup, a template or a probe
cycle is added 9 times. A regenerate at HEAD matches HEAD. Trying `SetupSchema.annotate({ identifier: "CamSetup" })` turns the nine copies into one
component and `$ref`s (166,037 lines to 145,723 on the first try; a later setup field is then one copy, about 300 lines) at the price of
regenerating the SDK types (`types.ts`, about 2,500 lines of churn once). It was not applied because another change to the setup schema was in
flight in the same tree; apply it together with the next schema change and run `bun run generate` and the contracts test with `-u`.
