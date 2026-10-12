# RM-01 — Action catalogue (deepen the tool seam)

Status: **pending**. Current step. Design: `26-tool-consolidation.md`, `27-everything-via-nikcli.md` §3, [spec 28](../28-native-ai-architecture.md), [AI-01](../ai/01-actions-and-execution.md). Owners: WP8 `packages/ai`; WP4 `apps/sidecar/src/services/ai.ts`, `ai-vcs-tools.ts`, `acting-user.ts` and `apps/sidecar/src/http/ai.ts` for immutable invocation admission/handler authorization only; WP3 `packages/api/src` shared action schemas only; WP6 `apps/desktop/src/ai` tool IDs/decoders/result consumers only. Matching tests in each workspace are included. No new routes, page redesign or task durability here.

## Why this is first

The agent surface is **shallow**: per-verb tools each have their own file, prompt, and registry line. `ToolHandlers` (`packages/ai/src/tools/handlers.ts`) is a wide Promise interface. Spec 26's former implemented label was corrected after source inspection; consolidation remains pending. Spec 27 needs one catalogue before an HttpApi bridge.

**Deletion test:** deleting any one `cad_*` verb file does not concentrate complexity — callers still face N near-identical interfaces. One **module** (`ActionCatalogue`) behind a small **interface** (id, kind, parameters, doc, execute) gives **leverage** to the host, HTTP, and a future nikcli plugin, and **locality** for permissions (read vs write tool ids).

The host is the existing **adapter**; the external HTTP adapter in RM-11 will make this a real two-adapter **seam**. Until then the future transport seam is explicitly hypothetical. Do not build the HTTP face here.

## Interface (the test surface)

One action id (`cad_edit.add`, `cam.verify`, …) declared once:

- `kind`: `read` | `write` | `destructive`
- parameters/results: authoritative Effect wire schemas in dependency-safe `packages/api`; equivalence-tested zod adapter for nikcli, not independently maintained definitions
- `doc`: LLM text (units, bounds, next action)
- `execute`: `(input, ctx) => Effect<Result, TaggedError>`

Host tools are **adapters** over that catalogue (`defineActionTool` per `26-tool-consolidation.md` §2.3): target 12 application tools, with faithful read/write split so `researcher` cannot delete. If actual effect inventory requires a different mapping, amend the grouping contract before implementation; tool-count optimization cannot weaken authorization.

Permissions stay keyed by **tool id**, not by action. Merging read+write into one id is forbidden (`26` §2.2).

## Effect v4

- Keep `ToolHandlers` as `Context.Service` until every method is an action; then the catalogue is the service shape.
- Named executes: `Effect.fn("actions.cad_edit.add")`.
- Decode tool input with the action schema; map handler failures to tagged errors; `ok: false` remains a result, not a throw.
- Do not put Effect in `packages/core`.

## Deliverables

1. `packages/ai/src/tools/action.ts` — `defineActionTool`.
2. Catalogue module under `packages/ai/src/actions/` (or equivalent) listing every verb from spec 26 §2.1. Existing `tools/*.ts` become implementations behind actions, not a second public interface.
3. `registry.ts` registers the 12 consolidated tools. Preserve the already registered `cad_grep` capability through consolidation: source inspection on 2026-10-12 confirms the `cadGrep` import and inclusion in `BUILT_IN_TOOLS`. Derive action, prompt and permission coverage from the catalogue; this is preservation, not missing-registration repair.
4. Specialist allow-lists in `nikcli/agents.ts` / `config.ts` updated to the new ids. `MUTATING` tests updated. `reviewer` stays read-only.
5. One `.txt` prompt per **tool** (not per action). `tool-prompts.test.ts` still green.
6. Sidecar `libraryToolSpecs` / `vcsToolSpecs` / `backgroundToolSpecs` call the same catalogue or are deleted if they duplicate it. No third declaration.
7. Bind immutable trusted actor/document/call context at admission and enforce repository write authority per mutating execute. Cancellation crosses the SDK Promise seam once. Full children/control/retry ownership follows RM-07.
8. Classify actual effects: existing persisted verification and workflow triggering are writes. Reviewer only inspects existing reports. Read-only groups cannot contain writes; destructive groups use stricter native `ask` unless action escalation is proved against the pinned SDK. Model `confirm:true` is not approval.
9. Update existing desktop tool decoders/mirroring for the consolidated IDs without adding a second catalogue; revision-based reconciliation is RM-03/RM-04.

## Out of scope

- HttpApi bridge / `@cadcamfun/nikcli-plugin` (RM-11).
- New CAM operations, library upsert HTTP, desktop screens.

## Verify

```bash
bun --no-env-file run --filter @cadcamfun/ai typecheck
bun --no-env-file run --filter @cadcamfun/api typecheck
bun --no-env-file run --filter @cadcamfun/sidecar typecheck
bun --no-env-file run --filter @cadcamfun/desktop typecheck
bun --no-env-file test packages/ai packages/api apps/sidecar apps/desktop
```

Gates: catalogue token size drops vs 56k-char baseline in spec 26; `packages/ai/test/agents.test.ts` still proves only editors mutate; `nikcli-host.test.ts` still proves `cadcam` has no shell/file tools; every spec-26 verb is reachable as an action.

Required integration checks through the caller-facing interface (add tests where absent):

- Derive action/host/prompt coverage, including preserved `cad_grep`; equivalence-test Effect wire schemas and the nikcli zod adapter for inputs, results and typed failures. Desktop decoders/mirroring accept consolidated IDs without a second catalogue.
- Exercise trusted actor/document/call admission through sidecar handlers and host tools: forged model context, unauthorized project/document access and denied write rights fail before execute. Reviewer/researcher cannot persist verification reports or trigger workflows. Destructive groups require native approval; `confirm:true` alone fails.
- Cancel before handler entry and during execution across the SDK Promise seam; the signal reaches execute once, cancelled pre-commit writes do not occur, and late results do not become fresh desktop mutations. Durable recovery remains RM-07.
- Preserve typed conflict/receipt results through catalogue, host and desktop adapters using interface fixtures, without implementing RM-03 persistence here. Adapters must not retry a conflict or replay a receipt as a fresh write. Durable idempotency, atomic commit and receipt recovery remain RM-03/RM-07 gates.

These are future implementation acceptance requirements, not results of this documentation amendment.

## Change log

- v1: first remaining step — deepen tools into one catalogue.
- 2026-10-12: published AI-01 contract amendments and narrow cross-WP scopes; cad_grep registration already exists. Implementation and Verify remain pending.
- 2026-10-12: expanded Verify across AI/API/sidecar/desktop for authorization, cancellation, conflict/receipt propagation and consolidated consumers; clarified cad_grep preservation. Documentation only; no gate claimed.
