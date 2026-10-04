// Injects `CacheHint`s at the boundaries the policy designates. Runs once in
// `compile`, before the per-protocol body builder, so the existing inline-hint
// lowering path handles the rest.
//
// The default `"auto"` shape marks the first system part, the last system part
// when distinct, and the trailing conversation messages. The system prompt is
// assembled as `[...environment, ...projectInstructions]`, so marking only the
// leading blocks would leave project instructions — usually the largest stable
// layer — without a trailing boundary. Marking first and last exposes the
// base-agent prefix and the full-system prefix as independent reusable layers.
//
// Tool definitions sit ahead of every system and conversation block in the
// provider cache prefix, so the first-system breakpoint already covers them;
// spending a dedicated breakpoint on tools would cost a rolling message slot
// for no extra reuse. This does mean tool definitions must stay byte-stable and
// deterministically ordered for any of these prefixes to be reusable.
//
// Manual `cache: CacheHint` placements on individual parts are preserved and
// count against the four-breakpoint budget; auto only fills remaining slots.
// See opencode #38725.
import { CacheHint, type CachePolicy, type CachePolicyObject } from "./schema/options"
import { LLMRequest, Message, type ContentPart } from "./schema/messages"

const AUTO: CachePolicyObject = {
  system: true,
  messages: { tail: 2 },
}

const NONE: CachePolicyObject = {}

// Anthropic and Bedrock reject requests carrying more than four breakpoints.
const BREAKPOINT_CAP = 4

// Only these protocols read inline hints; everywhere else placement is a no-op.
// OpenAI and Gemini cache implicitly and have no breakpoint concept.
const RESPECTS_INLINE_HINTS = new Set(["anthropic-messages", "bedrock-converse", "openrouter", "vercel-gateway"])

// Resolution rules:
//   - undefined   → "auto" — caching is on by default. The math favors it:
//                   Anthropic's 5m-cache write is 1.25x base, read is 0.1x,
//                   so a single reuse within 5 minutes already wins.
//   - "auto"      → first/last system + rolling message tail.
//   - "none"      → no auto placement; manual `CacheHint`s still flow.
//   - object form → exactly what the caller asked for.
const resolve = (policy: CachePolicy | undefined): CachePolicyObject => {
  if (policy === undefined || policy === "auto") return AUTO
  if (policy === "none") return NONE
  return policy
}

const makeHint = (ttlSeconds: number | undefined): CacheHint =>
  ttlSeconds !== undefined ? new CacheHint({ type: "ephemeral", ttlSeconds }) : new CacheHint({ type: "ephemeral" })

interface Budget {
  remaining: number
}

const markSystemBoundaries = (system: LLMRequest["system"], hint: CacheHint, budget: Budget): LLMRequest["system"] => {
  if (system.length === 0) return system
  const last = system.length - 1
  let changed = false
  const next = system.map((part, index) => {
    // A single system block is one boundary, not two — `index === 0` and
    // `index === last` coincide and the second visit never happens.
    if ((index !== 0 && index !== last) || part.cache || budget.remaining === 0) return part
    budget.remaining -= 1
    changed = true
    return { ...part, cache: hint }
  })
  return changed ? next : system
}

// Mark the last text part of `messages[index]`. If no text part exists, mark the
// last content part regardless of type — that's the breakpoint position in
// tool-result-only messages too.
const markMessageAt = (
  messages: ReadonlyArray<Message>,
  index: number,
  hint: CacheHint,
  budget: Budget,
): ReadonlyArray<Message> => {
  if (index < 0 || index >= messages.length) return messages
  const target = messages[index]!
  if (target.content.length === 0) return messages
  const lastTextIndex = target.content.findLastIndex((part) => part.type === "text")
  const markAt = lastTextIndex >= 0 ? lastTextIndex : target.content.length - 1
  const existing = target.content[markAt]!
  if (("cache" in existing && existing.cache) || budget.remaining === 0) return messages
  budget.remaining -= 1
  const nextContent = target.content.map((part, i) => (i === markAt ? ({ ...part, cache: hint } as ContentPart) : part))
  const next = new Message({ ...target, content: nextContent })
  return messages.map((message, i) => (i === index ? next : message))
}

// Walk the tail backwards so that when the budget runs out the breakpoints that
// survive are the ones closest to the end — those are the ones that keep rolling
// forward and stay inside the provider's lookback window.
const markMessages = (
  messages: ReadonlyArray<Message>,
  strategy: NonNullable<CachePolicyObject["messages"]>,
  hint: CacheHint,
  budget: Budget,
): ReadonlyArray<Message> => {
  if (messages.length === 0) return messages
  const start = Math.max(0, messages.length - strategy.tail)
  let next = messages
  for (let i = messages.length - 1; i >= start; i--) next = markMessageAt(next, i, hint, budget)
  return next
}

const countHints = (request: LLMRequest) =>
  request.system.reduce((count, part) => count + (part.cache === undefined ? 0 : 1), 0) +
  request.messages.reduce(
    (count, message) =>
      count +
      message.content.reduce(
        (contentCount, part) => contentCount + ("cache" in part && part.cache !== undefined ? 1 : 0),
        0,
      ),
    0,
  )

export const applyCachePolicy = (request: LLMRequest): LLMRequest => {
  if (!RESPECTS_INLINE_HINTS.has(request.model.route)) return request
  if (request.model.route === "openrouter" && (request.cache === undefined || request.cache === "auto")) return request
  const policy = resolve(request.cache)
  if (!policy.system && !policy.messages) return request

  const hint = makeHint(policy.ttlSeconds)
  const budget = { remaining: Math.max(0, BREAKPOINT_CAP - countHints(request)) }
  // System boundaries first: they sit earlier in the prefix, so when the budget
  // is tight the larger reusable prefix is the one worth keeping.
  const system = policy.system ? markSystemBoundaries(request.system, hint, budget) : request.system
  const messages = policy.messages ? markMessages(request.messages, policy.messages, hint, budget) : request.messages

  if (system === request.system && messages === request.messages) return request
  return LLMRequest.update(request, { system, messages })
}
