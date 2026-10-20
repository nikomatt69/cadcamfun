# 27 — Everything via nikcli: the full CAD/CAM action surface

Status: proposed. Owners: WP8 (`packages/ai` — catalogue, agent surface, mod), WP3/WP4 (`packages/api`, `apps/sidecar` — HTTP parity and tokens), WP9 (`packages/plugin-sdk` — AI-tool contributions). This spec records the B+C decision for the agent: cadcamfun must expose **every action it can perform — CAD/CAM first — through nikcli**, both in-process (the embedded host behind the assistant, via `Tool.define` natives and one app-owned mod) and out-of-process (a standalone `nikcli` driving a running instance, via a typed HttpApi bridge). It builds on `08-ai.md`, `15-ai-agent-analysis.md`, `16-cadcam-agent-blueprint.md`, `21-integration-master-plan.md`, `23-ai-runtime-architecture.md`, `24-assistant-control-flow.md`, `25-project-ai-context.md` and `26-tool-consolidation.md`. No database migration.

## 1. Why

The agent already drives a rich slice of the product: the embedded host registers per-project tools (`packages/ai/src/nikcli/runtime.ts:227-241`, `Tool.define` + `client.tools.register`) built by `buildTools(handlers, projectId)` plus sidecar specs (`apps/sidecar/src/services/ai.ts:728-741`: `libraryToolSpecs`, `vcsToolSpecs`, `backgroundToolSpecs`), all validated through the Effect `ToolHandlers` service (`packages/ai/src/tools/handlers.ts:27`, live in `apps/sidecar/src/services/ai.ts:699`). Permissions are deny-by-default, keyed by tool id (`packages/ai/src/nikcli/config.ts:83-97`).

Three gaps keep "every action" from being true:

1. **No single source of truth.** The same capabilities are declared three times — tool files (`packages/ai/src/tools/`), inline sidecar specs (`libraryToolSpecs`, `ai-vcs-tools.ts`) and HTTP routes (`packages/api/src/groups/*` → `apps/sidecar/src/http/*`) — with no parity guard between them. The historical missing `cad_grep` registration claim is stale: source inspection on 2026-10-12 confirms it is registered. Catalogue consistency still needs a derived parity guard.
2. **The extension hook is unused.** `buildTools(handlers, projectId, extensions)` accepts `ToolDefinition`s "from outside this package" (`packages/ai/src/tools/registry.ts:52-65`), but no production caller passes any; `packages/plugin-sdk` contributions (`packages/plugin-sdk/src/manifest.ts:64`: `commands`, `panels`, `postProcessors`, `operations`) have no AI-tool surface.
3. **Nothing outside the sidecar can act.** A standalone `nikcli` (terminal, another machine, CI) cannot describe a drawing, create an operation or verify a toolpath on a running cadcamfun instance. And there is no MCP server to fall back on: "v6 ships no MCP SDK, SSE connector or stdio process manager" (`apps/sidecar/src/http/mcp.ts:20-23`).

Spec 26 is now correctly labelled implementation pending: the tree still registers the per-verb catalogue. Consolidation is RM-01; the external bridge is RM-11. This document's phases are design subdivisions, not an alternative implementation sequence.

### Contract amendments (2026-10-12)

[Spec 28](28-native-ai-architecture.md) and [AI-10](ai/10-nikcli-and-plugin-adapters.md) sharpen these proposals without changing the ordered [RM roadmap](roadmap/README.md):

- Shared authoritative wire schemas are Effect schemas in `packages/api`, with an equivalence-tested zod adapter for nikcli. The pseudocode below is illustrative, not permission to import AI or DB into API contracts or maintain two independent schemas.
- The action interface includes typed results/effects, trusted actor/owner/document context, cancellation and expected revisions. Embedded execution remains in-process; HTTP is a second adapter to the same execution, not an internal network hop.
- Mod loading remains optional and compatibility/isolation gated. No proposed hook or `ctx.ask` path is assumed available without checking the pinned SDK. Baseline safety uses proven native permissions: destructive groups remain `ask` until action escalation is demonstrated; `confirm:true` never authorizes a write.
- Scope external tokens independently of the sidecar's existing local authorization adapter; do not assume a `requireAuth` helper provides project/write rights. Server authorization and verifiable native confirmation are mandatory. Companion allow-lists do not widen.
- Report persistence and workflow triggering are writes. Reviewers inspect existing artifacts/reports; verifying actual NC references its hash and revision, not a silently regenerated replacement.
- Contract-first WP0-owned revision/receipt/task migrations belong to RM-03/RM-07. This bridge itself does not authorize unrelated DB changes.

## 2. Decision: B + C, through the nikcli extension SDK — no fork

