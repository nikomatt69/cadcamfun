# 21 — Integration Master Plan (single source of truth)

Status: v1 — single tracking spec that ties every step of the cadcamfun agent system (AI + VCS + Workflows + Library + Context + Mobile) to its owning spec (15–20, 22), to the source file that implements it, and to a status flag. Future work flows in by editing this file; cross-WP edits still go through the relevant spec.

The plan is read top to bottom. Each step has:

- a `Status` flag: `done` (the source file is in the repo and the cited test is green), `partial` (the surface exists but the contract is incomplete), `pending` (planned in a spec, no source yet), `gap` (cited here as missing, to be assigned to a WP in spec 22).
- a `Spec` pointer — which spec (15-22) owns the design of this step.
- a `Source` pointer — the existing file or the file that will be written.
- a `Verify` gate — the test or command that proves the step.

When a future PR moves a step, edit this file in the same commit. The cross-WP invariants in spec 20 §"Cross-phase contracts and gates" still apply.

## 1. The agent host (WP8)

| # | Step | Status | Spec | Source | Verify |
| - | --- | --- | --- | --- | --- |
| 1.1 | Embed nikcli `sdk-next` in-process | `done` | 15, 16 | `packages/ai/src/nikcli/runtime.ts` | `packages/ai/test/nikcli-host.test.ts` |
| 1.2 | Hard isolation (`XDG_*_HOME`, `NIKCLI_TEST_HOME`, `NIKCLI_DISABLE_PROJECT_CONFIG=1`) | `done` | 16 §2.5 | `packages/ai/src/nikcli/isolation.ts` | unit test |
| 1.3 | deny-by-default `cadcam` permission map with the curated tool allow-list | `done` | 16 §2.1 | `packages/ai/src/nikcli/config.ts:79-100` | `nikcli-host.test.ts` |
| 1.4 | Host compaction settings (`auto: true`, `prune: true`) | `done` | 16 §2.1 | `nikcli/config.ts:127` | unit test |
| 1.5 | Host test that `cadcam` agent has no shell/file/web tools | `done` | 16 §2.5 / 8 §1 | `packages/ai/test/nikcli-host.test.ts` | exit 0 |
| 1.6 | `task` tool denied for the parent agent (delegation through `agent_task` only) | `done` | 16 §2.1 | `nikcli/config.ts:95` | `nikcli-host.test.ts` |
| 1.7 | Read-only researcher may use `code_mode` for confined scripts | `gap` | 16 §2.1 | `nikcli/config.ts:99` grants `code_mode` to `cadcam` but no specialist inherits it | planned in spec 22 §1.1 |

## 2. Specialists (WP8)

| # | Step | Status | Spec | Source | Verify |
| - | --- | --- | --- | --- | --- |
| 2.1 | `researcher` (read-only, background, no edits) | `done` | 16 §3 | `packages/ai/src/nikcli/agents.ts` | `agents.test.ts` |
| 2.2 | `editor` (edits, foreground, exclusive lock per project) | `done` | 16 §3 | same | same |
| 2.3 | `modeler` (edits, foreground) | `done` | 16 §3 | same | same |
| 2.4 | `machinist` (edits, foreground, can call `actions_run`) | `done` | 16 §3 | same | same |
| 2.5 | `reviewer` specialist (PR-level: `vcs_diff`, `vcs_list_pull_requests`, can summarise for a review) | `partial` | 16 §3, 17 §2.5 | mentioned in spec 16 §3.2 but not in `SUBAGENT_IDS` | spec 22 §1.2 |
| 2.6 | Specialist permission map computed by `subagentPermission(spec, toolIds)` | `done` | 16 §3 | `agents.ts:176` | `agents.test.ts` |
| 2.7 | `BackgroundTaskManager` (4 active / 16 queued, exclusive edit lock) | `done` | 16 §6 | `nikcli/background-tasks.ts` | `background.test.ts` |
| 2.8 | Specialist tool-call forwarding to parent stream + `agent_task_read/cancel` | `done` | 16 §6 | `background-tools*.ts` | same |
| 2.9 | Modeler + machinist prompts extended with parametric + composed CAM skill | `pending` | 16 §3.2, 20 §P2.6 | not in `agents.ts` | planned Phase 2.6 |

