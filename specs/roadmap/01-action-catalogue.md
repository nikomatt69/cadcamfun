# RM-01 — Action catalogue (deepen the tool seam)

Status: **pending**. Current step when this file is first used. Design: `26-tool-consolidation.md`, `27-everything-via-nikcli.md` §3. Owners: WP8 `packages/ai`, WP4 `apps/sidecar/src/services/ai.ts` (handler adapter only).

## Why this is first

The agent surface is **shallow**: ~32 per-verb tools, each with its own file, prompt, and registry line. `ToolHandlers` (`packages/ai/src/tools/handlers.ts`) is a wide Promise interface. Spec 26 is specified as implemented; the tree still has no `packages/ai/src/tools/action.ts`. Spec 27 needs one catalogue before an HttpApi bridge.

**Deletion test:** deleting any one `cad_*` verb file does not concentrate complexity — callers still face N near-identical interfaces. One **module** (`ActionCatalogue`) behind a small **interface** (id, kind, parameters, doc, execute) gives **leverage** to the host, HTTP, and a future nikcli plugin, and **locality** for permissions (read vs write tool ids).

This is a real **seam**: in-process host adapter now; HTTP adapter in RM-11. Do not build the HTTP face here.

## Interface (the test surface)

One action id (`cad_edit.add`, `cam.verify`, …) declared once:

- `kind`: `read` | `write` | `destructive`
- parameters: one schema (zod 4 as today, or Effect Schema if the neighbouring tools already use it — do not mix in one tool)
- `doc`: LLM text (units, bounds, next action)
- `execute`: `(input, ctx) => Effect<Result, TaggedError>`

Host tools are **adapters** over that catalogue (`defineActionTool` per `26-tool-consolidation.md` §2.3): 12 application tools, read/write split so `researcher` cannot delete.

Permissions stay keyed by **tool id**, not by action. Merging read+write into one id is forbidden (`26` §2.2).

## Effect v4

- Keep `ToolHandlers` as `Context.Service` until every method is an action; then the catalogue is the service shape.
- Named executes: `Effect.fn("actions.cad_edit.add")`.
- Decode tool input with the action schema; map handler failures to tagged errors; `ok: false` remains a result, not a throw.
- Do not put Effect in `packages/core`.

## Deliverables

1. `packages/ai/src/tools/action.ts` — `defineActionTool`.
2. Catalogue module under `packages/ai/src/actions/` (or equivalent) listing every verb from spec 26 §2.1. Existing `tools/*.ts` become implementations behind actions, not a second public interface.
3. `registry.ts` registers the 12 consolidated tools. `cad_grep` must appear (it is in handlers, was missing from registry historically — verify it is on an action).
4. Specialist allow-lists in `nikcli/agents.ts` / `config.ts` updated to the new ids. `MUTATING` tests updated. `reviewer` stays read-only.
5. One `.txt` prompt per **tool** (not per action). `tool-prompts.test.ts` still green.
6. Sidecar `libraryToolSpecs` / `vcsToolSpecs` / `backgroundToolSpecs` call the same catalogue or are deleted if they duplicate it. No third declaration.

## Out of scope

- HttpApi bridge / `@cadcamfun/nikcli-plugin` (RM-11).
- New CAM operations, library upsert HTTP, desktop screens.

## Verify

```bash
bunx tsc -p packages/ai/tsconfig.json
bun test packages/ai
```

Gates: catalogue token size drops vs 56k-char baseline in spec 26; `packages/ai/test/agents.test.ts` still proves only editors mutate; `nikcli-host.test.ts` still proves `cadcam` has no shell/file tools; every spec-26 verb is reachable as an action.

## Change log

- v1: first remaining step — deepen tools into one catalogue.
