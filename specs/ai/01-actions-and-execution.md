# AI-01 - Actions and safe execution

Status: **specified; implementation pending**.
Stack: Effect **4.0.0-rc.112** and nikcli **@nikcli-ai/sdk-next 1.428.0** throughout.

## Authority and dependencies

Controlling step: [RM-01](../roadmap/01-action-catalogue.md); no preceding implementation dependency.
[Roadmap order](../roadmap/README.md) and [process](../roadmap/00-how-to-follow.md) are the only sequence.
Read [umbrella contracts](../28-native-ai-architecture.md), [conventions](../01-conventions.md), [26](../26-tool-consolidation.md) and [27](../27-everything-via-nikcli.md).
This publication neither completes RM-01 nor starts RM-07 ownership durability or RM-11 transport work.

## Source evidence

- [Approved plan](../../.nikcli/plans/1791820593388-shiny-garden.md), AI-01 and execution invariants, controls this increment.
- [Registry](../../packages/ai/src/tools/registry.ts) remains per-verb and already registers `cad_grep`; preserve its coverage.
- [Handlers](../../packages/ai/src/tools/handlers.ts) expose wide Promise/unknown results; consolidation is not runtime evidence.
- [ActingUser](../../apps/sidecar/src/services/acting-user.ts) stores the last caller in a mutable cell.
- [Sidecar execution](../../apps/sidecar/src/services/ai.ts) includes saves and verification persistence; [agents](../../packages/ai/src/nikcli/agents.ts) need actual-effect allow-lists.
These are static observations, not reproduced exploits or claims that tests passed.

## Owners and contract-first amendments

- WP8: `packages/ai/src/tools/`, `packages/ai/src/actions/`, `packages/ai/src/nikcli/`, `packages/ai/src/prompts/`, `packages/ai/test/`.
- WP8 admission amendment: `packages/ai/src/service.ts` may notify trusted application code when a host session is resolved, before prompting. This hook carries no model-supplied authority and does not replace RM-07 lifecycle durability.
- WP8 export amendment: `packages/ai/src/index.ts` exposes existing child-session ownership lookup for sidecar invocation admission and its interface tests; it does not expose SDK internals.
- Dependency wiring amendment: `packages/ai/package.json` and the workspace lock may add the existing `@cadcamfun/api` workspace dependency so execution consumes authoritative wire schemas without reverse imports or new external packages.
- Existing WP4 scope: `apps/sidecar/src/services/ai.ts` only, as RM-01's handler adapter.
- Required WP4 amendment: `apps/sidecar/src/services/acting-user.ts`, `apps/sidecar/src/http/ai.ts`, `apps/sidecar/src/services/ai-vcs-tools.ts`, `apps/sidecar/test/` for immutable admission and adapter safety.
- Required WP3 amendment: `packages/api/src/` and `packages/api/test/` for shared wire contracts; dependency wiring is separately explicit.
- Required WP6 amendment: `apps/desktop/src/features/ai/lib/` and `apps/desktop/test/` only for tool-ID decoding and mutation-outcome compatibility, not receipt persistence or new UI implementation. This is the current source location of the consumers formerly listed as `src/ai/`.
Before cross-WP implementation, amend RM-01 owner/deliverable lists and the affected WP contracts first.
These proposed scopes are not permission to edit unlisted directories or manifests; publication owns only this file.

## Module, Interface, Implementation

Module: deepen `ActionCatalogue`, concentrating action identity, validation, effects and dispatch.
Interface: `ActionSpec` plus trusted `ActionContext` -> typed Effect result or tagged failure.
Implementation: existing domain handlers behind one catalogue declaration; explicit Layers and named `Effect.fn` executes.
Depth gives host callers leverage without learning repository details; locality keeps safety/documentation changes together.
Deletion would scatter classification and validation across callers, so the module earns its keep.
The embedded nikcli adapter is the present seam; the second HTTP adapter is explicitly hypothetical until RM-11.
The interface is the test surface; no duplicate public dispatcher or in-process HTTP hop.

## Precise contracts

- Integration follow-up (2026-10-15): every adapter uses the shared outcome classification after result validation,
  including incomplete reads, stale results and invalid-result uncertainty. A committed envelope must satisfy
  `ActionCommitted` and name the executing action before it can be reported as success. The HTTP bridge and specialist
  event mapper consume the complete structured answer; desktop wire decoding preserves result JSON without character
  slicing. Transcript text budgets must not corrupt the result used for editor reconciliation. This amends existing
  adapter/result-consumer scopes only; durable receipts, resync and new lifecycle work remain roadmap-gated.
