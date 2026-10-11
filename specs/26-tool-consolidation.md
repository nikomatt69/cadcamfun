# 26 — Tool consolidation: fewer tools, more actions

Status: specified, then implemented across WP8 (`packages/ai`), WP4 (`apps/sidecar`), WP6 (`apps/desktop`). Extends `08-ai.md` §3, `16-cadcam-agent-blueprint.md`, `22-gaps-and-fixes.md` §3. No database migration, no new dependency, no change to the host isolation contract.

## 1. Why

The `cadcam` agent advertised **63 tools** on every turn: 31 built-in package tools (`packages/ai/src/tools/`), 15 sidecar library and chain specs, 8 version-control specs, 4 delegation specs, and 10 of nikcli's own native capabilities. Each carries a `.txt` prompt that the host serialises into the model's tool catalogue, so the catalogue alone cost **56 064 characters** (~14 000 tokens) before the conversation started.

Three consequences, all observed in the product:

- **Choice paralysis.** `cad_add_elements`, `cad_add_entities`, `cad_modify_entities`, `cad_transform_entities`, `cad_group_entities`, `cad_delete_entities`, `cad_editor` and `cad_import_drawing` are eight separate entries that differ only in verb. The model must scan eight near-identical descriptions to find the one that matches "move the bracket 20 mm up".
- **Context tax on every turn.** The catalogue is rebuilt and re-sent with each request. A user who asks "what is in this drawing?" pays for `cam_analyze_gcode`, `vcs_open_pull_request` and `lib_upsert_machine_config` descriptions that cannot apply.
- **A prompt budget spent on duplication.** Every tool prompt restates the same conventions — millimetres and radians, ids are read never invented, `ok:false` is a result not a crash, verify before claiming done — eight times over.

nikcli has the same pressure and solves it the same way: its own surface is `task`, `read`, `edit`, `bash`, `grep`, `glob` — a handful of verbs, each taking an action. `cad_editor` in this codebase already works that way (`actions: [...]` with a validated action list) and is the most-used editing tool precisely because one call can rename a layer, isolate an id and undo.

## 2. What is added

### 2.1 One tool per capability boundary, not per verb

Tool ids collapse from 63 to **22**: 12 application tools plus nikcli's 10 native capabilities. Verbs become `action` values on a discriminated union, so a single call can carry the work the model used to spread over several calls.

| Tool | Actions | Replaces |
| --- | --- | --- |
| `cad` | `describe`, `inspect`, `check`, `relations`, `vision`, `parametric` | `cad_describe_drawing`, `cad_inspect`, `cad_check_design`, `cad_component_relations`, `cad_vision`, `cad_parametric` |
| `cad_edit` | `add`, `modify`, `transform`, `group`, `delete`, `editor`, `import`, `parametric_create`, `parametric_update` | `cad_add_elements`, `cad_add_entities`, `cad_modify_entities`, `cad_transform_entities`, `cad_group_entities`, `cad_delete_entities`, `cad_editor`, `cad_import_drawing`, `cad_parametric` (write actions) |
| `cam` | `machine`, `operations`, `suggest`, `analyze`, `verify`, `stock` | `cam_describe_machine`, `cam_list_operations`, `cam_suggest_parameters`, `cam_analyze_gcode`, `cam_verify_toolpath`, `cam_vision`, `cam_stock` (`inspect`), `cam_operations_suggest_chain`, `cam_chain_status` |
| `cam_edit` | `create`, `update`, `generate`, `stock_set` | `cam_create_operation`, `cam_update_operation`, `cam_generate_gcode`, `cam_stock` (`set`) |
| `library` | `component_list`, `lookup_component`, `lookup_material`, `lookup_tool`, `lookup_machine_config` | `cad_component_list`, `lib_lookup_component`, `lib_lookup_material`, `lib_lookup_tool`, `lib_lookup_machine_config` |
| `parts` | `save`, `insert`, `delete` | `cad_component_save`, `cad_component_insert`, `cad_component_delete` |
| `library_edit` | `upsert_material`, `upsert_tool`, `upsert_machine_config`, `set_default`, `delete` | `lib_upsert_material`, `lib_upsert_tool`, `lib_upsert_machine_config`, `lib_set_default`, `lib_delete` |
| `vcs` | `status`, `diff`, `list_pull_requests`, `run_workflows` | `vcs_status`, `vcs_diff`, `vcs_list_pull_requests`, `actions_run` |
| `vcs_edit` | `start_change`, `commit`, `restore`, `open_pull_request` | `vcs_start_change`, `vcs_commit`, `vcs_restore_paths`, `vcs_open_pull_request` |
| `memory` | `remember`, `recall`, `context_read`, `context_update` | `memory_remember`, `memory_recall`, `project_context` |
| `agent` | `start`, `list`, `read`, `cancel` | `agent_task`, `agent_tasks`, `agent_task_read`, `agent_task_cancel` |
| `research` | `search`, `read_attachment` | `web_search`, `attachment_read` |

