/**
 * Pieces of the model browser shared by the CAD and CAM sidebars: the command bar, the grouped sections,
 * the per-row controls, the rename-in-place name and the Document / Origin block. They render what
 * `createBrowser()` exposes and own no rules of their own.
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import {
  ChevronDown, ChevronRight, Copy, Crosshair, Eye, EyeOff, FolderPlus, Grid3x3, Layers, Lock, Maximize, Ruler, Scan, Sparkles, Trash2, Unlock, Ungroup, Plus
} from "lucide-solid"
import { useCADStore } from "../../store/cadStore.ts"
import { useElementsStore } from "../../store/elementsStore.ts"
import { useLayerStore } from "../../store/layerStore.ts"
import { useSelectionStore } from "../../store/selectorStore.ts"
import { partition, type BrowserItem, type GroupMode } from "../../lib/browser.ts"
import { selectionPrompt } from "../../../ai/lib/ask.ts"
import { useAskAi } from "../../../ai/hooks/use-ask-ai.ts"
import { TOLERANCE_PRESETS, isTolerance } from "@cadcamfun/core"
import { setDisplayUnits, setDocumentTolerance } from "../../../../shared/state/document-settings.ts"
import { useApp } from "../../../../shared/state/context.ts"
import { DISPLAY_UNITS, UNIT_TABLE, formatLength, fromDisplay, isDisplayUnits, toDisplay } from "../../../../viewport/units.ts"
import { t, type Key } from "../../../../i18n/index.ts"
import type { Browser } from "./browserState.ts"

const ICON = "panel-icon-btn sidebar-browser-action"
const MINI = "panel-icon-btn sidebar-row-action"

const MODES: ReadonlyArray<{ readonly id: GroupMode; readonly label: Key }> = [
  { id: "kind", label: "browser.mode.kind" },
  { id: "layer", label: "browser.mode.layer" },
  { id: "flat", label: "browser.mode.flat" }
]

/** Command bar of the browser: the same functions in the CAD and the CAM sidebar. */
export function BrowserToolbar(props: { readonly browser: Browser }): JSX.Element {
  const selection = useSelectionStore()
  const layers = useLayerStore()
  const b = props.browser
  const elements = useElementsStore()
  const ask = useAskAi()
  const count = (): number => selection.selectedElementIds.length
  const selected = () => elements.elements.filter((element) => selection.selectedElementIds.includes(element.id))
  return (
    <div class="workstation-browser-toolbar border-b border-gray-200 dark:border-gray-700 space-y-2" data-testid="browser-toolbar">
      <div class="flex items-center justify-between gap-2">
        <select
          class="text-xs p-1 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 flex-1"
          aria-label={t("browser.groupElements")}
          value={b.mode()}
          onChange={(event) => b.setMode(event.currentTarget.value as GroupMode)}
        >
          <For each={MODES}>{(mode) => <option value={mode.id}>{t(mode.label)}</option>}</For>
        </select>
        <Show when={b.mode() === "layer"}>
          <button class={ICON} title={t("browser.newLayer")} aria-label={t("browser.newLayer")} onClick={b.addLayer}><Plus size={14} /></button>
        </Show>
      </div>
      <div class="flex flex-wrap gap-1">
        <button class={ICON} title={t("browser.showAll")} aria-label={t("browser.showAll")} disabled={!b.hasHidden()} onClick={b.showEverything}><Eye size={14} /></button>
        <button class={ICON} title={t("browser.isolate")} aria-label={t("browser.isolate")} disabled={count() === 0} onClick={b.isolateSelection}><Scan size={14} /></button>
        <button class={ICON} title={t("browser.lockToggle")} aria-label={t("browser.lockSelection")} disabled={count() === 0} onClick={b.lockSelection}><Lock size={14} /></button>
        <button class={ICON} title={t("browser.groupSelection")} aria-label={t("browser.groupSelection")} disabled={count() < 2} onClick={b.groupSelection}><FolderPlus size={14} /></button>
        <button class={ICON} title={t("browser.askAiTitle")} aria-label={t("browser.askAi")} disabled={count() === 0} onClick={() => ask(selectionPrompt(selected()))}><Sparkles size={14} /></button>
        <button class={ICON} title={t("browser.ungroup")} aria-label={t("browser.ungroup")} disabled={b.selectedGroups().length === 0} onClick={b.ungroupSelection}><Ungroup size={14} /></button>
        <select
          class="text-xs p-1 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 disabled:opacity-40"
          aria-label={t("browser.moveToLayerLabel")}
          disabled={count() === 0}
          value=""
          onChange={(event) => { if (event.currentTarget.value) b.moveSelectionToLayer(event.currentTarget.value); event.currentTarget.value = "" }}
        >
          <option value="">{t("browser.moveToLayer")}</option>
          <For each={layers.layers}>{(layer) => <option value={layer.id}>{layer.name}</option>}</For>
        </select>
      </div>
    </div>
  )
}

