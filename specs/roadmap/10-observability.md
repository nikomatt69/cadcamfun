# RM-10 — Cost and compaction honesty

Status: **in progress** (2026-11-03: the conversation cost survives a reload; see the change log). Depends on: RM-07. Design: `20` Phase 7, `08-ai.md`. Owners: WP8, WP6 `/settings` + chat panel.

## Problem

`done.usage` exists; settings cost screen is partial; manual compact and recovered-stream copy are pending (`21` §18). Deepen **one** usage module (aggregate per session/project/turn) rather than summing ad hoc in three components.

## Effect v4

- Usage is data on the stream, not a new env read.
- Compact: host-native `auto: false`; UI shows `reduced: true | false | failed` honestly.

## Deliverables

1. `/settings` (or existing costs stub) sums input/output/cache from `done.usage`.
2. Manual compact button + effective policy readback.
3. Recovered-turn copy when `done.recovered` (`20` §7.4) — shared with RM-08.

## Verify

```bash
bun test packages/ai apps/desktop
```

## Change log

- 2026-10-12: [AI-09](../ai/09-evaluation-and-observability.md) adds redacted quality/effect correlation and per-part acceptance scorecards. Fixtures ship with earlier increments; stochastic/live-provider, native packaging and machine gates remain distinct. No fabricated baseline or runtime result; implementation pending.

- v1: visible cost and honest compact/recovery.

- 2026-11-03: **the cost of a reopened conversation is no longer zero.** `CostSummary` adds up `usage` of the messages in the store, but stored history rows carried none, so a conversation opened from the server (a reload, the phone's session, a project switch) showed "-" for its cost. `historyMessage` now returns `usage` (`inputTokens`, `outputTokens`) for an assistant message: the sum of its `step-finish` parts, exactly as the live event mapper adds them, a malformed count counting zero and a message without finished steps carrying none; `AiSessionMessage` has the optional field; the desktop `serverMessages` passes it on. A history without usage stays "unknown" instead of costing nothing (`conversationCost` returns undefined). Tests: `apps/sidecar/test/assistant-history.test.ts`, `apps/desktop/test/ai-server-history.test.ts`. Still open: the `/settings` page total across sessions and projects (needs usage persisted outside the host's session store), and the effective-policy readback next to `/compact`.

- 2026-11-03: **deliverable 3, the recovered-turn copy, built.** The `done` event of an answer rebuilt from the host after the stream dropped (`recovered: true`) now marks the message (`AiMessage.recovered`, set in `store/events.ts` next to the existing editor reconciliation), and `MessageBubble` shows one note under it (`ai.recovered.note`, `data-testid="ai-recovered-note"`, `role="note"`): the answer was recovered after the connection dropped, the drawing was reloaded from what was saved, check the result before continuing. The key is translated in all 11 interface languages (ar, de, en, es, fr, hi, it, ja, pt, ru, zh-CN). A normal answer, a user message and an answer still streaming carry no note. Tests: `apps/desktop/test/ai-store-modules.test.ts` (the flag), `ai-recovered-note.test.ts` (the rendered note, in English and Italian, and its absence). Shared with RM-08: the phone reads the same event, its own copy is not done.

