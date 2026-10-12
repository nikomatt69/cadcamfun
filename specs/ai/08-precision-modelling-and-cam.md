# AI-08 - Precision modelling and manufacturing depth

Status: specified / implementation pending.

## Control and scope

Controlling step: [RM-09](../roadmap/09-cad-cam-depth.md), dependent on [RM-02](../roadmap/02-multi-op-setup.md) for pure-core work, additionally [RM-03](../roadmap/03-api-parity.md) receipts and [RM-06](../roadmap/06-context-awareness.md) intent/context for precision integration. [Roadmap](../roadmap/README.md) and [process](../roadmap/00-how-to-follow.md) alone control implementation sequence. RM-01 is current. This publication neither advances RM-09 nor makes precision work an alternate execution track. Core-only work does not waive the later integration prerequisites.

RM-09's actual deliverables remain: swept-cutter/holder collision in `cam.verify`; drop-cutter pencil/scallop/flowline mill operations; parametric `fillet`, `shell`, `pattern-along-path`; skill/prompt exposure only after RM-01 catalogue and deterministic core tests. Precision contracts below require contract-first additions to RM-09, not silent substitution for that list. No exact B-rep kernel in RM-09.

Effect `4.0.0-rc.112`, `@nikcli-ai/sdk-next@1.428.0`, Bun, SolidJS, Tauri and SQLite stay. Application workflows use `Context.Service`, explicit Layers, named `Effect.fn`, tagged failures and scope cancellation after reading installed v4 docs. `packages/core` geometry, constraint, mesh, toolpath and measurement hot loops are pure functions over readonly data; no Effect runtime in them. nikcli owns bounded modeler orchestration; AI SDK v7 does not become a second mutation loop.

## Rationale and source evidence

- `packages/core/src/cad/history.ts`: existing ordered sketches/extrude/revolve/hole/pattern, `solveSketch`, mesh CSG, skipped-feature issues, degree-valued revolve/pattern fields, hard-coded prism meshing `0.01` and Float32 placement. This is the foundation to deepen, not replace with a second modeller.
- `packages/core/src/cad/sketch.ts`, `history-edit.ts`, `expr.ts`: constraints, expression-valued dimensions and editable history already exist. Use their public Interface and regression corpus.
- `packages/core/src/cad/tolerance.ts`: `segmentsFor`, `chordError`, finite tolerance range and segment cap. Requested tolerance can exceed what a capped mesh actually achieves.
- `packages/ai/src/parametric.ts`: `historySchema` and `parametricReport` already validate references and expose bounds, body count, volume, sketch residual and DOF. `ok` is not independent dimensional/hole proof.
- `apps/sidecar/src/services/ai-parametric.ts`: `historyRevision`, inspect, nonpersisting parameter variants and tests limited to rebuild/body/volume. Preserve this nonmutation property and add acceptance, not a duplicate engine.
- `packages/ai/src/element-catalog.ts`: existing primitive/tolerance catalogue and cap warnings; simple primitive insertion remains useful.
- `apps/desktop/src/ai/drawing-context.ts`, `apps/desktop/test/cad-parametric.test.ts`: existing degree-valued rotation context and parametric UI need explicit legacy/UI conversion.
- `packages/core/src/cam/verify/`, `packages/core/src/cam/generator/`, `packages/core/src/cam/post/`, `packages/core/src/cam/setup.ts`, `packages/core/src/cam/program-evidence.ts`: existing deterministic manufacturing and artifact-evidence foundations. Program grouping remains governed by RM-02; do not assume the plan's `program/` directory already exists.
- `specs/12-professional-cad-cam.md`, `specs/14-cad-cam-parity-roadmap.md`, `specs/03-core-cad.md`, `specs/04-core-cam.md`: mesh/solver history exists; exact-kernel and controller acceptance remain unmet. Historical capability/status descriptions conflict in places; fixture evidence must determine current exposure.

## Module, Interface and Implementation

Deepen the existing Modelling module behind `inspect -> preview -> measure -> commit`; the Interface includes units/version, frames, tolerance policy, required checks, candidate identity and expected revision. The pure Implementation reuses `historySchema`, `rebuild`, `solveSketch`, `parametricReport`, `historyRevision` and tolerance helpers. Acceptance measurement must not merely echo requested parameters. The Manufacturing module retains setup/generate/emitted-NC verification with revisioned evidence. Embedded action and typed HTTP are adapters at the same execute seam; the geometry seam stays existing and pure.

