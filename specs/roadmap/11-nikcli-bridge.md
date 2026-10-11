# RM-11 — Everything via nikcli (second adapter)

Status: **pending**. Depends on: RM-01 (catalogue), RM-03 (HTTP families the bridge will call). Design: `27-everything-via-nikcli.md`. Owners: WP8, WP3, WP4, WP9 `packages/plugin-sdk`.

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
4. Register `cad_grep` (and any other handler-only tools) through the catalogue so they cannot drift again.

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

## Change log

- v1: second adapter on the RM-01 catalogue.
