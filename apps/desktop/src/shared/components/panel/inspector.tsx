import { Show, type JSX } from "solid-js"
import { SidebarCollapse, SidebarTabs } from "./sidebar.tsx"

/** The right side uses the same tabs, surfaces and disclosure vocabulary as the left side. */
export function WorkspaceInspector<T extends string>(props: {
  readonly class: string
  readonly tabs: ReadonlyArray<{ readonly id: T; readonly label: string; readonly title: string; readonly icon: (size: number) => JSX.Element }>
  readonly active: T
  readonly open: boolean
  readonly onSelect: (tab: T) => void
  readonly onToggle: () => void
  readonly collapseLabel: string
  readonly children: JSX.Element
}): JSX.Element {
  return <aside class={`${props.class} panel workspace-sidebar workspace-inspector`} data-open={props.open}>
    <SidebarTabs class="workspace-inspector__tabs" tabs={props.tabs} active={props.active} open={props.open}
      onSelect={(tab) => { props.onSelect(tab); if (!props.open) props.onToggle() }} />
    <Show when={props.open}><div class="sidebar-scroll workspace-inspector__content">{props.children}</div></Show>
    <SidebarCollapse side="right" open={props.open} label={props.collapseLabel} onToggle={props.onToggle} />
  </aside>
}
