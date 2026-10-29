import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { useRead } from "../../../app/queries.ts"
import type { ProductionCostsStore } from "../store/costsStore.ts"
import { t } from "../../../i18n/index.ts"

const availableCurrencies = [
  { code: "EUR", symbol: "€", get name() { return t("costs.currency.eur") } },
  { code: "USD", symbol: "$", get name() { return t("costs.currency.usd") } },
  { code: "GBP", symbol: "£", get name() { return t("costs.currency.gbp") } }
]

interface MaterialCostFormProps {
  readonly store: ProductionCostsStore
  readonly costToEditId?: string | null
  readonly onSubmissionDone?: () => void
}

type MaterialRow = { id: string; name: string }

/** Add / edit the cost of a material (legacy `MaterialCostForm`). */
export default function MaterialCostForm(props: MaterialCostFormProps): JSX.Element {
  const costs = props.store
  const blank = () => ({ materialId: "", costPerUnit: 0, wasteFactor: 10, minimumCharge: 0, currencyCode: costs.state.settings.defaultCurrencyCode || "EUR" })
  const [isEditing, setIsEditing] = createSignal(false)
  const [formData, setFormData] = createStore(blank())

  const materials = useRead((client) => client.materials.list({ query: {} }))
  const allMaterials = (): MaterialRow[] => (materials.data() ?? []) as unknown as MaterialRow[]
  const availableMaterialsForNewCost = createMemo(() => allMaterials().filter((material) => !costs.state.materialCosts.some((cost) => cost.materialId === material.id)))
  const isLoadingMaterials = (): boolean => materials.loading()
  const materialError = (): string | null => {
    const error = materials.error()
    return error ? t("library.detail.materialsLoadFailed", { error }) : null
  }

  const resetForm = (): void => {
    setFormData(blank())
    setIsEditing(false)
    props.onSubmissionDone?.()
  }

  createEffect(on([() => props.costToEditId, () => costs.state.materialCosts], () => {
    if (props.costToEditId) {
      const costToEdit = costs.state.materialCosts.find((cost) => cost.id === props.costToEditId)
      if (costToEdit) {
        setFormData({ materialId: costToEdit.materialId, costPerUnit: costToEdit.costPerUnit, wasteFactor: costToEdit.wasteFactor, minimumCharge: costToEdit.minimumCharge, currencyCode: costToEdit.currencyCode })
        setIsEditing(true)
      } else resetForm()
    } else {
      if (isEditing()) resetForm()
      setIsEditing(false)
    }
  }))

  const handleChange = (event: Event & { currentTarget: HTMLInputElement | HTMLSelectElement }): void => {
    const { name, value } = event.currentTarget
    if (["costPerUnit", "wasteFactor", "minimumCharge"].includes(name)) setFormData(name as "costPerUnit", parseFloat(value) || 0)
    else setFormData(name as "materialId" | "currencyCode", value)
  }

  const handleSubmit = async (event: Event): Promise<void> => {
    event.preventDefault()
    if (costs.state.isLoading) return
    let success = false
    if (isEditing() && props.costToEditId) success = await costs.updateMaterialCost(props.costToEditId, { ...formData })
    else success = !!(await costs.addMaterialCost({ ...formData }))
    if (success) resetForm()
  }

  return (
    <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg shadow-md">
      <h3 class="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-200">{isEditing() ? t("costs.material.editTitle") : t("costs.material.addTitle")}</h3>

      <form onSubmit={(event) => void handleSubmit(event)} class="space-y-4">
        <div>
          <label for="materialId" class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t("costs.material")}</label>
          <select id="materialId" name="materialId" value={formData.materialId} onChange={handleChange} class="w-full border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required disabled={isEditing() || isLoadingMaterials() || !!materialError()}>
            <Show when={!isLoadingMaterials()} fallback={<option value="">{t("costs.material.loading")}</option>}>
              <Show when={!materialError()} fallback={<option value="">{materialError()}</option>}>
                <option value="">{t("cam.gen.mat.selectOne")}</option>
                <Show
                  when={isEditing() && formData.materialId}
                  fallback={<For each={availableMaterialsForNewCost()}>{(material) => <option value={material.id}>{material.name}</option>}</For>}
                >
                  <For each={allMaterials().filter((material) => material.id === formData.materialId)}>{(material) => <option value={material.id} selected>{material.name}</option>}</For>
                </Show>
                <Show when={isEditing() && formData.materialId && !allMaterials().find((material) => material.id === formData.materialId)}>
                  <option value={formData.materialId} disabled>{t("costs.material.loaded", { id: formData.materialId })}</option>
                </Show>
              </Show>
            </Show>
          </select>
        </div>

        <div>
          <label for="costPerUnit" class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t("costs.material.perUnit", { currency: formData.currencyCode })}</label>
          <div class="flex items-center">
            <input id="costPerUnit" type="number" name="costPerUnit" value={formData.costPerUnit} onInput={handleChange} min="0" step="0.01" class="w-full border-gray-300 rounded-l-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required />
            <select name="currencyCode" value={formData.currencyCode} onChange={handleChange} class="h-full border-gray-300 rounded-r-md shadow-sm p-2 border-l-0 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
              <For each={availableCurrencies}>{(currency) => <option value={currency.code}>{currency.symbol} ({currency.code})</option>}</For>
            </select>
          </div>
          <p class="text-xs text-gray-500 mt-1">{t("costs.material.unitHint")}</p>
        </div>

        <div>
          <label for="wasteFactor" class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t("costs.material.waste")}</label>
          <input id="wasteFactor" type="number" name="wasteFactor" value={formData.wasteFactor} onInput={handleChange} min="0" max="100" step="1" class="w-full border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required />
          <p class="text-xs text-gray-500 mt-1">{t("costs.material.wasteHint")}</p>
        </div>

        <div>
          <label for="minimumCharge" class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t("costs.material.minimum", { currency: formData.currencyCode })}</label>
          <input id="minimumCharge" type="number" name="minimumCharge" value={formData.minimumCharge} onInput={handleChange} min="0" step="0.01" class="w-full border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
          <p class="text-xs text-gray-500 mt-1">{t("costs.material.minimumHint")}</p>
        </div>

        <div class="flex items-center justify-end space-x-3 pt-2">
          <Show when={isEditing() || formData.materialId}>
            <button type="button" onClick={() => { resetForm(); if (props.onSubmissionDone && isEditing()) props.onSubmissionDone() }} class="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
              {isEditing() ? t("mcp.form.cancel") : t("costs.form.cancelClear")}
            </button>
          </Show>
          <button type="submit" disabled={costs.state.isLoading || isLoadingMaterials() || !formData.materialId} class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 dark:bg-indigo-700 dark:hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-300">
            {costs.state.isLoading ? t("mcp.form.saving") : isEditing() ? t("settings.profile.save") : t("costs.form.add")}
          </button>
        </div>
      </form>
    </div>
  )
}
