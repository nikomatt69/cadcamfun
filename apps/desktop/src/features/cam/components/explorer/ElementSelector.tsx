/**
 * Multi-toolpath element selector (legacy `ElementSelector.tsx`): pick CAD elements, create one toolpath per element
 * and manage the generated toolpaths (select, show / hide, reorder, remove).
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { Box, CheckSquare, ChevronDown, ChevronUp, Circle, Eye, EyeOff, Hexagon, Layers, Settings, Square, Trash2, Triangle } from "lucide-solid"
import { useElementsStore } from "../../../cad/store/elementsStore.ts"
import type { ToolpathSettings } from "../../lib/elementJob.ts"
import { formatDuration } from "../../lib/multiToolpath.ts"
import { useMultiToolpathStore } from "../../store/multiToolpathStore.ts"
import { t } from "../../../../i18n/index.ts"

export interface ElementSelectorProps {
  readonly globalSettings: ToolpathSettings
  readonly onGenerateToolpath: (elementId: string, settings: ToolpathSettings) => void
  readonly onSelectElement: (elementId: string) => void
}

const icon = (type: string): JSX.Element => {
  switch (type) {
    case "circle": return <Circle size={16} />
    case "rectangle":
    case "box":
    case "cube": return <Box size={16} />
    case "triangle": return <Triangle size={16} />
    case "polygon": return <Hexagon size={16} />
    default: return <Layers size={16} />
  }
}

export default function ElementSelector(props: ElementSelectorProps): JSX.Element {
  const elements = useElementsStore()
  const store = useMultiToolpathStore()
  const [selectedForGeneration, setSelectedForGeneration] = createSignal<ReadonlySet<string>>(new Set<string>())

  // Elements that can carry a toolpath.
  const validElements = createMemo(() => elements.elements.filter(element => element["type"] && !["grid", "axis", "light"].includes(String(element["type"])) && element["visible"] !== false))
  const hasToolpath = (elementId: string): boolean => store.toolpaths.some(toolpath => toolpath.elementId === elementId)
  const nameOf = (element: Record<string, any>): string => element["name"] || `${element["type"]}-${String(element["id"]).slice(0, 8)}`

  const toggleElementSelection = (elementId: string): void => {
    const next = new Set(selectedForGeneration())
    if (next.has(elementId)) next.delete(elementId)
    else next.add(elementId)
    setSelectedForGeneration(next)
  }

  const generateToolpathsForSelected = (): void => {
    for (const elementId of selectedForGeneration()) {
      const element = elements.elements.find(candidate => candidate["id"] === elementId)
      if (element !== undefined && !hasToolpath(elementId)) {
        store.addToolpath(elementId, String(element["type"]), nameOf(element), props.globalSettings)
        props.onGenerateToolpath(elementId, props.globalSettings)
      }
    }
    setSelectedForGeneration(new Set<string>())
  }

  const removeSelectedToolpaths = (): void => {
    for (const toolpath of store.toolpaths.filter(candidate => candidate.selected)) store.removeToolpath(toolpath.id)
  }

  return (
    <div class="bg-gray-800 rounded-lg p-4">
      <h3 class="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <Layers size={20} />
        {t("cam.multi.manage")}
      </h3>

      {/* CAD elements */}
      <div class="mb-6">
        <h4 class="text-sm font-semibold text-gray-300 mb-2">{t("cam.multi.availableElements", { count: validElements().length })}</h4>

        <div class="max-h-60 overflow-y-auto border border-gray-700 rounded-lg p-2">
          <Show when={validElements().length > 0} fallback={<p class="text-gray-500 text-sm text-center py-4">{t("cam.multi.noElements")}</p>}>
            <div class="space-y-1">
              <For each={validElements()}>
                {element => {
                  const id = String(element["id"])
                  const generated = (): boolean => hasToolpath(id)
                  const picked = (): boolean => selectedForGeneration().has(id)
                  return (
                    <div
                      class={`flex items-center justify-between p-2 rounded ${generated() ? "bg-green-900/30" : "bg-gray-700/50"} ${picked() ? "ring-2 ring-blue-500" : ""} hover:bg-gray-700 transition-colors cursor-pointer`}
                      onClick={() => { if (!generated()) toggleElementSelection(id) }}
                    >
                      <div class="flex items-center gap-2">
                        <button
                          onClick={event => { event.stopPropagation(); if (!generated()) toggleElementSelection(id) }}
                          class="text-gray-400 hover:text-white"
                          disabled={generated()}
                        >
                          {picked() ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>

                        {icon(String(element["type"]))}

                        <span class="text-sm text-white">{nameOf(element)}</span>

                        <Show when={generated()}><span class="text-xs text-green-400 ml-2">(Toolpath generato)</span></Show>
                      </div>

                      <div class="flex items-center gap-1">
                        <Show when={element["width"] && element["height"]}>
                          <span class="text-xs text-gray-400">{Number(element["width"]).toFixed(1)}x{Number(element["height"]).toFixed(1)}</span>
                        </Show>
                        <Show when={element["radius"]}>
                          <span class="text-xs text-gray-400">R{Number(element["radius"]).toFixed(1)}</span>
                        </Show>
                      </div>
                    </div>
                  )
                }}
              </For>
            </div>
          </Show>
        </div>

        <Show when={selectedForGeneration().size > 0}>
          <button
            onClick={generateToolpathsForSelected}
            class="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Layers size={16} />
            {t("cam.multi.generateFor", { count: selectedForGeneration().size })}
          </button>
        </Show>
      </div>

      {/* Generated toolpaths */}
      <div>
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-sm font-semibold text-gray-300">Toolpath Generati ({store.toolpaths.length})</h4>

          <Show when={store.toolpaths.some(toolpath => toolpath.selected)}>
            <button onClick={removeSelectedToolpaths} class="text-red-400 hover:text-red-300 transition-colors" title={t("cam.multi.removeSelected")}>
              <Trash2 size={16} />
            </button>
          </Show>
        </div>

        <div class="space-y-2 max-h-80 overflow-y-auto">
          <Show when={store.toolpaths.length > 0} fallback={<p class="text-gray-500 text-sm text-center py-4">{t("cam.multi.none")}</p>}>
            <For each={store.toolpaths}>
              {(toolpath, index) => (
                <div class={`border rounded-lg p-3 transition-colors ${toolpath.selected ? "border-blue-500 bg-blue-900/20" : "border-gray-700 bg-gray-800/50"}`}>
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                      <button onClick={() => (toolpath.selected ? store.deselectToolpath(toolpath.id) : store.selectToolpath(toolpath.id))} class="text-gray-400 hover:text-white">
                        {toolpath.selected ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>

                      <div class="w-4 h-4 rounded" style={{ "background-color": toolpath.color }} title={t("cam.multi.color")} />

                      {icon(toolpath.elementType)}

                      <span class="text-sm text-white font-medium">{toolpath.elementName}</span>
                    </div>

                    <div class="flex items-center gap-1">
                      <button onClick={() => store.toggleToolpathVisibility(toolpath.id)} class="p-1 text-gray-400 hover:text-white transition-colors" title={toolpath.visible ? "Nascondi" : "Mostra"}>
                        {toolpath.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>

                      <button onClick={() => props.onSelectElement(toolpath.elementId)} class="p-1 text-gray-400 hover:text-white transition-colors" title={t("cam.multi.editSettings")}>
                        <Settings size={16} />
                      </button>

                      <button onClick={() => store.moveToolpathUp(toolpath.id)} class="p-1 text-gray-400 hover:text-white transition-colors" disabled={index() === 0} title={t("cam.multi.moveUp")} aria-label={t("cam.multi.moveUp")}>
                        <ChevronUp size={16} />
                      </button>

                      <button onClick={() => store.moveToolpathDown(toolpath.id)} class="p-1 text-gray-400 hover:text-white transition-colors" disabled={index() === store.toolpaths.length - 1} title={t("cam.multi.moveDown")} aria-label={t("cam.multi.moveDown")}>
                        <ChevronDown size={16} />
                      </button>

                      <button onClick={() => store.removeToolpath(toolpath.id)} class="p-1 text-red-400 hover:text-red-300 transition-colors" title={t("cam.multi.remove")}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Toolpath info */}
                  <div class="text-xs text-gray-400 flex items-center gap-4">
                    <span>Ø{toolpath.toolpathSettings.toolDiameter}{t("cad.millimeters")}</span>
                    <span>{toolpath.toolpathSettings.operationType}</span>
                    <Show when={toolpath.distance > 0}><span>Dist: {(toolpath.distance / 1000).toFixed(2)}m</span></Show>
                    <Show when={toolpath.estimatedTime > 0}><span>Tempo: {formatDuration(toolpath.estimatedTime)}</span></Show>
                  </div>

                  {/* Progress bar once the G-code exists */}
                  <Show when={toolpath.gcode}>
                    <div class="mt-2 bg-gray-700 rounded-full h-1 overflow-hidden">
                      <div class="h-full bg-green-500 transition-all duration-500" style={{ width: "100%" }} />
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>
    </div>
  )
}
