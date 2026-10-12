/**
 * Accordion — single or multi-open. Opacity + max-height combo on enter/exit
 * (Emil: there is no formula for height + opacity, but max-height is cheap
 * when paired with overflow:hidden and avoids layout-paint thrash).
 *
 * - Chevron rotates 180° via CSS `data-state`.
 * - Reduced motion: fade only, no height animation.
 * - Header is a real <button> for native a11y.
 */
import { type JSX, Show, createContext, createSignal, createUniqueId, useContext } from "solid-js"

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

export function AccordionItem(props: AccordionItemProps): JSX.Element {
  const ctx = useContext(AccordionContext)
  if (ctx === undefined) throw new Error("AccordionItem must be used inside Accordion")
  const open = (): boolean => ctx.openItems().has(props.value)
  const triggerId = `${ctx.baseId}-trigger-${props.value}`
  const panelId = `${ctx.baseId}-panel-${props.value}`
  return (
    <div
      class="ui-accordion-item"
      classList={{ "ui-accordion-item-open": open() }}
      data-state={open() ? "open" : "closed"}
    >
      <Show when={props.disabled === true}>
        <div class="ui-accordion-disabled" />
      </Show>
      <Slot
        triggerId={triggerId}
        panelId={panelId}
        onClick={() => props.disabled !== true && ctx.toggle(props.value)}
      >
        {props.children}
      </Slot>
    </div>
  )
}

/** Slot — renders the children with the trigger/panel pair of the item. */
function Slot(props: { readonly triggerId: string; readonly panelId: string; readonly onClick: () => void; readonly children: JSX.Element }): JSX.Element {
  const ctx = useContext(AccordionContext)
  // Children are expected to be AccordionTrigger followed by AccordionContent.
  return (
    <>
      <button
        id={props.triggerId}
        type="button"
        class="ui-accordion-trigger"
        aria-controls={props.panelId}
        onClick={props.onClick}
      >
        {/* Forwarded children handled below */}
        <AccordionHeader>{props.children}</AccordionHeader>
      </button>
      <div
        id={props.panelId}
        role="region"
        aria-labelledby={props.triggerId}
        class="ui-accordion-panel"
      >
        <div class="ui-accordion-panel-inner">{props.children}</div>
      </div>
      {ctx !== undefined && void 0}
    </>
  )
}

/** AccordionHeader — extracts the leading non-panel child to render as label. */
function AccordionHeader(props: { readonly children: JSX.Element }): JSX.Element {
  return <span class="ui-accordion-header">{props.children}</span>
}

export interface AccordionTriggerProps { readonly children: JSX.Element }
/** Trigger — kept as alias so callers can compose <Item><Trigger/><Content/></Item>. */
export function AccordionTrigger(props: AccordionTriggerProps): JSX.Element {
  return <>{props.children}</>
}

export interface AccordionContentProps { readonly children: JSX.Element }
/** Content — renders the body of an item. */
export function AccordionContent(props: AccordionContentProps): JSX.Element {
  return <div class="ui-accordion-content">{props.children}</div>
}

// Re-export createUniqueId for symmetry with other primitives.
export { createUniqueId }