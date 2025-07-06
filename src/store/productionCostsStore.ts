// src/store/productionCostsStore.ts
import { create } from "zustand";
import { ToolWearCost, MaterialCost, OperationCost, ProductionCostEstimate, CostSettings } from "@/src/types/costs";
import ProductionCostsAPI from "@/src/services/productionCostsService";
import { toast } from "react-hot-toast";

// Definisci lo stato dello store per i costi di produzione
interface ProductionCostsState {
  // Configurazioni di costo
  toolWearCosts: ToolWearCost[];
  materialCosts: MaterialCost[];
  operationCosts: OperationCost[];
  costEstimates: ProductionCostEstimate[];

  // Impostazioni generali
  settings: CostSettings;

  // Stato UI
  isLoading: boolean;
  activeEstimateId: string | null;
  error: string | null;

  // Azioni
  loadData: () => Promise<void>;

  // Gestione dei costi degli utensili
  addToolWearCost: (cost: Omit<ToolWearCost, "id" | "createdAt" | "updatedAt">) => Promise<string>;
  updateToolWearCost: (
    id: string,
    updates: Partial<Omit<ToolWearCost, "id" | "createdAt" | "updatedAt">>
  ) => Promise<boolean>;
  deleteToolWearCost: (id: string) => Promise<boolean>;
  getToolWearCostByToolId: (toolId: string) => Promise<ToolWearCost | null>;

  // Gestione dei costi dei materiali
  addMaterialCost: (cost: Omit<MaterialCost, "id" | "createdAt" | "updatedAt">) => Promise<string>;
  updateMaterialCost: (
    id: string,
    updates: Partial<Omit<MaterialCost, "id" | "createdAt" | "updatedAt">>
  ) => Promise<boolean>;
  deleteMaterialCost: (id: string) => Promise<boolean>;
  getMaterialCostByMaterialId: (materialId: string) => Promise<MaterialCost | null>;

  // Gestione dei costi delle operazioni
  addOperationCost: (cost: Omit<OperationCost, "id" | "createdAt" | "updatedAt">) => Promise<string>;
  updateOperationCost: (
    id: string,
    updates: Partial<Omit<OperationCost, "id" | "createdAt" | "updatedAt">>
  ) => Promise<boolean>;
  deleteOperationCost: (id: string) => Promise<boolean>;

  // Gestione delle stime dei costi
  estimateToolpathCost: (toolpathId: string, options?: any) => Promise<ProductionCostEstimate | null>;
  saveEstimate: (estimate: ProductionCostEstimate) => Promise<boolean>;
  deleteEstimate: (id: string) => Promise<boolean>;
  getEstimateByToolpathId: (toolpathId: string) => Promise<ProductionCostEstimate | null>;

  // Aggiornamento delle impostazioni
  updateSettings: (
    updates: Partial<Omit<CostSettings, "id" | "ownerId" | "organizationId" | "createdAt" | "updatedAt">>
  ) => Promise<boolean>;
}