/** Name of a row; double-click (or F2 on the row) edits it in place, Enter commits, Escape cancels. */
export function RenameName(props: { readonly id: string; readonly name: string; readonly browser: Browser }): JSX.Element {
  const b = props.browser
  return (
    <Show
      when={b.renaming() === props.id}
      fallback={
        <span class="flex-1 min-w-0 truncate font-medium text-gray-900 dark:text-gray-100" onDblClick={(event) => { event.stopPropagation(); b.startRename(props.id) }} title={t("browser.renameHint")}>
          {props.name}
        </span>
      }
    >
      <input
        class="flex-1 min-w-0 text-sm px-1 border rounded bg-white dark:bg-gray-700 dark:border-gray-600"
        value={props.name}
        aria-label={t("browser.elementName")}
        ref={(input) => queueMicrotask(() => { input.focus(); input.select() })}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === "Enter") b.rename(props.id, event.currentTarget.value)
          else if (event.key === "Escape") b.startRename(null)
        }}
        onBlur={(event) => { if (b.renaming() === props.id) b.rename(props.id, event.currentTarget.value) }}
      />
    </Show>
  )
}

/** Eye, lock, duplicate and delete of one row. The lock stays visible once set, like a Fusion browser. */
export function RowActions(props: { readonly id: string; readonly visible: boolean; readonly locked: boolean; readonly browser: Browser }): JSX.Element {
  const b = props.browser
  const stop = (action: () => void) => (event: MouseEvent) => { event.stopPropagation(); action() }
  return (
    <div class="workstation-row-actions flex items-center space-x-0.5 ml-1" data-testid={`row-actions-${props.id}`}>
      <button class={`${MINI} ${props.locked ? "" : "opacity-0 group-hover:opacity-100"}`} title={props.locked ? t("browser.unlock") : t("browser.lock")} aria-label={props.locked ? t("browser.unlock") : t("browser.lock")} onClick={stop(() => b.toggleLocked(props.id))}>
        <Show when={props.locked} fallback={<Unlock size={12} />}><Lock size={12} class="text-orange-500" /></Show>
      </button>
      <button class={`${MINI} ${props.visible ? "opacity-0 group-hover:opacity-100" : ""}`} title={props.visible ? t("browser.hide") : t("browser.show")} aria-label={props.visible ? t("browser.hide") : t("browser.show")} onClick={stop(() => b.toggleVisible(props.id))}>
        <Show when={props.visible} fallback={<EyeOff size={12} class="text-gray-400" />}><Eye size={12} /></Show>
      </button>
      <button class={`${MINI} opacity-0 group-hover:opacity-100`} title={t("browser.duplicate")} aria-label={t("browser.duplicate")} onClick={stop(() => b.duplicate(props.id))}><Copy size={12} /></button>
      <button class={`${MINI} opacity-0 group-hover:opacity-100 text-red-500`} title={t("browser.delete")} aria-label={t("browser.delete")} onClick={stop(() => b.remove(props.id))}><Trash2 size={12} /></button>
    </div>
  )
}

interface SectionsProps<T extends BrowserItem> {
  readonly roots: ReadonlyArray<T>
  readonly browser: Browser
  readonly renderNode: (node: T) => JSX.Element
  readonly emptyText?: string
}

