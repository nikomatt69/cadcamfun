/**
 * Accordion — single or multi-open. Opacity + max-height combo on enter/exit
 * (Emil: there is no formula for height + opacity, but max-height is cheap
 * when paired with overflow:hidden and avoids layout-paint thrash).
 *
 * - Chevron rotates 180° via CSS `data-state`.
 * - Reduced motion: fade only, no height animation.
 * - Header is a real <button> for native a11y.
 */
import { type JSX, createContext, createSignal, createUniqueId, useContext } from "solid-js"

interface AccordionContextValue {
  readonly openItems: () => ReadonlySet<string>
  readonly toggle: (value: string) => void
  readonly baseId: string
  readonly collapsible: boolean
}

const AccordionContext = createContext<AccordionContextValue>()

export interface AccordionProps {
  readonly type?: "single" | "multiple"
  readonly defaultValue?: string | ReadonlyArray<string>
  readonly value?: string | ReadonlyArray<string>
  readonly onChange?: (next: string | ReadonlyArray<string>) => void
  readonly children: JSX.Element
}

const asArray = (value: string | ReadonlyArray<string> | undefined): ReadonlyArray<string> =>
  value === undefined ? [] : typeof value === "string" ? [value] : [...value]

export function Accordion(props: AccordionProps): JSX.Element {
  const baseId = createUniqueId()
  const collapsible = (): boolean => props.type !== "single"
  const initial = (): ReadonlyArray<string> => asArray(props.value ?? props.defaultValue)
  const [internal, setInternal] = createSignal<ReadonlyArray<string>>(initial())
  const openItems = (): ReadonlySet<string> => new Set(props.value !== undefined ? asArray(props.value) : internal())
  const toggle = (value: string): void => {
    const current = openItems()
    let next: ReadonlyArray<string>
    if (collapsible()) {
      next = current.has(value) ? [...current].filter((entry) => entry !== value) : [...current, value]
    } else {
      next = current.has(value) ? [] : [value]
    }
    if (props.value === undefined) setInternal(next)
    props.onChange?.(collapsible() ? next : (next[0] ?? ""))
  }
  const ctx: AccordionContextValue = { openItems, toggle, baseId, collapsible: collapsible() }
  return (
    <AccordionContext.Provider value={ctx}>
      <div class="ui-accordion">{props.children}</div>
    </AccordionContext.Provider>
  )
}

export interface AccordionItemProps {
  readonly value: string
  readonly disabled?: boolean
  readonly children: JSX.Element
}

interface AccordionItemContextValue {
  readonly open: () => boolean
  readonly disabled: () => boolean
  readonly toggle: () => void
  readonly triggerId: string
  readonly panelId: string
}

const AccordionItemContext = createContext<AccordionItemContextValue>()

export function AccordionItem(props: AccordionItemProps): JSX.Element {
  const ctx = useContext(AccordionContext)
  if (ctx === undefined) throw new Error("AccordionItem must be used inside Accordion")
  const open = (): boolean => ctx.openItems().has(props.value)
  const triggerId = `${ctx.baseId}-trigger-${props.value}`
  const panelId = `${ctx.baseId}-panel-${props.value}`
  const item: AccordionItemContextValue = {
    open,
    disabled: () => props.disabled === true,
    toggle: () => { if (props.disabled !== true) ctx.toggle(props.value) },
    triggerId,
    panelId
  }
  return (
    <AccordionItemContext.Provider value={item}>
    <div
      class="ui-accordion-item"
      classList={{ "ui-accordion-item-open": open() }}
      data-state={open() ? "open" : "closed"}
    >
      {props.children}
    </div>
    </AccordionItemContext.Provider>
  )
}

export interface AccordionTriggerProps { readonly children: JSX.Element }
export function AccordionTrigger(props: AccordionTriggerProps): JSX.Element {
  const item = useContext(AccordionItemContext)
  if (item === undefined) throw new Error("AccordionTrigger must be used inside AccordionItem")
  return <button id={item.triggerId} type="button" class="ui-accordion-trigger" aria-controls={item.panelId} aria-expanded={item.open()} disabled={item.disabled()} onClick={item.toggle}>
    <span class="ui-accordion-header">{props.children}</span>
  </button>
}

export interface AccordionContentProps { readonly children: JSX.Element }
export function AccordionContent(props: AccordionContentProps): JSX.Element {
  const item = useContext(AccordionItemContext)
  if (item === undefined) throw new Error("AccordionContent must be used inside AccordionItem")
  return <div id={item.panelId} role="region" aria-labelledby={item.triggerId} class="ui-accordion-panel" hidden={!item.open()}>
    <div class="ui-accordion-panel-inner"><div class="ui-accordion-content">{props.children}</div></div>
  </div>
}

// Re-export createUniqueId for symmetry with other primitives.
export { createUniqueId }
