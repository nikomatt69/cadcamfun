# AI-07 - Companion continuity

Status: specified / implementation pending.

## Control and scope

Controlling step: [RM-08](../roadmap/08-mobile-codriver.md), dependent on verified [RM-07](../roadmap/07-ai-lifecycle.md) stream recovery. [Roadmap](../roadmap/README.md) and [process](../roadmap/00-how-to-follow.md) alone control sequence; this is a design contract, not a parallel task board. RM-01 remains current. RM-08's tool-call rows, review, opt-in notifications and honest recovered-turn copy remain required, not displaced by continuity.

Effect `4.0.0-rc.112` and `@nikcli-ai/sdk-next@1.428.0` remain mandatory at application seams; read installed v4 docs before implementation. Gateway workflows use `Context.Service`, explicit Layers, named `Effect.fn`, tagged errors and scoped resources. Mobile remains an Expo typed client, not a second agent loop. SDK imports stay in `packages/ai/src/nikcli/`; AI SDK v7 stays stateless. Core geometry hot loops remain pure.

## Rationale and source evidence

- `apps/sidecar/src/services/companion-gateway.ts`: existing HTTPS pairing, certificate pinning, hashed revocable tokens and `COMPANION_ROUTES`. Phone never receives the sidecar's full bearer token.
- The same file's VCS route comment records that broad matching still admits restore/commit/checkout despite intended desktop-only restriction. This is a known contract gap, not evidence of enforced denial.
- `apps/mobile/test/pairing.test.ts`, `transport.test.ts`, `sse.test.ts`, `offline-queue.test.ts`, `runtime-lifecycle.test.ts`: existing continuity regression locations.
- `apps/sidecar/test/companion-gateway.test.ts`, `companion-chat-e2e.test.ts`, `companion-e2e.test.ts`: gateway/assistant integration foundations.
- `apps/desktop/src/ai/stream.ts`: existing session-state and native decision recovery is the semantic reference, not a claim of complete mobile parity.
- `specs/13-vcs-actions-mobile.md`, `specs/23-ai-runtime-architecture.md`, `specs/27-everything-via-nikcli.md`: pairing, lifetime and unchanged companion restrictions. External nikcli transport is not authority for phone expansion.

## Module, Interface and Implementation

Deepen the Companion module behind the existing paired typed client Interface. Its Interface includes owner/session binding, approved route scope, revision/cursor handling and native decision validity. The Implementation hides reconnect/resync, tool-row deduplication and pending-decision restoration from mobile screens. Desktop and paired mobile are two consumer adapters for the same lifecycle/event seam; pairing remains a distinct transport seam, not another action dispatcher.

Deletion test: removing this depth would spread reconnect, stale-approval handling and evidence identity across chat, review and notifications. Locality belongs in the existing companion transport/state module; leverage is continuity across screens without widened privileges. Do not add a pass-through mobile agent module.

## Exact owners and required amendments

| Owner | Allowed directories / explicit shared files | Purpose |
| --- | --- | --- |
| WP13 | `apps/mobile/app/`, `apps/mobile/components/`, `apps/mobile/lib/`, `apps/mobile/test/` | Existing Expo screens, typed transport/state and regression tests; locate the actual module under these directories, not a fictitious `apps/mobile/src/` |
| WP4 | `apps/sidecar/src/services/` limited to `companion-gateway.ts` and `companion.ts`, `apps/sidecar/test/` | Gateway policy, revocation and continuity tests |
| WP4 amendment, only if route handling changes | `apps/sidecar/src/http/` limited to companion/AI/event handlers; shared `apps/sidecar/src/layers.ts` | Forward existing authorized recovery/control contracts |
| WP3 amendment, only if contract fields are missing | `packages/api/src/groups/`, `packages/api/src/schemas/`, `packages/api/src/sdk/generated/`; shared `packages/api/src/index.ts` | Reuse RM-07 event/decision contracts, regenerate consumers |

Before implementation, amend RM-08's exact owner paths and `specs/13-vcs-actions-mobile.md`/`specs/05-api-sidecar.md` if the conditional WP3/WP4 exposure is necessary. RM-07 must own lifecycle schema/producer changes first; this step consumes them. No edits to `packages/ai/`, `packages/db/`, Tauri or native signing settings are implied. APNs uses the existing notification mechanism; any additional producer/schema ownership requires its own contract amendment. This publication edits none of those files.

## Precise Interface and invariant contracts