| | Choice | What it is |
| --- | --- | --- |
| A — MCP server | **rejected** | v6 ships no MCP SDK (above); an MCP layer would be a fourth dispatch system beside tools, HTTP and the plugin host. |
| B — mod/plugin + native tools | **adopted** | Deep integration through nikcli's own extension surfaces: `Tool.define`/`tools.register` for natives, `@nikcli-ai/plugin` for one app-owned mod and for the external agent plugin. |
| C — HttpApi bridge | **adopted** | The sidecar's Effect HttpApi (`packages/api` contract + `apps/sidecar/src/http/*`) is the typed bridge the tools and external clients call. |

B does **not** touch nikcli sources. nikcli is consumed only as `@nikcli-ai/sdk-next@1.428.0` (`packages/ai/package.json`), all imports confined to `packages/ai/src/nikcli/` (spec 08 §6.3), and its extension surfaces are public: the host client surface is typed in `packages/ai/src/nikcli/sdk-next.d.ts` (`Tool.define`, `tools.register(Effect)`, sessions, events, permissions, questions), and the plugin/mod SDK `@nikcli-ai/plugin@1.431.0` (exports `./tool`, `./mod`, `./tui`, `./v2/*`) is already present in the `.nikcli/` staging folder. Version note: the plugin SDK (1.431.0) is newer than the pinned host (1.428.0); compatibility against the pinned bundle is an explicit gate in phase 2.

```
                 ┌───────────────────────────────────────────────────────┐
                 │ cadcamfun sidecar (Bun + Effect + HttpApi)            │
                 │                                                       │
                 │  kernel: packages/core (cad, cam) + services          │
                 │            ▲                                          │
                 │  ActionCatalogue (single source: id, zod schema,      │
                 │     mode read|write|destructive, handler, LLM doc)    │
                 │     ▲                    ▲                            │
   VIA B         │  ToolHandlers      HttpApi routes (C)                 │        VIA C
 (in-process)    │  (Effect service)  packages/api + sidecar/http        │   (out-of-process)
                 │     ▲                    ▲                            │
                 │  nikcli embedded host    │  typed generated clients   │
                 │  Tool.define natives     │  (@cadcamfun/httpapi-codegen)
                 │  + app-owned mod         │                            │
                 └──────┬───────────────────┬────────────────────────────┘
                        │                   │
              assistant chat        @nikoemme_/cadcamfun-nikcli-plugin
              (desktop, mobile      (standalone `nikcli`: same tool ids,
               companion)            execute() → HTTP + paired token)
```

One catalogue, two faces: the embedded host calls handlers **directly** in-process (no HTTP hop); the external plugin calls the **same actions over HTTP**. Schemas are shared, so an action cannot exist on one face and not the other.

## 3. The action catalogue (single source of truth)

A new module in WP8 (`packages/ai/src/actions/`) declares every action exactly once:

```ts
export interface ActionSpec<Parameters, Result> {
  readonly id: string                  // "cad_edit.add", "cam_edit.create", "vcs.commit", …
  readonly kind: "read" | "write" | "destructive"
  readonly parameters: ZodSchema       // one zod 4 object schema, shared by tool + HTTP
  readonly doc: string                 // LLM documentation (unit, bounds, next tool)
  readonly handler: (input, ctx: ActionContext) => Effect.Effect<Result, ActionError>
}
```

Derivation rules (each enforced by a test that derives from the catalogue, never from a hand-written list — the pattern `26-tool-consolidation.md` §6.4 already requires):

- **Tool face.** `defineActionTool` (spec 26 §2.3, `packages/ai/src/tools/action.ts`) builds the 12 consolidated tools from catalogue entries grouped by tool id. The `kind` cut maps to the permission class (§6).
- **HTTP face.** Every catalogue entry has one route; the contract group lives in `packages/api/src/groups/cadcam.ts` (or reuses an existing group) and the handler is the catalogue handler lifted into HttpApi (`apps/sidecar/src/http/`). Existing groups (`drawings`, `toolpaths`, `toolpath-generator`, `library`, `materials`, `machine-configs`, `components`, `vcs`, `files`, `projects`) keep their routes; the parity test maps each catalogue action to its route instead of duplicating endpoints.
- **Coverage.** The catalogue starts from the union of what exists: the 31 built-in tools + sidecar specs (`LIBRARY_TOOL_IDS`, `VCS_TOOL_IDS`, `BACKGROUND_TOOL_IDS` in `packages/ai/src/tools/project-tools.ts`) + the stateless suggestion endpoints (`/api/ai/{title, design-analysis, machining-parameters, gcode-optimization, design-suggestions, analyze-gcode, toolpath-analysis}`). Actions that stay HTTP-only (upload/download, organizations, billing, analytics, waitlist) are declared `kind: "read" | "write"` with `tool: false` and do not enter the model's catalogue — but they still appear in the parity map, so the surface is inventoried, not accidental.
- **Plugin actions.** Contributions that add tools (§4.2) are validated against the same `ActionSpec` shape at install time; a plugin action cannot widen a capability it was not granted (§6).

