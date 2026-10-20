# RM-04 — Desktop screen parity

Status: **pending**. Depends on: RM-03 routes for the vertical being ported. Design: `12-frontend-clone-brief.md`, `06-desktop-ui.md`. Owners: WP6 `apps/desktop` (WP7 only if a screen needs `src/viewport`).

## Problem

`PageStub` is gone from `src/pages/**` (pages re-export screens). Remaining friction is **fake** screens: org chat, 2FA/magic-link, MCP directory — UI chrome without the legacy behaviour. Spec 06 still says "long tail of legacy pages".

Keep one screen **module** per route. Data access only through `ApiClient` (**adapter** at the HTTP seam). Do not duplicate planning or CAM generate in the UI (`combineGCode` dies in RM-02).

## Effect v4

- UI runs effects with the app `ManagedRuntime`. Queries: `useRead` / `useQuery` / `useMutation` as in `src/app/queries.ts`.
- Decode on the contract Schemas. No `process.env`. No direct model-provider calls.

## Deliverables (order inside this step)

Follow `12-frontend-clone-brief.md` verticals, but skip anything already matching legacy. Suggested remaining order:

1. Library CRUD completeness (materials/tools/machines/components) if still read-only — coordinates with RM-05 writes
2. CAM setup UI bound to RM-02 store (if RM-02 landed)
3. Auth leftovers (get-session, magic-link verify, 2FA) against real sidecar routes
4. Organizations + invitations + chat once RM-03 conversation routes exist
5. MCP settings as honest "not shipped" UI if spec 27 rejected MCP — do not fake a live MCP server

Bug-for-bug port from `.reference/` (read-only). Append Done/Deviations to `12-frontend-clone-brief.md`.

## Out of scope

- Restyling, "improvements", new routes.
- iOS (RM-08).

## Verify

```bash
bun check -p apps/desktop/tsconfig.json
bun test apps/desktop
bun run --filter @cadcamfun/desktop build
```

`app-mount.test.ts` must pass for touched routes. No browser/Playwright (`12` § definition of done).

## Change log

- 2026-10-12: [AI-03](../ai/03-native-workspace-review.md) specifies document-scoped receipts, revision conflicts, native review and persistent undo semantics; depends on RM-03 revision/receipt implementation. Geometry candidate backend remains RM-09. Existing WP6 scope includes AI consumers; implementation pending.
- 2026-10-16: marketplace removed from the product; the marketplace screen deliverable and its mention in the fake-screens list are gone.

- v1: replace fake screens after their HTTP groups exist.
