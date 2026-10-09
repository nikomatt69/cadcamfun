/**
 * nikcli's context-usage indicator (`session-context-usage.tsx`): a small ring that fills as the
 * conversation approaches the model's context window, with the numbers on hover.
 */
import { Show, createMemo, type JSX } from "solid-js"
import { t } from "../i18n/index.ts"
import { useAiStore } from "./context.tsx"
import { contextWindowFor, contextMetrics, formatTokenCount } from "./context-metrics.ts"

const RADIUS = 7
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function ContextGauge(): JSX.Element {
  const ai = useAiStore()
  const metrics = createMemo(() => contextMetrics(ai.contextTokens(), contextWindowFor(ai.model(), ai.providers(), ai.models())))
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
    return parts.join(" · ")
  }
  return (
    <Show when={ai.contextTokens() > 0}>
      <span
        class="assistant-context-gauge"
        data-testid="ai-context-gauge"
        data-level={metrics().level}
        role="img"
        aria-label={`${t("ai.context.gauge.label")}: ${title()}`}
        title={title()}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <circle cx="9" cy="9" r={RADIUS} fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width="2" />
          <circle
            cx="9" cy="9" r={RADIUS} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-dasharray={String(CIRCUMFERENCE)}
            stroke-dashoffset={String(CIRCUMFERENCE * (1 - (metrics().percent ?? 0) / 100))}
            transform="rotate(-90 9 9)"
          />
        </svg>
        <Show when={metrics().percent !== undefined}><span>{metrics().percent}%</span></Show>
      </span>
    </Show>
  )
}
