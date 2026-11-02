# 35 — AI performance audit: why it was fast, why it is slow, and the improvement plan

## 2026-11-02 re-audit (current findings; earlier sections are historical)

Status: implementation in progress following the owner's request for a coherent, responsive long-running
CAD/CAM agent. The 2026-10-20 verdict below must not be treated as a description of the current tree.
Source inspection confirms that primaries now have 25-step run budgets, ordinary automatic continuations
are capped at eight, schemas are deferred except `cad` and `agent`, date-only environment text and separate
editor observations stabilize context, status reads use a bounded snapshot, and many kernel paths already
use scoped workers. Disabling these safeguards or rebuilding the host is not the proposed remedy.

### Verified defects addressed in this increment

1. `packages/ai/src/nikcli/chat.ts` renewed a spent run budget only while the UI subscriber was connected.
   The host event monitor remained active after disconnect, but its next budget renewal returned early,
   leaving the long task stopped. Renewal now follows the host controller, preserving explicit cancellation
   while allowing detached progress. The regression checks that the next prompt continues the saved work
   instead of replaying the original request.
2. `apps/desktop/src/features/ai/lib/stream.ts` counted failed reconnections using lifetime greetings.
   After one healthy connection, later failures never incremented the counter. A per-connection greeting
   flag now bounds consecutive failures and retains backoff.
3. `apps/desktop/src/features/ai/store/following.ts` captured editor ownership on every remote event.
   Ownership is now frozen at remote-turn admission, before asynchronous history loading; navigation
   invalidates it through the existing editor-generation check.
4. The same follower discarded the journal's reset flag. It now starts coalesced authoritative drawing
   reconciliation on a gap, preserves the active response, and repairs partial history at completion before
   releasing queued work. It does not replace the active transcript mid-stream.
5. A new session's follower previously waited behind the previous session's pending history read. A new
   epoch now starts a new event chain; post-await checks prevent old work changing the new follower state.

### Latency evidence and limits

- Current text corpus: base system 12,877 characters; all tool descriptions 35,874; all on-demand skill
  bodies 109,115; 126 catalogue actions across 16 exposed tools. These are corpus sizes, **not** the request payload: deferred tool loading and skills
  mean the entire corpus is not sent on every step. JSON schemas, history and images are additional.
- Auto routes registered catalogue calls, including reads, through native classification
  (`permission-modes.ts`). The installed SDK's `SessionAutoMode.classify` sends a stage-one request and,
  unless allowed there, a second request. It also constructs transcript context for classification. This
  proves additional serial work in Auto, not that Auto explains every user's pause. Ask is the desktop
  default; the user reports the symptom generally, without a specific mode/provider.
- The pinned SDK's classifier model falls back to the conversation model when not configured. Thus a
  slow main model can also be used to review actions. Changing review routing requires scoped policy and
  provider tests; do not remove checks to improve a benchmark.
- Exact naming (`actions/cad-kernel-naming.ts`) and inline-history export/meshing (`actions/export.ts`)
  performed synchronous exact geometry on the sidecar event loop. Naming is now moved to the existing
  scoped `cad-naming` worker job, with invocation cancellation, content-keyed reuse and byte-accounted
  cached reports. Health, reference listing and resolution retain the same pure implementation and
  outputs. Export/meshing and scene-to-solid acquisition now also use the scoped worker seam (see continuation below).
  The 60-second build budget is a ceiling, **not** a measured stall.
- The first host remains demand-loaded deliberately (spec 23). Its cold import can stall the event loop;
  blindly enabling warm-up would move that stall into startup rather than isolate it.

New metrics in `packages/ai/src/observability.ts` record first model/tool activity, time from the last
primary tool result to next model/tool activity, observed call-to-result duration (including permissions),
and loop transitions. Parallel tools and specialist activity are kept out of the primary gap calculation.
These stream-level measurements do not isolate provider TTFT, classifier time, queue time or native
event-loop delay. They also do not observe detached execution after their consumer disconnects. The additional
host-owned operation timing described below does cover detached permission and execution phases. No prompts,
arguments, results or session identifiers are added as metric labels.

### Remaining architecture work, in dependency order

