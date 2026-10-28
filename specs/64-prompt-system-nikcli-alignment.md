# Prompt system and prompt management — alignment with nikcli

Status: **plan; Phase 0 step 1, Phase 1 (steps 1–4, manifest), Phase 3 step 2 and Phase 5 steps 1 and 4 are built, see the "Done" notes.** Written 2026-10-27 after reading the nikcli modules `session/`, `service/`, `locale/`, `workspace/`, `mission/` (checkout `/Volumes/SSD/Projects/nikcli/packages/nikcli/src`) and the CADCAMFUN AI code (`packages/ai`, `apps/sidecar/src/http/ai.ts`, `apps/sidecar/src/services/ai-context.ts`). Owners: WP8 (`packages/ai`), WP5 (sidecar context), WP6 (context gauge). Related: 23, 25, 27, 28, 35 (§5 P0.2, §6 Phase 1), 58, 62.

The host is the pinned `@nikcli-ai/sdk-next@1.428.0` bundle, not the checkout. Everything below that depends on a host behaviour names the hook it needs; all hooks used here were found in the bundle (`experimental.chat.messages.transform`, `experimental.chat.system.transform`, `experimental.session.compacting`, `prompt.section`, `prompt.compose`, `session.compact`, `NIKCLI_PROMPT_CACHE_DIAGNOSTICS`, `InstructionSync.foldDelivered`).

## 1. What nikcli does (the model to follow)

| Concern | nikcli mechanism | Where |
| --- | --- | --- |
| System prompt shape | Header + **named sections** `agent \| provider`, `system`, `user` joined in one text; mods see and change each section (`prompt.section`, `prompt.compose`) and the whole array (`experimental.chat.system.transform`). The result is re-joined to a 2-part system (header, rest) so the cache boundary stays put. | `session/llm.ts` |
| Per-model prompt | One full prompt per model family (anthropic 8.7 KB, codex 7.9, beast 11, gemini 15.6, qwen 9.8) chosen from the model id; the agent's own prompt replaces it. | `session/system.ts` `provider()` |
| Environment | `SystemPrompt.environment()` builds `<env>` (cwd, date, locale, region, timezone, package manager) and a `<language>` block. | `session/system.ts` |
| Instructions | Rule files, URLs, profile, env and **loaded skills** are one set of keyed sources. Each is read, canonical-JSON hashed, stored as a blob. A session has an **epoch**: the prefix the model saw first. Later changes are collapsed to the newest value per key and sent as one `user` update message; keys that drifted back to the epoch value send nothing; `foldDelivered` moves delivered changes into the epoch so they are paid once. An unreadable source on the first read blocks the commit instead of freezing a wrong prefix. | `session/instruction*.ts` |
| Reminders | Short `<system-reminder>` text added as a **synthetic part** of the last user message, only when the situation changes (plan mode entered, plan → build switch, auto mode on/off). The last allowed step appends an assistant `MAX_STEPS` message that forces a text-only summary. Structured-output failures re-prompt with a synthetic user message. | `session/prompt.ts` `insertReminders`, `prompt/*.txt` |
| Context accounting | `SessionContext` lists every source (system, instructions, skills, mcp, tools, agents, messages) with tokens, a `deferred` flag and a toggle; a disabled source is **not sent**. | `session/context-breakdown.ts` |
| Compaction | A dedicated `compaction` agent with a fixed template (Goal / Instructions / Discoveries / Accomplished / Relevant files); `prune` drops old tool output beyond 40 k protected tokens (20 k minimum), `skill` results are protected; a circuit breaker stops after 3 consecutive failures; mods may add context (`experimental.session.compacting`) or skip (`session.compact`). | `session/compaction.ts`, `overflow.ts` |
| Locale | Pure resolver: override > config > env > `Intl` > fallback. `replyLanguage` is on by default for non-English; the prompt says "unless the user writes in another language … keep code, identifiers, paths and technical terms in their original form". | `locale/resolve.ts` |
| Missions | A brief is split into milestones → features; each feature is a `goal` run by a named agent with its own model and budget; a validation worker closes a milestone; execution records carry a lease and heartbeat so a crash is reconciled on boot. The planning prompt demands one JSON object. | `mission/` |
| Workspace / service | Not prompt code. Relevant only because a child session **inherits** the parent's instruction state (`InstructionRepo.inherit`) and a workspace is addressed by id. | `workspace/`, `service/` |

