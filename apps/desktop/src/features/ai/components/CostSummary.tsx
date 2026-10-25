/**
 * What the conversation cost.
 *
 * The catalogue prices every model per million tokens, so the numbers below are
 * arithmetic on what the host reported. A model the catalogue does not price
 * shows a dash: a wrong number would be worse than none.
 */
import { Show, createMemo, type JSX } from "solid-js"
import { t } from "../../../i18n/index.ts"
import { conversationCost, costOf, formatCost, ratesFor } from "../lib/cost.ts"
import { useAiStore } from "../store/context.tsx"

export function CostSummary(): JSX.Element {
  const ai = useAiStore()
  const rates = createMemo(() => ratesFor(ai.model(), ai.providers()))
  const total = createMemo(() => conversationCost(ai.messages(), rates()))
  const lastTurn = createMemo(() => {
    const withUsage = [...ai.messages()].reverse().find((message) => message.usage !== undefined)
    return withUsage === undefined ? undefined : costOf(withUsage.usage, rates())
  })

  return (
    <div class="assistant-cost-summary" data-testid="ai-cost-summary">
      <p class="assistant-section-label">{t("ai.cost.title")}</p>
      <Show
        when={rates() !== undefined}
        fallback={<p class="assistant-meta-text">{t("ai.cost.unknown")}</p>}
      >
        <div class="assistant-stats-grid">
          <div class="assistant-stat-card">
            <p class="assistant-stat-value" data-testid="ai-cost-turn">{formatCost(lastTurn())}</p>
            <p class="assistant-stat-label">{t("ai.cost.turn")}</p>
          </div>
          <div class="assistant-stat-card">
            <p class="assistant-stat-value" data-testid="ai-cost-total">{formatCost(total())}</p>
            <p class="assistant-stat-label">{t("ai.cost.session")}</p>
          </div>
        </div>
      </Show>
    </div>
  )
}