/** Root nodes split into Bodies / Sketches / Components, layers, or one flat list, each section collapsible with bulk eye and lock. */
export function BrowserSections<T extends BrowserItem>(props: SectionsProps<T>): JSX.Element {
  const layers = useLayerStore()
  const elements = useElementsStore()
  const b = props.browser
  const sections = createMemo(() => partition(props.roots, b.mode(), layers.layers))
  const layerOf = (id: string) => layers.layers.find((layer) => layer.id === id)
  const flagOf = (section: { readonly id: string; readonly items: ReadonlyArray<{ readonly id: string }> }, flag: "visible" | "locked"): boolean => {
    const layer = layerOf(section.id)
    if (layer !== undefined) return flag === "visible" ? layer.visible : layer.locked
    const items = section.items.map((item) => elements.elements.find((element) => element.id === item.id))
    return items.length > 0 && items.every((element) => flag === "visible" ? element?.visible !== false : element?.locked === true)
  }
  return (
    <Show when={props.roots.length > 0 || b.mode() === "layer"} fallback={<p class="p-4 text-xs text-center text-gray-500 dark:text-gray-400">{props.emptyText ?? t("browser.empty")}</p>}>
      <For each={sections()}>
        {(section) => {
          const layer = () => layerOf(section.id)
          return (
            <div data-testid={`browser-section-${section.id}`}>
              <Show when={b.mode() !== "flat"}>
                <div class="group flex items-center px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border-y border-gray-200 dark:border-gray-700 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                  <button class={MINI} aria-label={t("browser.toggleSection", { name: section.label })} onClick={() => b.toggleSection(section.id)}>
                    <Show when={b.isSectionOpen(section.id)} fallback={<ChevronRight size={14} />}><ChevronDown size={14} /></Show>
                  </button>
                  <Show when={layer()}>{(l) => <span class="w-2.5 h-2.5 rounded-full mr-2" style={{ "background-color": l().color }} />}</Show>
                  <span class="flex-1 truncate">{section.label}</span>
                  <span class="mr-2 px-1.5 rounded-full bg-gray-200 dark:bg-gray-700 text-[10px]">{section.items.length}</span>
                  <Show when={layer()}>
                    {(l) => (
                      <>
                        <button class={`${MINI} normal-case`} title={t("browser.makeActive")} aria-label={t("browser.activate", { name: section.label })} onClick={() => layers.setActiveLayer(l().id)}>
                          <Crosshair size={12} class={layers.activeLayer === l().id ? "text-blue-500" : "text-gray-400"} />
                        </button>
                        <button class={`${MINI} text-red-500 opacity-0 group-hover:opacity-100`} title={t("browser.deleteLayerTitle")} aria-label={t("browser.deleteLayer", { name: section.label })} onClick={() => b.deleteLayer(l().id)}><Trash2 size={12} /></button>
                      </>
                    )}
                  </Show>
                  <button class={MINI} title={t("browser.showHideAll")} aria-label={t("browser.toggleVisibility", { name: section.label })} onClick={() => b.setSectionFlag("visible", section)}>
                    <Show when={flagOf(section, "visible")} fallback={<EyeOff size={12} class="text-gray-400" />}><Eye size={12} /></Show>
                  </button>
                  <button class={MINI} title={t("browser.lockUnlockAll")} aria-label={t("browser.toggleLock", { name: section.label })} onClick={() => b.setSectionFlag("locked", section)}>
                    <Show when={flagOf(section, "locked")} fallback={<Unlock size={12} class="text-gray-400" />}><Lock size={12} class="text-orange-500" /></Show>
                  </button>
                </div>
              </Show>
              <Show when={b.mode() === "flat" || b.isSectionOpen(section.id)}>
                <For each={section.items}>{(node) => props.renderNode(node)}</For>
              </Show>
            </div>
          )
        }}
      </For>
    </Show>
  )
}

const TOGGLE_ROW = "flex items-center w-full px-2 py-1.5 text-xs text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 text-gray-700 dark:text-gray-300"

const SELECT = "text-xs p-1 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 max-w-[9rem]"

/**
 * Fusion's "Document Settings" and "Origin" folders: the unit the drawing is shown in, the drawing tolerance, the workpiece, and
 * the axes, grid and dimensions toggles. Unit and tolerance apply to the editor, the CAM generator, the verification and the assistant
 * (`state/document-settings.ts`); the tolerance is typed in the selected unit and kept in millimetres.
 */
