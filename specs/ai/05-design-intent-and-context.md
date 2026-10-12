# AI-05 - Design intent and scoped workspace context

Status: **specified; implementation pending**.
Stack: Effect **4.0.0-rc.112** and nikcli **@nikcli-ai/sdk-next 1.428.0** throughout.

## Authority and dependencies

Controlling step: [RM-06](../roadmap/06-context-awareness.md); dependency: RM-01 catalogue/authority contract.
Follow [the single sequence](../roadmap/README.md), [process](../roadmap/00-how-to-follow.md) and [umbrella](../28-native-ai-architecture.md).
Read [context design](../19-context-awareness.md), [project context](../25-project-ai-context.md) and [conventions](../01-conventions.md).
Use landed RM-03 revision and RM-02 setup evidence; missing prerequisites remain explicit unavailable context, not invented fields.
RM-06 specifies dimension intent; new geometric acceptance/precision preview implementation remains [RM-09](../roadmap/09-cad-cam-depth.md).

## Source evidence

- [Approved plan](../../.nikcli/plans/1791820593388-shiny-garden.md), AI-05, calls for typed intent and isolated notes.
- [Workspace renderer](../../packages/ai/src/workspace-context.ts) already budgets sections at 6,000 characters and labels omitted data.
- [Project context](../../packages/ai/src/project-context.ts) and [drawing snapshot](../../apps/desktop/src/features/ai/lib/drawing-context.ts) are existing implementations to deepen.
- [Sidecar context assembly](../../apps/sidecar/src/http/ai.ts) and [memory handlers](../../apps/sidecar/src/services/ai.ts) expose generic memory scope risks.
- [Parametric module](../../packages/ai/src/parametric.ts) and [element catalogue](../../packages/ai/src/element-catalog.ts) already provide supported modelling facts and limits.
Static risks are not reproduced leaks; dimension correctness and scope isolation require regression fixtures.

## Owners and contract-first amendments

- WP8: `packages/ai/src/workspace-context.ts`, `packages/ai/src/project-context.ts`, `packages/ai/src/parametric.ts`, `packages/ai/src/element-catalog.ts`, `packages/ai/src/skills/`, `packages/ai/test/`.
- WP8 typed memory implementation: `packages/ai/src/project-memory.ts`, `packages/ai/src/actions/` and `packages/ai/src/tools/` only for scoped remember/recall actions.
- WP6: `apps/desktop/src/features/ai/lib/drawing-context.ts`, `apps/desktop/src/features/ai/store/store.ts`, `apps/desktop/test/` for snapshot and context-off consumers.
- WP11: `packages/vcs/`, `apps/sidecar/src/services/project-vcs.ts` and `apps/sidecar/src/services/ai-vcs-tools.ts` for authorized recent-history facts only.
- Required WP3 amendment: `packages/api/src/` and `packages/api/test/` for versioned intent/snapshot/memory wire schemas.
- Required WP4 amendment: `apps/sidecar/src/http/ai.ts`, `apps/sidecar/src/services/ai.ts`, `apps/sidecar/src/repos/`, `apps/sidecar/test/` for scope authorization and authoritative assembly.
Amend RM-06 owner/deliverable lists and context/shared contracts before cross-WP implementation; no implicit new DB columns.
If storage shape changes, add WP0 `packages/db/` through a prior database contract amendment; publication owns only this file.

## Module, Interface, Implementation

Module: deepen workspace context and design intent in the existing renderer/project memory implementation.
Interface: authorized versioned snapshot plus intent/notes and budget -> deterministic bounded context with provenance.
Implementation: sidecar Effect authorization/decoding, desktop snapshot adapter and one pure budgeted renderer.
Depth hides trust, scope and truncation rules; leverage gives nikcli consistent engineering facts without another prompt builder.
Locality puts rendering/selection rules together; deleting the module would scatter context assembly among consumers.
Desktop contribution and authoritative sidecar enrichment are adapters at the snapshot seam, not competing sources of geometry truth.
The renderer and authorized assembly interface are the test surface; no pass-through module merely renames generic KV access.

## Precise contracts

