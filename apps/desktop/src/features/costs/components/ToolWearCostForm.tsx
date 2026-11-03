import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { useRead } from "../../../app/queries.ts"
import { NumberField } from "../../../shared/components/panel/ui.tsx"
import { FIELD, PANEL, TOOLBAR_BUTTON, TOOLBAR_PRIMARY } from "../../../shared/components/WorkspacePage.tsx"
import type { ProductionCostsStore } from "../store/costsStore.ts"
import { t } from "../../../i18n/index.ts"

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
    <div class={PANEL}>
      <h3 class="mb-4 text-[13px] font-semibold text-slate-900 dark:text-white">{isEditing() ? t("costs.wear.editTitle") : t("costs.wear.addTitle")}</h3>

      <form onSubmit={(event) => void handleSubmit(event)} class="space-y-4">
        <div>
          <label for="toolId" class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{t("status.tool")}</label>
          <select id="toolId" name="toolId" value={formData.toolId} onChange={handleChange} class={FIELD} required disabled={isEditing() || isLoadingTools() || !!toolError()}>
            <Show
              when={!isLoadingTools()}
              fallback={<option value="">{t("costs.wear.loading")}</option>}
            >
              <Show when={!toolError()} fallback={<option value="">{toolError()}</option>}>
                <option value="">{t("cam.gen.tool.selectOne")}</option>
                <Show
                  when={isEditing() && formData.toolId}
                  fallback={<For each={availableToolsForNewCost()}>{(tool) => <option value={tool.id}>{toolLabel(tool)}</option>}</For>}
                >
                  <For each={allTools().filter((tool) => tool.id === formData.toolId)}>{(tool) => <option value={tool.id} selected>{toolLabel(tool)}</option>}</For>
                </Show>
                <Show when={isEditing() && formData.toolId && !allTools().find((tool) => tool.id === formData.toolId)}>
                  <option value={formData.toolId} disabled>{t("costs.wear.loaded", { id: formData.toolId })}</option>
                </Show>
              </Show>
            </Show>
          </select>
        </div>

        <div>
          <label for="wearRatePerMeter" class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{t("costs.wear.rate")}</label>
          <NumberField id="wearRatePerMeter" name="wearRatePerMeter" value={formData.wearRatePerMeter} min="0" step="0.01" class={FIELD} accept={(value) => value >= 0} onValue={(value) => setFormData("wearRatePerMeter", value)} />
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("costs.wear.rateHint")}</p>
        </div>

        <div>
          <label for="replacementCost" class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{t("costs.wear.replacement", { currency: formData.currencyCode })}</label>
          <NumberField id="replacementCost" name="replacementCost" value={formData.replacementCost} min="0" step="0.01" class={FIELD} accept={(value) => value >= 0} onValue={(value) => setFormData("replacementCost", value)} />
        </div>

        <div>
          <label for="replacementThreshold" class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{t("costs.wear.threshold")}</label>
          <NumberField id="replacementThreshold" name="replacementThreshold" value={formData.replacementThreshold} min="0" max="100" step="1" class={FIELD} accept={(value) => value >= 0 && value <= 100} onValue={(value) => setFormData("replacementThreshold", value)} />
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("costs.wear.thresholdHint")}</p>
        </div>

        <div>
          <label for="currencyCode" class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{t("costs.currency")}</label>
          <select id="currencyCode" name="currencyCode" value={formData.currencyCode} onChange={handleChange} class={FIELD} required>
            <option value="EUR">EUR (€)</option> {/* i18n-ok currency code */}
            <option value="USD">USD ($)</option> {/* i18n-ok currency code */}
            <option value="GBP">GBP (£)</option> {/* i18n-ok currency code */}
          </select>
        </div>

        <div class="flex flex-wrap items-center justify-end gap-3 pt-2">
          <Show when={isEditing() || formData.toolId}>
            <button type="button" onClick={resetForm} class={TOOLBAR_BUTTON}>
              {isEditing() ? t("mcp.form.cancel") : t("costs.form.cancelClear")}
            </button>
          </Show>
          <button type="submit" disabled={costs.state.isLoading || isLoadingTools() || !formData.toolId} class={TOOLBAR_PRIMARY}>
            {costs.state.isLoading ? t("mcp.form.saving") : isEditing() ? t("settings.profile.save") : t("costs.form.add")}
          </button>
        </div>
      </form>
    </div>
  )
}
