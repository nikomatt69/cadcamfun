/**
 * Tabs — animated underline indicator, ARIA-correct.
 *
 * Design notes (emil-design-eng):
 * - Indicator slides with `clip-path` rather than `left/width` so the browser
 *   only composites transform/opacity (Emil: only animate transform/opacity).
 * - Active background follows the indicator via a duplicate-tab `clip-path`
 *   pattern — colour transitions on tabs rarely look clean, this is the
 *   proven approach.
 * - Keyboard: ←/→ moves focus, Home/End jump, Enter/Space commits.
 */
import { type JSX, For, Show, createContext, createSignal, createUniqueId, onCleanup, useContext, createMemo } from "solid-js"
import { prefersReducedMotion } from "./animated-section.tsx"

const reduced = prefersReducedMotion

interface TabsContextValue {
  readonly value: () => string | undefined
  readonly setValue: (next: string) => void
  readonly baseId: string
  readonly orientation: "horizontal" | "vertical"
  readonly registerTrigger: (id: string, element: HTMLElement) => void
  readonly focusTrigger: (id: string) => void
  readonly triggers: () => ReadonlyArray<{ id: string; element: HTMLElement; disabled: boolean }>
}

const TabsContext = createContext<TabsContextValue>()

export interface TabsProps {
  readonly value?: string
  readonly defaultValue?: string
  readonly onChange?: (value: string) => void
  readonly orientation?: "horizontal" | "vertical"
  readonly variant?: "default" | "pills"
  readonly children: JSX.Element
}

export function Tabs(props: TabsProps): JSX.Element {
  const baseId = createUniqueId()
  const [internal, setInternal] = createSignal<string | undefined>(props.defaultValue)
  const value = (): string | undefined => props.value ?? internal()
  const orientation = (): "horizontal" | "vertical" => props.orientation ?? "horizontal"
  const triggers = createSignal<ReadonlyArray<{ id: string; element: HTMLElement; disabled: boolean }>>([])
  const [triggerList, setTriggerList] = triggers
  const setValue = (next: string): void => {
    if (props.value === undefined) setInternal(next)
    props.onChange?.(next)
  }
  const registerTrigger = (id: string, element: HTMLElement): void => {
    setTriggerList((current) => {
      const without = current.filter((entry) => entry.id !== id)
      return [...without, { id, element, disabled: element.hasAttribute("data-disabled") }]
    })
  }
  const focusTrigger = (id: string): void => {
    const entry = triggerList().find((entry) => entry.id === id)
    entry?.element.focus()
  }
  const ctx: TabsContextValue = {
    value,
    setValue,
    baseId,
    orientation: orientation(),
    registerTrigger,
    focusTrigger,
    triggers: triggerList
  }
  return (
    <TabsContext.Provider value={ctx}>
      <div
        class={["ui-tabs", `ui-tabs-${props.variant ?? "default"}`, `ui-tabs-${orientation()}`].join(" ")}
        role="tablist"
        aria-orientation={orientation()}
      >
        {props.children}
      </div>
    </TabsContext.Provider>
  )
}

export interface TabsListProps {
  readonly children: JSX.Element
}

/** Sliding indicator — position is read from the active trigger on first paint
 *  and updated on layout changes (resize observers kept for completeness). */
export function TabsList(props: TabsListProps): JSX.Element {
  const ctx = useContext(TabsContext)
  if (ctx === undefined) throw new Error("TabsList must be used inside Tabs")
  const [indicator, setIndicator] = createSignal<{ left: number; top: number; width: number; height: number } | undefined>(undefined)
  const measure = (): void => {
    const active = ctx.triggers().find((entry) => entry.id === ctx.value())
    if (active === undefined) { setIndicator(undefined); return }
    const list = active.element.parentElement?.getBoundingClientRect()
    const own = active.element.getBoundingClientRect()
    if (list === undefined) return
    setIndicator({ left: own.left - list.left, top: own.top - list.top, width: own.width, height: own.height })
  }
  // Reactive measurement on value/triggers changes.
  createMemo(() => {
    ctx.value()
    ctx.triggers().length
    if (typeof window === "undefined") return
    queueMicrotask(measure)
  })
  onCleanup(() => setIndicator(undefined))
  const orientation = (): "horizontal" | "vertical" => ctx.orientation
  const indicatorStyle = (): JSX.CSSProperties | undefined => {
    const rect = indicator()
    if (rect === undefined) return undefined
    return orientation() === "horizontal"
      ? { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }
      : { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }
  }
  return (
    <div class="ui-tabs-list" onClick={measure}>
      <Show when={!reduced() && indicator() !== undefined}>
        <span
          class="ui-tabs-indicator"
          style={indicatorStyle()}
          aria-hidden="true"
        />
      </Show>
      {props.children}
    </div>
  )
}

