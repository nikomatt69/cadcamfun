# 58 — The parametric timeline: suppress, rollback, reorder, groups, edit-in-place, incremental rebuild

Status: specified 2026-10-25; T1–T3, T5 and T7 built 2026-10-27; T4, T6, T8 (beyond `withSuppressed` / `withRollback`) open. Part of [spec 39](39-professional-parity-master-plan.md); gap G1 of [spec 57](57-parity-ledger-2026-10-25.md).
Owner: WP1 (`packages/core/src/cad/{history.ts,history-brep.ts,history-edit.ts}`); adapters WP3 (`packages/api/src/ai-parametric.ts`),
WP6 (`apps/desktop/src/features/cad`), WP8 (`packages/ai`, `cad_parametric`). Interacts with [spec 40](40-single-exact-brep-truth.md) (the two replays),
[41](41-persistent-topological-naming.md) (refs follow the timeline) and [46](46-assembly-and-configurations.md) (configurations are built on suppression).

## 1. Where it stands (verified 2026-10-25)

- `History = { parameters: ParameterTable, features: Feature[] }` with 24 feature kinds (`history.ts:499–503`). There is **no version field**, no
  `suppressed`, no rollback marker, no group, no feature name beyond `id`.
- `rebuild(history)` "replays the history from the top. Never throws: what cannot be built is in `issues`" (`history.ts:803`). Its state is a set of
  closure maps (`sketches`, `planes`, `bodies`, `flatPatterns`, `tools`, `extrusions`, `revolutions`, `sweeps`); nothing can be resumed from the middle.
  `rebuildExact(history, given?)` (`history-brep.ts:603`) is a second replay that takes the mesh result as input.
- `history-edit.ts`: `setDimension`, `setParameter`, `renameParameter`, `removeParameter`, `usesOf` (which features use a parameter), `dependentsOf`
  (declared references: sketch of an extrude / revolve / rib / sheet, source of a pattern / mirror, sweep and loft sketches, plane references),
  `removeFeature` (removes the feature and all its dependents), `moveFeature` (one step; refused when it would cross a declared dependency).
  The implicit order dependency "this feature acts on the body built so far" is **not** a declared reference, so a hole can be moved above the extrusion it
  cuts without the move being refused (to be confirmed by the T3 test before the claim is relied on).
- Desktop: `ParametricPanel.tsx` is the timeline (dimensions per feature, sketch state, issues); every edit is `elements.updateElement(id, { history })`
  so it goes through the editor's undo; `features/cad/lib/fingerprint.ts` decides when a canvas object rebuilds (a cheap 32-bit hash of what the element
  is made of). The CAM reads the history through `cam/generator/history-features.ts` and `cam/brep-part.ts`.
- Spec 46 A1 / A5 (`Occurrence.suppressed`, "feature suppression flags" of a configuration) and spec 47 assume a suppression primitive that does not exist.

## 2. Target

A timeline that behaves as in Fusion 360 / SolidWorks for the 24 kinds: any feature can be suppressed (it and what depends on it leave the model, nothing
is deleted), the model can be rolled back to any point and edited there, features can be reordered or inserted with a real dependency check, groups
organise a long tree, a failing feature is reported with a reason and a suggested remedy while the rest of the model still builds, and an edit near the
end of a 100-feature history does not replay the first 99.

## 3. Design

### 3.1 Schema (additive, read-compatible)

All optional, so a history without them replays exactly as today: `Feature.suppressed?: boolean`, `Feature.name?: string`, `Feature.group?: string`;
`History.rollback?: string` (id of the **last active** feature; those after it are `rolled-back`), `History.groups?: { id, name, collapsed? }[]`,
`History.version?: 2`. Decision D8: a read-compatible superset (default) versus a one-way migration. The AI schema (`packages/api/src/ai-parametric.ts`),
`historySchema` and the generated clients accept the new fields; `bun run generate` and the API snapshot are refreshed with the change.

### 3.2 Replay semantics

