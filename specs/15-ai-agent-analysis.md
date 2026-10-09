# 15 — AI Agent Architecture Analysis: nikcli vs cadcamfun

Status: v1 — analytical, source-grounded. Source files referenced are part of the v6 build (`specs/00-overview.md`), not a new design proposal.

This spec answers the question "what does nikcli do for coding/terminal, and what should cadcamfun do for CAD/CAM?" by reading nikcli's actual implementation (`/Volumes/SSD/Development/nikcli-main`), reading every module the existing cadcamfun AI layer already builds on (`packages/ai`, `apps/sidecar/src/services/{ai*,project-vcs,workflow-*}.ts`), and producing the explicit mapping between them.

The conclusion is that cadcamfun is **already** an nikcli-style coding/terminal agent that has been retargeted to CAD/CAM. The rest of the spec set (16 through 20) records the resulting design as a single, integrated system: AI + VCS + Workflows + Libraries + Context, on top of nikcli's host architecture, with a roadmap that closes the remaining gaps.

## 1. Why this analysis exists

The nikcli repository (`/Volumes/SSD/Development/nikcli-main`, `CLAUDE.md` "Architecture overview") is the source of an autonomous agent whose mission is software development. nikcli's mission is generic: "transforms the development workflow with intelligent AI agents that understand your code, execute commands, and build applications autonomously." cadcamfun's agent is the same shape of system retargeted at building CAD geometry and CAM toolpaths from a project the user is editing on screen. The two share an architecture because they share an organizing principle: a stateful model loop, an in-process tool registry, an editable workspace the agent can both read and write, and a documented discipline about what the model is allowed to see and to do.

This spec establishes, with source citations, that the two architectures are aligned by design, and that the existing cadcamfun AI layer already implements the alignment. Subsequent specs (16-20) describe the resulting bespoke CAD/CAM agent: how it is shaped, what it knows, what it can do, how it is integrated with VCS and Workflows, and what remains to build.

## 2. The two architectures side by side

### 2.1 nikcli (coding/terminal agent)

| Concern | nikcli implementation | Source |
| --- | --- | --- |
| Runtime | Bun-process `src/cli/index.ts` orchestrates startup, requirements, service initialization | `nikcli-main/src/cli/index.ts` |
| Agent base | `BaseAgent` abstract class: lifecycle, task history, metrics, tool registry, event bus, status | `nikcli-main/src/cli/automation/agents/base-agent.ts` |
| Universal agent | `UniversalAgent` extends `EventEmitter`: cognitive parsing (intent, entities, dependencies, complexity), orchestration plan (sequential/parallel/hybrid/adaptive), execution phases, learning database, dispatch by category (code-analysis, code-generation, review, optimization, react, backend, devops, file-ops, autonomous) | `nikcli-main/src/cli/automation/agents/universal-agent.ts` |
| Coding agent | `CodingAgent extends BaseAgent`: analyze / generate / optimize / explain / debug / test, all with zod schemas and the shared `modelProvider` | `nikcli-main/src/cli/automation/agents/coding-agent.ts` |
| Tool system | `ToolRegistry` (`src/cli/tools/tool-registry.ts`); each tool inherits `BaseTool`; secure wrappers for bash/file (`secure-tools-registry.ts`, `secure-file-tools.ts`, `secure-command-tool.ts`); explicit permission system in `src/cli/policies/` | `nikcli-main/src/cli/tools/` |
| Context | `ContextAwareRAGSystem` (`src/cli/context/context-aware-rag.ts`), `WorkspaceContext` (`src/cli/context/workspace-context.ts`), `RAGSystem` and `WorkspaceRAG` for memory | `nikcli-main/src/cli/context/` |
| Memory | Persisted across sessions; cognitive memory array of last 100 cognitions; learning database; orchestration history of last 50 runs | `universal-agent.ts` lines 1482-1493, 1565-1620 |
| Models | Anthropic (primary), OpenAI, Google, Ollama (local); unified AI SDK abstraction (`ai`/`@ai-sdk/*`) | `CLAUDE.md` §"AI Model Support" |
| Sessions / CLI | Interactive chat with readline, command completion, history; `/new`, `/sessions`, `/model`, `/agents`, `/goal`, `/compact` | `nikcli-main/src/cli/nik-cli.ts` |
| MCP | Model Context Protocol server registry and dynamic method calls | `nikcli-main/src/cli/mcp/` |
| Planning | `parseTaskWithCognition` → `createOrchestrationPlan` → `executeWithAdaptiveSupervision` → `recordOrchestrationOutcome`; phases are sequential/parallel, with fallback strategies and monitoring points | `universal-agent.ts` lines 279-440 |
| Safety | Allowlist/blocklist for commands, paths and domains; tool-level permissions; sandbox mode `'workspace-only'` | `universal-agent.ts` lines 221-237 |
| Permissions | Default-deny: `canReadFiles`, `canWriteFiles`, `allowedPaths`, `forbiddenPaths`, `allowedCommands`, `forbiddenCommands`, `canAccessNetwork`, `allowedDomains`, `canInstallPackages`, `canModifyConfig`, `canAccessSecrets` (`false` by default) | same |

