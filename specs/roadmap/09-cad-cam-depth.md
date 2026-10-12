# RM-09 — CAD/CAM depth (parity slice)

Status: **pending**. Depends on: RM-02 for pure-core work (setup grouping exists before more operations); RM-03 (document revisions/receipts) and RM-06 (versioned intent/authorized context) additionally for precision integration. Design: `12-professional-cad-cam.md`, `14-cad-cam-parity-roadmap.md`, `20` Phase 6, [AI-08](../ai/08-precision-modelling-and-cam.md). Owners: WP1 `packages/core/src/cad`, WP2 `packages/core/src/cam`; narrowly scoped WP8/WP3/WP4/WP6 exposure only after these integration prerequisites and pure-core gates, as listed below.

## Problem

Mesh chamfer/fillet/shell/sweep/loft and lathe ops are cited **done** in `21` §17; still **pending**: pencil/scallop/flowline, swept-cutter collision, parametric `fillet`/`shell`/`pattern-along-path` features. `12-professional-cad-cam.md` forbids calling this Fusion/hypermill equivalent.

Keep **core** as the deep module: pure functions, existing public interface is the test surface. Desktop/sidecar only gain Schema fields after core tests exist.

Do not add a B-rep kernel in this step (license + STEP gate in spec 12 §1). Mesh must not masquerade as exact geometry.

## Effect v4

- None in hot loops. Schema at `packages/api` / AI action edges only after core functions exist.
- Units: mm and radians internally.

## Deliverables (order)

1. Swept-cutter / holder collision in `cam.verify` (findings stay tagged codes).
2. Pencil / scallop / flowline as named mill operations, drop-cutter based.
3. Parametric features `fillet`, `shell`, `pattern-along-path` in history rebuild.
4. Skill/prompt updates only after RM-01 catalogue (same commit as the core tests).

## Verify

Pure-core gate (independent of RM-03/RM-06 once RM-02 is done):

```bash
bun --no-env-file test packages/core
bun --no-env-file run --filter @cadcamfun/core typecheck
```

Gates from spec 12: deliberate gouge detected; no marketing claim of parity.

Precision integration gate (only after RM-03 and RM-06 are done and core tests pass):

```bash
bun --no-env-file run --filter @cadcamfun/ai typecheck
bun --no-env-file run --filter @cadcamfun/api typecheck
bun --no-env-file run --filter @cadcamfun/sidecar typecheck
bun --no-env-file run --filter @cadcamfun/desktop typecheck
bun --no-env-file test packages/core packages/ai packages/api packages/db apps/sidecar apps/desktop
```

The DB suite is regression coverage for RM-03 persistence, not new DB ownership. Required interface-level integration checks:

- Propagate declared tolerances and versioned mm/radian intent through schemas, AI actions, sidecar execution and desktop previews. Independently check dimensions/features/topology, legacy angle conversion and honest unsupported/failed features; volume alone cannot pass a candidate.
- Preview creation does not mutate authoritative documents/revisions, persist verification reports or trigger workflows. Desktop displays candidate evidence separately from accepted geometry. Acceptance is a separate authorized action bound to candidate identity, source revision and intent version.
- Reject forged actor context, cross-project candidate access and missing write rights before acceptance. Native approval survives the host adapter; model confirmation is not authority.
- Cancel before/during preview and before acceptance commit without authoritative mutation or partial batches. Cancellation after commit preserves the committed receipt and reconciles once, rather than pretending rollback or repeating acceptance.
- Stale document/intent/candidate versions return typed conflicts without overwriting newer edits. Duplicate acceptance returns the same receipt without another revision increment; reuse of an invocation identity with different content fails. Test atomic validation/commit and receipt-based desktop reconciliation, including late results.
- Verify actual emitted NC against its hash, setup/document revision, tool/machine identity and declared tolerance. Changes invalidate prior evidence; preview evidence cannot certify accepted or changed NC, and substitute regeneration cannot silently count as verification.

These are future implementation gates; this documentation amendment does not claim they pass.

## Native AI contract scope

Pure-core algorithms/fixtures may proceed after RM-02 without RM-03 receipts or RM-06 intent/context; they remain I/O-free and introduce no preview persistence or acceptance execution. Precision integration below waits for both RM-03 and RM-06 rows to be done as well as core tests. Published contracts alone do not satisfy these implementation prerequisites.

Implement [AI-08](../ai/08-precision-modelling-and-cam.md) under this step, preserving the existing pure-core deliverables. After core tests pass, added owners are WP8 `packages/ai/src` quality/actions/skills, WP3 `packages/api/src` quality/preview schemas, WP4 `apps/sidecar/src/services/ai-parametric.ts` and AI handlers, WP6 `apps/desktop/src/ai` and existing parametric/verification consumers, plus matching tests. Precision integration depends on the prior receipt/intent contracts. Add declared tolerance propagation, versioned legacy angle conversion, independent feature/dimension evidence, candidate preview and atomic acceptance commit. Required unsupported/failed features fail honestly. No exact B-rep dependency or machine certification. Verify each fixture against declared achievable tolerances; volume alone is not a precision gate.

## Change log

- 2026-10-12: [AI-08](../ai/08-precision-modelling-and-cam.md) and [spec 28](../28-native-ai-architecture.md) deepen supported geometry with tolerance propagation, versioned angle conversion, independent dimension/feature/topology evidence, non-mutating candidate previews and revision-checked commits, plus bounded nikcli modeler repair. Additional scoped owners after pure-core gates: WP8 `packages/ai/src` quality/actions/skills, WP3 `packages/api/src` quality/preview schemas, WP4 `apps/sidecar/src/services/ai-parametric.ts` and AI handlers, WP6 `apps/desktop/src/ai` and existing CAD/CAM parametric/verification consumers. Matching tests included. Uses prior receipt/intent contracts; no new B-rep dependency or parity claim. Implementation pending.

- v1: next core depth slice after setups work.
- 2026-10-12: explicitly gated precision integration on RM-03/RM-06, distinct from pure-core work; expanded Verify across affected workspaces for authorization, cancellation, conflicts, receipts, preview/acceptance and actual-NC identity. Documentation only; no gate claimed.