1. **Module: turn execution.** Keep session ownership, cancellation and finalization behind its existing
   interface. Host-owned permission/execution timing and completed-call progress evidence are now implemented.
   Complete provider-request timing only through a supported request lifecycle seam; none was found in the pinned
   public host hooks. This improves locality and makes the same seam testable through both desktop
   and mobile adapters without duplicating loop policy.
2. **Module: exact kernel jobs.** Naming and export now use the worker seam. Remaining synchronous parametric
   validation, recipe reporting, exact inspection and project parameter/timeline rebuilds still need that
   interface. Keep authorization and
   persistence in their current adapter; verify identical geometry and errors, cancellation releasing slots,
   and compiled-sidecar packaging. The existing sidecar worker calls now inherit immutable invocation cancellation.
   This gives UI responsiveness leverage without changing geometry contracts.
3. **Module: conversation following.** The reconnect/reset fixes use the existing interface. A future
   authoritative snapshot merge must repair active history without replacing live bubbles, preserve local
   edits and make failed reconciliation visible/retryable. Tests must include navigation during history reads,
   out-of-order completion, journal overflow and queued local sends.
4. Measure representative short and long tasks with real configured providers: per-stage p50/p95, model-call
   count, cache use, tool/queue time and sidecar event-loop delay. Compare Auto/Ask/Approve with identical
   geometry and permissions appropriate to each mode. Fake-provider fixtures prove wiring and policies,
   not model quality or production speed. No percentage speedup is established by this increment.

The goal remains active until the broader owner-requested architecture and performance work is verified.

### Verification of the first increment

- Loop/metrics/background scheduler and runner: 34 tests pass.
- Desktop mounted agent panel, editor sync and follower regressions: 15 tests pass.
- Real embedded host with a simulated provider, Auto permission path: 1 test passes. Initial execution
  required loopback-listen permission; the successful run also emitted optional provider-discovery warnings.
- Kernel jobs and naming contracts: 31 tests pass, including worker/inline equality for health/refs/resolve,
  event-loop heartbeat during a cancellable naming job, queue/caching and shutdown behavior.
- AI, sidecar and desktop typechecks pass; API reference generation reports 332 operations and is unchanged.
- Production-patched sidecar compilation succeeds. A fresh temporary project invokes `cad.kernel` health
  through the compiled HTTP action interface and receives `ok: true` with one body from its embedded worker.
- Full-repository tests, native WebKit acceptance and real-provider latency benchmarks were not run.

### Continuation: exact scene operations in the worker (2026-11-02)

The remaining synchronous exact work in the assistant's CAD handlers now runs through one scoped job, `cad-scene`
(`packages/ai/src/cad-scene-job.ts`): shell (preview and build), offset (preview and build), distance, motion study, exact
STEP/IGES exchange, fastening, and the fillet, boss, hole and free-form face edits that return a body. The sidecar handlers keep
authorization, revisions and persistence; they call the job through a typed helper (`sceneJob`) so each operation keeps its own
result type, and failures read through `kernelFailed` (a deadline or cancel is explained, an internal fault is not leaked). The
job is cacheable and byte-accounted like `cad-hole`. `packages/ai/test/cad-scene-job.test.ts` checks every operation worker against
inline (exchange headers carry the write time and are masked), data-not-exception answers, cancellation and the cache. Still
synchronous: project rebuilds; they stay open. Two more in-process kernel actions moved to the same queue: `cam.job` (plan or
run of a multi-setup job, `cam-job`, `packages/ai/src/cam-job.ts`) and `cam.lathe` (plan, NC and the revolved-stock replay,
`cam-lathe`, `packages/ai/src/cam-lathe.ts`); the actions only call `runKernelJob` under the invocation signal, and the existing
`cam-job-action` and `cam-breadth-actions` suites (46 tests with `kernel-job`) pass through the worker unchanged.

### Continuation: exports, progress evidence and host timing

- CAD inline-history export rebuilds and encodes in one pure worker job. Exporting saved elements acquires
  exact solids in `cad-export-scene` before worker encoding. Verified CAM stock meshing/encoding uses
  `cam-export-stock`. Authorization, current verification checks and file persistence remain in the action
  and sidecar adapters. Files are never stored after a cancelled worker; formats, units, mesh-repair notes
  and SHA-256 receipts are preserved. Exact-body reads can reuse byte-accounted content-keyed results;
  encoded export bytes are not cached. Existing callers of `closedMesh` and `encodeMesh` remain compatible.