Deletion test: without this depth, precision rules, partial-feature failures and acceptance logic would reappear in prompts, sidecar handlers and desktop save paths. Keeping deterministic acceptance local earns locality; small preview/commit Interface earns leverage for human editing and nikcli. A second kernel facade or a prompt-only precision wrapper fails this test.

## Exact owners and contract-first amendments

| Owner | Allowed directories / explicit shared files | Purpose |
| --- | --- | --- |
| WP1 current | `packages/core/src/cad/` | Existing pure constraints/history/mesh/measurement and colocated tests |
| WP2 current | `packages/core/src/cam/`, `packages/core/test/cam/` | Verification, strategies, posts, NC fixtures |
| Core amendment | shared `packages/core/src/index.ts`, `packages/core/src/cam/index.ts` | Narrow exports only after deterministic tests |
| WP8 amendment | `packages/ai/src/`, `packages/ai/test/` | Shared quality/action adapters, bounded modeler prompts and fixtures |
| WP3 amendment | `packages/api/src/schemas/`, `packages/api/src/groups/`, `packages/api/src/sdk/generated/`; shared `packages/api/src/index.ts` | Canonical units, acceptance and preview/commit schemas |
| WP4 amendment | `apps/sidecar/src/services/`, `apps/sidecar/src/repos/`, `apps/sidecar/src/http/`, `apps/sidecar/test/`; shared `apps/sidecar/src/layers.ts` | Candidate lifecycle, atomic revision commit and exact-artifact verification |
| WP6 amendment | `apps/desktop/src/ai/`, `apps/desktop/src/cad/`, `apps/desktop/src/cam/`, `apps/desktop/test/` | Nonmutating overlay, accept/reject and quality/limits presentation |

RM-09's concurrent 2026-10-12 amendment already adds precision integration and narrow exposure owners; retain its stricter prerequisites and scopes. Before implementation reconcile the exact table with RM-09 and amend any missing scopes plus `specs/03-core-cad.md`, `specs/04-core-cam.md`, `specs/12-professional-cad-cam.md`, `specs/14-multi-op-setup.md`, `specs/08-ai.md`, `specs/05-api-sidecar.md`, `specs/06-desktop-ui.md`. Table directories are proposed task-specific scopes, not permission for unrelated changes. Land core tests before exposing fields/actions in other owners. DB revision/receipt storage must be supplied by earlier approved WP0 contracts; this owner list does not grant DB edits. If another migration is necessary, add explicit WP0 `packages/db/src/` and `packages/db/drizzle/` ownership through contracts first. No dependency/kernel, mobile, viewport-WP7 or Tauri edits implied.

## Precise Interface and invariant contracts

### Intent, units and tolerance propagation

`DesignIntent` (the modelling intent contract from AI-05) is versioned and contains document/base revision, named dimensions and required tolerances, datums, right-handed coordinate frames, expected bodies/features, allowed residual DOF, material reference and measurement requirements. Manufacturing-critical absent dimensions/references become native nikcli questions, never invented exact values. Interpret relative instructions against inspected revisioned evidence. Imported meshes do not acquire fabricated feature history.

New canonical histories/envelopes declare `schemaVersion: 2`, `lengthUnit: mm`, `angleUnit: rad`; finite validated values only. Existing unversioned histories decode as explicit legacy version 1 with degree-valued angle slots, not silently as radians. Inventory angle fields individually: revolve angle/default, circular pattern span/default, angle constraints, element/component rotations and expression-valued parameters. A parameter used as both length and angle is not globally multiplied: preserve expression source/dependency meanings, convert at typed angle evaluation or rewrite a versioned typed expression AST with evidence. Unsupported/ambiguous dimensions fail migration for review. Defaults convert explicitly (full turn becomes `2*pi`), including omission semantics. UI and posts use explicit conversion adapters; no degree-valued new history crosses the core Interface.

Add a pure rebuild options contract carrying meshing chord and solver policies through sketches, profile extraction, prism/revolve/hole/pattern, transforms and Booleans; remove hidden fixed tolerances only with regression coverage. Each stage reports effective values/caps rather than substituting the global drawing tolerance as proof. Validate transforms and unit round trips, including nested frames and expression angles. Tolerance presets remain requests, not guarantees.

