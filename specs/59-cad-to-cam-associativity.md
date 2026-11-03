# 59 — CAD → CAM associativity: know the model changed, say what changed, regenerate with a diff

Status: specified 2026-10-25; A1 (fingerprint) and A2 (status) built 2026-11-03, see the change log. Part of [spec 39](39-professional-parity-master-plan.md); gap G2 of [spec 57](57-parity-ledger-2026-10-25.md).
Owner: WP2 (`packages/core/src/cam/kernel/{identity,snapshot,execute,planner}.ts`, new `cam/kernel/associativity.ts`); adapters WP3
(`packages/api/src/groups/toolpaths.ts`), WP4 (`apps/sidecar/src/http/{toolpaths,workspace}.ts`), WP6 (`apps/desktop/src/features/cam`, `features/toolpaths`),
WP8 (`packages/ai`). Depends on [58](58-parametric-timeline.md) (what is active in the model) and, for the durable form, [41](41-persistent-topological-naming.md) N6.

## 1. Where it stands (verified 2026-10-25)

- A kernel job's part is `{ kind: "elements", elements }` — the CAD elements are **embedded** in the job (`cam/kernel/snapshot.ts:71`, `jobOfSnapshot`).
  The stored program keeps both: toolpath `data.kernelRequest` and `data.kernelArtifact` (read in `apps/sidecar/src/http/toolpaths.ts:56` and
  `workspace.ts:68`). There is no DB table for it and none is needed.
- `artifact.identity = { job, part, nc, algorithm }`; `part = digestOf("cam-kernel/part@1", job.part)` (`execute.ts:1117`) is a hash of **all** the embedded
  element JSON: a rename, a colour or a layer change alters it, a pure geometry-neutral edit looks like a model change. It is evidence of what was used,
  not a usable "did the model change" test.
- Nothing compares a stored program with the project's current elements. The desktop has both (the open drawing's elements and the toolpath record) but
  shows no relation; the assistant's workspace summary (`workspace.ts`, `packages/ai/src/workspace-context.ts`) carries the artifact and request without a
  freshness flag.
- Operations are re-derived from features at every run (`brepFeatures`, `planSetups`, planner branches); a user edit of an operation's feeds or tool is part of the
  request's operation list, not attached to a recognised feature, so it survives a re-run only when the caller resubmits the whole list.
- The stock follows the selected parts unless the person keeps a manual stock (`73454e98`); project saving keeps restore points and a base revision (spec 38,
  `features/cad/lib/stored-revision.ts`).
- Legacy `cam/generator/*` programs have **no** artifact or request (gap G5): none of this applies to them.

## 2. Target

After a CAD edit, every kernel program of the project shows `current`, `stale (what class of change)` or `unknown`, in the desktop and to the assistant; the
person can regenerate with one action and see a diff of operations, tools, time, claims and release level before accepting it; an unchanged model
regenerates to the same bytes. A program is **never silently replaced and never silently trusted**.

## 3. Design

### 3.1 Geometric part fingerprint (A1)

`partFingerprint(elements)` in `cam/kernel/associativity.ts`, schema `cam-kernel/part-geometry@1`, over what changes the machined shape only: for a parametric
element the resolved parameters and the **active** features after spec 58 (`states`, so a suppressed or rolled-back feature is excluded), for other
elements their geometry-bearing fields, and every element's world transform; names, layers, colours, visibility of display, selection and metadata are
excluded. It is stored as an **additive** `identity.partGeometry` of the artifact (a contract change: spec 29, then `packages/api`, then clients with
`bun run generate`). For older artifacts it is derived from the embedded `kernelRequest` elements, so no stored program is invalidated.

### 3.2 Status and classification (A2)

