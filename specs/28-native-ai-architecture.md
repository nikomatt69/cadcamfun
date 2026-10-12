# 28 - Native AI architecture for precise CAD/CAM

Status: **specified; implementation pending**. Approved design publication, 2026-10-12. Owners: WP8, with explicitly scoped WP0/WP1/WP2/WP3/WP4/WP6/WP9/WP11/WP13 work in the controlling RM specifications. No runtime change or migration is shipped by this document.

## 1. Authority and objective

[The ordered roadmap](roadmap/README.md) and [its process](roadmap/00-how-to-follow.md) remain the only implementation sequence. [AI step contracts](ai/README.md) deepen that sequence, not replace it. RM-01 is current; publishing a later design does not start that implementation or satisfy its dependencies. Existing design contracts remain applicable; the amendments explicitly identified here supersede contradictory assertions in specs 26 and 27, not unrelated contracts.

The objective is a native engineering colleague that constructs dimension-driven editable parts, explains measured limits, and generates and verifies manufacturing artifacts through the same application actions as the user. Fusion 360 and hyperMILL are capability-direction references, not a present equivalence claim. "Perfect" means explicit, testable contracts tailored to CADCAMFUN, not unlimited geometry or machine certification.

## 2. Retained architecture

- Effect **4.0.0-rc.112** owns application workflows, Layers, resources, interruption and typed errors. Read the installed version-matched docs before implementation; use `Context.Service`, `Effect.fn`, `Schema.decodeUnknownEffect` and `Effect.acquireRelease` as specified in [conventions](01-conventions.md).
- nikcli **sdk-next 1.428.0** owns agent loops, sessions, native permissions/questions, specialist delegation and compaction. SDK coupling stays in `packages/ai/src/nikcli/`. No fork or replacement orchestration framework.
- AI SDK v7 remains the stateless/one-shot path. It is not a second mutation-capable agent loop.
- Bun sidecar, Tauri supervision, SolidJS desktop and Drizzle/SQLite remain. Geometry and CAM hot loops stay pure in `packages/core`; Effect wraps their application seams only.
- Cached scoped project hosts, bounded specialist scheduling and existing disconnect recovery are retained. No host destruction per turn or speculative AI Worker.
- One action catalogue, embedded in-process adapter first, external typed HTTP adapter in RM-11. No internal HTTP hop, MCP dispatch or model-accessible shell/filesystem tools.

## 3. Inspection evidence

This ledger records static source observations on 2026-10-12. Concurrency/security findings are risks requiring regression reproduction, not demonstrated exploits. Historical spec test counts are not current verification results.