| Independent budget | Contract and reporting |
| --- | --- |
| Dimensional acceptance | Per named length/angle/position requirement, unit, datum/frame, requested bound and independently measured deviation |
| Solver residual | Length/angular residual scales, convergence status, iterations, DOF/redundancy; solver acceptance alone proves no mesh accuracy |
| Mesh chord error | Requested/effective chord bound, segment/triangle caps and observed geometric deviation; cap hit is a visible limit |
| Float32 coordinates | Quantization error at actual local/world coordinate magnitudes, accumulated transform effects and measured representability; do not claim micron accuracy at large coordinates |
| Boolean epsilon | Actual numeric policy and degeneracy/near-tangent findings; independent of solver/chord error, not an exact topology certificate |
| CAM chord/scallop | Requested and achieved supported strategy bounds, tool/stock evidence and generation limits; does not inherit CAD acceptance automatically |
| Verification resolution | Stock/collision sampling or swept coverage, uncertainty and unmodelled machine motion; report coverage honestly |
| NC rounding | Post decimals/unit conversion and replayed output deviation; default three decimals is not universal precision proof |

An aggregate error budget may only be emitted with a validated composition method and provenance; otherwise list limits separately. Tighter requests either reduce observed error or produce `PrecisionLimit`/cap/unsupported evidence. No single tolerance flag or global micron guarantee.

### Candidate preview and atomic commit

`preview(input, trustedContext)` takes immutable base history/document revision, validated proposed history/parameter changes, intent and tolerances. It performs deterministic rebuild and independent acceptance without repository mutation, persistent undo, setup invalidation or canvas replacement. Return `candidateId`, owner/project/document, `baseRevision`, canonical input/history digest, intent/tolerance/engine versions, candidate mesh digest, `QualityReport`, evidence references and expiry. A bounded authorized candidate cache may retain ephemeral data; cache eviction fails with `CandidateExpired`, not reusing another candidate.

Digest covers decoded canonical history, units/schema, frames, acceptance requirements, effective options and implementation version with a specified stable serialization/hash; do not use incidental object insertion order as a new correctness contract. Preserve `historyRevision` legacy comparison through an explicit adapter, separating content digest from authoritative document revision. Measurement results bind the candidate mesh/history digests; changing requirements or repaired geometry creates a new candidate and report.

`commit({candidateId, candidateDigest, expectedRevision, operationKey}, trustedContext)` revalidates owner, current write authority, native approval evidence where required, candidate expiry/digest, engine/version and all required acceptance. Under document serialization, compare expected/base revision, check cancellation immediately before one atomic transaction, then store history/geometry, next revision, receipt and dependent setup/toolpath/program/verification invalidations. No partial body/feature save. A stale base returns `RevisionConflict` without rebasing or overwriting a human edit; present a new preview against current revision. If rebuild is repeated before commit, it must match recorded digest and evidence or require new acceptance.

Operation key/digest duplicate returns recorded receipt; changed input for the same key fails. Post-commit interruption returns committed evidence, not a false cancelled/no-change result. Unknown commit outcome follows AI-06 receipt reconciliation, never blind replay. Desktop renders preview overlay separate from committed geometry; reject/expiry/cancel deletes only ephemeral preview. Persistent undo uses the same revisioned execute seam; no local undo pretending the DB changed. Re-read committed revision/digest/evidence after success.

### QualityReport and independent measurement

Versioned report contains representation `mesh|parametric-mesh` (exact only if a future verified Implementation exists), candidate digests, engine/version, requested/effective budgets, datum/frame/unit provenance, body count, bounds/volume, all feature issue identities, solver statuses/DOF/residual and per-check outcome `pass|fail|unsupported|uncertain` with method, measured value/error and source revision. Omitted diagnostics include counts and cannot hide required failure.

Required feature skipped/error, nonfinite geometry, wrong body count, conflicting/failed required sketch, undeclared DOF on a closed manufactured profile or failed required dimension prevents successful acceptance/commit. Redundancy/underconstraint is accepted only under explicit intent policy with measured stability evidence, not because volume is positive. Required unsupported/uncertain checks prevent an accepted precision claim; exploratory preview may still be displayed as unaccepted. Never label invalid topology valid.