## 2. What CADCAMFUN does today

- **Agent prompt** (host agent `prompt`): `BASE_LAYERS` (8 `.txt` layers, ids kept) flattened to one string + the primary's `focus`. 12 403 chars base + 1 924 Build focus = **14 327 chars** (about 3.6 k tokens). The budget test (`prompts/corpus.ts` `PROMPT_BUDGETS.system = 13 000`) measures the base only, not the focus.
- **Turn prompt** (`turnSystemPrompt`, sent as `system` of the user message, so the host appends it after the agent prompt on every request of the turn): permissions note, mode block, `<env>` (units, standards, date), model-family block, **`Current context:` (up to 24 000 chars)**, reply-language line.
- **Context** (`assembleContext`, `ai-context.ts`): five kinds in a fixed authority order, one budget, a manifest of included/truncated/omitted sources. The manifest stays in the sidecar; the UI only receives `context_snapshot { chars }`.
- **Tools**: 16 tool descriptions = 34 279 chars (budget 35 000, raised twice already); skills 77 806 chars, loaded on demand; specialists 4.3–9.7 KB each (`basics.txt` + role + report).
- **Family blocks**: 226–637 chars each; `modelFamilyOf` knows codex / autonomous / gemini / claude / other. MiniMax, GLM, Qwen, Kimi, DeepSeek all fall into `other`.
- **Locale**: faithful copy of `resolveLocale`; the prompt gets "Reply in Italian (it)." and the base `evidence.txt` separately says "Answer in the user's language".
- **Compaction**: `compaction.txt` (domain-aware, one paragraph, no template), host defaults for prune.
- **Hand-off Plan → Build**: none beyond the shared conversation.
- **Delegation brief**: prose rules in the Build focus; the `agent` tool takes a free `prompt`.
- **In-flight work**: the working tree has 14 uncommitted files in `prompts/`, `primaries.ts`, `config.ts`, `service.ts` (Build/Plan primaries replacing General/CAD/CAM). Phases 1–2 touch the same files and must start after that change is merged.

## 3. Evidence from real sessions

Read-only query of `~/Library/Application Support/com.cadcamfun.app/ai/nikcli/data/nikcli.db` (`message_info`, assistant messages with more than 10 000 total tokens, compaction summaries excluded). A request counts as a **cache miss** when it read fewer than 1 000 tokens from the provider cache.

| Provider | Position | Gap to previous message | Requests | Misses | Uncached input |
| --- | --- | --- | ---: | ---: | ---: |
| MiniMax | turn start | ≤ 4 min | 13 | 10 | 1.80 M |
| MiniMax | turn start | > 4 min | 8 | 7 | 1.87 M |
| MiniMax | mid-turn | ≤ 4 min | 137 | 39 | 4.57 M |
| MiniMax | mid-turn | > 4 min | 23 | 8 | 1.33 M |
| OpenAI | turn start | ≤ 4 min | 7 | 0 | 0 |
| OpenAI | mid-turn | ≤ 4 min | 41 | 6 | 0.23 M |

Reading it honestly: on MiniMax, 28 % of mid-turn requests sent inside the usual 5-minute cache window still missed completely, and 10 of 13 quick turn starts missed. OpenAI behaves much better. This is **consistent with prefix churn** (the system text differs from one turn to the next because the editor snapshot is inside it; a skill fold moves the prefix mid-turn) but it does **not prove which section moved**, and MiniMax's cache may be best-effort. Attribution is therefore the first deliverable (Phase 0), before any claim is made about savings. One session also shows a single full miss of 282 k tokens at a turn start.

