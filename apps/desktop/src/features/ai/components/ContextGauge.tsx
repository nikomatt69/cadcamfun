/**
 * nikcli's context-usage indicator (`session-context-usage.tsx`): a small ring that fills as the
 * conversation approaches the model's context window, with the numbers on hover.
 */
import { Show, createMemo, type JSX } from "solid-js"
import { t } from "../../../i18n/index.ts"
import { useAiStore } from "../store/context.tsx"
import { contextWindowFor, contextMetrics, formatTokenCount } from "../lib/context-metrics.ts"

const CATEGORIES = ["system", "instructions", "skills", "mcp", "tools", "agents", "messages"] as const
/** A category this version has no word for keeps the host's own name. */
const categoryLabel = (category: string): string => ((CATEGORIES as ReadonlyArray<string>).includes(category) ? t(`ai.context.category.${category}` as never) : category)

const RADIUS = 7
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function ContextGauge(props: { readonly alwaysShow?: boolean; readonly compact?: boolean; readonly onOpen?: () => void } = {}): JSX.Element {
  const ai = useAiStore()
  const metrics = createMemo(() => {
    const host = ai.hostContext()
    const window = contextWindowFor(ai.model(), ai.providers(), ai.models())
    const result = contextMetrics(ai.contextTokens(), window)
    return host?.compactAt !== undefined && host.model === ai.model()?.model && host.provider === ai.model()?.provider ? { ...result, compactAt: host.compactAt, level: ai.contextTokens() >= host.compactAt ? "full" as const : result.level } : result
  })
  const title = (): string => {
    const m = metrics()
    const parts = [t("ai.context.gauge.tokens", { tokens: m.tokens.toLocaleString() })]
    parts.push(
      m.percent !== undefined && m.limit !== undefined
        ? t("ai.context.gauge.percent", { percent: String(m.percent), limit: formatTokenCount(m.limit) })
        : t("ai.context.gauge.unknown")
    )
    if (m.level === "warn") parts.push(t("ai.context.gauge.warn"))
    if (m.level === "full") parts.push(t("ai.context.gauge.full"))
    const breakdown = ai.hostContext()?.breakdown
    if (breakdown !== undefined && breakdown.categories.length > 0) {
      const shown = breakdown.categories.map((c) => `${categoryLabel(c.category)} ${formatTokenCount(c.tokens)}`).join(", ")
      parts.push(t("ai.context.gauge.breakdown", { parts: shown }))
    }
    return parts.join(" · ")
  }
  /** One gauge, two lives: a readout by default, the context dialog's trigger when the shell wires one up. */
  const gauge = (): JSX.Element => (
    <>
      <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
        <circle cx="9" cy="9" r={RADIUS} fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="2" />
        <circle
          cx="9" cy="9" r={RADIUS} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-dasharray={String(CIRCUMFERENCE)}
          // Unknown usage shows the track only; a full ring would claim a full window.
          stroke-dashoffset={String(CIRCUMFERENCE * (1 - Math.min(Math.max(metrics().percent ?? 0, 0), 100) / 100))}
          transform="rotate(-90 9 9)"
        />
      </svg>
      <Show when={!props.compact && metrics().percent !== undefined && ai.contextTokens() > 0}><span>{metrics().percent}%</span></Show>
    </>
  )
  return (
    <Show when={props.alwaysShow === true || ai.contextTokens() > 0}>
      <Show
        when={props.onOpen}
        fallback={
          <span
            class="assistant-context-gauge"
            classList={{ "is-compact": props.compact === true }}
            data-testid={props.compact ? undefined : "ai-context-gauge"}
            data-level={metrics().level}
            role="img"
            aria-label={`${t("ai.context.gauge.label")}: ${title()}`}
            title={title()}
            // The breakdown costs a tokenizer pass in the host, so it is asked for when someone looks, not on every poll.
            onMouseEnter={() => void ai.loadContextBreakdown()}
            onFocus={() => void ai.loadContextBreakdown()}
            tabindex="0"
          >
            {gauge()}
          </span>
        }
      >
        {(open) => (
          <button
            type="button"
            class="assistant-context-gauge is-button"
            classList={{ "is-compact": props.compact === true }}
            data-testid={props.compact ? undefined : "ai-context-gauge"}
            data-level={metrics().level}
            aria-haspopup="dialog"
            aria-label={`${t("ai.context.gauge.label")}: ${title()} · ${t("ai.context.dialog.open")}`}
            title={title()}
            onMouseEnter={() => void ai.loadContextBreakdown()}
            onFocus={() => void ai.loadContextBreakdown()}
            onClick={() => open()()}
          >
            {gauge()}
          </button>
        )}
      </Show>
    </Show>
  )
}