## 3. Skills (WP8)

| # | Skill | Status | Spec | Source | Verify |
| - | --- | --- | --- | --- | --- |
| 3.1 | `cad-3d-modeling` | `done` | 16 §4 | `packages/ai/src/skills/index.ts:213` | shipped |
| 3.2 | `cam-operation-workflow` | `done` | 16 §4 | same | shipped |
| 3.3 | `toolpath-verification` | `done` | 16 §4 | same | shipped |
| 3.4 | `cutting-parameters` | `done` | 16 §4 | same | shipped |
| 3.5 | `drilling-and-holes` | `done` | 16 §4 | same | shipped |
| 3.6 | `precision-and-tolerances` | `done` | 16 §4 | same | shipped |
| 3.7 | `machines-and-axes` | `done` | 16 §4 | same | shipped |
| 3.8 | `drawings-and-images` | `done` | 16 §4 | same | shipped |
| 3.9 | `plugin-authoring` | `done` | 16 §4 | same | shipped |
| 3.10 | `stock-and-fixtures` | `done` | 16 §4 | same | shipped |
| 3.11 | `parametric-design` (named dimensions, expressions, when to use `parametric`) | `pending` | 16 §3.5, 20 §P2.1 | not in `CADCAM_SKILLS` | added in spec 22 §2.1 |
| 3.12 | `composed-cam-programs` (sequencing, stock carry-over, multi-setup, lathe + mill, workflow composition) | `pending` | 16 §3.6, 20 §P2.2 | not in `CADCAM_SKILLS` | added in spec 22 §2.2 |
| 3.13 | `version-control-cadcam` (`vcs_status` → `vcs_start_change` → edits → `vcs_commit` → `vcs_open_pull_request`; AI cannot commit on `main`) | `pending` | 17 §1, 20 §P1 | not in `CADCAM_SKILLS` | added in spec 22 §2.3 |
| 3.14 | `workflows-cadcam` (what `uses:` are registered, how to read `${{ steps.X.outputs.Y }}`, how to trigger `pullRequest`/`manual`/`push`) | `pending` | 17 §1.3 | not in `CADCAM_SKILLS` | added in spec 22 §2.4 |
| 3.15 | User-skill API (`GET/PUT/DELETE /api/ai/skills`) + reload | `done` | 16 §4.1 | `packages/ai/src/skills/user.ts` | `user-skills.test.ts` |
| 3.16 | Skill installation writes to `<configDir>/skills/<name>/SKILL.md` | `done` | 16 §4 | `installSkills` in `skills/index.ts` | unit test |

## 4. Built-in tools (WP8)