### 2.2 cadcamfun — current AI implementation

| Concern | cadcamfun implementation | Source |
| --- | --- | --- |
| Runtime | Bun-compiled `apps/sidecar`, an Effect v4 process; the AI subsystem is an in-process host started from `makeNikCliRuntime` | `packages/ai/src/nikcli/runtime.ts`, `08-ai.md` §1 |
| Agent base | nikcli's `@nikcli-ai/sdk-next` (pinned `1.428.0`); Effect services wrap the host; `cadcam` is the *only* host agent | `packages/ai/src/nikcli/config.ts` (`CADCAM_AGENT`), `packages/ai/src/service.ts` |
| Main agent | Single host agent with `permission = { "*": "deny", ...allowedToolIds: "allow" }`; no built-in shell/file tools; reads its own skills instead | `packages/ai/src/nikcli/config.ts:79-146` |
| Specialists | Four host sub-agents (`researcher`, `editor`, `modeler`, `machinist`) defined as nikcli `Agent` records; each is deny-by-default and allowed only its own curated tool set | `packages/ai/src/nikcli/agents.ts:11-168` |
| Tool system | One `tools/<id>.ts` per tool (`defineTool`, zod schema, execute that calls `ToolHandlers`); one `.txt` prompt per tool (loaded as text); `BUILT_IN_TOOLS` and `TOOL_IDS` in a single registry; extensions register beside them via `buildTools(handlers, projectId, extensions)` | `packages/ai/src/tools/{define.ts,registry.ts,handlers.ts}`, `packages/ai/src/index.ts:16` |
| Context | A snapshot rendered as sectioned text inside a default 6,000-character budget; selection, layer, stock, machine/controller/post/material/operation/tool/offset, toolpaths, verification state with first findings, G-code size, attached files, element list, G-code preview | `packages/ai/src/workspace-context.ts` |
| Memory | `KvStore`-backed `ai.memory.*` keys (`remember`/`recall`); 20 conversations × 60 messages on the client; conversation text stays on the device, host session id is the durable handle | `packages/ai/src/tools/{memory_recall,memory_remember}.ts`, `08-ai.md` §"Workspace integration" |
| Models | Pinned 4 base providers (anthropic, openai, minimax, gateway) + every models.dev provider through the host; provider browser in settings with search; AI SDK v7 for one-shot calls | `packages/ai/src/nikcli/{config.ts,catalog.ts,models-cache.ts}`, `packages/ai/src/direct-model.ts` |
| Sessions | `hostChatStream`, `createHostSession`, `readHostSessionState`, `sessionExists`, `abortHostSession`, `queueHostMessage`, `replyHostPermission`, with strict auto-continuation (up to 50), retry-once (up to 5), heartbeat every 5 s; client session id ≠ host session id, mapped via `sessionMap` | `packages/ai/src/nikcli/chat.ts`, `packages/ai/src/service.ts:213-237` |
| MCP | A confined program runner that uses `code_mode` permission with no imports/network/files; advanced uses deferred to a dedicated WP not in v6.0 scope | `packages/ai/src/nikcli/config.ts:99` |
| Planning | nikcli's `goal` loop on the host: the model calls `create_goal`, the host keeps prompting until `update_goal complete\|blocked`; agent's plan is exposed via `todowrite`/`todoread`; goal/plan/step are streamed as events (`AgentActivity`) | `08-ai.md` §"The agent loop is the host's" |
| Safety | Hard isolation: `XDG_*_HOME` and `NIKCLI_TEST_HOME` redirected to the app data dir; `NIKCLI_DISABLE_PROJECT_CONFIG=1`; lock downed `cadcam` agent (deny-by-default); permissions `default` (no auto-approve); redacted credentials in memory only; `directory` is a fixed per-project scratch folder | `08-ai.md` §"Hard safety requirements", `packages/ai/src/nikcli/{config.ts,isolation.ts}` |
| Permissions | One agent permission object computed in `buildHostConfig`: `"*": "deny"`, every registered tool id `"allow"`, `skill` and `code_mode` and the goal/todo/plan tools `"allow"`, the unrestricted `task` tool `"deny"` | `packages/ai/src/nikcli/config.ts:79-100` |

### 2.3 Mapping table — nikcli concept → cadcamfun equivalent