`programStatus(request, artifact, currentElements)` is pure and returns `current | stale | unknown`. A stale result carries a class and the element ids:
`display-only` (reported as current), `rigid` (every element moved by one transform: the program is valid relative to the part but not to the machine's
zero), `geometry` (an element's shape changed), `topology` (elements added or removed). `unknown` is returned for a legacy program, a request whose elements
are not embedded, or a fingerprint schema it does not know. Also compared, because they are inputs of the program too: stock, machine, tool table and post
(through `identity.job`), reported as their own reasons so "the machine config changed" is not shown as "the model changed". A cheap pre-check uses the
drawing's stored revision at generation time (`sourceRevision` in `data`), the fingerprint is the proof.

### 3.3 Regeneration and diff (A3, A4)

`regenerate(request, currentElements)` runs the same `manufacture` pipeline with the stored request (operations, tools, machine, stock, post) against the
current elements; the old artifact is kept as a restore point (spec 38), never overwritten before acceptance. `ProgramDiff` = operations added / removed /
changed (by matched key, §3.4), tools added / removed, cycle time and removal deltas, claims that changed (`pass`→`fail` etc.), release level before / after,
NC size and a line-diff summary. Policy (decision D9): `ask` by default; `auto-safe` regenerates only a `display-only` or `rigid` class and only when the
new artifact's release level is not lower and no claim got worse; `never`.

### 3.4 Operation matching (A5)

`matchOperations(oldPlan, newPlan)` pairs operations through a **feature signature** (kind, axis, position, principal dimensions) with a distance and a
confidence, greedy by distance with a rejection threshold; a user's overrides (feeds, tool, depth strategy) are carried onto the matched operation; unmatched
old operations are reported as `removed` with the feature that went away, unmatched new ones as `added`. When spec 41 refs exist the signature is replaced by the
face ref (N6) and the position/size fallback stays only for refs that resolve as `lost`. A match below the confidence is **not** carried: the override is listed
as dropped (refusal over a wrong carry-over).

### 3.5 Partial regeneration (A6, deferred)

Operations that do not depend on the changed feature and on stock state could reuse their segments, but the stock is carried from operation to operation (spec 53
V6), so a change upstream invalidates every later operation that reads the stock. The spec fixes only the safe rule: regenerate everything, **byte-identical when
nothing changed** (the kernel is deterministic: same inputs, same moves). Partial reuse needs spec 53 V6 first.

## 4. Work items

| ID | Item | Gate | Size |
|---|---|---|---|
| A1 | `partFingerprint` and additive `identity.partGeometry`; contract / API / clients | renaming, recolouring or moving an element to another layer keeps the fingerprint; changing a dimension or a transform changes it; a suppressed feature (spec 58) is excluded; an artifact stored before the change is still decoded | S |
| A2 | `programStatus` with classes and the stock / machine / tool / post reasons | table-driven test of every class on a plate with a pocket; legacy and malformed inputs return `unknown` with the reason, never `current` | S |
| A3 | `regenerate` + restore point + determinism | regenerating an unchanged project returns the same `nc` bytes and the same `identity.job`; the old artifact is retrievable after acceptance | M |
| A4 | `ProgramDiff` | editing a pocket depth by a parameter: the diff lists exactly that operation, the cycle time delta equals the new artifact's minus the old one, claims delta correct; a fixture with a removed hole lists the removed drill | M |
| A5 | `matchOperations` with signatures and override carry-over; refs when spec 41 N6 exists | a hole resized by a parameter keeps its tool and feed overrides; a moved hole keeps them within the distance threshold; a hole replaced by a pocket drops them and says so; no match is made below the confidence | M |
| A6 | Adapters (§5) | each adapter test below | M |
| A7 | Partial regeneration (needs spec 53 V6) | operations before the first affected one are byte-identical to the old ones; the stock after them equals the old stock | L, deferred |

## 5. Adapters (the real surfaces)

| Surface | Change | Test |
|---|---|---|
| `packages/core/src/cam/kernel/{identity,snapshot,execute}.ts` | `identity.partGeometry` written by `execute.ts`; `jobOfSnapshot` unchanged | `kernel.test`, identity tests |
| `packages/api/src/groups/toolpaths.ts` (next to `setup-sheet`, `post-check`) | `GET /api/toolpaths/:id/status` (derived, never stored) and `POST /api/toolpaths/:id/regenerate` (preview: artifact + diff, stores nothing); acceptance reuses the existing toolpath update path (restore point included) | API snapshot (`bun test packages/api -u` after `bun run generate`), sidecar `cam-kernel.test.ts` reading the stored program back |
| `apps/sidecar/src/http/{toolpaths,workspace}.ts` | handlers; the workspace summary gets `stale` per program so the assistant is not told a stale program is current | sidecar test with a changed element |
| `apps/desktop/src/features/cam/components/generator/KernelSection.tsx`, `EvidenceSection.tsx` | banner "model changed: class" with Regenerate / Review; diff view as a new `KernelDiff.tsx` beside `KernelSetups.tsx` and `KernelPost.tsx`; the evidence shows the release level change | happy-dom test against the real sidecar as `cam-post.test.ts` does |
| `features/cam/components/OperationsList.tsx`, `features/toolpaths/screens` | stale badge in the program list and on the toolpath detail | panel test |
| `packages/ai` (`cam.review`, `cam.plan_check`, `cam.manufacture` / `cam_edit`) | stale reported as an issue of the review; `regenerate` as a parameter of the existing manufacture action (names only, tool-catalogue ceiling) | tool-prompts test, harness inventory regenerated |
| `apps/desktop/src/features/cad/lib/stored-revision.ts` | source of the `sourceRevision` pre-check | existing project-saving tests unchanged |

## 6. Honest limits

- A fingerprint says the geometry is the same, not that the program is still right: stock, machine, tools and post are separate inputs and are compared
  separately; a regenerated program carries its own evidence and release level and is **not** assumed to equal the old one's.
- Until spec 41, matching is by signature: two similar holes swapped by an edit can be matched wrongly with a confidence the diff shows; the person reviews the diff.
- Legacy generator programs have no request or artifact and report `unknown`; converting them is a separate decision (spec 62 §6), never done implicitly.
- A `rigid` class is reported, not auto-corrected: re-deriving the work offset from a moved part needs a fixture / WCS model that spec 54 R4 has not built.

## 7. Order

A1 → A2 → A3 → A4 → A5 → A6 → A7. A1/A2 give the badge on their own and ship first; A5 improves with spec 41.

## 8. Change log

- 2026-10-25: created.
- 2026-11-03 (build, A1 + A2 and their adapters): `cam/kernel/associativity.ts` has `partFingerprint` (schema `cam-kernel/part-geometry@1`: names, layers, colours,
  visibility, metadata and a feature's `name`/`group`/`appearance` are left out, numbers are rounded to a nanometre, an unknown field counts as geometry) and
  `programStatus(stored, current)` returning `current` (with the `displayOnly` element ids), `stale` (class `topology`, `geometry`, `rigid` with the translation, or
  `inputs`; element ids; the settings that differ when the current settings are passed) or `unknown` with its reason. **Deviation from §3.1:** the fingerprint is
  derived from the stored `kernelRequest.elements` and is not written into `identity.partGeometry`, so no artifact contract changes and every stored program already has a
  status. Adapters: `GET /api/toolpaths/:id/status` (derived, never stored; `unknown` for a toolpath without a kernel request or a drawing) and `modelChange` on
  `cam review` (the review stays `stale` on any drawing revision; `modelChange` says whether the geometry did change). Tests: `kernel/associativity.test.ts` (11),
  `apps/sidecar/test/cam-program-status.test.ts` (2, through HTTP and the assistant's review). **Open:** A3 regenerate with a restore point, A4 `ProgramDiff`, A5
  `matchOperations`, the desktop banner and badge (A6), partial regeneration (A7); the route compares the model only, the settings comparison needs the caller to pass
  the current settings (the desktop has them).
- 2026-11-03 (build, A3 preview + A4): `cam.kernel.programDiff(before, after)` (operations added / removed / changed by id with the changed fields and parameter names, tools, cycle
  time and removed-volume deltas, claims with their direction, release before / after, NC line summary, `safe` = release not lower and no claim worse) and
  `POST /api/toolpaths/:id/regenerate` (body `{scope?: "program" | "drawing"}`; answers the status, the new artifact and the diff; **stores nothing**), with the assistant's
  `cam regenerate`. `program` regenerates from the current version of the elements the program was made from, `drawing` from every part element now. An unchanged
  model regenerates to the same bytes (tested through HTTP). `programStatus` now ignores the `workpiece` stock element. Tests: `kernel/program-diff.test.ts` (5, real kernel
  runs), `apps/sidecar/test/cam-program-status.test.ts` (4). **Open:** acceptance with a restore point (the existing toolpath update path would be reused), `matchOperations`
  with override carry-over (A5: matching is by operation id only, so a renamed feature shows as removed + added), the desktop banner and diff view (A6), A7.

- 2026-11-03 (build, A6 first part): the CAM page's kernel section shows what kind of model change made the program stale (`data-testid="kernel-model-change"`: geometry, topology,
  rigid move, or the settings that differ; four new strings in the 11 locales, machine-translated and not reviewed). Still open: the Regenerate / Review buttons and the diff view
  (`KernelDiff.tsx`), the stale badge in the program list and on the toolpath detail screen, acceptance with a restore point.
- 2026-11-03 (build, A3 accept): `POST /api/toolpaths/:id/regenerate` with `accept: true` replaces the stored program. The program being replaced is first kept as a version of the toolpath
  (the restore point, `versionId` in the answer, listed by `GET /api/toolpaths/:id/versions` with the old NC byte for byte), then the row is written only if neither the toolpath nor the
  drawing changed since they were read (one transaction; otherwise 409 and nothing is replaced). Refused with a reason and nothing written: a diff that is not `safe` (lower release or a
  claim that got worse) unless `force`, a blocked new program, a saved CAM page document (portable program: accepted from the CAM page). Needs write access (403 otherwise). After
  accepting, the status is `current` and the assistant's review is no longer stale. The assistant's `cam regenerate` stays a preview: storing goes through `cam_edit manufacture`.
  Test: `apps/sidecar/test/cam-program-status.test.ts` (5). **Open:** the desktop buttons and diff view (A6), `matchOperations` (A5), A7.
- 2026-11-03 (build, A5): `cam.kernel.matchOperations(before, after, {minConfidence})`. Operations with the same id and strategy pair by id (confidence 1); the rest pair greedily by a geometric signature
  (strategy, cut class, centre, extent and depth of the tool path; the pair is made only when the distance is inside a third of the feature's size, at least 4 mm, and the confidence is at
  least 0.5). The overrides of a signature-paired operation are listed in `carried` with their values; the overrides of an operation with no pair are listed in `droppedOverrides` with the
  reason, never carried. `programDiff` uses it: `operations.matched`, `carried`, `droppedOverrides`, and a changed operation names the id it had (`from`) and the confidence. Real runs: a
  mounting plate M5 to M6 pairs the drill operation (`drill-drill-5.5-2` to `drill-drill-6.6-2`, 0.862) instead of reporting a removal and an addition; an operation moved 500 mm is not
  paired and its override is reported dropped. Tests: `kernel/program-diff.test.ts` (10), `apps/sidecar/test/cam-program-status.test.ts` (6, HTTP and the assistant). **Open:** the carried overrides are
  returned, not yet applied to the stored request on accept (the person's operation list is not stored per feature), the signature is bounds-based (two similar holes swapped can pair wrongly; the
  confidence shows it), A7.

- 2026-11-03 (build, A6 second part): the CAM page's kernel section compares each generation with the program that was there before it (`programDiff`, no API call: the diff is a pure
  core function) and shows what changed (`data-testid="kernel-diff"`): "same program, byte for byte" or the operations added / removed / changed, the cycle-time delta and the release
  change, the claims that got worse and a warning when the new program is not safe to take over. Four strings in 11 locales (machine-translated, not reviewed). Test: `apps/desktop/test/cam-kernel.test.ts`.
  **Open:** a stale badge in the program list and on the toolpath detail screen; Regenerate / Review buttons on a stored program that call the preview and accept routes.
- 2026-11-03 (build, A6 third part): the toolpath detail screen (`ToolpathProgramDetails`) says whether the drawing still matches the model a native program was made from
  (`data-testid="toolpath-model-status"`, computed in the desktop from the stored `kernelRequest` and the drawing it loads, tone ok / warn / muted; `unknown` is never shown as current; two more strings in
  11 locales, machine-translated). The sentence logic is shared with the CAM page (`cam/lib/model-change.ts`, tested in `apps/desktop/test/model-change-text.test.ts`). **Not tested end to end:** the
  detail screen render needs a stored native program, which only a portable CAM document can create over HTTP; the logic is unit-tested and the component is typechecked. A program made from a selection shows
  unselected drawing elements as "added". **Open:** the list badge, Regenerate / Review buttons that call the preview and accept routes.
