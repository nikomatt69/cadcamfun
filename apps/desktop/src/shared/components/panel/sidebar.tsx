import { For, Show, createSignal, type Component, type JSX } from "solid-js"
import { ChevronLeft, ChevronRight } from "lucide-solid"
import { PanelSection } from "./ui.tsx"
import "../../../styles/sidebar.css"

/** Shared chrome keeps every CAD and CAM sidebar tab on the generator's panel tokens. */
export function SidebarTabs<T extends string>(props: {
  readonly tabs: ReadonlyArray<{ readonly id: T; readonly label: string; readonly title: string; readonly icon: (size: number) => JSX.Element }>
  readonly active: T
  readonly open: boolean
  readonly onSelect: (tab: T) => void
  readonly class: string
}): JSX.Element {
  return <div class={`${props.class} sidebar-tabs`} role="group">
    <For each={props.tabs}>{(tab) => <button type="button" class="sidebar-tabs__item"
      title={tab.title} aria-label={tab.label} aria-pressed={props.active === tab.id}
      onClick={() => props.onSelect(tab.id)}>
      {tab.icon(14)}<Show when={props.open}><span>{tab.label}</span></Show>
    </button>}</For>
  </div>
}

export function SidebarCollapse(props: { readonly open: boolean; readonly label: string; readonly onToggle: () => void }): JSX.Element {
  return <div class="sidebar-footer"><button type="button" class="panel-icon-btn" title={props.label} aria-label={props.label}
    aria-expanded={props.open} onClick={props.onToggle}>
    <Show when={props.open} fallback={<ChevronRight size={16} />}><ChevronLeft size={16} /></Show>
  </button></div>
}

/** Independent disclosure state for sidebar sections, using the same primitive as the generator. */
export function SidebarSection(props: {
  readonly id: string
  readonly title: string
  readonly icon: Component<{ size?: number; class?: string }>
  readonly summary?: string | undefined
  readonly testId?: string
  readonly children: JSX.Element
}): JSX.Element {
  const [open, setOpen] = createSignal(true)
  return <PanelSection id={props.id} title={props.title} icon={props.icon} open={open()} onToggle={() => setOpen(!open())}
    summary={props.summary} {...(props.testId ? { testId: props.testId } : {})}>{props.children}</PanelSection>
}