## 4. Gaps, ranked

| # | Gap | Evidence | nikcli counterpart |
| --- | --- | --- | --- |
| G1 | The volatile editor snapshot (up to 24 k chars) is inside `system`, which sits before every message. Any change to it invalidates the whole conversation prefix. | `turnSystemPrompt`, `chat.ts:535`, §3 | Append-only deltas; never rewrite the prefix (`instruction-sync.ts`) |
| G2 | The prompt is a string. Sections have ids in `BASE_LAYERS` but the id is dropped when joined, so nothing can report, hash or attribute them. | `system.ts:39` | Named `PromptSection`s, `SessionContext` categories |
| G3 | Context manifest never reaches the UI; context is all-or-nothing (`includeContext`). | `ai.ts:207`, `context_snapshot` | Per-source toggles that really stop sending |
| G4 | Budgets measure the wrong thing: base prompt without the focus, characters not tokens, ceilings raised twice. | `corpus.ts` | `SessionContext` token estimate per category |
| G5 | Model families are stubs and miss the models actually used (MiniMax-M3.1, gpt-6-astra, gemini-4). | §3 providers, `system.ts:134` | One tuned prompt per family |
| G6 | Language rule is contradictory ("reply in Italian" vs "user's language") and says nothing about decimal commas, identifiers or currency. | `evidence.txt`, `replyLanguageLine` | `<language>` block wording |
| G7 | No Plan → Build hand-off reminder; compaction has no template and relies on the model to carry ids and revisions. | `primaries.ts`, `compaction.txt` | `insertReminders`, compaction template, `experimental.session.compacting` |
| G8 | Delegation briefs are free prose; nothing checks that ids, units and the expected report are present. | Build `focus` | Mission feature = objective + agent + model + budget + dependsOn |
| G10 | Prompt caching is left to chance. Breakpoints are placed by the host only for Anthropic, OpenRouter and Alibaba routes (`cachesPrompt`); MiniMax and OpenAI-compatible routes rely on the provider's automatic prefix match, so a moving prefix is paid in full. Cache lifetime is never chosen: `NIKCLI_CACHE_RETENTION` is not set for the host (it is not scrubbed either), and the direct path's `retention` is never passed. The mean gap between a turn's first request and the previous message is about 19 minutes on MiniMax, far past the 5-minute entry. | `provider/cache-policy.ts` `resolveRetention`, `transform.ts` `applyCaching` |
| G11 | Compaction is model-aware only through the host default. `contextBudget` mirrors `overflow.ts`, but a global `compaction.reserved` would override every model, the summary has no size target tied to the model's window, and `PRUNE_PROTECT` (40 k) / `PRUNE_MINIMUM` (20 k) are fixed in the host whatever the window. | `overflow.ts` `usable`, `compaction.ts` |
| G9 | The date appears twice (our `<env>` and the patched host `<env>`). | `system.ts:101`, `host-patches.ts` env patch | One `<env>` |

Not gaps (checked): the host config sets `steps: 25` per primary, so nikcli's text-only last step (`max-steps.txt`) applies (confirm in the bundle in Phase 0); skill fold per step is already patched (`host-patches.ts`); `<env>` is date-only, so it is byte-stable within a day.

## 5. Plan

Phase 5 sits last in the file but its retention setting (step 1) can ship right after Phase 0. Each phase ends with a Verify gate; do not start the next before it is green. `bun test packages/ai` and `bun check -p packages/ai/tsconfig.json` are the base gate for every phase.

### Phase 0 — Measure and attribute (no behaviour change)