The prompt budget of spec 26 survives: the model sees the consolidated tool catalogue (≤ 24 000 characters, acceptance §6.6), not the full action list; `search_tools`/deferred loading (enabled for the agent and specialists, `specs/24-assistant-control-flow.md`) covers the tail.

## 4. Via B — the agent surface

### 4.1 Native tools (already the pattern, completed)

`runtime.ts` keeps registering natives per project; the difference is that their definitions are derived from the catalogue instead of being hand-written per verb. Specialists' allow-lists (`packages/ai/src/nikcli/agents.ts`) are expressed as catalogue tool ids and derived from `kind`: a read-only specialist receives every `read` tool and no `write`/`destructive` one, by construction.

### 4.2 Plugin contributions → AI tools (WP9)

`packages/plugin-sdk` gains a `contributes.aiTools` entry in `ContributionsSchema` (`packages/plugin-sdk/src/manifest.ts:64`): a list of `ActionSpec`-shaped descriptors (parameters as JSON Schema converted to zod at the boundary, doc, kind). The sidecar's `toolsFor(projectId)` (`apps/sidecar/src/services/ai.ts:728`) passes them to `buildTools(handlers, projectId, extensions)` — the first production caller of the extension hook. A plugin action executes through the plugin host RPC (capability-checked, Worker-isolated per spec 09), never through direct kernel access.

### 4.3 One app-owned mod

`packages/ai/src/nikcli/isolation.ts:92-97` currently sets `NIKCLI_DISABLE_MODS=1` (and disables plugin install/hot-reload) to keep the host hermetic. This spec flips exactly one switch, under conditions:

- Only the mod registered by the app from its own isolated config directory loads; user-directory and project mods stay disabled (`NIKCLI_DISABLE_PROJECT_CONFIG=1` and the XDG redirection of spec 08 §1.1 are untouched — the sentinel-file test remains an acceptance criterion).
- The mod's job is what nikcli's mod chain is for (`tool.call`/`tool.result`, `prompt.submit` hooks): append CAD/CAM audit events to the session log, escalate destructive catalogue actions to a visible confirmation (`kind: "destructive"` → `permission: "ask"` regardless of the tool id), and inject the workspace renderer's short context (spec 16 §2.2) into `prompt.submit` instead of the model re-deriving it.
- Gate: verify the pinned `sdk-next@1.428.0` bundle honours the mod load path (`NIKCLI_DISABLE_MODS` is consumed today, so the machinery exists); if the pinned bundle cannot load an app-owned mod without also enabling user-dir loading, B stays at 4.1/4.2 and the mod's jobs move into the tool wrapper (`ctx.ask` + event mapper) — same behaviour, no new switch.

### 4.4 External agent plugin