| Observation | Source | Required improvement |
| --- | --- | --- |
| Cached, scope-owned project hosts already exist | [runtime](../packages/ai/src/nikcli/runtime.ts) | Deepen rather than replace lifetime ownership |
| Tools are still per-verb; handler results are largely Promise/unknown | [registry](../packages/ai/src/tools/registry.ts), [handlers](../packages/ai/src/tools/handlers.ts) | One typed action declaration and Effect execute |
| Spec 26 labels consolidation implemented, contrary to registry and RM-01 | [spec 26](26-tool-consolidation.md), [RM-01](roadmap/01-action-catalogue.md) | Correct status; future count/budget values are acceptance targets |
| cad_grep is already registered | [registry](../packages/ai/src/tools/registry.ts) | Preserve coverage, do not re-fix a stale missing-tool claim |
| Last-turn actor is a mutable sidecar cell used by cached handlers | [acting-user](../apps/sidecar/src/services/acting-user.ts), [chat admission](../apps/sidecar/src/http/ai.ts), [handlers](../apps/sidecar/src/services/ai.ts) | Immutable trusted actor/owner context for each invocation |
| Accessible project lookup precedes direct drawing saves | [handlers](../apps/sidecar/src/services/ai.ts) | Verify write rights independently of read visibility |
| Reviewer has verification/workflow tools; verification saves regenerated NC | [agents](../packages/ai/src/nikcli/agents.ts), [verifyOperation](../apps/sidecar/src/services/ai.ts) | Split inspection from writes and verify identified actual artifacts |
| Context assembly lists generic memory; handlers expose generic memory keys | [contextFor](../apps/sidecar/src/http/ai.ts), [memory handlers](../apps/sidecar/src/services/ai.ts) | Authorized actor/project namespaces and provenance |
| UI mirrors suffix-named results and performs local undo; snapshot pushes overwrite stored data | [editor-sync](../apps/desktop/src/ai/editor-sync.ts), [drawing-context](../apps/desktop/src/ai/drawing-context.ts) | Document-scoped revision receipts and conflict-aware persistence |
| Failed snapshot push can replace document regardless of error category | [prepareWorkspace](../apps/desktop/src/ai/drawing-context.ts) | Only confirmed absence permits explicit replacement; errors fail closed |
| Stream and task recovery already poll session state | [stream](../apps/desktop/src/ai/stream.ts), [store](../apps/desktop/src/ai/store.ts) | Deduplicated push/replay with polling fallback |
| Constraints, parametric histories and tolerance tessellation already exist | [parametric](../packages/ai/src/parametric.ts), [history](../packages/core/src/cad/history.ts), [catalogue](../packages/ai/src/element-catalog.ts) | Prefer deterministic editable construction over invented mesh coordinates |
| Variant tests check body count/volume, not full dimensional intent | [parametric tests implementation](../apps/sidecar/src/services/ai-parametric.ts) | Independent feature/dimension acceptance and quality evidence |
| Feature bodies use mesh CSG and Float32 positions; tessellation has caps | [history](../packages/core/src/cad/history.ts), [tolerance](../packages/core/src/cad/tolerance.ts) | Report achieved versus requested accuracy; no exact B-rep claim |
| History angles and editor rotations include degrees despite canonical radian convention | [history](../packages/core/src/cad/history.ts), [workspace snapshot](../apps/desktop/src/ai/drawing-context.ts) | Versioned legacy decoding and explicit conversions |

## 4. Modules, interfaces and real seams

```text
Desktop / companion / standalone nikcli
    | authorized actor, explicit document, intent and expected revision
    v
Sidecar Effect application modules and repositories
    |                                  ^ receipts, snapshots, task events
    v                                  |
ActionCatalogue: shared contracts + one Effect execute per action
    ^ embedded nikcli adapter          ^ typed HTTP adapter (RM-11)
    |
nikcli sessions / specialists / native decisions
    |
Modelling and manufacturing application implementations
    v
Pure core: constraints/history/mesh -> setup/toolpaths/post/NC verification
    |
DB-owned revisions, receipts, audit and task outcomes
```

| Module | Interface and implementation | Depth, leverage and locality |
| --- | --- | --- |
| ActionCatalogue | Stable identity, inputs/results/effects/docs; one typed Effect execute with trusted context | Deleting it redistributes classification, schemas and routing among host/HTTP/UI; centralization earns depth. Embedded and external adapters form a real seam in RM-11 |
| Modelling evaluation | Intent -> candidate -> quality evidence -> commit; existing solver/history/tolerance implementation | Deleting it scatters geometry acceptance among prompts and handlers. The interface is the test surface; no second modeller |
| Manufacturing setup/evidence | Revisioned part/stock/frame/tool/fixture/machine/post -> identified NC/report | Concentrates invalidation and capability limits rather than leaking them to each caller |
| Workspace context | Authorized versioned snapshot -> bounded renderer; existing renderer and typed intent | One implementation localizes prompt facts and trust labels; no competing desktop renderer |
| Session/task ownership | Owner-bound admission/control/cancel/recovery; cached nikcli runtime and scheduler | Memory and SQLite outcome adapters justify a durability seam in RM-07; scope finalization remains owned |

Reject pass-through additions that fail the deletion test. A new seam without a second adapter must state why it is hypothetical; naming a new service alone does not create depth.

## 5. Shared contracts and execution

`packages/api` owns dependency-safe Effect wire schemas used by HTTP and desktop. It must not import AI execution, nikcli SDK or DB. `packages/ai` owns catalogue documentation/execution interfaces and the nikcli adapter; sidecar supplies repository/core implementations. The nikcli-required zod representation is an adapter derived from or equivalence-tested against the authoritative wire contract, never another independently maintained source of truth. Validate constraints/defaults/union semantics and errors in both directions.

