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

## 3. What is still missing against hyperMILL / Fusion 360 (ordered by value)

1. **Verified multi-setup programs.** The kernel can run `setups[]` with carried stock and claims, but nothing stores or shows it:
   `CamKernelRequest` has no `setups`, `cam_edit.manufacture` stores one setup, the desktop `KernelSetups` panel only advises an
   orientation. The programs of §2 come from the legacy generator and carry **no replay evidence** (no gouge / collision /
   remaining-stock claims, no release level). Fusion and hyperMILL release a whole job; here only a single kernel setup is released.
   Next: `setups` in `CamKernelRequest` + `jobOfRequest`, a stored artifact per setup (`setupsOf`), the page's kernel panel listing
   setups with their work offsets and per-setup release, and `patternSetups` as "N parts" for the kernel path (this is the verified
   twin of the workpieces above).
2. **Operations are thin in the legacy setup.** One element per operation, no dependencies, no templates; the kernel's operation
   model (`dependsOn`, copy / mirror / pattern) and the tool-library `planMagazine` / sister tools / tool life are not used by the
   setup's tool table (pockets are first-use numbers only).
3. **Identical parts only.** All workpieces share the operation's geometry; `placement` is for display and is not checked for
   collision between parts, clamps or the machine envelope. No per-part stock, no per-part element set, no probing of each datum
   (workpiece offset update from a probe run exists in the probing path, not tied to `workpieces`).
4. **Registers.** Six (G54–G59). No G54.1 Pn / G505… extended registers for larger fixtures, though `workOffsetRef` exists in the IR.
5. **Round trip.** The converter refuses programs with several offsets; re-parsing stored NC (the sidecar parse) loses the per-part
   register in the IR. The IR kept in the stored document is the source for display.
6. **Time.** `partFirst` vs `toolFirst` is compared by tool-change count only; no cycle-time figure (the kernel has `cycle-time`,
   it is not applied to legacy programs).
7. **Simulation.** No stock-removal simulation over several parts of one program; the viewer machine scene draws at one datum.
8. **Indexed / tombstone fixtures.** A workpiece per face of a tombstone with a rotary index per face is not modelled (the kernel's
   setup orientation covers one part per setup).

Nothing above is claimed as done; items 1–3 are the next steps in that order.
