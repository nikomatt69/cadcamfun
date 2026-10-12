# AI-10 - External nikcli and capability-checked plugin adapters

Status: specified / implementation pending.

## Control and scope

Controlling step: [RM-11](../roadmap/11-nikcli-bridge.md), dependent on [RM-01](../roadmap/01-action-catalogue.md) and [RM-03](../roadmap/03-api-parity.md). [Roadmap](../roadmap/README.md) and [process](../roadmap/00-how-to-follow.md) alone control sequence. RM-01 remains current; this design does not authorize a bridge before catalogue/parity gates or create a competing sequence.

Effect `4.0.0-rc.112` and `@nikcli-ai/sdk-next@1.428.0` are mandatory. Read installed v4 docs; application workflows use `Context.Service`, explicit Layers, named `Effect.fn`, schema decoding, tagged failures and scope-owned interruption. SDK imports remain confined to `packages/ai/src/nikcli/`. AI SDK v7 is stateless/one-shot, core geometry hot loops are pure, and nikcli owns orchestration. No MCP or alternative dispatch.

## Rationale and source evidence

- `packages/ai/src/tools/registry.ts`, `handlers.ts`, `project-tools.ts`: per-verb and inline tool foundations and extension hook; RM-01 must replace drift with one catalogue first. `cad_grep` is already imported/registered; preserve it, do not claim a missing-tool fix.
- `packages/ai/src/nikcli/runtime.ts`, `isolation.ts`, `config.ts`, `sdk-next.d.ts`: in-process tools, pinned host isolation and deny-by-default native permission surface.
- `packages/ai/package.json`: Effect rc.112 and sdk-next 1.428.0 pins. `specs/27-everything-via-nikcli.md` cites newer plugin SDK 1.431.0 staging; that citation is not compatibility evidence against 1.428.0.
- `packages/api/src/groups/`, `packages/api/src/sdk/generated/`, `packages/api/scripts/generate-clients.ts`: existing typed contracts/generated clients; share schemas without importing AI/db into API.
- `apps/sidecar/src/http/authorization.ts`, `apps/sidecar/src/services/auth-tokens.ts`, `companion-gateway.ts`: existing auth/token paths to deepen with external-agent scopes, not forward a full sidecar bearer token.
- `packages/plugin-sdk/src/manifest.ts`: current contributions are commands/panels/postProcessors/operations, not AI tools. New contributions need a versioned contract.
- `apps/sidecar/src/plugins/host.ts`, `bootstrap-script.ts`, `repo.ts`, `specs/09-plugins.md`: capability-checked Worker RPC/lifecycle; legacy browser plugin routes and SDK host are distinct implementations, not interchangeable proof of sandboxing.
- `specs/26-tool-consolidation.md`, `specs/27-everything-via-nikcli.md`, RM-11: stale registration/status and destructive permission descriptions require contract reconciliation. Historical test evidence is not a current pass claim.

## Module, Interface and Implementation

Deepen the ActionCatalogue module at one execute seam: one validated input/result, documented effects, trusted context, permission requirements and revisioned receipt. Embedded nikcli is adapter one and calls execute in-process; external nikcli is adapter two through typed HTTP to the same execute. Plugin Worker RPC is an Implementation adapter for a contributed action, not a third public catalogue/dispatcher. Dependency-safe schemas live in `packages/api`; execution/model documentation lives in `packages/ai`; repositories/core remain behind sidecar execute.

Deletion test: deleting the deep module would duplicate schemas, effect classification, permission evidence and revision rules in host, HTTP and plugins. Depth gives locality for audit/authorization and leverage for transports; an HTTP proxy used internally without behavior adds no depth and is forbidden. The Interface is the test surface; two real adapters must run shared conformance tests.

## Exact owners and contract-first amendments