- `ActionSpec`: stable `tool.action`, input/result schema, LLM documentation, effect set, capabilities, exposure and transport mapping.
- Authoritative Effect wire schemas live in `packages/api`; they import neither AI execution, nikcli nor DB.
- nikcli's zod representation is derived or equivalence-tested, never independently authoritative; test defaults, bounds, unions, unknown keys and encode/decode failures.
- `ActionContext`: immutable authenticated actor, project/drawing IDs, client/host/parent session, turn/call IDs, expected revision and cancellation.
- Capture context at admission and invocation, including queued work; never read the latest `ActingUser` to choose write authority.
- Actor/owner/capabilities are trusted application data, not model fields; overlapping calls retain their original identity now.
- Every mutating execute checks resource `canWrite` independently of visibility, before repository mutation; recheck at commit when rights may change.
- Resource authorization, native nikcli permission and write scheduling remain separate checks; none substitutes for another.
- Classify actual domain writes, report persistence, memory writes, UI-only and external effects; inspect must not provision defaults.
- Split read/write tool IDs. If a write group includes destructive actions, apply stricter native `ask` to the whole group unless pinned-SDK escalation is proved.
- Native decisions are tool-ID keyed and bound to the invocation; `confirm:true` cannot grant approval or replace `canWrite`.
- Reviewer may inspect existing reports but cannot regenerate/persist NC, mutate memory/domain data or launch write-capable workflows.
- Execute returns `Effect<Result, TaggedError, Requirements>`; decode at the seam and map foreign exceptions to tagged errors.
- Promise conversion occurs once in the nikcli adapter with AbortSignal interruption; business workflows do not repeatedly run Effects.
- Invalid/denied/interrupted calls return typed failures without mutation; revision/receipt persistence is completed by [AI-02](02-setup-and-domain-parity.md).

## Deliverables

1. Inventory every existing verb and inline/native tool with effect, authority, result, exposure and parity destination.
2. Publish shared wire schemas and equivalence fixtures; replace wide handlers with typed Effect execution family by family.
3. Implement immutable actor capture and `canWrite` enforcement before widening catalogue exposure; do not defer baseline safety to RM-07.
4. Reconcile the 12 application-tool target with actual native/sidecar IDs and destructive permission policy; preserve every prior verb including `cad_grep`.
5. Update specialist allow-lists and prompts from the catalogue; total application prompt text stays below 24,000 characters.
6. Migrate tool-ID consumers and retire duplicate model-visible declarations only after parity and safety gates pass.

## Non-goals

No external bridge/mod, new geometry, DB durability, lifecycle replacement, shell/filesystem tools or paid-provider calls.
AI SDK v7 stays stateless/one-shot; it is not an alternative mutation-capable loop.

## Migration and failure handling

Migrate one action family at a time; legacy IDs may be private compatibility adapters with a removal gate, never duplicate model tools.
Reject unknown actions, schema mismatch, missing authority and unproven escalation; no permissive fallback or authorization toggle.
Interrupt before mutation; uncertain outcomes require reconciliation rather than blind write retries.
Preserve cached scope-owned hosts; full child/retry/wake control ownership remains RM-07, not a reason to retain unsafe actors now.

## Tests

Use offline fake-provider host fixtures, explicit Effect Layers and actual sidecar adapters through the public interface.
Cover action parity, schema equivalence, sanitization, denied shell/files, reviewer effects and destructive native decisions.
Overlap two actors/projects; prove read-only collaborators and revoked writers never reach repository mutation.
Test AbortSignal interruption, invalid inputs and native denial without repository writes; preserve existing host/sentinel regressions.

## Verify

Commands confirmed in AI/API/sidecar/desktop manifests (`typecheck`); run through Monitor during implementation, not publication.

```sh
bun --no-env-file run --filter @cadcamfun/ai typecheck
bun --no-env-file run --filter @cadcamfun/api typecheck
bun --no-env-file run --filter @cadcamfun/sidecar typecheck
bun --no-env-file run --filter @cadcamfun/desktop typecheck
bun --no-env-file test packages/ai packages/api apps/sidecar/test apps/desktop/test
git diff --check
```

## Acceptance checklist

- [ ] All existing actions are reachable once, with shared validated contracts and bounded prompts.
- [ ] Immutable actors and resource `canWrite` protect every mutating execute.
- [ ] Actual-effect classification and native tool-keyed permissions prevent reviewer/destructive escalation.
- [ ] Schema equivalence, parity and interruption fixtures pass; cross-WP amendments precede edits.
- [ ] RM-01 is marked done only after its implementation Verify gates pass.

## Change log

- 2026-10-14: owner-requested additive `cam_edit.manufacture` persists the native CAM result through the existing sidecar Toolpath repository and readback interface. The read-only `cam.manufacture` preview remains. Shared contracts, actual write classification, pre-commit actor/revision/cancellation checks and original-NC desktop reconciliation apply; no new DB migration or durable receipt implementation is included.
- 2026-10-14: scoped the current CAM migration to shared Effect input contracts in `packages/api/src/ai-cam.ts`, derived nikcli validators and Effect decoding in the action module. Generation preserves typed refusals/conflicts/receipts rather than rebuilding them as previews; desktop consumers must not mirror a receipt as a fresh mutation. Action construction is lazy and cancellation is checked before entering foreign handlers. No RM-03 persistence or completion gate is included.
- 2026-10-12: specified catalogue depth, immutable invocation authority and native permission safety; implementation pending.
