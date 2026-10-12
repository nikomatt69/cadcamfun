/**
 * Fusion 360 / Hypermill-style ribbon menu for the CAM workspace.
 *
 * One horizontal bar just under the toolbar with five tabs: Home / Setup /
 * Machining / Simulation / Post. Each tab surfaces a small icon grid of the
 * production-CAM features the rest of the page also exposes — clicking a
 * button routes the user to the right side (Generator, Cycles, Verify,
 * Post-processor tab, library modal, file actions), so every Fusion-class
 * strategy stays one click away even when the right inspector is collapsed.
 *
 * The ribbon is the visible proof that the app exposes the full Hypermill
 * class taxonomy: the user does not need to know that the surface strategies
 * are under "3D Surface" — they see them under "Machining → 3D".
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import {
  Box,
  Cog,
  Download,
  Folder,
  History,
  Layers,
  Library,
  ListChecks,
  PlayCircle,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  Wand2,
  Wrench
} from "lucide-solid"
import { useGeneratorStore } from "../store/generatorStore.ts"
import { paletteToCoreOperation } from "./generator/StrategyPalette.data.ts"
import { t, type Key } from "../../../i18n/index.ts"

export type RibbonTabId = "home" | "setup" | "machining" | "simulation" | "post" | "tools"

export interface RibbonAction {
  readonly id: string
  readonly labelKey: Key
  /** Compact inline SVG icon for the action. */
  readonly icon: (size: number, klass: string) => JSX.Element
  readonly onClick: () => void
  /** Optional accent color; used as the chip background. */
  readonly accent: "blue" | "purple" | "cyan" | "amber" | "orange" | "green" | "red" | "neutral"
  readonly active?: () => boolean
}

export interface RibbonGroup {
  readonly titleKey: Key
  readonly actions: ReadonlyArray<RibbonAction>
}

export interface CamRibbonProps {
  /** Receives a click on any home/setup tab; the page routes the action to the file dialogs. */
  readonly onSave?: () => void
  /** Receives a click on the import ribbon action. */
  readonly onImport?: () => void
  /** Receives a click on the "Library" / "Tools" action. */
  readonly onOpenLibrary?: () => void
  /** Receives a click on the "Costs" action. */
  readonly onOpenCosts?: () => void
  /** Receives the active tab request (the page already keeps one). */
  readonly onSelectActiveTab?: (tab: "preview" | "editor" | "toolpath" | "post") => void
  /** Receives a request to switch the right inspector to the named tab. */
  readonly onSelectRightTab?: (tab: "generator" | "cycles" | "verify") => void
  /** Receives a request to show a sidebar tab; workpiece and origin live in the machine tab. */
  readonly onSelectSidebarTab?: (tab: "explorer" | "settings" | "machine") => void
  /** Receives the post-processor type the user picked in the ribbon. */
  readonly onSelectPostProcessor?: (next: "fanuc" | "heidenhain" | "gcode") => void
  readonly postProcessor?: "fanuc" | "heidenhain" | "gcode"
}

const SVG = (path: string) => (size = 18, klass = ""): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" class={klass} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">{path}</svg>
)
const ICON_HOME = SVG('<rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />')
const ICON_OPEN = SVG('<path d="M5 4h6l2 2h6v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />')
const ICON_NEW = SVG('<rect x="4" y="6" width="16" height="14" rx="1.5" /><path d="M9 6V4h6v2" /><path d="M12 11v6 M9 14h6" />')

const chipClass = (accent: RibbonAction["accent"]): string => {
  switch (accent) {
    case "blue": return "border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/30"
    case "purple": return "border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/30"
    case "cyan": return "border-cyan-200 dark:border-cyan-800 hover:bg-cyan-50 dark:hover:bg-cyan-900/30"
    case "amber": return "border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/30"
    case "orange": return "border-orange-200 dark:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-900/30"
    case "green": return "border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
    case "red": return "border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/30"
    default: return "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
  }
}

const groupLabelClass: Readonly<Record<RibbonAction["accent"], string>> = {
  blue: "text-blue-700 dark:text-blue-300",
  purple: "text-purple-700 dark:text-purple-300",
  cyan: "text-cyan-700 dark:text-cyan-300",
  amber: "text-amber-700 dark:text-amber-300",
  orange: "text-orange-700 dark:text-orange-300",
  green: "text-emerald-700 dark:text-emerald-300",
  red: "text-red-700 dark:text-red-300",
  neutral: "text-gray-700 dark:text-gray-300"
}