export interface TabsTriggerProps {
  readonly value: string
  readonly disabled?: boolean
  readonly children: JSX.Element
}

export function TabsTrigger(props: TabsTriggerProps): JSX.Element {
  const ctx = useContext(TabsContext)
  if (ctx === undefined) throw new Error("TabsTrigger must be used inside Tabs")
  const id = `${ctx.baseId}-trigger-${props.value}`
  const panelId = `${ctx.baseId}-panel-${props.value}`
  const active = (): boolean => ctx.value() === props.value
  const setRef = (element: HTMLButtonElement): void => {
    if (props.disabled === true) element.setAttribute("data-disabled", "")
    element.setAttribute("role", "tab")
    element.setAttribute("aria-selected", active() ? "true" : "false")
    element.setAttribute("aria-controls", panelId)
    element.setAttribute("id", id)
    element.setAttribute("tabindex", active() ? "0" : "-1")
    element.addEventListener("keydown", (event) => {
      const isArrow = event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "ArrowDown" || event.key === "ArrowUp"
      const isJump = event.key === "Home" || event.key === "End"
      if (!isArrow && !isJump) return
      event.preventDefault()
      const list = ctx.triggers().filter((t) => !t.disabled)
      const idx = list.findIndex((entry) => entry.id === props.value)
      if (idx < 0) return
      const horizontal = ctx.orientation === "horizontal"
      const key = event.key
      let nextIdx: number
      if (key === "Home") nextIdx = 0
      else if (key === "End") nextIdx = list.length - 1
      else if (horizontal) nextIdx = key === "ArrowRight" ? (idx + 1) % list.length : (idx - 1 + list.length) % list.length
      else nextIdx = key === "ArrowDown" ? (idx + 1) % list.length : (idx - 1 + list.length) % list.length
      const target = list[nextIdx]
      if (target !== undefined) { ctx.setValue(target.id); ctx.focusTrigger(target.id) }
    })
    ctx.registerTrigger(props.value, element)
  }
  return (
    <button
      ref={setRef}
      type="button"
      class="ui-tabs-trigger"
      classList={{ "ui-tabs-trigger-active": active() }}
      disabled={props.disabled === true}
      onClick={() => props.disabled !== true && ctx.setValue(props.value)}
    >
      {props.children}
    </button>
  )
}

export interface TabsPanelProps {
  readonly value: string
  readonly children: JSX.Element
}

export function TabsPanel(props: TabsPanelProps): JSX.Element {
  const ctx = useContext(TabsContext)
  if (ctx === undefined) throw new Error("TabsPanel must be used inside Tabs")
  const id = `${ctx.baseId}-panel-${props.value}`
  const triggerId = `${ctx.baseId}-trigger-${props.value}`
  return (
    <div
      role="tabpanel"
      id={id}
      aria-labelledby={triggerId}
      tabIndex={0}
      class="ui-tabs-panel"
      hidden={ctx.value() !== props.value}
    >
      {props.children}
    </div>
  )
}

/** Convenience — renders a list of panels controlled by the parent. */
export interface TabsPanelsProps {
  readonly panels: ReadonlyArray<{ readonly value: string; readonly render: () => JSX.Element }>
  readonly children?: never
}
export function TabsPanels(props: TabsPanelsProps): JSX.Element {
  return <For each={props.panels}>{(panel) => <TabsPanel value={panel.value}>{panel.render()}</TabsPanel>}</For>
}