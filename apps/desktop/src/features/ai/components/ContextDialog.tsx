/**
 * The context dialog (spec 08-ai.md §3): one place that answers the three
 * questions the composer ring cannot — what the next call resends, how the host
 * keeps it inside the model's window, and which controls change it.
 *
 * It opens from every context affordance (the rings in the bar and in the
 * composer, the layers button, the provenance line) and is scoped to the
 * assistant panel: a modal over the conversation, not over the workspace.
 * The footer is the management bar: workspace-context switch, fresh
 * conversation, memory consolidation, and compaction.
 */
import { For, Show, createMemo, onCleanup, onMount, type JSX } from "solid-js"
import X from "lucide-solid/icons/x"
import RefreshCw from "lucide-solid/icons/refresh-cw"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { useDocumentStore } from "../../cad/store/documentStore.ts"
import { useAiStore } from "../store/context.tsx"
import { contextMetrics, contextWindowFor, formatTokenCount } from "../lib/context-metrics.ts"
import { ContextGauge } from "./ContextGauge.tsx"

const CATEGORIES = ["system", "instructions", "skills", "mcp", "tools", "agents", "messages"] as const
/** A category this version has no word for keeps the host's own name. */
const categoryLabel = (category: string): string =>
  (CATEGORIES as ReadonlyArray<string>).includes(category) ? t(`ai.context.category.${category}` as never) : category

/** The pill status each level borrows, so the chip matches the live ring. */
const levelStatus = (level: "ok" | "warn" | "full"): "completed" | "warn" | "error" =>
  level === "full" ? "error" : level === "warn" ? "warn" : "completed"