- Every `runOwnedKernelJob` in the existing sidecar AI adapter defaults to the admitted invocation's signal.
  A regression starts a real exact-analysis worker through an older handler with no signal argument,
  then cancels its invocation and verifies cancellation and an unchanged stored drawing.
- Budget renewal now requires confirmed completed calls rather than started calls. Automatic recovery uses
  completed-call identities rather than a numeric snapshot count or the wording of the latest error.
  Alternating failures and unrelated successful reads do not keep a failed edit alive indefinitely;
  confirmed edits and partial committed mutations still count as progress. Detached bounded snapshots
  retain identity-based progress even when their visible call count stays constant.
- Native registration records separate `permission` and `execution` durations on the owning Effect v4
  context, even without a UI subscriber. Permission includes classifier, cached approval and human wait;
  it is not a claim of pure classifier latency. Measurement failure preserves the original tool result
  or error. Labels contain tool/mode/phase/outcome, never arguments, credentials, URLs or session ids.
- The pinned host exposes a pre-request `chat.params` hook but no supported complete-response hook suitable
  for exact provider TTFT or full streaming request duration. No global fetch interception was introduced.
- Returning A → B → A while a drawing read is pending now transfers coalesced reconciliation to the valid
  current editor generation. Reset recovery retries transient drawing-read failures at most twice, cancels
  delayed retries on navigation/disposal, and logs an exhausted recovery through the app's Effect runtime.
- The unused native share-sync subsystem is now explicitly disabled at host isolation. The existing
  `share: disabled` configuration denied publishing while still installing listeners and deferred DB reads;
  a local probe exposed those reads after teardown. `NIKCLI_DISABLE_SHARE=1` prevents the unused listeners.

Controlled embedded-host probe, 120 ms added before every loopback simulated-provider response, two
identical read tool calls followed by a final answer, host warmed before measurement:
Approve made three primary requests, no classifier request, 673 ms total; Auto made the same three primary
requests plus two classifier requests, 917 ms; Ask made three primary requests with two immediately
automated permission replies, 629 ms. Thus this Auto fixture adds exactly two serial provider requests;
its roughly 244 ms excess over Approve matches the injected 240 ms. These are a local mechanism check,
not production speed or quality measurements. Real human approval time is deliberately absent from the
Ask fixture, and a stage-two classifier review may add more requests than this stage-one-allow case.

The first broad AI run executed 1,266 tests: 1,262 passed and four failed. The failures were an unscoped
metric-series test query, an overly strict heartbeat ordering assertion, generated inventory line drift,
and an export scene fixture missing canonical history defaults. Each was corrected and checked in focus;
the final broad verification is recorded after it finishes. The actual heartbeat implementation was not
changed: a concurrently queued heartbeat can drain after the last data value while completion still
follows the source, so the test now checks preserved data ordering and termination.

Final verification of this continuation:

- Complete AI suite: **1,266 passed, zero failed**, across 118 files (155.26 s); this includes native host,
  isolation, permissions, tools, goals, recovery, worker queues/cancellation and prompt/inventory checks.
- Desktop mounted agent, streamed-burst performance, follower and editor-sync suite: **19 passed**.
- Sidecar export bridge and invocation/drawing-binding suite: **14 passed**.
- AI/sidecar/desktop typechecks pass; generated API reference remains unchanged. The harness inventory
  was regenerated from its existing script because implementation line numbers moved.
- Production-patched compilation passes. The compiled HTTP smoke validates exact naming, inline-history
  STL export (12,000 mm³), saved-drawing STEP export and matching on-disk file byte counts/SHA-256 receipts.
- The broader remaining parametric offload and real-provider latency work above remain open. No native
  WebKit, full-repository or production-provider benchmark success is implied by these checks.

Status: audit (analysis only, no runtime change shipped by this document). Date: 2026-10-20.
Scope: `packages/ai`, `apps/sidecar/src/services/ai*.ts`, `apps/sidecar/src/http/ai.ts`,
`apps/desktop/src/features/ai`. Method: full source read of the turn path, measured sizes
(`wc -c` on the prompt/skill/tool corpora), git history comparison, and the existing test suite.
All numbers below were measured on this checkout, not estimated from memory.