Measure hole centres, axes, diameters, depths, spacing and supported counterbores in named datum frames. Independent mesh section/reference-point measurements must find the actual openings/material, not copy HoleFeature parameters. Cross-check semantic feature expectations with resulting mesh connectivity/sections after Booleans. Bounds and total volume alone cannot detect displaced, missing or incorrect holes. Define methods for planar/shaft dimensions and angular frames; fixtures supply analytic expected values independent of candidate generation. Record mesh discretization uncertainty. Topology checks explicitly identify implemented degeneracy, manifold edge incidence, winding/orientation and self-intersection coverage; missing self-intersection coverage is `unsupported`, not a pass.

### Bounded nikcli repair and manufacturing evidence

Modeler flow: inspect -> resolve intent/native questions -> editable history -> preview -> measure -> bounded repair -> explicit revisioned commit -> re-read. Expose deterministic capability only after tests. Preserve primitives for simple tasks. No model-generated scripts, shell execution or arbitrary kernel code. Repairs use configured finite attempt, wall-time/computation, token and mesh-size budgets, recorded per invocation; stop at the first exhausted budget. Do not invent budget numbers before fixtures/measurement. Repair cannot relax required tolerances, remove required features or save failed previews without explicit changed user intent. A failed loop returns feature/residual/limit evidence and a question or unsupported result.

Setups bind part revision, stock, WCS, fixtures, cutter/holder, machine/post, units and artifact identity. Verify actual emitted/stored NC bytes and hash against the setup/model revisions; never silently regenerate then label the prior program verified. Inspection is read-only; generate-and-persist verification is a separately classified write. Gouge/holder/fixture findings remain tagged codes. Reports distinguish sampled/swept checks, target/stock coverage, unsupported kinematics and machine/controller unknowns. Passing simulation is not certification or authority to actuate hardware.

## Numbered deliverables

1. Amend precision/units/owner contracts; add legacy round-trip fixtures and propagate distinct tolerances through existing pure rebuild paths.
2. Add independent dimensional/feature/mesh evidence and required-check acceptance to existing reports, including cap/Float32/Boolean limits.
3. Add nonmutating preview, digest-bound acceptance and atomic expected-revision commit with artifact invalidation; UI preview/reject cannot persist.
4. Add bounded native modeler repair only over tested deterministic capability; expose failures and missing-dimension questions.
5. Deliver actual RM-09 swept cutter/holder collision and deliberate gouge/fixture traps, preserving tagged findings and stored-NC identity.
6. Deliver actual drop-cutter pencil/scallop/flowline and parametric fillet/shell/pattern-along-path with core fixtures first, then catalogue/skills and typed/UI exposure. Existing function names do not substitute for measured supported behavior.
7. Document future exact-kernel investigation criteria only; no kernel adoption or commercial-parity claim.

## Non-goals and future B-rep ADR gate

No exact B-rep/STEP round-trip claim, commercial Fusion/hyperMILL equivalence, global micron guarantee, new kernel/dependency, simultaneous 5-axis expansion or machine actuation. Mesh repair cannot fabricate exact topology. Existing import dependencies do not prove editable exact B-rep modelling.

A future separately approved ADR and ordered roadmap extension must evaluate licensing/distribution, deterministic topology and stable feature references, real STEP export/re-import, Bun compiled-sidecar/Tauri packaging, measured numerical accuracy, performance/resource budgets and representative Boolean/fillet/shell/feature corpus. Include migration, dual-representation ownership and rollback before adopting a kernel. This is an investigation gate outside RM-09, not permission to implement now.

## Migration, failure and rollback

Keep legacy fixtures/read decoder before defaulting to v2. Test read/preview/edit/save/reopen for numeric and expression degree histories and defaults. Never reinterpret saved numbers silently or globally scale mixed parameters. Preserve original document/version and migration evidence; ambiguous histories stay legacy read-only until reviewed. New canonical writes require validated conversion and expected revision. Unsupported mandatory precision/features fail honestly; partial preview stays nonpersisting.

