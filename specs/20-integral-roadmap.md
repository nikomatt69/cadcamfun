# 20 — Integral roadmap: AI, VCS, Workflows, Library, Context

Status: v1 — single, sequenced plan to take the cadcamfun AI agent from "nikcli shape, already implemented" (specs 15–19) to "first-class CAD/CAM colleague" with parity-class depth (specs 12, 14) and a phone that can co-drive (WP13).

This spec is the integral roadmap: every phase has an owner, a deliverable, a set of dependent specs, an acceptance gate, and an explicit exit. Phases never overlap on the same WP directory (per `01-conventions.md` §4 / `00-overview.md` §4 "Parallelisation map"); they queue behind their dependencies.

The roadmap is opinionated. It assumes:

- WP11 (VCS) and WP12 (Workflows) are **done** in their core / sidecar / API surface, with the agent already wired (`apps/sidecar/src/services/ai-vcs-tools.ts`).
- WP13 (mobile) builds for and runs in the iOS simulator; the assistant on the phone is wired but device-key deployment is pending (the "device / TestFlight" line in `13-vcs-actions-mobile.md` §8).
- WP8 (AI) is done to the level of `08-ai.md` §1.5 and the agent commit log.
- WP0 (DB) is **stable** in production for the v6.0 entity model; library-schema migration is a Phase 4 deliverable.

Phase naming follows the existing WP IDs where the work lives there; new work carries a `Phase` ID. Each phase has one owner directory; cross-WP edits go through the spec first (`01-conventions.md` §4).

---

## Phase 0 — already shipped (Wave 0, status: green)

| ID | What shipped | Owner | Source |
| --- | --- | --- | --- |
| `00` | nikcli host in-process, isolation, deny-by-default `cadcam` agent, permissions, compaction settings | WP8 | `packages/ai/src/nikcli/{runtime,config,isolation,context}.ts` |
| `00` | 22 built-in `cad_*` / `cam_*` / `lib_*` / `memory_*` tools, each with a `.txt` prompt | WP8 | `packages/ai/src/tools/`, `tool-prompts.test.ts` |
| `00` | 4 specialists (`researcher`, `editor`, `modeler`, `machinist`) with curated tool sets, `BackgroundTaskManager` (4 active / 16 queued, exclusive edit), tool-call forwarding to the parent stream | WP8 | `packages/ai/src/nikcli/agents.ts`, `background-tools*.ts` |
| `00` | 10 skills (`cad-3d-modeling`, `cam-operation-workflow`, ...) installed into the host config; user-skill API (`GET/PUT/DELETE /api/ai/skills`) with reload | WP8 | `packages/ai/src/skills/{index,user}.ts` |
| `00` | Provider catalogue: 4 base providers + models.dev through the host, 60s cache, `cadcam` agent has no built-in shell/file tools | WP8 | `packages/ai/src/nikcli/{config,catalog,models-cache}.ts` |
| `00` | Sessions: `hostChatStream` with retry curve (up to 5 resumes), auto-continuation (up to 50 nudges), heartbeat (5 s), no idle timeout | WP8 | `packages/ai/src/nikcli/chat.ts` |
| `00` | Credentials: `AiCredentials` service, `<dataDir>/ai/credentials.json` (mode 0600), `provider.api.set`, `DirectModel` map | WP8 | `packages/ai/src/credentials.ts` |
| `00` | Workspace context renderer (`renderWorkspaceContext`, 6 000-char budget, sections in priority order, `renderNotes`) | WP8 | `packages/ai/src/workspace-context.ts` |
| `00` | VCS core + sidecar + API group (`packages/vcs`, `apps/sidecar/src/services/{project-vcs,ai-vcs-tools}.ts`) | WP11 | `13-vcs-actions-mobile.md` §3 / §4 |
| `00` | Workflows core + sidecar (`packages/workflow`, `apps/sidecar/src/services/{workflow-runner,workflow-steps}.ts`); 4 built-in steps | WP12 | `13-vcs-actions-mobile.md` §3 / §4 |
| `00` | Mobile companion gateway (`apps/sidecar/src/services/companion-gateway.ts`) + iOS shell (WP13): QR pairing, pinned TLS, scope tokens, route allow-list, iOS simulator build green | WP13 | `13-vcs-actions-mobile.md` §6 |

Exit: a scripted conversation through the embedded host can edit a project on an `ai/*` branch, open a PR and run workflows. The companion chat reaches the same code path over pinned TLS. Acceptance is the green CI badge on `bun test packages/ai apps/sidecar` and the simulator screenshot in CI.

