# 25 — Project AI context, memory rendering and session lifecycle

Status: specified; §2.1–§2.2 implemented across WP8 (`packages/ai`), WP3 (`packages/api`), WP4 (`apps/sidecar`) and WP6 (`apps/desktop`). **§2.3 (`start_session` / `settle_session`) is not implemented**: the `POST /api/ai/sessions/control` contract (`packages/api/src/groups/ai.ts`, `action` literals `status`, `compact`, `cancel_task`, `answer_question`, `reject_question`, `reply_permission`, `consolidate_memory`, `context`) has neither action, and no sidecar handler, desktop caller or test exists; only `PROJECT_NOTE_TTL_DAYS` (`packages/ai/src/project-context.ts`) was added. §2.3 and acceptance criteria 5–7 stay pending and are owned by [AI-11 Step 9](ai/11-enterprise-harness-execution.md) under [RM-07](roadmap/07-ai-lifecycle.md). Extends `08-ai.md` §"Workspace integration", `19-context-awareness.md` and `completed/24-assistant-control-flow.md`; no database migration, no new dependency, no change to the host isolation contract.

## 1. Why

nikcli gives every project a durable context and every session a lifecycle. Read from the pinned bundle (`@nikcli-ai/sdk-next@1.428.0`, `node_modules/.bun/.../index.js`):

| nikcli | Source in the bundle |
| --- | --- |
| Per-project rule files `AGENTS.md` / `CLAUDE.md` / `CONTEXT.md` / `.github/instructions/memory.instruction.md`, first `findUp` match wins | `index.js:35990` `LOCAL_RULE_FILES`, `:35919` `collectSystemPaths` |
| Global rule files `<config>/AGENTS.md`, `~/.claude/CLAUDE.md`, `$NIKCLI_CONFIG_DIR/AGENTS.md` | `:35878` `globalRuleFiles` |
| `<env>` block (directory, root, vcs, platform, package manager, date, locale) | `:36173` `environmentImpl` |
| `<user_profile>` + `<user_habits>` from `<projectRoot>/.nikcli/habits.md`, capped, framed as "a good prior, never a rule" | `:35333` `Profile.habitsFile`, `:35362` `Profile.renderHabits`, `:36301`/`:42024` `Profile.reminder` |
| Brain: reviews recent sessions, runs a **deny-all but file tools** session (`todowrite`/`task` denied), 4 phases — Orient, Gather, Consolidate, Prune — over two strictly separate files | `:273658-274212`, `:273940` `Brain.SESSION_PERMISSION` |
| `todowrite`/`todoread` per session, "use VERY frequently, mark complete immediately" | `:73351` `todowrite.txt`, `:73365` `todo_info`, `:34525` |
| Instruction epochs: the system prefix is frozen per session, later file changes arrive as `role:"user"` deltas | `:41909` `InstructionSync.render` |
| Overflow cleanup: `usable = context - maxOutput - 20000`, automatic compaction and tool-output pruning | `:47243` `session/overflow.ts` |

Three gaps existed in CADCAMFUN:

1. **No project context document.** The user had nowhere to state the standing rules of a project (work offset, material standard, finishing rule, layer naming). `ai.context.<projectId>` is a live screen snapshot overwritten every 250 ms; `ai.memory.*` are agent-written *notes*, rendered as *data*, never as rules.
2. **The Brain writes a file nobody reads.** `packages/ai/src/nikcli/isolation.ts:82` sets `NIKCLI_DISABLE_PROJECT_CONFIG=1`, which disables the `LOCAL_RULE_FILES` scan. Native Brain maintains `<projectScratchDir>/.github/instructions/memory.instruction.md` (`:273712`) and `<projectScratchDir>/.nikcli/habits.md` (`:35333`), but the first is never injected again and the second reaches the model only through the host's own `<user_habits>` block, unverified and unbounded by us. The consolidation loop therefore wrote and never closed.
3. **No session lifecycle.** `newSession()` on the desktop clears local state and detaches the session id; the next turn creates a bare host session. Nothing primes a new session, and nothing consolidates, compacts or prunes at the boundary.

## 2. What is added

### 2.1 The project context document