| Owner | Allowed directories / explicit shared files | Purpose |
| --- | --- | --- |
| WP8 | `packages/ai/src/`, `packages/ai/test/` | Catalogue/embedded adapter, pinned compatibility and isolation gates |
| WP3 | `packages/api/src/groups/`, `packages/api/src/schemas/`, `packages/api/src/sdk/generated/`, `packages/api/scripts/`; shared `packages/api/src/index.ts` | Action parity mapping, schema/client generation and conformance |
| WP4 | `apps/sidecar/src/http/`, `apps/sidecar/src/services/`, `apps/sidecar/src/repos/`, `apps/sidecar/test/`; shared `apps/sidecar/src/layers.ts` | HTTP execute/auth/scoped token issuance and revocation |
| WP9 | `packages/plugin-sdk/src/`, `packages/plugin-sdk/test/`, `packages/plugin-sdk/examples/`, `apps/sidecar/src/plugins/` | Contribution manifest/host RPC and capability tests |
| WP8 conditional amendment | `packages/nikcli-plugin/` | Proposed isolated standalone plugin package, only after compatibility gate and explicit RM-11 package ownership |
| WP6 conditional amendment | `apps/desktop/src/features/*/screens/`, `apps/desktop/test/` | Only if existing token-grant/revocation UI cannot expose external-agent records |

Amend RM-11 exact owners and `specs/27-everything-via-nikcli.md`, `specs/26-tool-consolidation.md`, `specs/08-ai.md`, `specs/05-api-sidecar.md`, `specs/09-plugins.md`, `specs/13-vcs-actions-mobile.md` before incompatible contracts change. Shared package manifests/lockfile are integrating-owner only; no new dependency is authorized by this publication. New token persistence requiring schema changes must first obtain WP0 `packages/db/src/` and `packages/db/drizzle/` ownership and generated migration contract; absent scope fields may not be improvised in unowned DB files. Companion allow-list widening is never an amendment implied by this spec.

## Precise Interface and invariant contracts

### One declaration and transport conformance

Catalogue entry contains stable action/tool ID, input/result schema/version, LLM documentation, classified domain/report/UI/memory/external effects, required capabilities/native permission class, exposure (`both|in_process_only|http_only`) with reason, and one named Effect execute. Input/result schemas are authoritative shared contracts; API cannot import `packages/ai` or `packages/db`. Bridge nikcli's zod requirement once and contract-test unavoidable conversions, including unions, optional/default fields, refinements, finite numbers and errors. No per-adapter schema redefinition.

HTTP mapping reuses existing routes where semantics match; generated parity lists every catalogue entry and route, including explicit in-process-only controls and HTTP-only account/billing actions excluded from the model. Every old verb, including already registered `cad_grep`, remains accounted for. Avoid a permanent dual public catalogue; private legacy adapters have a removal gate and are not advertised twice. Embedded execution never performs an internal HTTP hop.

Both adapters supply trusted immutable actor/project/session/turn/action context, cancellation, operation key/digest and expected revision; transport cannot accept model-supplied grants or owner. Same action executes same authorization, failure schema, receipt/invalidation and precision evidence. HTTP errors are mapped tagged failures/statuses, not a catch-all `ok:false` masking unauthorized mutation. Disconnect does not prove cancelled commit; external timeout follows receipt reconciliation before any retry. Deterministic read retries are bounded; unknown writes are never blindly replayed.

### Scoped, revocable external-agent tokens

External token record contains token ID/hash (raw token shown once), kind `external_agent`, trusted actor, explicit allowed project IDs, grant `read|write`, issued/expiry/revoked times and auditing metadata. Scope cannot be widened by a request field. Issue/revoke through authenticated existing owner/admin controls; public pairing is not automatic write authority. Store raw credentials only in protected client storage, never prompts, plugin manifest, URLs, DB diagnostic rows or logs. Persist server revocation and check it on every execute/control and event subscription; rotation is explicit.

Effective rights are intersection of current resource rights, token project/grant, catalogue capability and native permission/approval. `read` refuses all mutation, persisted reports, memory writes, destructive controls and mutating workflows before repositories run. `write` is necessary but not sufficient for destructive actions. Native human approval is bound to actor/token/session/action digest/document revision/expiry and consumed idempotently; boolean confirmation in model input or possession of a write token is not approval. Grouped tool IDs containing destructive actions use the stricter native `ask` permission unless the pinned SDK proves a safe native escalation path. Resource authorization, permission and scheduling are distinct checks.