| # | Tool | Status | Spec | Source | Notes |
| - | --- | --- | --- | --- | --- |
| 4.1 | `cad_describe_drawing` | `done` | 16 §2.3 | `tools/cad_describe_drawing.ts` + `.txt` | |
| 4.2 | `cad_check_design` | `done` | same | same | |
| 4.3 | `cad_add_entities` | `done` | same | `tools/cad_add_entities.ts` + `.txt` | |
| 4.4 | `cad_add_elements` | `done` | same, 16 §3.5 | `tools/cad_add_elements.ts` + `.txt` | 40 elements max per call |
| 4.5 | `cad_import_drawing` | `done` | same | `tools/cad_import_drawing.ts` + `.txt` | DXF/SVG/STEP |
| 4.6 | `cad_modify_entities` | `done` | same | `tools/cad_modify_entities.ts` + `.txt` | |
| 4.7 | `cad_transform_entities` | `done` | same | `tools/cad_transform_entities.ts` + `.txt` | |
| 4.8 | `cad_group_entities` | `done` | same | `tools/cad_group_entities.ts` + `.txt` | |
| 4.9 | `cad_editor` | `done` | same | `tools/cad_editor.ts` + `.txt` | |
| 4.10 | `cad_delete_entities` (`confirm: true`) | `done` | same | `tools/cad_delete_entities.ts` + `.txt` | |
| 4.11 | `cam_describe_machine` | `done` | 16 §2.3 | `tools/cam_describe_machine.ts` + `.txt` | |
| 4.12 | `cam_create_operation` | `done` | same, 16 §3.6 | `tools/cam_create_operation.ts` + `.txt` | all kinds in `core/cam/operations/` |
| 4.13 | `cam_list_operations` | `done` | same | `tools/cam_list_operations.ts` + `.txt` | |
| 4.14 | `cam_update_operation` | `done` | same | `tools/cam_update_operation.ts` + `.txt` | |
| 4.15 | `cam_suggest_parameters` | `done` | same | `tools/cam_suggest_parameters.ts` + `.txt` | |
| 4.16 | `cam_generate_gcode` | `done` | same | `tools/cam_generate_gcode.ts` + `.txt` | |
| 4.17 | `cam_analyze_gcode` | `done` | same | `tools/cam_analyze_gcode.ts` + `.txt` | |
| 4.18 | `cam_verify_toolpath` | `done` | same, 16 §3.6.5 | `tools/cam_verify_toolpath.ts` + `.txt` | |
| 4.19 | `lib_lookup_material` | `done` | 18 | `tools/lib_lookup_material.ts` + `.txt` | |
| 4.20 | `lib_lookup_tool` | `done` | 18 | `tools/lib_lookup_tool.ts` + `.txt` | |
| 4.21 | `memory_remember` | `done` | 16 §3.5.3 | `tools/memory_remember.ts` + `.txt` | |
| 4.22 | `memory_recall` | `done` | same | `tools/memory_recall.ts` + `.txt` | |
| 4.23 | `cad_component_list` | `gap` | 18 §5 | not in `tools/` registry | spec 22 §3.1 |
| 4.24 | `cad_component_save` | `gap` | 18 §5 | not in `tools/` registry | spec 22 §3.1 |
| 4.25 | `cad_component_insert` | `gap` | 18 §5 | not in `tools/` registry | spec 22 §3.1 |
| 4.26 | `cad_component_delete` (`confirm: true`) | `gap` | 18 §5 | not in `tools/` registry | spec 22 §3.1 |
| 4.27 | `lib_upsert_material` | `gap` | 18 §6, 20 §P4.3 | not in `tools/` | spec 22 §3.2 |
| 4.28 | `lib_upsert_tool` | `gap` | same | not in `tools/` | spec 22 §3.2 |
| 4.29 | `lib_upsert_machine_config` | `gap` | same | not in `tools/` | spec 22 §3.2 |
| 4.30 | `lib_set_default` | `gap` | same | not in `tools/` | spec 22 §3.2 |
| 4.31 | `cam_operations_suggest_chain` | `gap` | 16 §3.6.7, 20 §P2.3 | not in `tools/` | spec 22 §3.3 |
| 4.32 | `cam_chain_status` | `gap` | 16 §3.6.5, 20 §P2.4 | not in `tools/` | spec 22 §3.4 |
| 4.33 | `vcs_restore_paths` | `gap` | 17 §1.1, 20 §P1.1 | not in sidecar | spec 22 §4.1 |
| 4.34 | `vcs_restore_paths` allowed on phone for desktop-initiated sessions only | `gap` | 17 §1.7, 20 §P1.4 | not in `COMPANION_ROUTES` | spec 22 §4.2 |

Each `done` tool ships with a `tools/prompts/<id>.txt`. The contract test `tool-prompts.test.ts` asserts: one file per tool; every parameter documented; every operation type decodes; nothing the prompt claims is false. Currently every built-in tool has the `.txt`.

## 5. Background delegation (WP8)

| # | Step | Status | Spec | Source | Verify |
| - | --- | --- | --- | --- | --- |
| 5.1 | `agent_task` tool (delegate to a specialist, foreground or background) | `done` | 16 §6 | `background-tools.ts:30-50` | unit test |
| 5.2 | `agent_tasks` list tool | `done` | same | `background-tools.ts:53-60` | same |
| 5.3 | `agent_task_read` tool | `done` | same | `background-tools.ts:62-68` | same |
| 5.4 | `agent_task_cancel` tool | `done` | same | `background-tools.ts:70-76` | same |
| 5.5 | `agent.task` denied in `cadcam` permission map | `done` | 16 §2.1 | `config.ts:95` | `nikcli-host.test.ts` |

