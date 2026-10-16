/**
 * The assistant's top bar (spec 06-desktop-ui.md §1, spec 08-ai.md §3).
 *
 * One stable row instead of the old three stacked rows: identity on the left
 * (live orb, title, the workspace the assistant is looking at), state and
 * actions on the right. Everything that is not needed at a glance — the
 * conversations, the tool catalogue, skills, statistics, context, providers,
 * refresh, clear — lives in a single overflow menu so the bar stays quiet
 * while the user works.
 *
 * The bar remains in the document flow so opening a panel or reading a long
 * answer never changes the user's wayfinding anchor.
 */
import { For, Show, createEffect, createMemo, createSignal, onCleanup, type JSX } from "solid-js"
import ChevronDown from "lucide-solid/icons/chevron-down"
import Ellipsis from "lucide-solid/icons/ellipsis"
import X from "lucide-solid/icons/x"
import Terminal from "lucide-solid/icons/terminal"
import { t } from "../../../i18n/index.ts"
import { useAiStore } from "../store/context.tsx"
import { ProviderBadge } from "./ProviderBadge.tsx"
import { ContextGauge } from "./ContextGauge.tsx"

/** One action: a row of the overflow menu, or an icon in the bar itself. */
export interface HeaderItem {
  readonly id: string
  readonly label: string
  readonly icon: JSX.Element
  /** A right-aligned count, for rows that have a collection behind them. */
  readonly count?: number
  readonly active?: boolean
  readonly disabled?: boolean
  readonly danger?: boolean
  /** Gives the action text and a stronger surface in the always-visible row. */
  readonly primary?: boolean
  /** Overrides the generated `ai-<id>-toggle` / `ai-more-<id>` test hook. */
  readonly testId?: string
  readonly run: () => void
}

export interface AssistantHeaderProps {
  /** The workspace line, already formatted by the caller. */
  readonly meta: string
  /** Always-on actions, right of the state read-out. */
  readonly quick: ReadonlyArray<HeaderItem>
  /** Everything else, behind the overflow menu. */
  readonly items: ReadonlyArray<HeaderItem>
  /** Controls the shell injects (open full screen, close). */
  readonly headerActions?: JSX.Element
  readonly onClose?: () => void
  /** Opens the context dialog from the header ring. */
  readonly onOpenContext?: () => void
}

export function AssistantHeader(props: AssistantHeaderProps): JSX.Element {
  const ai = useAiStore()
  const [menuOpen, setMenuOpen] = createSignal(false)
  const status = (): "idle" | "connecting" | "streaming" | "error" => ai.status()
  const closeMenu = (): void => { setMenuOpen(false) }
  const activeSession = createMemo(() => {
    const id = ai.sessionId()
    return id ? ai.sessions().find((s) => s.id === id) : undefined
  })
  const sessionsAction = createMemo(() => props.quick.find((item) => item.id === "sessions"))

  // The menu is a transient layer: a click anywhere else or an Escape closes it.
  createEffect(() => {
    if (!menuOpen()) return
    const away = (event: PointerEvent): void => {
      if (!(event.target as Element | null)?.closest?.(".assistant-bar-menu-root")) closeMenu()
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") closeMenu()
    }
    document.addEventListener("pointerdown", away, true)
    document.addEventListener("keydown", escape)
    onCleanup(() => {
      document.removeEventListener("pointerdown", away, true)
      document.removeEventListener("keydown", escape)
    })
  })

  return (
    <header
      class="assistant-bar"
      data-status={status()}
      aria-label={t("ai.title")}
      data-testid="ai-header"
    >
      <div class="assistant-bar-row">
        <div class="assistant-bar-identity">
          <span class="assistant-bar-mark" aria-hidden="true"><Terminal size={13} /></span>
          <button
            type="button"
            class="assistant-bar-heading assistant-bar-title-trigger"
            title={activeSession()?.title ?? props.meta}
            onClick={() => sessionsAction()?.run()}
          >
            <span class="assistant-bar-title-line">
              <h2 class="assistant-bar-title">{activeSession()?.title ?? t("ai.title")}</h2>
              <ChevronDown size={13} class="assistant-bar-title-chevron" aria-hidden="true" />
              <span class="assistant-orb" data-status={status()} aria-hidden="true">
                <span class="assistant-orb-core" />
              </span>
            </span>
            <Show when={props.meta.length > 0}>
              <span class="assistant-bar-meta" title={props.meta}>{props.meta}</span>
            </Show>
          </button>
        </div>

        <div class="assistant-bar-actions">
          {/* The bar reacts to state: the sentence appears only when it says something. */}
          <Show when={status() === "streaming" || status() === "connecting" || status() === "error"}>
            <span class="assistant-bar-state" data-status={status()}>
              {t(`ai.runtime.${status()}`)}
            </span>
          </Show>
          <ProviderBadge />
          <ContextGauge onOpen={props.onOpenContext} />
          <span role="status" class="sr-only" aria-live="polite">{t(`ai.runtime.${status()}`)}</span>

          {/* The two things worth a permanent slot: change conversation, inspect context. */}
          <For each={props.quick}>
            {(item) => (
              <button
                type="button"
                class="assistant-bar-button assistant-bar-quick"
                classList={{ "is-active": item.active === true, "is-primary": item.primary === true }}
                aria-label={item.label}
                title={item.label}
                aria-pressed={item.active === true}
                disabled={item.disabled}
                data-active={item.active ? "true" : undefined}
                data-testid={item.testId ?? `ai-${item.id}-toggle`}
                onClick={item.run}
              >
                {item.icon}
                <span class="assistant-bar-button-label">{item.label}</span>
                <Show when={item.count !== undefined && item.count > 0}>
                  <span class="assistant-bar-badge">{item.count}</span>
                </Show>
              </button>
            )}
          </For>

          <span class="assistant-bar-divider" aria-hidden="true" />

          <div class="assistant-bar-menu-root">
            <button
              type="button"
              class="assistant-bar-button"
              aria-label={t("ai.header.more")}
              title={t("ai.header.more")}
              aria-expanded={menuOpen()}
              aria-haspopup="menu"
              data-testid="ai-more-toggle"
              onClick={() => setMenuOpen(!menuOpen())}
            >
              <Ellipsis size={15} aria-hidden="true" />
            </button>
            <Show when={menuOpen()}>
              <div class="assistant-menu" role="menu" aria-label={t("ai.header.more")} data-testid="ai-more-menu">
                <For each={props.items}>
                  {(item) => (
                    <button
                      type="button"
                      role="menuitem"
                      class="assistant-menu-item"
                      classList={{ "is-active": item.active === true, "is-danger": item.danger === true }}
                      disabled={item.disabled}
                      data-active={item.active ? "true" : undefined}
                      data-testid={item.testId ?? `ai-more-${item.id}`}
                      onClick={() => {
                        closeMenu()
                        item.run()
                      }}
                    >
                      <span class="assistant-menu-icon">{item.icon}</span>
                      <span class="assistant-menu-label">{item.label}</span>
                      <Show when={item.count !== undefined}>
                        <span class="assistant-menu-count">{item.count}</span>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>

          {props.headerActions}
          <Show when={props.onClose}>
            <button
              type="button"
              class="assistant-bar-button"
              aria-label={t("ai.close")}
              title={t("ai.close")}
              onClick={() => props.onClose?.()}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </Show>
        </div>
      </div>
    </header>
  )
}