A small package `@nikoemme_/cadcamfun-nikcli-plugin` (built on `@nikcli-ai/plugin`'s `./tool` export) registers **the same tool ids** into any nikcli, with `execute()` calling the cadcamfun HTTP face (§5) with a paired token. Installed with `nikcli plug install`, it turns a standalone nikcli into a full CAD/CAM agent for a running cadcamfun instance: describe → edit → operations → generate → analyze → verify, the same loop as `16-cadcam-agent-blueprint.md` §3.6.5. This is the "tutto via nikcli" surface outside the app: same ids, same schemas, same confirmations — only the transport differs.

## 5. Via C — the HttpApi bridge

- **Contract.** `packages/api` owns authoritative Effect wire schemas; catalogue adapters use an equivalence-tested nikcli zod representation. Reuse existing routes where appropriate, declare in-process-only exceptions explicitly, and regenerate clients through installed codegen scripts.
- **Auth.** New external-agent authorization validates revocable project/read-write scope plus resource rights; the existing local bearer/session adapter is not sufficient evidence of external scope. Destructive actions additionally require verifiable native confirmation evidence, not a model flag. Companion allow-lists remain unchanged.
- **Tokens for external nikcli.** A paired token (same issuance path as the mobile companion) scopes an external agent to one project and to the same permission classes as the in-app agent; tokens are revocable and visible in the same settings surface.
- **In-process tools do not hop HTTP.** The embedded host and the kernel share the process; their tools call `ToolHandlers` directly. The bridge exists for out-of-process nikcli, for contract parity (which is what makes the drift test possible) and for the mobile/companion surfaces.

## 6. Permissions and trust

- The host keeps deny-by-default, keyed by tool id (`config.ts:83-97`); the catalogue's `kind` drives the class: `read` → `allow`, `write` → `allow` for editors/modelers/machinist, `destructive` → `ask` (already true for `cad_delete_entities`; generalised).
- Specialists keep the read/write cut of spec 26 §2.2, derived from `kind`, not retyped lists.
- Plugin AI tools inherit the plugin's granted capabilities (spec 09 §3/§5); an ungranted capability fails with the typed `CapabilityError` before any handler runs.
- External tokens: project-scoped, `read` or `write`; a `read` token receives `ok: false` from every `write`/`destructive` action, exactly as the host permission map would deny it.

## 7. CAD/CAM-first presentation

The agent stays a CAD/CAM colleague, not an HTTP Swiss-army knife. The model-visible order puts CAD and CAM tools first (spec 16 §2.3 ordering, spec 26 grouping); the workspace renderer (`packages/ai/src/workspace-context.ts`) and the per-tool `.txt` prompts (`tools/prompts/<id>.txt`, one per consolidated tool, documented per action per spec 26 §2.3) are unchanged in shape. Nothing about accounts, billing or analytics enters the model's catalogue.

## 8. Non-goals

- No MCP server (spec 2's rejection stands).
- No shell/file tools for the agent: `bash`, `edit`, `write`, `read`, `glob`, `grep` stay out of the allow-list (spec 16 §2.5, acceptance §8.1 of spec 16).
- No fork of nikcli, no unpinning of `effect@4.0.0-rc.112` (AGENTS.md, spec 08 §6.3).
- No change to the AI SDK v7 direct path (`packages/ai/src/direct-model.ts`) — it remains the stateless/one-shot fallback.
- No new dispatch system for the UI: the desktop command pattern (`apps/desktop/src/shared/state/commands.ts`) is the editor's, not the agent's.

## 9. Phases and ownership

| Phase | Work | Owner | Depends on |
| --- | --- | --- | --- |
| 0 | Land spec 26 in code: `defineActionTool`, 12 consolidated tools + prompts, registry/UI renames | WP8 (+WP4, WP6) | — |
| 1 | `packages/ai/src/actions/` catalogue and derived tool parity; preserve already registered `cad_grep` coverage | WP8 | 0 |
| 2 | Catalogue→HTTP parity map + missing routes in `packages/api`/`apps/sidecar/src/http`; regenerated clients; parity test catalogue↔routes | WP3, WP4 | 1 |
| 3 | `contributes.aiTools` in plugin-sdk; first production `extensions` caller in `toolsFor` | WP9, WP8 | 1 |
| 4 | App-owned mod (audit, destructive escalation, prompt context) — gated on the pinned bundle (§4.3) | WP8 | 0 |
| 5 | Paired agent tokens + `@nikoemme_/cadcamfun-nikcli-plugin`; external round-trip | WP4, WP8 | 2 |

## 10. Acceptance criteria

1. A parity test derives host registrations and HTTP route mappings or explicit in-process-only exceptions from the catalogue, failing on drift. Preserve already registered `cad_grep` reachability, parameter/result schemas and read-only authorization through RM-01 consolidation and RM-11 bridge exposure; test any explicit in-process-only exception. This is preservation coverage, not a reproduced current missing-registration failure. Source inspection on 2026-10-12 confirms the `cadGrep` import and inclusion in `BUILT_IN_TOOLS` in `packages/ai/src/tools/registry.ts`.
2. Every consolidated tool prompt documents every action and every parameter of every action (spec 26 §6.3, restated over catalogue actions); catalogue prompt cost stays under 24 000 characters.
3. Destructive actions require verifiable native confirmation in-process and over HTTP, alongside authorized project/write scope. Grouped tools use stricter native `ask` until proven action escalation; a model flag/write token alone is not confirmation. Read tokens fail before execute.
4. External round-trip: with a paired token, a real embedded host plus `@nikoemme_/cadcamfun-nikcli-plugin` performs describe → add elements → create operation → generate G-code → verify against a running sidecar, without any provider key (fake model, as in spec 16 acceptance §6).
5. Isolation unchanged: the sentinel `~/.config/nikcli` test passes; only the app-owned mod loads; user/project mods and plugin auto-install remain disabled.
6. `bun check -p packages/ai/tsconfig.json` and `bun check -p packages/api/tsconfig.json`, the sidecar and desktop typechecks, and `bun test packages apps` are clean; generated clients are regenerated where ids appear.

## 11. Change log

- v1 (2026-10-11): B+C decision recorded; catalogue-as-single-source, plugin AI-tool contribution, app-owned mod (gated), HTTP parity and external agent plugin specified against the inspected tree (`sdk-next@1.428.0` pinned, spec 26 not yet landed, no MCP).
- 2026-10-12: corrected cad_grep drift claim; reconciled schema ownership, optional mods, native confirmation and external authorization with spec 28. RM-01/RM-11 remain pending; no runtime gate claimed.
- 2026-10-12: confirmed cadGrep registration directly and specified preservation of reachability, schemas and read-only authorization across consolidation and the second adapter. Documentation only; no acceptance claim.