## 6. Sessions (WP8)

| # | Step | Status | Spec | Source | Verify |
| - | --- | --- | --- | --- | --- |
| 6.1 | `hostChatStream` subscribes before prompt + idle grace + retry curve | `done` | 16 §5 | `packages/ai/src/nikcli/chat.ts:247` | unit test |
| 6.2 | `createHostSession` + client↔host session map | `done` | 16 §5 | `service.ts:213-237` | `chat-session.test.ts` |
| 6.3 | `sessionExists` recovery check | `done` | 16 §5 | `chat.ts:113-120` | unit test |
| 6.4 | `continuationFor` (open todos, last tool error, "let me…", `finish: "length"`) | `done` | 16 §5 | `chat.ts:52-66` | unit test |
| 6.5 | Auto-continuation up to 50 nudges, ≤ 2 stalls | `done` | 16 §5 | `chat.ts:68, 384` | unit test |
| 6.6 | `isTransientFailure` + `isInterruption` classification | `done` | 16 §5 | `chat.ts:71-83` | unit test |
| 6.7 | `readHostSessionState` (busy / text / error / tasks) for dropped connections | `done` | 16 §5 | `chat.ts:190-212` | unit test |
| 6.8 | `abortHostSession` and `queueHostMessage` | `done` | 16 §5 | `chat.ts:214-227, 439-445` | unit test |
| 6.9 | 20 conversations × 60 messages conversation panel | `done` | 16 §5 | `apps/desktop/src/state` | UI screenshot |
| 6.10 | `done.recovered: true` UI affordance on dropped stream | `pending` | 20 §P7.4 | not yet | Phase 7.4 |

## 7. Provider + credential model (WP8)

| # | Step | Status | Spec | Source | Verify |
| - | --- | --- | --- | --- | --- |
| 7.1 | 4 base providers (`anthropic`, `openai`, `minimax`, `gateway`) + models.dev through the host | `done` | 16 §7 | `packages/ai/src/nikcli/{config,catalog,models-cache}.ts` | unit + manual |
| 7.2 | `resolveModel({forceGateway})` resolver with configured-vendor preference | `done` | 16 §7 | `packages/ai/src/models.ts` | unit test |
| 7.3 | `AiCredentials` service; `<dataDir>/ai/credentials.json` mode 0600 | `done` | 16 §7 | `packages/ai/src/credentials.ts` | `credential-isolation.test.ts` |
| 7.4 | Push to host via `provider.api.set`; clear copy on shutdown, keep file | `done` | 16 §7 | `service.ts` + shutdown handler | unit test |
| 7.5 | 60s host catalogue cache | `done` | 16 §7 | `service.ts:137-148` | unit test |
| 7.6 | No API keys in logs / errors / serialised state | `done` | 16 §7 | audit logs use redacted bindings | `credential-isolation.test.ts` |
| 7.7 | Gateway routing opt-in / opt-out toggle (`forceGateway`) | `done` | 16 §7 | `models.ts` | unit test |

## 8. Workspace context (WP8)

| # | Step | Status | Spec | Source | Verify |
| - | --- | --- | --- | --- | --- |
| 8.1 | `renderWorkspaceContext(snapshot, budget)` returns sectioned text | `done` | 19 §3 | `workspace-context.ts:51-135` | unit test |
| 8.2 | Renderer budget enforcement; trimmed sections say "N not shown" | `done` | 19 §3 | `workspace-context.ts:106-130` | unit test |
| 8.3 | Defensive `str/num/rec/arr` helpers; no invented fields | `done` | 19 §3 | `workspace-context.ts:15-18` | unit test |
| 8.4 | `renderNotes(memory, maxChars)` newest-first for `memory_recall` | `done` | 19 §10 | `workspace-context.ts:138-149` | unit test |
| 8.5 | `WorkspaceSnapshot` schema written by the desktop editor | `done` | 19 §2 | `apps/desktop/src/shared/state/ai.snapshot.ts` | UI |
| 8.6 | Snapshot augmented with `lastGcodeChangedAt`, `lastVerifiedAt`, `stockBox`, machine limits | `pending` | 20 §P3.1 | not yet | Phase 3.1 |
| 8.7 | Renderer adds "next machining decision" hint per `verification.state` | `pending` | 20 §P3.2 | not yet | Phase 3.2 |
| 8.8 | Renderer includes active toolpath's material/tool/machine summary | `pending` | 20 §P3.3 | not yet | Phase 3.3 |