- `DesignIntent` is versioned and binds project/drawing/base revision, units/frame/datums, dimension constraints, named features, material references and expected bodies.
- Dimensions declare target/range and requested tolerance; acceptance identifies measurement kind/reference and supported/unsupported status.
- Keep dimensional tolerance, solver residual, mesh chord error, Boolean limits, CAM tolerance, verification resolution and NC rounding independent.
- Required unknown manufacturing dimensions trigger a native nikcli question; never invent exact size or treat a prompt as measured geometry.
- Preserve primitive insertion for simple tasks; prefer editable constrained sketches/history where supported, without fake imported-mesh history.
- Intent is requested design, not achieved quality; only authoritative measured evidence may claim acceptance, with provenance and representation.
- `WorkspaceSnapshot` includes version, actor scope, project/drawing, authoritative revision/capture time, selection IDs, frames/units and unsaved intent.
- Desktop contributes selection/view and unsaved intent; sidecar supplies authorized model/setup/library/artifact/verification facts.
- Bind selected feature/parameter references to their revision; stale/deleted selections are labelled, not silently remapped.
- Snapshot carries setup/stock/WCS, machine limits, actual NC hash/revision, verification timestamps/coverage and next machining decision where known.
- Include at most three authorized recent commits; empty/unavailable history remains absent, never a fabricated narrative.
- Canonical lengths are mm and angles radians; explicitly decode legacy degrees including expressions without silently altering saved histories.
- Memory note includes ID, actor/project scope, kind (`preference`, `lesson`, `spec`), content, provenance, trust, revision and timestamps.
- Project notes are keyed/query-filtered by trusted actor plus project; no all-project `ai.memory.*` scan in prompt assembly.
- Explicit approved actor-global preferences are a separate namespace and opt-in selection, not global shared memory.
- Memory writes use immutable actor/resource `canWrite` and actual write classification; model-provided scope cannot authorize another actor/project.
- Authorize snapshots, notes, history and attachments before rendering; instructions/reference text are untrusted data and cannot grant rights.
- `includeContext=false` disables optional automatic workspace/memory injection server-side; it does not disable identity/authorization or explicit user instructions.
- Context-off policy propagates from UI through admission to renderer; user-supplied attachment scope still requires authorization.
- Renderer defaults to 6,000 characters, deterministic priorities and explicit omission/stale labels; caps hold including labels and Unicode text.
- Preserve identity/units/revision before optional detail; zero budget emits no optional context, and truncation cannot imply complete evidence.

## Deliverables

1. Publish shared versioned intent/snapshot/note contracts using authoritative Effect wire schemas and AI-01's tested nikcli adapter policy.
2. Assemble authorized authoritative evidence with desktop selection/unsaved intent; label stale, unavailable and unsupported facts.
3. Replace generic memory access with actor/project-filtered recall and separately approved actor preferences.
4. Deepen the existing budgeted renderer with selected parameters/features, recent history and evidence-based next-decision hints.
5. Update modelling guidance to clarify missing dimensions and prefer supported parametric construction without announcing RM-09 capability early.
6. Specify and test context-off semantics end-to-end plus scoped legacy memory migration and prompt-injection resistance.

## Non-goals

No global shared memory, automatic training, second prompt builder, provider orchestration replacement or arbitrary model-generated geometry scripts.
No new precision evaluator/preview backend, exact B-rep, unapproved dimensional defaults or credentials stored in KV.

## Migration and failure handling

Legacy memory with ambiguous actor/project ownership stays excluded until authorized review/assignment; never guess scope from key text alone.
Legacy snapshots decode by explicit version/unit adapter; unknown versions are rejected and refreshed, not trusted as authority.
Denied or unavailable evidence is omitted with an appropriate non-leaking availability label; never fall back to another actor/project cache.
Stale intent asks for refreshed references before mutation; unsupported required measurement prevents a success claim.
Budget overflow truncates optional sections deterministically; injection text remains labelled data and cannot forge authority or renderer headings.

## Tests

Test public assembly/renderer interfaces with explicit Effect Layers, scoped KV fixtures and offline native-question fixtures.
Exercise cross-actor/project sentinels, denied attachments/history, preference opt-in and ambiguous legacy memory quarantine.
Assert selected frame/unit/reference accuracy, stale snapshots, independent tolerance fields and native questions for missing critical dimensions.
Check deterministic budgets including zero/small budgets and Unicode, no invented facts, and server-to-UI context-off policy.
Verify text cannot authorize writes or cross scopes; precision acceptance stays unavailable without measured supported evidence.

## Verify

Manifests confirm AI/API/sidecar/desktop/VCS `typecheck` and API `generate:check`; use Monitor during implementation.
These commands are future gates, not runtime checks performed by documentation publication.

```sh
bun --no-env-file run --filter @cadcamfun/ai typecheck
bun --no-env-file run --filter @cadcamfun/api typecheck
bun --no-env-file run --filter @cadcamfun/sidecar typecheck
bun --no-env-file run --filter @cadcamfun/desktop typecheck
bun --no-env-file run --filter @cadcamfun/vcs typecheck
bun --no-env-file run --filter @cadcamfun/api generate:check
bun --no-env-file test packages/ai packages/api packages/vcs apps/sidecar/test apps/desktop/test
git diff --check
```

## Acceptance checklist

- [ ] Dimension intent separates requested constraints from achieved supported measurements.
- [ ] Snapshot/frame/selection/revision and next-decision evidence are authoritative or explicitly unavailable.
- [ ] No cross-actor/project memory/context leaks; preferences are separately approved and legacy ambiguity excluded.
- [ ] Bounded rendering, native clarification and server-to-UI context-off tests pass.
- [ ] Cross-WP contracts precede edits; RM-06 completion does not imply RM-09 precision implementation.

## Change log

- 2026-10-12: specified dimension intent, revisioned workspace evidence and actor/project-isolated context/memory; implementation pending.