Each ActionSpec declares identity, parameters, result, documentation, effects, capability/exposure and transport mapping. Resource rights, native tool permissions and scheduler exclusion are separate guarantees. ActionContext carries trusted actor, project/drawing, client/host/parent session, turn/call identity, expected revision and cancellation. Model input cannot choose authority. Execute returns a typed Effect; Promise conversion occurs once at the SDK seam with AbortSignal interruption, not repeatedly inside business logic.

**Permission amendment:** host permission remains tool-ID keyed. Grouped tools must not mix read-only access with mutations. If a group contains destructive actions, use stricter native `ask` permission for that group until a pinned-SDK native escalation path is proved. A model-provided `confirm:true` is input, not a human decision. An app-owned mod is optional RM-11 machinery, never a prerequisite for baseline safety. Classification distinguishes domain writes, report persistence, UI-only effects, memory and external effects. Reviewer inspection cannot regenerate NC or trigger write-capable workflows. Inspection cannot silently create projects/drawings.

## 6. Document consistency

The sidecar owns persistent revision and receipt. A committed receipt identifies action/call, actor/owner, document, revision before/after, change set, invalidated artifacts and evidence. Introduce revision/receipt persistence in RM-03 through WP0-owned generated migration before RM-04 UI adoption. RM-02 pure/stateless work may proceed on disjoint files, but persisted setup integration and completion wait for RM-03; RM-03 does not depend on its consumers. Serialized document writes plus optimistic expected revisions prevent blind overwrite; validate a batch before one commit. Check cancellation before commit, and distinguish cancellation after commit from "nothing happened".

An operation key and input digest return an existing recorded receipt on retry; conflicting reuse fails. This is idempotent commit, not exactly-once model execution. The desktop applies a receipt once to its matching document/revision; another open document gets notification/cache invalidation, not a canvas patch. Event gap or stale base triggers authoritative reconciliation. Human unsaved changes survive or produce a conflict. Persistent undo/redo uses the same application execute seam; viewport/selection effects remain UI-owned.

## 7. Precision-first modelling

The target loop is:

```text
inspect -> clarify dimensions/datums -> editable parametric history
        -> deterministic preview/rebuild -> independent measurement
        -> bounded repair -> approved revision-checked commit -> re-read evidence
```

Intent specifies dimensions, coordinate frames, units, datums, required bodies/features and acceptance tolerances. Missing manufacturing-critical sizes require a native nikcli question. Use primitives for simple insertion, but prefer constrained sketches/feature history for repeatable engineering changes. No arbitrary geometry scripts, model-invented IDs or fabricated parameter history for imported meshes.

QualityReport separates requested and achieved dimensional tolerance, solver residual/DOF, meshing chord error, Boolean numeric limits, CAM chord/scallop tolerance, verification resolution and NC rounding. It records representation/provenance, named dimensions/hole centres, required features, bounds/body count, supported topology checks and unknowns. Positive volume alone cannot prove a valid hole, manifold body or manufacturable part. Independent mesh sections/reference measurements must verify feature intent rather than echo model parameters.

Required failed/skipped features prevent success. Intentional sketch DOF must be explicit. Caps, Float32 coordinate limits and unsupported checks produce a limited/unsupported verdict, never fabricated micron precision. Repairs have attempt/time/token limits and do not persist failed previews. Candidate identity binds geometry digest, quality evidence and input revisions; commit verifies that identity and current authority.

Existing degree-valued histories remain readable under a versioned legacy contract. New canonical angles are radians with explicit UI/legacy/post conversion, including expression-valued angles. Conversion must preserve saved documents; never reinterpret existing numbers silently. RM-06 specifies intent; RM-09 introduces new geometric acceptance and preview implementation after core tests, not by changing prompts alone.

## 8. Manufacturing evidence

Setups bind revisions of part, stock, WCS, fixtures, cutter/holder, machine profile and post. Changes invalidate dependent toolpaths/programs/reports. The model selects operations and grounded parameters; pure deterministic generators/posts own NC creation. One-shot LLM optimization is an untrusted candidate until parsing/check/replay.