Use a separate external-agent transport policy over the same execute contract. Do not widen `COMPANION_ROUTES`, reuse a phone token as an unrestricted external token, expose the sidecar's own bearer token or open a public listener by default. External transport deployment/TLS exposure needs its existing approved configuration contract, not a hidden network/security change. Revocation closes subscriptions, invalidates pending controls and denies later writes even if enqueue/preview happened earlier.

### Capability-checked contributions

Versioned `contributes.aiTools` descriptors contain namespaced unique action IDs, bounded documentation, declarative parameter/result schemas, honest effect classification, required capabilities and RPC entry. Decode at install/enable; reject collisions with built-ins, schema conversion loss, unsupported schema versions, malformed/unbounded docs and descriptors outside declared/granted capabilities. Extension contributions are passed through production `buildTools(..., extensions)`/catalogue derivation, not another host-only registry.

Worker host checks grants and current actor/resource authority on every RPC; manifests cannot approve their own capabilities. Plugin cannot claim read-only while invoking write RPC. Calls carry invocation correlation/cancellation and bounded timeout/payload; retain ready gating, existing maximum outstanding calls and scope-owned shutdown. Disable/revoke/crash fails pending calls with typed errors and stops new admission. Plugins do not receive DB handles, provider keys, full bearer tokens or direct kernel mutation access; RPC reaches the same authorized action execute. Worker isolation is not by itself proof that arbitrary filesystem/network code is contained; test the actual pinned host restrictions and state unsupported containment explicitly.

### Pinned compatibility, mod gate and fallback

Before creating/enabling an app-owned mod or external package, test exact host `sdk-next@1.428.0` with Effect rc.112 and the exact proposed plugin SDK version. A newer reference checkout/declaration file is not runtime evidence. Record exported surfaces and actual tool registration, native questions/permissions, hook ordering, cancellation, result mapping and source/compiled-sidecar behavior. No host unpin/fork to force compatibility.

App-owned mod loads only from the app isolated config directory, with user/project mods, plugin auto-install and hot reload still disabled. Sentinel test verifies user/project config files remain untouched and unloaded. Mod hooks may enrich redacted audit/context or request native permission, but cannot bypass execute authorization, inject an alternate catalogue or silently execute mutations. `NIKCLI_DISABLE_MODS` is not changed until this exact isolated-load gate passes.

If pinned compatibility/isolation fails, retain existing proven native Tool.define/tool wrapper hooks and event mapper for audit/context/confirmation, keep mods disabled and embedded host operational. An unavailable destructive escalation uses strict native permission or stays unavailable; never downgrade confirmation. External package release waits for its own supported-version conformance, not merely successful install. A packaged-sidecar gate is required before a compatibility/release claim.

## Numbered deliverables

1. Confirm RM-01/RM-03 done, reconcile stale contracts and derive parity/exposure from the single catalogue.
2. Add typed HTTP adapter/generated clients invoking the same execute and conformance suite; no embedded HTTP hop.
3. Add explicitly granted project/read-write scoped revocable external-agent tokens and digest/revision-bound native approval evidence.
4. Add versioned plugin AI contributions through capability-checked Worker RPC and production extension wiring.
5. Run pinned compatibility/isolation gate; enable only isolated app-owned mod if proven, otherwise keep proven wrapper fallback and mods disabled.
6. Add standalone package only under approved owner/compatibility gate and offline embedded/external round-trip evidence; separately record packaged compatibility.

## Non-goals

No MCP server/connector, nikcli fork, replacement framework, third action dispatch, internal HTTP loop, new unapproved dependency, full bearer-token forwarding, companion expansion, broad user/project mod loading, provider key logging or physical machining. HTTP-only accounts/billing stay model-invisible. Paid live provider calls are not needed for parity.

## Migration, failure and rollback

Ship one action family vertically after contracts/gates: shared schema/execute, embedded conformance, HTTP conformance, token enforcement, external/plugin consumer, then retire private legacy declarations. Preserve old clients with versioned private decode adapters only until a documented removal gate. Unknown token scope fails closed; legacy companion tokens remain companion-only and are never auto-upgraded. Any new DB fields require generated WP0 migration and fresh/legacy fixture tests.

