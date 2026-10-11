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

- v1: companion UI + notifications on the existing gateway seam.
