/**
 * The production-costs state (port of the legacy `productionCostsStore` + `productionCostsService`), on the
 * sidecar's `production-costs` HTTP group. One instance per manager (it needs the app's client + runtime).
 *
 * The legacy app had no `/settings` routes (loading fell back to defaults and saving always failed), so the
 * default cost settings are kept in browser storage here.
 */
import { createStore } from "solid-js/store"
import type { AppState } from "../../state/context.ts"
import { toast } from "../../components/ui/toast.tsx"
import { toEstimateView, type CostEstimateView } from "./costsFormat.ts"

export interface ToolWearCost { id: string; toolId: string; wearRatePerMeter: number; replacementCost: number; replacementThreshold: number; currencyCode: string }
export interface MaterialCost { id: string; materialId: string; costPerUnit: number; wasteFactor: number; minimumCharge: number; currencyCode: string }
export interface OperationCost { id: string; name: string; machineHourlyRate: number; operatorHourlyRate: number; setupTime: number; currencyCode: string }

export interface CostSettings {
  id: string
  defaultCurrencyCode: string
  defaultMachineHourlyRate: number
  defaultOperatorHourlyRate: number
  defaultSetupTime: number
  calculateAutomatically: boolean
}

export const SETTINGS_STORAGE_KEY = "cadcam_cost_settings"

export const defaultSettings: CostSettings = {
  id: "",
  defaultCurrencyCode: "EUR",
  defaultMachineHourlyRate: 50,
  defaultOperatorHourlyRate: 30,
  defaultSetupTime: 30,
  calculateAutomatically: true
}

const describe = (cause: unknown): string => {
  if (typeof cause === "object" && cause !== null && typeof (cause as { message?: unknown }).message === "string") return (cause as { message: string }).message
  return cause === undefined ? "Errore sconosciuto" : String(cause)
}

const readSettings = (): CostSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    return raw ? { ...defaultSettings, ...(JSON.parse(raw) as Partial<CostSettings>) } : defaultSettings
  } catch { return defaultSettings }
}

interface CostsState {
  toolWearCosts: ToolWearCost[]
  materialCosts: MaterialCost[]
  operationCosts: OperationCost[]
  costEstimates: CostEstimateView[]
  settings: CostSettings
  isLoading: boolean
  activeEstimateId: string | null
  error: string | null
}

export type ProductionCostsStore = ReturnType<typeof createProductionCostsStore>

