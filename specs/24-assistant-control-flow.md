# Assistant control flow — CAD and CAM (2026-10-10)

Status: implemented; final integration verification in progress. Cross-WP contract agreed for this task before integration edits.

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

Published parametric examples must decode and build real solids. Serialized history/cases and wrong entity discriminators must fail before mutation with actionable recovery. Tests exercise the actual embedded host for validation hooks, questions, model variants and compaction where possible, plus API/UI integration and typechecks for all affected packages. Provider accuracy gains require real model runs and are not inferred from deterministic tests.

Change log: 2026-10-10 — defined the connected assistant control surface and cross-WP ownership.

Permission modes use native Nikcli evaluation: Ask maps to permission_mode default and tool ask rules; Auto maps to permission_mode auto and the native classifier/fallback prompt; Approve maps to explicit allow rules only inside the selected role. Deny rules remain authoritative. Every registered tool calls native ctx.ask before executing. Role/mode aliases are internal; delegated and queued turns inherit the parent agent's mode. The UI exposes all three modes.
