# Completed specs (archive)

Specs in this folder are **finished**: the scope they describe is built, verified, and has no open build item. Agents must **not** re-open
them, extend them, or schedule work from them. If a change touches their area, add a short dated note in the spec's change log and keep
going; if new scope is needed, write a new spec in `specs/` and link back here.

Archived 2026-10-29 after checking each spec's status line against the code and re-running its tests.

| Spec | What it delivered | Evidence re-run on 2026-10-29 | Caveat that is not a build item |
| --- | --- | --- | --- |
| [24 — assistant control flow](24-assistant-control-flow.md) | roles/modes, session controls, questions, permissions, recovery, memory consolidation | verification recorded in the spec (323-case runtime suite, 57 integration cases) | provider accuracy is not inferred from deterministic tests |
| [36 — licensing and policies](36-licensing-and-policies.md) | Apache-2.0 default, scoped proprietary terms, community policies, templates | `packages/ai` `action-contracts` + `cache` tests: 13 pass (the `cam.turn` failure it mentions is fixed); root policy files and `.github` templates exist | GitHub private reporting / branch protection are repository settings, never assumed |
| [38 — project saving](38-project-saving.md) | autosave, base-revision 409, restore points, recovery draft | desktop `autosave`, `tauri-wiring`, `sidecar-recovery` tests pass | Tauri close/update paths were only exercised over mocked IPC; one manual check in a packaged window (edit a stored drawing, close at once) is still worth doing |
| [63 — keybindings](63-keybindings.md) | command catalogue, Effect keymap service, Settings > Keyboard, snaps | desktop `keybindings*`, `tauri-wiring` tests pass (80 pass, 0 fail) | click-to-place after a creation key is deliberately not a mode |
| [66 — Effect OpenTelemetry](66-effect-opentelemetry.md) | traces, metrics, logs, `/metrics`, sampling, attribute scrubbing | `packages/ai` + `apps/sidecar` `observability` tests: 20 pass | none |

## Not archived on purpose

- **WP spec files** (`02`–`10`, `13`, `14`) stay in `specs/`: `CLAUDE.md` tells every agent to read the spec of its work package, and
  most of them still carry open items (see `67-real-state-2026-10-29.md`).
- Analysis and background documents (`15`, `33`, `35`, …) are inputs, not deliverables, and are still cited by the specs that do have open work.