export function ContextDialog(props: { readonly onClose: () => void }): JSX.Element {
  const ai = useAiStore()
  const app = useApp()
  const drawing = useDocumentStore()
  let panel: HTMLDivElement | undefined
  let previousFocus: HTMLElement | undefined

  const running = (): boolean => ai.status() === "connecting" || ai.status() === "streaming"
  const host = () => ai.hostContext()
  const memory = () => host()?.memory
  const pendingTasks = (): number => ai.tasks().filter((task) => task.status === "queued" || task.status === "running").length

  const metrics = createMemo(() => {
    const window = contextWindowFor(ai.model(), ai.providers(), ai.models())
    const result = contextMetrics(ai.contextTokens(), window)
    const context = host()
    return context?.compactAt !== undefined && context.model === ai.model()?.model && context.provider === ai.model()?.provider
      ? { ...result, compactAt: context.compactAt, level: ai.contextTokens() >= context.compactAt ? "full" as const : result.level }
      : result
  })

  const categories = createMemo(() =>
    [...(host()?.breakdown?.categories ?? [])].sort((left, right) => right.tokens - left.tokens)
  )
  const breakdownTotal = (): number => host()?.breakdown?.estimatedTotal ?? 0
  const share = (tokens: number): number =>
    breakdownTotal() > 0 ? Math.max(2, Math.round((tokens / breakdownTotal()) * 100)) : 0

  const windowLine = (): string => {
    const m = metrics()
    return m.limit === undefined
      ? t("ai.context.dialog.windowUnknown", { used: formatTokenCount(m.tokens) })
      : t("ai.context.dialog.window", { used: formatTokenCount(m.tokens), total: formatTokenCount(m.limit) })
  }
  const modelLine = (): string => {
    const selected = ai.model()
    return selected === undefined
      ? t("ai.model.label")
      : t("ai.context.dialog.model", { provider: selected.provider, model: selected.model })
  }
  const workspaceLine = (): string => drawing.name ?? app.drawing()?.name ?? t("ai.header.noProject")
  const compactAt = (): number | undefined => host()?.compactAt ?? metrics().compactAt
  const responseBudget = (): number | undefined => host()?.requestOutput ?? host()?.maxOutput

  // Entering: ask the host for the composition, move focus inside, escape and
  // tab wrap like the shared modal, and give focus back to the trigger on close.
  onMount(() => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    void ai.loadContextBreakdown()
    queueMicrotask(() => {
      const target = panel?.querySelector<HTMLButtonElement>("button") ?? panel
      target?.focus()
    })
    const handler = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault()
        props.onClose()
        return
      }
      if (event.key === "Tab" && panel !== undefined) {
        const controls = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
          )
        ).filter((element) => !element.hidden)
        const first = controls[0]
        const last = controls.at(-1)
        if (first === undefined || last === undefined) {
          event.preventDefault()
          panel.focus()
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener("keydown", handler)
    onCleanup(() => {
      window.removeEventListener("keydown", handler)
      const restore = previousFocus
      previousFocus = undefined
      if (restore !== undefined && restore.isConnected) restore.focus()
    })
  })

  return (
    <div class="assistant-context-overlay" onClick={() => props.onClose()}>
      <div
        ref={(element) => { panel = element }}
        class="assistant-context-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("ai.context.title")}
        data-testid="ai-context-details"
        tabindex="-1"
        onClick={(event) => event.stopPropagation()}
      >
        <header class="assistant-context-dialog-head">
          <div class="assistant-context-dialog-title">
            <h3>{t("ai.context.title")}</h3>
            <p>{t("ai.context.dialog.lede")}</p>
          </div>
          <button type="button" class="assistant-icon-button" aria-label={t("ai.close")} title={t("ai.close")} onClick={() => props.onClose()}>
            <X size={14} aria-hidden="true" />
          </button>
        </header>

        <div class="assistant-context-dialog-body">
          <section class="assistant-context-section">
            <p class="assistant-section-label">{t("ai.context.dialog.usage")}</p>
            <div class="assistant-context-usage">
              <ContextGauge alwaysShow />
              <div class="assistant-context-usage-copy">
                <strong>{windowLine()}</strong>
                <span>{modelLine()}</span>
              </div>
              <span class="assistant-pill" data-status={levelStatus(metrics().level)}>
                {t(`ai.context.dialog.level.${metrics().level}` as never)}
              </span>
            </div>
            <div class="assistant-context-meter" data-level={metrics().level} data-unknown={metrics().percent === undefined ? "true" : undefined} aria-hidden="true">
              <span style={{ width: `${metrics().percent ?? 0}%` }} />
            </div>
            <dl class="assistant-context-facts">
              <Show when={compactAt()}>
                {(tokens) => (
                  <div>
                    <dt>{t("ai.context.dialog.compaction")}</dt>
                    <dd>{t("ai.context.dialog.compactionAt", { tokens: formatTokenCount(tokens()) })}</dd>
                  </div>
                )}
              </Show>
              <Show when={responseBudget()}>
                {(tokens) => (
                  <div>
                    <dt>{t("ai.context.dialog.responseBudget")}</dt>
                    <dd>{t("ai.context.dialog.responseBudgetValue", { tokens: formatTokenCount(tokens()) })}</dd>
                  </div>
                )}
              </Show>
              <Show when={host()?.auto !== undefined}>
                <div>
                  <dt>{t("ai.context.dialog.auto")}</dt>
                  <dd>{host()?.auto ? t("ai.context.dialog.on") : t("ai.context.dialog.off")}</dd>
                </div>
              </Show>
              <Show when={host()?.prune !== undefined}>
                <div>
                  <dt>{t("ai.context.dialog.prune")}</dt>
                  <dd>{host()?.prune ? t("ai.context.dialog.on") : t("ai.context.dialog.off")}</dd>
                </div>
              </Show>
              <Show when={memory()}>
                {(policy) => (
                  <div>
                    <dt>{t("ai.context.dialog.memory")}</dt>
                    <dd>
                      {policy().enabled
                        ? t("ai.context.dialog.memoryPolicy", { hours: policy().minHours, sessions: policy().minSessions })
                        : t("ai.context.dialog.memoryOff")}
                    </dd>
                  </div>
                )}
              </Show>
              <div>
                <dt>{t("ai.context.dialog.messages")}</dt>
                <dd>{t("ai.context.dialog.messagesValue", { tokens: formatTokenCount(ai.stats().totalInputTokens + ai.stats().totalOutputTokens), count: ai.messages().length })}</dd>
              </div>
              <div>
                <dt>{t("ai.context.dialog.workspace")}</dt>
                <dd title={workspaceLine()}>{workspaceLine()}</dd>
              </div>
            </dl>
          </section>

          <section class="assistant-context-section">
            <div class="assistant-context-section-head">
              <p class="assistant-section-label">{t("ai.context.dialog.composition")}</p>
              <span class="assistant-context-section-tools">
                <Show when={breakdownTotal() > 0}>
                  <span class="assistant-meta-text">≈ {formatTokenCount(breakdownTotal())} tok</span>
                </Show>
                <button
                  type="button"
                  class="assistant-link-btn"
                  disabled={ai.controlBusy()}
                  onClick={() => void ai.loadContextBreakdown()}
                >
                  <RefreshCw size={10} aria-hidden="true" />
                  {t("ai.context.dialog.refresh")}
                </button>
              </span>
            </div>
            <Show
              when={categories().length > 0}
              fallback={<p class="assistant-meta-text">{t("ai.context.dialog.compositionUnknown")}</p>}
            >
              <ul class="assistant-context-categories">
                <For each={categories()}>
                  {(entry) => (
                    <li>
                      <span class="assistant-context-category-label">{categoryLabel(entry.category)}</span>
                      <span class="assistant-context-category-bar" aria-hidden="true">
                        <span style={{ width: `${share(entry.tokens)}%` }} />
                      </span>
                      <span class="assistant-context-category-count">{formatTokenCount(entry.tokens)}</span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>
        </div>

        <footer class="assistant-context-dialog-foot">
          <Show when={pendingTasks() > 0}>
            <p class="assistant-meta-text" data-testid="ai-compact-hint">{t("ai.controls.compactStopsTasks", { count: pendingTasks() })}</p>
          </Show>
          <div class="assistant-context-dialog-actions">
            <button
              type="button"
              role="switch"
              aria-checked={ai.includeContext()}
              class="assistant-context-switch"
              onClick={() => ai.setIncludeContext((value) => !value)}
            >
              <span class="assistant-context-switch-track" aria-hidden="true"><span /></span>
              <span>{t("ai.context.dialog.include")}</span>
            </button>
            <div class="assistant-card-actions">
              <button
                type="button"
                class="assistant-btn assistant-btn-secondary"
                disabled={running()}
                onClick={() => {
                  ai.newSession()
                  props.onClose()
                }}
              >
                {t("ai.context.dialog.newSession")}
              </button>
              <button
                type="button"
                class="assistant-btn assistant-btn-secondary"
                disabled={running() || ai.controlBusy() || memory()?.enabled !== true}
                onClick={() => void ai.consolidateMemory()}
              >
                {t("ai.controls.learnMemory")}
              </button>
              <button
                type="button"
                class="assistant-btn assistant-btn-primary"
                data-testid="ai-compact"
                disabled={running() || ai.controlBusy() || !ai.sessionId()}
                onClick={() => void ai.compact()}
              >
                {t(ai.controlBusy() ? "ai.controls.compacting" : "ai.controls.compact")}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