Compatibility failure disables mod/external additions, not host isolation. Schema drift rejects contribution/execute with typed diagnostics; plugin crash/revocation settles pending RPC and retains committed receipts. HTTP timeout/unknown outcome requests receipt reconciliation, not automatic mutation retry. Rollback revokes external grants, disables extensions/mod and returns to existing embedded wrappers while retaining receipt/decoder support. Do not weaken permissions or delete audit/receipt evidence; a committed action cannot be undone merely by transport rollback.

## Tests and Verify

Existing: `packages/ai/test/tool-definitions.test.ts`, `agents.test.ts`, `nikcli-host.test.ts`, `isolation.test.ts`, `assistant-controls.test.ts`; `apps/sidecar/test/ai.test.ts`, `plugins.test.ts`, `companion-gateway.test.ts`; `packages/plugin-sdk/test/` and its examples. Proposed: `packages/ai/test/action-adapter-conformance.test.ts`, `pinned-mod-compatibility.test.ts`, `apps/sidecar/test/external-agent-scopes.test.ts`, `plugin-ai-actions.test.ts`, `packages/plugin-sdk/test/ai-contributions.test.ts`; conditional `packages/nikcli-plugin/test/offline-roundtrip.test.ts` only after package authorization.

Derive parity from catalogue, not a second hard-coded list. Cover read token/write denial, project mismatch, revocation before commit, expired/stale/duplicate approvals, schema conversion, capability escalation/misclassification, Worker crash/closure, unknown commit reconciliation and sentinel isolation. Same local fake-provider flow through real embedded and external adapters: describe -> supported precise model preview -> accepted revisioned commit -> setup -> deterministic NC -> verify exact hash -> reconnect/read receipt. This proves wiring/safety, not real-model competence or commercial parity. Packaged-sidecar source/binary distinction is explicit.

Implementation Verify commands, not executed here. `typecheck` confirmed in AI/API/sidecar/plugin-SDK manifests and API `generate`/`generate:check` confirmed. Root `build:sidecar` exists but packaging is a separate local release gate, not proof from a doc. Use Monitor and no `.env` reads; no install/live-provider calls:

```sh
bun --no-env-file test packages/ai packages/plugin-sdk apps/sidecar/test
bun --no-env-file run --filter @cadcamfun/ai typecheck
bun --no-env-file run --filter @cadcamfun/api typecheck
bun --no-env-file run --filter @cadcamfun/sidecar typecheck
bun --no-env-file run --filter @cadcamfun/plugin-sdk typecheck
bun --no-env-file run --filter @cadcamfun/api generate:check
git diff --check
```

Regenerate changed clients with `bun --no-env-file run --filter @cadcamfun/api generate` only in implementation and inspect generated diff. No command for a nonexistent plugin package/script is asserted; approve its manifest and script before adding Verify commands. Record exact pinned bundle and compiled-sidecar compatibility results before release claims.

## Pending acceptance checklist

- [ ] RM-01/RM-03 done and required owner/contracts approved; `cad_grep` preserved, not misreported missing.
- [ ] One action Interface, two adapters, authoritative schemas/receipts and explicit transport exclusions pass conformance.
- [ ] Project/read-write token intersection and revocation deny unauthorized writes before execution; companion remains restricted.
- [ ] Destructive actions require native human evidence beyond write token/model boolean, including grouped tool IDs.
- [ ] Plugin contribution schemas and each Worker RPC enforce granted capability/current actor authority.
- [ ] Pinned 1.428.0/rc.112 compatibility and config sentinels verified; failed gate leaves mods disabled and wrappers working.
- [ ] Offline embedded/external precise modelling/setup/NC flow references identical committed evidence.
- [ ] Packaged-sidecar gate recorded separately; no MCP/new dispatch/parity marketing or paid call implied.
- [ ] Verify results recorded by owners before RM-11 completion.

## Change log

- 2026-10-12: Documentation-only adapter contract specified. Recorded stale `cad_grep` claims, native destructive-permission reconciliation, conditional owner/token persistence amendments and pinned isolated-mod fallback. No dependency or implementation changed; no tests executed and acceptance pending.