## 9. VCS core (WP11)

| # | Step | Status | Spec | Source | Verify |
| - | --- | --- | --- | --- | --- |
| 9.1 | Git-compatible loose objects (blob/tree/commit/tag) + SHA-1, oid byte-for-byte with `git` | `done` | 17 §1.2 | `packages/vcs/src/object.ts` | `packages/vcs/test/git.test.ts` |
| 9.2 | `Backend` interface; SQLite-backed `ProjectVcs` | `done` | same | `packages/vcs/src/{store,repository}.ts` | unit test |
| 9.3 | Commit / branch / tag / checkout / restore / fast-forward merge | `done` | same | `repository.ts` | unit test |
| 9.4 | 3-way JSON merge with `mergeJson` | `done` | same | `packages/vcs/src/json.ts` | unit test |
| 9.5 | Entity-level `describeDiff` (property pointer + before/after) | `done` | same | `packages/vcs/src/diff.ts` | unit test |
| 9.6 | Project ⇄ files via `snapshot.ts` (drawings / components / toolpaths / materials / tools / machine-configs / costs / workflows) | `done` | same | `packages/vcs/src/snapshot.ts` | unit test |
| 9.7 | GitHub transport (`push`, `fetchBranch`, `pull`) with fast-forward-only | `done` | same | `packages/vcs/src/{github,transport}.ts` | unit test |
| 9.8 | `PR.remoteNumber` reserved for the GitHub mirror step | `done` | 17 §3 | `packages/vcs/src/repo-extra.ts` | unit test |

## 10. VCS sidecar (WP11)

| # | Step | Status | Spec | Source | Verify |
| - | --- | --- | --- | --- | --- |
| 10.1 | `ProjectVcs` service in the sidecar | `done` | 17 §4 | `apps/sidecar/src/services/project-vcs.ts` | `apps/sidecar/test/project-vcs.test.ts` |
| 10.2 | AI actor cannot commit / restore / merge on `main` | `done` | 17 §3 | same | `apps/sidecar/test/ai-vcs-actor.test.ts` |
| 10.3 | `request-changes` review blocks merge | `done` | same | same | `apps/sidecar/test/project-vcs-review.test.ts` |
| 10.4 | `ActivityLog` rows for AI commits cite the prompt URL-safe ≤ 200 chars | `partial` | 20 §P1.5 | not yet wired | spec 22 §4.3 |
| 10.5 | `vcs_restore_paths` registered on the sidecar | `gap` | 17 §1.1, 20 §P1.1 | not in `ai-vcs-tools.ts` | spec 22 §4.1 |

## 11. Workflows engine (WP12)

| # | Step | Status | Spec | Source | Verify |
| - | --- | --- | --- | --- | --- |
| 11.1 | `Workflow` Schema + `parseWorkflow` + `validateGraph` (cycles, unknown `needs`, duplicate ids) | `done` | 17 §1.3 | `packages/workflow/src/schema.ts` | unit test |
| 11.2 | `jobLevels` (Kahn) for parallel scheduling | `done` | same | same | unit test |
| 11.3 | `runWorkflow` + `interpolate` (`${{ steps.<id>.outputs.<k> }}`) | `done` | same | `packages/workflow/src/run.ts` | unit test |
| 11.4 | `missingSteps(w, registry)` fails the workflow before anything runs | `done` | same | `run.ts:51` | `packages/workflow/test/missing-steps.test.ts` |
| 11.5 | `WorkflowTrigger` for `push` / `pullRequest` / `manual` | `done` | same | `packages/workflow/src/trigger.ts` | unit test |
| 11.6 | `index.ts` re-exports the right surface | `partial` | 22 §5 | `packages/workflow/src/index.ts` exports from `schema/trigger/run`. The LSP error in `apps/sidecar/src/services/workflow-steps.ts` shows `StepContext` is consumed but not exported | spec 22 §5.1 |
| 11.7 | `toText(bytes)` accepts `Uint8Array<ArrayBufferLike>` | `partial` | 22 §5 | LSP warning in `workflow-steps.ts:67` (`bytes: unknown`) | spec 22 §5.2 |