Verification must refer to the actual stored/emitted NC hash and its input revisions. A separate generate-and-verify write workflow is allowed; silently regenerating another program is not proof of the original artifact. Report modelled holder/fixture/target/kinematic coverage and resolution. Passing simulation is not machine certification, and no autonomous physical machine actuation is included.

## 9. Context, ownership and recovery

Workspace snapshots are typed, versioned, authorized and revisioned. Desktop supplies selection/view/unsaved intent; sidecar supplies authoritative part/setup/artifact evidence. One bounded renderer labels truncation, staleness, provenance and trust. Reference text cannot authorize writes. `includeContext=false` excludes optional automatic workspace/memory injection server-side, not trusted identity/authorization or intentionally supplied user instructions; verify the final policy end-to-end.

Memory is actor/project scoped. Explicit approved user preferences are separate from project notes; ambiguous old global KV notes stay excluded until reviewed/assigned. No all-project `ai.memory.*` scan in prompt assembly. Admission and execution require resource authorization; closing over the most recent actor is forbidden. RM-01 introduces immutable invocation actor; RM-07 completes owner-bound children, retries, controls and wakes. Owner is actor + project + parent session; control/removal/question/permission replies validate it.

Retain closed-runtime admission, queue bounds, editor exclusion until settlement, cancel/join and retired-parent suppression. Stream disconnection is not abort. Durable outcomes use SQLite attempts/leases/heartbeats with enqueue committed before execution and outcome before delivery. Recover readers under bounded policy; uncertain editors reconcile receipts/revisions and require review, never blind replay.

Events include identity/sequence, owner/session/turn/task/attempt and document revision. Bounded buffers return explicit resync on gaps/overflow, not silent dropping. Reconcile snapshot on reconnect; retain polling until push recovery passes. Measure SDK event-loop stalls before proposing Workers; tool closures/Effect contexts/DB handles are not transferable.

## 10. Evaluation, migration and verification

Each increment ships fixtures through the public interface. RM-10 aggregates them: schema/intent/dimension/topology/CAM correctness, safe mutation, retry/token cost, p50/p95 latency, memory, event-loop stalls and native responsiveness. Record baselines before numerical performance targets. Fake-provider tests prove wiring/safety, not arbitrary real-model competence; optional paid/live tests require credentials and budget. Price unknown is unavailable, not zero. Logs redact secrets and do not retain full parts/prompts/provider bodies by default.

Migrate vertically: contract/inventory tests, one family, consumers, then remove old model-visible declarations. Temporary compatibility adapters have a removal gate; no permanent dual catalogue. DB migrations are generated in WP0. Preserve legacy documents/transcripts/units and never persist provider keys in task records. No toggle bypasses authorization. Failed SDK mod compatibility leaves hermetic embedded operation unchanged.

Reference corpus: dimensioned plates/bolt patterns, brackets, stepped shafts, pockets, repeated-hole flanges, nested frames, Boolean edge cases, thin walls, near-tangent/degenerate inputs, large-coordinate small features, imported meshes, stock/holder/fixture collision and deliberate-gouge traps. Only assert supported feature checks; unsupported required features fail honestly.

Every step in [the design index](ai/README.md) provides owners, non-goals, migration and Verify. Run tests/typechecks/builds through Monitor and the installed Bun workspace scripts, with `--no-env-file`; do not install a compiler merely to check documentation. Whole-repo tests, generated-client/OpenAPI checks, native Tauri/WebKit and compiled-sidecar validation are distinct gates. Machine validation needs identified hardware/controller profiles and supervised dry runs.

## 11. Future capability gate and exclusions

Exact B-rep is outside current RM-09. A future approved ADR must establish licensing, stable topology/feature references, deterministic STEP round trips, precision evidence and Bun/Tauri packaging before a kernel dependency is selected. Advanced simultaneous multi-axis/machine certification is a separate programme requiring kinematic and machine evidence. Neither can be replaced by prompts or mesh marketing.

No runtime implementation, dependency change, migration, live-provider request, external message or physical machine command occurs in this publication. RM rows stay pending until their implementation Verify gates pass.

## Change log

- 2026-10-12: published approved native AI contract and source evidence; mapped precision, safe execution and integration increments to RM-01 through RM-11; implementation remains pending.