## 1. Verdict in one paragraph

The system did not get slow because of one bug or because the provider got slower. It got slow
because **every turn now pays a multiplicative cost that did not exist before**: a large fixed
prefix (system prompt + 91-action tool catalogue + JSON Schemas) is re-sent on **every step**,
the primary agents have **no step cap**, an auto-continuation loop can multiply one user message
into up to **50 extra full model calls**, the per-turn context budget grew to **24,000 chars**,
specialists grew from 4 to 9 roles with 40–60 steps each, and the desktop polls a **heavy**
status endpoint every 2 s on the same Bun event loop that runs the embedded host. Each addition
was individually reasonable (safety, recovery, completeness); together they turned a
"one question → one call" assistant into "one question → N calls × (prefix + whole history)".
The fix is therefore not a rewrite: it is budget enforcement, step discipline, lazy loading and
moving heavy reads off the hot path — in that order.

## 2. The system as it stands (turn path)

```
Desktop (SolidJS)                    Sidecar (Bun + Effect)                 packages/ai
EnhancedAssistant / store.ts  ──SSE──►  http/ai.ts turnOf                  AiService.chat (service.ts)
  stream.ts (decode, recover)           ├─ contextFor → ai-context.ts ──►  assembleContext (24k budget)
                                        ├─ ActingUser.bind (owner/drawing) ├─ resolveSelection (catalogue)
                                        └─ ai.chat ─────────────────────►  └─ hostChatStream (nikcli/chat.ts)
                                                                             ├─ session prompt (host)
                                                                             ├─ auto-continue ≤ 50 (continuationFor)
                                                                             ├─ resume ≤ 5 (transient failures)
                                                                             └─ event-mapper → AiEvent stream
Embedded host (@nikcli-ai/sdk-next 1.428.0, in-process, per-project cached Instance)
  ├─ primary agents: general / cad / cam (primaries.ts) — no step cap
  ├─ 9 specialists (agents.ts): researcher, editor, modeler, machinist, reviewer,
  │   planner, diagnostician, verifier, optimizer — 40–60 steps, 5–10 min timeouts
  ├─ 16 exposed tools / 91 actions (actions/catalogue.ts, tools/registry.ts)
  ├─ background scheduler: 4 active / 16 queued (background-tasks.ts), journalled in KvStore
  └─ Brain/memory experimental features on (config.ts: brain: true, memory: true)
Fallback: DirectModel (AI SDK v7, direct-model.ts) — stateless, no tools loop.
```

Key files: [service.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/packages/ai/src/service.ts),
[chat.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/packages/ai/src/nikcli/chat.ts),
[runtime.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/packages/ai/src/nikcli/runtime.ts),
[config.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/packages/ai/src/nikcli/config.ts),
[context-assembly.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/packages/ai/src/context-assembly.ts),
[ai-context.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/apps/sidecar/src/services/ai-context.ts),
[http/ai.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/apps/sidecar/src/http/ai.ts),
[sidecar ai.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/apps/sidecar/src/services/ai.ts).

## 3. Measured fixed cost of one step

| Component | Measured size | Sent |
| --- | --- | --- |
| Base system prompt (8 layers, `prompts/base/*.txt`) | 12,854 chars (~3.2k tok) | every step (host agent prompt) |
| Per-turn system (`turnSystemPrompt`: mode + env + family + context) | mode ~0.5–1k + context | every turn, as prompt `system` |
| Tool descriptions (16 `.txt` in `tools/prompts`) | 32,523 chars (~8.1k tok) | every step (tool catalogue) |
| Tool JSON Schemas (91 actions as discriminated unions) | not in the `.txt` count; `cad_edit` alone embeds the whole element vocabulary | every step |
| Context assembly budget (`CONTEXT_BUDGET`) | 24,000 chars (~6k tok) max | every turn |
| Workspace snapshot inside it (`DEFAULT_CONTEXT_BUDGET`) | 6,000 chars | every turn |
| Skills corpus (`skills/text/*.md`, on-demand) | 63,692 chars total; largest `cad-3d-modeling` 12,720 | when loaded, then in history |
| Conversation history | grows unbounded until host compaction (auto+prune on) | every step |

