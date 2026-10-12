import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { useRead } from "../../../app/queries.ts"
import type { ProductionCostsStore } from "../store/costsStore.ts"

interface ToolWearCostFormProps {
  readonly store: ProductionCostsStore
  readonly costToEditId?: string | null
  readonly onSubmissionDone?: () => void
}

type ToolRow = { id: string; name: string; diameter: number; type: string }

/** Add / edit the wear cost of a tool (legacy `ToolWearCostForm`). */
export default function ToolWearCostForm(props: ToolWearCostFormProps): JSX.Element {
  const costs = props.store
  const blank = () => ({ toolId: "", wearRatePerMeter: 0.5, replacementCost: 0, replacementThreshold: 100, currencyCode: costs.state.settings.defaultCurrencyCode || "EUR" })
  const [isEditing, setIsEditing] = createSignal(false)
  const [formData, setFormData] = createStore(blank())

  const tools = useRead((client) => client.tools.list({ query: {} }))
  const allTools = (): ToolRow[] => (tools.data() ?? []) as unknown as ToolRow[]
  const availableToolsForNewCost = createMemo(() => allTools().filter((tool) => !costs.state.toolWearCosts.some((cost) => cost.toolId === tool.id)))
  const isLoadingTools = (): boolean => tools.loading()
  const toolError = (): string | null => {
    const error = tools.error()
    return error ? `Failed to load tools: ${error}` : null
  }

  const resetForm = (): void => {
    setFormData(blank())
    setIsEditing(false)
    props.onSubmissionDone?.()
  }

  createEffect(on([() => props.costToEditId, () => costs.state.toolWearCosts], () => {
    if (props.costToEditId) {
      const costToEdit = costs.state.toolWearCosts.find((cost) => cost.id === props.costToEditId)
      if (costToEdit) {
        setFormData({ toolId: costToEdit.toolId, wearRatePerMeter: costToEdit.wearRatePerMeter, replacementCost: costToEdit.replacementCost, replacementThreshold: costToEdit.replacementThreshold, currencyCode: costToEdit.currencyCode })
        setIsEditing(true)
      } else resetForm()
    } else {
      if (isEditing()) resetForm()
      setIsEditing(false)
    }
  }))

  const handleChange = (event: Event & { currentTarget: HTMLInputElement | HTMLSelectElement }): void => {
    const { name, value } = event.currentTarget
    if (name === "wearRatePerMeter" || name === "replacementCost" || name === "replacementThreshold") setFormData(name, parseFloat(value) || 0)
    else setFormData(name as "toolId" | "currencyCode", value)
  }

  const handleSubmit = async (event: Event): Promise<void> => {
    event.preventDefault()
    if (costs.state.isLoading) return
    let success = false
    if (isEditing() && props.costToEditId) success = await costs.updateToolWearCost(props.costToEditId, { ...formData })
    else success = !!(await costs.addToolWearCost({ ...formData }))
    if (success) resetForm()
  }

  const toolLabel = (tool: ToolRow): string => `${tool.name} (${tool.diameter}mm ${tool.type})`

  return (
    <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg shadow-md">
      <h3 class="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-200">{isEditing() ? "Modify Tool Wear Cost" : "Add New Tool Wear Cost"}</h3>

      <form onSubmit={(event) => void handleSubmit(event)} class="space-y-4">
        <div>
          <label for="toolId" class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Tool</label>
          <select id="toolId" name="toolId" value={formData.toolId} onChange={handleChange} class="w-full border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required disabled={isEditing() || isLoadingTools() || !!toolError()}>
            <Show
              when={!isLoadingTools()}
              fallback={<option value="">Loading tools...</option>}
            >
              <Show when={!toolError()} fallback={<option value="">{toolError()}</option>}>
                <option value="">Select a tool</option>
                <Show
                  when={isEditing() && formData.toolId}
                  fallback={<For each={availableToolsForNewCost()}>{(tool) => <option value={tool.id}>{toolLabel(tool)}</option>}</For>}
                >
                  <For each={allTools().filter((tool) => tool.id === formData.toolId)}>{(tool) => <option value={tool.id} selected>{toolLabel(tool)}</option>}</For>
                </Show>
                <Show when={isEditing() && formData.toolId && !allTools().find((tool) => tool.id === formData.toolId)}>
                  <option value={formData.toolId} disabled>{`Tool (ID: ${formData.toolId}) - Loaded`}</option>
                </Show>
              </Show>
            </Show>
          </select>
        </div>

        <div>
          <label for="wearRatePerMeter" class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Wear Rate per Meter (%)</label>
          <input id="wearRatePerMeter" type="number" name="wearRatePerMeter" value={formData.wearRatePerMeter} onInput={handleChange} min="0" step="0.01" class="w-full border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required />
          <p class="text-xs text-gray-500 mt-1">Percentage of tool wear per meter of path. Es. 0.5 for 0.5%.</p>
        </div>

        <div>
          <label for="replacementCost" class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Replacement Cost ({formData.currencyCode})</label>
          <input id="replacementCost" type="number" name="replacementCost" value={formData.replacementCost} onInput={handleChange} min="0" step="0.01" class="w-full border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required />
        </div>

        <div>
          <label for="replacementThreshold" class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Replacement Threshold (%)</label>
          <input id="replacementThreshold" type="number" name="replacementThreshold" value={formData.replacementThreshold} onInput={handleChange} min="0" max="100" step="1" class="w-full border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required />
          <p class="text-xs text-gray-500 mt-1">Maximum wear percentage before the tool is considered to be replaced.</p>
        </div>

        <div>
          <label for="currencyCode" class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Currency</label>
          <select id="currencyCode" name="currencyCode" value={formData.currencyCode} onChange={handleChange} class="w-full border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required>
            <option value="EUR">EUR (€)</option>
            <option value="USD">USD ($)</option>
            <option value="GBP">GBP (£)</option>
          </select>
        </div>

        <div class="flex items-center justify-end space-x-3 pt-2">
          <Show when={isEditing() || formData.toolId}>
            <button type="button" onClick={() => { resetForm(); if (props.onSubmissionDone && isEditing()) props.onSubmissionDone() }} class="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
              Cancel{isEditing() ? "" : "/Clear"}
            </button>
          </Show>
          <button type="submit" disabled={costs.state.isLoading || isLoadingTools() || !formData.toolId} class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 dark:bg-indigo-700 dark:hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-300">
            {costs.state.isLoading ? "Saving..." : isEditing() ? "Save Changes" : "Add Cost"}
          </button>
        </div>
      </form>
    </div>
  )
}