export default function CamRibbon(props: CamRibbonProps): JSX.Element {
  const gen = useGeneratorStore()
  const [tab, setTab] = createSignal<RibbonTabId>("machining")

  /** Switch operation types from the ribbon; same mapping as the strategy palette. */
  const pickOperation = (paletteId: string): void => {
    const family = gen.settings.machineType === "lathe" ? "lathe" : gen.settings.machineType === "3dprinter" ? "3dprinter" : "mill"
    gen.updateSettings("operationType", paletteToCoreOperation(family, paletteId) as never)
    props.onSelectRightTab?.("generator")
  }

  const TABS: ReadonlyArray<{ id: RibbonTabId; labelKey: Key; icon: (size: number) => JSX.Element }> = [
    { id: "home", labelKey: "cam.ribbon.home", icon: (size) => <Library size={size} /> },
    { id: "setup", labelKey: "cam.ribbon.setup", icon: (size) => <Folder size={size} /> },
    { id: "machining", labelKey: "cam.ribbon.machining", icon: (size) => <Wrench size={size} /> },
    { id: "simulation", labelKey: "cam.ribbon.simulation", icon: (size) => <PlayCircle size={size} /> },
    { id: "post", labelKey: "cam.ribbon.post", icon: (size) => <Settings2 size={size} /> },
    { id: "tools", labelKey: "cam.ribbon.tools", icon: (size) => <Layers size={size} /> }
  ]

  const groups = (): ReadonlyArray<RibbonGroup> => {
    switch (tab()) {
      case "home":
        return [
          {
            titleKey: "cam.ribbon.group.file",
            actions: [
              { id: "save", labelKey: "cam.ribbon.save", icon: (s, k) => <Save size={s} class={k} />, accent: "blue", onClick: () => props.onSave?.() },
              { id: "import", labelKey: "cam.ribbon.import", icon: (s, k) => <Upload size={s} class={k} />, accent: "blue", onClick: () => props.onImport?.() },
              { id: "costs", labelKey: "cam.ribbon.costs", icon: (s, k) => <History size={s} class={k} />, accent: "orange", onClick: () => props.onOpenCosts?.() }
            ]
          },
          {
            titleKey: "cam.ribbon.group.workbench",
            actions: [
              { id: "preview", labelKey: "cam.ribbon.preview", icon: (s, k) => <Box size={s} class={k} />, accent: "purple", onClick: () => props.onSelectActiveTab?.("preview") },
              { id: "editor", labelKey: "cam.ribbon.editor", icon: (s, k) => <Cog size={s} class={k} />, accent: "purple", onClick: () => props.onSelectActiveTab?.("editor") },
              { id: "toolpath", labelKey: "cam.ribbon.toolpath", icon: (s, k) => <Wand2 size={s} class={k} />, accent: "purple", onClick: () => props.onSelectActiveTab?.("toolpath") }
            ]
          }
        ]
      case "setup":
        return [
          {
            titleKey: "cam.ribbon.group.workpiece",
            actions: [
              { id: "open-workpiece", labelKey: "cam.ribbon.workpiece", icon: (s, k) => <Folder size={s} class={k} />, accent: "blue", onClick: () => props.onSelectSidebarTab?.("machine") }
            ]
          },
          {
            titleKey: "cam.ribbon.group.origin",
            actions: [
              { id: "open-origin", labelKey: "cam.ribbon.origin", icon: (s, k) => <Library size={s} class={k} />, accent: "blue", onClick: () => props.onSelectSidebarTab?.("machine") }
            ]
          }
        ]
      case "machining":
        return [
          {
            titleKey: "cam.ribbon.group.profiling",
            actions: [
              { id: "strategy-contour", labelKey: "cam.strategy.contour", icon: (s, k) => <Wand2 size={s} class={k} />, accent: "blue", onClick: () => pickOperation("contour") },
              { id: "strategy-pocket", labelKey: "cam.strategy.pocket", icon: (s, k) => <Box size={s} class={k} />, accent: "blue", onClick: () => pickOperation("pocket") },
              { id: "strategy-face", labelKey: "cam.strategy.face", icon: (s, k) => <Library size={s} class={k} />, accent: "blue", onClick: () => pickOperation("face") },
              { id: "strategy-drill", labelKey: "cam.strategy.drill", icon: (s, k) => <Cog size={s} class={k} />, accent: "cyan", onClick: () => pickOperation("drill") },
              { id: "strategy-thread", labelKey: "cam.strategy.threadMilling", icon: (s, k) => <Sparkles size={s} class={k} />, accent: "blue", onClick: () => pickOperation("thread-milling") }
            ]
          },
          {
            titleKey: "cam.ribbon.group.surface",
            actions: [
              { id: "strategy-zlevel", labelKey: "cam.strategy.zLevelRough", icon: (s, k) => <Layers size={s} class={k} />, accent: "purple", onClick: () => pickOperation("3d_surface") },
              { id: "strategy-parallel", labelKey: "cam.strategy.parallel", icon: (s, k) => <Library size={s} class={k} />, accent: "purple", onClick: () => pickOperation("3d_surface_parallel") },
              { id: "strategy-waterline", labelKey: "cam.strategy.waterline", icon: (s, k) => <Wand2 size={s} class={k} />, accent: "purple", onClick: () => pickOperation("3d_surface_waterline") },
              { id: "strategy-adaptive", labelKey: "cam.strategy.adaptive", icon: (s, k) => <Cog size={s} class={k} />, accent: "purple", onClick: () => pickOperation("3d_surface_adaptive") },
              { id: "strategy-rest", labelKey: "cam.strategy.rest", icon: (s, k) => <Cog size={s} class={k} />, accent: "purple", onClick: () => pickOperation("3d_surface_rest") }
            ]
          },
          {
            titleKey: "cam.ribbon.group.multi",
            actions: [
              { id: "strategy-32", labelKey: "cam.strategy.index32", icon: (s, k) => <Box size={s} class={k} />, accent: "amber", onClick: () => pickOperation("index_3_2") },
              { id: "strategy-4", labelKey: "cam.strategy.axis4", icon: (s, k) => <Layers size={s} class={k} />, accent: "amber", onClick: () => pickOperation("axis_4") },
              { id: "strategy-5swarf", labelKey: "cam.strategy.axis5Swarf", icon: (s, k) => <Wand2 size={s} class={k} />, accent: "amber", onClick: () => pickOperation("axis_5_swarf") },
              { id: "strategy-5sim", labelKey: "cam.strategy.axis5Sim", icon: (s, k) => <Sparkles size={s} class={k} />, accent: "amber", onClick: () => pickOperation("axis_5_sim") }
            ]
          },
          {
            titleKey: "cam.ribbon.group.lathe",
            actions: [
              { id: "strategy-facing", labelKey: "cam.strategy.facing", icon: (s, k) => <Box size={s} class={k} />, accent: "orange", onClick: () => pickOperation("facing") },
              { id: "strategy-turning", labelKey: "cam.strategy.turningOD", icon: (s, k) => <Wand2 size={s} class={k} />, accent: "orange", onClick: () => pickOperation("turning") },
              { id: "strategy-boring", labelKey: "cam.strategy.turningID", icon: (s, k) => <Cog size={s} class={k} />, accent: "orange", onClick: () => pickOperation("boring") },
              { id: "strategy-threading", labelKey: "cam.strategy.threadingOD", icon: (s, k) => <Sparkles size={s} class={k} />, accent: "orange", onClick: () => pickOperation("threading") },
              { id: "strategy-parting", labelKey: "cam.strategy.parting", icon: (s, k) => <Layers size={s} class={k} />, accent: "orange", onClick: () => pickOperation("parting") }
            ]
          }
        ]
      case "simulation":
        return [
          {
            titleKey: "cam.ribbon.group.verify",
            actions: [
              { id: "open-cycles", labelKey: "cam.ribbon.cycles", icon: (s, k) => <ListChecks size={s} class={k} />, accent: "cyan", onClick: () => props.onSelectRightTab?.("cycles") },
              { id: "open-verify", labelKey: "cam.ribbon.verify", icon: (s, k) => <ShieldCheck size={s} class={k} />, accent: "green", onClick: () => props.onSelectRightTab?.("verify") },
              { id: "open-preview", labelKey: "cam.ribbon.preview", icon: (s, k) => <PlayCircle size={s} class={k} />, accent: "green", onClick: () => props.onSelectActiveTab?.("preview") }
            ]
          }
        ]
      case "post":
        return [
          {
            titleKey: "cam.ribbon.group.post",
            actions: [
              { id: "post-fanuc", labelKey: "cam.ribbon.fanuc", icon: (s, k) => <Cog size={s} class={k} />, accent: "blue", active: () => props.postProcessor === "fanuc", onClick: () => props.onSelectPostProcessor?.("fanuc") },
              { id: "post-heidenhain", labelKey: "cam.ribbon.heidenhain", icon: (s, k) => <Sparkles size={s} class={k} />, accent: "purple", active: () => props.postProcessor === "heidenhain", onClick: () => props.onSelectPostProcessor?.("heidenhain") },
              { id: "post-gcode", labelKey: "cam.ribbon.generic", icon: (s, k) => <Library size={s} class={k} />, accent: "neutral", active: () => props.postProcessor === "gcode", onClick: () => props.onSelectPostProcessor?.("gcode") },
              { id: "open-post-tab", labelKey: "cam.ribbon.openPost", icon: (s, k) => <Download size={s} class={k} />, accent: "neutral", onClick: () => props.onSelectActiveTab?.("post") }
            ]
          }
        ]
      case "tools":
        return [
          {
            titleKey: "cam.ribbon.group.libraries",
            actions: [
              { id: "open-library", labelKey: "cam.ribbon.toolLibrary", icon: (s, k) => <Layers size={s} class={k} />, accent: "blue", onClick: () => props.onOpenLibrary?.() },
              { id: "open-materials", labelKey: "cam.ribbon.materials", icon: (s, k) => <Library size={s} class={k} />, accent: "amber", onClick: () => props.onOpenLibrary?.() }
            ]
          }
        ]
    }
  }

  return (
    <Motion.div
      class="cam-ribbon flex flex-col w-full"
      data-testid="cam-ribbon"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div class="flex w-full items-stretch border-b border-[color:var(--workspace-border)]">
        <For each={TABS}>
          {(entry) => (
            <button
              type="button"
              class={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-r border-[color:var(--workspace-border)] transition-colors ${
                tab() === entry.id
                  ? "bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-b-2 border-b-blue-500"
                  : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
              onClick={() => setTab(entry.id)}
              aria-pressed={tab() === entry.id}
            >
              {entry.icon(14)}
              {t(entry.labelKey)}
            </button>
          )}
        </For>
      </div>

      <div class="flex w-full items-stretch overflow-x-auto" data-testid={`cam-ribbon-${tab()}`}>
        <For each={groups()}>
          {(group, groupIndex) => (
            <div class={`flex flex-col px-[10px] pt-[5px] pb-[6px] ${groupIndex() < groups().length - 1 ? "border-r border-[color:var(--workspace-border)]" : ""}`}>
              <div class={`text-[10px] leading-[12px] font-semibold uppercase tracking-[.035em] mb-1 ${groupLabelClass[group.actions[0]!.accent]}`}>
                {t(group.titleKey)}
              </div>
              <div class="flex flex-wrap gap-1">
                <For each={group.actions}>
                  {(action) => {
                    const active = action.active?.() ?? false
                    return (
                      <button
                        type="button"
                        data-ribbon-action={action.id}
                        class={`flex items-center gap-[5px] min-h-[26px] px-[7px] py-[3px] rounded-[5px] text-[11px] leading-[18px] font-medium border transition-colors ${chipClass(action.accent)} ${active ? "ring-2 ring-blue-300 dark:ring-blue-700 bg-blue-50 dark:bg-blue-900/30" : "bg-[var(--workspace-panel)]"}`}
                        onClick={action.onClick}
                        title={t(action.labelKey)}
                        aria-pressed={active}
                      >
                        {action.icon(14, active ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300")}
                        <span class="whitespace-nowrap">{t(action.labelKey)}</span>
                      </button>
                    )
                  }}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </Motion.div>
  )
}