---

## Phase 1 — integrate the agent with VCS and Workflows (Wave 1)

Owners: WP8 + WP11 + WP12. No cross-package edits; the integration is at the sidecar services layer that already exists.

| ID | Deliverable | Owner | Depends on | Source / spec | Acceptance gate |
| --- | --- | --- | --- | --- | --- |
| `1.1` | `ai/vcs-tools.ts` extended with `vcs_restore_paths(paths, from)` (read-only on `ai/*`, requires a clean working copy) | WP11 + WP8 | Phase 0 | spec 17 §1.1 | round-trip via `agent_task` returns the restore commit oid; `ai` actor cannot run on `main` |
| `1.2` | `actions_run` becomes the single workflow entry: `manual`, `pull-request`, `push` with the same trigger shape; outputs of one run reachable as `${{ steps.<id>.outputs.<k> }}` | WP12 + WP8 | Phase 0, `13` of spec 17 | spec 17 §1.3 | e2e: edit + commit + PR triggers `pullRequest` workflow; `actions_run { workflow: "validate-and-cut" }` runs `manual` and reports the run id |
| `1.3` | `cam/sequence` step: validates that `restFrom` / `prevTool` references point to existing operations; rejects orphan operations and cyclic dependencies | WP12 + WP4 (cam-sidecar) + WP8 | `packages/workflow/src/run.ts` | spec 17 §1.3 | a toolpath with `restFrom: "non-existent"` fails the step with a clear message; a workflow with three operations chained by `prevTool` passes |
| `1.4` | Companion gateway exposes the new `vcs_restore_paths` route only to desktop-initiated sessions (phone receives 403, by allow-list) | WP13 + WP11 | Phase 1.1 | `13-vcs-actions-mobile.md` §6, spec 17 §1.7 | phone-call attempt returns 403; desktop-call attempt returns 200 |
| `1.5` | `ActivityLog` rows for AI commits cite `actor.kind === "ai"` and the prompt that produced them (URL-safe truncated to 200 chars); visible in the project's history view | WP11 + WP6 | `13-vcs-actions-mobile.md` §4, WP6 history screen | a CLI test asserts the citation; the history UI shows it |

Exit: a single `agent_task { agent: "machinist", prompt: "..." }` can take a project from "a valid drawing" to "a PR with a passing `validate-and-cut` workflow" end to end.

---

## Phase 2 — parametric + composed CAM (Wave 1)

Owners: WP8 + WP3 (CAM schema) + WP4 (cam-sidecar). The CAD/CAM core is already parametric-capable in `packages/core/src/cad/parametric.ts` (per spec 16 §3.5); the work is to teach the agent the patterns.

| ID | Deliverable | Owner | Depends on | Source / spec | Acceptance gate |
| --- | --- | --- | --- | --- | --- |
| `2.1` | New skill `parametric-design`: when to use `parametric`, how to name parameters and expressions, how to edit later; worked examples (plate with hole pattern, bracket family, housing with ribs) | WP8 | Phase 0 | spec 16 §3.5 | `tool-prompts.test.ts` + a hand-written integration test in `packages/ai/test` |
| `2.2` | Skill `composed-cam-programs`: the full sequencing rules, stock carry-over, multi-setup, lathe + mill, probing; the operation catalogue; the workflow composition (spec 16 §3.6) | WP8 | Phase 0 | spec 16 §3.6 | same as `2.1` |
| `2.3` | `cam_operations_suggest_chain` tool (read-only): given a drawing + material + tool + machine, propose the next operation kind + parameters (e.g. "next: `pocket` with `toolDiameter: 6, depth: 4, stepdown: 2`") | WP8 + WP3 | Phase 0 | spec 16 §3.6.7 | unit-tested against 3 canonical projects (`tests/test-.../composed-cam.json`) |
| `2.4` | `cam_chain_status(operationId)` tool (read-only): from a toolpath, return `restFrom`, `prevTool`, the previous toolpath's residual stock height map (if available), warnings | WP8 + WP4 | spec 16 §3.6.3 | a hand-written integration test (`composed-cam-status.test.ts`) |
| `2.5` | Tool prompts updated where the workflow shape changes (`cam_create_operation`, `cam_update_operation`, `cam_generate_gcode`, `cam_verify_toolpath`, `vcs_commit`, `vcs_open_pull_request`); `tool-prompts.test.ts` asserts every operation type, tool type and material is documented | WP8 | `2.1`–`2.4` | `packages/ai/src/tools/prompts/` | `tool-prompts.test.ts` exits 0 |
| `2.6` | Specialist prompt updates: modeler adds a "decompose before you build" + "use parametric for variable parts" section; machinist adds the sequencing rules + verification per operation | WP8 | `2.1`, `2.2` | `packages/ai/src/nikcli/agents.ts` | agents prompt tests green |

