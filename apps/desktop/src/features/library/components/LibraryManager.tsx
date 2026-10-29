import { For, Match, Show, Switch, createSignal, createUniqueId, type JSX } from "solid-js"
import { Layers, Package, Wrench, X } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import UnifiedLibrary from "./UnifiedLibrary.tsx"
import type { ComponentLibraryItem, LibrarySource, MaterialLibraryItem, ToolLibraryItem } from "../hooks/useUnifiedLibrary.ts"

type Tab = "components" | "materials" | "tools"
const TABS: ReadonlyArray<Tab> = ["components", "materials", "tools"]

export interface LibraryManagerProps {
  readonly onSelectComponent?: (component: ComponentLibraryItem) => void
  readonly onSelectMaterial?: (material: MaterialLibraryItem) => void
  readonly onSelectTool?: (tool: ToolLibraryItem) => void
  readonly onSaveComponent?: (component: ComponentLibraryItem) => void
  readonly onSaveMaterial?: (material: MaterialLibraryItem) => void
  readonly onSaveTool?: (tool: ToolLibraryItem) => void
  readonly showCloseButton?: boolean
  readonly onClose?: () => void
  readonly defaultTab?: Tab
  readonly defaultSource?: LibrarySource
}

const announce = (name: string, detail: unknown): void => {
  document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }))
}

export default function LibraryManager(props: LibraryManagerProps): JSX.Element {
  const [activeTab, setActiveTab] = createSignal<Tab>(props.defaultTab ?? t("library.tab.components"))
  const id = createUniqueId()
  const source = (): LibrarySource => props.defaultSource ?? "api"
  const selectComponent = (item: ComponentLibraryItem): void => { props.onSelectComponent?.(item); announce("libraryComponentSelected", item) }
  const selectMaterial = (item: MaterialLibraryItem): void => { props.onSelectMaterial?.(item); announce("libraryMaterialSelected", item) }
  const selectTool = (item: ToolLibraryItem): void => { props.onSelectTool?.(item); announce("libraryToolSelected", item) }

  return (
    <div class="library-manager" data-testid="library-manager">
      <div class="library-navigation">
        <div role="tablist" aria-label={t("library.categories")} class="library-kind-tabs" onKeyDown={(event) => {
          const current = TABS.indexOf(activeTab())
          const next = event.key === "ArrowRight" ? (current + 1) % TABS.length : event.key === "ArrowLeft" ? (current + TABS.length - 1) % TABS.length : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : -1
          if (next < 0) return
          event.preventDefault()
          setActiveTab(TABS[next]!)
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
        }}>
          <For each={TABS}>{(tab) => {
            const Icon = tab === "components" ? Package : tab === "materials" ? Layers : Wrench
            return <button type="button" role="tab" id={`${id}-${tab}`} aria-controls={`${id}-panel`} aria-selected={activeTab() === tab} tabIndex={activeTab() === tab ? 0 : -1} data-kind={tab} onClick={() => setActiveTab(tab)}><Icon size={16} aria-hidden="true" />{t(`library.tab.${tab}`)}</button>
          }}</For>
        </div>
        <Show when={props.showCloseButton && props.onClose}><button type="button" class="library-icon-button" aria-label={t("library.close")} onClick={() => props.onClose?.()}><X size={16} /></button></Show>
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${activeTab()}`} class="library-panel">
        <Switch>
          <Match when={activeTab() === "components"}><UnifiedLibrary<ComponentLibraryItem> entityType="components" onSelectItem={selectComponent} {...(props.onSaveComponent ? { onSaveItem: props.onSaveComponent } : {})} initialSource={source()} /></Match>
          <Match when={activeTab() === "materials"}><UnifiedLibrary<MaterialLibraryItem> entityType="materials" onSelectItem={selectMaterial} {...(props.onSaveMaterial ? { onSaveItem: props.onSaveMaterial } : {})} initialSource={source()} /></Match>
          <Match when={activeTab() === "tools"}><UnifiedLibrary<ToolLibraryItem> entityType="tools" onSelectItem={selectTool} {...(props.onSaveTool ? { onSaveItem: props.onSaveTool } : {})} initialSource={source()} /></Match>
        </Switch>
      </div>
    </div>
  )
}