Two structural multipliers sit on top of that fixed cost:

1. **No step cap on primaries** — [config.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/packages/ai/src/nikcli/config.ts) builds the three primary agents with no `steps` ("`agent.steps ?? Infinity`"), relying on the host doom-loop guard. A trivial question and a full build cost the same *machinery*; only the model's discipline ends the turn.
2. **Auto-continuation ≤ 50** — `DEFAULT_AUTO_CONTINUES = 50` in [chat.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/packages/ai/src/nikcli/chat.ts), driven by `continuationFor` (open todos, last tool error, or the `announcesWork` heuristic: a final sentence like "Procedo con…" / "Let me build…"). Each nudge is a **new full model call** re-sending prefix + history. `MAX_STALLS = 2` only stops nudges that produce no tool call. On top: `DEFAULT_RESUMES = 5` transient-failure resumes with 2–30 s backoff, and the goal loop. worst case one user message = dozens of provider round-trips before the user sees "done".

## 4. Why it was fast before — git evidence

| When | Commit | What changed | Cost effect |
| --- | --- | --- | --- |
| ≤ 2026-10-11 | `8ccba7e2` | 30 per-verb tools, 54,166 chars of tool prompts, no layered base prompt, no skills dir | Smaller, dumber, faster per step |
| 2026-10-14 | `b1db1f90` | Layered system prompt (8 `.txt` layers) + skills + exact-kernel guidance | +12.8k fixed prefix, +skills in history |
| 2026-10-15 | `86cf9fa5` | AI-11 Step 6: one context assembly per turn, budget 24,000 | Context went from ad-hoc to up-to-24k **every turn** |
| 2026-10-15 | `2ab420c7`/`8b621863` | Harness isolation, tool values, prompts refined | More validation/recovery text per result |
| 2026-10-13→17 | `16fb1d71`, `44331407`, `ec64e950` | 3 primaries over subagents, `/goal`, mobile detached turns + stream recovery | More agents, more polling, more recovery reads |
| (growth) | `agents.ts` today | Specialists 4 → **9**, steps 40–60, timeouts 5–10 min; actions → **91** | Delegation fan-out multiplies calls |

The consolidation to 16 tools (spec 26) actually *reduced* description text (54,166 → 32,523 chars).
The regression came from everything around it: context size, continuation policy, agent count,
recovery machinery and polling — not from the tool grouping.

## 5. Root causes, ranked

### P0 — they multiply every turn

1. **Auto-continuation + no step cap** ([chat.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/packages/ai/src/nikcli/chat.ts), [config.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/packages/ai/src/nikcli/config.ts)). The single largest latency factor. A model that ends with an announcement sentence gets nudged into another full call; a plan with open todos gets nudged repeatedly. Correct for `/goal`-style builds, wrong as the default for chat.
2. **Fixed prefix re-sent per step**: base prompt (host agent prompt from `agentSystemPrompt()`) **plus** per-turn `turnSystemPrompt` (mode/env/family/context) **plus** 16 tool descriptions **plus** 91-action JSON Schemas. Prompt-cache breakpoints exist in [transform.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/packages/ai/src/transform.ts) for the DirectModel path, but the host path's caching depends on the provider/host, and the per-turn `system` (with a fresh `new Date()` env block and 24k context) **changes every turn**, breaking prefix-cache stability for everything after it.
3. **Context 24k every turn** ([context-assembly.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/packages/ai/src/context-assembly.ts), [ai-context.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/apps/sidecar/src/services/ai-context.ts)): explicit snapshot + saved snapshot + project rules + Brain memory + habits + notes, deduplicated and budgeted — well built, but the default budget is spent even for "what is this?" questions, and it is re-acquired (Kv reads + `readProjectMemoryFiles` + host lookup) on **every** turn with no revision-based cache.

### P1 — they tax the same event loop the host lives on