Exit: a one-shot chat "make this parametric in 3 sizes and machine it" takes a stub project through `parametrize → face → rough → finish → drill → verify → commit → PR` with a passing `validate-and-cut` workflow.

---

## Phase 3 — context + library awareness (Wave 1)

Owners: WP8 + WP0 (DB) + WP6 (UI state). Same agents, sharper perception.

| ID | Deliverable | Owner | Depends on | Source / spec | Acceptance gate |
| --- | --- | --- | --- | --- | --- |
| `3.1` | Snapshot graph augmentation: include `lastGcodeChangedAt`, `lastVerifiedAt`, `selectedGeometryHash`, `stockBox`, `machineLimits`, layered materials/tools/configs referenced. New fields in the schema — not a new schema | WP6 + WP8 | spec 19 §2.1 | unit test on `renderWorkspaceContext` with the new fields; renderer caps each field within the budget |
| `3.2` | The renderer adds a "next machining decision" hint per state (e.g. when `verification.state === "errors"` and the first issue is `Gouge`, the section ends with "Likely cause: wrong offset or wrong tool diameter. Call `cam_describe_machine` to check axis envelope first.") | WP8 | `3.1` | spec 19 §8.2 | the hint matches the `toolpath-verification` skill's first table row |
| `3.3` | Library awareness: the snapshot includes the **first** material / tool / machine referenced by the active toolpath (full rows are reachable by `lib_lookup_*`) | WP8 + WP4 | spec 18 §1, WP4 lib endpoints | unit test on `renderWorkspaceContext` with the new fields |
| `3.4` | `memory_recall` returns structured notes (typed): `preference`, `lesson`, `spec` (key → typed value). Renderer prints them in a dedicated section after `Workspace` | WP8 + WP0 | Phase 0 | snapshot schema update; round-trip test |
| `3.5` | The agent's `system` prompt includes a one-line summary of the project's last 3 commits ("changed: plate width 60→70 mm, ring Ø 32 mm; added: 4 holes; verified: passed"). Derived from `vcs_log` | WP8 + WP11 | spec 17 §1.1 | unit test asserts the line appears when `vcs_log` is non-empty; absent for fresh projects |

Exit: the agent's first message in a session opens with what is on screen *and* what changed last *and* what the user has asked before; no guessing the dimensions.

---

## Phase 4 — library write tools + GitHub mirror of items (Wave 2)

Owners: WP0 + WP8 + WP11 + WP3 (API).

| ID | Deliverable | Owner | Depends on | Source / spec | Acceptance gate |
| --- | --- | --- | --- | --- | --- |
| `4.1` | Library-schema migration in `packages/db`: `Material`, `Tool`, `MachineConfig` gain a `version`, `previousVersionId`, `libraryProjectId`; the VCS tree under `materials/<id>.json` carries the canonical version | WP0 + WP11 | Phase 0, spec 18 §1.1 | `bun run db:generate` produces a non-destructive migration; `packages/db/upgrade.test.ts` rounds-trips |
| `4.2` | API group `/api/library/{materials,tools,machines,components}/**` (list / get / upsert / delete). AI can `PUT /api/library/materials/:id` via the host (a tool `lib_upsert_material`), with `confirm: true` for delete | WP3 + WP8 + WP4 | `4.1`, spec 18 §6 | HTTP test passes; `confirm: true` is enforced for AI |
| `4.3` | `lib_upsert_material`, `lib_upsert_tool`, `lib_upsert_machine_config`, `lib_set_default` tools added to `tools/registry.ts`. Each with a `.txt` prompt, schema-validated, allow-listed for `modeler`, `machinist`, and `cadcam` (the latter only with confirmation) | WP8 | `4.2` | spec 18 §6 | `tool-prompts.test.ts` plus an integration test in `packages/ai/test` |
| `4.4` | GitHub mirror of library items: a `library/<scope>/...` directory pushed/pulled via `packages/vcs/src/github.ts`; `vcs_remote_library` route on the sidecar; AI cannot push | WP11 + WP4 | `4.1`, `4.3` | spec 18 §6, `13-vcs-actions-mobile.md` §7 | push/pull against an in-memory GitHub transport; person-only access through the desktop; AI returns 403 |
| `4.5` | UI: library screens for materials, tools, machines, components (WP6) — same surface the agent calls. Editing in the UI is the source of truth for `confirm: true` | WP6 | `4.2`, `4.3` | spec 18 §6 | UI screens behind `/library/{materials,tools,machines,components}` exist; editing an item triggers the same VCS commit flow as a CAD edit |