## 12. Workflows sidecar (WP12)

| # | Step | Status | Spec | Source | Verify |
| - | --- | --- | --- | --- | --- |
| 12.1 | `WorkflowRunner` service with id-stamped trigger, persistence, failure isolation | `done` | 17 §1.3 | `apps/sidecar/src/services/workflow-runner.ts` | unit test |
| 12.2 | Trigger failures never fail the user's operation | `done` | 17 §3 | same | unit test |
| 12.3 | Built-in step: `project/validate` | `done` | same | `workflow-steps.ts:62-75` | unit test |
| 12.4 | Built-in step: `project/require-gcode` | `done` | same | `workflow-steps.ts:78-84` | unit test |
| 12.5 | Built-in step: `cam/verify` | `done` | same | `workflow-steps.ts:96-122` | unit test |
| 12.6 | Built-in step: `cam/gcode` | `done` | same | `workflow-steps.ts:132-152` | unit test |
| 12.7 | Step: `cam/sequence` (`restFrom` / `prevTool` chain validation, orphan / cyclic detection) | `gap` | 17 §3, 20 §P1.3 | not registered | spec 22 §4.4 |
| 12.8 | Step: `vcs/commit` (a workflow spawns a sub-commit) | `gap` | 17 §3 | not registered | spec 22 §4.5 |
| 12.9 | Step: `notify/push` (APNs notification to phones paired with the project) | `gap` | 17 §3, 20 §P5.4 | not registered | spec 22 §4.6 |
| 12.10 | Step: `ai/prompt` (a workflow asks the model to summarise a PR / a verification failure) | `gap` | 17 §3 | not registered | spec 22 §4.7 |

## 13. AI ⇄ VCS wiring (WP8 + WP11)

| # | Step | Status | Spec | Source | Verify |
| - | --- | --- | --- | --- | --- |
| 13.1 | `vcs_status` tool | `done` | 16 §2.3, 17 §1.1 | `ai-vcs-tools.ts:46-50` | unit test |
| 13.2 | `vcs_start_change` tool | `done` | same | same | unit test |
| 13.3 | `vcs_commit` tool (refused on `main`) | `done` | same | `ai-vcs-tools.ts:58-59` | unit test |
| 13.4 | `vcs_diff` tool | `done` | same | same | unit test |
| 13.5 | `vcs_open_pull_request` tool + `pullRequest` workflow trigger | `done` | same | same | unit test |
| 13.6 | `vcs_list_pull_requests` tool | `done` | same | same | unit test |
| 13.7 | `vcs_restore_paths` tool | `gap` | 17 §1.1, 20 §P1.1 | not in `ai-vcs-tools.ts` | spec 22 §4.1 |

## 14. AI ⇄ Workflows wiring (WP8 + WP12)

| # | Step | Status | Spec | Source | Verify |
| - | --- | --- | --- | --- | --- |
| 14.1 | `actions_run` tool | `done` | 17 §1.1 | `ai-vcs-tools.ts:74-78` | unit test |
| 14.2 | Single workflow entry: `manual` / `pull-request` / `push` | `partial` | 17 §1.3 | `actions_run` only triggers `manual`; PR/push triggers come from `WorkflowRunner.trigger` | spec 22 §6.1 |
| 14.3 | `${{ steps.<id>.outputs.<k> }}` interpolation between steps | `done` | same | `packages/workflow/src/run.ts:39-48` | unit test |
| 14.4 | `WorkflowRunner` event stream (`RunEvent`) surfaced to the desktop/mobile UI | `done` | 17 §2.5 | `workflow-runner.ts` | unit test |