4. **Polling with a heavy status endpoint.** Desktop [store.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/apps/desktop/src/features/ai/store/store.ts) polls `sessionControl(status)` every 2,000 ms (`POLL_MS`, up to 25 wake rounds), and [stream.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/apps/desktop/src/features/ai/lib/stream.ts) recovers dropped turns every 1,500 ms for up to 20 min. But `controlSession` "status" in [service.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/packages/ai/src/service.ts) is **not cheap**: `session.messages()` **without a limit** (whole conversation), `readHostSessionState` (another 40 messages + re-mapping every tool part), `brain.status()`, `permission.list()`, `questionsForSession`, `session.goal`, plus `catalogOf` + `flattenCatalog(...).find` over the whole models.dev catalogue. Every 2 s. On the same Bun loop as the host and the SSE stream. This alone can make streaming feel stuttery and slow.
5. **Cold first turn.** [runtime.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/packages/ai/src/nikcli/runtime.ts) supports `warmAfter` (deferred SDK import, 250 ms after ready) and its own comment says evaluating the bundle "blocks the event loop… ten seconds and more". But [AiHostLive](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/apps/sidecar/src/services/ai.ts) **never passes `warmAfter`** (grep: only definition + runtime internal). So the first chat pays: SDK import + host creation + `writeConfig` + registering all tools + credential replay (+ models.dev seed when keys are pending). That is the "first message takes forever" symptom.
6. **Kernel work inline in tool handlers.** `cam.kernel.runJob(job)` is called synchronously in [sidecar ai.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/apps/sidecar/src/services/ai.ts) (`manufacture` handlers), although [kernel-job.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/packages/ai/src/kernel-job.ts) already provides a Worker with a 120 s deadline. Heavy CAM runs therefore block the sidecar loop (and every other session's stream) for their whole duration.

### P2 — correctness-adjacent costs

7. **Recovery reads in the hot path**: `hostChatStream` does `readMessages(1)` before every prompt, `readContinuationState` (40 messages, re-mapped) when the subscriber dropped, `finishFromSession` polls state every 500 ms up to 15 min. Necessary for the detached/mobile model, but they run even in the plain desktop happy path.
8. **Tool-result size**: results carry the whole validated `value` (Code Mode + stored part) plus bounded text; large CAD/CAM results stay in history and are re-sent each step until pruning (host prune keeps ~40k tokens of tool output). Vision results add images (≤2 PNG, ≤4 MB each allowed by the mapper caps).
9. **Brain/memory**: `experimental: { brain: true, memory: true }` plus the `cadcam-memory` default agent and manual `consolidate_memory` (a full extra model session). Useful, but it is another model consumer competing for the same provider quota/rate limits.
10. **Working-tree risk (today)**: 81 files uncommitted, including prompt/skill/tool-prompt edits; `bun test packages/ai/test/agents.test.ts packages/ai/test/harness-inventory.test.ts` = 28 pass, **1 fail** (`harness inventory > the committed inventory is current`) because the committed inventory no longer matches the edited prompts/skills. Uncommitted prompt growth ships unmeasured.

Not causes (checked): tool-prompt consolidation (it shrank text), heartbeat (5 s, trivial),
catalogue caching (60 s TTL exists), `DirectModel` retry (5 attempts, one-shot only),
background scheduler bounds (4/16, journalled — sound).

## 6. Improvement plan (ordered, measurable)

### Phase 0 — measure first (half day, no behaviour change)
- Add a per-turn timing/usage record (already have `done.usage`, `state.usage`): log per turn
  `steps, continuations, resumes, inputTokens, contextChars, catalogueChars, ttftMs, totalMs`
  behind the existing observability. Without this, every later claim is a guess.
- Add a prompt-size budget test (the repo had probe scripts on 2026-10-13): fail CI if
  base + tool descriptions + schemas exceed an agreed cap.

### Phase 1 — P0 fixes (days, biggest win)
1. **Step budget for primaries** (e.g. 25) + **auto-continue only when work is provably open**
   (todos open or tool error), never on the `announcesWork` prose heuristic alone; cap
   auto-continues at ~8 for chat, keep 50 only inside an explicit `/goal`. Expected: median
   turn = 1–3 calls again.
2. **Split the prefix**: keep the host agent prompt minimal; move mode/family/env into it
   **once** (they change rarely), and send per turn only the context delta. Make the env block
   date-only (no time) so the prefix is byte-stable within a day → provider prompt caching works.
3. **Context budget by intent**: default 8k, 24k only when the turn needs it (mode cam/cad with
   an open drawing), and cache the assembled context by (project, drawing revision, notes
   revision) — recompute only on revision change. `assembleContext` already returns a manifest;
   key the cache on the sources' revisions.
4. **Deferred tool loading for real**: expose `cad`/`cam` read tools + `search_tools` by
   default; load `cad_edit`/`cam_edit`/library/vcs groups on demand (the host's deferred schema
   loading is already preserved by the `**` permission choice). Target: step prefix from
   ~8k tok of descriptions + 91 schemas to ~2–3k tok typical.

### Phase 2 — P1 fixes (days)
5. **Cheap status**: `controlSession(status)` must not call unlimited `session.messages()`.
   Use `limit: 40` like `readHostSessionState`, cache brain/goal/catalogue reads (catalogue is
   already 60 s; brain status can be event-driven), and add a dedicated lightweight
   `sessionState` poll (busy + tasks only) for the 2 s desktop poll. Raise poll to 3–5 s with
   backoff when idle; keep SSE as the primary channel.
6. **Warm the host**: pass `warmAfter: announced` in `AiHostLive` (the sidecar already exports
   `announced` from `startup.ts` for exactly this). First-message latency drops to provider latency.
7. **Kernel jobs through the Worker**: route `manufacture`/`verify` heavy paths through
   `runKernelJob` (exists, deadline + abort) instead of inline `cam.kernel.runJob`.

### Phase 3 — P2 (week)
8. Tool-result diet: cap stored `value` for large geometry results (keep receipt + ids, page
   the rest via existing inspect actions); prune images from history after the step that used them.
9. Brain consolidation on idle/manual only (already manual-capable); never during an active turn.
10. Land or revert the 81 uncommitted files; regenerate the harness inventory; keep
    `agents.test.ts` + `harness-inventory.test.ts` green as the prompt-budget gate.

### Expected outcome (to verify with Phase 0 metrics, not promised)
Median simple turn back to 1 call; per-step prefix −50–70%; first-message cold start removed;
polling CPU near zero. These are targets to confirm with the Phase 0 instrumentation.

## 7. UI refinement — tools area only, no redesign

Constraint honoured: keep the current look (nikcli-style rows, `assistant.css`, glyphs, tones).
[ToolRow.tsx](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/apps/desktop/src/features/ai/components/ToolRow.tsx) and
[assistant.css](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/apps/desktop/src/features/ai/styles/assistant.css) (3,501 lines) stay; only micro-refinements:

1. **Duration + tokens on the row head** (data already in `AiToolCall`/usage): right-aligned,
   `assistant-meta-text`, e.g. `1.2 s · 3.1k tok`. Same line, no new chrome.
2. **Step grouping**: consecutive finished read-only calls collapse into one summary row
   ("3 checks · 0 findings") expandable to today's rows — the mobile side already groups
   (`ToolRunGroup`, commit `4dbe1503`); port that grouping, keep the same row markup inside.
3. **Live elapsed while pending**: the pending line (`~ Writing…`) gains a ticking `· 4 s`
   so long kernel calls read as progress, not a hang. CSS-only plus a 1 s local timer.
4. **Diagnostics inline**: `tool_diagnostic` events already exist; render them as the existing
   `assistant-tool-issue` list (severity badge + code + line) under the row instead of only in
   raw output. Reuse `Issues` — no new component style.
5. **Sticky tool filter chips** above the transcript (All / CAD / CAM / Checks / Errors) using
   the existing `assistant-tool-chip` style; filters rows by `data-tool`/`data-tone` already in the DOM.
6. **Virtualize the transcript** beyond ~200 rows (Solid `For` is fine, but `EnhancedAssistant.tsx`
   at 1,359 lines re-renders the whole list per delta in the worst case): memoize rows by call id
   (mobile already memoizes rows, commit `4dbe1503`) and cap mounted rows with the existing
   "show more" pattern from `Code`.
7. Context gauge: show the Phase 1 manifest (included/omitted sources) in the existing
   `ContextDialog` instead of only a token number — same dialog, one extra list.

## 8. LSP for CAD and CAM (new capability, built from what exists)

There is **no LSP today**: `NIKCLI_DISABLE_LSP_DOWNLOAD=1` is set in
[isolation.ts](/Volumes/SSD/Development/cad-cam-app-main-prod-main-prod-v2-auth-proveder-2/packages/ai/src/nikcli/isolation.ts), and diagnostics are batch tools the model must choose to call
(`cad.check`, `cam.analyze`, `cam_edit.verify`). The domain equivalents of an LSP already exist
as pure functions — they are just not served as a language service. Proposal: a
**CAD/CAM Language Service** inside the sidecar, LSP-shaped (JSON-RPC semantics over the
existing HttpApi/SSE), with three surfaces sharing one engine:

**Engine (pure, in `packages/core` + `packages/ai`)**
- CAD diagnostics: reuse `cad.check`/DFM issues, parametric validation, exact-kernel validity —
  normalized to `{ range/elementId, severity, code, message, source }` (the `Issues` shape the UI
  already renders). Incremental: recompute only the edited subtree (history revision from
  `historyRevision` in sidecar `ai-parametric.ts`).
- CAM/G-code diagnostics: reuse `gcode-analysis.ts` (travel limits, rapids in material, missing
  spindle start, feed anomalies) + verifier findings, mapped to G-code line ranges — the mapper
  already carries `line` in issues.
- Symbols/outline: elements, layers, operations, tools as document symbols (id, type, bounds);
  definition = element/operation by id; references = operations using a tool/material.

**Protocol surface (WP3/WP4)**
- `textDocument`-like resources: `cadcam://drawing/<id>`, `cadcam://gcode/<operationId>`.
- Methods: `diagnostics` (push via existing SSE/LiveEvents, debounced 300 ms after an edit),
  `hover` (element/operation facts), `definition`, `references`, `documentSymbol`,
  `codeAction` (quick fixes the tools already know: e.g. "set safe Z", "split pass",
  "use tap drill Ø…"), `completion` (G-code words, operation parameters, material/tool names
  from the libraries).
- The same diagnostics feed the **agent**: a `cad` action `diagnostics` returns the current
  pushed set, so the model stops paying a `check` call to learn what the editor already knows —
  this is also a latency fix (fewer steps).

**UI surface (WP6, same style)**
- Problems list under the transcript / in the CAD-CAM panels using `assistant-tool-issue`
  styling (badge + code + line), click → select element / jump to G-code line (viewport and
  editor already support selection by id).
- Squiggles in the G-code view (existing numbered `Code` block gains per-line tone) and element
  badges in the drawing tree. No new visual language: severity colours already exist
  (`assistant-warn`, `assistant-coral`).

**Rollout**: (1) diagnostics engine + push for G-code (smallest, line-based), (2) CAD element
diagnostics + agent `diagnostics` action, (3) hover/definition/symbols, (4) code actions +
completion. Each step is independently shippable and testable with the existing fixtures.

## 9. What not to do

- Do not replace nikcli or add a second agent loop (spec 28 already decided this).
- Do not "fix" speed by shrinking tool descriptions blindly: the consolidation already did the
  safe part; the cost is schemas + repetition, addressed by deferred loading and caching.
- Do not add an AI Worker / host-per-turn: spec 23 measured this; demand-loading + warm-up is
  the cheaper correct move.
- Do not raise timeouts to mask slowness (`CAM_TOOL_TIMEOUTS` is already 30/60 min).

## 10. Verification for this audit

- Sizes measured with `wc -c` over `prompts/base`, `prompts/family`, `tools/prompts`, `skills/text`.
- Action count: 91 unique `id: "<tool>.<action>"` in `packages/ai/src/actions/*.ts`.
- History: `git log`/`git show` on `8ccba7e2`, `b1db1f90`, `86cf9fa5`, `ec64e950`, `HEAD`.
- Tests run: `bun test packages/ai/test/agents.test.ts packages/ai/test/harness-inventory.test.ts`
  → 28 pass, 1 fail (stale committed harness inventory vs uncommitted prompt/skill edits).
- Not measured (needs a running app + real provider): end-to-end turn latency, TTFT, provider
  cache hit rate. Phase 0 exists precisely to close that gap before Phase 1 claims are made.
