import { Show, type JSX } from "solid-js"
import WorkspaceNavigation from "../../../shared/components/workspace-navigation.tsx"
import { SidebarTabs, SidebarCollapse } from "../../../shared/components/panel/sidebar.tsx"
import {
  Box, Circle, Layers, List, Wrench
} from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import ToolPanel from "./ToolPanel.tsx"
import LayerManager from "./LayerManager.tsx"
import CADElementExplorer from "./CADElementExplorer.tsx"

export type SidebarTab = "tools" | "layers" | "explorer"

interface EnhancedSidebarProps {
  readonly isOpen: boolean
  setIsOpen(isOpen: boolean): void
  readonly activeSidebarTab: SidebarTab
  setActiveSidebarTab(tab: SidebarTab): void
  onSelectComponent?: (component: unknown) => void
}

/** The editor's left sidebar: tools / explorer / layers tabs, quick navigation and the collapse toggle. */
export default function EnhancedSidebarCad(props: EnhancedSidebarProps): JSX.Element {

  /** A collapsed tool icon has no action of its own: it opens the sidebar on the Tools panel where the tool lives. */
  const openTools = () => {
    props.setActiveSidebarTab("tools")
    props.setIsOpen(true)
  }

  const collapsedContent = () => (
    <div class="sidebar-rail">
      <Show when={props.activeSidebarTab === "tools"}>
        <div class="space-y-4 w-full flex flex-col items-center">
          <div class="flex flex-col items-center">
            <button class="panel-icon-btn" title={t("cad.ribbon.line")} aria-label={t("cad.ribbon.line")} onClick={openTools}><div class="transform rotate-45"><Box size={20} /></div></button>
            <button class="panel-icon-btn" title={t("cad.ribbon.rectangle")} aria-label={t("cad.ribbon.rectangle")} onClick={openTools}><Box size={20} /></button>
            <button class="panel-icon-btn" title={t("cad.ribbon.circle")} aria-label={t("cad.ribbon.circle")} onClick={openTools}><Circle size={20} class="text-gray-600" /></button>
            <button class="panel-icon-btn" title={t("cad.ribbon.box")} aria-label={t("cad.ribbon.box")} onClick={openTools}><Box size={20} class="text-gray-600" /></button>
            <button class="panel-icon-btn" title={t("cad.ribbon.sphere")} aria-label={t("cad.ribbon.sphere")} onClick={openTools}><Circle size={20} class="text-gray-600" /></button>
          </div>
        </div>
      </Show>
      <Show when={props.activeSidebarTab === "layers"}>
        <button type="button" class="panel-icon-btn" title={t("cad.openSidebarLayers")} aria-label={t("cad.openSidebarLayers")} onClick={() => props.setIsOpen(true)}><Layers size={16} /></button>
      </Show>
      <Show when={props.activeSidebarTab === "explorer"}>
        <button type="button" class="panel-icon-btn" title={t("cad.openSidebarElements")} aria-label={t("cad.openSidebarElements")} onClick={() => props.setIsOpen(true)}><List size={16} /></button>
      </Show>
    </div>
  )

  return (
    <div
      class="cad-workspace__sidebar panel workspace-sidebar flex-shrink-0 h-full flex flex-col"
      data-open={props.isOpen}
    >
      <SidebarTabs class="cad-workspace__tabs" open={props.isOpen} active={props.activeSidebarTab} onSelect={(tab) => { props.setActiveSidebarTab(tab); if (!props.isOpen) props.setIsOpen(true) }}
        tabs={[
          { id: "tools", label: t("cad.tools"), title: t("cad.tools"), icon: (size) => <Wrench size={size} /> },
          { id: "explorer", label: t("cad.explorer"), title: t("cad.elementExplorer"), icon: (size) => <List size={size} /> },
          { id: "layers", label: t("cad.layers"), title: t("cad.layers"), icon: (size) => <Layers size={size} /> }
        ]} />

      <div class="sidebar-scroll min-h-0 flex-1 overflow-y-auto">
        <Show when={props.isOpen} fallback={collapsedContent()}>
          <div class="workstation-panel-content flex flex-col">
            <Show when={props.activeSidebarTab === "tools"}><ToolPanel /></Show>
            <Show when={props.activeSidebarTab === "layers"}><LayerManager /></Show>
            <Show when={props.activeSidebarTab === "explorer"}><CADElementExplorer /></Show>
          </div>
        </Show>
      </div>

      <WorkspaceNavigation isOpen={props.isOpen} />

      <SidebarCollapse open={props.isOpen} label={props.isOpen ? t("cad.collapseSidebar") : t("cad.expandSidebar")} onToggle={() => props.setIsOpen(!props.isOpen)} />
    </div>
  )
}