// Valori iniziali
const defaultSettings: CostSettings = {
  id: "",
  defaultCurrencyCode: "EUR",
  defaultMachineHourlyRate: 50,
  defaultOperatorHourlyRate: 30,
  defaultSetupTime: 30, // minuti
  calculateAutomatically: true,
  additionalSettings: {},
  ownerId: "",
  organizationId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

// Creazione dello store Zustand
export const useProductionCostsStore = create<ProductionCostsState>((set, get) => ({
  // Stato iniziale
  toolWearCosts: [],
  materialCosts: [],
  operationCosts: [],
  costEstimates: [],
  settings: defaultSettings,
  isLoading: false,
  activeEstimateId: null,
  error: null,

  // Carica i dati dall'API
  loadData: async () => {
    set({ isLoading: true, error: null });

    try {
      // Carica tutte le configurazioni di costo dall'API
      const [toolWearCosts, materialCosts, operationCosts, costEstimates, settings] = await Promise.all([
        ProductionCostsAPI.ToolWearCost.getAll(),
        ProductionCostsAPI.MaterialCost.getAll(),
        ProductionCostsAPI.OperationCost.getAll(),
        ProductionCostsAPI.Estimate.getAll(),
        ProductionCostsAPI.Settings.getUserSettings().catch(() => defaultSettings)
      ]);

      // Aggiorna lo stato
      set({
        toolWearCosts,
        materialCosts,
        operationCosts,
        costEstimates,
        settings,
        isLoading: false
      });

      console.log("Dati caricati con successo");
    } catch (error: any) {
      console.error("Errore nel caricamento dei dati:", error);
      set({
        error: `Errore nel caricamento dei dati: ${error?.message || "Errore sconosciuto"}`,
        isLoading: false
      });
      toast.error("Errore nel caricamento dei dati di costo");
    }
  },

  //
  // GESTIONE DEI COSTI DEGLI UTENSILI
  //

  // Aggiungi un nuovo costo di usura utensile
  addToolWearCost: async cost => {
    try {
      set({ isLoading: true, error: null });
      const newCost = await ProductionCostsAPI.ToolWearCost.create(cost);

      set(state => ({
        toolWearCosts: [...state.toolWearCosts, newCost],
        isLoading: false
      }));

      toast.success("Costo utensile aggiunto con successo");
      return newCost.id;
    } catch (error: any) {
      set({
        error: `Errore nell'aggiunta del costo di usura: ${error?.message || "Errore sconosciuto"}`,
        isLoading: false
      });
      toast.error("Errore nell'aggiunta del costo utensile");
      return "";
    }
  },

  // Aggiorna un costo di usura utensile esistente
  updateToolWearCost: async (id, updates) => {
    try {
      set({ isLoading: true, error: null });
      const updatedCost = await ProductionCostsAPI.ToolWearCost.update(id, updates);

      set(state => ({
        toolWearCosts: state.toolWearCosts.map(cost => (cost.id === id ? updatedCost : cost)),
        isLoading: false
      }));

      toast.success("Costo utensile aggiornato con successo");
      return true;
    } catch (error: any) {
      set({
        error: `Errore nell'aggiornamento del costo di usura: ${error?.message || "Errore sconosciuto"}`,
        isLoading: false
      });
      toast.error("Errore nell'aggiornamento del costo utensile");
      return false;
    }
  },

  // Elimina un costo di usura utensile
  deleteToolWearCost: async id => {
    try {
      set({ isLoading: true, error: null });
      await ProductionCostsAPI.ToolWearCost.delete(id);

      set(state => ({
        toolWearCosts: state.toolWearCosts.filter(cost => cost.id !== id),
        isLoading: false
      }));

      toast.success("Costo utensile eliminato con successo");
      return true;
    } catch (error: any) {
      set({
        error: `Errore nell'eliminazione del costo di usura: ${error?.message || "Errore sconosciuto"}`,
        isLoading: false
      });
      toast.error("Errore nell'eliminazione del costo utensile");
      return false;
    }
  },

  // Ottieni il costo di usura per un utensile specifico
  getToolWearCostByToolId: async toolId => {
    try {
      const cost = await ProductionCostsAPI.ToolWearCost.getByToolId(toolId);
      return cost;
    } catch (error: any) {
      set({ error: `Errore nel recupero del costo di usura: ${error?.message || "Errore sconosciuto"}` });
      return null;
    }
  },

  //
  // GESTIONE DEI COSTI DEI MATERIALI
  //

  // Aggiungi un nuovo costo materiale
  addMaterialCost: async cost => {
    try {
      set({ isLoading: true, error: null });
      const newCost = await ProductionCostsAPI.MaterialCost.create(cost);

      set(state => ({
        materialCosts: [...state.materialCosts, newCost],
        isLoading: false
      }));

      toast.success("Costo materiale aggiunto con successo");
      return newCost.id;
    } catch (error: any) {
      set({
        error: `Errore nell'aggiunta del costo di materiale: ${error?.message || "Errore sconosciuto"}`,
        isLoading: false
      });
      toast.error("Errore nell'aggiunta del costo materiale");
      return "";
    }
  },

  // Aggiorna un costo materiale esistente
  updateMaterialCost: async (id, updates) => {
    try {
      set({ isLoading: true, error: null });
      const updatedCost = await ProductionCostsAPI.MaterialCost.update(id, updates);

      set(state => ({
        materialCosts: state.materialCosts.map(cost => (cost.id === id ? updatedCost : cost)),
        isLoading: false
      }));

      toast.success("Costo materiale aggiornato con successo");
      return true;
    } catch (error: any) {
      set({
        error: `Errore nell'aggiornamento del costo di materiale: ${error?.message || "Errore sconosciuto"}`,
        isLoading: false
      });
      toast.error("Errore nell'aggiornamento del costo materiale");
      return false;
    }
  },

  // Elimina un costo materiale
  deleteMaterialCost: async id => {
    try {
      set({ isLoading: true, error: null });
      await ProductionCostsAPI.MaterialCost.delete(id);

      set(state => ({
        materialCosts: state.materialCosts.filter(cost => cost.id !== id),
        isLoading: false
      }));

      toast.success("Costo materiale eliminato con successo");
      return true;
    } catch (error: any) {
      set({
        error: `Errore nell'eliminazione del costo di materiale: ${error?.message || "Errore sconosciuto"}`,
        isLoading: false
      });
      toast.error("Errore nell'eliminazione del costo materiale");
      return false;
    }
  },

  // Ottieni il costo per un materiale specifico
  getMaterialCostByMaterialId: async materialId => {
    try {
      const cost = await ProductionCostsAPI.MaterialCost.getByMaterialId(materialId);
      return cost;
    } catch (error: any) {
      set({ error: `Errore nel recupero del costo di materiale: ${error?.message || "Errore sconosciuto"}` });
      return null;
    }
  },

  //
  // GESTIONE DEI COSTI DELLE OPERAZIONI
  //

  // Aggiungi un nuovo costo operazione
  addOperationCost: async cost => {
    try {
      set({ isLoading: true, error: null });
      const newCost = await ProductionCostsAPI.OperationCost.create(cost);

      set(state => ({
        operationCosts: [...state.operationCosts, newCost],
        isLoading: false
      }));

      toast.success("Costo operazione aggiunto con successo");
      return newCost.id;
    } catch (error: any) {
      set({
        error: `Errore nell'aggiunta del costo di operazione: ${error?.message || "Errore sconosciuto"}`,
        isLoading: false
      });
      toast.error("Errore nell'aggiunta del costo operazione");
      return "";
    }
  },

  // Aggiorna un costo operazione esistente
  updateOperationCost: async (id, updates) => {
    try {
      set({ isLoading: true, error: null });
      const updatedCost = await ProductionCostsAPI.OperationCost.update(id, updates);

      set(state => ({
        operationCosts: state.operationCosts.map(cost => (cost.id === id ? updatedCost : cost)),
        isLoading: false
      }));

      toast.success("Costo operazione aggiornato con successo");
      return true;
    } catch (error: any) {
      set({
        error: `Errore nell'aggiornamento del costo di operazione: ${error?.message || "Errore sconosciuto"}`,
        isLoading: false
      });
      toast.error("Errore nell'aggiornamento del costo operazione");
      return false;
    }
  },

  // Elimina un costo operazione
  deleteOperationCost: async id => {
    try {
      set({ isLoading: true, error: null });
      await ProductionCostsAPI.OperationCost.delete(id);

      set(state => ({
        operationCosts: state.operationCosts.filter(cost => cost.id !== id),
        isLoading: false
      }));

      toast.success("Costo operazione eliminato con successo");
      return true;
    } catch (error: any) {
      set({
        error: `Errore nell'eliminazione del costo di operazione: ${error?.message || "Errore sconosciuto"}`,
        isLoading: false
      });
      toast.error("Errore nell'eliminazione del costo operazione");
      return false;
    }
  },

  //
  // GESTIONE DELLE STIME DEI COSTI
  //

  // Stima i costi per un toolpath
  estimateToolpathCost: async (toolpathId, options = {}) => {
    try {
      set({ isLoading: true, error: null });

      // L'API `calculate` dovrebbe restituire una struttura ProductionCostEstimate completa
      // (potenzialmente senza id, createdAt, updatedAt se è una nuova stima non ancora persistita)
      const estimateData = await ProductionCostsAPI.Estimate.calculate(toolpathId, options);

      set({ isLoading: false });
      return estimateData;
    } catch (error: any) {
      set({
        error: `Errore nel calcolo della stima dei costi: ${error?.message || "Errore sconosciuto"}`,
        isLoading: false
      });
      toast.error("Errore nel calcolo dei costi di produzione");
      return null;
    }
  },

  // Salva una stima dei costi (crea o aggiorna)
  saveEstimate: async (estimateToSave: ProductionCostEstimate) => {
    set({ isLoading: true, error: null });
    try {
      let savedEstimate: ProductionCostEstimate;

      // Verifica se la stima ha un ID e se esiste già nello store.
      // L'oggetto estimateToSave proviene da estimateToolpathCost,
      // che a sua volta chiama l'API /calculate.
      // Se /calculate restituisce un ID per una stima precedentemente calcolata e *forse* salvata,
      // dovremmo trattarlo come un aggiornamento.
      // Altrimenti, se non c'è ID, è una nuova stima.
      const existingEstimateInStore = get().costEstimates.find(e => e.id === estimateToSave.id);

      if (estimateToSave.id && existingEstimateInStore) {
        // Aggiorna una stima esistente
        const { id, createdAt, updatedAt, ownerId, organizationId, ...updateData } = estimateToSave;
        // L'API update si aspetta Partial<Omit<ProductionCostEstimate, 'id' | 'createdAt' | 'updatedAt'>>
        // ownerId e organizationId potrebbero non essere aggiornabili direttamente o gestiti diversamente.
        // Per ora, li escludiamo dall'updateData se l'API non li accetta o se sono immutabili post-creazione.
        // Tuttavia, la definizione del servizio per update accetta un Partial dell'Omit, quindi inviare i campi
        // come sono in estimateToSave (esclusi id, createdAt, updatedAt) dovrebbe essere corretto.
        // Se l'API di update ignora i campi non modificabili, va bene.
        // Se invece si aspetta solo i campi modificabili, updateData deve essere più specifico.
        // Assumiamo che l'API gestisca correttamente i campi inviati.
        savedEstimate = await ProductionCostsAPI.Estimate.update(estimateToSave.id, updateData);

        set(state => ({
          costEstimates: state.costEstimates.map(est => (est.id === savedEstimate.id ? savedEstimate : est)),
          isLoading: false
        }));
        toast.success("Stima dei costi aggiornata con successo");
      } else {
        // Crea una nuova stima
        // L'API create si aspetta Omit<ProductionCostEstimate, 'id' | 'createdAt' | 'updatedAt'>
        // Assicuriamoci che estimateToSave (senza id, createdAt, updatedAt) contenga tutti i campi necessari,
        // specialmente ownerId, come richiesto dal tipo ProductionCostEstimate.
        const { id, createdAt, updatedAt, ...createData } = estimateToSave;
        savedEstimate = await ProductionCostsAPI.Estimate.create(
          createData as Omit<ProductionCostEstimate, "id" | "createdAt" | "updatedAt">
        );

        set(state => ({
          costEstimates: [...state.costEstimates, savedEstimate],
          isLoading: false
        }));
        toast.success("Stima dei costi creata con successo");
      }

      set({ activeEstimateId: savedEstimate.id });
      return true;
    } catch (error: any) {
      console.error("Errore nel salvataggio della stima:", error);
      const errorMessage = error.response?.data?.error || error.message || "Errore sconosciuto";
      set({
        error: `Errore nel salvataggio della stima: ${errorMessage}`,
        isLoading: false
      });
      toast.error(`Errore nel salvataggio della stima: ${errorMessage}`);
      return false;
    }
  },

  // Elimina una stima dei costi
  deleteEstimate: async id => {
    try {
      // Set loading state before API call
      set({ isLoading: true, error: null });

      // Use a local variable to get current state to avoid potential issues with state closure
      const currentEstimates = get().costEstimates;

      // Check if the estimate exists before trying to delete
      const estimateExists = currentEstimates.some(est => est.id === id);
      if (!estimateExists) {
        console.error(`Estimate with id ${id} not found, skipping deletion`);
        set({ isLoading: false });
        return false;
      }

      // Call API to delete the estimate
      await ProductionCostsAPI.Estimate.delete(id);

      // Update the state by filtering out the deleted estimate
      set(state => ({
        costEstimates: state.costEstimates.filter(est => est.id !== id),
        isLoading: false,
        // Clear activeEstimateId if it was the deleted estimate
        activeEstimateId: state.activeEstimateId === id ? null : state.activeEstimateId
      }));

      toast.success("Stima eliminata con successo");
      return true;
    } catch (error: any) {
      console.error("Error deleting estimate:", error);

      // Set error state but don't call deleteEstimate again
      set({
        error: `Errore nell'eliminazione della stima: ${error?.message || "Errore sconosciuto"}`,
        isLoading: false
      });
      toast.error("Errore nell'eliminazione della stima");
      return false;
    }
  },

  // Ottieni la stima per un toolpath specifico
  getEstimateByToolpathId: async toolpathId => {
    try {
      const estimates = await ProductionCostsAPI.Estimate.getByToolpathId(toolpathId);

      // Ottieni la stima più recente
      if (estimates.length > 0) {
        const latestEstimate = estimates.sort(
          (a: ProductionCostEstimate, b: ProductionCostEstimate) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )[0];

        return latestEstimate;
      }

      return null;
    } catch (error: any) {
      set({ error: `Errore nel recupero della stima: ${error?.message || "Errore sconosciuto"}` });
      console.error("Errore nel recupero della stima:", error);
      return null;
    }
  },

  // Aggiorna le impostazioni
  updateSettings: async updates => {
    try {
      set({ isLoading: true, error: null });
      const updatedSettings = await ProductionCostsAPI.Settings.updateUserSettings(updates);

      set({
        settings: updatedSettings,
        isLoading: false
      });

      toast.success("Impostazioni aggiornate con successo");
      return true;
    } catch (error: any) {
      set({
        error: `Errore nell'aggiornamento delle impostazioni: ${error?.message || "Errore sconosciuto"}`,
        isLoading: false
      });
      toast.error("Errore nell'aggiornamento delle impostazioni");
      return false;
    }
  }
}));

// Inizializza lo store all'avvio dell'applicazione
if (typeof window !== "undefined") {
  useProductionCostsStore
    .getState()
    .loadData()
    .catch(error => {
      console.error("Errore nell'inizializzazione dello store dei costi:", error);
    });
}