Exit: the agent edits a material row, runs a toolpath with the updated Vc/fz, sees the suggestion change, commits and opens a PR; the user merges after seeing the new value in the library screen.

---

## Phase 5 — phone as a co-driver (Wave 2)

Owners: WP13 + WP8 + WP11. The companion gateway exists; the work is to make it a real partner, not a remote control.

| ID | Deliverable | Owner | Depends on | Source / spec | Acceptance gate |
| --- | --- | --- | --- | --- | --- |
| `5.1` | Streaming chat from phone keeps the model working when the connection drops; the desktop shows the recovered turn (`done.recovered: true`) | WP13 + WP8 | Phase 0, `13-vcs-actions-mobile.md` §6 | spec 16 §5.1 | `companion-chat-e2e.test.ts` simulates a dropped socket; the phone session state eventually shows the answer |
| `5.2` | Phone shows the agent's tool calls as they happen in the child's session (specialists; spec 16 §3.1): a row per call with agent id, name, full input, output | WP13 + WP6 (UI mirror) | spec 16 §6, `08-ai.md` §"Specialists are visible and live" | phone UI renders a 3-row sample list |
| `5.3` | "Review on phone": a person on the phone can comment, request changes (a `request-changes` review on the PR), and merge when the workflow is green; the desktop is notified | WP13 + WP11 | spec 17 §1.3 / §4 "Guards" | a `companion-pr-review.test.ts` covers the round-trip |
| `5.4` | Push notifications for PR + Actions events (APNs): opt-in settings; no payload that includes secrets | WP13 + WP10 (release) | `13-vcs-actions-mobile.md` §6 | spec 18 §6 | smoke test on the macOS runner; signed build pending owner task |
| `5.5` | Streaming AI assistant panels on phone render in `opentui` (or Solid-equivalent on iOS); the same Activity surface as the desktop | WP13 | Phase 0 | `08-ai.md` §"Tool prompts, machines and design" | visual reference in the iOS screenshot artifact |

Exit: a person on the phone can dispatch a job to the assistant, see the specialists work, mark a PR for changes, merge after the workflow is green. The desktop mirrors the conversation and the editor catches up.

---

## Phase 6 — parity-class depth (Wave 3)

Owners: WP7 (viewport) + WP2 (CAM core) + WP8 (specialist updates).

`specs/14-cad-cam-parity-roadmap.md` lists the gap between v6.1 and Fusion/hypermill class. Phase 6 closes the items the AI agent makes cheap.

| ID | Deliverable | Owner | Depends on | Source / spec | Acceptance gate |
| --- | --- | --- | --- | --- | --- |
| `6.1` | Mesh chamfer / fillet / shell / sweep / loft are first-class element types in `element-catalog.ts`; the modeler's prompts use them | WP2 + WP8 | `specs/14-cad-cam-parity-roadmap.md` §5.1 | spec 16 §3.5.4 | tool test passes for `chamfer` and `shell` |
| `6.2` | Lathe operations (`facing`, `turning-od`, `turning-id`, `parting`, `grooving`, `threading-od`) wired into the generator + `cam_create_operation`; `cam_describe_machine` distinguishes mill / lathe / printer | WP2 + WP4 (cam-sidecar) + WP8 | `specs/14-cad-cam-parity-roadmap.md` §5.2 | spec 16 §3.6.1 | `cam_create_operation { type: "threading_od" }` round-trip; verification on a mill still passes |
| `6.3` | 3D-surface finishing: pencil / scallop / flowline as named operations; `parallel` and `waterline` already exist | WP2 + WP8 | spec 16 §3.6.1 | a `parallel` operation on a curved face regenerates without model errors |
| `6.4` | Swept-cutter collision: the verify engine uses the cutter's swept volume, not just the flute | WP2 + WP8 | spec 16 §3.6.5 | a `HolderCollision` is reported when the swept cylinder hits the stock |
| `6.5` | 3+2 indexing: a `pocket` operation carries an `Orient`; the post inserts the trunnion move; `cam_describe_machine` reports the AC/BC axes | WP2 + WP4 + WP8 | spec 16 §3.6.9 | a worked example with the Haas trunnion example builds end to end |
| `6.6` | Parametric features: `fillet { edgeSelector, radius }`, `shell { faceSelector, thickness }`, `pattern-along-path` | WP2 + WP8 | `specs/14-cad-cam-parity-roadmap.md` §3.1 | spec 16 §3.5.4 | rebuild succeeds on a parametric plate with all three |