## 15. Mobile companion gateway (WP13)

| # | Step | Status | Spec | Source | Verify |
| - | --- | --- | --- | --- | --- |
| 15.1 | Per-install self-signed P-256 cert + revocable device tokens | `done` | 17 §1.7, 13 | `apps/sidecar/src/services/companion-gateway.ts` | `companion-gateway.test.ts` |
| 15.2 | Route allow-list (`COMPANION_ROUTES`) | `done` | same | same | same |
| 15.3 | Per-IP rate limit | `done` | same | same | same |
| 15.4 | QR pairing flow | `done` | 13 | `apps/mobile/src/companion/pair.tsx` | manual + screenshot |
| 15.5 | Pinned TLS (`pinnedFetch` on iOS) | `done` | same | `apps/mobile/src/companion/native.ts` | manual |
| 15.6 | Phone streams chat; recovered turn surfaced on reconnect | `done` | 16 §5, 20 §P5.1 | `companion/client.ts` | `companion-chat-e2e.test.ts` |
| 15.7 | Phone shows specialist tool calls as they happen | `partial` | 20 §P5.2 | event transport exists; UI row not yet shipped | Phase 5.2 |
| 15.8 | Phone can request-changes / merge when the workflow is green | `partial` | 20 §P5.3 | endpoint exists; UI not yet shipped | Phase 5.3 |
| 15.9 | Phone gateway refuses credential / plugin / GitHub routes | `done` | 17 §3 | `COMPANION_ROUTES` | `companion-gateway.test.ts` |
| 15.10 | Phone route for `vcs_restore_paths` only on desktop-initiated sessions | `gap` | 20 §P1.4 | not in `COMPANION_ROUTES` | spec 22 §4.2 |
| 15.11 | Push notifications (APNs) for PR + Actions events | `partial` | 20 §P5.4 | service registry exists; APNs token scope pending | Phase 5.4 |
| 15.12 | Streaming assistant panel on iOS | `partial` | 20 §P5.5 | Solid webview in iOS webview wrapper | manual |

## 16. Library / DB (WP0)

| # | Step | Status | Spec | Source | Verify |
| - | --- | --- | --- | --- | --- |
| 16.1 | `Material` table (name, properties, isPublic, owner, organization) | `done` | 18 §2.1 | `packages/db/src/schema.ts:277` | `packages/db/test` |
| 16.2 | `Tool` table (type, Ø, flutes, maxRPM, cuttingLength, shankDiameter, coolant, notes) | `done` | 18 §3.1 | `schema.ts:295` | same |
| 16.3 | `MachineConfig` table (kinematics, post, work offsets, probing) | `done` | 18 §4 | `schema.ts:378` | same |
| 16.4 | `Component` table (saved reusable part) | `done` | 18 §5 | `schema.ts:258` | same |
| 16.5 | `Toolpath` + `ToolpathVersion` + `ToolpathComment` | `done` | 18 §7 | `schema.ts:321, 347, 364` | same |
| 16.6 | `MaterialCost` for cost analysis | `done` | same | `schema.ts:679` | same |
| 16.7 | Library items in the VCS tree under `materials/<id>.json`, `tools/<id>.json`, `machine-configs/<id>.json`, `components/<id>.json` | `done` | 18 §8 | `packages/vcs/snapshot.ts` | unit test |
| 16.8 | `Material` / `Tool` / `MachineConfig` gain `version` + `previousVersionId` + `libraryProjectId` | `pending` | 20 §P4.1 | not yet | Phase 4.1 |
| 16.9 | Library screens in the UI (materials / tools / machines / components) | `pending` | 20 §P4.5 | UI stubs exist; CRUD not yet | Phase 4.5 |

## 17. CAM core (WP2 / WP4)