`RebuildResult` gains `states: Record<featureId, "ok" | "suppressed" | "suppressed-by" | "rolled-back" | "failed" | "skipped">` (`suppressed-by` names the
suppressed ancestor). Rules: a suppressed feature is not executed; every feature that needs it (declared **or lineage**, §3.3) is `suppressed-by`; a
feature after the rollback marker is `rolled-back`; a feature that fails is `failed`, its dependents are `skipped`, everything else still builds
(today's "never throws" contract). The exact replay (`rebuildExact`) honours the same flags: **a suppressed or rolled-back feature never reaches an exact
body**, and the coverage matrix (`history-exactness.test.ts`) gets a column for it.

### 3.3 Lineage-based dependency graph

During replay, record for every feature the body ids it reads and the body ids it writes; `dependencyGraph(history)` returns declared edges plus these
lineage edges, topologically ordered. `dependentsOf`, `removeFeature` and `moveFeature` use it. `moveFeatureTo(history, id, index)` is valid iff the
resulting order keeps every edge pointing forward; otherwise it returns the same history and a reason naming the blocking feature (refusal over
approximation).

### 3.4 Incremental rebuild

The closure state of `rebuild` becomes one explicit `ReplayState` value held after each feature (persistent maps or copy-on-write; the choice is measured,
not assumed). `rebuild(history, { resume })` finds the first feature whose canonical digest differs from the cached run (a parameter edit starts at the
earliest feature of `usesOf`), restores the state before it and replays forward. The cache is keyed by `(feature digest chain, parameter values)`, lives
with the element in the editor (not in the stored project), has a byte ceiling and obeys `withBudget` / `checkBudget` (`cad/brep/budget.ts`). The result is
**identical** to a full replay or the cache is discarded.

### 3.5 Edit in place, failures, groups

Editing a feature at index *i* shows the model at *i* (rollback), replays forward on commit and reports per-feature states. `Issue` gains an optional
`remedy` (the structured `BooleanError.diagnostic` of `3bef3d2c` already carries stage / operand / face / remedy; blend and shell failures get the same).
Groups and names are display only: they never change a replay; moving a group is a sequence of valid `moveFeatureTo` steps or a refusal.

### 3.5.1 Configurations

`withSuppressed(history, ids)` and `withRollback(history, id)` are pure and return a new history; a configuration of spec 46 A5 is `parameters` plus a set
of suppressed ids applied through these functions, so no configuration state lives inside the history.

## 4. Work items

| ID | Item | Gate | Size |
|---|---|---|---|
| T1 | Schema fields, `version`, decision D8; schema decode and encode in `ai-parametric.ts`; clients regenerated | every `history-*.test.ts` unchanged and green; a history with all new fields survives `history-roundtrip.test.ts`; `bun run generate:check` clean | S |
| T2 | Replay semantics for suppress / rollback / `states`, mesh **and** exact | for each of the 24 kinds: suppressing X equals the history without X (mesh volume within the Float32 tolerance of 1e-5, exact digest equal); rolling back to every index of `recipes.ts` parts equals the prefix history; the matrix has the new column and fails when a kind ignores a flag | M |
| T3 | Lineage recording, `dependencyGraph`, `moveFeatureTo`, `insertFeature(after)` | moving a hole above its extrusion is refused with the extrusion named; a valid multi-step move reproduces the same volume; `dependentsOf` of a sketch still equals the old answer on all recipes (no regression) | M |
| T4 | `ReplayState` refactor, checkpoints, `rebuild(history, { resume })` for the mesh replay, then for `rebuildExact` | over every recipe and 200 random edits (parameter, dimension, suppress, move), resumed result equals full result bit for bit on mesh and by digest on exact; editing the last feature of a 40-feature history costs at most 2x one feature's replay (target, measured with the spec 55 harness); `bun test` of `history*.test.ts` stays under the existing chunk limits | L |
| T5 | Edit in place; failed / skipped states; `Issue.remedy` for fillet, shell, Boolean, thread | a fillet radius larger than the edge fails only that feature, dependents are `skipped`, later independent features build; the remedy text names a radius that works (checked by rebuilding with it) | M |
| T6 | Names and groups; group move | a grouped history replays identically to the ungrouped one; moving a group across a dependency is refused with the reason | S |
| T7 | Adapters, listed in §5 | each adapter's own test below | M |
| T8 | `withSuppressed` / `withRollback` primitives for spec 46 A5 | applying then removing the same suppression returns the identical history | S |

## 5. Adapters (the real surfaces)

| Surface | Change | Test |
|---|---|---|
| `apps/desktop/src/features/cad/components/ParametricPanel.tsx` (timeline) | row controls: suppress toggle, rollback bar, group headers, state badges (`failed`, `suppressed-by`) with the remedy; all edits through `elements.updateElement(id, { history })` so the editor's undo covers them | happy-dom panel test with a live elements store (as `ParametricPanel` is driven today); not run in a Tauri window |
| `features/cad/lib/fingerprint.ts` and `CADCanvas.tsx` | the fingerprint must include `suppressed`, `rollback`, `group` is excluded; otherwise the viewport would not rebuild on a toggle | test: toggling suppress changes the fingerprint, renaming a group does not |
| `features/cad/lib/exactModel.ts`, `ExactModelPanel.tsx` | the exact panel reads the exact rebuild of the active timeline state | existing exact-panel tests plus a suppressed case |
| `packages/core/src/cam/generator/history-features.ts`, `cam/brep-part.ts` | **the CAM must not machine a suppressed or rolled-back feature** (a silent wrong program otherwise) | a history with a suppressed pocket yields a program without it, with a note; spec 59 consumes the same digest |
| `packages/ai` `cad_parametric` / `cad_edit` | actions or parameters `suppress`, `rollback`, `move`, `group`: parameter names only, the tool catalogue ceiling in `packages/ai/test/tool-prompts.test.ts` (32 500) is raised with a comment per addition | tool-prompts test; harness inventory regenerated, not hand-edited |
| `packages/api/src/ai-parametric.ts`, sidecar `apps/sidecar/src/http/cad-exact.ts` | schema accepts the fields; the exact route reads the timeline state; no DB change (the history lives in the drawing element) | sidecar test storing a history with a suppressed feature and reading it back |

## 6. Honest limits

- Suppression by lineage can remove more than the person expects (a hole cut into a body whose extrusion is suppressed); the state `suppressed-by`
  always names the cause, and nothing is deleted.
- Until spec 41 lands, a feature that selects geometry by position (fillet edges, shell faces) can select different geometry after a reorder; the replay
  reports the feature as `failed` only when it cannot resolve at all. This is the reason spec 58 T3 refuses moves across lineage edges.
- Incremental rebuild is an optimisation with a proof obligation (T4 gate); any divergence discards the cache and replays in full.
- Rollback of an element inside an assembly does not roll back the assembly (spec 46).

## 7. Order

T1 → T2 → T3 → T5 → T6 → T7 → T4 → T8. T4 is last because it touches every feature of `rebuild`; T2/T3 define the semantics it must preserve.

## 8. Change log

- 2026-10-25: created.
- 2026-10-27: T1–T3 built. D8 taken at its default (read-compatible superset, no migration; `version: 2` optional). `cad/history-timeline.ts`
  (`timelinePlan`, `activeHistory`, `withSuppressed`, `withRollback`, `declaredNeeds`, `bodyRefs`) is the one definition of an active feature;
  `rebuild` returns `states` and `lineage`, the exact replay skips the same features, and the readers that interpret features themselves
  (`drawing/dimensions.ts`, `cad/dfm.ts`, `cam/generator/history-features.ts`, `ai/acceptance.ts`) read `activeHistory`. `dependencyGraph` (declared,
  named-body and lineage edges from a replay with every feature active), `moveFeatureTo`, `insertFeature`; `moveFeature` now refuses a hole above
  the extrusion it cuts (the old test asserted the opposite). API `ParametricHistory` accepts the fields on all 24 kinds (a decode no longer drops
  them) and checks the marker and groups. Gate: `history-timeline.test.ts` (24 kinds suppress = history without the feature, mesh and identical
  exact B-rep; rollback = prefix on every recipe; T3 cases; T8 identity); a mutation that lets the exact replay ignore the flag fails 18 of its cases.
  Not done: `failed` dependents are not yet `skipped` (T5); lineage is the bodies a feature changed or named, so a feature that only reads a body
  without naming it (a fillet with no targets) gets edges to every body it changed, which refuses more moves than strictly needed; the
  desktop timeline, the assistant actions and the sidecar route (T7).
- 2026-10-27: T7 built (8b3c8768). `ParametricPanel.tsx`: state badges, suppress / release, roll back here, rollback bar with Roll to end, refused
  moves show the reason (`parametric-panel-timeline.test.ts`, happy-dom over the real store; not run in a Tauri window).
  `cad_edit.parametric_timeline` (suppress, release, rollback, rollForward, move, `expectedRevision`), applied in the sidecar by
  `editTimeline` (refused when it makes a feature fail that built before); the parametric report lists the features not built. The exact
  route already follows the stored timeline (`elementBrep` → `rebuildExact`); `ai-parametric-timeline.test.ts` proves it on the stored part.
  Open from T7: the fingerprint still includes `group` (a rename rebuilds the viewport needlessly).
- 2026-10-27: T5 built. A fillet / chamfer that does not fit every selected edge fails as a whole (body left as it was, per-edge
  warnings kept) with `Issue.remedy`: the largest size every selected edge takes, by bisection on the same meshes, rounded down and
  checked again; the gate rebuilds with it. Behaviour change: a partly fitting fillet used to blend the edges it could and only warn.
  A feature naming a failed (or skipped) one is `skipped` with the failed root and an error issue saying so; features that only act on
  the remaining bodies still build; the exact replay skips the same. Panel: "not built: X failed" and the remedy under the issue; the
  assistant report lists skipped features with their cause. Remedies for shell, Boolean and thread failures are not built yet (their
  errors keep today's text).