Exit: the agent can build a real bracket family — parametric, milled + turned, verified, reviewed on the phone.

---

## Phase 7 — observability + cost (Wave 3)

Owners: WP8 + WP10.

| ID | Deliverable | Owner | Depends on | Source / spec | Acceptance gate |
| --- | --- | --- | --- | --- | --- |
| `7.1` | Per-call token usage surfaced as `done.usage` from `hostChatStream`; aggregated in the UI in a `/settings/costs` screen (already stub in WP6) | WP8 + WP6 | Phase 0 | `08-ai.md` §5 "Host bus events" | each tool-result event carries `usage`; the screen sums inputs / outputs / cache hits |
| `7.2` | `ai/compact` user action: explicit compaction by the host (`POST /session/:id/summarize`, `auto: false`); UI exposes a button + the readback (`effective policy`) | WP8 + WP6 | Phase 0, `08-ai.md` §5 | a manual compaction reduces `tokens.total` next turn; the button is in the chat panel |
| `7.3` | "Compact now" survives a denial: the UI shows the compaction outcome honestly (`reduced: true|false|failed`) | WP8 + WP6 | `7.2` | `app_simulator` / unit test covers the three outcomes |
| `7.4` | Streaming recovery: a dropped stream surfaces `done.recovered: true`; the UI says "the AI finished while you were away" | WP8 + WP6 + WP13 | spec 16 §5.1 | a test with `kill -STOP` on the sidecar during a turn |

Exit: the agent's cost is visible per session, per project, per turn; users can choose when to compact; reconnects are honest.

---

## Cross-phase contracts and gates

### Cross-phase invariant

The agent never writes to `main`, never merges, never opens a pull request a person would not have wanted to see, never runs a workflow whose effect the user did not ask for. **This invariant must be enforced by tests in every phase that touches a new endpoint or tool.**

The tests that enforce it:

| Test | File | Gate |
| --- | --- | --- |
| AI actor cannot commit / restore / merge on `main` | `apps/sidecar/test/ai-vcs-actor.test.ts` (planned) | exit 0 |
| Phone gateway refuses credential / plugin / GitHub routes | `apps/sidecar/test/companion-gateway.test.ts` | exit 0 |
| Unknown `uses:` fails the workflow before any step runs | `packages/workflow/test/missing-steps.test.ts` | exit 0 |
| A run is a function of `ctx.files`, not the live DB | `apps/sidecar/test/workflow-purity.test.ts` | exit 0 |
| No API key in logs / errors / serialised state | `packages/ai/test/credential-isolation.test.ts` | exit 0 |
| Oid compatibility with git | `packages/vcs/test/git.test.ts` | exit 0 |
| `cadcam` agent has no shell/file tools in its allow-list | `packages/ai/test/nikcli-host.test.ts` | exit 0 |

### Cross-phase boundary checks

- A change to a contract (route, schema, tool id, store file name) edits the spec in §3 first.
- A new tool requires a `.txt` prompt and a registry entry in the same commit as the tool's `tools/<id>.ts`.
- A new specialist requires a roster entry, a permission block, and a prompt in `agents.ts` in the same commit.
- A new workflow step requires a registered handler in `apps/sidecar/src/services/workflow-steps.ts` and a contract in `packages/workflow/src/schema.ts`.
- A new library table requires a migration in the same change.

### Definition of done (every phase)

1. `bun install` at the repo root succeeds.
2. `bunx tsc -p <package>/tsconfig.json` exits 0 for every touched package.
3. `bun test <package dir>` passes; new behaviour has tests; bug fixes have regression tests.
4. The spec that owns the surface has its "Change log" entry and "Status" updated (`01-conventions.md` §4).
5. The AI agent tests in the cross-phase invariant table still pass.

---

## Reading guide

- The detailed agent design is in `16-cadcam-agent-blueprint.md`.
- The integration design is in `17-integration-vcs-workflows.md`.
- The library is in `18-library-and-knowledge.md`.
- The context contract is in `19-context-awareness.md`.
- The architectural comparison and source grounding is in `15-ai-agent-analysis.md`.
- The parity targets are in `14-cad-cam-parity-roadmap.md` and `12-professional-cad-cam.md`.

## Change log

- v1: integral roadmap. Sources every WP that already ships (Phase 0), queues 7 phases of follow-up, locks invariants in tests.