export function createProductionCostsStore(app: AppState) {
  const [state, setState] = createStore<CostsState>({
    toolWearCosts: [],
    materialCosts: [],
    operationCosts: [],
    costEstimates: [],
    settings: readSettings(),
    isLoading: false,
    activeEstimateId: null,
    error: null
  })
  const api = () => app.client["production-costs"]
  const run = <A,>(effect: Parameters<typeof app.runtime.run>[0]) => app.runtime.run(effect) as Promise<A>

  const fail = (prefix: string, cause: unknown, toastMessage: string): void => {
    setState({ error: `${prefix}: ${describe(cause)}`, isLoading: false })
    toast.error(toastMessage)
  }

  const loadData = async (): Promise<void> => {
    setState({ isLoading: true, error: null })
    try {
      const [toolWearCosts, materialCosts, operationCosts, estimates] = await Promise.all([
        run<any[]>(api().listToolWear({ query: {} })),
        run<any[]>(api().listMaterialCosts({ query: {} })),
        run<any[]>(api().listOperationCosts({ query: {} })),
        run<any[]>(api().listEstimates({ query: {} }))
      ])
      setState({
        toolWearCosts: toolWearCosts as ToolWearCost[],
        materialCosts: materialCosts as MaterialCost[],
        operationCosts: operationCosts as OperationCost[],
        costEstimates: estimates.map(toEstimateView),
        settings: readSettings(),
        isLoading: false
      })
    } catch (cause) {
      fail("Errore nel caricamento dei dati", cause, "Errore nel caricamento dei dati di costo")
    }
  }

  const addToolWearCost = async (cost: Omit<ToolWearCost, "id">): Promise<string> => {
    try {
      setState({ isLoading: true, error: null })
      const created = await run<any>(api().createToolWear({ payload: cost }))
      setState({ toolWearCosts: [...state.toolWearCosts, created as ToolWearCost], isLoading: false })
      toast.success("Costo utensile aggiunto con successo")
      return created.id as string
    } catch (cause) { fail("Errore nell'aggiunta del costo di usura", cause, "Errore nell'aggiunta del costo utensile"); return "" }
  }
  const updateToolWearCost = async (id: string, updates: Partial<Omit<ToolWearCost, "id">>): Promise<boolean> => {
    try {
      setState({ isLoading: true, error: null })
      const { toolId: _toolId, ...payload } = updates
      const updated = await run<any>(api().updateToolWear({ params: { id }, payload }))
      setState({ toolWearCosts: state.toolWearCosts.map((cost) => (cost.id === id ? { ...cost, ...(updated as ToolWearCost) } : cost)), isLoading: false })
      toast.success("Costo utensile aggiornato con successo")
      return true
    } catch (cause) { fail("Errore nell'aggiornamento del costo di usura", cause, "Errore nell'aggiornamento del costo utensile"); return false }
  }
  const deleteToolWearCost = async (id: string): Promise<boolean> => {
    try {
      setState({ isLoading: true, error: null })
      await run(api().deleteToolWear({ params: { id } }))
      setState({ toolWearCosts: state.toolWearCosts.filter((cost) => cost.id !== id), isLoading: false })
      toast.success("Costo utensile eliminato con successo")
      return true
    } catch (cause) { fail("Errore nell'eliminazione del costo di usura", cause, "Errore nell'eliminazione del costo utensile"); return false }
  }

  const addMaterialCost = async (cost: Omit<MaterialCost, "id">): Promise<string> => {
    try {
      setState({ isLoading: true, error: null })
      const created = await run<any>(api().createMaterialCost({ payload: cost }))
      setState({ materialCosts: [...state.materialCosts, created as MaterialCost], isLoading: false })
      toast.success("Costo materiale aggiunto con successo")
      return created.id as string
    } catch (cause) { fail("Errore nell'aggiunta del costo di materiale", cause, "Errore nell'aggiunta del costo materiale"); return "" }
  }
  const updateMaterialCost = async (id: string, updates: Partial<Omit<MaterialCost, "id">>): Promise<boolean> => {
    try {
      setState({ isLoading: true, error: null })
      const { materialId: _materialId, ...payload } = updates
      const updated = await run<any>(api().updateMaterialCost({ params: { id }, payload }))
      setState({ materialCosts: state.materialCosts.map((cost) => (cost.id === id ? { ...cost, ...(updated as MaterialCost) } : cost)), isLoading: false })
      toast.success("Costo materiale aggiornato con successo")
      return true
    } catch (cause) { fail("Errore nell'aggiornamento del costo di materiale", cause, "Errore nell'aggiornamento del costo materiale"); return false }
  }
  const deleteMaterialCost = async (id: string): Promise<boolean> => {
    try {
      setState({ isLoading: true, error: null })
      await run(api().deleteMaterialCost({ params: { id } }))
      setState({ materialCosts: state.materialCosts.filter((cost) => cost.id !== id), isLoading: false })
      toast.success("Costo materiale eliminato con successo")
      return true
    } catch (cause) { fail("Errore nell'eliminazione del costo di materiale", cause, "Errore nell'eliminazione del costo materiale"); return false }
  }

  const addOperationCost = async (cost: Omit<OperationCost, "id">): Promise<string> => {
    try {
      setState({ isLoading: true, error: null })
      const created = await run<any>(api().createOperationCost({ payload: cost }))
      setState({ operationCosts: [...state.operationCosts, created as OperationCost], isLoading: false })
      toast.success("Costo operazione aggiunto con successo")
      return created.id as string
    } catch (cause) { fail("Errore nell'aggiunta del costo di operazione", cause, "Errore nell'aggiunta del costo operazione"); return "" }
  }
  const updateOperationCost = async (id: string, updates: Partial<Omit<OperationCost, "id">>): Promise<boolean> => {
    try {
      setState({ isLoading: true, error: null })
      const updated = await run<any>(api().updateOperationCost({ params: { id }, payload: updates }))
      setState({ operationCosts: state.operationCosts.map((cost) => (cost.id === id ? { ...cost, ...(updated as OperationCost) } : cost)), isLoading: false })
      toast.success("Costo operazione aggiornato con successo")
      return true
    } catch (cause) { fail("Errore nell'aggiornamento del costo di operazione", cause, "Errore nell'aggiornamento del costo operazione"); return false }
  }
  const deleteOperationCost = async (id: string): Promise<boolean> => {
    try {
      setState({ isLoading: true, error: null })
      await run(api().deleteOperationCost({ params: { id } }))
      setState({ operationCosts: state.operationCosts.filter((cost) => cost.id !== id), isLoading: false })
      toast.success("Costo operazione eliminato con successo")
      return true
    } catch (cause) { fail("Errore nell'eliminazione del costo di operazione", cause, "Errore nell'eliminazione del costo operazione"); return false }
  }

  /** What the sidecar's `calculate` answers: the legacy "estimate" before it is saved (no id yet). */
  const estimateToolpathCost = async (toolpathId: string): Promise<any | null> => {
    try {
      setState({ isLoading: true, error: null })
      const estimate = await run<any>(api().calculateEstimate({ payload: { toolpathId } }))
      setState({ isLoading: false })
      return estimate
    } catch (cause) { fail("Errore nel calcolo della stima dei costi", cause, "Errore nel calcolo dei costi di produzione"); return null }
  }

  /** Saves a calculated estimate. Returns the saved view (with its id), or `null` when it failed. */
  const saveEstimate = async (estimate: any): Promise<CostEstimateView | null> => {
    setState({ isLoading: true, error: null })
    try {
      const existing = estimate.id ? state.costEstimates.find((candidate) => candidate.id === estimate.id) : undefined
      let saved: CostEstimateView
      if (existing) {
        const updated = await run<any>(api().updateEstimate({ params: { id: estimate.id }, payload: { currencyCode: estimate.currencyCode, details: estimate.details } }))
        saved = toEstimateView({ ...updated, details: estimate.details ?? updated.details })
        setState({ costEstimates: state.costEstimates.map((candidate) => (candidate.id === saved.id ? saved : candidate)), isLoading: false })
        toast.success("Stima dei costi aggiornata con successo")
      } else {
        const created = await run<any>(api().createEstimate({ payload: {
          toolpathId: estimate.toolpathId, totalCost: estimate.totalCost, materialCost: estimate.materialCost, toolWearCost: estimate.toolWearCost,
          machineTime: estimate.machineTime, machineTimeCost: estimate.machineTimeCost, operatorTime: estimate.operatorTime,
          operatorTimeCost: estimate.operatorTimeCost, setupCost: estimate.setupCost, currencyCode: estimate.currencyCode, details: estimate.details
        } }))
        saved = toEstimateView(created)
        setState({ costEstimates: [...state.costEstimates, saved], isLoading: false })
        toast.success("Stima dei costi creata con successo")
      }
      setState({ activeEstimateId: saved.id })
      return saved
    } catch (cause) {
      const message = describe(cause)
      setState({ error: `Errore nel salvataggio della stima: ${message}`, isLoading: false })
      toast.error(`Errore nel salvataggio della stima: ${message}`)
      return null
    }
  }

  const deleteEstimate = async (id: string): Promise<boolean> => {
    try {
      setState({ isLoading: true, error: null })
      if (!state.costEstimates.some((candidate) => candidate.id === id)) {
        console.error(`Estimate with id ${id} not found, skipping deletion`)
        setState({ isLoading: false })
        return false
      }
      await run(api().deleteEstimate({ params: { id } }))
      setState({
        costEstimates: state.costEstimates.filter((candidate) => candidate.id !== id),
        isLoading: false,
        activeEstimateId: state.activeEstimateId === id ? null : state.activeEstimateId
      })
      toast.success("Stima eliminata con successo")
      return true
    } catch (cause) { fail("Errore nell'eliminazione della stima", cause, "Errore nell'eliminazione della stima"); return false }
  }

  const updateSettings = async (updates: Partial<Omit<CostSettings, "id">>): Promise<boolean> => {
    try {
      setState({ isLoading: true, error: null })
      const next = { ...state.settings, ...updates }
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next))
      setState({ settings: next, isLoading: false })
      toast.success("Impostazioni aggiornate con successo")
      return true
    } catch (cause) { fail("Errore nell'aggiornamento delle impostazioni", cause, "Errore nell'aggiornamento delle impostazioni"); return false }
  }

  return {
    state,
    loadData,
    addToolWearCost, updateToolWearCost, deleteToolWearCost,
    addMaterialCost, updateMaterialCost, deleteMaterialCost,
    addOperationCost, updateOperationCost, deleteOperationCost,
    estimateToolpathCost, saveEstimate, deleteEstimate, updateSettings
  }
}
