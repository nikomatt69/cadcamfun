# RM-11 — Everything via nikcli (second adapter)

Status: **in progress** (first slice done 2026-10-13: the HTTP face, the plugin and their tests; scoped tokens and plugin AI-tool contributions remain). Depends on: RM-01 (catalogue), RM-03 (HTTP families the bridge will call). Design: `27-everything-via-nikcli.md`. Owners: WP8, WP3, WP4, WP9 `packages/plugin-sdk`.

## Problem

Spec 27 is **proposed**. Without RM-01, a bridge would freeze the per-verb catalogue. The **seam** is the action catalogue: adapter 1 = in-process `Tool.define`; adapter 2 = HttpApi + paired token for standalone nikcli. Two adapters make the seam real.

MCP remains **rejected** (`27` §2). Plugin AI-tool contributions (`plugin-sdk` manifest) land here, not as a fourth dispatch.

## Effect v4

- HTTP face uses generated clients (`@cadcamfun/httpapi-codegen`). Same Schema as in-process execute.
- Token: existing sidecar auth. No keys in logs.
- App-owned mod via `@nikcli-ai/plugin` **without forking nikcli**. Compatibility gate vs pinned `sdk-next@1.428.0` is mandatory (`27` §2).

## Deliverables

1. Parity test: every catalogue action exists on both faces or is explicitly `in-process only` in the catalogue.
2. `buildTools(..., extensions)` used in production (plugin contributions).
3. Standalone plugin package or documented path under `packages/` — only after the compatibility gate.
4. Preserve the already registered `cad_grep` capability through RM-01 consolidation and both catalogue adapters (or a justified explicit in-process-only declaration). Source inspection on 2026-10-12 confirms the `cadGrep` import and inclusion in `BUILT_IN_TOOLS` in `packages/ai/src/tools/registry.ts`; do not re-register it or call it handler-only.

## Out of scope

- Forking nikcli.
- MCP server.

## Verify

```bash
bunx tsc -p packages/ai/tsconfig.json
bunx tsc -p packages/api/tsconfig.json
bun test packages/ai apps/sidecar
```

Plus the spec-27 compatibility gate against the pinned sdk-next.

Catalogue-derived parity checks preserve `cad_grep` reachability, parameter/result schemas and read-only authorization through consolidation and bridge exposure; test any explicit in-process-only exception rather than silently dropping coverage.

## Change log

- 2026-10-13: built the second adapter. `packages/ai/src/actions/bridge.ts` describes the catalogue to an outside client and admits a call per action effect (`read`/`write` yes; `destructive` and the in-process-only `agent` refused). `GET /api/ai/actions` and `POST /api/ai/actions/invoke` (`packages/api`, `apps/sidecar/src/http/ai.ts`, `AiActions` in `services/ai.ts`) run the same tool definitions through `ActingUser` admission, with no model and no embedded host needed. `packages/nikcli-plugin` (`@cadcamfun/nikcli-plugin`) builds nikcli tools from the running application's catalogue. Parity test derives both faces from the catalogue (`packages/ai/test/bridge.test.ts`); `apps/sidecar/test/ai-bridge.test.ts` and `nikcli-plugin.test.ts` cover the routes and the plugin end to end; `compat.test.ts` is the gate against `@nikcli-ai/plugin`. Scoping: the operator narrows the bridge with nikcli's policy statements in `<data dir>/ai/policy.json` (`bridge.use` on a tool or `tool.action`, and `tool.use`, which already applies to the in-app agent): `scopeBridge` filters the listing, `bridgeAdmission` refuses the call (`ai-bridge-policy.test.ts`). Scoped tokens (2026-10-13): `BridgeTokens` (`apps/sidecar/src/services/bridge-tokens.ts`) issues signed, revocable tokens for one project, `read` or `write`, with an expiry; the secret is shown once and only its id is kept. `http/authorization.ts` admits them only on `GET /api/ai/actions` and `POST /api/ai/actions/invoke` (every other route, including token issuing, answers 401), the handlers enforce project and mode, and `Settings → AI → Standalone nikcli` issues, lists and revokes them (`ai-bridge-tokens.test.ts`, `ai-settings.test.ts`). Plugin AI tools (deliverable 2, 2026-10-13): `contributes.aiTools` (`packages/plugin-sdk/src/manifest.ts`: id, description, `read`/`write`, JSON Schema, `entry`) behind a new capability `ai:tool`; the worker host (`apps/sidecar/src/plugins/host.ts`) now loads the plugin as its own module, runs asynchronous handlers and answers `ai.tool` by calling the exported `aiTools[entry]` (`callTool`, `aiTools()`, 30 s deadline). `packages/ai/src/tools/plugin-tool.ts` turns a listing into a host tool (`plugin_<plugin>_<tool>`, the JSON Schema as its zod schema) through `buildTools`' extension hook, the first production caller; a `write` tool is `approval: true`, so the host asks before every call in every role. `apps/sidecar/src/services/ai-plugins.ts` is the production wiring: consent is `<data dir>/plugins/enabled.json` (ids), the plugin lives in `<data dir>/plugins/<id>/`, and the only capability a plugin can hold here is `ai:tool` (a manifest asking for drawing, toolpath, storage or UI access is skipped with a warning: those surfaces are not wired to this host). The bridge lists and runs read plugin tools (write ones need a person's approval). Tests: real worker (`plugins-ai-tools.test.ts`), adapter and approval config (`plugin-tool.test.ts`), the pinned host asking for a write tool and not for a read one (`plugin-tool-host.test.ts`), the application end to end (`ai-plugin-tools.test.ts`). Known limit, asserted in a test so it cannot be forgotten: the worker is not an OS sandbox (process and fetch are removed, `Bun` and `require` stay reachable), so a plugin's code is trusted as far as the operator who switched it on. A tool list change (a plugin switched on later) reaches the in-app host when that project's host is created; the bridge reads it live. Still open, with the reason: (1) the app-owned mod (spec 27 §4.3) is not built, by the spec's own gate: the pinned bundle has one switch, `NIKCLI_DISABLE_MODS`, for every mod, and the mod's three jobs are already done through the fallback §4.3 names, with the same behaviour and no new switch — audit evidence is the event mapper's stream (`tool_call`, `tool_result`, `tool_diagnostic`, `permission_*`), the destructive-group confirmation is native `ask` derived from the catalogue (`permission-modes.ts`; a `confirm: true` never approves), and the workspace context is injected per turn (`turnSystemPrompt`, `HostContextPolicy`). Revisit only if a hook appears that those cannot express. The destructive refusal stands until an outside approval flow exists.

- 2026-10-12: [AI-10](../ai/10-nikcli-and-plugin-adapters.md) adds typed parity, scoped revocable tokens and plugin capability/isolated-mod compatibility gates under [spec 28](../28-native-ai-architecture.md). Embedded execution remains in-process; baseline authorization/permissions do not depend on optional mods. Implementation pending.

- v1: second adapter on the RM-01 catalogue.
- 2026-10-12: replaced stale missing cad_grep registration work with preservation/consolidation and two-adapter parity coverage, confirmed against registry.ts. Documentation only; implementation pending.
