# RM-08 — Phone as co-driver

Status: **in progress** (the step's own phone deliverables are built; the owner-requested 3D parity slice of 2026-10-20 is the open part; APNs stays owner-blocked). Depends on: RM-07 stream recovery (`done.recovered`). Design: `13-vcs-actions-mobile.md`, `20` Phase 5. Owners: WP13 `apps/mobile`, WP4 `apps/sidecar/src/services/companion-gateway.ts`.

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

- 2026-10-20 (later): owner-requested 3D parity slice ("the mobile app must show the CAD canvas and the real toolpath visualizer in 3D, like the desktop"). The companion preview is payload format 4: the core names the program's operations (with the tool each one runs and the run of path segments it drew) and the contacts on the desktop's own clock; the sidecar adds the program's tool rows, the part the program cuts and the feature tree of a parametric drawing; the phone draws the real cutter as a solid at the playhead (new Metal buffer), colours the path by operation and isolates one, lists the contacts (seekable, and a stop-at-contact playback), draws the workpiece beside the path and lists the feature tree. The live stock (the material as the program removes it) and the turned profile stay desktop-only; they are the next slice. This adds to the step; it does not replace the entry below.

- 2026-10-20: the phone-owned deliverables of this step are implemented and tested: tool-call rows with the agent, the input and the output (1), review on the phone with the conflicting files shown when a merge cannot be applied (2), the honest recovered turn (`done.recovered`) (4). Added on top: the conversation list and the stored history of a conversation, pictures attached to a turn, branch creation, restore, a workflow run on a chosen branch, the gateway's own back-off honoured instead of a bare failure, the unread badge on the Activity tab and the saved copy of the lists when the desktop is unreachable. **APNs (3) is not built**: it needs the owner's Apple team and a push key, and the server-side registration and send are outside this step's owner directories, so the phone's "something happened" signal is the badge and the self-refreshing feed until then. RM-07 stays the prerequisite; the step stays **pending**.

- 2026-10-12: [AI-07](../ai/07-companion-continuity.md) maps shared owner/revision/replay and outstanding native decisions to existing companion owners/allow-lists; RM-07 remains prerequisite. Implementation pending.

- v1: companion UI + notifications on the existing gateway seam.