export function OriginBlock(): JSX.Element {
  const app = useApp()
  const cad = useCADStore()
  const settings = () => app.settings.settings()
  const [custom, setCustom] = createSignal(false)
  const [problem, setProblem] = createSignal<string | undefined>()
  const presets = createMemo(() => (TOLERANCE_PRESETS.includes(settings().tolerance) ? TOLERANCE_PRESETS : [...TOLERANCE_PRESETS, settings().tolerance].sort((a, b) => b - a)))
  const decimals = () => settings().decimals
  const length = (mm: number): string => formatLength(mm, settings().units, decimals())
  const row = (label: string, on: boolean, toggle: () => void, icon: JSX.Element, testId: string): JSX.Element => (
    <button type="button" class={TOGGLE_ROW} onClick={toggle} aria-pressed={on} data-testid={testId}>
      <span class="mr-2 text-gray-500">{icon}</span>
      <span class="flex-1">{label}</span>
      <Show when={on} fallback={<EyeOff size={12} class="text-gray-400" />}><Eye size={12} /></Show>
    </button>
  )
  const onTolerance = (value: string): void => {
    if (value === "custom") { setCustom(true); return }
    setCustom(false)
    setProblem(undefined)
    setDocumentTolerance(app, Number(value))
  }
  const onCustom = (typed: number): void => {
    const mm = fromDisplay(typed, settings().units)
    if (!isTolerance(mm)) { setProblem(`${length(0.0001)} to ${length(10)}`); return }
    setProblem(undefined)
    setDocumentTolerance(app, mm)
  }
  return (
    <details class="sidebar-browser-origin border-b border-gray-200 dark:border-gray-700" data-testid="browser-origin" open>
      <summary class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 cursor-pointer select-none">{t("browser.documentOrigin")}</summary>
      <div class="pb-1">
        <label class={TOGGLE_ROW}>
          <span class="mr-2 text-gray-500"><Ruler size={14} /></span><span class="flex-1">{t("browser.units")}</span>
          <select class={SELECT} aria-label={t("browser.units")} value={settings().units} onChange={(event) => { const units = event.currentTarget.value; if (isDisplayUnits(units)) setDisplayUnits(app, units) }}>
            <For each={DISPLAY_UNITS}>{(unit) => <option value={unit}>{UNIT_TABLE[unit].label}</option>}</For>
          </select>
        </label>
        <label class={TOGGLE_ROW}>
          <span class="mr-2 text-gray-500"><Crosshair size={14} /></span><span class="flex-1">{t("browser.tolerance")}</span>
          <select class={SELECT} aria-label={t("browser.tolerance")} value={custom() ? "custom" : String(settings().tolerance)} onChange={(event) => onTolerance(event.currentTarget.value)}>
            <For each={presets()}>{(preset) => <option value={String(preset)}>{length(preset)}</option>}</For>
            <option value="custom">{t("browser.custom")}</option>
          </select>
        </label>
        <Show when={custom()}>
          <div class="px-2 pb-1">
            <input
              type="number" step="any" aria-label={t("browser.customTolerance")} data-testid="browser-custom-tolerance"
              class={`${SELECT} w-full`} placeholder={t("browser.toleranceIn", { unit: UNIT_TABLE[settings().units].label })}
              value={toDisplay(settings().tolerance, settings().units)}
              onChange={(event) => onCustom(event.currentTarget.valueAsNumber)}
            />
            <Show when={problem()}><p class="text-[11px] text-red-600" role="alert">{t("browser.allowed", { range: problem() ?? "" })}</p></Show>
          </div>
        </Show>
        <div class={TOGGLE_ROW}><span class="mr-2 text-gray-500"><Maximize size={14} /></span><span class="flex-1">{t("browser.workpiece")}</span><span class="font-mono">{length(cad.workpiece.width)} × {length(cad.workpiece.height)} × {length(cad.workpiece.depth)}</span></div>
        {row(t("browser.axes"), cad.axisVisible, () => cad.toggleAxis(), <Layers size={14} />, "browser-toggle-axes")}
        {row(t("browser.grid"), cad.gridVisible, () => cad.toggleGrid(), <Grid3x3 size={14} />, "browser-toggle-grid")}
        {row(t("browser.dimensions"), cad.showDimensions, () => cad.toggleDimensions(), <Ruler size={14} />, "browser-toggle-dimensions")}
      </div>
    </details>
  )
}