Use vertical rollout: core options and tests, reports, preview, one accepted action family, consumers, then retire private legacy adapters. No permanent dual modeller/catalogue. On digest mismatch, stale revision, insufficient authority, numerical limit or cancellation before commit, leave DB and artifacts unchanged. On crash after commit reconcile receipt. Rollback disables new candidate admission/commit while retaining receipts and v2 decoder; never reopen v2 under a degree-only decoder or drop acceptance to get a successful result. Any DB extension uses WP0 generated migrations only after owner amendment.

## Tests and Verify

Existing: `packages/core/src/cad/history.test.ts`, `history-edit.test.ts`, `sketch.test.ts`, `csg.test.ts`, `surface.test.ts`; `packages/core/test/cam/generator.test.ts`, `post-tool-changes.test.ts`; `packages/ai/test/parametric.test.ts`, `element-catalog.test.ts`; `apps/sidecar/test/ai-parametric.test.ts`, `ai-cam-tools.test.ts`; `apps/desktop/test/cad-parametric.test.ts`, `cam-verify.test.ts`.

Proposed: `packages/core/src/cad/precision-acceptance.test.ts`, `history-units.test.ts`, `packages/core/test/cam/swept-verification.test.ts`, `finishing-precision.test.ts`, `apps/sidecar/test/ai-candidate-commit.test.ts`, `packages/ai/test/modeler-repair-budget.test.ts`, `apps/desktop/test/cad-candidate-preview.test.ts`. Test through public rebuild/preview/commit/verify Interfaces, not helper-only mocks.

Reference corpus: dimensioned plate/bolt pattern and counterbores only where supported; L-bracket; stepped revolved shaft; constrained pocket; repeated-hole flange; nested frames; Boolean intersections; thin-wall/degenerate/near-tangent cases; large-coordinate small-feature inputs; imported mesh without fake history. Independently measure named dimensions/holes against per-part mm/rad tolerances, test predictably regenerated parameters, invalid topology, unsupported required feature, cap reached, altered digest, concurrent human edit, duplicate commit and cancellation. Deliberate same-volume/wrong-hole candidates must fail. Include rounded-NC deviation and cutter/holder/fixture/gouge traps.

Implementation Verify commands, not executed here. `typecheck` confirmed in all named manifests; `generate:check` confirmed in API manifest. Run with Monitor and offline fixtures, without `.env` reads or new dependencies:

```sh
bun --no-env-file test packages/core packages/ai apps/sidecar/test apps/desktop/test
bun --no-env-file run --filter @cadcamfun/core typecheck
bun --no-env-file run --filter @cadcamfun/ai typecheck
bun --no-env-file run --filter @cadcamfun/api typecheck
bun --no-env-file run --filter @cadcamfun/sidecar typecheck
bun --no-env-file run --filter @cadcamfun/desktop typecheck
bun --no-env-file run --filter @cadcamfun/api generate:check
git diff --check
```

Native responsiveness and packaged-sidecar checks require separate recorded local workload/build evidence; mock tests are not native proof. Controller acceptance requires identified profiles and supervised dry runs, not automated actuation here.

## Pending acceptance checklist

- [ ] RM prerequisites and contract-first owners approved; actual RM-09 deliverables retained.
- [ ] Existing history/constraints/mesh reused; pure loops and mm/rad v2 verified with legacy degree/expression round trips.
- [ ] Requested/effective tolerance propagates; Float32, chord, solver and Boolean limits reported separately.
- [ ] Independent dimensions/holes/features/topology evidence meets per-part achievable tolerances; unsupported checks never pass.
- [ ] Preview does not mutate; digest/expected-revision atomic commit, duplicate receipts and conflict/cancel/crash behavior verified.
- [ ] Bounded repair cannot save failed preview or silently relax intent.
- [ ] Swept verification, finishing operations and named parametric features pass deterministic corpus before exposure.
- [ ] Exact stored NC/hash verified; no exact B-rep, commercial-parity or certification claim.
- [ ] Verify evidence recorded by owners before RM-09 completion; future kernel remains ADR-gated.

## Change log

- 2026-10-12: Documentation-only precision contract specified from approved plan. Added explicit legacy-degree migration, tolerance/measurement limits and digest-bound preview/commit design while retaining actual RM-09 deliverables. Required cross-owner amendments and future B-rep ADR gate recorded, not implemented. No tests executed.