1. **Section manifest.** `prompts/assembly.ts` (new): `PromptSection { id, kind: "stable" | "turn" | "volatile", text }` and `promptManifest(sections) → { id, chars, tokens, sha }[]`. Build it from the current `BASE_LAYERS`, focus, mode, `<env>`, family, context, locale without changing the output string (golden test: concatenation equals today's `turnSystemPrompt` / `agentSystemPrompt`).
2. **Churn log.** In `AiService.chat`, log per turn the manifest hashes plus host usage (`input`, `cache.read`) at turn end (debug level, under the existing observability); the first request of each turn also records the previous turn's hashes. Output: for every miss, which section hash changed.
3. **Host-side cross-check.** Run once with `NIKCLI_PROMPT_CACHE_DIAGNOSTICS` set on the host process and compare with step 2 (the flag exists in the bundle; it reports which part of the request changed between calls).
4. **Honest budgets.** Replace `system: 13 000` with an *assembled* budget: base + Build focus + turn block with a representative context, in estimated tokens, plus the tool descriptions. Keep today's numbers as the starting ceiling; write the measured values into this spec.

**Done 2026-10-27 (uncommitted):** steps 1 and the `changed` field of step 2 — `prompts/assembly.ts`, `turnSections` / `agentSections` in `system.ts`, a debug log `AI turn prompt` in `service.ts` (sections, tokens, `changed` since the conversation's previous turn), `test/prompt-assembly.test.ts` (golden against the old formula, manifest, Build agent size). Open: usage in the same log line, step 3 (host diagnostics), step 4 (token budgets in `corpus.ts`, which another session has modified).

Verify: a table of misses by changed section for at least two recorded sessions; the budget test fails if the Build agent prompt grows past the recorded value.

### Phase 1 — Volatile context out of the system prompt (G1, G3)

1. Split `assembleContext` output by kind: **stable** = `requirement`, `memory`, `reference` (project rules, Brain, habits, notes); **observation** = `observation`, `ui-snapshot` (client text, saved editor snapshot).
2. Stable text stays in the turn system block. It is identical between turns unless the user edited the rules or Brain rewrote memory, so it moves the prefix only when it truly changed (nikcli's epoch move).
3. Observation becomes a **synthetic text part** of the user message: `<editor_state drawing="…" revision="…" at="…">…</editor_state>`, default budget 2 000 chars (header, counts, selection, active layer, machine; the rest is read with `cad describe`), 8 000 only for explicit "use what I see" turns. It is appended only when its hash differs from the last one delivered in this session and says that the newest `editor_state` supersedes older ones. Earlier parts are never edited or removed, so the history stays a stable prefix; compaction folds them.
4. The last delivered hash is read from the host session (the last user message's part attribute — `chat.ts` already reads the latest message before each prompt), not kept in a sidecar map, so a restart or the mobile client cannot desynchronise it.
5. `context_snapshot` carries the manifest (id, kind, label, tokens, truncated/omitted). The desktop gauge and the mobile composer show it and send `disabledSources` back; a disabled source is not acquired (`ai-context.ts` skips it), replacing the boolean `includeContext`.

Files: `apps/sidecar/src/services/ai-context.ts`, `apps/sidecar/src/http/ai.ts`, `packages/ai/src/context-assembly.ts`, `packages/ai/src/prompts/system.ts`, `packages/ai/src/service.ts`, `packages/ai/src/nikcli/chat.ts`, `packages/api` (event + body schema, regenerate clients), desktop/mobile gauge.

**Done 2026-10-28 (uncommitted), steps 1–4 and the manifest half of step 5:**
- `context-assembly.ts`: `assembleContextParts` (stable = requirement/memory/reference, observation = observation/ui-snapshot, each inside its own budget; observation default `OBSERVATION_BUDGET` 2 000), `contextSections` (id, kind, label, chars, tokens, truncated, placement `system|message`), `planObservation`, `renderObservation`, `observationDigest`, `deliveredObservationDigest`. `assembleContext` is unchanged.
- The observation is one synthetic text part after the user's text and files: `<editor_state drawing="…" at="…">…</editor_state>` plus the line "The newest editor_state supersedes every earlier editor_state in this conversation." Its digest (16 hex of SHA-256 over drawing, revision, text without the `Snapshot: <capturedAt>` line that `renderWorkspaceContext` writes) is stored as the part's `metadata.cadcamObservation`. Proven against the pinned host (`test/observation-host.test.ts`): `session-prompt.prompt` keeps `synthetic` and `metadata` of a text part, `session.messages` returns them, the request prefix of the next turn is byte-identical, a change appends exactly one part.
- `service.ts` reads the digest before the prompt (`readDeliveredObservation`, `nikcli/context.ts`: newest 200 messages; a compaction summary ends the search, so the observation is sent again after a compaction; an unreadable host sends it). `/goal` lines run the host's `command`, which takes no parts: nothing is built (event says `observation: "skipped"`). Without the host (one stateless call) the observation stays in the system prompt.
- Sidecar: `assembleParts` (`ai-context.ts`) renders the stored snapshot inside the observation budget; `http/ai.ts` passes `context` (stable), `observation` and `contextSections`.
- `context_snapshot` now carries `sections` and `observation: sent|unchanged|skipped` (both optional; `packages/ai/src/events.ts` and `packages/api/src/ai-events.ts`; `bun run generate` leaves the generated clients unchanged because they already carry the new fields (`generate:check` is clean); `bun test packages/api` is green without `-u`).
- Open: step 5 second half (`disabledSources` replacing `includeContext`, desktop/mobile gauge); the `revision` attribute (no revision of the live editor state exists on the sidecar; `ObservationInput.revision` is supported and part of the digest, nobody sets it yet); the 8 000-character "use what I see" budget (the option exists, no caller). Turning context off mid-session leaves the last `editor_state` in the history as the newest one; it is not marked stale.

Verify: golden tests — same state on two turns gives byte-identical `system` and no new part; one state change appends exactly one part and changes no earlier message; a disabled source never appears in the text. Re-run the §3 query on new sessions: turn-start misses at gap ≤ 4 min on MiniMax drop, or the Phase 0 log names the next culprit.

### Phase 2 — Families, language, environment (G5, G6, G9)

1. `modelFamilyOf` learns `minimax`, `glm`, `qwen`, `kimi`, `deepseek`, `gemini-4`, `gpt-6`; each block is 0.6–1.2 KB, written from observed failure modes in the stored sessions (announces then stops, repeated unchanged call, skipped verification), not from nikcli's coding prompts. Evaluate with the existing `eval-corpus` harness before keeping a block.
2. One language rule, nikcli wording adapted: reply in the user's language, defaulting to the resolved reply language; ids, tool names, G-code, units and standards stay as written; `12,5` is 12.5 mm when the locale uses a decimal comma (matches the NumberField rule). `evidence.txt` loses its own language sentence.
3. `<env>` is ours only for what the host cannot know (units, standards, axes, currency from `resolveLocale`); the date stays in the host's patched `<env>`.

Verify: `prompts.test.ts` for the language rule in `it`, `de`, `en`; family routing table test; eval-corpus run per new family on a recorded task.

### Phase 3 — Hand-offs and compaction (G7)

1. **Plan → Build reminder.** When the previous assistant message of the session came from `cadcam-plan` and the turn runs on `cadcam-build`, add one synthetic part: "The plan above was approved; execute it step by step, check each step, do not re-investigate what the plan already read." (`insertReminders` / `build-switch.txt` shape).
2. **Compaction template.** `compaction.txt` gets nikcli's fixed headings adapted: Goal, Constraints (units, tolerances, machine, material), Model state (ids, revisions), CAM state (operations, verified or stale), Verified vs assumed, Pending, Next action.
3. **State ledger.** A first-party mod on `experimental.session.compacting` appends a ledger computed from tool state (drawing id and revision, operation ids and verification status, open goal and todos, running child tasks) so identifiers no longer depend on the summary model. Only the app's own mod module is loaded (`mods.ts` rule); no user or project mods.

**Done 2026-10-28 (uncommitted), step 2 only:** `nikcli/prompts/compaction.txt` has the fixed headings Goal, Constraints, Model state, CAM state, Verified vs assumed, Pending, Next action and keeps the earlier safety rules (`test/cache-compaction.test.ts` pins both).

**Hook facts for steps 3 and Phase 5 step 5 (read in the pinned bundle `index.js`, `SessionCompaction.processImpl`):**
- The `compaction` agent's `prompt` (our `compaction.txt`) is its *system* prompt. The request that follows is a user message built by the host: `compacting.prompt ?? [defaultPrompt, ...compacting.context].join("\n\n")`, where `defaultPrompt` is nikcli's template (Goal / Instructions / Discoveries / Accomplished / Relevant files). So the host template and ours both reach the model; `compaction.txt` therefore says to use its own headings and fold the host's into them. Only a mod can remove the host template.
- `experimental.session.compacting` is triggered as `plugin.trigger("experimental.session.compacting", { sessionID }, { context: [], prompt: undefined })`: input is only `{ sessionID }`; output `context: string[]` is appended after the default prompt, `prompt` (string) replaces the whole user message. `session.compact` (`Mod.sessionCompact`, input `{ sessionID, auto }`) may return `{ skip: string }` to cancel the compaction.
- `PRUNE_PROTECT = 40000`, `PRUNE_MINIMUM = 20000` (`SessionCompaction`), `COMPACTION_BUFFER = 20000`, `OUTPUT_TOKEN_MAX = 32000` as the spec says.
- Not built: the state-ledger mod. The payload is proven, but a mod file, its declaration in the isolated `nikcli.json` and a source for the ledger (drawing and operation state, which only the sidecar tools hold) are outside the files this change owned. The mod would push the ledger into `context` and, from `compactionSizeTarget(usableContext(model))`, a line "Keep the summary under N tokens" (the model is not in the hook input: read it from the session's last user message).

Verify: unit test of the ledger renderer; compaction fixture where the summary omits an id and the ledger still carries it; a Plan → Build switch test over a fake host.

### Phase 4 — Delegation briefs (G8)

1. `agent` tool input accepts an optional structured `brief` (`objective`, `ids`, `values` with units, `limits`, `report`) rendered by one function into the child prompt; the free `prompt` still works. The Build focus shrinks to the rule "use a brief".
2. A validation pass refuses a brief that names an id the parent never read in this session (the parent's tool results are known to the runner), the same discipline as nikcli's mission features naming sibling ids in `dependsOn`.
3. Out of scope here, recorded for spec 58/62: nikcli's mission layer (milestones, features, validation worker, lease/heartbeat) is the natural model for the "AI-built assembly" job (harness final goal). It needs its own spec and the timeline work first.

Verify: `agents.test.ts` additions; brief rendering golden; a refused brief returns the missing ids.

### Phase 5 — Cache and compaction per model (G10, G11)

The cache rules themselves are already nikcli's: `packages/ai/src/transform.ts` is a port of `provider/transform.ts` + `cache-policy.ts` (three message breakpoints, one reserved for tools, last two conversation messages, per-model minimum prefix) for the direct path, and the host applies the original on the embedded path. What CADCAMFUN adds is the part nikcli leaves to the caller: keep the prefix still (Phases 0–1) and choose lifetime and thresholds per model.

1. **Retention.** A setting `ai.cacheRetention: "short" | "long"` (default `short`, nikcli's default). It sets `NIKCLI_CACHE_RETENTION` for the host through `isolationEnv` and is passed as `retention` to the direct path. `long` (1 h entry, 2x write, break-even at the third read) is recommended per model in the picker for Anthropic-routed models only, because only those carry breakpoints; the Phase 0 log decides whether it pays (turn-start gaps measured in §3).
2. **No marker where none works.** A model whose route has no cache breakpoints (`cachesPrompt` false) gets no retention option; the gauge shows "automatic prefix cache" for it so the user knows why a moved prefix is expensive there.
3. **Cache key.** `promptCacheKey = sessionID` is already set by the host for `openai`; confirm in Phase 0 that MiniMax and the other OpenAI-compatible routes get a stable key or none, and record which.
4. **Compaction threshold per model.** Do not set `compaction.reserved` globally. `contextBudget` (already `overflow.ts`) stays the single formula for the gauge and for the warning; add the model's compaction point to the context event so the UI shows `compactAt` for the selected model, and recompute it when the model changes in a conversation (the host does this per request already).
5. **Summary size per model.** The `experimental.session.compacting` mod (Phase 3) adds a size target to the compaction prompt from the model's window: `target = clamp(usable × 0.06, 2 000, 12 000)` tokens, so a 128 k model keeps a tight summary and a 1 M model keeps more state. The state ledger of Phase 3 is exempt from the target.
6. **Early compaction for weak long-context models (decision).** Some routes degrade well before the window is full. Lowering the point per model needs either a per-model `reserved` or a host patch on `usable()`; the pinned bundle holds `COMPACTION_BUFFER = 20000`, `PRUNE_PROTECT = 40000`, `PRUNE_MINIMUM = 20000`. Decide after Phase 0 shows where quality drops, using the recorded sessions (tokens at the step where tool errors start repeating).
7. **Compaction model.** The `compaction` agent has no model, so it uses the turn's model. For a small-window model that is the right default; for a user who picked an expensive model it is the costly one. Keep the default and add an optional `compaction.model` setting only if the cost shows up in the Phase 0 numbers.

**Done 2026-10-28 (uncommitted), steps 1 and 4 and the helper of step 5:**
- Step 1: `IsolationOptions.cacheRetention` → `NIKCLI_CACHE_RETENTION` in `isolationEnv` (always set: `short` unless `long`, so an inherited shell value cannot change it); `AiConfigShape.cacheRetention` → `prepareDirectCall(…, retention)` at its three call sites in `direct-model.ts`. The pinned host reads the variable on every request (`Flag.cacheRetention()`, `resolveRetention`: `long` → 1 h ttl on the Anthropic `cacheControl`, anything else short). **Not wired:** the sidecar still builds `AiConfig` and `isolation: { mods: true }` (`apps/sidecar/src/services/ai.ts`) without the setting; one setting must feed both fields.
- Step 4: `usableContext` is the one formula (nikcli `usable`); `contextBudget`'s `compactAt` uses it. The desktop's `usableWindow` (`context-metrics.ts`) is a second copy used only until the host's `compactAt` arrives.
- Step 5: `compactionSizeTarget(usable)` (`session-controls.ts`), clamp(6 % of usable, 2 000, 12 000). Used by nobody yet: it waits for the mod above.

Verify: unit tests for the retention env and for the direct path breakpoints with `long`; `contextBudget` table test over three models (input window set, absent, huge); a compaction fixture showing the size target for two windows.

## 6. Order, size and risks

| Phase | Size | Depends on | Main risk |
| --- | --- | --- | --- |
| 0 | S | the Build/Plan primaries change merged | Instrumentation overhead; mitigate by logging hashes, not text |
| 1 | M | 0 | A model ignoring "newest editor_state wins"; mitigate with a revision attribute and a test on a stale-snapshot conversation |
| 2 | S–M | 0 (eval harness) | Family blocks regress other models; one block per PR with an eval run |
| 3 | M | pinned-host hook semantics | `experimental.session.compacting` payload differs from the checkout; read the bundle before coding |
| 4 | M | 3 | Brief rejection loops; cap at one retry, then pass the free prompt through |
| 5 | M | 0 (log), 3 (mod) | Long retention costs 2x on writes for short sessions; default stays `short` |

Constraints that stay: English-only prompts; edit only the owning WP directories; no change to the host bundle beyond the existing patch list unless a phase cannot work without it; regenerate the harness inventory and the API snapshot in the same change as any tool or event schema change.

## 7. Open decisions

1. Observation budget default (2 000 vs 4 000 chars): decide after the Phase 0 numbers show what the model actually reads from the snapshot.
2. Whether `disabledSources` is per conversation (nikcli) or per project; nikcli keeps it per session.
3. Whether the family blocks may differ for `plan` and `build`; start with no.

## 8. Status, 2026-10-28 (all uncommitted)

Built and tested:

- **Phase 0:** section manifest (`prompts/assembly.ts`), turn log with the `changed` sections, Build agent size gate.
- **Phase 1 (steps 1-4):** stable context stays in the system block; the editor observation is one synthetic part, sent only when its digest changed, read back from the host session; `context_snapshot` carries the section manifest. `/goal` turns skip the observation; the direct path keeps it in the system prompt.
- **Phase 2:** one language rule, seven new family blocks (minimax, glm, qwen, kimi, deepseek, gemini-4, gpt-6), the corpus reads them through `FAMILY_SAMPLE_MODELS`.
- **Phase 3 (steps 1-2):** the plan-mode and build-switch reminders are wired into `hostChatStream` (tested against the pinned host); `compaction.txt` has the fixed CAD/CAM headings and `compactionSizeTarget` exists.
- **Phase 4:** `agent.start` takes an optional structured `brief`.
- **Phase 5 (steps 1, 4):** `cacheRetention` reaches the host environment and the direct path; `usableContext` is the single compaction-point formula.
- **Tools (nikcli's dynamic loading, chosen for this application):** `tool.eager` = `cad` and `agent`; everything else is deferred and found with `search_tools`; the first line of every description is a complete summary within the host's 100-character index.
- **Build and Plan prompts (nikcli's composition):** a role plus reusable awareness blocks (`prompts/awareness/`), reminders on entry (`prompts/reminders/`).
- **Auto mode:** the classifier is written for CAD/CAM without nikcli's coding defaults; the permission map, the classifier text and the role prompt are derived from the catalogue by `auto-mode.test.ts`. Auto operates fully on the active drawing and its machining, denies deletion, history restore, workflow runs and mod writes, allows start change, commit and pull request, and stays inside the active drawing of the project.
- **Prompt injection:** `untrusted.ts` seals text from attachments, rules, memory, G-code, web excerpts and user skills; contributed modes are capped and stripped of hidden characters.

Evidence that the first fix works is still to be collected: re-run the §3 query on sessions made after this change. In particular, `agent` was called 0 times in 30 sessions before `tool.eager`.

Not done, and why:

- **State-ledger mod** (Phase 3 step 3). The hook payload is proven from the bundle (`experimental.session.compacting`: input `{ sessionID }`, output `{ context: string[], prompt? }`), but the mod module and its data source in the sidecar are not written.
- **`disabledSources` and the context gauge** (Phase 1 step 5): UI work.
- **`ai.cacheRetention` in the sidecar config:** the setting exists in `AiConfig`, but `apps/sidecar/src/services/ai.ts` does not set it yet, so every user runs `short`.
- **Phase 5 steps 2, 3, 5-7:** no retention option per model, cache-key check, summary size in the compaction prompt, early compaction, compaction model.
- **Phase 0 steps 3-4:** the host's cache diagnostics cross-check and token budgets in `corpus.ts`.
- **G9:** the date is still printed by both our `<env>` and the host's patched one; the language line is also printed twice (ours and the host's `<language>` block).
- The host's default compaction template still reaches the model beside `compaction.txt`; only a mod can remove it.
- The desktop's `context-metrics.ts` keeps a second copy of the compaction-point formula.

## 9. Decisions for the owner

1. **Plan delegating read-only specialists** (researcher, planner, diagnostician, reviewer), as nikcli's Plan does. It needs Plan to hold `agent`, which the catalogue classifies as a write tool, and a refusal in `agent.start` for editing specialists by the calling agent (`ctx.agent` is available from the host). Today Plan holds no `agent`; `agents.test.ts` asserts it.
2. **Eager set:** `cad` and `agent` only. Adding `cam` costs about 0.9 k tokens per request; it was used in 11 of 30 sessions.
3. **Auto and version control:** Auto may now start a change, commit and open a pull request. Say if commits should stay with a person.