1. Paired credentials identify a trusted actor and pairing record, with project grants checked per request. A phone-supplied actor/owner/session alias is not authority. Consume AI-06 owner triple, host/client session resolution, task attempts, receipt identities and event cursor exactly; do not synthesize a phone-owned shadow task.
2. Keep `COMPANION_ROUTES` scope unchanged or narrower. No credentials, plugin management, files, billing, GitHub remote/push/pull, machine control or external-agent bridge routes. Explicitly enforce desktop-initiated-only `vcs_restore_paths`/restore and other destructive restrictions already required by the cited contracts; a broad gateway regexp must not evade application authorization.
3. `connect/resume` authenticates pairing and pins the existing TLS fingerprint, then requests authorized session/task/decision snapshot and cursor. Persist only versioned project/session IDs and safe cursor state. A fingerprint change requires trusted re-pairing, never a silent trust fallback. Revocation closes streams and denies subsequent controls before execution; reconnect cannot reactivate a revoked pairing.
4. Reduce eventId once and `(taskId, attempt, outcomeVersion)` once. On epoch mismatch, sequence gap, expired retention or overflow, suspend normal receipt application, fetch authoritative snapshot/high-water cursor, then resume. A late child result is shown against its original document, not the currently open one. Snapshot model revision and NC artifact hash must match desktop evidence; do not label a locally cached result current.
5. Pending `question_request` and `permission_request` use native nikcli request IDs and choices. Show action, document/revision, request age and destructive consequences. Replies carry requestId and decision evidence, never a generic remembered approval. Server validates owner, current revision/digest, expiry and authority. Duplicate identical replies are acknowledged as already consumed without executing twice; conflicting/stale replies return typed `StaleDecision` and refresh state.
6. Offline queue may retain safe draft text/read intents. Do not queue/replay destructive approval, merge, mutation or old expected-revision writes automatically. Reconnection shows pending intent for revalidation. Disconnect is not abort; only an explicit authenticated abort invokes that control. A recovered completed turn states `done.recovered: true` and distinguishes reconstructed history from live streaming.
7. Tool-call rows include agent/session/task identity, callId, tool/action, schema-decoded bounded input/output summary, status and evidence references. Redact secrets and keep provenance; partial/recovered rows are not fabricated successful execution. Phone UI cannot turn a reported plan into committed geometry.
8. PR comment/request-changes/merge follows existing rights. Merge checks current head/base and green workflow evidence server-side; stale green checks cannot authorize changed commits. Geometry/NC receipt evidence remains revisioned even when surfaced from a review.
9. APNs is opt-in and carries only minimal notification identifiers/category. No tokens, prompts, part geometry or provider bodies. Opening notification fetches authorized current state; notification arrival is not approval or proof of completion. Missing delivery never changes task status.

Failures: `PairingRevoked`, `PinMismatch`, `Forbidden`, `OwnerMismatch`, `StaleDecision`, `RevisionConflict`, `ResyncRequired` and transport unavailability map to explicit UI states. No broad catch converts these to a fresh document, trusted certificate or successful control.

## Numbered deliverables

1. Confirm RM-07 snapshot/control/event contracts and close known destructive-route denial gaps under approved owners.
2. Add specialist/tool-call rows and owner-scoped cursor reducer with snapshot resync and recovered-turn wording.
3. Restore outstanding native decisions across disconnect, with stale/duplicate/revoked reply handling and no offline mutation replay.
4. Complete existing PR comment/request-changes/green-workflow merge UI without changing authorization.
5. Add opt-in PR/Actions APNs continuity with redacted payload and authorized fetch-on-open.
6. Record JS and device validation separately; TestFlight/signing remains an owner task, not a claim from mocks.

## Non-goals

No phone-side orchestration/kernel, autonomous machining, broader allow-list, credential forwarding, external nikcli installation, background model training or TestFlight release in this design task. Remote access does not grant more manufacturing authority than desktop. No paid provider calls.

## Migration, failure and rollback

Version persisted mobile session/cursor state. Invalid or owner-ambiguous legacy state is discarded as a cache and replaced from authorized snapshot, not used to migrate ownership. Preserve drafts but quarantine old approvals. Existing pairing remains valid only within existing grants; no automatic scope upgrade. A gap or outage labels evidence stale and leaves committed state unchanged. Revocation removes local sensitive caches and requires deliberate pairing recovery.

Roll back richer consumers to existing state/polling recovery without loosening gateway checks. Keep stale-decision and owner validation in force. Disable optional notifications independently; never replay queued writes to compensate. Native notification/signing failure is reported separately from deterministic JS contract gates.

## Tests and Verify

Existing tests listed in evidence remain regression targets. Proposed: `apps/mobile/test/ai-continuity.test.ts`, `apps/mobile/test/native-decision-recovery.test.ts`, `apps/sidecar/test/companion-owner-controls.test.ts`. Use local fake provider, simulated network/cursors, real gateway authorization and versioned snapshots. Cases: disconnect with pending permission/question, duplicate/conflicting replies, revocation mid-stream, stale document/action digest, expired cursor, out-of-order child result, pin mismatch, offline mutation denial and same desktop/phone committed model/NC hash. Include PR head change after green workflow and notification payload redaction.

Implementation Verify commands, not executed here. `apps/mobile/package.json` confirms `typecheck` and `build` (Expo iOS JS export); sidecar/API manifests confirm `typecheck` and API `generate:check`. Run with Monitor, isolated offline fixtures and no `.env` reads:

```sh
bun --no-env-file test apps/mobile/test apps/sidecar/test
bun --no-env-file run --filter @cadcamfun/mobile typecheck
bun --no-env-file run --filter @cadcamfun/sidecar typecheck
bun --no-env-file run --filter @cadcamfun/api typecheck
bun --no-env-file run --filter @cadcamfun/api generate:check
bun --no-env-file run --filter @cadcamfun/mobile build
git diff --check
```

JS export is not native notification, TLS, signing or device proof. A separate supervised local-device checklist must exercise pinning, background/foreground reconnect, pending decisions and revocation; record device/OS/build and unresolved signing items. No runtime/provider/device tests are asserted by this publication.

## Pending acceptance checklist

- [ ] RM-07 recovery verified and required owner amendments approved.
- [ ] Existing allow-list is unchanged/narrowed; desktop-only destructive rules enforced.
- [ ] Paired owner/revision/evidence matches desktop; reconnect/overflow uses authoritative snapshot.
- [ ] Native decisions recover safely; stale, duplicate and revoked replies cannot execute twice.
- [ ] Offline queue never blindly replays mutation/approval; recovered copy is honest.
- [ ] PR/workflow UI and opt-in redacted notifications meet actual RM-08 deliverables.
- [ ] JS gates and separate native/device evidence recorded before RM-08 completion; TestFlight not implied.

## Change log

- 2026-10-12: Documentation-only continuity design specified. Known broad destructive VCS route match recorded for contract-first enforcement, not described as already safe. Conditional owner amendments remain unapplied; no tests executed and implementation pending.