| # | Step | Status | Spec | Source | Verify |
| - | --- | --- | --- | --- | --- |
| 17.1 | 2.5D mill (`profile`, `pocket`, `drill`, `face`, `engrave`) | `done` | 16 §3.6.1 | `packages/core/src/cam/operations/*.ts` | `bun test packages/core` |
| 17.2 | Mill 3D (`roughing`, `parallel`, `waterline`, `adaptive`, `rest`) | `done` | same | same | same |
| 17.3 | Lathe (`facing`, `turning-OD/ID`, `parting`, `grooving`, `threading-od`) | `done` | same, 14 §5.2 | `packages/core/src/cam/operations/lathe.ts` (per spec 14 v0.1 §5.2) | same |
| 17.4 | Thread (`thread-mill`, `tap`) | `done` | same | `packages/core/src/cam/operations/thread*.ts` | same |
| 17.5 | Probing cycles (`z-surface`, `edge-x/y`, `corner`, `bore`, `boss`, `tool-length`) | `done` | same | `packages/core/src/cam/probing.ts` | same |
| 17.6 | 3D printer | `partial` | same | `packages/core/src/cam/operations/printer.ts` (slicer not built) | unit test |
| 17.7 | Indexing (3+2) `Orient` | `done` | 16 §3.6.9 | `packages/core/src/cam/indexing.ts` | unit test |
| 17.8 | `cam.verify` (`verifyToolpath`, `verifyRequestFor`) | `done` | 16 §3.6.5 | `packages/core/src/cam/verify.ts` | unit test |
| 17.9 | Mesh chamfer / fillet / shell / sweep / loft | `done` | 16 §3.5.4 | `packages/core/src/cad/surface.ts` (per spec 14 v0.1 §5.1) | same |
| 17.10 | Pencil / scallop / flowline finishing | `pending` | 20 §P6.3 | not yet | Phase 6.3 |
| 17.11 | Swept-cutter collision against the target | `pending` | 20 §P6.4 | not yet | Phase 6.4 |
| 17.12 | Parametric features (`fillet { edgeSelector, radius }`, `shell`, `pattern-along-path`) | `pending` | 20 §P6.6 | not yet | Phase 6.6 |

## 18. Observability + cost (WP8 + WP10)

| # | Step | Status | Spec | Source | Verify |
| - | --- | --- | --- | --- | --- |
| 18.1 | Per-call `done.usage { inputTokens, outputTokens }` | `done` | 16 §5, 20 §P7.1 | `chat.ts:405-409` + `service.ts` | unit test |
| 18.2 | Settings screen for cost summary | `partial` | 20 §P7.1 | UI stub exists; per-turn aggregation not wired | Phase 7.1 |
| 18.3 | Manual `ai/compact` action; readback of `effective policy` | `pending` | 20 §P7.2 | compact itself host-native | Phase 7.2 |
| 18.4 | "Compact now" survives denial (UI honesty) | `pending` | 20 §P7.3 | depends on 18.3 | Phase 7.3 |
| 18.5 | Streaming recovery on dropped stream (`done.recovered: true`) | `pending` | 20 §P7.4 | depends on 6.10 | Phase 7.4 |

## 19. Definition of done (per category)

A step is `done` when:

1. The source file exists in the repo and is committed.
2. A test exercises it (or the source documents that manual verification is the gate, e.g. iOS simulator screenshot).
3. The owning spec (`15–22`) records it in its "Change log".
4. The cross-WP invariants in spec 20 §9 still pass.

A step is `partial` when the surface exists but at least one of:

- The contract is incomplete (`StepContext` re-export, `bytes: unknown` widening).
- The test gate is not yet added.
- The UI surface is stubbed.

A step is `pending` when it is described in `15–20` but no source is in the repo.

A step is `gap` when it is not in `15–20` at all and is therefore listed in `specs/22-gaps-and-fixes.md` for assignment.

## 20. Reading order

- `15-ai-agent-analysis.md` — analysis
- `16-cadcam-agent-blueprint.md` — agent design + parametric + composed CAM
- `17-integration-vcs-workflows.md` — integration contract
- `18-library-and-knowledge.md` — library design
- `19-context-awareness.md` — context contract
- `20-integral-roadmap.md` — phases
- `22-gaps-and-fixes.md` — the gaps from this plan that need filling

This spec is the checklist. Spec 22 is the fix-it-queue.

## Change log

- v1: master checklist with every step flagged, source cited, spec owner cited, verify gate named. 154 rows.