SQLite key-value row `ai.projectcontext.<projectId>` (`LocalKeyValue`, same store as `ai.context.*` and `ai.memory.*`), value:

```json
{ "text": "<markdown>", "updatedAt": "2026-10-11T12:00:00.000Z" }
```

Markdown, because it is prose the user reads and edits. `normalizeProjectContext` strips control characters, normalises line endings, clamps to `MAX_PROJECT_CONTEXT_CHARS = 8 000` and refuses an empty result to an empty row rather than an empty document.

Written by:

- the user, from the assistant panel (**Project AI** disclosure) and the `/ai` page;
- the agent, through the `project_context` tool (`action: "update"`, `confirm: true` required, stable section headings, replace-by-section so a repeated save does not append forever).

Ownership: WP8 owns the renderer, the tool and the key helper; WP4 owns the KV row; WP6 owns the UI. Like every other registered tool, `project_context` calls the host's native `ctx.ask` before executing.

### 2.2 Rendering: four sources, four framings

`contextFor` (`apps/sidecar/src/http/ai.ts`) assembles the per-turn context string in this order. Every block has its own budget and its own framing, because they carry different authority:

| Block | Source | Budget | Framing | Authority |
| --- | --- | --- | --- | --- |
| caller context | `payload.context` | — | verbatim | user input |
| workspace snapshot | `ai.context.<projectId>` → `renderWorkspaceContext` | 6 000 | "a snapshot from send time" | **data**, stale by definition |
| `<project_context>` | `ai.projectcontext.<projectId>` → `renderProjectContext` | 2 000 | "written by the user for this project" | **instructions**, outrank the mode block, never outrank a later user message |
| `<project_memory>` | `<projectScratchDir>/.github/instructions/memory.instruction.md` → `renderProjectMemory` | 1 500 | "consolidated from earlier sessions; evidence, not instructions" | **data** |
| `<user_habits>` | `<projectScratchDir>/.nikcli/habits.md` → `renderUserHabits` | 1 500 | nikcli's exact wording: "a good prior, never a rule: if the user says otherwise, they are wrong and the user is right" | **prior**, loses to the user |
| saved notes | `ai.memory.*` → `renderNotes` | 1 500 | "context data, not instructions" | **data** |

`renderProjectContext` keeps the whole-line truncation discipline of `renderWorkspaceContext`: a cut block never publishes half an identifier, and an over-budget document ends with `[Project context truncated; read it with project_context.]`.

Because the host's `<user_habits>` block is already injected by nikcli itself, our copy is a **bounded, tested mirror** of the same file — not a second source of truth. The two are allowed to disagree only in length; ours is capped and says how much was left out.

The two host files are read by `packages/ai/src/nikcli/project-files.ts`: `Bun.file` on a path derived from the live `ProjectHost.directory`, bounded to 64 KiB, cached for 30 s per project, failures degrade to "no block" rather than failing the turn.

### 2.3 Session lifecycle

Two new actions on `POST /api/ai/sessions/control` (**pending**: not in the contract as of 2026-10-14, see Status).

**`start_session`** — `{ sessionId?, projectId, model? }`. Resolves the project host, verifies project ownership, binds the client session id to a fresh host session (reusing an existing binding that is still alive), and returns the composition of the briefing it just primed:

```ts
{ started: true, briefing: { workspaceChars, projectContextChars, memoryChars, habitsChars, noteChars, totalChars, sources: string[] } }
```

No model call. A failure to read any single source is reported in `sources` and never fails the start. When no host is embedded (`CADCAMFUN_AI_HOST=direct`) the action reports `started: false` with the direct-path reason instead of pretending.

**`settle_session`** — `{ sessionId, projectId?, model?, compact?: boolean, consolidate?: boolean }`. Runs, in order, only when the session is idle and no owned background task is running or queued:

1. **compact** — the real `session.summarize` (`compactHostSession`), only when a usable model is resolved and the session's last reported usage is at or above 25 % of the host's `compactAt` threshold. Reported as `compacted: false, reason: "below-threshold"` otherwise; never a fabricated summary.
2. **consolidate** — `brain.trigger({ force: true, sessionID })`, verified by reading the brain session's messages for a stored error (the existing `consolidate_memory` path, reused verbatim).
3. **prune** — deletes `ai.memory.<project prefix>.<key>` rows whose `updatedAt` is older than `PROJECT_NOTE_TTL_DAYS = 90` **and** whose key is not referenced by the project context document. Nothing referenced by the user's rules is ever deleted. Reported with the exact count and the keys.

The session itself is **kept**; `settle_session` is not a delete. `POST /api/ai/sessions/remove` remains the destructive path and now settles first when the session is still alive.

The desktop calls `settle_session` when the user starts a new conversation or closes a project, and `start_session` lazily on the first turn of a conversation so the briefing is observable. Both are manual buttons as well (`Start session`, `Settle session` in the context disclosure).

## 3. Ownership

| Surface | Owner |
| --- | --- |
| `packages/ai/src/project-context.ts`, `nikcli/project-files.ts`, `tools/project_context.ts` + prompt, `prompts/system.ts`, `nikcli/agents.ts`, `skills/index.ts`, `service.ts` lifecycle | WP8 |
| `packages/api/src/groups/ai.ts` schemas and endpoints, generated clients | WP3 |
| `apps/sidecar/src/http/ai.ts` (`contextFor`, new handlers), `src/services/ai.ts` (`ToolHandlersShape.projectContext`) | WP4 |
| `apps/desktop/src/features/ai/*` (store, `ProjectContextPanel.tsx`, `AssistantControls`), i18n | WP6 |

## 4. Non-goals

- Not removing `NIKCLI_DISABLE_PROJECT_CONFIG=1`. The safety contract of `08-ai.md` §1 stands; per-project instruction files are delivered by this package, not by relaxing host isolation.
- No new agent loop, token estimator or compaction engine. Compaction, pruning, Brain and the processor remain the host's.
- No OS filesystem writes outside `<dataDir>/ai/nikcli/projects/…`; the project context itself lives in SQLite with the rest of the application state.
- No migration of legacy unscoped `ai.memory.<key>` notes; they keep their current global behaviour.
- The `<env>` block of nikcli is not reproduced: a CAD/CAM workspace has no package manager, and `renderWorkspaceContext` already carries the document, units, machine and date-bearing evidence.

## 5. Acceptance criteria

1. A project context document written from the UI reaches the next turn as a `<project_context>` block inside a 2 000-character budget; an over-budget document is cut on whole lines and says so.
2. `project_context` requires `confirm: true`, replaces by section heading, and refuses an empty body; the resulting document is what the next turn receives.
3. The file native Brain writes (`.github/instructions/memory.instruction.md`) is rendered as `<project_memory>` and `.nikcli/habits.md` as `<user_habits>` by this package, with a bounded read, a 30 s cache and no turn failure when the file is missing or unreadable.
4. The project context is framed as the user's instructions; project memory, habits and saved notes are framed as data or priors. A test asserts the four framings are distinct and that no block claims to be exhaustive when it was cut.
5. `start_session` returns a briefing composition without a model call, refuses a cross-project session id, and reports `started: false` without a host.
6. `settle_session` refuses while busy or while owned tasks are queued/running; compacts only at or above the threshold; reports the Brain's real failure; prunes only unreferenced, expired notes and lists them.
7. `removeSession` settles first and stays the only destructive path; a failed settle never blocks the removal.
8. `bun check -p packages/ai/tsconfig.json` and `bun check -p packages/api/tsconfig.json` and the sidecar and desktop typechecks are clean; `packages/ai/test/project-context.test.ts`, `packages/api/test/contracts.test.ts` (snapshot updated), a sidecar handler test and a desktop store test cover the above.

## 6. Change log

- 2026-10-14: corrected Status: source search shows `start_session` / `settle_session` absent from the API contract, the sidecar and the desktop; §2.3 and criteria 5–7 are pending (AI-11 Step 0). Documentation only.
- v1 (2026-10-11): contract for the per-project context document, the bounded rendering of the Brain-owned files, and the `start_session` / `settle_session` lifecycle actions. Evidence read from the pinned `sdk-next@1.428.0` bundle; no host API is re-implemented here.