Nothing is lost: every verb above is still reachable, with the same handler and the same schema, and the same result shape. `cam_verify_toolpath`'s finding codes, `cad_add_elements`'s element catalogue, `cad_editor`'s action validation and `vcs`'s actor attribution are carried over verbatim.

### 2.2 Why the split is read/write and not just "per domain"

A single `cad` tool with every verb would hand the read-only `researcher` the ability to delete entities: the host's permission map is keyed by **tool id**, and a specialist's `subagentPermission` is `deny **` plus an allow-list of ids. Merging read and write into one id would silently widen every specialist's power.

So each domain is cut on the boundary the existing safety tests already police (`packages/ai/test/agents.test.ts`: *"only the editors can change the document"*, `MUTATING = /^(cad_(add|modify|…)|cam_(create|…))`):

- `cad` and `cam` are **read-only** and are given to every specialist.
- `cad_edit`, `cam_edit`, `parts`, `library_edit` and `vcs_edit` are **writes** and are given only to the roles that already had them.
- `library`, `vcs` and `memory` are reads plus, where the role already had them, non-destructive side effects.

The read/write cut also survives the permission *modes*: `permissionAgents` copies a tool's `"allow"` into `"ask"` for the `-ask` variants, so a merged write tool is one ask, not five.

### 2.3 `defineActionTool`

`packages/ai/src/tools/action.ts` builds a tool from a record of actions, exactly the way `defineTool` builds one from a schema:

```ts
defineActionTool("cad_edit", {
  add:        { parameters: addSchema,        execute: add },
  transform:  { parameters: transformSchema,  execute: transform },
  …
})
```

It produces a `z.discriminatedUnion("action", …)` validated through the same `sanitizeArguments`/`lenient` path as before, so XML-shaped arguments (`{item: …}`, `$text`) still parse. An unknown action is refused with the list of the actions the tool does have, which is the same contract `cam_stock`'s `inspect | set` already had.

Each tool keeps one `tools/<id>.ts` and one `tools/prompts/<id>.txt`; the prompt documents every action and every parameter of every action, and a test asserts that **every action name appears in its prompt** and that **every parameter of every action is documented** — the same guarantee the per-tool prompts gave, now enforced per action.

### 2.4 What the catalogue costs now

| | before | after |
| --- | --- | --- |
| Tool ids the model sees | 63 | 22 |
| Tool prompt characters | 56 064 | 20 412 |
| Prompts with a "Do not use it" section | 10 | every tool |

The saving comes from stating the shared conventions once per tool instead of once per verb, and from deleting the eight prompts that only re-described their neighbours.

## 3. Renames the UI depends on

`apps/desktop` keys several behaviours on tool ids, and all of them are updated:

| Behaviour | Before | After |
| --- | --- | --- |
| Reconcile the editor after a CAD call (`store.ts`) | `event.tool.includes("cad_")` | `tool === "cad_edit" \|\| tool === "parts"` |
| Sync the CAM panel (`cam-sync.ts`) | `CAM_TOOLS` list + `tool.endsWith("cam_stock")` | `tool === "cam_edit"` and the action |
| Apply editor actions (`editor-sync.ts`) | one branch per `cad_*` id | one branch on `cad_edit`, keyed by action |
| Facts on a transcript row (`tool-facts.ts`) | `isVcsTool` over 8 ids | `vcs` / `vcs_edit` plus the action |
| Read-only tools in the timeline (`timeline.ts`) | 16 ids | the read tools `cad`, `cam`, `library`, `vcs`, `memory`, `research` |
| Prompt guidance (`system.ts`, `modes/*.txt`, `skills/index.ts`) | 60+ id references | the 12 new ids |

`tool-schemas.ts` on the desktop mirrors the parameter shapes at the SSE boundary; it now mirrors one discriminated union per merged tool, so a malformed `tool_call` still becomes a typed `tool_result { ok: false }` instead of a crash.

## 4. Ownership

| Surface | Owner |
| --- | --- |
| `packages/ai/src/tools/action.ts`, the 12 consolidated tools and prompts, `registry.ts`, `project-tools.ts`, `nikcli/agents.ts`, `nikcli/background-tools.ts`, `prompts/system.ts`, `prompts/modes/*`, `skills/index.ts` | WP8 |
| `apps/sidecar/src/services/ai.ts` (`libraryToolSpecs`, `partsToolSpecs`, `libraryWriteToolSpecs`), `ai-vcs-tools.ts` (`vcsToolSpecs` → `vcs`, `vcs_edit`) | WP4 |
| `apps/desktop/src/ai/{tools,tool-schemas,tool-facts,cam-sync,editor-sync,store,timeline,ask}.ts` and the chat transcript rows | WP6 |

## 5. Non-goals

- No change to what a tool *does*: handlers, Effect validation, the drift guards and the result shapes are untouched.
- No new tool. The catalogue shrinks; it does not grow.
- No change to nikcli's native capabilities (`todowrite`, `skill`, `code_mode`, `question`, `invalid`, `search_tools`, and the three goal tools). They are the host's, not ours.
- No change to the specialists' *prompts* beyond the tool ids they name: a specialist's job is unchanged.
- No action-level permissions inside a tool. The host has none, and inventing one in application code would be a second, weaker permission system beside the real one.

## 6. Acceptance criteria

1. `TOOL_IDS` (the application tools) has 12 entries; `TOOL_IDS ∪ SIDECAR_TOOL_IDS ∪ NATIVE_TOOLS` has 22.
2. Every verb of the previous catalogue is reachable: a test maps each retired id to the tool and action that replaced it, and asserts the union covers the old set with no gaps.
3. Every tool has exactly one `tools/<id>.ts` and one `tools/prompts/<id>.txt`; every action name and every parameter of every action is documented in its prompt; every prompt still carries "Do not use it" where a neighbouring action could be confused with it.
4. `cad`, `cam`, `library`, `vcs`, `memory` and `research` contain **no action that mutates the document, the operations or the libraries**; `cad_edit`, `cam_edit`, `parts`, `library_edit` and `vcs_edit` contain **no read that a specialist already had read-only**. A test derives both halves from the tool definitions, not from a hand-written list.
5. The researcher still cannot change anything, the editor still cannot run CAM, the machinist still cannot edit geometry, and no specialist can commit or open a pull request (`agents.test.ts`, restated against the merged ids).
6. The tool prompt catalogue is under 24 000 characters.
7. `bunx tsgo -p packages/{ai,api}/tsconfig.json --noEmit`, the sidecar and desktop typechecks and `bun test packages apps` are clean; the contract snapshot in `packages/api` is regenerated where tool ids appear.

## 7. Change log

- v1 (2026-10-11): contract for the 12-tool catalogue, the read/write capability boundary it is cut on, and `defineActionTool`. Verb parity with the 63-tool catalogue is an acceptance criterion, not an aspiration.
