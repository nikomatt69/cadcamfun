# RM-08 — Phone as co-driver

Status: **pending**. Depends on: RM-07 stream recovery (`done.recovered`). Design: `13-vcs-actions-mobile.md`, `20` Phase 5. Owners: WP13 `apps/mobile`, WP4 `apps/sidecar/src/services/companion-gateway.ts`.

## Problem

Gateway, pairing, pinned TLS, chat stream exist. The phone is still a remote control: specialist tool-call rows, PR request-changes/merge UI, APNs are partial (`21` §15.7–15.11). Deepen the **companion module** — same allow-list interface, richer UI adapter. Do not widen `COMPANION_ROUTES` to credentials/plugins/GitHub.

## Effect v4

- Gateway stays Effect services. Phone is a typed HTTP client of the sidecar.
- `vcs_restore_paths` on phone: 403 unless desktop-initiated (`20` §1.4).

## Deliverables

1. Tool-call rows in the phone session (agent id, name, input, output).
2. Review on phone: comment, request-changes, merge when workflow green.
3. APNs opt-in for PR + Actions; no secrets in payload.
4. Honest recovered-turn UI (`done.recovered: true`).
5. TestFlight remains an owner task (signing); do not block the code gates on it.

## Verify

```bash
bun test apps/sidecar
# plus the package's existing mobile JS tests / typecheck as in 00-overview WP13
```

## Change log

- 2026-10-20: the phone-owned deliverables of this step are implemented and tested: tool-call rows with the agent, the input and the output (1), review on the phone with the conflicting files shown when a merge cannot be applied (2), the honest recovered turn (`done.recovered`) (4). Added on top: the conversation list and the stored history of a conversation, pictures attached to a turn, branch creation, restore, a workflow run on a chosen branch, the gateway's own back-off honoured instead of a bare failure, the unread badge on the Activity tab and the saved copy of the lists when the desktop is unreachable. **APNs (3) is not built**: it needs the owner's Apple team and a push key, and the server-side registration and send are outside this step's owner directories, so the phone's "something happened" signal is the badge and the self-refreshing feed until then. RM-07 stays the prerequisite; the step stays **pending**.

- 2026-10-12: [AI-07](../ai/07-companion-continuity.md) maps shared owner/revision/replay and outstanding native decisions to existing companion owners/allow-lists; RM-07 remains prerequisite. Implementation pending.

- v1: companion UI + notifications on the existing gateway seam.