| nikcli concept | cadcamfun equivalent | What changes |
| --- | --- | --- |
| `BaseAgent` (universal lifecycle) | `AiService` Context.Service over the embedded host | cadcamfun does not own its own loop; the host does. Effect layer composes credentials, providers, cache, host, background scheduler into a service |
| `UniversalAgent` (cognitive dispatch by category) | `cadcam` host agent with curated tools and a deny-by-default permission set | No category dispatch needed: the model picks the right tool from the catalogue of cad/cam/library/verify/memory/vcs/workflow tools; sub-agents split when the job warrants |
| `CodingAgent` (analyze/generate/optimize/explain/debug/test) | `editor` + `modeler` specialist agents, plus the modeler's `cad-3d-modeling` skill | coding-style subroutines are replaced by CAD subroutines: model → edit → check → verify |
| Tool registry (`ToolRegistry`) with file/bash/etc. | `tools/registry.ts` with `cad_add_elements`, `cad_modify_entities`, `cam_create_operation`, `cam_verify_toolpath`, `lib_lookup_material`, `vcs_commit`, etc. | The toolbox is replaced. Permissions and `secure-*` wrappers are replaced by nikcli's permission map |
| `ContextAwareRAGSystem` + `WorkspaceContext` | `renderWorkspaceContext(snapshot, budget)` + the desktop's `ai.context.<projectId>` JSON | Single renderer; sectioned text, character budget; the live editor is the source of truth |
| Cognitive memory (in-process) | `memory_remember` / `memory_recall` over the `KvStore`-backed `ai.memory.*` keys | Cross-session, cross-project notes; user-visible in settings |
| Universal session list (`/sessions`, `/compact`) | Conversation panel with persistent local text (20 convos × 60 messages), host session id behind it | Same UX (list, reopen, rename, delete); the host owns the durable state |
| `/plan`, `/auto` mode | `agent_task { agent, background }` for delegation; `create_goal` for self-direction | Same orchestration shape: explicit |
| `parseTaskWithCognition` (intent + complexity + risk) | The `prompts/system.ts` system prompt (units, tool-call hygiene, modelling, machining, workflow, delegation briefs, version control, files, asking, style) | Model does its own dispatch, grounded by a single system prompt + per-specialist prompt |
| `secure-command-tool.ts`, `bash` | Forbidden by the host (no `bash` in the `cadcam` agent's allow-list) | The CAD/CAM agent must never run shell commands. Equivalent functionality runs as workflow steps |
| `mcp servers` registry | Deferred; plugin SDK (WP9) takes its place for extensions | Plugins are installed by a person and registered with the host via `buildTools({extensions})` (`tools/registry.ts:42-53`) |
| LSP diagnostics (`lspManager.getWorkspaceInsights`) | `cad_check_design` (model) + `cam_verify_toolpath` (toolpath) | The CAD/CAM equivalents of "lint the code" |
| `/tokens`, `/compact` | Host-native compaction (`compaction.auto/prune/reserved`); readback via `readHostContextPolicy`; busy/event stream | Same semantics, pinned to the exact host behaviour |

### 2.4 What nikcli does that cadcamfun deliberately drops

The following nikcli behaviours are **out of scope** for the `cadcam` agent (the parent agent), and they belong to a specialist if anywhere:

- **Arbitrary file system access.** nikcli's bash/edit/write/web/etc. are placeholders for a coding computer use. The `cadcam` agent edits *the project*, not files. `tools/catalogue.ts` lists only project-scoped tools, nikcli's built-in shell/file tools are not registered (`08-ai.md` §1.2 asserts `experimental.toolIDs()` for the agent contains none of them).
- **Code generation, refactoring, tests.** These are a coding agent; CAD/CAM equivalents live in `tools/cad_*`, `tools/cam_*`, and `packages/core/src/cad/` + `packages/core/src/cam/`.
- **Self-approval.** The host has `permission_mode: "default"`; every tool call passes through the host's permission gate. Destructive operations (`cad_delete_entities`, future `cad_component_delete`) carry `confirm: true` to make approval an explicit user action (`08-ai.md` §1.3).

### 2.5 What the cadcam agent already has that nikcli's coding agent does not

The cadcamfun agent inherits nikcli's host but adds three things nikcli does not own:

1. **A project-shaped workspace.** The editor's `ai.context.<projectId>` snapshot is the only context the model sees. It is rendered as sectioned text inside a 6,000-char budget (`packages/ai/src/workspace-context.ts`). The long, low-value parts (element list, G-code preview) shrink first and say "N not shown — call `cad_describe_drawing`", so the model never invents an entity id.

2. **Specialist agents scoped by edits.** Each specialist in `agents.ts` declares `edits: boolean` and `background: boolean`. Editing specialists run one at a time per project and synchronously; read-only researchers run in the background and wake the parent with their report. This is an effect-by-effect port of nikcli's `task` tool with a tighter concurrency rule (4 active / 16 queued, scoped to `(projectId, parentSessionId)`, exclusive editing lock, edits = 1).

3. **VCS + Workflows as tools the agent calls.** `apps/sidecar/src/services/ai-vcs-tools.ts` exposes `vcs_status`, `vcs_start_change`, `vcs_commit`, `vcs_diff`, `vcs_open_pull_request`, `vcs_list_pull_requests`, `actions_run`. A CAD change is never lost: every edit lands on a reviewable `ai/*` branch and the user (or a teammate) reviews the PR. Workflows (`cam/verify`, `cam/gcode`, `project/validate`, `project/require-gcode`, plus planned `vcs/commit`, `notify/push`, `ai/prompt`) run as part of the VCS pipeline.

## 3. The contract already in place

Every contract on which the integrated spec set (16-20) rests is already implemented and cited above; this section lists the pivot points a future change should not break.

| Pivot | File | Why it matters |
| --- | --- | --- |
| `AiService` public surface | `packages/ai/src/service.ts:87-109` | `chat`, `analyzeGcode`, `analyzeDesign`, `recommendMachiningParameters`, `optimizeGcode`, `summarizeDesignSuggestions`, `suggestTitle`, `providers`, `models`, `abort`, `sessionState`, `queue` |
| Tool handler shape | `packages/ai/src/tools/handlers.ts:19-45` | What the sidecar must provide to the host; new tools register here |
| Built-in tool ids | `packages/ai/src/tools/registry.ts:32-39` | `cad_add_entities`, `cad_add_elements`, `cad_import_drawing`, `cad_modify_entities`, `cad_transform_entities`, `cad_group_entities`, `cad_editor`, `cad_delete_entities`, `cad_describe_drawing`, `cad_check_design`, `cam_describe_machine`, `cam_create_operation`, `cam_list_operations`, `cam_update_operation`, `cam_suggest_parameters`, `cam_generate_gcode`, `cam_analyze_gcode`, `cam_verify_toolpath`, `lib_lookup_material`, `lib_lookup_tool`, `memory_remember`, `memory_recall` |
| Skills | `packages/ai/src/skills/index.ts:213-224` | `cad-3d-modeling`, `cam-operation-workflow`, `toolpath-verification`, `cutting-parameters`, `drilling-and-holes`, `precision-and-tolerances`, `machines-and-axes`, `drawings-and-images`, `plugin-authoring`, `stock-and-fixtures` |
| Specialist roster | `packages/ai/src/nikcli/agents.ts:11-168` | 4 specialists with explicit prompts and tool lists |
| Workspace context renderer | `packages/ai/src/workspace-context.ts:51-135` | The model sees only this text |
| Host config | `packages/ai/src/nikcli/config.ts:79-146` | deny-by-default permission, skills, specialists, compaction settings |
| VCS backend | `packages/vcs/src/{object,store,repository,json,diff,snapshot,github,transport}.ts` | Git-compatible objects, refs, merge, 3-way JSON, CAD-aware diff, GitHub transport |
| Workflow engine | `packages/workflow/src/{schema,trigger,run,index}.ts` | YAML, triggers, DAG, `${{ }}` interpolation, event stream |
| VCS ⇄ AI tools | `apps/sidecar/src/services/ai-vcs-tools.ts:23-79` | The 7 tools that wire the agent to the history |
| Workflow steps | `apps/sidecar/src/services/workflow-steps.ts:158-163` | `project/validate`, `project/require-gcode`, `cam/verify`, `cam/gcode` |
| Element catalogue | `packages/ai/src/element-catalog.ts` | Single source of truth for what `cad_add_elements` accepts |

## 4. Scope and phasing implied by the analysis

1. **Wave 0 (already done).** Host in-process, safety isolation, the 22 built-in tools, 10 skills, 4 specialists, VCS tools, workflow steps, mobile companion gateway. Source code cited throughout §2.2 and §3.
2. **Wave 1 — close the integration gaps (specs 16–19).** The bespoke-cadcam agent needs the parts that nikcli's coding agent has but cadcamfun does not yet, in cadcamfun's terms: library-first knowledge (spec 18), full context awareness (spec 19), a single tool surface the agent and the user agree on (spec 16), the VCS+Workflows integration pattern reusable in every tool (spec 17). The roadmap (spec 20) lays these against the existing WP13 (mobile) and WP11/WP12 (VCS/Actions) work.
3. **Wave 2 — parity.** `specs/14-cad-cam-parity-roadmap.md` lists the 4-axis and 5-axis work that lands when the agent has the solid surfacing (mesh chamfer/fillet/shell/sweep/loft) and the lathe operations already shipped.

## 5. Change log

- v1: analytical only; cites files; establishes that the cadcamfun agent is already an nikcli-style agent retargeted at CAD/CAM.
