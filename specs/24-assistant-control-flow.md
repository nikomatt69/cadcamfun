# Assistant control flow — CAD and CAM (2026-10-10)

Status: implemented; final integration verification in progress. Cross-WP contract agreed for this task before integration edits.

## Existing runtime refinement (2026-10-11)

WP8, WP4 and WP6 refine the existing embedded host and desktop adapter together. Nikcli remains the session, processor, LLM, tool-loop and compaction engine; no parallel architecture is introduced. The adapter must leave native retry admission to the processor, preserve the model and variant when queueing user messages, stop automatic nudges for questions and terminal refusal reasons, and account for all completed steps once. Session state and queued messages must validate project ownership. Desktop cancellation must interrupt pending transport reads, complete callbacks once, and prevent old turns from updating a newly selected conversation. CAD/CAM tools, role permissions and wire formats remain the existing ones.

The existing session-state response gains optional typed recovery events (tool calls/results, diagnostics and plan) and completed-step usage. Pending questions and permissions are restored through the existing session-control endpoint. Recovery reads nikcli's stored parts and native pending requests; it never re-executes a tool. The desktop reconciles recovered results through its existing reducer before completing the turn. Existing clients remain compatible because the new fields are optional.

Workspace context retains full project/drawing/operation IDs, snapshot time, actual cutting settings, selected geometry and actionable verification messages. Unknown values remain explicit; selected elements take priority over bulk geometry and the character budget is enforced.

The runtime emits schema-validated turn phases, native session status, permission resolution/blocking, compaction phases, context snapshots and actionable tool diagnostics. Diagnostics distinguish argument/execution failures, partial mutations and verification findings. The API owns the desktop wire decoder and its generated stream types; a contract test checks parity with the runtime schemas. Unknown future event names are skipped while malformed known events trigger session recovery.

Domain tool schemas are deferred by the native registry and activated through `search_tools` per session. On the pinned SDK, an exact `*` deny fallback also enables the registry's curated eager-tool path. Domain roles instead use the equivalent native wildcard `**` deny fallback with explicit allowed capabilities, preserving default denial and native discovery. Memory and compaction keep their own permissions. Real-host tests verify initial deferral, activation, fresh-session isolation and exclusion of shell/file/web tools.

Status: refinement implemented; verification recorded below.

Change log: 2026-10-11 — agreed integrated processor/session/stream lifecycle refinements.

## Ownership and flow

WP8 owns `packages/ai`: typed prompt loaders, native/custom tool registry, role selection, model variants, host context and session controls. WP3 owns `packages/api`: schema-first endpoints and generated clients. WP4 owns `apps/sidecar/src/http/ai.ts` and `src/services/ai.ts`: delegation to the service. WP6 owns `apps/desktop/src/ai` and `src/i18n`: assistant controls and interactive questions. Existing unrelated changes are retained.

The flow is UI session + project -> AiService identity binding -> nikcli session -> registered role/tool permissions -> validated handler -> real project -> correlated stream result -> editor/context reconciliation. Main and child agents share project evidence and explicit briefs, not fabricated shared conversation. Child results stay scoped to the parent; question replies and cancellations use that same owner. No second agent loop, token estimator or independent compaction engine is introduced.

## Contract

- `POST /api/ai/chat/stream` additionally accepts `agent` (cadcam or registered specialist ID), `mode` (existing CAD/CAM domain modes) and model `variant`. Variants must exist on the resolved provider/model. Agent IDs resolve through the same roster that configures permissions and delegation.
- `GET /api/ai/agents` lists the default and specialist roles with ID, title, description, tools and whether they edit.
- `POST /api/ai/sessions/control`: sessionId/projectId and action `status | compact | cancel_task | answer_question | reject_question | reply_permission | consolidate_memory`, with the action's taskId/requestId/answers/decision/model fields. All actions resolve and verify session ownership. Responses contain current busy state, host context policy/model limits/latest usage, pending questions and owned tasks. Manual compaction refuses an active turn; it does not abort it or launch work. Queued cancellation retains editing exclusion until settlement.
- `GET /api/ai/providers` additionally reports optional input window, reasoning support and available variant names from the host. Missing limits are unknown, never invented. Builtin provider defaults inherit catalog limits instead of overriding every model with 32k output. Explicit custom limits remain supported.
- Questions use nikcli's native request/reply/reject lifecycle. The frontend handles correlated question events and restores pending questions from session controls after reconnect. The native question tool is permitted by the registry for main and specialist roles.
- Static role instructions are supplied once by host config. Per-turn instructions contain only selected domain mode, model-family guidance and fresh project context. Compaction uses nikcli's algorithm with a CAD/CAM continuity prompt preserving requirements, units, entity/operation IDs, revisions, successful mutations, failed/skipped work, verifications and pending child/user decisions.

## Memory

The embedded host fallback agent is an internal memory-only role omitted from the UI roster because native Brain omits its agent selector. UI chat, continuation and specialists always select their CAD/CAM role explicitly; the coordinator remains the UI default. This keeps file tools out of CAD/CAM sessions while allowing Brain to edit its isolated project notes.

Use nikcli’s native Brain consolidation and project profile reminders, with the native 24-hour/five-session thresholds. Expose status and manual consolidation in the assistant context controls. Manual consolidation waits for turns and workers to finish, uses the owned session model, and reports native failures. Verified CAD/CAM setup notes additionally use length-prefixed project namespaces in SQLite, injected into parent and specialist turns. Legacy unscoped notes remain stored but are excluded from project prompts.

## Verification

2026-10-11: runtime suite has 323 cases; its sole initial failure (system prompt size) was corrected and the 14-case prompt suite passes within the unchanged budget. API/desktop/gateway integration (57 cases), sidecar CAD/CAM handlers (62 cases), desktop recovery/wire diagnostics and real native-host deferred discovery pass. Mobile companion HTTPS tests confirm session-state tool/result/usage parity after a completed turn. AI, desktop and sidecar typechecks pass; API schema parity and generated clients are checked. Deterministic fake-provider tests prove control flow and validation, not real-model manufacturing accuracy.

Published parametric examples must decode and build real solids. Serialized history/cases and wrong entity discriminators must fail before mutation with actionable recovery. Tests exercise the actual embedded host for validation hooks, questions, model variants and compaction where possible, plus API/UI integration and typechecks for all affected packages. Provider accuracy gains require real model runs and are not inferred from deterministic tests.

Change log: 2026-10-10 — defined the connected assistant control surface and cross-WP ownership.

Permission modes use native Nikcli evaluation: Ask maps to permission_mode default and tool ask rules; Auto maps to permission_mode auto and the native classifier/fallback prompt; Approve maps to explicit allow rules only inside the selected role. Deny rules remain authoritative. Every registered tool calls native ctx.ask before executing. Role/mode aliases are internal; delegated and queued turns inherit the parent agent's mode. The UI exposes all three modes.
